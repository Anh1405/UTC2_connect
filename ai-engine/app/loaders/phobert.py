"""Nạp PhoBERT (kiểm duyệt văn bản vòng ngoài). Model được nạp ngay khi import."""
import os

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from app.config import MODEL_CHECKPOINT_PATH

print("⏳ [PhoBERT] Đang tải bộ từ điển...")
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

print("⏳ [PhoBERT] Khởi tạo mô hình phân loại...")
model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

if MODEL_CHECKPOINT_PATH and os.path.exists(MODEL_CHECKPOINT_PATH):
    try:
        print(f"📦 [PhoBERT] Đang nạp checkpoint từ: {MODEL_CHECKPOINT_PATH}")
        checkpoint = torch.load(MODEL_CHECKPOINT_PATH, map_location="cpu")
        
        if isinstance(checkpoint, dict):
            if "state_dict" in checkpoint and isinstance(checkpoint["state_dict"], dict):
                checkpoint = checkpoint["state_dict"]
            elif "model_state_dict" in checkpoint and isinstance(checkpoint["model_state_dict"], dict):
                checkpoint = checkpoint["model_state_dict"]
                
        cleaned_state_dict = {}
        for key, value in checkpoint.items():
            new_key = key[7:] if key.startswith("module.") else key
            cleaned_state_dict[new_key] = value
            
        model.load_state_dict(cleaned_state_dict, strict=False)
        print("✅ [PhoBERT] Nạp checkpoint thành công!")
    except Exception as e:
        print(f"⚠️ [PhoBERT] Lỗi nạp checkpoint: {e} — Sử dụng weights gốc.")
else:
    print(f"⚠️ [PhoBERT] Không tìm thấy checkpoint tại {MODEL_CHECKPOINT_PATH}.")

model.to(device)
model.eval()
