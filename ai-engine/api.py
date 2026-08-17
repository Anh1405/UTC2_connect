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
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks

warnings.filterwarnings("ignore")

# ====================== CẤU HÌNH CHECKPOINT ======================
MODEL_CHECKPOINT_PATH = os.environ.get("MODEL_CHECKPOINT_PATH", "toxic_model_v4.pth")
TOXIC_THRESHOLD = float(os.environ.get("TOXIC_THRESHOLD", "0.42"))
# ==================================================================

# 1. TẢI BỘ TỪ ĐIỂN VÀ MÔ HÌNH PHO-BERT
print("⏳ Đang tải bộ từ điển PhoBERT...")
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

print("⏳ Đang tải lõi AI PhoBERT...")
model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
print(f"📦 Checkpoint đang nạp: {MODEL_CHECKPOINT_PATH}")
model.load_state_dict(torch.load(MODEL_CHECKPOINT_PATH, weights_only=True, map_location="cpu"), strict=False)
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
    "cute": "dễ thương",
    "dị": "vậy",
    "m4y": "mày",
    "t4o": "tao",
    "dm": "đm",
    "đmm": "đm",
    "clm": "clm",
    "t" : "tao",
    "m" : "mày",
}

def preprocess_text(text: str) -> str:
    """Xóa dấu câu tàng hình, dịch từ lóng và loại emoji tích cực"""
    text = text.lower()
    text = re.sub(r'([a-zđ])\1{2,}', r'\1', text)
    # Xóa emoji cười / tích cực
    text = re.sub(r"[😂🤣😭😍🔥💯👍👏❤️✨🎉]+", " ", text)

    # Xóa ký tự nhiễu giữa các chữ cái
    text = re.sub(
        r"(?<=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])[\.\,\-\*\_](?=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])",
        "",
        text,
    )

    words = text.split()
    normalized_words = [TEEN_CODE_DICT.get(w, w) for w in words]
    return " ".join(normalized_words).strip()


# ====================== THÁN TỪ / CÂU CẢM THÁN ======================
LEADING_INTERJECTIONS = [
    "vãi nồi", "vãi cả nồi", "vãi linh hồn", "vãi cả chưởng", "vãi đái", "vãi",
    "vl", "vkl", "đệt", "đệch", "đm thật", "đm", "đmm", "dm",
    "chết tiệt", "chết cha", "trời ơi", "trời đất ơi", "trời đất", "trời ạ",
    "má ơi", "mẹ ơi", "mẹ kiếp", "ối giời", "ối giời ơi",
    "khỉ thật", "thôi xong", "hỏng bét", "hết hồn", "xỉu luôn", "sập luôn", "toang rồi",
    "clm", "cl", "cc", "cmn",
]
_LEADING_INTERJECTIONS_SORTED = sorted(LEADING_INTERJECTIONS, key=len, reverse=True)
LEADING_INTERJECTION_PATTERN = re.compile(
    r"^(" + "|".join(re.escape(w) for w in _LEADING_INTERJECTIONS_SORTED) + r")\b[,\.!]*\s+",
    re.IGNORECASE,
)
PLAYFUL_DIEN_PATTERN = re.compile(
    r'\b(vui|buồn|yêu|thích|mê|cuồng|phát|bị|thấy|cảm thấy)?\s*(điên|khùng|ngáo|hâm)\s*(rồi|luôn|thật|quá|vậy|thế|á|ạ|đi|rồ)?\b',
    re.IGNORECASE
)
BANTER_RHETORICAL_PATTERN = re.compile(
    r"\b(mày|m4y|m\.y|tao|t4o)\s+(điên|khùng|dở hơi|hâm|ngáo)\s+(à|à\?|hả|thế|hả\?)\b",
    re.IGNORECASE,
)
INFORMAL_PRONOUN_PATTERN = re.compile(
    r"\b(tao|mày|t4o|m4y|tụi tao|tụi mày)\b", 
    re.IGNORECASE
)
EXPLICIT_PROFANITY_PATTERN = re.compile(
    r"\b(địt|đụ|đéo|cặc|lồn|buồi|súc vật|óc chó|đĩ|con chó|thằng chó|ngu súc vật|địt mẹ|đụ mẹ)\b",
    re.IGNORECASE,
)
VIOLENT_THREAT_PATTERN = re.compile(
    r"\b(xiên|chém|giết|đập|đấm|tát|bóp cổ|mổ bụng|chết cụ|chết bà|chết mẹ|tán|cắt cổ)\b",
    re.IGNORECASE,
)
SAFE_IDIOMS = [
    "chém gió", "xiên que", "thịt xiên", "chém hoa quả", "chém trái cây",
    "đập hộp", "đập muỗi", "đấm bóp", "tát ao", "tát nước", 
    "tán gái", "tán dóc", "cá viên chiên", "bóp bóng"
]
YOUTH_INTENSIFIER_PATTERN = re.compile(
    r"\b(ác|ghê|dữ|gớm|kinh|đỉnh|xịn|pro|ngon|xỉu|rợn)\s*(vậy|quá|thế|xỉu|rợn|dằn|luôn|thật|đi|á|ạ)?\b",
    re.IGNORECASE,
)

# ====================== WHITELIST NGỮ CẢNH ======================
IT_CONTEXT_WHITELIST = [
    "fix bug", "server", "đồ án", "code", "file batch", "deadline",
    "chức năng", "deploy", "commit", "pull request", "bug", "error",
]

FRIENDLY_BANTER_WHITELIST = [
    "đùa thôi", "nói chơi", "mình đùa", "tao đùa", "mày đùa", "tui đùa",
    "thân mật", "bạn bè", "mấy đứa", "bọn mình", "tụi tao", "tụi mình",
    "haha", "hehe", "kk", "ha ha", "cười", "đùa giỡn", "nói đùa",
    "bạn thân", "anh em", "chị em",
]

# ====================== CÂU/TỪ QUÁ NGẮN ======================
SHORT_TEXT_MAX_WORDS = 3

STANDALONE_INSULT_WORDS = {
    "ngu", "óc chó", "súc vật", "đồ chó", "khốn nạn", "chó", "đĩ",
    "dốt", "óc lợn", "đần", "rồ", "vô học",
    "địt", "đụ", "cặc", "lồn", "buồi"
}

def is_short_and_safe(cleaned_text: str) -> bool:
    words = cleaned_text.split()
    if len(words) > SHORT_TEXT_MAX_WORDS:
        return False
    if EXPLICIT_PROFANITY_PATTERN.search(cleaned_text):
        return False
    if any(w in STANDALONE_INSULT_WORDS for w in words):
        return False
    if cleaned_text.strip() in STANDALONE_INSULT_WORDS:
        return False
    return True


def strip_leading_interjection(text: str) -> tuple:
    match = LEADING_INTERJECTION_PATTERN.match(text)
    if match:
        remainder = text[match.end():].strip()
        return (remainder if remainder else text), True
    return text, False


# ====================== CẤU HÌNH CHO KIỂM DUYỆT GIỌNG NÓI ======================
PHOWHISPER_MODEL = "vinai/PhoWhisper-medium"
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


# ====================== HÀM CHẤM ĐIỂM ======================
def get_raw_model_score(text: str) -> float:
    encoded_dict = tokenizer(
        text,
        add_special_tokens=True,
        max_length=256,
        truncation=True,
        padding="max_length",
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(
            input_ids=encoded_dict["input_ids"],
            attention_mask=encoded_dict["attention_mask"],
        )
        probabilities = torch.softmax(outputs.logits, dim=1)
        return probabilities[0][1].item()


def deep_score_text(raw_text: str) -> float:
    cleaned_text = preprocess_text(raw_text)

    # ==========================================
    # 0. HARD-BLOCK (THẺ ĐỎ TRỰC TIẾP)
    
    # Tạo bản nháp để quét lỗi (xóa các cụm từ an toàn để tránh quét nhầm)
    text_for_hard_block = cleaned_text
    for idiom in SAFE_IDIOMS:
        # Thay thế bằng khoảng trắng để tách rời các từ còn lại
        text_for_hard_block = text_for_hard_block.replace(idiom, " ")

    # Dò từ cấm trên bản nháp (thay vì cleaned_text gốc)
    has_profanity = EXPLICIT_PROFANITY_PATTERN.search(text_for_hard_block)
    has_threat = VIOLENT_THREAT_PATTERN.search(text_for_hard_block)
    
    words_for_block = text_for_hard_block.split()
    has_standalone_insult = any(w in STANDALONE_INSULT_WORDS for w in words_for_block) or (text_for_hard_block.strip() in STANDALONE_INSULT_WORDS)
    
    if has_profanity or has_threat or has_standalone_insult:
        return 0.99
    # ==========================================

    # --- TỪ ĐÂY TRỞ XUỐNG DÙNG LẠI CLEANED_TEXT GỐC ---
    # 1. Câu quá ngắn và an toàn
    if is_short_and_safe(cleaned_text):
        return 0.02

    # 2. Tiếng lóng khen / ngạc nhiên
    if YOUTH_INTENSIFIER_PATTERN.search(cleaned_text):
        temp_text = YOUTH_INTENSIFIER_PATTERN.sub("", cleaned_text).strip()
        if not temp_text or is_short_and_safe(temp_text):
            return 0.02

    # 2.5. "điên / khùng / ngáo" theo nghĩa vui vẻ
    if PLAYFUL_DIEN_PATTERN.search(cleaned_text):
        temp_text = PLAYFUL_DIEN_PATTERN.sub("", cleaned_text).strip()
        if not temp_text or is_short_and_safe(temp_text):
            return 0.03

    # 3. Tách thán từ đầu câu
    remainder_text, had_interjection = strip_leading_interjection(cleaned_text)
    if had_interjection:
        cleaned_text = remainder_text

    # 4. Câu hỏi tu từ thân mật ("mày điên à"...)
    if BANTER_RHETORICAL_PATTERN.search(cleaned_text):
        temp_text = BANTER_RHETORICAL_PATTERN.sub("", cleaned_text).strip()
        if not temp_text:
            return 0.0
            
    # 4.5. Trung hòa bias "Tao / Mày" (Giờ đã an toàn vì các câu độc hại bị chặn ở bước 0)
    is_informal = INFORMAL_PRONOUN_PATTERN.search(cleaned_text)

    if is_informal:
        words = cleaned_text.split()
        if len(words) <= 7:
            return 0.05
            
    # 5. Kiểm tra ngữ cảnh
    has_it_context = any(kw in cleaned_text for kw in IT_CONTEXT_WHITELIST)
    has_friendly_context = any(kw in cleaned_text for kw in FRIENDLY_BANTER_WHITELIST)
    
    # Nếu câu dài có "tao/mày" (và đã qua được bước chặn từ cấm), tự động gắn cờ thân thiện
    if is_informal:
        has_friendly_context = True
        
    # 6. Chấm điểm toàn cục
    global_score = get_raw_model_score(cleaned_text)

    if has_friendly_context:
        global_score *= 0.50
    elif has_it_context:
        global_score *= 0.70

    if global_score < 0.18 or global_score > TOXIC_THRESHOLD:
        return global_score

    # 7. Deep scan (chỉ khi vùng xám + không có ngữ cảnh bảo vệ)
    if has_friendly_context or has_it_context:
        return global_score

    phrases = re.split(r"[,.;?!]|\b(nhưng|mà|tuy nhiên|chứ|thì|còn)\b", cleaned_text)
    phrases = [p.strip() for p in phrases if p and len(p.strip()) > 3]

    max_local_score = global_score
    for phrase in phrases:
        local_score = get_raw_model_score(phrase)
        if local_score > max_local_score:
            max_local_score = local_score

    if max_local_score > 0.78:
        return max_local_score

    return global_score

# ====================== API ======================
app = FastAPI(title="UTC2 Connect - PhoBERT Moderation API")


class ModerationRequest(BaseModel):
    inputs: str


@app.post("/moderate")
def moderate_text(request: ModerationRequest):
    raw_text = request.inputs
    print(f"\n📥 [PhoBERT] Nhận tin nhắn gốc: '{raw_text}'")

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
def moderate_call(audio: UploadFile = File(...), call_id: str = Form(None)):
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
        # Chuyển cleanup xuống chạy ngầm
        background_tasks.add_task(cleanup_old_evidence)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)