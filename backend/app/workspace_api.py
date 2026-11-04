"""One conversational workspace with durable records and live graph projection."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Literal
import hashlib
import os
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field

from . import workspace_store as store
from .workspace_identity import COOKIE, login, principal
from . import live_sources

router = APIRouter(prefix='/api/v1/workspace', tags=['Conversational workspace'])
VENDOR_SOURCES = {
    'prognosis': {'name': 'IR Prognosis', 'interface': 'Authorized REST / data gateway',
                  'description': 'Monitoring alerts, history and performance observations. Exact licensed API and mapping must be confirmed for the installed release.',
                  'documentation': 'https://www.ir.com/products/infrastructure'},
    'asap': {'name': 'HPE ASAP', 'interface': 'Consumer API / published query bridge',
             'description': 'Availability, statistics, thresholds and historical measurements. CAIL reads the Consumer/query path; Provider interfaces write data and are not used.',
             'documentation': 'https://nonstopasap.com/index.htm'},
    'momi': {'name': 'MOMI', 'interface': 'Vendor-approved client/server bridge',
             'description': 'NonStop diagnostics and measurements through a licensed, authorized bridge. A general-purpose public REST API has not been verified.',
             'documentation': 'https://www.momi.com/momi/documentation/5.21/WebHelp/Content/Topics/MOMI%20Server/Server_Overview.htm'},
}


class LoginBody(BaseModel):
    access_key: str = Field(min_length=1, max_length=512)


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


class ReviewBody(BaseModel):
    decision: Literal['submitted', 'approved', 'rejected']
    notes: str = Field(default='', max_length=2000)


@router.get('/session')
def session(user=Depends(principal)):
    return user


@router.post('/session')
def sign_in(body: LoginBody, response: Response, request: Request):
    user, token = login(body.access_key)
    response.set_cookie(COOKIE, token, httponly=True, samesite='strict', max_age=43200,
                        secure=request.url.scheme == 'https' or os.getenv('CAIL_COOKIE_SECURE', '').lower() == 'true', path='/api/v1/workspace')
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
        return turn['existing']
    from .agent_orchestrator import run
    try:
        result = run(user, question, turn['history'])
    except Exception:
        # Preserve both turns even if a tool or model fails unexpectedly. Never leak an exception/secret.
        import logging
        logging.getLogger(__name__).exception('Workspace agent run failed')
        result = {'answer': 'The investigation was interrupted. Your question and earlier conversation are saved. Try a follow-up.',
                  'status': 'failed', 'sources': [], 'trace': [], 'execution_allowed': False}
    return store.finish_turn(conversation_id, body.request_id, turn['answer_id'], result)


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


@router.post('/documents', status_code=201)
def document_create(body: TextDocument, user=Depends(principal)):
    return store.create_document(user, body.title, body.title + '.txt', body.content, body.topic, body.target_node_id)


def extract_text(filename, payload):
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
            if reader.is_encrypted or len(reader.pages) > 100:
                raise ValueError()
            text, size = [], 0
            for page in reader.pages:
                part = page.extract_text() or ''
                size += len(part)
                if size > 200000:
                    raise ValueError()
                text.append(part)
            return '\n\n'.join(text)
        except Exception:
            raise HTTPException(422, 'Use a text-based, unencrypted PDF with up to 100 pages and 200,000 text characters. Scans require OCR first.') from None
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
async def document_upload(file: UploadFile = File(...), topic: str = Form('General'), target_node_id: str | None = Form(default=None), user=Depends(principal)):
    payload = await file.read(4 * 1024 * 1024 + 1)
    if len(payload) > 4 * 1024 * 1024:
        raise HTTPException(413, 'Choose a file smaller than 4 MB.')
    filename = Path((file.filename or 'document.txt').replace('\\', '/')).name[:160]
    if not 1 <= len(topic.strip()) <= 60:
        raise HTTPException(422, 'Topic must contain 1–60 characters.')
    content = extract_text(filename, payload)
    if target_node_id and len(target_node_id) > 300:
        raise HTTPException(422, 'Graph node ID is too long.')
    return store.create_document(user, Path(filename).stem[:160], filename, content, topic, target_node_id)


@router.get('/documents/{document_id}')
def document_detail(document_id: str, user=Depends(principal)):
    return store.document(user, document_id)


@router.post('/documents/{document_id}/review')
def document_review(document_id: str, body: ReviewBody, user=Depends(principal)):
    return store.transition_document(user, document_id, body.decision, body.notes)


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
    from .workspace_topology import connection_states
    topology_states = connection_states(user)
    capabilities = {item['tool_id']: item for item in live_sources.capabilities()['sources']}
    rows = []
    from datetime import datetime, timezone
    for key, metadata in VENDOR_SOURCES.items():
        history = store.snapshot_history(key) if user['can_read_live'] else []
        latest = history[-1] if history else None
        current = store.source_state(key)
        fresh = bool(latest and current and current['status'] == 'connected' and capabilities.get(key, {}).get('configured') and
                     (datetime.now(timezone.utc) - live_sources._timestamp(latest['observed_at'])).total_seconds() <= live_sources.MAX_AGE_SECONDS)
        topology = topology_states[key]
        connected = fresh or topology['topology_connected']
        rows.append({'id': key, **metadata, **topology, 'metrics_configured': capabilities.get(key, {}).get('configured', False),
                     'configured': capabilities.get(key, {}).get('configured', False) or topology['topology_configured'],
                     'connected': connected, 'metrics_connected': fresh, 'status': 'connected' if connected else 'not_connected',
                     'last_observed_at': latest['observed_at'] if latest else topology['topology_observed_at'],
                     'snapshot': latest if fresh else None, 'history': history,
                     'execution_allowed': False})
    return {'sources': rows, 'can_read_live': user['can_read_live'], 'model': os.getenv('OLLAMA_MODEL', 'qwen3:4b-instruct')}


@router.post('/connections/{source_id}/check')
def connection_check(source_id: str, user=Depends(principal)):
    return check_source(user, source_id)
