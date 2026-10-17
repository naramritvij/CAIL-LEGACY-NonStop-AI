"""Bounded API types for human-submitted and reviewed local document excerpts."""
from typing import Literal
from pydantic import BaseModel, Field

class CorpusIngest(BaseModel):
    title: str = Field(min_length=5,max_length=160)
    source_url: str = Field(min_length=30,max_length=1000)
    release: str = Field(min_length=3,max_length=40,pattern=r'^[A-Za-z0-9_. -]+$')
    section: str = Field(min_length=3,max_length=120)
    content: str = Field(min_length=80,max_length=12000)
    acknowledged_authorization: bool

class CorpusReview(BaseModel):
    decision: Literal['approved','rejected']
    notes: str = Field(min_length=10,max_length=700)

class CorpusSearch(BaseModel):
    query: str = Field(min_length=3,max_length=350)
    release: str = Field(min_length=3,max_length=40)
    limit: int = Field(default=4,ge=1,le=8)