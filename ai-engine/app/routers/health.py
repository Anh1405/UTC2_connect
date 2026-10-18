"""GET /health"""
import os

import torch
from fastapi import APIRouter

from app.asr.finetuned import ft_pipe
from app.asr.zipformer import asr_recognizer
from app.config import API_VERSION, ASR_MODEL_DIR, TOXIC_THRESHOLD
from app.loaders.phobert import device

router = APIRouter()


@router.get("/health")
def health_check():
    return {
        "status": "healthy",
        "device": str(device),
        "cuda_available": torch.cuda.is_available(),
        "toxic_threshold": TOXIC_THRESHOLD,
        "asr_primary": os.path.basename(ASR_MODEL_DIR),
        "asr_verifier": "PhoWhisper fine-tune" if ft_pipe is not None else None,
        "zipformer_ready": asr_recognizer is not None,
        "vitosa_ready": ft_pipe is not None,
        "version": API_VERSION,
    }
