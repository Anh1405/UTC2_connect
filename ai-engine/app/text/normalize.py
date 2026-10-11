"""Chuẩn hóa văn bản: bỏ dấu, teen-code, leetspeak, giải mã nói lái."""
import re
import unicodedata
from typing import Optional, Tuple

from app.text.patterns import EXPLICIT_PROFANITY_PATTERN

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
