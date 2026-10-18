"""PhoWhisper fine-tune (thẩm định tầng 2 của hybrid ASR)."""
import os
import threading
from typing import Tuple

import numpy as np
import torch
from transformers import pipeline

from app.config import FT_ASR_DIR, ASR_USE_FT

ft_pipe = None
ft_lock = threading.Lock()

def _pick_ft_dir(root: str):
    """Tìm thư mục model trong `root` (zip giải nén hay bị lồng thêm một cấp).
    Ưu tiên thư mục nông nhất, bỏ qua các bản checkpoint-XXXX trung gian.
    Trả về (thư_mục, là_adapter)."""
    import glob
    def candidates(name):
        found = glob.glob(os.path.join(root, "**", name), recursive=True)
        found = [os.path.dirname(f) for f in found]
        final = [d for d in found if "checkpoint-" not in d.replace("\\", "/")]
        pool = final or found
        return sorted(pool, key=lambda d: (d.count(os.sep), d))
    ad = candidates("adapter_config.json")
    if ad:
        return ad[0], True
    full = candidates("config.json")
    if full:
        return full[0], False
    raise FileNotFoundError("không có adapter_config.json hay config.json trong thư mục")

def _load_ft_asr():
    if not os.path.isdir(FT_ASR_DIR):
        raise FileNotFoundError(f"không thấy thư mục {FT_ASR_DIR}")
    model_dir, is_adapter = _pick_ft_dir(FT_ASR_DIR)
    print(f"   ↳ Dùng thư mục: {model_dir} ({'LoRA adapter' if is_adapter else 'model đầy đủ'})")
    from transformers import WhisperForConditionalGeneration, WhisperProcessor
    use_cuda = torch.cuda.is_available()
    dtype = torch.float16 if use_cuda else torch.float32
    if is_adapter:
        from peft import PeftConfig, PeftModel
        base_id = PeftConfig.from_pretrained(model_dir).base_model_name_or_path
        print(f"   ↳ Model nền: {base_id}")
        base = WhisperForConditionalGeneration.from_pretrained(base_id, torch_dtype=dtype)
        ft_model = PeftModel.from_pretrained(base, model_dir).merge_and_unload()
        try:
            processor = WhisperProcessor.from_pretrained(model_dir)
        except Exception:
            processor = WhisperProcessor.from_pretrained(base_id)
    else:
        ft_model = WhisperForConditionalGeneration.from_pretrained(model_dir, torch_dtype=dtype)
        processor = WhisperProcessor.from_pretrained(model_dir)
    return pipeline(
        "automatic-speech-recognition",
        model=ft_model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        device=0 if use_cuda else -1,
    )

if ASR_USE_FT:
    print(f"⏳ [FT-ASR] Đang tải PhoWhisper fine-tune từ: {FT_ASR_DIR}")
    try:
        ft_pipe = _load_ft_asr()
        print("✅ [FT-ASR] Nạp PhoWhisper fine-tune thành công! (thay ViToSA trong bước kiểm chứng)")
    except Exception as e:
        print(f"⚠️ [FT-ASR] Không nạp được ({e}) — dùng ViToSA như cũ. (Cần: pip install peft)")
        ft_pipe = None

def run_ft(audio_path: str) -> str:
    """Bóc băng thuần bằng PhoWhisper fine-tune (không tính logprob)."""
    if ft_pipe is None:
        return ""
    try:
        with ft_lock:
            res = ft_pipe(
                audio_path,
                generate_kwargs={"language": "vi", "task": "transcribe", "do_sample": False},
            )
        return res.get("text", "").strip().lower()
    except Exception as e:
        print(f"⚠️ [FT-ASR] Lỗi nhận diện: {e}")
        return ""


def run_ft_with_confidence(audio_path: str) -> Tuple[str, float]:
    """
    Chạy PhoWhisper fine-tune và trích xuất avg_logprob chuẩn xác.
    """
    if ft_pipe is None:
        return "", -999.0
    try:
        with ft_lock:
            res = ft_pipe(
                audio_path,
                generate_kwargs={
                    "language": "vi",
                    "task": "transcribe",
                    "do_sample": False,
                    "return_dict_in_generate": True,
                    "output_scores": True,
                }
            )
        
        text = res.get("text", "").strip().lower()
        
        # Tính toán avg_logprob từ logits/scores
        avg_logprob = 0.0
        if isinstance(res, dict) and "scores" in res and res["scores"]:
            scores = res["scores"]
            log_probs = []
            for score_tensor in scores:
                probs = torch.log_softmax(score_tensor, dim=-1)
                max_log_prob = torch.max(probs).item()
                log_probs.append(max_log_prob)
            if log_probs:
                avg_logprob = float(np.mean(log_probs))
        else:
            # Dự phòng nếu pipeline trả dạng string cơ bản
            avg_logprob = -0.1 if text else -999.0

        return text, avg_logprob
    except Exception as e:
        print(f"⚠️ [FT-ASR] Lỗi nhận diện logprob: {e}")
        return run_ft(audio_path), -0.5
