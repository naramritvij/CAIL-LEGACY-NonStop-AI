"""Request types for the expert workflow."""
from pydantic import BaseModel, Field
from typing import Literal


class LessonCreate(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    author_alias: str = Field(min_length=2, max_length=80)
    symptoms: str = Field(min_length=10, max_length=2000)
    reasoning: str = Field(min_length=20, max_length=4000)
    rejected_action: str = Field(min_length=3, max_length=500)
    prerequisites: list[str] = Field(min_length=1, max_length=15)
    evidence_ids: list[str] = Field(min_length=1, max_length=25)
    previous_lesson_id: str | None = None


class ReviewRequest(BaseModel):
    decision: Literal['approved', 'rejected']
    notes: str = Field(min_length=10, max_length=1000)


class ReplayRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    action_id: str = Field(min_length=1, max_length=64)
