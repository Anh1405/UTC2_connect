"""POST /moderate  (kiểm duyệt văn bản)"""
from fastapi import APIRouter, Depends

from app.config import TOXIC_THRESHOLD
from app.schemas import ModerationRequest
from app.security import verify_api_key
from app.text.scoring import deep_score_text

router = APIRouter()


@router.post("/moderate")
def moderate_text(request: ModerationRequest, _auth=Depends(verify_api_key)):
    raw_text = request.inputs
    toxic_score = deep_score_text(raw_text)

    if toxic_score > TOXIC_THRESHOLD:
        return [[{"label": "toxic", "score": float(toxic_score)}]]
    else:
        return [[{"label": "safe", "score": float(1.0 - toxic_score)}]]
