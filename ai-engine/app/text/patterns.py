"""Dữ liệu thuần: regex + danh sách từ cho bộ lọc quy tắc (không chứa logic)."""
import re

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
