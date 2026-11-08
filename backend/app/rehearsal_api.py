"""The current workspace's authenticated rehearsal routes."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from . import rehearsal
from .workspace_identity import principal

router = APIRouter(prefix='/rehearsals')


class StartRun(BaseModel):
    case_id: str = Field(min_length=1, max_length=60)
    request_id: str = Field(min_length=10, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')


class SnapshotRequest(BaseModel):
    checkpoint: int = Field(ge=1, le=3)


class Decision(SnapshotRequest):
    action_id: str = Field(min_length=1, max_length=60)
    evidence_ids: list[str] = Field(max_length=8)


@router.get('')
def list_rehearsals(user=Depends(principal)):
    return rehearsal.list_runs(user)


@router.post('', status_code=201)
def start_rehearsal(body: StartRun, user=Depends(principal)):
    return rehearsal.start(user, body.case_id, body.request_id)


@router.get('/{run_id}')
def read_rehearsal(run_id: str, user=Depends(principal)):
    return rehearsal.detail(user, run_id)


@router.post('/{run_id}/decision')
def choose_decision(run_id: str, body: Decision, user=Depends(principal)):
    return rehearsal.decide(user, run_id, body.checkpoint, body.action_id, body.evidence_ids)


@router.post('/{run_id}/conversation', status_code=201)
def open_assistant(run_id: str, body: SnapshotRequest, user=Depends(principal)):
    return rehearsal.conversation(user, run_id, body.checkpoint)


@router.get('/{run_id}/debrief')
def debrief(run_id: str, user=Depends(principal)):
    return rehearsal.brief(user, run_id)
