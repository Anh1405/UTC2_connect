from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
import uvicorn
import warnings
import os
import uuid
import time
import zlib
import threading
import json
import shutil
import re
import unicodedata
import difflib
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from pydub import AudioSegment, effects
from pydub.silence import detect_nonsilent
import requests
from df.enhance import enhance, init_df, load_audio, save_audio
import soundfile as sf
import sherpa_onnx
import numpy as np
import queue
import asyncio
from concurrent.futures import ThreadPoolExecutor

warnings.filterwarnings("ignore")
SAVE_DEBUG_AUDIO = True

# ==============================================================================
# BƯỚC 1.1: KHỞI TẠO EXECUTOR TOÀN CỤC (Thay thế asr_lock)
# ==============================================================================
# Giới hạn 2 worker xử lý đồng thời để tránh tràn VRAM/RAM trên RTX 3060 6GB
asr_executor = ThreadPoolExecutor(max_workers=2)

# ==============================================================================
# 1. CẤU HÌNH HỆ THỐNG & ĐƯỜNG DẪN
# ==============================================================================
MODEL_CHECKPOINT_PATH = os.environ.get("MODEL_CHECKPOINT_PATH", "toxic_model_v6.pth")
TOXIC_THRESHOLD = float(os.environ.get("TOXIC_THRESHOLD", "0.42"))
API_VERSION = "2.4.0"

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# PhoWhisper bạn tự fine-tune: giải nén zip vào  <thư mục chứa api.py>/models/phowhisper-toxic
# (hỗ trợ adapter LoRA có adapter_config.json, hoặc model đã merge có config.json)
FT_ASR_DIR = os.environ.get("FT_ASR_DIR", os.path.join(_BASE_DIR, "models", "phowhisper-toxic"))
ASR_USE_FT = os.environ.get("ASR_USE_FT", "1") == "1"
# 1 = tin model fine-tune khi nó ra từ tục dù Gipformer không đồng ý (cần audio đủ lớn, không quá ngắn)
FT_TRUST = os.environ.get("FT_TRUST", "1") == "1"

ASR_USE_HOTWORDS = os.environ.get("ASR_USE_HOTWORDS", "1") == "1"
ASR_HOTWORDS_FILE = os.environ.get("ASR_HOTWORDS_FILE", "./hotwords.txt")
ASR_HOTWORDS_SCORE = float(os.environ.get("ASR_HOTWORDS_SCORE", "1.5"))

ASR_USE_VAD = os.environ.get("ASR_USE_VAD", "1") == "1"
VAD_THRESHOLD = float(os.environ.get("VAD_THRESHOLD", "0.5"))
ASR_MIN_SPEECH_SEC = float(os.environ.get("ASR_MIN_SPEECH_SEC", "0.30"))
VITOSA_MIN_AGREEMENT = float(os.environ.get("VITOSA_MIN_AGREEMENT", "0.5"))
SOUNDS_LIKE_TOXIC_THRESHOLD = float(os.environ.get("SOUNDS_LIKE_TOXIC_THRESHOLD", "0.75"))

ASR_MODEL_DIR = os.environ.get("ASR_MODEL_DIR", "./models/gipformer1.5-68M-rnnt")
_LEGACY_ASR_DIR = "./models/sherpa-onnx-zipformer-vi-30M-int8-2026-02-09"
if not os.path.isdir(ASR_MODEL_DIR) and os.path.isdir(_LEGACY_ASR_DIR):
    print(f"⚠️ [ASR] Không thấy {ASR_MODEL_DIR} — dùng tạm ZipFormer-30M cũ.")
    ASR_MODEL_DIR = _LEGACY_ASR_DIR

ASR_PRECISION = os.environ.get("ASR_PRECISION", "int8")
ASR_DECODING = os.environ.get("ASR_DECODING", "modified_beam_search")
ASR_USE_VITOSA2 = os.environ.get("ASR_USE_VITOSA2", "1") == "1"
ASR_PROMPT = os.environ.get("ASR_PROMPT", "")
ASR_RETURN_TIMESTAMPS = os.environ.get("ASR_RETURN_TIMESTAMPS", "0") == "1"
ASR_NUM_BEAMS = int(os.environ.get("ASR_NUM_BEAMS", "3"))
ASR_MAX_SEGMENTS = int(os.environ.get("ASR_MAX_SEGMENTS", "4"))
ASR_SEGMENT_MERGE_GAP_MS = int(os.environ.get("ASR_SEGMENT_MERGE_GAP_MS", "600"))

YOUTUBE_HALLUCINATIONS = [
    "hẹn gặp lại", "cảm ơn các bạn", "video này", "đăng ký kênh", "subscribe",
    "subtitles by", "ghiền mì gõ", "bỏ lỡ những video", "video hấp dẫn",
    "đôi chú tuổi", "không kém trẻ tuổi", "đàn ông có thể nhận ra", "đoạn trích đoạn trí",
    "đùa đẹp đẹp xưa", "có thể nhận ra điều này", "những bức ảnh",
    "hội thân mật", "kiến thức từng từ", "được nói", "bệnh viện đa khoa",
    "đà nẵng", "đoạn trích truyện ngắn", "nội dung thường thiếu hụt",
    "hội thoại", "thi quyết định", "chia sẻ trên mạng xã hội",
    "những người phụ nữ bị thương", "đưa đi bệnh viện",
    "nóu thì cháu", "nặn bon chê", "triển khai tài chính", "có từ tục", "cò cốp đặc"
]
EVIDENCE_CLIP_PADDING_MS = 1500
EVIDENCE_RETENTION_DAYS = 30

TEMP_AUDIO_DIR = "temp_audio"
EVIDENCE_DIR = "evidence_clips"
REPORTS_DIR = "call_reports"

MAX_TEXT_LENGTH = int(os.environ.get("MAX_TEXT_LENGTH", "2000"))
MAX_AUDIO_FILE_MB = int(os.environ.get("MAX_AUDIO_FILE_MB", "50"))
MIN_SPEECH_DBFS = float(os.environ.get("MIN_SPEECH_DBFS", "-52"))
API_KEY = os.environ.get("MODERATION_API_KEY")

SAFE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-\.]+$")
COLAB_LLM_URL = os.environ.get("COLAB_LLM_URL", "https://easeful-traps-plural.ngrok-free.dev/check-sarcasm")

for directory in [TEMP_AUDIO_DIR, EVIDENCE_DIR, REPORTS_DIR]:
    os.makedirs(directory, exist_ok=True)

def sanitize_id(raw_id: str, fallback_prefix: str = "id") -> str:
    """Chặn path traversal: chỉ giữ lại ký tự an toàn."""
    if raw_id and SAFE_ID_PATTERN.match(raw_id) and ".." not in raw_id:
        return raw_id
    return f"{fallback_prefix}_{uuid.uuid4().hex[:8]}"

# ==============================================================================
# 2. KHỞI TẠO MÔ HÌNH PHOBERT (KIỂM DUYỆT VĂN BẢN VÒNG NGOÀI)
# ==============================================================================
print("⏳ [PhoBERT] Đang tải bộ từ điển...")
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

print("⏳ [PhoBERT] Khởi tạo mô hình phân loại...")
model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

if MODEL_CHECKPOINT_PATH and os.path.exists(MODEL_CHECKPOINT_PATH):
    try:
        print(f"📦 [PhoBERT] Đang nạp checkpoint từ: {MODEL_CHECKPOINT_PATH}")
        checkpoint = torch.load(MODEL_CHECKPOINT_PATH, map_location="cpu")
        
        if isinstance(checkpoint, dict):
            if "state_dict" in checkpoint and isinstance(checkpoint["state_dict"], dict):
                checkpoint = checkpoint["state_dict"]
            elif "model_state_dict" in checkpoint and isinstance(checkpoint["model_state_dict"], dict):
                checkpoint = checkpoint["model_state_dict"]
                
        cleaned_state_dict = {}
        for key, value in checkpoint.items():
            new_key = key[7:] if key.startswith("module.") else key
            cleaned_state_dict[new_key] = value
            
        model.load_state_dict(cleaned_state_dict, strict=False)
        print("✅ [PhoBERT] Nạp checkpoint thành công!")
    except Exception as e:
        print(f"⚠️ [PhoBERT] Lỗi nạp checkpoint: {e} — Sử dụng weights gốc.")
else:
    print(f"⚠️ [PhoBERT] Không tìm thấy checkpoint tại {MODEL_CHECKPOINT_PATH}.")

model.to(device)
model.eval()

print("⏳ [DeepFilter] Đang tải mô hình khử tạp âm & cô lập giọng nói...")
try:
    df_model, df_state, _ = init_df()
    print("✅ [DeepFilter] Nạp mô hình khử nhiễu thành công!")
except Exception as e:
    print(f"⚠️ [DeepFilter] Lỗi khởi tạo: {e}")
    df_model, df_state = None, None

# ==============================================================================
# 2b. KHỞI TẠO PHOWHISPER (ViToSA fine-tuned)
# ==============================================================================
vitosa2_model = None
vitosa2_processor = None
vitosa2_device = None
phowhisper_pipe = None

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

def run_phowhisper(audio_path: str) -> str:
    """Bóc băng bằng ViToSA-PhoWhisper (chỉ dùng khi nghi ngờ)."""
    if phowhisper_pipe is None:
        return ""
    try:
        res = phowhisper_pipe(
            audio_path,
            generate_kwargs={
                "language": "vi",
                "task": "transcribe",
                "temperature": 0.0,
                "do_sample": False,
            }
        )
        return res.get("text", "").strip().lower()
    except Exception as e:
        print(f"⚠️ [PhoWhisper] Lỗi nhận diện: {e}")
        return ""
def has_intellect_mockery(text: str) -> bool:
    """Phát hiện mỉa mai trí tuệ (não / đầu óc). Cứng hơn để giảm giải oan sai."""
    lowered = text.lower()
    # não + đại từ / sở hữu
    if re.search(r"\bnão\s*(m|mày|m4y|may|bạn|cậu|anh|chị|ông|bà|của\s*mày|của\s*bạn)\b", lowered):
        return True
    # "không có não", "thiếu não", "mất não", "hết não"...
    if re.search(r"\b(không\s*có|chẳng\s*có|hết|mất|thiếu|không\s*còn)\s*(não|đầu\s*óc|bộ\s*não)\b", lowered):
        return True
    # quên / để quên não
    if re.search(r"\b(quên|để|bỏ|thất lạc|đánh mất)\s*(mang|đem|lấy|theo)?\s*(não|đầu óc|bộ não)\b", lowered):
        return True
    # não + ngữ điệu hỏi/mỉa (à, hả, nhỉ...)
    if re.search(r"\bnão\b.{0,40}\b(à|hả|á|ạ|nhỉ|đấy|đó|hả\?|à\?)\b", lowered):
        return True
    # não đâu / não để đâu / não ở nhà...
    if re.search(r"\bnão\s*(đâu|để đâu|ở đâu|mang theo|đem theo|để nhà|ở nhà|mang đi|đem đi)\b", lowered):
        return True
    # "cậu/mày ... não" dạng đảo
    if re.search(r"\b(mày|cậu|bạn|anh|chị)\b.{0,25}\b(không\s*có\s*não|thiếu\s*não|hết\s*não|mất\s*não)\b", lowered):
        return True
    return False
def run_vitosa(audio_path: str) -> Tuple[str, bool, List[str]]:
    """Trả về (transcript, model_có_gắn_nhãn_toxic, danh_sách_từ_toxic).
    Ưu tiên PhoWhisper fine-tune của bạn; sau đó ViToSA 2.0; cuối cùng ViToSA v1."""
    if ft_pipe is not None:
        return run_ft(audio_path), False, []
    if vitosa2_model is not None:
        try:
            words = _vitosa2_labels(audio_path, vitosa2_model, vitosa2_processor, vitosa2_device)
            kept = [(w.strip(), int(l)) for w, l in words if w and "<|" not in w]
            text = " ".join(w for w, _ in kept).strip().lower()
            toxic_words = [w.lower() for w, l in kept if l == 1]
            return text, bool(toxic_words), toxic_words
        except Exception as e:
            print(f"⚠️ [ViToSA-2] Lỗi nhận diện: {e}")
            return "", False, []
    return run_phowhisper(audio_path), False, []

# ==============================================================================
# 3. KHỞI TẠO ZIPFORMER (ASR chính)
# ==============================================================================
print(f"⏳ [ASR] Đang tải ASR chính từ: {ASR_MODEL_DIR} ({ASR_PRECISION}, {ASR_DECODING})")

def _find_onnx(prefix: str) -> str:
    import glob
    int8 = sorted(glob.glob(f"{ASR_MODEL_DIR}/{prefix}*.int8.onnx"))
    fp32 = [f for f in sorted(glob.glob(f"{ASR_MODEL_DIR}/{prefix}*.onnx")) if ".int8." not in f]
    order = (int8 + fp32) if ASR_PRECISION == "int8" else (fp32 + int8)
    if not order:
        raise FileNotFoundError(f"Không thấy {prefix}*.onnx trong {ASR_MODEL_DIR}")
    return order[0]

def _build_zipformer(use_hotwords: bool):
    kwargs = dict(
        encoder=_find_onnx("encoder"),
        decoder=_find_onnx("decoder"),
        joiner=_find_onnx("joiner"),
        tokens=f"{ASR_MODEL_DIR}/tokens.txt",
        num_threads=4,
        sample_rate=16000,
        feature_dim=80,
        provider="cpu",
    )
    if not use_hotwords:
        return sherpa_onnx.OfflineRecognizer.from_transducer(decoding_method=ASR_DECODING, **kwargs)

    kwargs.update(
        decoding_method="modified_beam_search",
        max_active_paths=8,
        hotwords_file=ASR_HOTWORDS_FILE,
        hotwords_score=ASR_HOTWORDS_SCORE,
    )
    try:
        with open(f"{ASR_MODEL_DIR}/tokens.txt", encoding="utf-8") as f:
            is_bpe = any(line.startswith("▁") for line in f)
    except Exception:
        is_bpe = False
    bpe_model = f"{ASR_MODEL_DIR}/bpe.model"
    if is_bpe and os.path.exists(bpe_model):
        kwargs.update(modeling_unit="bpe", bpe_vocab=bpe_model)
    return sherpa_onnx.OfflineRecognizer.from_transducer(**kwargs)

asr_recognizer = None
try:
    if ASR_USE_HOTWORDS and os.path.exists(ASR_HOTWORDS_FILE):
        try:
            asr_recognizer = _build_zipformer(True)
            print(f"✅ [ASR] {os.path.basename(ASR_MODEL_DIR)} + hotwords ({ASR_HOTWORDS_FILE}, score={ASR_HOTWORDS_SCORE})")
        except Exception as e:
            print(f"⚠️ [ASR] Hotwords lỗi ({e}) — quay về greedy_search.")
            asr_recognizer = _build_zipformer(False)
            print(f"✅ [ASR] Tải {os.path.basename(ASR_MODEL_DIR)} (không hotword) thành công!")
    else:
        asr_recognizer = _build_zipformer(False)
        print(f"✅ [ASR] Tải {os.path.basename(ASR_MODEL_DIR)} thành công!")
except Exception as e:
    print(f"❌ [ASR] Lỗi khởi tạo ZipFormer: {e}")
    asr_recognizer = None

def run_zipformer(wav_path: str) -> str:
    """Nhận diện chính bằng ZipFormer."""
    if asr_recognizer is None:
        return ""
    try:
        samples, sample_rate = sf.read(wav_path, dtype="float32")
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        stream = asr_recognizer.create_stream()
        stream.accept_waveform(sample_rate, samples)
        asr_recognizer.decode_stream(stream)
        return stream.result.text.strip().lower()
    except Exception as e:
        print(f"⚠️ [ZipFormer] Lỗi: {e}")
        return ""

# ==============================================================================
# 3a. VAD (Silero)
# ==============================================================================
vad_model = None
vad_lock = threading.Lock()
if ASR_USE_VAD:
    try:
        from silero_vad import load_silero_vad, get_speech_timestamps
        vad_model = load_silero_vad()
        print("✅ [VAD] Silero VAD sẵn sàng.")
    except Exception as e:
        print(f"⚠️ [VAD] Không nạp được silero-vad ({e}).")
        vad_model = None

def extract_speech(audio: AudioSegment) -> Tuple[AudioSegment, Optional[float]]:
    if vad_model is None:
        return audio, None
    try:
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
        with vad_lock:
            stamps = get_speech_timestamps(
                torch.from_numpy(samples), vad_model,
                sampling_rate=16000,
                threshold=VAD_THRESHOLD,
                min_speech_duration_ms=120,
                min_silence_duration_ms=250,
                speech_pad_ms=200,
            )
        if not stamps:
            return audio[0:0], 0.0
        out = audio[0:0]
        gap = AudioSegment.silent(duration=150, frame_rate=16000)
        total_ms = 0
        for st in stamps:
            start_ms, end_ms = int(st["start"] / 16), int(st["end"] / 16)
            seg = audio[start_ms:end_ms]
            total_ms += len(seg)
            out = out.append(seg, crossfade=0).append(gap, crossfade=0)
        return out, total_ms / 1000.0
    except Exception as e:
        print(f"⚠️ [VAD] Lỗi: {e} — bỏ qua VAD cho chunk này.")
        return audio, None

# ==============================================================================
# 3b. HÀM HỖ TRỢ + HYBRID LOGIC
# ==============================================================================
report_lock = threading.Lock()

# ==============================================================================
# BƯỚC 1.3: DẸP BỎ "BĂNG KEO TEXT"
# Vô hiệu hóa/Comment bỏ các từ điển map âm Regex để đánh giá thực chất ASR
# ==============================================================================
# WHISPER_SWEAR_PHRASES = {}
# SUSPICIOUS_HOMOPHONES = set()

EXPLICIT_SWEAR_WORDS = {
    "lồn", "cặc", "địt", "đụ", "đéo", "vãi lồn",
    "con cặc", "địt mẹ", "đụ má", "cục cức", "cục cứt"
}
TOXIC_TARGETS = ["con cặc", "địt mẹ", "đụ má"]

def _skeleton(s: str) -> str:
    return remove_accents(s.lower()).replace(" ", "")

def sounds_like_toxic(text: str, thresh: Optional[float] = None) -> bool:
    if not text:
        return False
    if len(text.split()) > 2:
        return False
    thresh = SOUNDS_LIKE_TOXIC_THRESHOLD if thresh is None else thresh
    sk = _skeleton(text)
    if not sk:
        return False
    return any(
        abs(len(sk) - len(_skeleton(t))) <= 2
        and difflib.SequenceMatcher(None, sk, _skeleton(t)).ratio() >= thresh
        for t in TOXIC_TARGETS
    )

def is_suspicious(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower().strip()

    # Chỉ kiểm tra từ thô tục trực tiếp (đã vô hiệu hóa map đồng âm regex)
    for w in EXPLICIT_SWEAR_WORDS:
        if w in lowered:
            return True

    return False

def fix_whisper_swears(text: str) -> str:
    # BƯỚC 1.3: Đã vô hiệu hóa Regex sửa lỗi từ.
    # Trả về nguyên văn bản nhận diện để theo dõi độ chính xác gốc của mô hình ASR.
    return text

_REPEAT_PATTERN = re.compile(r"(\b\w+(?:\s+\w+){0,11}?)(?:\s+\1\b){2,}", re.IGNORECASE)

def collapse_repetitions(text: str) -> str:
    if not text:
        return text
    prev = None
    while prev != text:
        prev = text
        text = _REPEAT_PATTERN.sub(r"\1", text)
    return re.sub(r"\s+", " ", text).strip()

def is_degenerate_transcript(text: str, audio_sec: float) -> bool:
    if not text:
        return False
    raw = text.encode("utf-8")
    compression_ratio = len(raw) / max(1, len(zlib.compress(raw)))
    too_many_words = len(text.split()) > max(15, audio_sec * 8)
    return (len(raw) > 60 and compression_ratio > 2.4) or too_many_words

def is_likely_toxic_hallucination(text: str, audio_duration: float, peak_dbfs: float) -> bool:
    if not text:
        return False
    t = text.lower().strip().rstrip(".")
    SHORT_TOXIC = {
        "à lồn", "a lồn", "vãi lồn", "vailon", "đánh lộn", "đánh luôn",
        "con cặc", "địt mẹ", "đụ má", "lồn", "cặc", "đéo", "đụ"
    }
    words = t.split()
    if len(words) <= 2 and t in SHORT_TOXIC:
        if audio_duration < 4.5 or peak_dbfs < -12:
            return True
    return False

def asr_agreement(a: str, b: str) -> float:
    sa, sb = _skeleton(a or ""), _skeleton(b or "")
    if not sa or not sb:
        return 0.0
    return difflib.SequenceMatcher(None, sa, sb).ratio()

def run_hybrid_asr(wav_path: str, audio_duration: float, peak_dbfs: float,
                   speech_sec: Optional[float] = None) -> str:
    """
    Hybrid ASR Full-Guardrails + Short-Circuiting:
    - Vẫn giữ Fast-Path để trả kết quả ngay < 100ms cho câu sạch.
    - Giữ trọn vẹn tất cả logic đối soát, đồng thuận (agreement) và chốt chặn ảo giác từ bản gốc.
    - Thêm bộ lọc Log-Probability để loại bỏ triệt để ảo giác do nhiễu.
    """
    # ==========================================
    # 1. FAST PATH: ZipFormer (CPU)
    # ==========================================
    t0 = time.time()
    zip_text = run_zipformer(wav_path)
    zip_raw = (zip_text or "").strip().lower()
    
    if zip_raw in {"<", ">", ".", ",", "", " "}:
        zip_raw = ""

    zip_clean = collapse_repetitions(zip_raw)
    print(f"⏱️ [ZipFormer] {time.time()-t0:.2f}s | Raw: '{zip_clean}'")

    # Báo hiệu nghi vấn từ ZipFormer
    words = zip_clean.split()
    zip_is_toxic = is_suspicious(zip_clean) or any(w in zip_clean for w in EXPLICIT_SWEAR_WORDS)
    zip_near_toxic = (not zip_is_toxic) and sounds_like_toxic(zip_clean)

    CLEAN_WORDS = {
        "không", "chào", "alo", "ừ", "ủa", "ơ", "à", "anh", "em",
        "xin chào", "anh ơi", "cảm ơn", "vâng", "dạ",
        "đây", "ok", "đúng", "này", "vậy", "rồi", "ừm", "dạ vâng", "phải alo"
    }
    zip_looks_clean = (zip_clean in CLEAN_WORDS) and not zip_near_toxic

    # ==========================================
    # 2. SHORT-CIRCUIT: Cắt tầng sớm nếu chắc chắn an toàn
    # ==========================================
    # Nếu ZipFormer ra từ sạch rõ ràng và KHÔNG dính nghi vấn toxic -> Trả về ngay
    need_verify = (zip_is_toxic or zip_near_toxic or (not zip_clean) or (1 <= len(words) <= 3 and not zip_looks_clean))
    
    if not need_verify:
        print(f"🚀 [Short-Circuit] ZipFormer sạch & rõ ràng -> Trả về ngay: '{zip_clean}'")
        return zip_clean

    # ==========================================
    # 3. SLOW PATH: PhoWhisper Thẩm định (GPU)
    # ==========================================
    t1 = time.time()
    vi_clean, vi_avg_logprob = run_ft_with_confidence(wav_path)
    vi_clean = collapse_repetitions(vi_clean)
    print(f"⏱️ [PhoWhisper] {time.time()-t1:.2f}s | Raw: '{vi_clean}' | LogProb: {vi_avg_logprob:.2f}")

    vi_is_toxic = is_suspicious(vi_clean) or any(w in vi_clean for w in EXPLICIT_SWEAR_WORDS)

    # ==========================================
    # 4. FULL GUARDRAILS (Giữ nguyên toàn bộ logic cũ)
    # ==========================================
    
    # 🛑 GUARD 0: Lọc bằng Log-Probability (Mới bổ sung)
    LOGPROB_THRESHOLD = -0.85
    if vi_is_toxic and vi_avg_logprob < LOGPROB_THRESHOLD:
        print(f"🛑 [Block LogProb] PhoWhisper toxic nhưng log_prob quá thấp ({vi_avg_logprob:.2f} < {LOGPROB_THRESHOLD}) -> Bỏ PhoWhisper: '{zip_clean}'")
        return zip_clean

    # 🛑 GUARD 1: Tín hiệu âm thanh quá yếu
    audio_weak = peak_dbfs < -28 or audio_duration < 1.5
    if vi_is_toxic and audio_weak and not zip_is_toxic:
        print(f"⚠️ [Hybrid] Bỏ ViToSA/PhoWhisper toxic (audio yếu): '{vi_clean}'")
        return zip_clean

    # 🛑 GUARD 2: ZipFormer ra từ sạch rõ ràng mà PhoWhisper ra toxic / chênh lệch số từ lớn
    zip_word_count = len(words)
    vi_word_count = len(vi_clean.split())

    if zip_looks_clean and vi_is_toxic:
        if vi_word_count >= 2 or audio_duration < 2.0 or abs(zip_word_count - vi_word_count) >= 2:
            print(f"🛑 [Block Ảo Giác] ZipFormer ra từ sạch '{zip_clean}', PhoWhisper ảo giác thành '{vi_clean}' -> Giữ ZipFormer!")
            return zip_clean

    # 🛑 GUARD 3: PhoWhisper đứng MỘT MÌNH ra từ tục trên audio ngắn/yếu
    if vi_is_toxic and not zip_is_toxic and not zip_near_toxic:
        if (vi_word_count <= 3 and audio_duration < 2.0) or (speech_sec is not None and speech_sec < 0.55):
            print(f"🛑 [Block] Chặn PhoWhisper ảo giác từ ngắn/yếu: '{vi_clean}' (Audio: {audio_duration:.1f}s, speech={speech_sec})")
            return zip_clean

    # 🛑 GUARD 4: Tin PhoWhisper Fine-tune khi audio đủ rõ
    if (FT_TRUST and ft_pipe is not None and vi_is_toxic and not zip_is_toxic and not audio_weak
            and not zip_looks_clean and (speech_sec is None or speech_sec >= 0.55)):
        print(f"🔄 [Hybrid] Tin PhoWhisper fine-tune: '{vi_clean}' (ZipFormer: '{zip_clean}')")
        return vi_clean

    # 🛑 GUARD 5: Near-miss hoặc cả 2 cùng toxic
    if vi_is_toxic and zip_near_toxic and not audio_weak:
        print(f"🔄 [Hybrid] ZipFormer near-miss '{zip_clean}' + PhoWhisper toxic -> Chọn PhoWhisper: '{vi_clean}'")
        return vi_clean

    if vi_is_toxic and zip_is_toxic:
        print(f"🔄 [Hybrid] Cả 2 cùng toxic -> Chọn PhoWhisper: '{vi_clean}'")
        return vi_clean

    # 🛑 GUARD 6: Kiểm tra tỷ lệ đồng thuận (Sequence Agreement Ratio)
    if vi_is_toxic and not zip_is_toxic:
        agree = asr_agreement(zip_clean, vi_clean)
        audio_strong = peak_dbfs >= -25 and (speech_sec is None or speech_sec >= 0.7)
        if not audio_weak and (agree >= VITOSA_MIN_AGREEMENT or (not zip_clean and audio_strong)):
            print(f"🔄 [Hybrid] Chọn PhoWhisper: '{vi_clean}' (ZipFormer: '{zip_clean}', đồng thuận={agree:.2f})")
            return vi_clean
        print(f"⚠️ [Hybrid] PhoWhisper toxic đơn độc, nghi ảo giác -> Bỏ: '{vi_clean}' (ZipFormer: '{zip_clean}', đồng thuận={agree:.2f})")
        return zip_clean

    return zip_clean if zip_clean else (vi_clean if not vi_is_toxic else "")

# ==============================================================================
# 4. CHUẨN HÓA VĂN BẢN (TEXT PREPROCESSING & TEEN-CODE)
# ==============================================================================
TEEN_CODE_DICT = {
    "ịt": "địt", "đjt": "địt", "djt": "địt", "dit": "địt", "d1t": "địt",
    "m3": "mẹ", "me": "mẹ",
    "vl": "vãi", "vkl": "vãi", "vcl": "vãi",
    "ngu": "ngu", "cức": "cứt", "cute": "dễ thương", "dị": "vậy",
    "m4y": "mày", "may": "mày", "mày": "mày", "m": "mày",
    "t4o": "tao", "tao": "tao",
    "dm": "đm", "đmm": "đm", "clm": "clm", "dcm": "đcm", "đcm": "đcm",
    "ụ": "đụ", "éo": "đéo", "đèo mẹ": "đéo mẹ",
    "lon": "lồn", "l0n": "lồn", "lồn": "lồn", "non": "nồn", "n0n": "nồn", "nồn": "nồn",
    "cac": "cặc", "c4c": "cặc", "cặc": "cặc", "cak": "cặc",
    "buoi": "buồi", "buồi": "buồi", "bui": "buồi",
    "deo": "đéo", "đéo": "đéo"
}

def remove_accents(input_str: str) -> str:
    nfkd_form = unicodedata.normalize('NFKD', input_str)
    return "".join([c for c in nfkd_form if not unicodedata.combining(c)]).replace('đ', 'd').replace('Đ', 'D')

def preprocess_text_basic(text: str) -> str:
    text = (text or "").lower()
    leetspeak_map = str.maketrans("0134578", "oieastb")

    text = re.sub(
        r'(?<=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])'
        r'[\.\,\-\*\_\|\/\@\#\$\%\^]'
        r'(?=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])',
        '', text
    )
    text = re.sub(r'[^\w\s\.,!?đĐ]', ' ', text)
    text = re.sub(
        r'([a-zđáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ])\1{2,}',
        r'\1', text
    )

    text = text.translate(leetspeak_map)
    words = text.split()
    normalized_words = [TEEN_CODE_DICT.get(w, w) for w in words]
    joined_text = " ".join(normalized_words)

    joined_text = re.sub(r'\b(đ|d)\s*(i|ị|1)\s*(t|t)\b', 'địt', joined_text)
    joined_text = re.sub(r'\b(đ|d)(i|ị|1)(t)\b', 'địt', joined_text)
    joined_text = re.sub(r'\b(l|n)\s*(o|ồ|0|ô)\s*(n|l)\b', 'lồn', joined_text)
    joined_text = re.sub(r'\b(l|n)(o|ồ|0|ô)(n)\b', 'lồn', joined_text)
    joined_text = re.sub(r'\b(c)\s*(a|ặ|ă|4)\s*(c|k)\b', 'cặc', joined_text)
    joined_text = re.sub(r'\b(c)(a|ặ|ă|4)(c|k)\b', 'cặc', joined_text)
    joined_text = re.sub(r'\b(b)\s*(u|uô|uồ|ư)\s*(i|ì|y|oi)\b', 'buồi', joined_text)
    joined_text = re.sub(r'\b(b)\s+(u)\s+(oi|i|ì)\b', 'buồi', joined_text)
    joined_text = re.sub(r'\b(b)(u|uô|uồ)(i|ì|oi)\b', 'buồi', joined_text)
    joined_text = re.sub(r'\b(đ|d)\s*(e|é|ẹ)\s*(o|ô)\b', 'đéo', joined_text)
    joined_text = re.sub(r'\b(cái|con|mặt)\s+(lồ|luồn|lộn)\b', r'\1 lồn', joined_text)
    joined_text = re.sub(r'\b(đang luồn)\b', 'đang lồn', joined_text)
    joined_text = re.sub(r'\bnồn\b', 'nồn', joined_text)
    joined_text = re.sub(r'\blon\b', 'lồn', joined_text)
    joined_text = re.sub(r'\bcac\b', 'cặc', joined_text)
    joined_text = re.sub(r'\bbuoi\b', 'buồi', joined_text)
    joined_text = re.sub(r'\bdit\b', 'địt', joined_text)
    joined_text = re.sub(r'\bdeo\b', 'đéo', joined_text)

    return joined_text.strip()

# ==============================================================================
# 5. BỘ LỌC QUY TẮC & MỈA MAI
# ==============================================================================
SAFE_PHRASES_PATTERN = re.compile(
    r"\b("
    r"mặc đồ|mua đồ|đồ cũ|đồ mới|đồ ăn|đồ uống|đồ dùng|đồ chơi|đồ đạc|sắm đồ|dọn đồ|gửi đồ|cất đồ|"
    r"ông cụ|bà cụ|cụ già|cụ ông|cụ bà|quần áo|áo quần"
    r")\b",
    re.IGNORECASE,
)

SELF_DEPRECATION_PATTERN = re.compile(
    r"\b(tao|mình|tui|tôi|bản thân|cơ thể)\b.{0,20}\b(ngu|ngu ngơ|ngu ngốc|đần|dốt|ngáo|khùng|dở|óc lợn|tàn tạ)\b"
    r"|"
    r"\b(ngu|ngu ngơ|ngu ngốc|đần|dốt|ngáo|khùng|dở|tàn tạ)\b.{0,20}\b(tao|mình|tui|tôi|bản thân|cơ thể)\b",
    re.IGNORECASE,
)

LITERAL_ANIMAL_PATTERN = re.compile(
    r"\b(con|bị|chăm|nuôi|dắt|mua|bán|tắm|cho|thịt|yêu|thích|huấn luyện|giống|cửa hàng|shop|bác sĩ|thú y|khám|chữa|tiêm|bệnh)\s+(chó|sâu|sâu bọ|mèo)\b"
    r"|\b(chó|sâu|sâu bọ|mèo)\s+(nhà|cảnh|cỏ|dại|điên|săn|con|mình|ta|cưng|becgie|poodle|husky|pug|phú quốc|đốm|xấu|ngoan|sủa|cắn|mèo|trong vườn|ăn hại|bị sưng|bị bệnh)\b"
    r"|\b(dắt|xem|bắt|cứu|chữa|chích ngừa|tiêm phòng|tiêu diệt)\s+(chó|sâu|sâu bọ)\b"
    r"|\b(cho\s+chó\s+ăn|chó\s+ăn)\b",
    re.IGNORECASE,
)

LITERAL_CONTEXT_PATTERN = re.compile(
    r"\b(bác sĩ|thú y|khám|bệnh|sưng|vết thương|tiêm|thuốc|điều trị|bệnh viện|phòng khám|"
    r"ánh sáng|chiếu|chói|nắng|đèn|mặt trời|rực rỡ|lọi|phần má|tai chó|mắt chó)\b",
    re.IGNORECASE,
)

SAFE_METAPHOR_PATTERN = re.compile(
    r"\b(chết mê|chết mệt|chết cười|đi bằng đầu|dính dớp|như cái giẻ lau|giẻ lau)\b",
    re.IGNORECASE,
)

LEADING_INTERJECTIONS = [
    "vãi nồi", "vãi cả nồi", "vãi linh hồn", "vãi cả chưởng", "vãi đái", "vãi",
    "vl", "vkl", "đệt", "đệch", "đm thật", "đm", "đmm", "dm",
    "chết tiệt", "chết cha", "trời ơi", "trời đất ơi", "trời đất", "trời ạ",
    "má ơi", "mẹ ơi", "mẹ kiếp", "ối giời", "ối giời ơi", "clm", "cl", "cc", "cmn",
]
_LEADING_INTERJECTIONS_SORTED = sorted(LEADING_INTERJECTIONS, key=len, reverse=True)
LEADING_INTERJECTION_PATTERN = re.compile(
    r"^(" + "|".join(re.escape(w) for w in _LEADING_INTERJECTIONS_SORTED) + r")\b[,\.!]*\s+",
    re.IGNORECASE,
)

PLAYFUL_DIEN_PATTERN = re.compile(
    r'\b(vui|yêu|thích|mê|cuồng)\s*(điên|khùng|ngáo|hâm)\s*(rồi|quá|vậy|thế)?\b',
    re.IGNORECASE
)
BANTER_RHETORICAL_PATTERN = re.compile(
    r"\b(mày|m4y|m\.y|tao|t4o)\s+(điên|khùng|dở hơi|hâm|ngáo)\s+(à|à\?|hả|thế|hả\?)\b",
    re.IGNORECASE
)
INFORMAL_PRONOUN_PATTERN = re.compile(
    r"\b(tao|mày|t4o|m4y|tụi tao|tụi mày)\b",
    re.IGNORECASE
)

EXPLICIT_PROFANITY_PATTERN = re.compile(
    r"\b("
    r"địt|ịt|đụ|ụ|đéo|éo|cặc|lồn|buồi|súc vật|óc chó|đĩ|điếm|phò|nứng|"
    r"thằng chó|đồ chó|chó đẻ|chó chết|chó hùa|chó má|địt mẹ|ịt mẹ|đụ má|dcm|đcm|vkl|vcl|"
    r"cái l|ml|mặt l|thằng l|ngu lồn|ngu cặc|thấy mẹ|bỏ mẹ|mẹ kiếp|khu mật|đù|đù mẹ|"
    r"cu|cù|cụ|cờ lồn|cặc cồn|ồn cu|cu ồn|"
    r"nồn|nồn què|nồn que|lon què|lon que|lồn què|lồn que|"
    r"n0n|n0n què|n0n que|lonque|nồnquê|nồnque|"
    r"cái nồn|thằng nồn|con nồn|nồn to|nồn bé|"
    r"đjt|djt|dit me|dit mẹ|đit mẹ|đụ mẹ|đụ má|"
    r"cặc cặc|lồn lồn|buồi buồi|óc lợn|óc heo|"
    r"khốn nạn|đồ khốn|thằng khốn|con đĩ|đồ đĩ|đồ điếm|đồ phò"
    r")\b",
    re.IGNORECASE,
)

KNOWN_NOI_LAI_DICT = {
    "cồn u": "cu ồn", "cồn lề": "cờ lồn", "cồn cặc": "cặc cồn",
    "chà đĩa": "chia đá", "thành công": "thông càng", "mụn nhọt": "nhụn mọt", "kiều nữ": "cửu nịu",
    "nồn què": "lồn què", "nồn que": "lồn què",
}

_ONSETS = sorted([
    "ngh", "ng", "nh", "ph", "th", "tr", "ch", "kh", "gh", "gi", "qu",
    "b", "c", "d", "đ", "g", "h", "k", "l", "m", "n", "p", "r", "s", "t", "v", "x",
], key=len, reverse=True)

def _split_onset(syllable: str) -> Tuple[str, str]:
    low = syllable.lower()
    for onset in _ONSETS:
        if low.startswith(onset):
            return syllable[:len(onset)], syllable[len(onset):]
    return "", syllable

def swap_onset_pair(w1: str, w2: str) -> Optional[str]:
    o1, rest1 = _split_onset(w1)
    o2, rest2 = _split_onset(w2)
    if not o1 and not o2:
        return None
    new1, new2 = o2 + rest1, o1 + rest2
    if (new1.lower(), new2.lower()) == (w1.lower(), w2.lower()):
        return None
    return f"{new1} {new2}"

def denoi_lai(text: str) -> Tuple[str, bool]:
    has_swapped = False
    lowered_text = text.lower()

    for key, val in KNOWN_NOI_LAI_DICT.items():
        if key in lowered_text:
            text = re.sub(re.escape(key), val, text, flags=re.IGNORECASE)
            has_swapped = True

    words = text.split()
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i + 1]
        cand_onset = swap_onset_pair(w1, w2)
        if cand_onset:
            if EXPLICIT_PROFANITY_PATTERN.search(cand_onset):
                has_swapped = True
                break
            cand_unaccented = remove_accents(cand_onset)
            if re.search(r"\b(cac|lon|n0n|non|buoi|dit|deo|que)\b", cand_unaccented, re.IGNORECASE):
                has_swapped = True
                break

    return " ".join(words), has_swapped

THREAT_ACTIONS = r"(xiên|chém|giết|đâm|đập|táng|múc|cắt cổ|bóp cổ|thiến|xé xác|băm|luộc|phanh thây|đánh|tát|bắn)"
THREAT_TARGETS = r"(cả lò|cả họ|cả dòng họ|cả nhà|mày|chúng mày|tụi mày|ông|bà|cha|mẹ|gia đình|cái mõm|vỡ mõm|nát mặt|đầu máu)"

SEVERE_THREAT_PATTERN = re.compile(
    rf"\b{THREAT_ACTIONS}\b.{{0,30}}\b{THREAT_TARGETS}\b|\b{THREAT_TARGETS}\b.{{0,30}}\b{THREAT_ACTIONS}\b"
    rf"|\b(tự tử đi|chết đi cho khuất mắt|giải thoát.*tự tử|đâm xe|xe cán)\b",
    re.IGNORECASE,
)
VIOLENT_THREAT_PATTERN = SEVERE_THREAT_PATTERN

INSULT_SUBJECTS = r"(cha|mẹ|bố|thầy|u|ông nội|bà nội|dòng họ|cả nhà|bản mặt)"
INSULT_ADJECTIVES = r"(chết trôi|thất bại|vô phúc|chó má|rác rưởi|súc vật|đĩ|làm phò|đê tiện)"

TARGETED_INSULT_PATTERN = re.compile(
    rf"\b{INSULT_SUBJECTS}\b.{{0,20}}\b{INSULT_ADJECTIVES}\b"
    rf"|\b(mày|bạn|thằng|con|lũ|bọn|loại|đồ|thứ|kẻ).{{0,15}}(vô dụng|ăn hại|phế vật|rác rưởi|thất bại|bỏ đi|dơ bẩn|vô học|dốt nát|chó|óc chó|súc vật)\b",
    re.IGNORECASE,
)

WORK_TOXIC_PATTERN = re.compile(
    r"\b(code|sản phẩm|file|bài|làm việc|chức năng)\b.{0,15}\b(như rác|là rác|viết rác|như cức|như shit|như hạch|tắt máy đi ngủ)\b",
    re.IGNORECASE,
)

SARCASM_TOXIC_PATTERN = re.compile(
    r"\b(trại tâm thần|bệnh viện tâm thần)\b"
    r"|"
    r"\b(món quà).{0,30}\b(im lặng|tự nhiên|thiên nhiên)\b"
    r"|"
    r"\b(quý trọng|trân trọng)\s+(sự im lặng|việc im lặng)\b"
    r"|"
    r"\b(chậm hiểu bền vững|chậm hiểu|tiếp thu chậm)\b"
    r"|"
    r"\b(bố mẹ|cha mẹ|mẹ)\b.{0,30}\b(tự hào|hãnh diện|kiên nhẫn)\b.{0,30}\b(chậm hiểu|ngu|dốt|phá)\b"
    r"|"
    r"\b(nói chuyện với|giải thích cho).+(đầu gối|con bò|bức tường|cái ghế).+(hơn|nhanh hơn|dễ hiểu hơn|có lý hơn)\b"
    r"|"
    r"\b(nhìn|xem).+(bạn|mày|anh|chị).+(làm việc|code|gõ).+(tưởng|như đang|giống).+(phim hài|rạp xiếc|tấu hài|diễn hề)\b"
    r"|"
    r"\b(sinh ra|đẻ ra|mổ xong|tìm lại|đánh mất|quên lắp|quên gắn|quên cho).{0,40}(vứt nhầm|để quên|rớt|lắp lại|phần nào|bộ nào|phần não|bộ não|trí não|não|đầu óc|trí tuệ|nếp nhăn)\b"
    r"|"
    r"\b(não|bộ não|trí não)\b.+(đánh mất|quên lắp|chỉ để trang trí)\b",
    re.IGNORECASE,
)

SAFE_IDIOMS = [
    "chém gió", "xiên que", "thịt xiên", "chém hoa quả", "chém trái cây",
    "đập hộp", "đập muỗi", "đấm bóp", "tát ao", "tát nước", "tán gái",
    "tán dóc", "cá viên chiên", "bóp bóng", "ngu ngơ", "ngu ngốc", "sòng phẳng",
    "bựa vãi", "tiêu diệt", "giết boss", "đánh boss", "cắt tóc", "cắt lỗ", "bắt đáy", "đu đỉnh"
]

YOUTH_INTENSIFIER_PATTERN = re.compile(
    r"\b(ác|ghê|dữ|gớm|kinh|đỉnh|xịn|pro|ngon|xỉu|rợn)\s*(vậy|quá|thế|xỉu|rợn|dằn|luôn|thật|đi|á|ạ)?\b",
    re.IGNORECASE,
)

IT_CONTEXT_WHITELIST = [
    "fix bug", "server", "đồ án", "code", "file batch", "deadline",
    "chức năng", "deploy", "commit", "pull request", "bug", "error"
]
FRIENDLY_BANTER_WHITELIST = [
    "đùa thôi", "nói chơi", "mình đùa", "tao đùa", "mày đùa", "tui đùa",
    "thân mật", "bạn bè", "mấy đứa", "bọn mình", "tụi tao", "tụi mình",
    "haha", "hehe", "kk", "ha ha", "cười", "đùa giỡn", "nói đùa",
    "bạn thân", "anh em", "chị em"
]
SHORT_TEXT_MAX_WORDS = 3
STANDALONE_INSULT_WORDS = {
    "ngu", "óc chó", "súc vật", "đồ chó", "khốn nạn", "đĩ", "điếm", "phò",
    "dốt", "óc lợn", "đần", "rồ", "vô học", "chó đẻ", "chó chết", "chó hùa",
    "địt", "đụ", "cặc", "lồn", "buồi", "nồn", "vô dụng", "thất bại",
    "hỏng bét", "rác rưởi"
}

def is_short_and_safe(cleaned_text: str) -> bool:
    words = cleaned_text.split()
    if len(words) > SHORT_TEXT_MAX_WORDS:
        return False
    if EXPLICIT_PROFANITY_PATTERN.search(cleaned_text):
        return False
    if any(w in ["đù", "đú", "đm", "vl"] for w in words):
        return False
    if any(w in STANDALONE_INSULT_WORDS for w in words):
        return False
    return True

def strip_leading_interjection(text: str) -> Tuple[str, bool]:
    match = LEADING_INTERJECTION_PATTERN.match(text)
    if match:
        remainder = text[match.end():].strip()
        return (remainder if remainder else text), True
    return text, False

PRAISE_HINTS = [
    "nghệ thuật", "đúng hạn", "thiên tài", "thông minh", "giỏi", "siêu", "đỉnh", "chuyên nghiệp",
    "tự hào", "mượt", "pro", "hay ghê", "nhanh ghê", "xuất sắc", "hoàn hảo", "cừ khôi", "tài tình",
    "vi diệu", "hết nước chấm", "trên cả tuyệt vời", "quá đỉnh", "chỉn chu", "tâm huyết",
]
NEGATIVE_FACTS = [
    "lỗi", "sai", "trễ", "muộn", "hỏng", "toang", "đứng máy", "đơ", "rớt", "tạch", "bug",
    "không chạy", "crash", "lag", "văng", "out game", "đứng hình", "sai bét", "sai tè le",
    "delay", "quá hạn", "fail", "banh", "nát", "loạn",
]
SARCASM_ACTION_SIGNALS = [
    "cứ đi", "cứ việc", "tự gánh", "gánh team", "gánh hết", "tự làm hết", "làm một mình",
    "đầu gối", "bức tường", "rạp xiếc", "diễn hề", "tấu hài", "như đúng rồi", 
    "nhờ ơn", "đúng là bạn", "quên gắn não", "quên lắp não", "bài tập nhóm", "khỏi tốn",
    "khỏi cần", "miễn phí công sức", "cảm ơn nhiều nha", "cảm ơn nha",
    "quên mang não", "quên đem não", "quên lấy não", "não đâu", "não để đâu",
    "não mang theo", "não đem theo", "não ở nhà", "não để nhà",
]
IRONY_MARKER_WORDS = [
    "nhỉ", "cơ đấy", "đấy nhé", "cơ mà", "vậy đó", "thế đó", "z đó",
    "hay nhỉ", "tài nhỉ", "giỏi nhỉ", "đỉnh nhỉ", "ghê nhỉ", "quá nhỉ",
]
CONTRAST_CONNECTORS = [
    "vậy mà", "thế mà", "ấy vậy mà", "ấy thế mà", "nhưng mà lại", "nhưng lại", "mà lại", "cơ mà",
]

_PRAISE_ALT = "|".join(re.escape(p) for p in PRAISE_HINTS)
_NEGATIVE_ALT = "|".join(re.escape(n) for n in NEGATIVE_FACTS)
_CONTRAST_ALT = "|".join(re.escape(c) for c in CONTRAST_CONNECTORS)

PRAISE_HINTS_PATTERN = re.compile(rf"\b({_PRAISE_ALT})\b", re.IGNORECASE)
NEGATIVE_FACTS_PATTERN = re.compile(rf"\b({_NEGATIVE_ALT})\b", re.IGNORECASE)

SYSTEM_FAIL_PATTERN = re.compile(
    r"\b(đứng|treo|đơ|sập|tắt|văng)\b.{0,15}\b(máy|server|hệ thống|màn hình|app|ứng dụng|game|mạng|wifi)\b"
    r"|\b(màn hình xanh|full lỗi|lỗi tùm lum|restart lại máy|khởi động lại máy|out game|văng ra ngoài)\b",
    re.IGNORECASE,
)

CONTRAST_SARCASM_PATTERN = re.compile(
    rf"\b({_PRAISE_ALT})\b.{{0,25}}\b({_CONTRAST_ALT})\b.{{0,25}}\b({_NEGATIVE_ALT})\b"
    rf"|\b({_NEGATIVE_ALT})\b.{{0,25}}\b({_CONTRAST_ALT})\b.{{0,25}}\b({_PRAISE_ALT})\b",
    re.IGNORECASE,
)

QUOTE_WRAPPED_PRAISE_PATTERN = re.compile(
    rf'["\'“”‘’]\s*({_PRAISE_ALT})\s*["\'“”‘’]', re.IGNORECASE
)

INTELLECT_MOCKERY_PATTERN = re.compile(
    r"\b(não|thông minh|iq|chỉ số thông minh|đầu óc|trí tuệ|trí khôn)\b"
    r".{0,25}"
    r"\b(bạn|mày|m|cậu|ông|bà|anh|chị|cậu|mày|m4y|may)\b"
    r"|"
    r"\b(bạn|mày|m|cậu|ông|bà|anh|chị|m4y|may)\b"
    r".{0,25}"
    r"\b(não|thông minh|iq|đầu óc|trí tuệ|trí khôn)\b"
    r"|"
    r"\b(quên|để quên|bỏ quên|thất lạc|đánh mất|quên mang|quên đem|quên lấy)\b"
    r".{0,20}"
    r"\b(não|đầu óc|trí tuệ|bộ não)\b"
    r"|"
    r"\b(não|đầu óc|trí tuệ|bộ não)\b"
    r".{0,20}"
    r"\b(quên|để quên|bỏ quên|thất lạc|đánh mất|mang theo|đem theo)\b",
    re.IGNORECASE,
)

def has_intellect_mockery(text: str) -> bool:
    lowered = text.lower()
    if re.search(r"\bnão\s*(m|mày|m4y|may|bạn|cậu|anh|chị|ông|bà)\b", lowered):
        return True
    if re.search(r"\b(quên|để|bỏ|thất lạc|đánh mất)\s*(mang|đem|lấy|theo)?\s*(não|đầu óc|bộ não)\b", lowered):
        return True
    if re.search(r"\bnão\b.{0,35}\b(à|hả|á|ạ|nhỉ|đấy|đó)\b", lowered):
        return True
    if re.search(r"\bnão\s*(đâu|để đâu|ở đâu|mang theo|đem theo|để nhà|ở nhà)\b", lowered):
        return True
    return False

def has_passive_aggressive(text: str) -> bool:
    lowered = text.lower()
    patterns = [
        r"\bcứ\s+(đi|việc|làm|chơi).{0,20}(để mình|mình tự|tự gánh|gánh hết)",
        r"\b(không sao|không vấn đề|không sao đâu).{0,25}(mình quen|mình làm được|mình tự)",
        r"\b(mình|tôi|tui)\s+(tự|một mình).{0,15}(gánh|làm hết|lo hết)",
        r"\b(cảm ơn|cám ơn).{0,15}(nhiều nha|nha|nhé).{0,20}(mình làm|tự làm)",
    ]
    return any(re.search(p, lowered) for p in patterns)

def has_light_sarcasm_or_question(text: str) -> bool:
    lowered = text.lower()
    if re.search(r"\b(thông minh|giỏi|đỉnh|hay|pro|tài|cừ)\s*(vậy|thế|nhỉ|hả|à|á)\b", lowered):
        return True
    if re.search(r"\b(giỏi|đỉnh|hay|pro)\s*(nhỉ|thật|quá)\b", lowered) and len(lowered.split()) <= 6:
        return True
    if re.search(r"\b(giỏi|hay|đỉnh|nhanh|mượt|đúng hạn)\b.{0,30}\b(sai|lỗi|muộn|trễ|chậm|chỉ có|có mỗi)\b", lowered):
        return True
    return False

def check_sarcasm_signature(text: str) -> bool:
    lowered = text.lower()
    if has_intellect_mockery(lowered):
        return True
    if has_passive_aggressive(lowered):
        return True
    if has_light_sarcasm_or_question(lowered):
        return True

    has_system_fail = bool(SYSTEM_FAIL_PATTERN.search(lowered))
    has_praise = bool(PRAISE_HINTS_PATTERN.search(lowered))
    has_defect = bool(NEGATIVE_FACTS_PATTERN.search(lowered)) or has_system_fail

    if has_praise and has_defect:
        return True
    if CONTRAST_SARCASM_PATTERN.search(lowered):
        return True
    if QUOTE_WRAPPED_PRAISE_PATTERN.search(text):
        return True
    if any(sig in lowered for sig in SARCASM_ACTION_SIGNALS):
        return True
    if any(marker in lowered for marker in IRONY_MARKER_WORDS) and (has_praise or has_defect):
        return True
    if INTELLECT_MOCKERY_PATTERN.search(lowered):
        return True
    if "não" in lowered and re.search(r"\b(à|hả|á|ạ|nhỉ|đấy|đó)\b", lowered) and len(lowered.split()) <= 10:
        return True
    return False

# ==============================================================================
# 6. LOGIC PHÂN TẦNG: PHOBERT + QWEN
# ==============================================================================
def get_raw_model_score(text: str) -> float:
    encoded_dict = tokenizer(
        text,
        add_special_tokens=True,
        max_length=256,
        truncation=True,
        padding="max_length",
        return_tensors="pt"
    ).to(device)
    
    with torch.no_grad():
        outputs = model(
            input_ids=encoded_dict["input_ids"],
            attention_mask=encoded_dict["attention_mask"]
        )
        probabilities = torch.softmax(outputs.logits, dim=1)
        return probabilities[0][1].item()

def consult_colab_llm(text: str) -> bool:
    try:
        res = requests.post(COLAB_LLM_URL, json={"text": text}, timeout=10.0)
        if res.status_code == 200:
            data = res.json()
            is_tox = data.get("is_toxic", False)
            print(f"🤖 [Qwen Colab] Kết luận: {'ĐỘC HẠI' if is_tox else 'AN TOÀN'} | Lý do: {data.get('raw_response')}")
            return is_tox
    except Exception as e:
        print(f"⚠️ Kết nối Qwen Colab gặp sự cố ({e}), tiếp tục dùng điểm PhoBERT dự phòng.")
    return False

def deep_score_text(raw_text: str) -> float:
    basic_text = preprocess_text_basic(raw_text)

    if SAFE_PHRASES_PATTERN.search(basic_text):
        return 0.01

    denoised_text, has_swapped = denoi_lai(basic_text)
    cleaned_text = denoised_text

    text_for_hard_block = cleaned_text
    for idiom in SAFE_IDIOMS:
        text_for_hard_block = text_for_hard_block.replace(idiom, " ")

    has_explicit_curse = bool(EXPLICIT_PROFANITY_PATTERN.search(text_for_hard_block))
    if (has_explicit_curse or
        VIOLENT_THREAT_PATTERN.search(text_for_hard_block) or
        SEVERE_THREAT_PATTERN.search(text_for_hard_block) or
        TARGETED_INSULT_PATTERN.search(text_for_hard_block) or
        WORK_TOXIC_PATTERN.search(text_for_hard_block) or
        SARCASM_TOXIC_PATTERN.search(cleaned_text)):
        print(f"🛡️ [Filter Vòng Ngoài] Chặn trực tiếp thô tục: \"{raw_text}\"")
        return 0.99

    # === CỨNG HƠN VỚI MỈA MAI "NÃO" ===
    # Nếu có dấu hiệu mỉa mai trí tuệ + đại từ thân mật (mày/tao/cậu...) → hard-block,
    # không còn đưa sang Qwen để dễ bị giải oan.
    if has_intellect_mockery(cleaned_text) and INFORMAL_PRONOUN_PATTERN.search(cleaned_text):
        print(f"🛡️ [Filter Vòng Ngoài] Chặn mỉa mai trí tuệ (não + đại từ): \"{raw_text}\"")
        return 0.99

    if has_swapped:
        is_literal_context = (
            bool(LITERAL_ANIMAL_PATTERN.search(basic_text)) or
            bool(LITERAL_CONTEXT_PATTERN.search(basic_text))
        )
        if not is_literal_context:
            return 0.99

    if check_sarcasm_signature(cleaned_text):
        print(f"🔍 [Dấu hiệu mỉa mai] Chuyển tiếp sang Qwen phân tích: \"{cleaned_text}\"")
        if consult_colab_llm(cleaned_text):
            return 0.99

    has_conflict_pronoun = bool(INFORMAL_PRONOUN_PATTERN.search(cleaned_text)) or ("não" in cleaned_text)
    if not has_conflict_pronoun:
        if (SAFE_METAPHOR_PATTERN.search(basic_text) or
            SELF_DEPRECATION_PATTERN.search(basic_text) or
            LITERAL_ANIMAL_PATTERN.search(basic_text) or
            LITERAL_CONTEXT_PATTERN.search(basic_text)):
            return 0.02

    if is_short_and_safe(cleaned_text):
        return 0.02

    if YOUTH_INTENSIFIER_PATTERN.search(cleaned_text):
        temp_text = YOUTH_INTENSIFIER_PATTERN.sub("", cleaned_text).strip()
        if not temp_text or is_short_and_safe(temp_text):
            return 0.02

    if PLAYFUL_DIEN_PATTERN.search(cleaned_text):
        temp_text = PLAYFUL_DIEN_PATTERN.sub("", cleaned_text).strip()
        if not temp_text or is_short_and_safe(temp_text):
            return 0.03

    remainder_text, had_interjection = strip_leading_interjection(cleaned_text)
    if had_interjection:
        cleaned_text = remainder_text

    if BANTER_RHETORICAL_PATTERN.search(cleaned_text):
        temp_text = BANTER_RHETORICAL_PATTERN.sub("", cleaned_text).strip()
        if not temp_text:
            return 0.0

    is_informal = INFORMAL_PRONOUN_PATTERN.search(cleaned_text)
    if is_informal and len(cleaned_text.split()) <= 7:
        # Không tha các câu ngắn chứa não / ngu / chó
        if not any(w in cleaned_text for w in ["não", "ngu", "chó", "óc"]):
            return 0.05

    global_score = get_raw_model_score(cleaned_text)
    has_it_context = any(kw in cleaned_text for kw in IT_CONTEXT_WHITELIST)
    has_friendly_context = any(kw in cleaned_text for kw in FRIENDLY_BANTER_WHITELIST) or bool(is_informal)

    # Không giảm điểm nếu có mỉa mai não
    if has_friendly_context and not has_intellect_mockery(cleaned_text):
        global_score *= 0.50
    elif has_it_context:
        global_score *= 0.70

    if global_score > TOXIC_THRESHOLD and not has_explicit_curse:
        print(f"⚖️ [PhoBERT nghi ngờ {global_score:.2f}] Nhờ Qwen thẩm định giải oan: \"{cleaned_text}\"")
        is_really_toxic = consult_colab_llm(cleaned_text)
        if not is_really_toxic:
            print("🕊️ [Qwen xác nhận] Câu an toàn trong ngữ cảnh đời thường. Giải oan thành công!")
            return 0.05

    return global_score

# ==============================================================================
# 7. QUẢN LÝ TỆP ÂM THANH & BẰNG CHỨNG
# ==============================================================================
def clean_old_evidence_files():
    now = datetime.now()
    for folder in [EVIDENCE_DIR, REPORTS_DIR]:
        if not os.path.exists(folder):
            continue
        for fname in os.listdir(folder):
            fpath = os.path.join(folder, fname)
            if os.path.isfile(fpath):
                file_time = datetime.fromtimestamp(os.path.getmtime(fpath))
                if now - file_time > timedelta(days=EVIDENCE_RETENTION_DAYS):
                    try:
                        os.remove(fpath)
                    except Exception:
                        pass

def extract_evidence_clip(audio_path: str, start_sec: float, end_sec: float, call_id: str, seg_idx: int) -> str:
    audio = AudioSegment.from_file(audio_path)
    start_ms = max(0, int((start_sec * 1000) - EVIDENCE_CLIP_PADDING_MS))
    end_ms = min(len(audio), int((end_sec * 1000) + EVIDENCE_CLIP_PADDING_MS))
    
    clip = audio[start_ms:end_ms]
    out_filename = f"{call_id}_seg{seg_idx}_{uuid.uuid4().hex[:6]}.mp3"
    out_path = os.path.join(EVIDENCE_DIR, out_filename)
    clip.export(out_path, format="mp3")
    return out_filename

def save_call_report(call_id: str, caller_id: str, receiver_id: str, chunk_transcript: str, toxic_segments: list) -> dict:
    report_path = os.path.join(REPORTS_DIR, f"{call_id}.json")
    now_iso = datetime.now().isoformat()
    with report_lock:
        report = None
        if os.path.exists(report_path):
            try:
                with open(report_path, "r", encoding="utf-8") as f:
                    report = json.load(f)
            except Exception:
                report = None
        if not isinstance(report, dict):
            report = {
                "call_id": call_id,
                "caller_id": caller_id,
                "receiver_id": receiver_id,
                "timestamp": now_iso,
                "full_transcript": "",
                "is_toxic": False,
                "toxic_segments_count": 0,
                "violations": [],
                "chunks_count": 0,
            }
        report["chunks_count"] = report.get("chunks_count", 0) + 1
        report["last_updated"] = now_iso
        report["full_transcript"] = " ".join(
            t for t in [report.get("full_transcript", ""), chunk_transcript] if t
        ).strip()
        for seg in toxic_segments:
            report["violations"].append({**seg, "chunk_index": report["chunks_count"]})
        report["toxic_segments_count"] = len(report["violations"])
        report["is_toxic"] = report["toxic_segments_count"] > 0
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    return report

# ==============================================================================
# 8. CẤU HÌNH FASTAPI & CÁC ENDPOINT ROUTING
# ==============================================================================
app = FastAPI(
    title="UTC2 Connect - Safe Communication Moderation API",
    description="Hệ thống kiểm duyệt văn bản và cuộc gọi đa phương thức sử dụng PhoBERT & Whisper.",
    version=API_VERSION
)

_cors_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=bool(_cors_origins_env),
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_api_key(x_api_key: Optional[str] = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key không hợp lệ hoặc thiếu.")

class ModerationRequest(BaseModel):
    inputs: str = Field(..., max_length=MAX_TEXT_LENGTH)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "device": str(device),
        "cuda_available": torch.cuda.is_available(),
        "toxic_threshold": TOXIC_THRESHOLD,
        "asr_primary": os.path.basename(ASR_MODEL_DIR),
        "asr_verifier": ("PhoWhisper fine-tune" if ft_pipe is not None else "ViToSA-2 (PhoWhisper-BiLSTM-CRF)" if vitosa2_model is not None else ("UIT-ViToSA/vitosa-phowhisper-asr" if phowhisper_pipe else None)),
        "zipformer_ready": asr_recognizer is not None,
        "vitosa_ready": (ft_pipe is not None) or (vitosa2_model is not None) or (phowhisper_pipe is not None),
        "version": API_VERSION
    }

@app.post("/moderate")
def moderate_text(request: ModerationRequest, _auth=Depends(verify_api_key)):
    raw_text = request.inputs
    toxic_score = deep_score_text(raw_text)
    
    if toxic_score > TOXIC_THRESHOLD:
        return [[{"label": "toxic", "score": float(toxic_score)}]]
    else:
        return [[{"label": "safe", "score": float(1.0 - toxic_score)}]]

# ==============================================================================
# BƯỚC 1.1: CHUYỂN ENDPOINT THÀNH ASYNC DEF & SỬ DỤNG EXECUTOR
# ==============================================================================
@app.post("/moderate-audio")
async def moderate_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    call_id: str = Form(None),
    caller_id: str = Form("Unknown"),
    receiver_id: str = Form("Unknown"),
    _auth=Depends(verify_api_key)
):
    if phowhisper_pipe is None and vitosa2_model is None and ft_pipe is None and asr_recognizer is None:
        raise HTTPException(status_code=503, detail="Mô hình nhận dạng giọng nói (ASR) chưa sẵn sàng.")

    call_id = sanitize_id(call_id, fallback_prefix="call")
    _, original_ext = os.path.splitext(file.filename or "")
    safe_ext = original_ext if re.match(r"^\.[A-Za-z0-9]{1,5}$", original_ext or "") else ".webm"

    unique_suffix = uuid.uuid4().hex[:8]
    temp_file_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}{safe_ext}")
    wav_16k_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}_16k.wav")
    enhanced_wav_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{unique_suffix}_enhanced.wav")

    # 1. Lưu file upload
    max_bytes = MAX_AUDIO_FILE_MB * 1024 * 1024
    with open(temp_file_path, "wb") as buffer:
        total_written = 0
        while chunk := file.file.read(1024 * 1024):
            total_written += len(chunk)
            if total_written > max_bytes:
                buffer.close()
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                raise HTTPException(status_code=413, detail=f"File âm thanh vượt quá {MAX_AUDIO_FILE_MB}MB.")
            buffer.write(chunk)

    # ==========================================================================
    # BƯỚC 1.2: TỐI ƯU TIỀN XỬ LÝ ÂM THANH & BẬT LẠI DEEPFILTERNET
    # ==========================================================================
    try:
        audio = AudioSegment.from_file(temp_file_path)
        audio = audio.set_frame_rate(16000).set_channels(1)
        audio_duration_sec = len(audio) / 1000.0
        loudness_dbfs = audio.dBFS

        print(f"🎙️ [AUDIO] call={call_id} | {audio_duration_sec:.1f}s | dBFS={loudness_dbfs:.1f} | peak={audio.max_dBFS:.1f}")

        raw_peak_dbfs = audio.max_dBFS

        # VAD: chỉ giữ đoạn có tiếng người
        speech_audio, speech_sec = extract_speech(audio)
        if speech_sec is not None:
            print(f"🗣️ [VAD] call={call_id} | tiếng người: {speech_sec:.2f}s / {audio_duration_sec:.1f}s")
        no_speech = speech_sec is not None and speech_sec < ASR_MIN_SPEECH_SEC

        is_silent = (
            audio_duration_sec < 0.4
            or audio.max_dBFS < -38.0
            or no_speech
        )

        if is_silent:
            print(f"🔇 [AUDIO] call={call_id} bị coi là im lặng — bỏ qua ASR.")
            save_call_report(call_id, caller_id, receiver_id, "", [])
            for p in [temp_file_path, wav_16k_path]:
                if os.path.exists(p):
                    os.remove(p)
            return {
                "status": "success",
                "call_id": call_id,
                "is_toxic": False,
                "transcript": "",
                "violations": []
            }

        if speech_sec is not None:
            audio = speech_audio

        # 1. Chỉ Normalize khuếch đại nhẹ nếu thực sự cần (dBFS quá thấp)
        if audio.dBFS < -30:
            audio = effects.normalize(audio, headroom=3.0)  # headroom=3.0 tránh clipping
        audio.export(wav_16k_path, format="wav")

        audio_for_asr = wav_16k_path

        # 2. BẬT LẠI DeepFilter (Rất quan trọng để giảm ảo giác PhoWhisper)
        if df_model is not None and df_state is not None:
            try:
                df_audio, _ = load_audio(wav_16k_path, sr=16000)
                enhanced = enhance(df_model, df_state, df_audio)
                save_audio(enhanced_wav_path, enhanced, 16000)
                audio_for_asr = enhanced_wav_path
                print(f"🧹 [DeepFilter] Đã làm sạch nhiễu cho: {call_id}")
            except Exception as e:
                print(f"⚠️ [DeepFilter] Lỗi chạy khử nhiễu, dùng bản gốc: {e}")

        if SAVE_DEBUG_AUDIO:
            debug_path = os.path.join(TEMP_AUDIO_DIR, f"debug_{call_id}_{unique_suffix}.wav")
            shutil.copy(wav_16k_path, debug_path)
            print(f"💾 [DEBUG] Đã lưu: {debug_path}")

    except Exception as e:
        for p in [temp_file_path, wav_16k_path, enhanced_wav_path]:
            if os.path.exists(p):
                os.remove(p)
        raise HTTPException(status_code=500, detail=f"Lỗi chuẩn hóa âm thanh: {str(e)}")

    # ==========================================================================
    # BƯỚC 1.1 (Tiếp): ĐẨY XỬ LÝ STT NẶNG SANG BACKGROUND THREAD (THREADPOOLEXECUTOR)
    # ==========================================================================
    full_transcript = ""
    try:
        loop = asyncio.get_running_loop()
        full_transcript = await loop.run_in_executor(
            asr_executor,
            run_hybrid_asr,
            audio_for_asr,
            audio_duration_sec,
            raw_peak_dbfs,
            speech_sec
        )

        if (
            len(full_transcript.strip()) <= 1
            or full_transcript.strip() in ["<", ">", ".", ",", " "]
            or full_transcript.lower() in YOUTUBE_HALLUCINATIONS
        ):
            full_transcript = ""

        if is_degenerate_transcript(full_transcript, audio_duration_sec):
            print(f"⚠️ [ASR] Transcript bất thường, bỏ qua: '{full_transcript[:80]}...'")
            full_transcript = ""

    except Exception as e:
        for p in [temp_file_path, wav_16k_path, enhanced_wav_path]:
            if os.path.exists(p):
                os.remove(p)
        raise HTTPException(status_code=500, detail=f"Lỗi ASR: {str(e)}")

    print(f"📝 [ASR] call={call_id} | Transcript xử lý: '{full_transcript}'")

    # 5. Đánh giá độc hại
    toxic_segments = []
    has_violation = False

    if full_transcript:
        score = deep_score_text(full_transcript)
        if score > TOXIC_THRESHOLD:
            has_violation = True
            clip_name = extract_evidence_clip(wav_16k_path, 0.0, audio_duration_sec, call_id, 0)
            toxic_segments.append({
                "segment_index": 0,
                "start_time": 0.0,
                "end_time": audio_duration_sec,
                "text": full_transcript,
                "score": score,
                "evidence_clip": clip_name
            })

    # 6. Ghi báo cáo + dọn file
    save_call_report(call_id, caller_id, receiver_id, full_transcript, toxic_segments)

    for p in [temp_file_path, wav_16k_path, enhanced_wav_path]:
        if os.path.exists(p):
            os.remove(p)

    background_tasks.add_task(clean_old_evidence_files)

    return {
        "status": "success",
        "call_id": call_id,
        "is_toxic": has_violation,
        "transcript": full_transcript,
        "total_violations": len(toxic_segments),
        "violations": toxic_segments
    }

@app.get("/evidence/{filename}")
def get_evidence_clip(filename: str, _auth=Depends(verify_api_key)):
    if not SAFE_ID_PATTERN.match(filename) or ".." in filename:
        raise HTTPException(status_code=400, detail="Tên tệp không hợp lệ.")
    file_path = os.path.join(EVIDENCE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp âm thanh bằng chứng.")
    return FileResponse(file_path, media_type="audio/mpeg", filename=filename)

@app.get("/reports/{call_id}")
def get_call_report(call_id: str, _auth=Depends(verify_api_key)):
    if not SAFE_ID_PATTERN.match(call_id) or ".." in call_id:
        raise HTTPException(status_code=400, detail="call_id không hợp lệ.")
    report_path = os.path.join(REPORTS_DIR, f"{call_id}.json")
    if not os.path.exists(report_path):
        raise HTTPException(status_code=404, detail="Không tìm thấy báo cáo cuộc gọi.")
    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data

@app.get("/reports")
def list_call_reports(limit: int = Query(50, ge=1, le=200), _auth=Depends(verify_api_key)):
    reports = []
    if os.path.exists(REPORTS_DIR):
        files = sorted(
            [f for f in os.listdir(REPORTS_DIR) if f.endswith(".json")],
            key=lambda x: os.path.getmtime(os.path.join(REPORTS_DIR, x)),
            reverse=True
        )[:limit]
        
        for fname in files:
            fpath = os.path.join(REPORTS_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    reports.append(json.load(f))
            except Exception:
                pass
    return {"total": len(reports), "reports": reports}

if __name__ == "__main__":
    if not API_KEY:
        print("⚠️ [BẢO MẬT] Chưa đặt MODERATION_API_KEY — mọi endpoint đang mở công khai. "
              "Hãy đặt biến này trước khi cho người dùng thật dùng thử.")
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))