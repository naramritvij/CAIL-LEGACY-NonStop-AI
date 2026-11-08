"""Contributor and knowledge handoff routes for authenticated workspace users."""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from . import knowledge_transfer as transfer, workspace_store as store
from .workspace_identity import principal

router = APIRouter(prefix='/knowledge')


class MemberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    role: Literal['contributor', 'reviewer'] = 'contributor'


class HandoffCreate(BaseModel):
    contributor_id: str = Field(min_length=1, max_length=100)
    question: str = Field(min_length=12, max_length=2000)
    request_key: str = Field(min_length=10, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')
    context_id: str | None = Field(default=None, max_length=100)


class GuidanceLink(BaseModel):
    document_id: str = Field(min_length=1, max_length=100)


@router.get('/contributors')
def contributors(q: str = Query(default='', max_length=100),
                 offset: int = Query(default=0, ge=0, le=10000), user=Depends(principal)):
    return transfer.directory(user, q, offset)


@router.post('/contributors', status_code=201)
def add_contributor(body: MemberCreate, user=Depends(principal)):
    return transfer.manage_member(user, name=body.name, can_review=body.role == 'reviewer')


@router.get('/contributors/{person_id}/documents')
def contributor_documents(person_id: str, offset: int = Query(default=0, ge=0, le=10000),
                          user=Depends(principal)):
    return transfer.contributions(user, person_id, offset)


@router.post('/contributors/{person_id}/access')
def contributor_access(person_id: str, action: Literal['revoke', 'rotate'], user=Depends(principal)):
    return transfer.manage_member(user, person_id=person_id, revoke=action == 'revoke')


@router.get('/review-queue')
def review_queue(user=Depends(principal)):
    return transfer.review_queue(user)


@router.get('/handoffs')
def list_handoffs(offset: int = Query(default=0, ge=0, le=10000), user=Depends(principal)):
    return transfer.list_handoffs(user, offset)


@router.post('/handoffs', status_code=201)
def create_handoff(body: HandoffCreate, user=Depends(principal)):
    return transfer.request_guidance(user, body.contributor_id, body.question, body.request_key, body.context_id)


@router.post('/handoffs/{handoff_id}/guidance')
def attach_guidance(handoff_id: str, body: GuidanceLink, user=Depends(principal)):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        transfer.link_guidance(db, user, handoff_id, body.document_id, reuse=True)
        db.execute('COMMIT')
    return {'linked': True}


@router.post('/handoffs/{handoff_id}/close')
def close_handoff(handoff_id: str, user=Depends(principal)):
    return transfer.close_handoff(user, handoff_id)


@router.get('/handoffs/{handoff_id}/receipt')
def handoff_receipt(handoff_id: str, user=Depends(principal)):
    return transfer.receipt(user, handoff_id)
