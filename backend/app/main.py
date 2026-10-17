"""LEGACY API: synthetic incidents, human-reviewed knowledge and read-only training.

The backend is intentionally NOT an HPE NonStop connector. All data is synthetic.
"""
from __future__ import annotations
from typing import Literal
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .scenarios import get_incident, list_incidents
from .policy import ACTIONS, evaluate
from .analysis import build_analysis
from .replay import replay
from .storage import (create_lesson, get_lesson, list_lessons, transition_lesson,
                      verify_audit)
from .security import require_role, require_either
from .contract import LessonCreate, ReviewRequest, ReplayRequest
from .ai import explain

app = FastAPI(title='LEGACY NonStop Simulation API', version='0.2.0',
              description='Synthetic read-only training. Not certified for real systems.')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_credentials=False, allow_methods=['GET', 'POST'],
                   allow_headers=['Content-Type', 'X-Legacy-Expert-Key', 'X-Legacy-Reviewer-Key'])

class DiagnosticRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    action_id: str = Field(min_length=1, max_length=64)

class InvestigationRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=3, max_length=500)


def incident_or_404(incident_id: str):
    item = get_incident(incident_id)
    if not item:
        raise HTTPException(404, 'Incident not found')
    return item


@app.get('/api/v1/health')
def health():
    return {'status': 'ok', 'mode': 'synthetic_read_only', 'version': '0.2.0'}


@app.get('/api/v1/incidents')
def incidents():
    return list_incidents()


@app.get('/api/v1/incidents/{incident_id}')
def incident_detail(incident_id: str):
    return incident_or_404(incident_id)


@app.get('/api/v1/incidents/{incident_id}/analysis')
def analysis(incident_id: str):
    return build_analysis(incident_or_404(incident_id))


@app.get('/api/v1/actions')
def actions():
    return [{'id': key, **value} for key, value in ACTIONS.items()]


@app.post('/api/v1/diagnostics/preview')
def diagnostic_preview(body: DiagnosticRequest):
    return evaluate(body.action_id, incident_or_404(body.incident_id))


@app.post('/api/v1/replay')
def counterfactual_replay(body: ReplayRequest):
    return replay(incident_or_404(body.incident_id), body.action_id)


@app.post('/api/v1/investigate')
def investigate(body: InvestigationRequest):
    incident = incident_or_404(body.incident_id)
    lessons = list_lessons(incident_id=body.incident_id, status='approved')
    return explain(body.question, incident, lessons[:3])


@app.get('/api/v1/knowledge/example')
def example_knowledge():
    return {
        'id': 'DEMO-LESSON-001', 'type': 'decision_dna_draft',
        'review_status': 'unverified_synthetic_example', 'incident_id': 'INC-DISK-001',
        'lesson': 'Inspect file ownership, dependency and retention rules before proposing deletion.',
        'rejected_action': 'purge_files',
        'reason': 'Destructive action with missing prerequisites.',
        'source': 'Invented educational scenario, not a real senior engineer or HPE runbook.'
    }


@app.get('/api/v1/knowledge/lessons')
def approved_or_role_scoped_lessons(
    incident_id: str | None = None,
    status: Literal['approved', 'draft', 'submitted', 'rejected', 'all'] = 'approved',
    x_legacy_expert_key: str | None = Header(default=None),
    x_legacy_reviewer_key: str | None = Header(default=None),
):
    if incident_id:
        incident_or_404(incident_id)
    if status != 'approved':
        require_either(x_legacy_expert_key or x_legacy_reviewer_key)
    return list_lessons(incident_id=incident_id, status=status)


@app.get('/api/v1/knowledge/lessons/{lesson_id}')
def lesson_detail(lesson_id: str, x_legacy_expert_key: str | None = Header(default=None),
                  x_legacy_reviewer_key: str | None = Header(default=None)):
    lesson = get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(404, 'Lesson not found')
    if lesson['status'] != 'approved':
        require_either(x_legacy_expert_key or x_legacy_reviewer_key)
    return lesson


@app.post('/api/v1/knowledge/lessons', status_code=201)
def lesson_create(body: LessonCreate, x_legacy_expert_key: str | None = Header(default=None)):
    require_role('expert', x_legacy_expert_key)
    incident = incident_or_404(body.incident_id)
    evidence = {event['id'] for event in incident['events']}
    if not set(body.evidence_ids).issubset(evidence):
        raise HTTPException(422, 'Evidence IDs must exist in this incident')
    if any(not s.strip() or len(s) > 200 for s in body.prerequisites):
        raise HTTPException(422, 'Prerequisites must be 1–200 characters each')
    try:
        return create_lesson(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post('/api/v1/knowledge/lessons/{lesson_id}/submit')
def lesson_submit(lesson_id: str, x_legacy_expert_key: str | None = Header(default=None)):
    require_role('expert', x_legacy_expert_key)
    status = transition_lesson(lesson_id, 'draft', 'submitted', 'lesson_submitted')
    if status == 'missing':
        raise HTTPException(404, 'Lesson not found')
    if status != 'ok':
        raise HTTPException(409, 'Only draft lessons can be submitted')
    return get_lesson(lesson_id)


@app.post('/api/v1/knowledge/lessons/{lesson_id}/review')
def lesson_review(lesson_id: str, body: ReviewRequest,
                  x_legacy_reviewer_key: str | None = Header(default=None)):
    require_role('reviewer', x_legacy_reviewer_key)
    status = transition_lesson(lesson_id, 'submitted', body.decision, 'lesson_reviewed', body.notes)
    if status == 'missing':
        raise HTTPException(404, 'Lesson not found')
    if status != 'ok':
        raise HTTPException(409, 'Only submitted lessons can be reviewed')
    return get_lesson(lesson_id)


@app.get('/api/v1/audit/verify')
def audit_check(x_legacy_reviewer_key: str | None = Header(default=None)):
    require_role('reviewer', x_legacy_reviewer_key)
    return verify_audit()


@app.get('/api/v1/shift-briefing')
def shift_briefing():
    incident_items = list_incidents()
    events = [evt for incident in incident_items for evt in incident['events']]
    approved_count = sum(len(list_lessons(incident_id=x['id'], status='approved'))
                         for x in incident_items)
    return {
        'synthetic': True, 'open_incidents': len(incident_items),
        'event_count': len(events), 'approved_knowledge_records': approved_count,
        'unresolved': [{'incident_id': x['id'], 'title': x['title'],
                        'missing_evidence': x['unknowns'],
                        'event_ids': [e['id'] for e in x['events']]} for x in incident_items],
        'handover': 'Both demo incidents remain under investigation; root causes have not been confirmed.',
        'next_step': 'Review event evidence, subsystem state and applicable approved procedures.',
        'approval_state': 'generated_from_synthetic_records_not_operator_signed'
    }
