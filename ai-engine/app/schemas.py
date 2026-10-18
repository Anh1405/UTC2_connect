"""Schema request/response (Pydantic)."""
from pydantic import BaseModel, Field

from app.config import MAX_TEXT_LENGTH

class ModerationRequest(BaseModel):
    inputs: str = Field(..., max_length=MAX_TEXT_LENGTH)
