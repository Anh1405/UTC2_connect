"""Nạp DeepFilterNet (khử tạp âm). Model được nạp ngay khi import."""
from df.enhance import enhance, init_df, load_audio, save_audio

print("⏳ [DeepFilter] Đang tải mô hình khử tạp âm & cô lập giọng nói...")
try:
    df_model, df_state, _ = init_df()
    print("✅ [DeepFilter] Nạp mô hình khử nhiễu thành công!")
except Exception as e:
    print(f"⚠️ [DeepFilter] Lỗi khởi tạo: {e}")
    df_model, df_state = None, None

def enhance_wav(src_path: str, dst_path: str, sr: int = 16000) -> None:
    """Khử nhiễu file wav src_path -> dst_path. Ném exception nếu lỗi (nơi gọi tự xử lý)."""
    df_audio, _ = load_audio(src_path, sr=sr)
    enhanced = enhance(df_model, df_state, df_audio)
    save_audio(dst_path, enhanced, sr)
