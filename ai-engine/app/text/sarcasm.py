"""Phát hiện dấu hiệu mỉa mai / châm biếm (rule-based)."""
import re

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
