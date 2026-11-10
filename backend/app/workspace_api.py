"""One conversational workspace with durable records and live graph projection."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Literal
import hashlib
import logging
import os
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field

from . import workspace_store as store
from .workspace_identity import COOKIE, configured_users, demo_roles, login, principal
from . import live_sources

router = APIRouter(prefix='/api/v1/workspace', tags=['Conversational workspace'])
VENDOR_SOURCES = {
    'prognosis': {'name': 'IR Prognosis', 'interface': 'Read-only REST dataset / data gateway',
                  'description': 'Read an admin-provisioned Prognosis dataset using its mapped columns and server-only credentials, or use the normalized gateway.',
                  'documentation': 'https://www.ir.com/products/infrastructure'},
    'asap': {'name': 'HPE ASAP', 'interface': 'Consumer API / published query bridge',
             'description': 'Availability, statistics, thresholds and historical measurements. CAIL reads the Consumer/query path; Provider interfaces write data and are not used.',
             'documentation': 'https://nonstopasap.com/index.htm'},
    'momi': {'name': 'MOMI', 'interface': 'Read-only alarm exports / approved bridge',
             'description': 'Read scheduled MOMI alarm exports without moving or modifying them, import an existing export, or use the normalized gateway.',
             'documentation': 'https://www.blackwood-systems.com/momi/documentation/WebHelp/Client/Screens/History/History___Export_Data.htm'},
}


class LoginBody(BaseModel):
    access_key: str = Field(min_length=1, max_length=512)


class DemoRoleBody(BaseModel):
    person_id: str = Field(min_length=1, max_length=100)


class TurnBody(BaseModel):
    question: str = Field(min_length=1, max_length=6000)
    request_id: str = Field(min_length=10, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')


class TextDocument(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=20, max_length=200000)
    topic: str = Field(default='General', min_length=1, max_length=60)
    target_node_id: str | None = Field(default=None, max_length=300)


class GraphLink(BaseModel):
    document_id: str = Field(min_length=1, max_length=100)
    target_node_id: str = Field(min_length=1, max_length=300)


class DocumentIndex(BaseModel):
    document_id: str | None = Field(default=None, max_length=100)


class ReferenceImport(BaseModel):
    reference_key: str = Field(min_length=1, max_length=100)
    target_node_id: str | None = Field(default=None, max_length=300)


class ReviewBody(BaseModel):
    decision: Literal['submitted', 'approved', 'rejected']
    notes: str = Field(default='', max_length=2000)


@router.get('/session')
def session(user=Depends(principal)):
    return user


@router.post('/session')
def sign_in(body: LoginBody, response: Response, request: Request):
    user, token = login(body.access_key)
    set_session_cookie(response, request, token)
    return user


def set_session_cookie(response, request, token):
    response.set_cookie(COOKIE, token, httponly=True, samesite='strict', max_age=43200,
                        secure=request.url.scheme == 'https' or os.getenv('CAIL_COOKIE_SECURE', '').lower() == 'true', path='/api/v1/workspace')


@router.post('/session/demo-role')
def switch_demo_role(body: DemoRoleBody, response: Response, request: Request):
    member = demo_roles(configured_users()).get(body.person_id)
    if not member:
        raise HTTPException(404, 'Role switching is available only in the isolated transfer demo.')
    user, token = login(member['key'])
    set_session_cookie(response, request, token)
    return user


@router.post('/session/logout')
def sign_out(request: Request, response: Response):
    token = request.cookies.get(COOKIE, '')
    with store.database() as db:
        db.execute('DELETE FROM ws_sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie(COOKIE, path='/api/v1/workspace')
    return {'signed_out': True}


@router.get('/conversations')
def conversation_list(user=Depends(principal)):
    return store.conversations(user)


@router.post('/conversations', status_code=201)
def conversation_create(user=Depends(principal)):
    return store.new_conversation(user)


@router.get('/conversations/{conversation_id}')
def conversation_detail(conversation_id: str, user=Depends(principal)):
    return store.messages(user, conversation_id)


@router.post('/conversations/{conversation_id}/messages')
def conversation_turn(conversation_id: str, body: TurnBody, user=Depends(principal)):
    question = body.question.strip()
    if not question:
        raise HTTPException(422, 'Enter a question.')
    turn = store.begin_turn(user, conversation_id, body.request_id, question)
    if 'existing' in turn:
        reply = turn['existing']
    else:
        from .agent_orchestrator import run
        try:
            if turn['rehearsal']:
                from .rehearsal_answers import answer
                result = answer(turn['rehearsal'], question, turn['history'])
            else:
                result = run(user, question, turn['history'])
        except Exception:
            # Preserve both turns even if a tool or model fails unexpectedly. Never leak an exception/secret.
            logging.getLogger(__name__).exception('Workspace agent run failed')
            result = {'answer': 'The investigation was interrupted. Your question and earlier conversation are saved. Try a follow-up.',
                      'status': 'failed', 'sources': [], 'trace': [], 'execution_allowed': False}
        reply = store.finish_turn(conversation_id, body.request_id, turn['answer_id'], result,
                                 lease_until=turn['lease_until'])
    if reply['status'] == 'complete':
        from .semantic_graph import record_question
        result = reply['metadata']
        try:
            record_question(user, result.get('interpretation') or question, result.get('sources', []), body.request_id)
        except Exception:
            # Graph activity is best effort and can be recovered by retrying the saved turn.
            logging.getLogger(__name__).warning('Learning-link bookkeeping was deferred.')
    return reply


@router.get('/graph')
def knowledge_graph(cursor: str | None = Query(default=None, max_length=100), user=Depends(principal)):
    from . import workspace_topology as topology
    current, revision = topology.cursor(user)
    if cursor == current:
        return {'not_modified': True, 'cursor': current, 'revision': revision, 'updated_at': store.now()}
    return topology.graph(user)


@router.post('/graph/import', status_code=201)
async def topology_import(file: UploadFile = File(...), title: str = Form('Imported topology'), user=Depends(principal)):
    from . import workspace_topology as topology
    payload = await file.read(topology.MAX_BYTES + 1)
    if len(payload) > topology.MAX_BYTES:
        raise HTTPException(413, 'Choose a topology export smaller than 16 MB.')
    filename = Path((file.filename or 'topology.json').replace('\\', '/')).name[:160]
    return topology.import_dataset(user, title, filename, payload)


@router.post('/graph/sync')
def topology_sync(source_id: Literal['prognosis', 'asap', 'momi'] | None = None, user=Depends(principal)):
    from .workspace_topology import sync
    return sync(user, [source_id] if source_id else None)


@router.post('/graph/monitoring-import', status_code=201)
async def monitoring_import(file: UploadFile = File(...), title: str = Form('Monitoring export'),
                            source_id: Literal['prognosis', 'momi'] = Form(...), user=Depends(principal)):
    from . import vendor_datasets, workspace_topology
    raw = await file.read(vendor_datasets.MAX_BYTES + 1)
    if len(raw) > vendor_datasets.MAX_BYTES:
        raise HTTPException(413, 'Monitoring exports are limited to 16 MB.')
    filename = Path((file.filename or 'export.txt').replace('\\', '/')).name[:160]
    try:
        payload = vendor_datasets.parse_export(source_id, filename, raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from None
    return workspace_topology.import_dataset(user, title, filename, raw, supplied_payload=payload, source_kind='monitoring_export')


@router.get('/graph/node')
def topology_node(node_id: str = Query(min_length=1, max_length=300), user=Depends(principal)):
    from .workspace_topology import detail
    return detail(user, node_id)


@router.get('/graph/search')
def topology_search(q: str = Query(min_length=1, max_length=160), user=Depends(principal)):
    from .workspace_topology import search
    return search(user, q)


@router.get('/graph/neighborhood')
def topology_neighborhood(node_id: str = Query(min_length=1, max_length=300), user=Depends(principal)):
    from .workspace_topology import neighborhood
    return neighborhood(user, node_id)


@router.post('/graph/links', status_code=201)
def topology_link(body: GraphLink, user=Depends(principal)):
    from .workspace_topology import link_document
    return link_document(user, body.document_id, body.target_node_id)


@router.post('/graph/index-documents')
def document_index(body: DocumentIndex, user=Depends(principal)):
    from .document_network import index_owned
    return index_owned(user, body.document_id)


@router.post('/documents', status_code=201)
def document_create(body: TextDocument, user=Depends(principal)):
    return store.create_document(user, body.title, body.title + '.txt', body.content, body.topic, body.target_node_id)


def extract_text(filename, payload, *, max_pages=100, max_chars=200000):
    extension = Path(filename).suffix.lower()
    if extension in ('.txt', '.md', '.csv', '.log'):
        try:
            return payload.decode('utf-8-sig')
        except UnicodeDecodeError:
            raise HTTPException(422, 'Save this text file as UTF-8 before uploading.') from None
    if extension == '.pdf':
        from pypdf import PdfReader
        try:
            reader = PdfReader(BytesIO(payload))
            if reader.is_encrypted or len(reader.pages) > max_pages:
                raise ValueError()
            text, size = [], 0
            for page in reader.pages:
                part = page.extract_text() or ''
                size += len(part)
                if size > max_chars:
                    raise ValueError()
                text.append(part)
            return '\n\n'.join(text)
        except Exception:
            raise HTTPException(422, f'Use a text-based, unencrypted PDF with up to {max_pages:,} pages and {max_chars:,} text characters. Scans require OCR first.') from None
    if extension == '.docx':
        from docx import Document
        try:
            with zipfile.ZipFile(BytesIO(payload)) as archive:
                if sum(item.file_size for item in archive.infolist()) > 20 * 1024 * 1024:
                    raise ValueError()
            doc = Document(BytesIO(payload))
            text = [paragraph.text for paragraph in doc.paragraphs]
            text.extend(' | '.join(cell.text for cell in row.cells) for table in doc.tables for row in table.rows)
            return '\n'.join(text)
        except Exception:
            raise HTTPException(422, 'This DOCX could not be read. Export it as UTF-8 text or a text-based PDF.') from None
    raise HTTPException(415, 'Choose PDF, DOCX, TXT, Markdown, CSV or LOG.')


@router.post('/documents/upload', status_code=201)
async def document_upload(file: UploadFile = File(...), topic: str = Form('General'), title: str = Form(''), target_node_id: str | None = Form(default=None), user=Depends(principal)):
    payload = await file.read(4 * 1024 * 1024 + 1)
    if len(payload) > 4 * 1024 * 1024:
        raise HTTPException(413, 'Choose a file smaller than 4 MB.')
    filename = Path((file.filename or 'document.txt').replace('\\', '/')).name[:160]
    if not 1 <= len(topic.strip()) <= 60:
        raise HTTPException(422, 'Topic must contain 1–60 characters.')
    if len(title) > 160 or (title.strip() and len(title.strip()) < 2):
        raise HTTPException(422, 'Document title must contain 2–160 characters.')
    content = extract_text(filename, payload)
    if target_node_id and len(target_node_id) > 300:
        raise HTTPException(422, 'Graph node ID is too long.')
    return store.create_document(user, title.strip() or Path(filename).stem[:160], filename, content, topic, target_node_id)


@router.get('/documents/{document_id}')
def document_detail(document_id: str, record_access: bool = True, user=Depends(principal)):
    return store.document(user, document_id, record_access=record_access)


@router.post('/documents/manual', status_code=201)
async def manual_upload(file: UploadFile = File(...), topic: str = Form('NonStop reference'),
                        title: str = Form(''), edition: str = Form('Not specified'), source_url: str = Form(''),
                        target_node_id: str | None = Form(default=None), user=Depends(principal)):
    from urllib.parse import urlsplit
    if not 1 <= len(topic.strip()) <= 60 or len(edition) > 240 or len(title) > 160 or len(source_url) > 1000:
        raise HTTPException(422, 'Check the title, topic, edition and source URL lengths.')
    if source_url:
        parsed = urlsplit(source_url)
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or '\n' in source_url or '\r' in source_url:
            raise HTTPException(422, 'Use an HTTPS reference URL without credentials.')
    content_bytes = await file.read(32 * 1024 * 1024 + 1)
    if len(content_bytes) > 32 * 1024 * 1024:
        raise HTTPException(413, 'Reference manuals are limited to 32 MB.')
    filename = Path((file.filename or 'manual.pdf').replace('\\', '/')).name[:160]
    if Path(filename).suffix.lower() not in ('.pdf', '.txt', '.md'):
        raise HTTPException(415, 'Reference manuals must be PDF, UTF-8 TXT or Markdown.')
    if target_node_id and len(target_node_id) > 300:
        raise HTTPException(422, 'Graph node ID is too long.')
    content = extract_text(filename, content_bytes, max_pages=1000, max_chars=2_000_000)
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        identifier = store.insert_document(db, user, title.strip() or Path(filename).stem[:160], filename, content, topic, target_node_id, max_chars=2_000_000)
        db.execute('INSERT INTO ws_document_sources VALUES (?,?,?,?,?)',
                   (identifier, source_url or None, edition, 'user_supplied_reference_manual', hashlib.sha256(content_bytes).hexdigest()))
        db.execute('COMMIT')
    return store.document(user, identifier, record_access=False)


@router.post('/documents/{document_id}/review')
def document_review(document_id: str, body: ReviewBody, user=Depends(principal)):
    return store.transition_document(user, document_id, body.decision, body.notes)


@router.get('/references')
def reference_catalog(user=Depends(principal)):
    from .public_references import catalog
    return catalog()


@router.post('/references/import', status_code=201)
def reference_import(body: ReferenceImport, user=Depends(principal)):
    from .public_references import import_reference
    return import_reference(user, body.reference_key, lambda name, content: extract_text(name, content, max_pages=1000, max_chars=2_000_000), body.target_node_id)


def check_source(user, source_id):
    if source_id not in VENDOR_SOURCES:
        raise HTTPException(404, 'Unknown connector')
    if not user['can_read_live']:
        raise HTTPException(403, 'This operator does not have live read access.')
    try:
        snapshot = live_sources.read_source(source_id)
    except HTTPException:
        store.source_failed(user, source_id)
        raise
    store.save_snapshot(user, source_id, snapshot)
    return snapshot


@router.get('/connections')
def connections(user=Depends(principal)):
    from . import vendor_datasets
    from .workspace_topology import connection_states
    topology_states = connection_states(user)
    capabilities = {item['tool_id']: item for item in live_sources.capabilities()['sources']}
    rows = []
    from datetime import datetime, timezone
    for key, metadata in VENDOR_SOURCES.items():
        history = store.snapshot_history(key) if user['can_read_live'] else []
        scope = vendor_datasets.canonical_system(os.getenv(f'CAIL_{key.upper()}_SYSTEM_ID', ''))
        if scope:
            history = [item for item in history if vendor_datasets.canonical_system(item.get('system_id', '')) == scope]
        latest = history[-1] if history else None
        current = store.source_state(key)
        fresh = bool(latest and current and current['status'] == 'connected' and capabilities.get(key, {}).get('configured') and
                     (datetime.now(timezone.utc) - live_sources._timestamp(latest['observed_at'])).total_seconds() <= live_sources.MAX_AGE_SECONDS)
        topology = topology_states[key]
        connected = fresh or topology['topology_connected']
        rows.append({'id': key, **metadata, **topology, 'metrics_configured': capabilities.get(key, {}).get('configured', False),
                     'configured': capabilities.get(key, {}).get('configured', False) or topology['topology_configured'],
                     'connected': connected, 'metrics_connected': fresh, 'status': 'connected' if connected else 'not_connected',
                     'last_observed_at': latest['observed_at'] if fresh else topology['topology_observed_at'],
                     'last_checked_at': current['checked_at'] if current and user['can_read_live'] else None,
                     'snapshot': latest if fresh else None, 'history': history,
                     'execution_allowed': False})
    return {'sources': rows, 'can_read_live': user['can_read_live'], 'model': os.getenv('OLLAMA_MODEL', 'qwen3:4b-instruct')}


@router.post('/connections/{source_id}/check')
def connection_check(source_id: str, user=Depends(principal)):
    return check_source(user, source_id)


from .semantic_api import router as semantic_router
router.include_router(semantic_router)

from .transfer_api import router as transfer_router
router.include_router(transfer_router)

from .rehearsal_api import router as rehearsal_router
router.include_router(rehearsal_router)
