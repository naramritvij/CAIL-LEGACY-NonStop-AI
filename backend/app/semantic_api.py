"""Graph knowledge workflows, using the workspace's existing identity/review."""
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from .workspace_identity import principal
from . import semantic_graph as knowledge, workspace_store as store

router = APIRouter()


class CitationLink(BaseModel):
    citation_id: str = Field(min_length=1, max_length=100)
    relation: Literal['cites', 'supports', 'contradicts'] = 'cites'


class ExpertNote(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=20, max_length=20000)
    topic: str = Field(default='Expert guidance', min_length=1, max_length=60)
    category: Literal['guidance', 'procedure', 'incident_pattern', 'warning'] = 'guidance'
    concept_ids: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(min_length=1, max_length=12)
    citations: list[CitationLink] = Field(min_length=1, max_length=12)
    target_node_id: str | None = Field(default=None, max_length=300)
    supersedes_document_id: str | None = Field(default=None, max_length=100)
    sign_as_current_user: Literal[True]


class LearningProfile(BaseModel):
    role: Literal['mentor', 'learner', 'contributor']
    share_activity: bool = False


class StartCheck(BaseModel):
    document_id: str = Field(min_length=1, max_length=100)
    mode: Literal['reference_recall', 'explanation'] = 'reference_recall'


class CheckAnswer(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)


class EditionLink(BaseModel):
    newer_id: str = Field(min_length=1, max_length=100)
    previous_id: str = Field(min_length=1, max_length=100)


class CheckReview(BaseModel):
    decision: Literal['approved', 'rejected']
    notes: str = Field(min_length=10, max_length=2000)


@router.get('/knowledge/catalog')
def catalog(q: str = Query(default='', max_length=160), user=Depends(principal)):
    return knowledge.catalog(user, q)


@router.post('/knowledge/notes', status_code=201)
def sign_note(body: ExpertNote, user=Depends(principal)):
    return knowledge.create_note(user, body.model_dump())


@router.post('/knowledge/profile')
def update_profile(body: LearningProfile, user=Depends(principal)):
    return knowledge.profile(user, body.role, body.share_activity)


@router.post('/knowledge/checks', status_code=201)
def start_check(body: StartCheck, user=Depends(principal)):
    return knowledge.start_check(user, body.document_id, body.mode)


@router.get('/knowledge/check-reviews')
def check_reviews(user=Depends(principal)):
    from .knowledge_assessment import reviews
    return reviews(user)


@router.post('/knowledge/checks/{check_id}/review')
def review_check(check_id: str, body: CheckReview, user=Depends(principal)):
    from .knowledge_assessment import review
    return review(user, check_id, body.decision, body.notes)


@router.post('/knowledge/checks/{check_id}/answer')
def answer_check(check_id: str, body: CheckAnswer, user=Depends(principal)):
    return knowledge.finish_check(user, check_id, body.answer)


@router.post('/knowledge/editions', status_code=201)
def link_edition(body: EditionLink, user=Depends(principal)):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        knowledge.link_edition(db, user, body.newer_id, body.previous_id)
        db.execute('COMMIT')
    return {'linked': True}


@router.get('/graph/path')
def trace_path(source: str = Query(min_length=1, max_length=300),
               target: str = Query(min_length=1, max_length=300), user=Depends(principal)):
    return knowledge.trail(user, source, target)
