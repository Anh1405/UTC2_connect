import random
import csv

OUT = "indirect_insults_seed.csv"
N = 500

templates = [
    "Ba mẹ bạn khi sinh ra quên gắn não cho bạn.",
    "Có vẻ lúc sinh ra ai đó quên dạy bạn phép lịch sự.",
    "Ôi, đầu bạn sao trống rỗng thế?",
    "Đúng là không có não mà vẫn cứ nghĩ mình đúng.",
    "Bạn chắc lúc đẻ ra bị thiếu não rồi.",
    "Thiếu não mà vẫn tự tin thế kia thật là...",
    "Nhìn hành động của bạn mới biết giáo dục không đủ.",
    "Chắc là bộ não bạn đang nghỉ phép.",
    "Bạn giống như được bán kèm với lỗi 'não' vậy.",
    "Đừng lo, não bạn có thể tìm thấy ở tiệm sửa chữa."
]

synonyms_subject = ["ba mẹ bạn", "mày", "bạn", "anh/ chị", "cô/ chú"]
synonyms_action = ["quên gắn", "thiếu", "không cho", "bỏ quên"]
synonyms_object = ["não", "trí tuệ", "ý thức", "sự thông minh", "khả năng suy nghĩ"]
templates_extra = [
    "{subj} {act} {obj} khi sinh ra.",
    "Nhìn {subj} như thể {obj} bị {act}.",
    "Có vẻ {subj} đã bị {act} {obj}.",
    "Nhìn mặt là biết {subj} thiếu {obj}.",
    "Xin lỗi, cái {obj} của {subj} đang bị lỗi."
]

rows = []
# seed from fixed templates first
for t in templates:
    rows.append([t, 1, "indirect_insult"])

# generate variations
while len(rows) < N:
    subj = random.choice(synonyms_subject)
    act = random.choice(synonyms_action)
    obj = random.choice(synonyms_object)
    temp = random.choice(templates_extra)
    text = temp.format(subj=subj, act=act, obj=obj)
    # some punctuation/variations
    if random.random() < 0.3:
        text = text.replace(" ", " ", 1)  # trivial; keep as is
    if random.random() < 0.2:
        text = text + random.choice([" 😂"," 😅"," ..."])
    rows.append([text, 1, "indirect_insult"])

# dedupe and save exactly N
seen = set()
unique = []
for r in rows:
    if r[0] not in seen:
        unique.append(r)
        seen.add(r[0])
    if len(unique) >= N:
        break

with open(OUT, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["text","label","type"])
    writer.writerows(unique)

print(f"Saved {len(unique)} seed examples to {OUT}")