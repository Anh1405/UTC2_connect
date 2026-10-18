"""Cấu hình hệ thống: biến môi trường, ngưỡng, đường dẫn thư mục."""
import os
import re
import warnings

warnings.filterwarnings("ignore")
SAVE_DEBUG_AUDIO = True

MODEL_CHECKPOINT_PATH = os.environ.get("MODEL_CHECKPOINT_PATH", "toxic_model_v6.pth")
TOXIC_THRESHOLD = float(os.environ.get("TOXIC_THRESHOLD", "0.42"))
API_VERSION = "2.4.0"

# config.py nằm trong app/ nên phải lùi 2 cấp để về thư mục chứa api.py
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
