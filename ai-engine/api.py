"""Entry point. Chạy:  python api.py   hoặc   uvicorn api:app --port 8000

Toàn bộ logic nằm trong package app/ (xem app/server.py).
Các import bên dưới giữ tương thích với script cũ (debug_run.py, ...) đang `from api import ...`.
"""
import os

import uvicorn

from app.config import API_KEY
from app.server import app  # noqa: F401
from app.text.scoring import deep_score_text  # noqa: F401
from app.text.normalize import preprocess_text_basic  # noqa: F401
from app.asr.hybrid import run_hybrid_asr  # noqa: F401

if __name__ == "__main__":
    if not API_KEY:
        print("⚠️ [BẢO MẬT] Chưa đặt MODERATION_API_KEY — mọi endpoint đang mở công khai. "
              "Hãy đặt biến này trước khi cho người dùng thật dùng thử.")
    uvicorn.run(app, host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8000")))
