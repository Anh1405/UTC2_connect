import pandas as pd

print("⏳ Đang đọc file CSV gốc...")
# Đọc file gốc (nếu bị lỗi encoding, bạn có thể thêm tham số encoding='utf-8')
df_main = pd.read_csv("vihate_dataset.csv") 

print("⏳ Đang đọc file Excel bổ sung...")
# Đọc file Excel chứa các câu chửi xéo và đùa giỡn
df_extra = pd.read_excel("bosung_vihate_dataset.xlsx")

print("⏳ Đang tiến hành gộp dữ liệu...")
# Nối file mới vào cuối file cũ
df_merged = pd.concat([df_main, df_extra], ignore_index=True)

# Trộn đều (shuffle) dữ liệu để các câu mới không bị dồn hết xuống cuối
df_merged = df_merged.sample(frac=1).reset_index(drop=True)

print("⏳ Đang lưu ra file mới...")
# Xuất ra file CSV mới để an toàn, không ghi đè file cũ ngay
df_merged.to_csv("vihate_dataset_v2.csv", index=False, encoding='utf-8')

print(f"✅ Gộp thành công! Tổng số dòng hiện tại: {len(df_merged):,}")