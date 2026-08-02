from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
import uvicorn
import warnings
import os
import uuid
import json
import shutil
import re
from datetime import datetime, timedelta
from pydub import AudioSegment
warnings.filterwarnings("ignore")

# 1. TẢI BỘ TỪ ĐIỂN VÀ MÔ HÌNH PHO-BERT TỪ VINAI
print("⏳ Đang tải bộ từ điển PhoBERT...")
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

print("⏳ Đang tải lõi AI PhoBERT...")
model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
model.load_state_dict(torch.load("toxic_model.pth", weights_only=True, map_location='cpu'), strict=False)
model.eval()
print("✅ Tải mô hình thành công!")

# ====================== TỪ ĐIỂN DỊCH TỪ LÓNG (TEEN-CODE) ======================
TEEN_CODE_DICT = {
    "đjt": "địt",
    "djt": "địt",
    "m3": "mẹ",
    "vl": "vãi",
    "vkl": "vãi",
    "ngu": "ngu", 
    "cức": "cứt",
    "cute": "dễ thương", # Khắc phục lỗi mượn từ tiếng Anh
    "dị": "vậy"          # Khắc phục từ địa phương
}

def preprocess_text(text: str) -> str:
    """Xóa dẫu câu tàng hình và dịch từ lóng"""
    text = text.lower()
    # Xóa ký tự nhiễu giữa các chữ cái
    text = re.sub(r'(?<=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])[\.\,\-\*\_](?=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])', '', text)
    
    words = text.split()
    normalized_words = [TEEN_CODE_DICT.get(w, w) for w in words]
    return " ".join(normalized_words)
# ==============================================================================

# ====================== CẤU HÌNH CHO KIỂM DUYỆT GIỌNG NÓI ======================
PHOWHISPER_MODEL = "vinai/PhoWhisper-medium"
TOXIC_THRESHOLD = 0.42
EVIDENCE_CLIP_PADDING_MS = 3000
EVIDENCE_RETENTION_DAYS = 30

TEMP_AUDIO_DIR = "temp_audio"
EVIDENCE_DIR = "evidence_clips"
REPORTS_DIR = "call_reports"

for d in [TEMP_AUDIO_DIR, EVIDENCE_DIR, REPORTS_DIR]:
    os.makedirs(d, exist_ok=True)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

print(f"⏳ Đang tải PhoWhisper ({PHOWHISPER_MODEL})...")
asr_pipeline = pipeline(
    "automatic-speech-recognition",
    model=PHOWHISPER_MODEL,
    device=0 if device.type == "cuda" else -1,
    chunk_length_s=30,
    return_timestamps=True,
)
print("✅ Tải PhoWhisper thành công!")
# ================================================================================

# 2. THIẾT LẬP API
app = FastAPI(title="UTC2 Connect - PhoBERT Moderation API")

class ModerationRequest(BaseModel):
    inputs: str


def get_raw_model_score(text: str) -> float:
    """Đưa văn bản trực tiếp qua AI để lấy điểm (không có tiền xử lý)"""
    encoded_dict = tokenizer(
        text,
        add_special_tokens=True,
        max_length=64,
        truncation=True,
        padding='max_length',
        return_tensors='pt'
    ).to(device)

    with torch.no_grad():
        outputs = model(input_ids=encoded_dict['input_ids'], attention_mask=encoded_dict['attention_mask'])
        probabilities = torch.softmax(outputs.logits, dim=1)
        return probabilities[0][1].item()


# Thêm danh sách này ở trên cùng, dưới TEEN_CODE_DICT
IT_CONTEXT_WHITELIST = ["fix bug", "server", "đồ án", "code", "file batch", "deadline", "chức năng"]

# ====================== THÁN TỪ / CÂU CẢM THÁN (KHÔNG NHẮM VÀO AI) ======================
# Các từ này chỉ bộc lộ cảm xúc bực bội/ngạc nhiên của người nói với TÌNH HUỐNG
# (vd: máy hỏng, code lỗi), không phải lời mắng nhắm vào người nghe.
# Chỉ áp dụng khi từ đứng Ở ĐẦU CÂU, ngay trước dấu phẩy/chấm than.
LEADING_INTERJECTIONS = [
    "vãi nồi", "vãi cả nồi", "vãi", "vl", "vkl",
    "đệt", "đệch", "đm thật", "chết tiệt", "chết cha",
    "trời ơi", "trời đất", "trời ạ", "má ơi", "mẹ ơi",
    "ối giời", "ối giời ơi", "khỉ thật", "thôi xong", "hỏng bét",
]
# Sắp xếp theo độ dài giảm dần để regex khớp cụm dài trước (vd "vãi nồi" trước "vãi")
_LEADING_INTERJECTIONS_SORTED = sorted(LEADING_INTERJECTIONS, key=len, reverse=True)
LEADING_INTERJECTION_PATTERN = re.compile(
    r'^(' + '|'.join(re.escape(w) for w in _LEADING_INTERJECTIONS_SORTED) + r')\s*[,\.!]+\s*',
    re.IGNORECASE
)

# Câu hỏi tu từ thân mật ("mày/tao điên/khùng/dở hơi à") thường không phải lời
# mắng thật, mà là cách mở đầu câu nói đùa/phân trần giữa bạn bè.
# Chỉ coi là vô hại khi KHÔNG có từ tục đi kèm trong cùng câu.
BANTER_RHETORICAL_PATTERN = re.compile(
    r'\b(mày|m4y|m\.y)\s+(điên|khùng|dở hơi|hâm)\s+(à|à\?|hả|thế)\b',
    re.IGNORECASE
)
EXPLICIT_PROFANITY_PATTERN = re.compile(
    r'\b(địt|đụ|đéo|cặc|lồn|buồi|súc vật|óc chó|đĩ|con chó|thằng chó|ngu súc vật)\b',
    re.IGNORECASE
)


def strip_leading_interjection(text: str) -> tuple:
    """Tách thán từ mở đầu câu ra khỏi phần còn lại. Trả về (phần còn lại, có tách hay không)."""
    match = LEADING_INTERJECTION_PATTERN.match(text)
    if match:
        remainder = text[match.end():].strip()
        return (remainder if remainder else text), True
    return text, False


def deep_score_text(raw_text: str) -> float:
    cleaned_text = preprocess_text(raw_text)

    # 0. TÁCH THÁN TỪ CẢM THÁN Ở ĐẦU CÂU (vd: "vãi nồi,", "chết tiệt,")
    # Nếu câu có thán từ mở đầu VÀ phần còn lại không chứa từ tục rõ ràng,
    # ta chỉ chấm điểm phần còn lại — thán từ chỉ là cảm xúc, không phải lời mắng.
    remainder_text, had_interjection = strip_leading_interjection(cleaned_text)
    if had_interjection and not EXPLICIT_PROFANITY_PATTERN.search(remainder_text):
        cleaned_text = remainder_text

    # 0b. CÂU HỎI TU TỪ THÂN MẬT ("mày điên à", "mày khùng à"...)
    # Nếu KHÔNG có từ tục nào khác trong câu, coi đây là cách nói đùa/phân trần,
    # không phải lời mắng — bỏ cụm này ra trước khi chấm điểm.
    if BANTER_RHETORICAL_PATTERN.search(cleaned_text) and not EXPLICIT_PROFANITY_PATTERN.search(cleaned_text):
        cleaned_text = BANTER_RHETORICAL_PATTERN.sub('', cleaned_text).strip()
        if not cleaned_text:
            return 0.0

    # 1. QUÉT TOÀN CỤC
    global_score = get_raw_model_score(cleaned_text)

    # 2. KIỂM TRA WHITELIST (Bảo vệ ngữ cảnh IT/Sinh viên)
    has_it_context = any(keyword in cleaned_text for keyword in IT_CONTEXT_WHITELIST)

    # Nếu câu có ngữ cảnh IT an toàn, ta "khoan hồng" giảm điểm gốc xuống một chút
    if has_it_context:
        global_score = global_score * 0.7  # Giảm 30% độ "nghi ngờ"

    if global_score < 0.20 or global_score > TOXIC_THRESHOLD:
        return global_score

    # 3. QUÉT CỤC BỘ (DEEP SCAN)
    phrases = re.split(r'[,.;?!]|\b(nhưng|mà|tuy nhiên|chứ|thì|còn)\b', cleaned_text)
    phrases = [p.strip() for p in phrases if p and len(p.strip()) > 3]

    max_local_score = global_score
    for phrase in phrases:
        local_score = get_raw_model_score(phrase)
        if local_score > max_local_score:
            max_local_score = local_score

    # 4. CHỐT ĐIỂM DỰA TRÊN NGỮ CẢNH
    if has_it_context:
        # Nếu có ngữ cảnh IT, phải có vế cực kỳ độc hại (>0.8) mới bị phạt
        return max_local_score if max_local_score > 0.8 else global_score
    else:
        # Ngữ cảnh bình thường, phạt nếu vế độc hại > 0.55
        return max_local_score if max_local_score > 0.55 else global_score


@app.post("/moderate")
async def moderate_text(request: ModerationRequest):
    raw_text = request.inputs
    print(f"\n📥 [PhoBERT] Nhận tin nhắn gốc: '{raw_text}'")

    # Gọi hàm quét kép
    toxic_score = deep_score_text(raw_text)

    print(f"🧠 [PhoBERT] Điểm cuối cùng: {toxic_score:.4f}")

    if toxic_score > TOXIC_THRESHOLD: 
        return [[{"label": "toxic", "score": float(toxic_score)}]]
    else:
        return [[{"label": "safe", "score": float(1.0 - toxic_score)}]]


def cleanup_old_evidence(days: int = EVIDENCE_RETENTION_DAYS):
    cutoff = datetime.now() - timedelta(days=days)
    for fname in os.listdir(EVIDENCE_DIR):
        fpath = os.path.join(EVIDENCE_DIR, fname)
        if os.path.isfile(fpath):
            if datetime.fromtimestamp(os.path.getmtime(fpath)) < cutoff:
                os.remove(fpath)


@app.post("/moderate-call")
async def moderate_call(audio: UploadFile = File(...), call_id: str = Form(None)):
    call_id = call_id or f"call_{uuid.uuid4().hex[:8]}"
    temp_path = os.path.join(TEMP_AUDIO_DIR, f"{call_id}_{audio.filename}")

    with open(temp_path, "wb") as f:
        shutil.copyfileobj(audio.file, f)
    print(f"\n📥 [Call {call_id}] Đã nhận audio...")

    try:
        result = asr_pipeline(temp_path)
        segments = []
        if "chunks" in result:
            for chunk in result["chunks"]:
                text = chunk["text"].strip()
                start, end = chunk.get("timestamp", (None, None))
                if text:
                    segments.append({"text": text, "start": start, "end": end})
        elif result.get("text", "").strip():
            segments.append({"text": result["text"].strip(), "start": 0, "end": None})

        full_audio = AudioSegment.from_file(temp_path)
        report_segments = []
        evidence_clips = []

        for idx, seg in enumerate(segments):
            # Gọi hàm quét kép cho từng đoạn hội thoại
            score = deep_score_text(seg["text"]) 
            is_toxic = score > TOXIC_THRESHOLD
            entry = {**seg, "toxic_score": round(score, 4), "is_toxic": is_toxic}

            if is_toxic and seg["start"] is not None and seg["end"] is not None:
                start_ms = max(0, int(seg["start"] * 1000) - EVIDENCE_CLIP_PADDING_MS)
                end_ms = min(len(full_audio), int(seg["end"] * 1000) + EVIDENCE_CLIP_PADDING_MS)
                clip = full_audio[start_ms:end_ms]

                clip_name = f"{call_id}_seg{idx}.wav"
                clip_path = os.path.join(EVIDENCE_DIR, clip_name)
                clip.export(clip_path, format="wav")

                entry["evidence_clip"] = clip_path
                evidence_clips.append(clip_path)
                print(f"  🔴 TOXIC ({score:.4f}): \"{seg['text']}\" -> Lưu bằng chứng: {clip_name}")
            else:
                print(f"  🟢 safe  ({score:.4f}): \"{seg['text']}\"")

            report_segments.append(entry)

        toxic_count = sum(1 for s in report_segments if s["is_toxic"])
        report = {
            "call_id": call_id,
            "processed_at": datetime.now().isoformat(),
            "total_segments": len(report_segments),
            "toxic_count": toxic_count,
            "segments": report_segments,
            "evidence_clips": evidence_clips,
        }
        report_path = os.path.join(REPORTS_DIR, f"{call_id}.json")
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        return report

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        cleanup_old_evidence()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)