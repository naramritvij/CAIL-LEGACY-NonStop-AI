"""Opt-in, permission-gated *local* excerpt corpus for LEGACY.

Documents are pasted by an authorized demo expert, not downloaded. A distinct
reviewer accepts an excerpt before it can be retrieved; accept is local workflow
approval, NOT authentication of the source's truth or HPE release applicability.
SQLite is persistent inside the named Docker volume. No code path executes text.
"""
from __future__ import annotations
import hashlib
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit
from uuid import uuid4
from .storage import connect

MAX_DOCUMENT_CHARS = 12000
MAX_CHUNKS = 30


def _now():
    return datetime.now(timezone.utc).isoformat()


def _digest(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _ensure_tables(db):
    db.execute('''CREATE TABLE IF NOT EXISTS corpus_documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
        release TEXT NOT NULL, section TEXT NOT NULL,
        content_sha256 TEXT NOT NULL, status TEXT NOT NULL,
        source_kind TEXT NOT NULL, created_at TEXT NOT NULL,
        reviewed_at TEXT, reviewer_notes TEXT)''')
    db.execute('''CREATE TABLE IF NOT EXISTS corpus_chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        content TEXT NOT NULL, sha256 TEXT NOT NULL,
        FOREIGN KEY(document_id) REFERENCES corpus_documents(id))''')


def _check_official_url(url: str):
    parts = urlsplit(url)
    if (parts.scheme != 'https' or parts.hostname != 'support.hpe.com'
            or parts.username or parts.password or parts.port not in (None, 443)
            or parts.path != '/hpesc/public/docDisplay'):
        raise ValueError('Expected a public support.hpe.com/hpesc/public/docDisplay HTTPS reference')
    if len(url) > 1000 or '\n' in url or '\r' in url:
        raise ValueError('Invalid source URL')


def _chunks(text: str):
    """Deterministic bounded, slightly overlapping char chunks, no token model."""
    return [text[i:i+760] for i in range(0, len(text), 680)]


def create_document(title: str, url: str, release: str, section: str,
                    content: str, acknowledged_authorization: bool):
    if not acknowledged_authorization:
        raise ValueError('Confirm permission to store this excerpt')
    _check_official_url(url)
    if not content.strip() or len(content) > MAX_DOCUMENT_CHARS or len(content) < 80:
        raise ValueError('Excerpt must contain between 80 and 12000 characters')
    parts = _chunks(content)
    if len(parts) > MAX_CHUNKS:
        raise ValueError('Too many excerpt chunks')
    ident = str(uuid4())
    records = [(f'DOC-{ident[:8]}-C{i+1:02d}', ident, i+1, text, _digest(text))
               for i, text in enumerate(parts)]
    with connect() as db:
        _ensure_tables(db)
        db.execute('BEGIN IMMEDIATE')
        db.execute('''INSERT INTO corpus_documents
          (id,title,url,release,section,content_sha256,status,source_kind,created_at)
          VALUES (?,?,?,?,?,?,?,?,?)''',
                   (ident,title,url,release,section,_digest(content),'draft',
                    'user_supplied_authorized_excerpt_not_independently_verified',_now()))
        db.executemany('INSERT INTO corpus_chunks(id,document_id,ordinal,content,sha256) VALUES (?,?,?,?,?)', records)
        db.execute('COMMIT')
    return {'document_id': ident, 'status': 'draft', 'chunk_count': len(records),
            'content_sha256': _digest(content), 'validated_source_contents': False,
            'message': 'Source URL shape checked; excerpt has not been checked against URL contents.'}


def review_transition(doc_id: str, expected: str, next_status: str, reviewer_notes: str = ''):
    with connect() as db:
        _ensure_tables(db)
        db.execute('BEGIN IMMEDIATE')
        result = db.execute('UPDATE corpus_documents SET status=?, reviewer_notes=?, reviewed_at=? WHERE id=? AND status=?',
                            (next_status, reviewer_notes or None, _now() if next_status in ('approved','rejected') else None,
                             doc_id, expected))
        if result.rowcount != 1:
            exists = db.execute('SELECT id FROM corpus_documents WHERE id=?', (doc_id,)).fetchone()
            db.execute('ROLLBACK')
            return 'conflict' if exists else 'missing'
        db.execute('COMMIT')
        return 'ok'


def corpus_status():
    with connect() as db:
        _ensure_tables(db)
        rows = db.execute('SELECT status,COUNT(*) AS count FROM corpus_documents GROUP BY status').fetchall()
    return {'document_counts': {r['status']:r['count'] for r in rows},
            'status':'opt_in_local_excerpts_only', 'full_hpe_manual_ingested':False,
            'independently_verified_content':False}


def _terms(v: str):
    stop = {'and','the','for','with','from','what','does','that','this','where','about','are','has','into','should'}
    return {w for w in re.findall(r'[a-z0-9]+', v.lower()) if len(w)>2 and w not in stop}


def search_approved(query: str, release: str, limit: int = 4):
    """Only matching release and approved records, lexical rank, no web access."""
    terms = _terms(query)
    if not terms:
        return {'status':'no_match','matches':[], 'retrieval_method':'reviewer_approved_local_lexical_chunks',
                'release_filter':release,'independently_verified':False}
    with connect() as db:
        _ensure_tables(db)
        rows = db.execute('''SELECT c.id, c.content, c.sha256, c.ordinal,
                       d.id AS document_id, d.title, d.url, d.section, d.release,
                       d.content_sha256, d.reviewed_at, d.source_kind
                       FROM corpus_chunks c JOIN corpus_documents d ON c.document_id=d.id
                       WHERE d.status='approved' AND d.release=?''', (release,)).fetchall()
    result=[]
    for r in rows:
        content = r['content']
        overlap=sorted(terms & _terms(content+' '+r['title']+' '+r['section']))
        if not overlap:
            continue
        result.append({'citation_id':r['id'],'document_id':r['document_id'],
                       'title':r['title'],'source_url':r['url'],'release':r['release'],
                       'section':r['section'],'excerpt':content,'chunk_sha256':r['sha256'],
                       'document_sha256':r['content_sha256'],'retrieval_score':len(overlap),
                       'matched_terms':overlap,'rank_basis':'lexical_overlap_not_probability',
                       'local_reviewed_at':r['reviewed_at'],
                       'content_verified_against_url':False,'validated_for_live_use':False})
    result.sort(key=lambda x:(-x['retrieval_score'],x['citation_id']))
    return {'status':'matches' if result else 'no_match','matches':result[:limit],
            'retrieval_method':'reviewer_approved_local_lexical_chunks',
            'release_filter':release,'independently_verified':False,
            'limitations':'Approval attests to local reviewer workflow only. The submitted text is not verified against the HPE URL and cannot prove an incident root cause.'}