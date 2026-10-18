"""PhoWhisper fine-tune (thẩm định tầng 2) + DSP Laptop Mic Enhancer & Anti-Hallucination."""
import glob
import os
import threading
import zlib
from typing import Optional, Tuple

import numpy as np
import torch
from transformers import pipeline

from app.config import ASR_USE_FT, FT_ASR_DIR

ft_pipe = None
ft_lock = threading.Lock()

LOGPROB_FALLBACK: float = -0.10

_MAX_AUDIO_SEC: int = 30
_TOKENS_PER_SEC: int = 6
_TOKENS_BASE: int = 6


def _pick_ft_dir(root: str) -> Tuple[str, bool]:
    """Tìm thư mục model trong `root`."""
    def candidates(name: str):
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


def enhance_laptop_audio_array(audio: np.ndarray, sr: int = 16000) -> np.ndarray:
    """
    DSP Pipeline chuyên trị Mic Laptop (Acer Nitro / Realtek):
    1. High-Pass Filter (~100Hz): Khử tiếng ù quạt tản nhiệt để không làm mù VAD/ASR.
    2. Dynamic Range Compression (nén biên độ): Kéo các từ nói nhỏ phía sau chữ 'Alo' lên
       ngang bằng với chữ đầu tiên (chống lại hiện tượng sụt áp của AGC trình duyệt).
    3. Pre-emphasis (0.22): Làm rõ phụ âm đầu/cuối (c, t, đ, s).
    4. Silence Trimming: Cắt khoảng lặng thừa để Whisper không ảo giác.
    """
    if audio.size < 400:
        return audio.astype(np.float32)

    # 1. Cắt bỏ DC Offset & tiếng ù quạt tần số thấp (< 100Hz)
    win_hp = int(sr / 100)  # 160 mẫu tại 16kHz
    if len(audio) > win_hp * 2:
        low_rumble = np.convolve(audio, np.ones(win_hp, dtype=np.float32) / win_hp, mode="same")
        audio = audio - low_rumble

    # 2. Pre-emphasis nhẹ giúp phụ âm tiếng Việt sắc nét khi ngồi xa mic laptop
    emph = np.empty_like(audio)
    emph[0] = audio[0]
    emph[1:] = audio[1:] - 0.22 * audio[:-1]
    audio = emph

    # 3. Cắt khoảng lặng đầu/cuối + Frame-level AGC (cân bằng âm lượng giữa chữ 'Alo' to và câu nói nhỏ phía sau)
    frame_len = int(0.02 * sr)
    hop_len = int(0.01 * sr)
    if len(audio) > frame_len * 5:
        sq = audio ** 2
        window = np.ones(frame_len, dtype=np.float32) / frame_len
        rms_env = np.sqrt(np.convolve(sq, window, mode="valid")[::hop_len] + 1e-12)

        noise_floor = float(np.percentile(rms_env, 20))
        peak_rms = float(np.max(rms_env))
        thresh = max(noise_floor * 2.0, peak_rms * 0.05, 0.003)
        active_frames = np.where(rms_env > thresh)[0]

        if active_frames.size > 0:
            pad_samples = int(0.28 * sr)
            start_idx = max(0, int(active_frames[0] * hop_len) - pad_samples)
            end_idx = min(len(audio), int(active_frames[-1] * hop_len + frame_len) + pad_samples)
            if end_idx - start_idx >= int(0.35 * sr):
                audio = audio[start_idx:end_idx]

    # 4. Soft-Knee Dynamic Compression (Nâng các âm nhỏ lên mà không làm vỡ âm to)
    peak = float(np.max(np.abs(audio)))
    if peak > 1e-4:
        norm_audio = audio / peak
        # Hàm nén nhẹ tanh giúp những từ bị hụt hơi trên mic laptop nổi rõ lên
        compressed = np.tanh(norm_audio * 1.6) / np.tanh(1.6)
        audio = (compressed * 0.89).astype(np.float32)

    return audio.astype(np.float32)


def _load_audio_16k(path: str) -> np.ndarray:
    """Đọc wav -> mono float32 16kHz -> Chạy DSP Laptop Enhancer."""
    try:
        import soundfile as sf

        audio, sr = sf.read(path, dtype="float32", always_2d=False)
    except Exception:
        import torchaudio

        wav, sr = torchaudio.load(path)
        audio = wav.numpy()
        audio = audio.mean(axis=0) if audio.ndim > 1 else audio
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != 16000:
        import torchaudio.functional as AF

        audio = AF.resample(torch.from_numpy(audio), sr, 16000).numpy()

    audio = audio.astype(np.float32)[: 16000 * _MAX_AUDIO_SEC]
    return enhance_laptop_audio_array(audio, sr=16000)


def _compute_compression_ratio(text: str) -> float:
    if not text:
        return 0.0
    text_bytes = text.encode("utf-8")
    if not text_bytes:
        return 0.0
    return len(text_bytes) / max(len(zlib.compress(text_bytes)), 1)


def _compute_avg_logprob(model, sequences: torch.Tensor, scores: tuple) -> float:
    """Tính LogProb thật từ logits giải mã (không phụ thuộc flag output_scores bị cảnh báo)."""
    if not scores:
        return LOGPROB_FALLBACK
    try:
        trans = model.compute_transition_scores(sequences, scores, normalize_logits=True)
        vals = trans[0].float().cpu().numpy()
        vals = vals[np.isfinite(vals)]
        if vals.size > 0:
            return float(vals.mean())
    except Exception:
        pass

    try:
        num_gen = len(scores)
        gen_tokens = sequences[0, -num_gen:]
        token_logprobs = []
        for step_logits, tok_id in zip(scores, gen_tokens):
            log_probs = torch.log_softmax(step_logits[0].float(), dim=-1)
            lp = float(log_probs[int(tok_id.item())].item())
            if np.isfinite(lp):
                token_logprobs.append(lp)
        if token_logprobs:
            return float(np.mean(token_logprobs))
    except Exception as e:
        print(f"⚠️ [FT-ASR] Không tính được logprob thật ({e}) -> dùng fallback")

    return LOGPROB_FALLBACK


def run_ft(audio_path: str) -> str:
    """Bóc băng thuần bằng PhoWhisper fine-tune."""
    if ft_pipe is None:
        return ""
    try:
        audio = _load_audio_16k(audio_path)
        with ft_lock:
            res = ft_pipe(
                {"raw": audio, "sampling_rate": 16000},
                generate_kwargs={"language": "vi", "task": "transcribe", "do_sample": False},
            )
        return res.get("text", "").strip().lower()
    except Exception as e:
        print(f"⚠️ [FT-ASR] Lỗi nhận diện: {e}")
        return ""


def run_ft_with_confidence(
    audio_path: str,
    condition_on_previous_text: bool = False,
    no_speech_threshold: float = 0.6,
    compression_ratio_threshold: float = 2.4,
    logprob_threshold: float = -1.0,
) -> Tuple[str, float]:
    """Chạy PhoWhisper trên audio đã qua DSP Laptop Enhancer & trả về (text, avg_logprob)."""
    if ft_pipe is None:
        return "", -999.0

    try:
        model = ft_pipe.model
        audio = _load_audio_16k(audio_path)
        if audio.size < 1600:
            return "", -999.0

        active_sec = len(audio) / 16000.0
        feats = ft_pipe.feature_extractor(
            audio, sampling_rate=16000, return_tensors="pt"
        ).input_features.to(model.device, dtype=model.dtype)

        max_new = min(128, max(8, int(active_sec * _TOKENS_PER_SEC) + _TOKENS_BASE))

        with ft_lock, torch.inference_mode():
            out = model.generate(
                feats,
                language="vi",
                task="transcribe",
                do_sample=False,
                num_beams=1,
                max_new_tokens=max_new,
                return_dict_in_generate=True,
                output_scores=True,
            )

        text = ft_pipe.tokenizer.batch_decode(
            out.sequences, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )[0].strip().lower()
        scores = getattr(out, "scores", ()) or ()

        avg_logprob = _compute_avg_logprob(model, out.sequences, scores)
        comp_ratio = _compute_compression_ratio(text)

        if comp_ratio > compression_ratio_threshold:
            print(f"🛑 [FT Anti-Hallucination: CompressionRatio] ratio={comp_ratio:.2f} -> Bỏ '{text}'")
            return "", -999.0

        return text, avg_logprob

    except Exception as e:
        print(f"⚠️ [FT-ASR] Lỗi nhận diện logprob: {e}")
        return run_ft(audio_path), LOGPROB_FALLBACK