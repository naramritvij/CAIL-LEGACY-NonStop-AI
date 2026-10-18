"""CAIL/Nonstop AI Operations Assistant API: synthetic incidents, human-reviewed knowledge and read-only training.

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

app = FastAPI(title='CAIL/Nonstop AI Operations Assistant', version='0.2.0',
              description='Synthetic read-only training. Not certified for real systems.')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_credentials=False, allow_methods=['GET', 'POST'],
                   allow_headers=['Content-Type', 'X-Legacy-Expert-Key', 'X-Legacy-Reviewer-Key'])

@app.middleware('http')
async def prototype_response_safeguards(request, call_next):
    """No credentialed/write workflow content should be cached by a browser."""
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


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
    matching = retrieve_approved(body.question, incident, lessons)
    selected_ids = {x['id'] for x in matching['approved_lessons']}
    return explain(body.question, incident, [x for x in lessons if x['id'] in selected_ids][:3])


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


# Sprint 2: source-backed documentation lookup and display-only command references.
# Real NonStop connections and arbitrary command execution remain unsupported.
from .references import source_list as _reference_sources, search_sources as _reference_search
from .templates import list_templates as _diagnostic_templates, preview_template as _template_preview
from .evidence import build_evidence_pack as _evidence_pack
from .reference_contract import DocumentationSearch as _DocumentationSearch, TemplatePreview as _TemplatePreview

@app.get('/api/v1/knowledge/sources')
def reference_sources():
    return {'sources': _reference_sources(), 'provenance': 'curated_offline_official_hpe_pointers'}

@app.post('/api/v1/knowledge/search')
def reference_search(body: _DocumentationSearch):
    return _reference_search(body.query, body.limit)

@app.get('/api/v1/diagnostics/templates')
def source_templates():
    return _diagnostic_templates()

@app.post('/api/v1/diagnostics/templates/preview')
def source_template_preview(body: _TemplatePreview):
    return _template_preview(body.template_id, incident_or_404(body.incident_id))

@app.get('/api/v1/incidents/{incident_id}/evidence-pack')
def incident_evidence_pack(incident_id: str):
    return _evidence_pack(incident_or_404(incident_id))


# Sprint 3: approved-only retrieval, deterministic claim-to-evidence briefing, and
# human-knowledge-transfer training over changed synthetic scenarios.
from fastapi import Query
from .retrieval import retrieve_approved
from .grounding import build_grounded_brief
from .training import make_challenge, grade_transfer
from .sprint3_contract import RetrievalQuestion, TransferAnswer

@app.post('/api/v1/knowledge/retrieve')
def retrieve_knowledge(body: RetrievalQuestion):
    incident = incident_or_404(body.incident_id)
    approved = list_lessons(incident_id=body.incident_id, status='approved')
    return retrieve_approved(body.query, incident, approved,
                             max_lessons=body.max_lessons, max_sources=body.max_sources)

@app.get('/api/v1/incidents/{incident_id}/grounded-brief')
def incident_grounded_brief(
    incident_id: str,
    question: str = Query(default='What evidence supports this incident?', min_length=2, max_length=500),
):
    incident = incident_or_404(incident_id)
    approved = list_lessons(incident_id=incident_id, status='approved')
    return build_grounded_brief(incident, question, approved)

@app.get('/api/v1/training/challenges/{lesson_id}')
def training_challenge(lesson_id: str):
    item = get_lesson(lesson_id)
    challenge = make_challenge(item)
    if challenge is None:
        raise HTTPException(404, 'No approved lesson or supported training scenario found')
    return challenge

@app.post('/api/v1/training/challenges/{lesson_id}/assess')
def assess_transfer(lesson_id: str, body: TransferAnswer):
    lesson = get_lesson(lesson_id)
    if not lesson or lesson.get('status') != 'approved':
        raise HTTPException(404, 'No approved lesson or supported training scenario found')
    incident = incident_or_404(lesson['incident_id'])
    result = grade_transfer(lesson, incident, **body.model_dump())
    if result is None:
        raise HTTPException(404, 'Training scenario unavailable')
    return result


# Sprint 4: opt-in authorized local document excerpts, independent review and
# deterministic release-bounded retrieval. No automatic source download.
from .corpus import create_document, review_transition, corpus_status, search_approved
from .corpus_contract import CorpusIngest, CorpusReview, CorpusSearch

@app.post('/api/v1/knowledge/corpus/documents', status_code=201)
def corpus_ingest(body: CorpusIngest, x_legacy_expert_key: str | None = Header(default=None)):
    require_role('expert', x_legacy_expert_key)
    try:
        return create_document(body.title, body.source_url, body.release,
                               body.section, body.content, body.acknowledged_authorization)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

@app.post('/api/v1/knowledge/corpus/documents/{document_id}/submit')
def corpus_submit(document_id: str, x_legacy_expert_key: str | None = Header(default=None)):
    require_role('expert', x_legacy_expert_key)
    result = review_transition(document_id, 'draft', 'submitted')
    if result == 'missing':
        raise HTTPException(404, 'Document not found')
    if result != 'ok':
        raise HTTPException(409, 'Only draft documents can be submitted')
    return {'document_id': document_id, 'status': 'submitted'}

@app.post('/api/v1/knowledge/corpus/documents/{document_id}/review')
def corpus_review(document_id: str, body: CorpusReview,
                  x_legacy_reviewer_key: str | None = Header(default=None)):
    require_role('reviewer', x_legacy_reviewer_key)
    result = review_transition(document_id, 'submitted', body.decision, body.notes)
    if result == 'missing':
        raise HTTPException(404, 'Document not found')
    if result != 'ok':
        raise HTTPException(409, 'Only submitted documents can be reviewed')
    return {'document_id': document_id, 'status': body.decision}

@app.post('/api/v1/knowledge/corpus/search')
def corpus_search(body: CorpusSearch):
    return search_approved(body.query, body.release, body.limit)

@app.get('/api/v1/knowledge/corpus/status')
def corpus_index_status():
    return corpus_status()


# Sprint 5: optional, evidence-ID-checked local Ollama explanation. This route
# never executes commands or authorizes actions; all source text is untrusted.
from .grounded_investigation import GroundedInvestigationRequest, investigate_with_corpus

@app.post('/api/v1/investigate/grounded')
def investigate_grounded_with_reviewed_corpus(body: GroundedInvestigationRequest):
    return investigate_with_corpus(body.question, incident_or_404(body.incident_id),
                                   body.release, body.max_chunks)


# Read-only mentor knowledge visualization; only locally approved synthetic
# Decision DNA revisions are returned, not verified reuse or impact metrics.
from .legacy_tree import build_legacy_tree

@app.get('/api/v1/knowledge/legacy-tree')
def approved_legacy_tree(incident_id: str | None = Query(default=None, min_length=1, max_length=64)):
    if incident_id is not None:
        incident_or_404(incident_id)
    return build_legacy_tree(incident_id)

# Frontend-friendly composition of existing READ-ONLY endpoints. The model call
# intentionally stays separate, avoiding a slow or hidden AI dependency.
from .incident_workspace import build_workspace

@app.get('/api/v1/incidents/{incident_id}/workspace')
def incident_workspace(
    incident_id: str,
    question: str = Query(
        default='What does the available evidence show?',
        min_length=3,
        max_length=500,
    ),
):
    return build_workspace(incident_or_404(incident_id), question)


# CAIL operator command center; synthetic source adapters, not a live HPE link.
from .enterprise_bridge import (
    overview as _operator_overview, registry as _operator_registry,
    source as _operator_source, command_catalog as _operator_catalog,
    command_preview as _operator_preview,
)

class OperatorCommandRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    command_id: str = Field(min_length=1, max_length=100)

@app.get('/api/v1/operations/overview')
def operator_overview():
    return _operator_overview()

@app.get('/api/v1/operations/tools')
def operator_tools():
    return _operator_registry()

@app.get('/api/v1/operations/incidents/{incident_id}/sources/{tool_id}')
def operator_source(incident_id: str, tool_id: str):
    incident_or_404(incident_id)
    result = _operator_source(incident_id, tool_id)
    if result is None:
        raise HTTPException(404, 'Unknown source')
    return result

@app.get('/api/v1/operations/incidents/{incident_id}/commands')
def operator_commands(incident_id: str):
    incident_or_404(incident_id)
    return _operator_catalog(incident_id)

@app.post('/api/v1/operations/commands/preview')
def operator_command_preview(body: OperatorCommandRequest):
    incident_or_404(body.incident_id)
    return _operator_preview(body.incident_id, body.command_id)

# Canonical Knowledge Tree name; keep former route for compatibility.
@app.get('/api/v1/knowledge/knowledge-tree')
def approved_knowledge_tree(incident_id: str | None = Query(default=None, min_length=1, max_length=64)):
    return approved_legacy_tree(incident_id)

from .corpus import create_transcript as _create_transcript

class TranscriptIngest(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    recording_reference: str = Field(min_length=3, max_length=120, pattern=r'^[A-Za-z0-9_. -]+$')
    release: str = Field(min_length=3, max_length=40, pattern=r'^[A-Za-z0-9_. -]+$')
    section: str = Field(min_length=3, max_length=120)
    content: str = Field(min_length=80, max_length=12000)
    acknowledged_authorization: bool
    redaction_confirmed: bool

@app.post('/api/v1/knowledge/transcripts', status_code=201)
def transcript_intake(body: TranscriptIngest,
                      x_legacy_expert_key: str | None = Header(default=None)):
    require_role('expert', x_legacy_expert_key)
    try:
        return _create_transcript(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# Knowledge Transfer UI: metadata listing and source-review details.
# No nonapproved text is available without a valid expert/reviewer demo credential.
from .corpus import list_corpus_documents as _list_corpus, get_corpus_document as _get_corpus

@app.get('/api/v1/knowledge/corpus/documents')
def corpus_documents(
    status: Literal['approved','draft','submitted','rejected','all'] = 'approved',
    limit: int = Query(default=50, ge=1, le=100),
    x_legacy_expert_key: str | None = Header(default=None),
    x_legacy_reviewer_key: str | None = Header(default=None),
):
    if status != 'approved':
        require_either(x_legacy_expert_key or x_legacy_reviewer_key)
    return _list_corpus(status=status, limit=limit)


@app.get('/api/v1/knowledge/corpus/documents/{document_id}')
def corpus_document_detail(
    document_id: str,
    x_legacy_expert_key: str | None = Header(default=None),
    x_legacy_reviewer_key: str | None = Header(default=None),
):
    document = _get_corpus(document_id)
    if document is None:
        raise HTTPException(404, 'Document not found')
    if document['status'] != 'approved':
        require_either(x_legacy_expert_key or x_legacy_reviewer_key)
    return document


# Incident-specific evidence-to-command learning guide. No shell, HPE transport,
# arbitrary command string, or state-changing action is accepted.
from .command_playbook import build_playbook as _build_playbook, preview_playbook as _preview_playbook

class PlaybookPreviewRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    step_id: str = Field(min_length=1, max_length=80, pattern=r'^[a-z0-9-]+$')

@app.get('/api/v1/operations/incidents/{incident_id}/playbook')
def operator_playbook(incident_id: str):
    return _build_playbook(incident_or_404(incident_id))

@app.post('/api/v1/operations/playbook/preview')
def operator_playbook_preview(body: PlaybookPreviewRequest):
    return _preview_playbook(incident_or_404(body.incident_id), body.step_id)


# Deterministic symptom-to-step mapping; never accepts an executable command.
from .command_playbook import recommend_step as _recommend_playbook_step

class PlaybookQuestion(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=3, max_length=500)

@app.post('/api/v1/operations/playbook/recommend')
def operator_playbook_recommend(body: PlaybookQuestion):
    return _recommend_playbook_step(incident_or_404(body.incident_id), body.question)
