"""Bounded request shapes; do not accept arbitrary commands or script content."""
from pydantic import BaseModel, Field

class TransferAnswer(BaseModel):
    action_id: str = Field(min_length=1, max_length=64)
    evidence_ids: list[str] = Field(max_length=8)
    prerequisites: list[str] = Field(max_length=10)
    reasoning: str = Field(min_length=10, max_length=1000)

class RetrievalQuestion(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    query: str = Field(min_length=2, max_length=500)
    max_lessons: int = Field(default=3, ge=1, le=10)
    max_sources: int = Field(default=3, ge=1, le=8)
