"""Bảo mật: xác thực API key + chống path traversal."""
import uuid
from typing import Optional

from fastapi import Header, HTTPException

from app.config import API_KEY, SAFE_ID_PATTERN

def sanitize_id(raw_id: str, fallback_prefix: str = "id") -> str:
    """Chặn path traversal: chỉ giữ lại ký tự an toàn."""
    if raw_id and SAFE_ID_PATTERN.match(raw_id) and ".." not in raw_id:
        return raw_id
    return f"{fallback_prefix}_{uuid.uuid4().hex[:8]}"

def verify_api_key(x_api_key: Optional[str] = Header(None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="API key không hợp lệ hoặc thiếu.")
