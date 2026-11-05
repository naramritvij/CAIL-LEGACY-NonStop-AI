"""Citation-backed knowledge, authorship and bounded learning relationships.

Concept identity means the same literal documentation term, never an inferred
physical dependency. Every public projection is rebuilt through document ACLs.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import re
from uuid import uuid4

from fastapi import HTTPException
from . import workspace_store as store

VERSION = 'semantic-knowledge-v2'
PRODUCTS = {'TACL': 'TACL', 'TMF': 'TMF', 'TMFCOM': 'TMF', 'PATHWAY': 'PATHWAY',
            'PATHCOM': 'PATHWAY', 'FUP': 'FUP', 'SCF': 'SCF', 'MEASURE': 'MEASURE',
            'MEASCOM': 'MEASURE', 'PEEK': 'PEEK', 'ASAP': 'ASAP', 'MOMI': 'MOMI', 'PROGNOSIS': 'PROGNOSIS'}
TOOLS = {'TMF': 'TMFCOM', 'PATHWAY': 'PATHCOM', 'MEASURE': 'MEASCOM'}
PRODUCT_RE = re.compile(r'\b(?:' + '|'.join(PRODUCTS) + r')\b', re.I)
COMMAND_RE = re.compile(r'\b(TMFCOM|PATHCOM|SCF|TACL|FUP|MEASCOM|PEEK)[ \t]+'
                        r'(STATUS|INFO|SHOW|LISTOPENS|LIST|HELP|DISPLAY|ADD|ALTER|DELETE|START|STOP|RUN|ABORT|FREEZE|THAW|CONFIGURE|SET|RESET)'
                        r'(?:[ \t]+[A-Z][A-Z0-9_.$-]*){0,2}\b')
HEADING_RE = re.compile(r'(?m)^[ \t]*(?:#{1,5}[ \t]*)?([A-Z][A-Z0-9_[-]*(?:\|[A-Z]+)?\]?(?:[ \t]+[A-Z][A-Z0-9_-]*){0,2})[ \t]+Command[ \t]*$')
EVENT_RE = re.compile(r'\b(?:(TMF|TACL|SCF|FUP|PATHWAY|PATHCOM|MEASURE|MEASCOM)[ \t]+)?'
                      r'(?:error|message|event)(?:[ \t]+number)?[ \t:#-]+(\d{2,6})\b', re.I)
OBJECT_RE = re.compile(r'\$[A-Z][A-Z0-9_]{1,30}(?:\.[A-Z][A-Z0-9_]{0,30}){0,2}\b')
VERSION_RE = re.compile(r'\b[LJHGD]\d{2}\.\d{2}\b')
SITE_RE = re.compile(r'(?<!\\)\\[A-Z][A-Z0-9_-]{1,30}\b')
METRIC_RE = re.compile(r'\b(?:CPU busy|CPU utilization|response time|queue depth|transaction rate|disk utilization|cache hit ratio)\b', re.I)
READ_ONLY = {'STATUS', 'INFO', 'SHOW', 'LISTOPENS', 'LIST', 'HELP', 'DISPLAY'}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def concept_id(kind, label):
    return 'concept:' + digest(kind + ':' + ' '.join(label.upper().split()))


def permitted(alias='d'):
    return f"({alias}.status='approved' OR {alias}.owner_id=? OR (?=1 AND {alias}.status='submitted'))"


def args(user):
    return user['id'], int(user['can_review'])


def extract(text, context=''):
    """Only literal occurrences or an explicit command heading in named scope."""
    context_products = {PRODUCTS[m.group().upper()] for m in PRODUCT_RE.finditer(context)}
    default = next(iter(context_products)) if len(context_products) == 1 else ''
    found = {}

    def add(kind, label, subsystem, match, method='literal_occurrence'):
        key = concept_id(kind, label)
        found.setdefault(key, {'id': key, 'kind': kind, 'label': label, 'subsystem': subsystem,
                              'quote': text[max(0, match.start() - 70):min(len(text), match.end() + 110)],
                              'method': method})

    for match in PRODUCT_RE.finditer(text):
        name = PRODUCTS[match.group().upper()]
        add('subsystem', name, name, match)
    for match in COMMAND_RE.finditer(text):
        label = ' '.join(match.group().split())
        add('command', label, PRODUCTS[match.group(1)], match)
    for match in HEADING_RE.finditer(text):
        if default:
            label = TOOLS.get(default, default) + ' ' + ' '.join(match.group(1).split())
            add('command', label, default, match, 'explicit_heading_in_named_manual_scope')
    for match in EVENT_RE.finditer(text):
        subsystem = PRODUCTS.get((match.group(1) or '').upper(), default)
        if subsystem:
            add('event', f'{subsystem} message {match.group(2)}', subsystem, match)
    for pattern, kind in [(OBJECT_RE, 'object_reference'), (SITE_RE, 'site_reference'),
                          (VERSION_RE, 'version'), (METRIC_RE, 'metric')]:
        for match in pattern.finditer(text):
            label = match.group() if kind != 'metric' else match.group().lower()
            add(kind, label, default, match)
    return list(found.values())


def index_document(db, document, chunks):
    previous = db.execute('SELECT * FROM ws_semantic_indexes WHERE document_id=?', (document['id'],)).fetchone()
    if previous and previous['sha256'] == document['sha256'] and previous['version'] == VERSION:
        return False
    db.execute('DELETE FROM ws_concept_mentions WHERE document_id=?', (document['id'],))
    count = 0
    for chunk in chunks:
        for item in extract(chunk['content'], document['title'] + ' ' + document['topic']):
            db.execute('INSERT OR IGNORE INTO ws_concepts VALUES (?,?,?,?)',
                       (item['id'], item['kind'], item['label'], item['subsystem']))
            db.execute('INSERT INTO ws_concept_mentions VALUES (?,?,?,?,?,?)',
                       (digest(chunk['id'] + item['id']), document['id'], chunk['id'], item['id'], item['quote'], item['method']))
            count += 1
            if count > 30000:
                raise HTTPException(422, 'This document exceeds the 30,000 semantic evidence-link limit.')
    db.execute('INSERT OR REPLACE INTO ws_semantic_indexes VALUES (?,?,?)', (document['id'], document['sha256'], VERSION))
    return True


def concept_rows(db, user, query='', limit=4000):
    term = '%' + query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
    return db.execute(
        'SELECT c.*,COUNT(DISTINCT m.document_id) AS evidence_documents,GROUP_CONCAT(DISTINCT m.document_id) AS support_docs FROM ws_concepts c '
        'JOIN ws_concept_mentions m ON m.concept_id=c.id JOIN ws_documents d ON d.id=m.document_id '
        f"WHERE {permitted()} AND c.label LIKE ? ESCAPE '\\' GROUP BY c.id "
        "ORDER BY CASE c.kind WHEN 'subsystem' THEN 0 WHEN 'command' THEN 1 WHEN 'event' THEN 2 ELSE 3 END,c.label LIMIT ?",
        (*args(user), term, limit)).fetchall()


def require_concept(db, user, identifier):
    row = db.execute('SELECT c.* FROM ws_concepts c JOIN ws_concept_mentions m ON m.concept_id=c.id '
                     f'JOIN ws_documents d ON d.id=m.document_id WHERE c.id=? AND {permitted()} LIMIT 1',
                     (identifier, *args(user))).fetchone()
    if not row:
        raise HTTPException(404, 'Concept not found or not accessible')
    return dict(row)


def citation(db, user, identifier):
    row = db.execute('SELECT c.*,d.owner_id,d.status,d.title,d.sha256 FROM ws_chunks c '
                     f'JOIN ws_documents d ON d.id=c.document_id WHERE c.id=? AND {permitted()}',
                     (identifier, *args(user))).fetchone()
    if not row:
        raise HTTPException(404, 'Citation not found or not accessible')
    return dict(row)


def note_state(db, identifier):
    superseded = db.execute("SELECT 1 FROM ws_document_editions e JOIN ws_documents d ON d.id=e.newer_id "
                            "WHERE e.previous_id=? AND d.status='approved' LIMIT 1", (identifier,)).fetchone()
    changed = db.execute(
        "SELECT 1 FROM ws_note_citations n LEFT JOIN ws_chunks c ON c.id=n.citation_id "
        "LEFT JOIN ws_documents d ON d.id=c.document_id WHERE n.document_id=? AND "
        "(c.id IS NULL OR d.status!='approved' OR d.sha256!=n.source_hash OR EXISTS "
        "(SELECT 1 FROM ws_document_editions e JOIN ws_documents newer ON newer.id=e.newer_id "
        "WHERE e.previous_id=d.id AND newer.status='approved')) LIMIT 1", (identifier,)).fetchone()
    if not changed:
        changed = db.execute('SELECT 1 FROM ws_note_concepts s WHERE s.document_id=? AND NOT EXISTS '
                             '(SELECT 1 FROM ws_note_citations n JOIN ws_concept_mentions m ON m.citation_id=n.citation_id '
                             'WHERE n.document_id=s.document_id AND m.concept_id=s.concept_id) LIMIT 1', (identifier,)).fetchone()
    return {'superseded': bool(superseded), 'needs_review': bool(changed)}


def note_metadata(db, identifier):
    row = db.execute('SELECT * FROM ws_expert_notes WHERE document_id=?', (identifier,)).fetchone()
    if not row:
        return None
    return {**dict(row), **note_state(db, identifier),
            'concept_ids': [r['concept_id'] for r in db.execute('SELECT concept_id FROM ws_note_concepts WHERE document_id=?', (identifier,))],
            'citations': [dict(r) for r in db.execute('SELECT citation_id,relation FROM ws_note_citations WHERE document_id=?', (identifier,))]}


def validate_approval(db, document):
    if db.execute('SELECT 1 FROM ws_expert_notes WHERE document_id=?', (document['id'],)).fetchone():
        state = note_state(db, document['id'])
        if state['needs_review'] or state['superseded']:
            raise HTTPException(409, 'Update this guidance with current, approved source citations before approving it.')


def link_edition(db, user, newer, previous):
    if newer == previous:
        raise HTTPException(422, 'An edition cannot replace itself.')
    for identifier in (newer, previous):
        row = db.execute('SELECT * FROM ws_documents WHERE id=? AND owner_id=?', (identifier, user['id'])).fetchone()
        if not row:
            raise HTTPException(404, 'Both editions must be owned by the signed-in contributor.')
    if db.execute('SELECT 1 FROM ws_document_editions WHERE newer_id=?', (newer,)).fetchone():
        raise HTTPException(409, 'This document already has an edition predecessor.')
    current = previous
    for _ in range(100):
        if current == newer:
            raise HTTPException(409, 'Edition links cannot form a cycle.')
        row = db.execute('SELECT previous_id FROM ws_document_editions WHERE newer_id=?', (current,)).fetchone()
        if not row:
            break
        current = row['previous_id']
    else:
        raise HTTPException(422, 'Edition chain is too long.')
    db.execute('INSERT INTO ws_document_editions VALUES (?,?,?)', (newer, previous, store.now()))
    store.event(db, user, 'edition_linked', newer, {'previous_id': previous})


def create_note(user, body):
    if len({c['citation_id'] for c in body['citations']}) != len(body['citations']):
        raise HTTPException(422, 'Choose each citation once.')
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        for identifier in body['concept_ids']:
            require_concept(db, user, identifier)
        citations = [(item, citation(db, user, item['citation_id'])) for item in body['citations']]
        for concept in body['concept_ids']:
            if not any(db.execute('SELECT 1 FROM ws_concept_mentions WHERE concept_id=? AND citation_id=?',
                                  (concept, source['id'])).fetchone() for _, source in citations):
                raise HTTPException(422, 'Every guidance concept must be supported by a selected exact citation.')
        identifier = store.insert_document(db, user, body['title'], 'signed-guidance.md', body['content'],
                                           body.get('topic', 'Expert guidance'), body.get('target_node_id'))
        db.execute('INSERT INTO ws_expert_notes VALUES (?,?,?)', (identifier, body['category'], store.now()))
        for cid in sorted(set(body['concept_ids'])):
            db.execute('INSERT INTO ws_note_concepts VALUES (?,?)', (identifier, cid))
        for item, source in citations:
            db.execute('INSERT INTO ws_note_citations VALUES (?,?,?,?)',
                       (identifier, source['id'], item['relation'], source['sha256']))
        if body.get('supersedes_document_id'):
            link_edition(db, user, identifier, body['supersedes_document_id'])
        store.event(db, user, 'guidance_signed', identifier, {'concept_ids': body['concept_ids'], 'category': body['category']})
        db.execute('COMMIT')
    return store.document(user, identifier, record_access=False)


def profile(user, role=None, share_activity=None):
    with store.database() as db:
        if role is not None:
            db.execute('INSERT INTO ws_learning_profiles VALUES (?,?,?) ON CONFLICT(person_id) '
                       'DO UPDATE SET role=excluded.role,share_activity=excluded.share_activity',
                       (user['id'], role, int(bool(share_activity))))
            db.execute('UPDATE ws_learning_activity SET shared=? WHERE person_id=?', (int(bool(share_activity)), user['id']))
            store.event(db, user, 'learning_profile_updated')
        row = db.execute('SELECT * FROM ws_learning_profiles WHERE person_id=?', (user['id'],)).fetchone()
    return dict(row) if row else {'person_id': user['id'], 'role': 'contributor', 'share_activity': 0}


def catalog(user, query=''):
    with store.database() as db:
        concepts = [dict(r) for r in concept_rows(db, user, query, 200)]
        rows = db.execute('SELECT d.id,d.title,d.owner_id,d.status,p.name AS owner_name,n.category,n.signed_at '
                          'FROM ws_expert_notes n JOIN ws_documents d ON d.id=n.document_id JOIN ws_people p ON p.id=d.owner_id '
                          f'WHERE {permitted()} ORDER BY d.updated_at DESC LIMIT 200', args(user)).fetchall()
        notes = [{**dict(r), **note_state(db, r['id'])} for r in rows]
        term = '%' + query.replace('%', '\\%').replace('_', '\\_') + '%'
        citations = [dict(r) for r in db.execute(
            'SELECT c.id,c.document_id,d.title,d.status,substr(c.content,1,240) AS excerpt FROM ws_chunks c '
            f'JOIN ws_documents d ON d.id=c.document_id WHERE {permitted()} AND (d.title LIKE ? ESCAPE \'\\\' OR c.content LIKE ? ESCAPE \'\\\') '
            'ORDER BY d.updated_at DESC,c.ordinal LIMIT 60', (*args(user), term, term))]
        documents = [dict(r) for r in db.execute('SELECT id,title,status FROM ws_documents WHERE owner_id=? ORDER BY updated_at DESC LIMIT 200', (user['id'],))]
    return {'concepts': concepts, 'notes': notes, 'citations': citations, 'documents': documents, 'profile': profile(user)}


def start_check(user, document_id, mode='reference_recall'):
    doc = store.document(user, document_id, record_access=False)
    if doc['status'] != 'approved' or doc['owner_id'] == user['id'] or not doc.get('expert_note'):
        raise HTTPException(409, 'Choose current approved guidance written by another contributor.')
    if doc['expert_note']['needs_review'] or doc['expert_note']['superseded']:
        raise HTTPException(409, 'This guidance needs updated source review before it can be checked.')
    with store.database() as db:
        if mode == 'explanation':
            identifier = str(uuid4())
            prompt = ('Explain the operational decision in this guidance in your own words. Identify the supporting command or observation, '
                      'the reason for the decision, and the limits stated in the note. Your answer is shared with independent reviewers for this check.\n\n' + doc['title'])
            db.execute('INSERT INTO ws_knowledge_checks VALUES (?,?,?,?,?,?,?,?,?)',
                       (identifier, user['id'], document_id, 'EXPLANATION', prompt, 'pending', store.now(), None, doc['sha256']))
            return {'id': identifier, 'document_id': document_id, 'prompt': prompt, 'assessment': 'source_based_explanation',
                    'meaning': 'The existing model provides source-checked feedback when available. An independent reviewer decides whether this explanation demonstrates the cited knowledge.'}
        concepts = db.execute("SELECT c.* FROM ws_concepts c JOIN ws_note_concepts n ON n.concept_id=c.id "
                              "WHERE n.document_id=? AND c.kind='command' ORDER BY c.label", (document_id,)).fetchall()
        chosen = next((c for c in concepts if re.search(re.escape(c['label']), doc['content'], re.I)), None)
        if not chosen:
            raise HTTPException(409, 'This note needs an explicitly named command and matching command scope for a reference-recall check.')
        # The command must also occur in a source cited by this note.
        supported = db.execute('SELECT 1 FROM ws_note_citations n JOIN ws_concept_mentions m ON m.citation_id=n.citation_id '
                                'WHERE n.document_id=? AND m.concept_id=? LIMIT 1', (document_id, chosen['id'])).fetchone()
        if not supported:
            raise HTTPException(409, 'The scoped command must be present in this note’s cited evidence.')
        match = re.search(re.escape(chosen['label']), doc['content'], re.I)
        excerpt = doc['content'][max(0, match.start() - 100):min(len(doc['content']), match.end() + 180)]
        excerpt = re.sub(re.escape(chosen['label']), '____', excerpt, flags=re.I)
        prompt = f'According to “{doc["title"]}”, fill in the documented command in this excerpt:\n\n{excerpt}'
        identifier = str(uuid4())
        db.execute('INSERT INTO ws_knowledge_checks VALUES (?,?,?,?,?,?,?,?,?)',
                   (identifier, user['id'], document_id, chosen['label'], prompt, 'pending', store.now(), None, doc['sha256']))
    return {'id': identifier, 'document_id': document_id, 'prompt': prompt, 'assessment': 'source_based_command_recall',
            'meaning': 'A pass records recall of this specific reference, not operational certification.'}


def finish_check(user, identifier, answer):
    with store.database() as db:
        mode = db.execute('SELECT expected FROM ws_knowledge_checks WHERE id=? AND person_id=?', (identifier, user['id'])).fetchone()
    if mode and mode['expected'] == 'EXPLANATION':
        from .knowledge_assessment import submit
        return submit(user, identifier, answer)
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM ws_knowledge_checks WHERE id=? AND person_id=?', (identifier, user['id'])).fetchone()
        if not row:
            raise HTTPException(404, 'Knowledge check not found')
        doc = db.execute('SELECT * FROM ws_documents WHERE id=?', (row['document_id'],)).fetchone()
        state = note_state(db, row['document_id'])
        if not doc or doc['status'] != 'approved' or doc['sha256'] != row['document_hash'] or state['needs_review'] or state['superseded']:
            raise HTTPException(409, 'The guidance changed or needs review. Start a fresh check after review.')
        if row['state'] != 'pending':
            return {'id': identifier, 'passed': row['state'] == 'passed', 'already_completed': True}
        if (datetime.now(timezone.utc) - datetime.fromisoformat(row['created_at'])).total_seconds() > 1800:
            raise HTTPException(409, 'This check expired. Start a fresh check.')
        passed = ' '.join(answer.upper().split()) == ' '.join(row['expected'].upper().split())
        db.execute('UPDATE ws_knowledge_checks SET state=?,completed_at=? WHERE id=?',
                   ('passed' if passed else 'failed', store.now(), identifier))
        if passed:
            sharing = db.execute('SELECT share_activity FROM ws_learning_profiles WHERE person_id=?', (user['id'],)).fetchone()
            db.execute('INSERT INTO ws_learning_activity VALUES (?,?,?,?,?,?,?)',
                       ('check:' + identifier, user['id'], doc['id'], None, 'knows', int(bool(sharing and sharing['share_activity'])), store.now()))
            store.event(db, user, 'knowledge_demonstrated', doc['id'], {'check_id': identifier, 'assessment': 'source_based_command_recall'})
        db.execute('COMMIT')
    return {'id': identifier, 'passed': passed, 'expected': row['expected'],
            'assessment': 'source_based_command_recall', 'feedback': 'Reference recall demonstrated.' if passed else 'Revisit the cited guidance, then try a new check.'}


def record_question(user, question, sources, request_id):
    """Never share conversation text or turn ordinary access into 'knows'."""
    doc_ids = {s['document_id'] for s in sources if s.get('document_id')}
    if not doc_ids:
        return
    with store.database() as db:
        sharing = db.execute('SELECT share_activity FROM ws_learning_profiles WHERE person_id=?', (user['id'],)).fetchone()
        for item in extract(question):
            row = db.execute('SELECT m.document_id FROM ws_concept_mentions m JOIN ws_documents d ON d.id=m.document_id '
                              "WHERE m.concept_id=? AND d.status='approved' ORDER BY m.document_id", (item['id'],)).fetchall()
            document_id = next((r['document_id'] for r in row if r['document_id'] in doc_ids), None)
            if document_id:
                result = db.execute('INSERT OR IGNORE INTO ws_learning_activity VALUES (?,?,?,?,?,?,?)',
                                   (digest(user['id'] + request_id + item['id']), user['id'], document_id, item['id'],
                                    'asked_about', int(bool(sharing and sharing['share_activity'])), store.now()))
                if result.rowcount:
                    store.event(db, user, 'question_linked', document_id, {'concept_id': item['id'], 'private_activity': True})


def project(db, user):
    concepts = concept_rows(db, user)
    nodes, edges = [], []
    available = {r['id'] for r in concepts}
    for row in concepts:
        nodes.append({'id': row['id'], 'entity_id': row['id'], 'kind': 'entity', 'entity_type': row['kind'],
                      'label': row['label'], 'subsystem': row['subsystem'], 'status': 'documented_concept',
                      'source_kind': 'semantic_knowledge', 'evidence_documents': row['evidence_documents'],
                      'permission_dataset_ids': ['document-' + d for d in row['support_docs'].split(',')[:20]]})
        parent = concept_id('subsystem', row['subsystem'])
        if row['kind'] != 'subsystem' and parent in available:
            edges.append({'id': row['id'] + ':scope', 'source': row['id'], 'target': parent, 'kind': 'belongs_to',
                          'label': 'documented under', 'basis': 'documentation_scope'})
    mentions = db.execute('SELECT m.* FROM ws_concept_mentions m JOIN ws_documents d ON d.id=m.document_id '
                           f'WHERE {permitted()} ORDER BY m.document_id,m.citation_id,m.id LIMIT 24000', args(user)).fetchall()
    from .workspace_topology import entity_id
    linked = set()
    for m in mentions:
        if m['concept_id'] not in available:
            continue
        pair = m['document_id'], m['concept_id']
        if pair not in linked:
            linked.add(pair)
            edges.append({'id': 'documents-concept:' + digest(':'.join(pair)), 'source': 'document:' + m['document_id'],
                          'target': m['concept_id'], 'kind': 'documents_concept', 'label': 'documents',
                          'document_id': m['document_id'], 'citation_id': m['citation_id'], 'basis': m['method']})
        edges.append({'id': 'evidence:' + m['id'], 'source': m['concept_id'],
                      'target': entity_id('document-' + m['document_id'], '', 'passage:' + m['citation_id']),
                      'kind': 'defined_in' if m['method'].startswith('explicit_heading') else 'referenced_in',
                      'label': 'documented in', 'document_id': m['document_id'], 'citation_id': m['citation_id'], 'basis': m['method']})
    notes = db.execute('SELECT d.*,n.category,n.signed_at FROM ws_expert_notes n JOIN ws_documents d ON d.id=n.document_id '
                        f'WHERE {permitted()} ORDER BY d.updated_at DESC LIMIT 200', args(user)).fetchall()
    note_status = {}
    note_owners = {}
    for note in notes:
        did, owner = 'document:' + note['id'], 'person:' + note['owner_id']
        state = note_state(db, note['id'])
        note_status[note['id']] = state
        note_owners[note['id']] = note['owner_id']
        nodes.append({'id': did, 'entity_id': note['id'], 'kind': 'document', 'entity_type': 'expert_note',
                      'label': note['title'], 'status': note['status'], 'needs_review': state['needs_review'],
                      'superseded': state['superseded'], 'category': note['category']})
        edges.append({'id': 'wrote:' + note['id'], 'source': owner, 'target': did, 'kind': 'wrote', 'label': 'signed guidance',
                      'document_id': note['id'], 'created_at': note['signed_at']})
        for row in db.execute('SELECT * FROM ws_note_concepts WHERE document_id=?', (note['id'],)):
            if row['concept_id'] not in available:
                continue
            edges.append({'id': 'note-about:' + note['id'] + row['concept_id'], 'source': did, 'target': row['concept_id'],
                          'kind': 'about', 'label': 'guidance about', 'document_id': note['id']})
            if note['status'] == 'approved' and not any(state.values()):
                edges.append({'id': 'expert:' + note['id'] + row['concept_id'], 'source': owner, 'target': row['concept_id'],
                              'kind': 'expert_in', 'label': 'reviewed guidance in', 'document_id': note['id'],
                              'basis': 'independently_reviewed_authored_guidance'})
        for row in db.execute('SELECT n.*,c.document_id AS source_document_id FROM ws_note_citations n JOIN ws_chunks c ON c.id=n.citation_id '
                               'JOIN ws_documents d ON d.id=c.document_id '
                               f'WHERE n.document_id=? AND {permitted()}', (note['id'], *args(user))):
            edges.append({'id': 'note-cites:' + note['id'] + row['citation_id'], 'source': did,
                          'target': entity_id('document-' + row['source_document_id'], '', 'passage:' + row['citation_id']),
                          'kind': row['relation'], 'label': {'supports': 'claims agreement with', 'contradicts': 'flags conflict with', 'cites': 'cites'}[row['relation']],
                          'citation_id': row['citation_id'], 'document_id': note['id'], 'basis': 'author_declared_citation_relation',
                          'assertion_status': 'independently_reviewed' if note['status'] == 'approved' else 'awaiting_review'})
    # A private learner sees their activity; others see it only while sharing is enabled.
    activity = db.execute('SELECT a.person_id,a.document_id,a.concept_id,a.kind,p.name,MAX(a.created_at) AS created_at,COUNT(*) AS attempts FROM ws_learning_activity a JOIN ws_people p ON p.id=a.person_id '
                           'JOIN ws_documents d ON d.id=a.document_id LEFT JOIN ws_learning_profiles lp ON lp.person_id=a.person_id '
                           f'WHERE {permitted()} AND (a.person_id=? OR (a.shared=1 AND lp.share_activity=1)) '
                           'GROUP BY a.person_id,a.document_id,a.concept_id,a.kind ORDER BY created_at DESC LIMIT 2000', (*args(user), user['id'])).fetchall()
    for a in activity:
        is_check = a['kind'] in ('knows', 'understood')
        if is_check and (a['document_id'] not in note_status or any(note_status[a['document_id']].values())):
            continue
        pid = 'person:' + a['person_id']
        nodes.append({'id': pid, 'entity_id': a['person_id'], 'kind': 'person', 'label': a['name'], 'status': 'learner'})
        target = a['concept_id'] if a['kind'] == 'asked_about' else 'document:' + a['document_id']
        activity_id = digest(a['person_id'] + a['document_id'] + (a['concept_id'] or '') + a['kind'])
        if a['kind'] == 'asked_about' and target not in available:
            continue
        edges.append({'id': 'learning:' + activity_id, 'source': pid, 'target': target, 'kind': 'knows' if is_check else a['kind'],
                      'label': 'demonstrated source explanation' if a['kind'] == 'understood' else 'demonstrated reference recall' if is_check else 'asked about',
                      'document_id': a['document_id'], 'created_at': a['created_at'], 'count': a['attempts'],
                      'basis': 'independently_reviewed_explanation' if a['kind'] == 'understood' else 'passed_reference_recall_check' if is_check else 'question_with_retrieved_source'})
        if is_check:
            edges.append({'id': 'learned:' + activity_id, 'source': pid, 'target': 'person:' + note_owners[a['document_id']],
                          'kind': 'learned_from', 'label': 'learned reference from', 'document_id': a['document_id'], 'created_at': a['created_at']})
    editions = db.execute('SELECT e.* FROM ws_document_editions e JOIN ws_documents d ON d.id=e.newer_id '
                           f'WHERE {permitted()}', args(user)).fetchall()
    for e in editions:
        old = db.execute('SELECT * FROM ws_documents WHERE id=?', (e['previous_id'],)).fetchone()
        if old and store.can_see(old, user):
            edges.append({'id': 'edition:' + e['newer_id'], 'source': 'document:' + e['newer_id'], 'target': 'document:' + e['previous_id'],
                          'kind': 'supersedes', 'label': 'new edition of', 'created_at': e['created_at'], 'document_id': e['newer_id']})
    profiles = {r['person_id']: dict(r) for r in db.execute('SELECT * FROM ws_learning_profiles')}
    needs_index = db.execute('SELECT COUNT(*) AS n FROM ws_documents d LEFT JOIN ws_semantic_indexes s ON s.document_id=d.id '
                             'WHERE d.owner_id=? AND (s.document_id IS NULL OR s.version!=? OR s.sha256!=d.sha256) '
                             "AND NOT EXISTS (SELECT 1 FROM ws_topology_datasets t WHERE t.document_id=d.id AND t.source_kind!='document_evidence')",
                             (user['id'], VERSION)).fetchone()['n']
    return nodes, edges, {'concepts': len(concepts), 'expert_notes': len(notes), 'learning_records': len(activity),
                          'needs_index': needs_index, 'concept_limit': 4000, 'evidence_link_limit': 24000,
                          'bounded': len(concepts) == 4000 or len(mentions) == 24000 or len(notes) == 200 or len(activity) == 2000,
                          'profiles': profiles}


def detail(db, user, identifier):
    node = require_concept(db, user, identifier)
    rows = db.execute('SELECT m.*,d.title,d.status,s.edition,s.source_url FROM ws_concept_mentions m '
                       'JOIN ws_documents d ON d.id=m.document_id LEFT JOIN ws_document_sources s ON s.document_id=d.id '
                       f'WHERE m.concept_id=? AND {permitted()} ORDER BY d.updated_at DESC,m.citation_id LIMIT 20',
                       (identifier, *args(user))).fetchall()
    total = db.execute('SELECT COUNT(*) AS n FROM ws_concept_mentions m JOIN ws_documents d ON d.id=m.document_id '
                        f'WHERE m.concept_id=? AND {permitted()}', (identifier, *args(user))).fetchone()['n']
    verb = node['label'].split()[1:2]
    return {'id': identifier, 'local_id': identifier, 'label': node['label'], 'entity_type': node['kind'],
            'status': 'documented_concept', 'source_kind': 'semantic_knowledge', 'observed_at': None, 'system_id': None,
            'sha256': '', 'relationship_count': total, 'properties': {
                'subsystem': node['subsystem'], 'identity_basis': 'normalized_literal_documentation_term',
                'executable': False, 'release_applicability': 'check_each_cited_edition',
                'command_class': 'read_only_reference' if verb and verb[0] in READ_ONLY else 'not_classified',
                'operational_state': 'not_inferred_from_documentation'}, 'evidence': [dict(r) for r in rows]}


def neighborhood(db, user, identifier, limit=500):
    from .workspace_topology import entity_id
    concept = require_concept(db, user, identifier)
    nodes = {identifier: {'id': identifier, 'entity_id': identifier, 'kind': 'entity', 'entity_type': concept['kind'],
                           'label': concept['label'], 'subsystem': concept['subsystem'], 'status': 'documented_concept', 'source_kind': 'semantic_knowledge'}}
    edges = {}
    rows = db.execute('SELECT m.*,d.title,d.status,d.owner_id,p.name FROM ws_concept_mentions m JOIN ws_documents d ON d.id=m.document_id '
                       f'JOIN ws_people p ON p.id=d.owner_id WHERE m.concept_id=? AND {permitted()} ORDER BY m.citation_id LIMIT ?',
                       (identifier, *args(user), min(150, limit) + 1)).fetchall()
    for m in rows[:min(150, limit)]:
        did, pid = 'document:' + m['document_id'], 'person:' + m['owner_id']
        passage = entity_id('document-' + m['document_id'], '', 'passage:' + m['citation_id'])
        nodes[did] = {'id': did, 'entity_id': m['document_id'], 'kind': 'document', 'label': m['title'], 'status': m['status'],
                      'dataset_id': 'document-' + m['document_id'], 'source_kind': 'document_evidence'}
        nodes[pid] = {'id': pid, 'entity_id': m['owner_id'], 'kind': 'person', 'label': m['name'], 'status': 'contributor', 'dataset_id': 'document-' + m['document_id']}
        nodes[passage] = {'id': passage, 'entity_id': 'passage:' + m['citation_id'], 'kind': 'entity', 'entity_type': 'passage',
                          'label': m['citation_id'], 'status': 'documented_passage', 'dataset_id': 'document-' + m['document_id'], 'source_kind': 'document_evidence'}
        for source, target, kind, label in [(identifier, passage, 'defined_in' if m['method'].startswith('explicit_heading') else 'referenced_in', 'documented in'),
                                          (did, identifier, 'documents_concept', 'documents'),
                                          (did, passage, 'contains', 'contains passage'), (pid, did, 'contributed', 'contributed')]:
            eid = ('evidence:' + m['id'] if target == passage and source == identifier else
                   'documents-concept:' + digest(m['document_id'] + ':' + identifier) if target == identifier else
                   'contains:' + m['citation_id'] if kind == 'contains' else pid + did)
            edges[eid] = {'id': eid, 'source': source, 'target': target, 'kind': kind, 'label': label,
                          'citation_id': m['citation_id'], 'document_id': m['document_id']}
    notes = db.execute('SELECT d.*,p.name FROM ws_note_concepts n JOIN ws_documents d ON d.id=n.document_id '
                        f'JOIN ws_people p ON p.id=d.owner_id WHERE n.concept_id=? AND {permitted()} ORDER BY d.updated_at DESC LIMIT 100',
                        (identifier, *args(user))).fetchall()
    for n in notes:
        did, pid = 'document:' + n['id'], 'person:' + n['owner_id']
        state = note_state(db, n['id'])
        nodes[did] = {'id': did, 'entity_id': n['id'], 'kind': 'document', 'entity_type': 'expert_note', 'label': n['title'],
                      'status': n['status'], 'dataset_id': 'document-' + n['id'], **state}
        nodes[pid] = {'id': pid, 'entity_id': n['owner_id'], 'kind': 'person', 'label': n['name'], 'status': 'contributor', 'dataset_id': 'document-' + n['id']}
        edges['note-about:' + n['id'] + identifier] = {'id': 'note-about:' + n['id'] + identifier, 'source': did, 'target': identifier, 'kind': 'about', 'label': 'guidance about', 'document_id': n['id']}
        edges['wrote:' + n['id']] = {'id': 'wrote:' + n['id'], 'source': pid, 'target': did, 'kind': 'wrote', 'label': 'signed guidance', 'document_id': n['id']}
        if n['status'] == 'approved' and not any(state.values()):
            edges['expert:' + n['id'] + identifier] = {'id': 'expert:' + n['id'] + identifier, 'source': pid, 'target': identifier, 'kind': 'expert_in',
                                                     'label': 'reviewed guidance in', 'document_id': n['id']}
    chosen = list(edges.values())[:limit]
    nodes[identifier]['permission_dataset_ids'] = list({'document-' + m['document_id'] for m in rows[:20]})
    ids = {identifier} | {e['source'] for e in chosen} | {e['target'] for e in chosen}
    return {'nodes': [n for key, n in nodes.items() if key in ids], 'edges': chosen,
            'truncated': len(rows) > min(150, limit) or len(edges) > limit or len(notes) == 100}


def trail(user, source, target):
    from .workspace_topology import graph, require_node
    with store.database() as db:
        require_node(db, user, source)
        require_node(db, user, target)
    data = graph(user)
    index = {n['id']: n for n in data['nodes']}
    if source not in index or target not in index:
        return {'found': False, 'nodes': [], 'edges': [], 'bounded': True,
                'meaning': 'A selected endpoint is outside this overview. Open its neighborhood first.'}
    adjacency = {}
    ranks = {'knows': 0, 'learned_from': 0, 'expert_in': 1, 'wrote': 2, 'supports': 3, 'contradicts': 3, 'cites': 3}
    for edge in sorted(data['edges'], key=lambda e: (ranks.get(e['kind'], 5), e['id'])):
        for a, b in [(edge['source'], edge['target']), (edge['target'], edge['source'])]:
            adjacency.setdefault(a, []).append((b, edge))
    pending, seen = deque([(source, [], [source])]), {source}
    while pending:
        current, edges, ids = pending.popleft()
        if current == target:
            return {'found': True, 'nodes': [index[i] for i in ids], 'edges': edges,
                    'meaning': 'Stored relationships; traversing an arrow backwards does not change its meaning.'}
        if len(edges) >= 8:
            continue
        for other, edge in adjacency.get(current, []):
            if other not in seen:
                seen.add(other)
                pending.append((other, edges + [edge], ids + [other]))
    return {'found': False, 'nodes': [], 'edges': [], 'bounded': True, 'meaning': 'No path within the loaded graph and eight-hop limit.'}
