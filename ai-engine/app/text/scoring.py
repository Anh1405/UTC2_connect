"""Chấm điểm độc hại: luật vòng ngoài -> PhoBERT -> Qwen (Colab) giải oan."""
from typing import Tuple

import requests
import torch

from app.config import COLAB_LLM_URL, TOXIC_THRESHOLD
from app.loaders.phobert import device, model, tokenizer
from app.text.normalize import denoi_lai, preprocess_text_basic
from app.text.patterns import *  # noqa: F401,F403  (module chỉ chứa hằng số)
from app.text.sarcasm import check_sarcasm_signature, has_intellect_mockery

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
