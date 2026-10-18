"""Tạo FastAPI app, gắn CORS và các router."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import API_VERSION

# Thứ tự import bên dưới = thứ tự nạp model (PhoBERT -> DeepFilter -> PhoWhisper FT -> ZipFormer -> VAD).
from app.loaders import phobert, deepfilter  # noqa: F401
from app.asr import finetuned, zipformer, vad  # noqa: F401

from app.routers import audio_moderation, health, reports, text_moderation

app = FastAPI(
    title="UTC2 Connect - Safe Communication Moderation API",
    description="Hệ thống kiểm duyệt văn bản và cuộc gọi đa phương thức sử dụng PhoBERT & Whisper.",
    version=API_VERSION
)

_cors_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "")
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=bool(_cors_origins_env),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(text_moderation.router)
app.include_router(audio_moderation.router)
app.include_router(reports.router)
