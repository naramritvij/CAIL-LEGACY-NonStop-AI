"""Durable conversation memory and permission-scoped knowledge provenance.

Separate tables preserve the earlier Decision DNA/corpus records unchanged.
No model response can grant a permission or approve an uploaded document.
"""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
import json
import re
from uuid import uuid4

from fastapi import HTTPException
from .storage import connect, now


SCHEMA = (
    """CREATE TABLE IF NOT EXISTS ws_people (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_sessions (
        token_hash TEXT PRIMARY KEY, person_id TEXT NOT NULL, expires_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_members (
        person_id TEXT PRIMARY KEY REFERENCES ws_people(id), key_hash TEXT UNIQUE NOT NULL,
        can_review INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_conversations (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        active_request TEXT, lease_until TEXT)""",
    """CREATE TABLE IF NOT EXISTS ws_messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        conversation_id TEXT NOT NULL REFERENCES ws_conversations(id),
        role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL,
        request_id TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
        UNIQUE(conversation_id,request_id,role))""",
    """CREATE TABLE IF NOT EXISTS ws_documents (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL,
        filename TEXT NOT NULL, content TEXT NOT NULL, sha256 TEXT NOT NULL,
        topic TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
        reviewer_id TEXT, review_notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_chunks (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES ws_documents(id),
        ordinal INTEGER NOT NULL, content TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, person_id TEXT NOT NULL,
        document_id TEXT, kind TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_snapshots (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL,
        person_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_connector_state (
        source_id TEXT PRIMARY KEY, status TEXT NOT NULL, checked_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_topology_datasets (
        id TEXT PRIMARY KEY, document_id TEXT REFERENCES ws_documents(id),
        title TEXT NOT NULL, source_kind TEXT NOT NULL, source_id TEXT,
        system_id TEXT, observed_at TEXT, sha256 TEXT NOT NULL,
        structure_sha256 TEXT NOT NULL, updated_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_topology_nodes (
        id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL REFERENCES ws_topology_datasets(id),
        local_id TEXT NOT NULL, label TEXT NOT NULL, entity_type TEXT NOT NULL,
        status TEXT NOT NULL, properties TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_topology_edges (
        id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL REFERENCES ws_topology_datasets(id),
        source_node TEXT NOT NULL, target_node TEXT NOT NULL, kind TEXT NOT NULL,
        label TEXT NOT NULL, properties TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_graph_links (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES ws_documents(id),
        target_node TEXT NOT NULL, creator_id TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(document_id,target_node))""",
    """CREATE TABLE IF NOT EXISTS ws_topology_sync (
        source_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempted_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_document_sources (
        document_id TEXT PRIMARY KEY REFERENCES ws_documents(id), source_url TEXT,
        edition TEXT, source_kind TEXT NOT NULL, file_sha256 TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_concepts (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, label TEXT NOT NULL, subsystem TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_concept_mentions (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, citation_id TEXT NOT NULL,
        concept_id TEXT NOT NULL, quote TEXT NOT NULL, method TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_semantic_indexes (
        document_id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, version TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_expert_notes (
        document_id TEXT PRIMARY KEY, category TEXT NOT NULL, signed_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_note_concepts (
        document_id TEXT NOT NULL, concept_id TEXT NOT NULL, PRIMARY KEY(document_id,concept_id))""",
    """CREATE TABLE IF NOT EXISTS ws_note_citations (
        document_id TEXT NOT NULL, citation_id TEXT NOT NULL, relation TEXT NOT NULL,
        source_hash TEXT NOT NULL, PRIMARY KEY(document_id,citation_id))""",
    """CREATE TABLE IF NOT EXISTS ws_document_editions (
        newer_id TEXT PRIMARY KEY, previous_id TEXT NOT NULL, created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_learning_profiles (
        person_id TEXT PRIMARY KEY, role TEXT NOT NULL, share_activity INTEGER NOT NULL DEFAULT 0)""",
    """CREATE TABLE IF NOT EXISTS ws_learning_activity (
        id TEXT PRIMARY KEY, person_id TEXT NOT NULL, document_id TEXT NOT NULL,
        concept_id TEXT, kind TEXT NOT NULL, shared INTEGER NOT NULL, created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_knowledge_checks (
        id TEXT PRIMARY KEY, person_id TEXT NOT NULL, document_id TEXT NOT NULL,
        expected TEXT NOT NULL, prompt TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
        completed_at TEXT, document_hash TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS ws_check_reviews (
        check_id TEXT PRIMARY KEY, answer TEXT NOT NULL, feedback TEXT NOT NULL,
        status TEXT NOT NULL, reviewer_id TEXT, review_notes TEXT, reviewed_at TEXT)""",
    """CREATE TABLE IF NOT EXISTS ws_handoffs (
        id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES ws_people(id),
        contributor_id TEXT NOT NULL REFERENCES ws_people(id), question TEXT NOT NULL,
        context_id TEXT REFERENCES ws_documents(id), guidance_id TEXT REFERENCES ws_documents(id),
        request_key TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        closed_by TEXT, UNIQUE(requester_id,request_key))""",
    """CREATE TABLE IF NOT EXISTS ws_handoff_checks (
        check_id TEXT PRIMARY KEY REFERENCES ws_knowledge_checks(id),
        handoff_id TEXT NOT NULL REFERENCES ws_handoffs(id), criteria TEXT NOT NULL DEFAULT '[]')""",
    'CREATE INDEX IF NOT EXISTS ws_conversations_owner ON ws_conversations(owner_id,updated_at)',
    'CREATE INDEX IF NOT EXISTS ws_messages_thread ON ws_messages(conversation_id,sequence)',
    'CREATE INDEX IF NOT EXISTS ws_documents_status ON ws_documents(status,owner_id)',
    'CREATE INDEX IF NOT EXISTS ws_chunks_document ON ws_chunks(document_id)',
    'CREATE INDEX IF NOT EXISTS ws_events_document ON ws_events(document_id,sequence)',
    'CREATE INDEX IF NOT EXISTS ws_topology_nodes_dataset ON ws_topology_nodes(dataset_id)',
    'CREATE INDEX IF NOT EXISTS ws_topology_edges_dataset ON ws_topology_edges(dataset_id)',
    'CREATE INDEX IF NOT EXISTS ws_topology_edges_source ON ws_topology_edges(source_node)',
    'CREATE INDEX IF NOT EXISTS ws_topology_edges_target ON ws_topology_edges(target_node)',
    'CREATE INDEX IF NOT EXISTS ws_graph_links_target ON ws_graph_links(target_node)',
    'CREATE INDEX IF NOT EXISTS ws_mentions_document ON ws_concept_mentions(document_id,citation_id)',
    'CREATE INDEX IF NOT EXISTS ws_mentions_concept ON ws_concept_mentions(concept_id)',
    'CREATE INDEX IF NOT EXISTS ws_activity_document ON ws_learning_activity(document_id,person_id)',
    'CREATE INDEX IF NOT EXISTS ws_documents_owner ON ws_documents(owner_id,status)',
    'CREATE INDEX IF NOT EXISTS ws_handoff_inbox ON ws_handoffs(contributor_id,updated_at)',
    'CREATE INDEX IF NOT EXISTS ws_handoff_outbox ON ws_handoffs(requester_id,updated_at)',
    'CREATE INDEX IF NOT EXISTS ws_handoff_checks_request ON ws_handoff_checks(handoff_id)',
)


@contextmanager
def database():
    with connect() as db:
        for statement in SCHEMA:
            db.execute(statement)
        yield db


def record_person(db, principal):
    db.execute('INSERT INTO ws_people VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at '
               'WHERE ws_people.name!=excluded.name', (principal['id'], principal['name'], now()))


def person(principal):
    with database() as db:
        record_person(db, principal)


def event(db, principal, kind, document_id=None, detail=None):
    db.execute('INSERT INTO ws_events(person_id,document_id,kind,detail,created_at) VALUES (?,?,?,?,?)',
               (principal['id'], document_id, kind, json.dumps(detail or {}), now()))


def owned_thread(db, conversation_id, principal):
    row = db.execute('SELECT * FROM ws_conversations WHERE id=? AND owner_id=?',
                     (conversation_id, principal['id'])).fetchone()
    if row is None:
        raise HTTPException(404, 'Conversation not found')
    return dict(row)


def new_conversation(principal):
    identifier, timestamp = str(uuid4()), now()
    with database() as db:
        db.execute('INSERT INTO ws_conversations(id,owner_id,title,created_at,updated_at) VALUES (?,?,?,?,?)',
                   (identifier, principal['id'], 'New conversation', timestamp, timestamp))
    return {'id': identifier, 'title': 'New conversation', 'updated_at': timestamp}


def conversations(principal):
    with database() as db:
        return [dict(row) for row in db.execute(
            'SELECT id,title,updated_at FROM ws_conversations WHERE owner_id=? ORDER BY updated_at DESC LIMIT 100',
            (principal['id'],))]


def messages(principal, conversation_id):
    with database() as db:
        thread = owned_thread(db, conversation_id, principal)
        # A crashed inference must be recoverable without losing the user's turn.
        if thread['active_request'] and (thread['lease_until'] or '') < now():
            db.execute("UPDATE ws_messages SET status='interrupted',content='This response was interrupted. Send a follow-up to continue; your earlier messages are saved.' WHERE conversation_id=? AND status='pending'",
                       (conversation_id,))
            db.execute('UPDATE ws_conversations SET active_request=NULL,lease_until=NULL WHERE id=?', (conversation_id,))
        rows = db.execute('SELECT * FROM ws_messages WHERE conversation_id=? ORDER BY sequence', (conversation_id,)).fetchall()
    return {'conversation': thread, 'messages': [message(row) for row in rows]}


def message(row):
    result = dict(row)
    result['metadata'] = json.loads(result['metadata'])
    return result


def begin_turn(principal, conversation_id, request_id, question):
    """Lease and idempotency live in SQLite, so multiple API workers agree."""
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        thread = owned_thread(db, conversation_id, principal)
        previous = db.execute("SELECT * FROM ws_messages WHERE conversation_id=? AND request_id=? AND role='assistant'",
                              (conversation_id, request_id)).fetchone()
        if previous:
            previous_question = db.execute("SELECT content FROM ws_messages WHERE conversation_id=? AND request_id=? AND role='user'", (conversation_id, request_id)).fetchone()
            if not previous_question or previous_question['content'] != question:
                raise HTTPException(409, 'This request ID was already used for a different question.')
            db.execute('COMMIT')
            return {'existing': message(previous)}
        if thread['active_request'] and (thread['lease_until'] or '') > now():
            raise HTTPException(409, 'This conversation is responding. Wait for the current response.')
        db.execute("UPDATE ws_messages SET status='interrupted',content='Response interrupted; your question is saved.' WHERE conversation_id=? AND status='pending'", (conversation_id,))
        history = [message(row) for row in db.execute("SELECT * FROM ws_messages WHERE conversation_id=? AND status='complete' ORDER BY sequence", (conversation_id,))]
        timestamp = now()
        lease = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        db.execute('UPDATE ws_conversations SET active_request=?,lease_until=?,updated_at=?,title=CASE WHEN title=? THEN ? ELSE title END WHERE id=?',
                   (request_id, lease, timestamp, 'New conversation', question[:70], conversation_id))
        user_id, answer_id = str(uuid4()), str(uuid4())
        for identifier, role, content, status in ((user_id, 'user', question, 'complete'), (answer_id, 'assistant', '', 'pending')):
            db.execute('INSERT INTO ws_messages(id,conversation_id,role,content,status,request_id,created_at) VALUES (?,?,?,?,?,?,?)',
                       (identifier, conversation_id, role, content, status, request_id, timestamp))
        db.execute('COMMIT')
    return {'history': history, 'answer_id': answer_id, 'user_id': user_id}


def finish_turn(conversation_id, request_id, answer_id, result):
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        thread = db.execute('SELECT active_request FROM ws_conversations WHERE id=?', (conversation_id,)).fetchone()
        if not thread or thread['active_request'] != request_id:
            raise HTTPException(409, 'Response lease expired; reload this conversation.')
        db.execute("UPDATE ws_messages SET content=?,status='complete',metadata=? WHERE id=?",
                   (result['answer'], json.dumps(result), answer_id))
        db.execute('UPDATE ws_conversations SET active_request=NULL,lease_until=NULL,updated_at=? WHERE id=?', (now(), conversation_id))
        db.execute('COMMIT')
        return message(db.execute('SELECT * FROM ws_messages WHERE id=?', (answer_id,)).fetchone())


def can_see(doc, principal):
    return doc['status'] == 'approved' or doc['owner_id'] == principal['id'] or (principal['can_review'] and doc['status'] == 'submitted')


def insert_document(db, principal, title, filename, content, topic, target_node_id=None, *, build_network=True, max_chars=200_000):
    """Insert in the caller's transaction, including an optional real graph link."""
    identifier, timestamp = str(uuid4()), now()
    content = content.strip()
    if len(content) < 20 or len(content) > min(max_chars, 2_000_000):
        raise HTTPException(422, f'Document text must contain 20–{max_chars:,} characters.')
    if target_node_id:
        from .workspace_topology import require_node
        require_node(db, principal, target_node_id)
    db.execute('INSERT INTO ws_documents(id,owner_id,title,filename,content,sha256,topic,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
               (identifier, principal['id'], title.strip(), filename, content, hashlib.sha256(content.encode()).hexdigest(), topic.strip() or 'General', 'draft', timestamp, timestamp))
    for ordinal, offset in enumerate(range(0, len(content), 1100)):
        db.execute('INSERT INTO ws_chunks VALUES (?,?,?,?)', (f'DOC-{identifier[:8]}-{ordinal + 1}', identifier, ordinal, content[offset:offset + 1400]))
    if target_node_id:
        db.execute('INSERT INTO ws_graph_links VALUES (?,?,?,?,?)',
                   (str(uuid4()), identifier, target_node_id, principal['id'], timestamp))
        event(db, principal, 'linked', identifier, {'target_node_id': target_node_id})
    event(db, principal, 'uploaded', identifier)
    if build_network:
        from .document_network import index
        index(db, identifier)
    return identifier


def create_document(principal, title, filename, content, topic, target_node_id=None):
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        identifier = insert_document(db, principal, title, filename, content, topic, target_node_id)
        db.execute('COMMIT')
    return document(principal, identifier, record_access=False)


def document(principal, identifier, record_access=True):
    with database() as db:
        row = db.execute('SELECT d.*,p.name AS owner_name FROM ws_documents d JOIN ws_people p ON p.id=d.owner_id WHERE d.id=?', (identifier,)).fetchone()
        if not row or not can_see(row, principal):
            raise HTTPException(404, 'Document not found')
        result = dict(row)
        source = db.execute('SELECT source_url,edition,source_kind,file_sha256 FROM ws_document_sources WHERE document_id=?', (identifier,)).fetchone()
        result['reference'] = dict(source) if source else None
        from .semantic_graph import note_metadata
        result['expert_note'] = note_metadata(db, identifier)
        if record_access:
            event(db, principal, 'viewed', identifier)
        result['can_review'] = bool(principal['can_review'] and result['owner_id'] != principal['id'] and result['status'] == 'submitted')
        result['can_submit'] = result['owner_id'] == principal['id'] and result['status'] in ('draft', 'rejected')
        return result


def transition_document(principal, identifier, decision, notes=''):
    with database() as db:
        db.execute('BEGIN IMMEDIATE')
        doc = db.execute('SELECT * FROM ws_documents WHERE id=?', (identifier,)).fetchone()
        if not doc or not can_see(doc, principal):
            raise HTTPException(404, 'Document not found')
        if decision == 'submitted':
            allowed = doc['owner_id'] == principal['id'] and doc['status'] in ('draft', 'rejected')
        else:
            allowed = principal['can_review'] and doc['owner_id'] != principal['id'] and doc['status'] == 'submitted'
        if not allowed:
            raise HTTPException(403, 'This transition requires the owner or an independent reviewer.')
        if decision != 'submitted' and db.execute('SELECT 1 FROM ws_handoffs WHERE guidance_id=? LIMIT 1', (identifier,)).fetchone():
            if len(notes.strip()) < 10:
                raise HTTPException(422, 'Explain the review decision in at least 10 characters.')
        if decision == 'approved':
            from .semantic_graph import validate_approval
            validate_approval(db, doc)
        db.execute('UPDATE ws_documents SET status=?,reviewer_id=?,review_notes=?,updated_at=? WHERE id=?',
                   (decision, None if decision == 'submitted' else principal['id'], notes, now(), identifier))
        db.execute('UPDATE ws_handoffs SET updated_at=? WHERE guidance_id=?', (now(), identifier))
        event(db, principal, decision, identifier)
        db.execute('COMMIT')
    return document(principal, identifier, record_access=False)


STOP_WORDS = set('a an and are as at be by can do does for from how i in is it me my of on or please that the this to was what when where which who why with you'.split())


def tokens(text):
    return set(re.findall(r'[\w$-]{2,}', text.lower())) - STOP_WORDS


@lru_cache(maxsize=4096)
def passage_tokens(content):
    return frozenset(tokens(content))


def retrieve_documents(principal, query, limit=6, *, guidance_only=False):
    words = tokens(query)
    if not words:
        return []
    with database() as db:
        from .semantic_graph import note_state
        rows = db.execute(
            'SELECT c.*,d.title,d.owner_id,d.status,d.topic,p.name AS owner_name,s.source_url,s.edition,n.document_id AS guidance '
            'FROM ws_chunks c JOIN ws_documents d ON d.id=c.document_id JOIN ws_people p ON p.id=d.owner_id '
            'LEFT JOIN ws_document_sources s ON s.document_id=d.id LEFT JOIN ws_expert_notes n ON n.document_id=d.id '
            "WHERE d.status='approved' AND (?=0 OR n.document_id IS NOT NULL)", (int(guidance_only),))
        ranked = []
        current = {}
        for row in rows:
            text_words = passage_tokens(row['content'])
            title_words = passage_tokens(row['title'] + ' ' + row['topic'])
            if guidance_only and not words <= text_words | title_words:
                continue
            score = len(words & text_words) + 2 * len(words & title_words)
            if not score:
                continue
            if row['guidance']:
                if row['document_id'] not in current:
                    current[row['document_id']] = not any(note_state(db, row['document_id']).values())
                if not current[row['document_id']]:
                    continue
            ranked.append((score, dict(row)))
        matches = sorted(ranked, key=lambda pair: (-pair[0], pair[1]['id']))[:limit]
        result = []
        for score, row in matches:
            result.append({'id': row['id'], 'document_id': row['document_id'], 'title': row['title'],
                           'owner_id': row['owner_id'], 'owner_name': row['owner_name'], 'text': row['content'],
                           'type': 'approved_document', 'score': score, 'synthetic': bool(principal.get('transfer_demo')),
                           'source_url': row['source_url'], 'edition': row['edition'], 'release_applicability': 'not_inferred'})
        return result


def record_retrieval(principal, sources):
    with database() as db:
        for identifier in sorted({x['document_id'] for x in sources if x.get('document_id')}):
            event(db, principal, 'retrieved', identifier)


def knowledge_graph(principal, document_limit=3000):
    """The graph is a projection of actual records, never decorative demo people."""
    with database() as db:
        clause = "(d.status='approved' OR d.owner_id=? OR (?=1 AND d.status='submitted'))"
        args = (principal['id'], int(principal['can_review']))
        total = db.execute('SELECT COUNT(*) AS n FROM ws_documents d WHERE ' + clause, args).fetchone()['n']
        rows = db.execute('SELECT d.id,d.owner_id,d.title,d.topic,d.status,d.updated_at,p.name AS owner_name FROM ws_documents d JOIN ws_people p ON p.id=d.owner_id WHERE ' + clause + ' ORDER BY d.updated_at DESC,d.id LIMIT ?', (*args, document_limit)).fetchall()
        visible = [dict(row) for row in rows]
        ids = {row['id'] for row in visible}
        events = [dict(row) for row in db.execute('SELECT * FROM ws_events ORDER BY sequence DESC LIMIT 2000') if row['document_id'] in ids]
        access_rows = []
        if ids:
            placeholders = ','.join('?' for _ in ids)
            access_rows = [dict(row) for row in db.execute(
                f"SELECT person_id,document_id,MAX(created_at) AS last_accessed,COUNT(*) AS access_count FROM ws_events WHERE kind IN ('viewed','retrieved') AND document_id IN ({placeholders}) GROUP BY person_id,document_id",
                tuple(sorted(ids)))]
        people_ids = {principal['id']} | {row['owner_id'] for row in visible} | {row['person_id'] for row in access_rows}
        people = [dict(row) for row in db.execute('SELECT * FROM ws_people') if row['id'] in people_ids]
    nodes = [{'id': 'person:' + row['id'], 'entity_id': row['id'], 'kind': 'person', 'label': row['name'],
              'status': 'you' if row['id'] == principal['id'] else 'contributor'} for row in people]
    edges, topics = [], set()
    for doc in visible:
        did, pid, tid = 'document:' + doc['id'], 'person:' + doc['owner_id'], 'topic:' + doc['topic']
        nodes.append({'id': did, 'entity_id': doc['id'], 'kind': 'document', 'label': doc['title'], 'status': doc['status'],
                      'owner_name': doc['owner_name'], 'updated_at': doc['updated_at']})
        edges.append({'id': pid + did, 'source': pid, 'target': did, 'kind': 'contributed', 'label': 'contributed'})
        if tid not in topics:
            nodes.append({'id': tid, 'entity_id': doc['topic'], 'kind': 'topic', 'label': doc['topic'], 'status': 'topic'})
            topics.add(tid)
        edges.append({'id': did + tid, 'source': did, 'target': tid, 'kind': 'about', 'label': 'about'})
    for item in access_rows:
        edges.append({'id': f'access:{item["person_id"]}:{item["document_id"]}',
                      'source': 'person:' + item['person_id'], 'target': 'document:' + item['document_id'],
                      'kind': 'accessed', 'label': 'accessed', 'last_accessed': item['last_accessed'], 'count': item['access_count']})
    return {'nodes': nodes, 'edges': edges, 'events': [dict(item, detail=json.loads(item['detail'])) for item in events[:20]],
            'revision': max((item['sequence'] for item in events), default=0), 'updated_at': now(),
            'total_documents': total, 'truncated': total > document_limit, 'poll_interval_ms': 3000}


def graph(principal):
    from .workspace_topology import graph as topology_graph
    return topology_graph(principal)


def save_snapshot(principal, source_id, payload):
    with database() as db:
        db.execute('INSERT INTO ws_snapshots(source_id,person_id,payload,created_at) VALUES (?,?,?,?)',
                   (source_id, principal['id'], json.dumps(payload), now()))
        db.execute('INSERT INTO ws_connector_state VALUES (?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at', (source_id, 'connected', now()))
        event(db, principal, 'source_read', detail={'source_id': source_id, 'snapshot_sha256': payload['snapshot_sha256']})
        # A bounded trend history per connector; conversation citations retain their own snapshots.
        db.execute('DELETE FROM ws_snapshots WHERE source_id=? AND sequence NOT IN (SELECT sequence FROM ws_snapshots WHERE source_id=? ORDER BY sequence DESC LIMIT 120)', (source_id, source_id))


def snapshot_history(source_id):
    with database() as db:
        return [json.loads(row['payload']) for row in db.execute('SELECT payload FROM ws_snapshots WHERE source_id=? ORDER BY sequence DESC LIMIT 30', (source_id,))][::-1]


def source_failed(principal, source_id):
    with database() as db:
        db.execute('INSERT INTO ws_connector_state VALUES (?,?,?) ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at', (source_id, 'unavailable', now()))
        event(db, principal, 'source_unavailable', detail={'source_id': source_id})


def source_state(source_id):
    with database() as db:
        row = db.execute('SELECT * FROM ws_connector_state WHERE source_id=?', (source_id,)).fetchone()
        return dict(row) if row else None
