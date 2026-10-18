"""Hàm hỗ trợ cho hybrid ASR: phát hiện từ tục, lặp từ, transcript bất thường, độ đồng thuận."""
import difflib
import re
import zlib
from typing import Optional

from app.config import SOUNDS_LIKE_TOXIC_THRESHOLD
from app.text.normalize import remove_accents

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

def asr_agreement(a: str, b: str) -> float:
    sa, sb = _skeleton(a or ""), _skeleton(b or "")
    if not sa or not sb:
        return 0.0
    return difflib.SequenceMatcher(None, sa, sb).ratio()
