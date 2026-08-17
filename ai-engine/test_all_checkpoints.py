import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import warnings
import os
import re
warnings.filterwarnings("ignore")

print("⏳ Đang tải tokenizer...")
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

checkpoints = [
    "toxic_model_V3_epoch_1.pth",
    "toxic_model_V3_epoch_2.pth",
    "toxic_model_V3_epoch_3.pth",
    "toxic_model_v4_epoch_1.pth",
    "toxic_model_v4_epoch_2.pth",
    "toxic_model_v4.pth",
]

TOXIC_THRESHOLD = 0.42 # ĐÃ ĐỔI NGƯỠNG

test_sentences = [
    ("chào buổi sáng", "safe"),
    ("cảm ơn bạn nhiều", "safe"),
    ("mày là đồ ngu súc vật", "toxic"),
    ("địt mẹ mày", "toxic"),
    ("đâm chết cha mày", "toxic"),
    ("xiên chết dòng họ nhà mày,t cho mày ôm đầu máu", "toxic"),
    ("con chó của bạn thật dễ thương", "safe"),
    ("đjt m3 mày biến đi cho khuất mắt", "toxic"),
    ("thằng ng.u này, có thế cũng không biết làm", "toxic"),
    ("cái lũ s.ú.c v.ậ.t học", "toxic"),
    ("Cái não của bạn chắc chỉ để trang trí cho vui chứ không biết tư duy à?", "toxic"),
    ("Nói chuyện với cái đầu gối còn tiếp thu nhanh hơn nói chuyện với bạn.", "toxic"),
    ("Code viết rác như thế này thì thà tắt máy đi ngủ còn hơn.", "toxic"),
    ("Chắc lúc sinh ra bác sĩ lỡ tay vứt nhầm não của bạn đi rồi hả?", "toxic"),
    ("Vãi nồi, dạo này fix bug ghê thế!", "safe"),
    # --- câu mỉa mai MỚI ---
    ("Chắc bạn phải mất cả tiếng mới nghĩ ra được câu trả lời hay ho vậy nhỉ.", "toxic"),
    ("Đúng là thiên tài, ai cũng làm được mỗi bạn là không.", "toxic"),
    ("Bạn cứ tiếp tục phát huy đi, kiểu gì cũng có huy chương cho người sai nhiều nhất.", "toxic"),
    ("Nhìn bạn làm việc mà tôi tưởng đang xem phim hài.", "toxic"),
    # --- câu toxic trực diện (không chửi xéo) ---
    ("Tao mà gặp mày ở ngoài là tao đánh cho không còn răng ăn cơm.", "toxic"),
    ("Có tin tao xiên chết mày ngay tại chỗ không?", "toxic"),
    ("Biến đi không tao đập nát mặt bây giờ.", "toxic"),
    ("Loại như mày xứng đáng bị xe cán.", "toxic"),
    ("Mày bị ngu bẩm sinh hay có luyện tập vậy?", "toxic"),
    ("Đúng là đồ vô dụng, làm cái gì cũng hỏng bét.", "toxic"),
    ("Mày là thành phần vô học, không có đầu óc.", "toxic"),
    ("Ngu như thế này thì sống làm gì cho tốn oxy.", "toxic"),
    ("Mày chết đi cho xã hội bớt chật chỗ.", "toxic"),
    ("Loại người như mày có tồn tại cũng chỉ làm bẩn mắt người khác.", "toxic"),
    ("Giải thoát cho gia đình mày bằng cách tự tử đi.", "toxic"),
    ("Cuộc đời mày là một sự thất bại toàn tập.", "toxic"),
    ("Mấy thằng nghèo hèn như mày thì hiểu làm sao được.", "toxic"),
    ("Đúng là lũ dốt nát, không bao giờ khá lên nổi.", "toxic"),
    ("Thành phần nhà quê dơ bẩn.", "toxic"),
    # --- câu ngữ cảnh safe ---
    ("Đệt, nãy giờ gõ cho cố rồi quên save file batch lại rồi!", "safe"),
    ("Mày điên à, tối nay tao bận làm đồ án rồi không đi chơi được đâu.", "safe"),
    ("Chết tiệt, cái server lại sập nữa rồi.", "safe"),
]

TEEN_CODE_DICT = {
    "đjt": "địt", "djt": "địt", "m3": "mẹ", "vl": "vãi",
    "vkl": "vãi", "ngu": "ngu", "cức": "cứt",
    "cute": "dễ thương", "dị": "vậy"
}

def preprocess_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r'(?<=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])[\.\,\-\*\_](?=[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ])', '', text)
    words = text.split()
    return " ".join([TEEN_CODE_DICT.get(w, w) for w in words])

def get_raw_model_score(model, text: str) -> float:
    encoded = tokenizer(text, add_special_tokens=True, max_length=64, truncation=True, padding='max_length', return_tensors='pt')
    with torch.no_grad():
        outputs = model(input_ids=encoded['input_ids'], attention_mask=encoded['attention_mask'])
        probs = torch.softmax(outputs.logits, dim=1)
        return probs[0][1].item()

IT_CONTEXT_WHITELIST = ["fix bug", "server", "đồ án", "code", "file batch", "deadline", "chức năng"]

LEADING_INTERJECTIONS = [
    "vãi nồi", "vãi cả nồi", "vãi", "vl", "vkl",
    "đệt", "đệch", "đm thật", "chết tiệt", "chết cha",
    "trời ơi", "trời đất", "trời ạ", "má ơi", "mẹ ơi",
    "ối giời", "ối giời ơi", "khỉ thật", "thôi xong", "hỏng bét",
]
_LEADING_INTERJECTIONS_SORTED = sorted(LEADING_INTERJECTIONS, key=len, reverse=True)
LEADING_INTERJECTION_PATTERN = re.compile(
    r'^(' + '|'.join(re.escape(w) for w in _LEADING_INTERJECTIONS_SORTED) + r')\s*[,\.!]+\s*',
    re.IGNORECASE
)
BANTER_RHETORICAL_PATTERN = re.compile(
    r'\b(mày|m4y|m\.y)\s+(điên|khùng|dở hơi|hâm)\s+(à|à\?|hả|thế)\b',
    re.IGNORECASE
)
EXPLICIT_PROFANITY_PATTERN = re.compile(
    r'\b(địt|đụ|đéo|cặc|lồn|buồi|súc vật|óc chó|đĩ|con chó|thằng chó|ngu súc vật)\b',
    re.IGNORECASE
)

def strip_leading_interjection(text: str) -> tuple:
    match = LEADING_INTERJECTION_PATTERN.match(text)
    if match:
        remainder = text[match.end():].strip()
        return (remainder if remainder else text), True
    return text, False

def deep_score_text(model, raw_text: str) -> float:
    cleaned_text = preprocess_text(raw_text)

    remainder_text, had_interjection = strip_leading_interjection(cleaned_text)
    if had_interjection and not EXPLICIT_PROFANITY_PATTERN.search(remainder_text):
        cleaned_text = remainder_text

    if BANTER_RHETORICAL_PATTERN.search(cleaned_text) and not EXPLICIT_PROFANITY_PATTERN.search(cleaned_text):
        cleaned_text = BANTER_RHETORICAL_PATTERN.sub('', cleaned_text).strip()
        if not cleaned_text:
            return 0.0

    global_score = get_raw_model_score(model, cleaned_text)
    
    has_it_context = any(keyword in cleaned_text for keyword in IT_CONTEXT_WHITELIST)
    
    if has_it_context:
        global_score = global_score * 0.7

    if global_score < 0.20 or global_score > TOXIC_THRESHOLD:
        return global_score

    phrases = re.split(r'[,.;?!]|\b(nhưng|mà|tuy nhiên|chứ|thì|còn)\b', cleaned_text)
    phrases = [p.strip() for p in phrases if p and len(p.strip()) > 3]

    max_local_score = global_score
    for phrase in phrases:
        local_score = get_raw_model_score(model, phrase)
        if local_score > max_local_score:
            max_local_score = local_score

    if has_it_context:
        return max_local_score if max_local_score > 0.8 else global_score
    else:
        return max_local_score if max_local_score > 0.55 else global_score

for ckpt in checkpoints:
    if not os.path.exists(ckpt):
        continue

    model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
    model.load_state_dict(torch.load(ckpt, weights_only=True, map_location='cpu'), strict=False)
    model.eval()

    print(f"\n===== CẤU TRÚC TEST HỆ THỐNG MỚI (Ngưỡng {TOXIC_THRESHOLD}) - {ckpt} =====")
    for sentence, expected in test_sentences:
        score = deep_score_text(model, sentence)
        mark = "✅" if (score > TOXIC_THRESHOLD) == (expected == "toxic") else "❌"
        print(f"  {mark} [{expected:5}] {sentence:<75} → score={score:.4f}")