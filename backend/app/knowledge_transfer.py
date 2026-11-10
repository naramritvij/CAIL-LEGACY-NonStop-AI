"""Private contributor handoffs and evidence-bound learning receipts."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import secrets
from uuid import uuid4

from fastapi import HTTPException

from . import semantic_graph as knowledge, workspace_store as store
from .demo_roster import ROSTER_ROLES
from .workspace_identity import active_members

RUBRIC = {
    'decision': 'Explains the operational decision in their own words',
    'evidence': 'Identifies the supporting cited observation or command',
    'limits': 'States the applicability and limits of the evidence',
    'safe_next_step': 'Describes the next authorized read-only check or escalation',
}


def manage_member(user, *, name=None, can_review=False, person_id=None, revoke=False):
    if not user.get('can_manage_members'):
        raise HTTPException(403, 'A configured workspace manager is required.')
    key = None if revoke else 'cail_member_' + secrets.token_urlsafe(36)
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        if person_id is None:
            if not name or not name.strip():
                raise HTTPException(422, 'Enter a contributor name.')
            if db.execute('SELECT COUNT(*) FROM ws_members').fetchone()[0] >= 200:
                raise HTTPException(409, 'The local workspace member limit is 200.')
            person_id = 'member-' + uuid4().hex
            store.record_person(db, {'id': person_id, 'name': name.strip()})
            db.execute('INSERT INTO ws_members VALUES (?,?,?,?,?,?)',
                       (person_id, hashlib.sha256(key.encode()).hexdigest(), int(can_review), 1, user['id'], store.now()))
            action = 'member_added'
        else:
            member = db.execute('SELECT * FROM ws_members WHERE person_id=?', (person_id,)).fetchone()
            if not member:
                raise HTTPException(404, 'Managed contributor not found.')
            if revoke:
                db.execute('UPDATE ws_members SET active=0 WHERE person_id=?', (person_id,))
                action = 'member_access_revoked'
            else:
                db.execute('UPDATE ws_members SET key_hash=?,active=1 WHERE person_id=?',
                           (hashlib.sha256(key.encode()).hexdigest(), person_id))
                action = 'member_key_rotated'
            db.execute('DELETE FROM ws_sessions WHERE person_id=?', (person_id,))
        store.event(db, user, action, detail={'person_id': person_id})
        db.execute('COMMIT')
    return {'id': person_id, 'active': not revoke, **({'access_key': key} if key else {})}


def directory(user, query='', offset=0, *, senior_only=False):
    with store.database() as db:
        members = active_members(db) if not user['local_demo'] else {}
        rows = db.execute(
            'SELECT d.owner_id,p.name,COUNT(*) AS documents,'
            "SUM(CASE WHEN d.status='approved' THEN 1 ELSE 0 END) AS approved_documents,"
            "SUM(CASE WHEN d.status='approved' AND n.document_id IS NOT NULL THEN 1 ELSE 0 END) AS approved_guidance "
            'FROM ws_documents d JOIN ws_people p ON p.id=d.owner_id LEFT JOIN ws_expert_notes n ON n.document_id=d.id '
            f'WHERE {knowledge.permitted()} GROUP BY d.owner_id', knowledge.args(user)).fetchall()
        counts = {row['owner_id']: dict(row) for row in rows}
        profiles = {row['person_id']: row['role'] for row in db.execute('SELECT person_id,role FROM ws_learning_profiles')}
        managed = {row['person_id']: bool(row['active']) for row in db.execute('SELECT person_id,active FROM ws_members')} if user.get('can_manage_members') else {}
        ids = set(members) | set(counts) | {user['id']} | set(managed)
        names = {row['id']: row['name'] for row in db.execute('SELECT id,name FROM ws_people')}
        relationships = db.execute(
            'SELECT d.owner_id,COUNT(DISTINCT d.id) AS accessed FROM ws_events e JOIN ws_documents d ON d.id=e.document_id '
            f"WHERE e.person_id=? AND e.kind IN ('viewed','retrieved') AND {knowledge.permitted()} GROUP BY d.owner_id",
            (user['id'], *knowledge.args(user))).fetchall()
        accessed = {row['owner_id']: row['accessed'] for row in relationships}
        people = []
        for identifier in ids:
            demo_role = ROSTER_ROLES.get(identifier) if user.get('transfer_demo') else None
            if senior_only and demo_role != 'senior':
                continue
            member = members.get(identifier, {})
            name = member.get('name') or names.get(identifier) or user['name']
            if query.casefold() not in name.casefold():
                continue
            count = counts.get(identifier, {})
            people.append({'id': identifier, 'name': name, 'role': profiles.get(identifier, 'contributor'),
                           'documents': count.get('documents', 0), 'approved_documents': count.get('approved_documents', 0),
                           'approved_guidance': count.get('approved_guidance', 0), 'accessed_documents': accessed.get(identifier, 0),
                           'active': identifier in members or identifier == user['id'],
                           'can_request': identifier != user['id'] and identifier in members,
                           'managed': identifier in managed, 'can_review': member.get('can_review', False),
                           **({'demo_role': demo_role} if demo_role else {})})
    people.sort(key=lambda person: (person['name'].casefold(), person['id']))
    return {'contributors': people[offset:offset + 50], 'total': len(people),
            'next_offset': offset + 50 if offset + 50 < len(people) else None}


def contributions(user, person_id, offset=0):
    with store.database() as db:
        condition = f'd.owner_id=? AND {knowledge.permitted()}'
        params = (person_id, *knowledge.args(user))
        total = db.execute('SELECT COUNT(*) FROM ws_documents d WHERE ' + condition, params).fetchone()[0]
        member = active_members(db).get(person_id) if not user['local_demo'] else None
        managed = user.get('can_manage_members') and db.execute('SELECT 1 FROM ws_members WHERE person_id=?', (person_id,)).fetchone()
        if not total and person_id != user['id'] and not member and not managed:
            raise HTTPException(404, 'Contributor not found.')
        person = member or db.execute('SELECT name FROM ws_people WHERE id=?', (person_id,)).fetchone()
        docs = db.execute(
            'SELECT d.id,d.title,d.status,d.topic,d.updated_at,n.category FROM ws_documents d '
            'LEFT JOIN ws_expert_notes n ON n.document_id=d.id WHERE ' + condition +
            ' ORDER BY d.updated_at DESC,d.id LIMIT 30 OFFSET ?', (*params, offset)).fetchall()
        return {'person': {'id': person_id, 'name': person['name'], 'can_request': bool(member and person_id != user['id'])},
                'documents': [dict(doc) for doc in docs], 'total': total,
                'next_offset': offset + 30 if offset + 30 < total else None}


def review_queue(user):
    if not user['can_review']:
        return {'documents': []}
    with store.database() as db:
        rows = db.execute(
            'SELECT d.id,d.title,p.name AS owner_name,n.category FROM ws_documents d JOIN ws_people p ON p.id=d.owner_id '
            "LEFT JOIN ws_expert_notes n ON n.document_id=d.id WHERE d.status='submitted' AND d.owner_id!=? "
            'ORDER BY d.updated_at,d.id LIMIT 80', (user['id'],)).fetchall()
    return {'documents': [dict(row) for row in rows]}


def require_handoff(db, user, identifier):
    if user.get('local_demo'):
        raise HTTPException(404, 'Guidance request not found.')
    row = db.execute('SELECT h.*,p.name AS requester_name,c.name AS contributor_name FROM ws_handoffs h '
                     'JOIN ws_people p ON p.id=h.requester_id JOIN ws_people c ON c.id=h.contributor_id '
                     'WHERE h.id=? AND (h.requester_id=? OR h.contributor_id=?)',
                     (identifier, user['id'], user['id'])).fetchone()
    if not row:
        raise HTTPException(404, 'Guidance request not found.')
    return row


def latest_check(db, row):
    return db.execute(
        'SELECT c.id,c.prompt,c.state,c.created_at,c.completed_at,c.document_hash,b.criteria,'
        'r.reviewed_at,r.review_notes,p.name AS reviewer_name FROM ws_handoff_checks b '
        'JOIN ws_knowledge_checks c ON c.id=b.check_id LEFT JOIN ws_check_reviews r ON r.check_id=c.id '
        'LEFT JOIN ws_people p ON p.id=r.reviewer_id WHERE b.handoff_id=? AND c.document_id=? '
        'ORDER BY c.created_at DESC,c.id DESC LIMIT 1', (row['id'], row['guidance_id'])).fetchone()


def handoff_view(db, user, row):
    item = {key: row[key] for key in ('id', 'requester_id', 'requester_name', 'contributor_id', 'contributor_name',
                                     'question', 'created_at', 'updated_at')}
    item.update(state='requested', context=None, guidance=None, assessment=None)
    context = db.execute('SELECT id,title,owner_id,status FROM ws_documents WHERE id=?', (row['context_id'],)).fetchone()
    if context and store.can_see(context, user):
        item['context'] = {'id': context['id'], 'title': context['title']}
    doc = db.execute('SELECT id,title,owner_id,status,sha256,reviewer_id,review_notes FROM ws_documents WHERE id=?',
                     (row['guidance_id'],)).fetchone()
    if doc:
        current = knowledge.note_state(db, doc['id'])
        if store.can_see(doc, user):
            item['guidance'] = {'id': doc['id'], 'title': doc['title'], 'status': doc['status'],
                                'review_notes': doc['review_notes'] if user['id'] == doc['owner_id'] else None}
        if doc['status'] == 'draft':
            item['state'] = 'drafting'
        elif doc['status'] == 'submitted':
            item['state'] = 'guidance_review'
        elif doc['status'] == 'rejected':
            item['state'] = 'guidance_returned'
        elif any(current.values()):
            item['state'] = 'source_review'
        else:
            item['state'] = 'ready_to_explain'
            check = latest_check(db, row)
            if check and check['document_hash'] == doc['sha256']:
                if check['state'] == 'awaiting_review':
                    item['state'] = 'explanation_review'
                elif check['state'] == 'failed':
                    item['state'] = 'explanation_returned'
                elif check['state'] == 'passed':
                    item['state'] = 'verified'
                item['assessment'] = {'state': check['state'], 'reviewed_at': check['reviewed_at'],
                                      'reviewer_name': check['reviewer_name'],
                                      'feedback': check['review_notes'] if user['id'] == row['requester_id'] else None}
    if row['closed_by']:
        item['state'] = 'closed'
    return item


def list_handoffs(user, offset=0):
    if user.get('local_demo'):
        return {'requests': [], 'next_offset': None}
    with store.database() as db:
        rows = db.execute('SELECT h.*,p.name AS requester_name,c.name AS contributor_name FROM ws_handoffs h '
                          'JOIN ws_people p ON p.id=h.requester_id JOIN ws_people c ON c.id=h.contributor_id '
                          'WHERE h.requester_id=? OR h.contributor_id=? ORDER BY h.updated_at DESC,h.id LIMIT 41 OFFSET ?',
                          (user['id'], user['id'], offset)).fetchall()
        return {'requests': [handoff_view(db, user, row) for row in rows[:40]],
                'next_offset': offset + 40 if len(rows) > 40 else None}


def request_guidance(user, contributor_id, question, request_key, context_id=None):
    if user['local_demo'] or contributor_id == user['id']:
        raise HTTPException(403, 'A handoff requires two separate signed-in operators.')
    question = question.strip()
    if len(question) < 12:
        raise HTTPException(422, 'Describe what you need to understand in at least 12 characters.')
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        previous = db.execute('SELECT * FROM ws_handoffs WHERE requester_id=? AND request_key=?', (user['id'], request_key)).fetchone()
        if previous:
            if (previous['contributor_id'], previous['question'], previous['context_id']) != (contributor_id, question, context_id):
                raise HTTPException(409, 'This request key belongs to a different handoff.')
            return handoff_view(db, user, require_handoff(db, user, previous['id']))
        member = active_members(db).get(contributor_id)
        if not member:
            raise HTTPException(404, 'Choose an active contributor.')
        if context_id and not db.execute("SELECT 1 FROM ws_documents WHERE id=? AND owner_id=? AND status='approved'",
                                         (context_id, contributor_id)).fetchone():
            raise HTTPException(404, 'Choose an approved contribution from this person.')
        store.record_person(db, member)
        identifier, timestamp = str(uuid4()), store.now()
        db.execute('INSERT INTO ws_handoffs VALUES (?,?,?,?,?,NULL,?,?,?,NULL)',
                   (identifier, user['id'], contributor_id, question, context_id, request_key, timestamp, timestamp))
        store.event(db, user, 'guidance_requested')
        db.execute('COMMIT')
        return handoff_view(db, user, require_handoff(db, user, identifier))


def link_guidance(db, user, identifier, document_id, *, reuse=False):
    row = require_handoff(db, user, identifier)
    if row['contributor_id'] != user['id'] or row['closed_by']:
        raise HTTPException(403, 'The assigned contributor can respond to an open request.')
    note = db.execute('SELECT d.status FROM ws_documents d JOIN ws_expert_notes n ON n.document_id=d.id WHERE d.id=? AND d.owner_id=?',
                      (document_id, user['id'])).fetchone()
    if not note:
        raise HTTPException(404, 'Choose your own signed guidance.')
    if reuse and (note['status'] != 'approved' or any(knowledge.note_state(db, document_id).values())):
        raise HTTPException(409, 'Only current approved guidance can be reused.')
    if row['guidance_id'] == document_id:
        return
    old = db.execute('SELECT status FROM ws_documents WHERE id=?', (row['guidance_id'],)).fetchone()
    if old and (old['status'] == 'submitted' or (old['status'] == 'approved' and not any(knowledge.note_state(db, row['guidance_id']).values()))):
        raise HTTPException(409, 'This request already has current guidance. Complete its review and assessment.')
    db.execute('UPDATE ws_handoffs SET guidance_id=?,updated_at=? WHERE id=?', (document_id, store.now(), identifier))
    store.event(db, user, 'guidance_response_linked', detail={
        'handoff_id': identifier, 'guidance_id': document_id, 'previous_guidance_id': row['guidance_id'],
    })


def close_handoff(user, identifier):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = require_handoff(db, user, identifier)
        if not row['closed_by']:
            db.execute('UPDATE ws_handoffs SET closed_by=?,updated_at=? WHERE id=?', (user['id'], store.now(), identifier))
            store.event(db, user, 'guidance_request_closed')
        db.execute('COMMIT')
    return {'closed': True}


def check_handoff(db, user, identifier, document_id):
    row = require_handoff(db, user, identifier)
    if row['requester_id'] != user['id'] or row['closed_by'] or row['guidance_id'] != document_id:
        raise HTTPException(409, 'This handoff no longer accepts an explanation for that guidance.')
    current = handoff_view(db, user, row)
    if current['state'] not in ('ready_to_explain', 'explanation_returned'):
        raise HTTPException(409, 'The handoff needs current approved guidance and an open assessment.')
    previous = latest_check(db, row)
    if previous and previous['state'] == 'pending' and (datetime.now(timezone.utc) - datetime.fromisoformat(previous['created_at'])).total_seconds() <= 1800:
        return previous
    return None


def check_link(db, check):
    handoff = db.execute('SELECT h.*,b.criteria FROM ws_handoff_checks b JOIN ws_handoffs h ON h.id=b.handoff_id WHERE b.check_id=?',
                         (check['id'],)).fetchone()
    if handoff and (handoff['closed_by'] or handoff['guidance_id'] != check['document_id'] or handoff['requester_id'] != check['person_id']):
        raise HTTPException(409, 'The handoff was closed or its guidance changed.')
    return handoff


def receipt(user, identifier):
    with store.database() as db:
        row = require_handoff(db, user, identifier)
        view = handoff_view(db, user, row)
        if view['state'] != 'verified':
            raise HTTPException(409, 'Current guidance and an independently reviewed explanation are required.')
        check = latest_check(db, row)
        doc = db.execute('SELECT sha256,reviewer_id FROM ws_documents WHERE id=?', (row['guidance_id'],)).fetchone()
        citations = db.execute(
            'SELECT n.citation_id,n.source_hash,n.relation,d.title,s.edition FROM ws_note_citations n '
            'JOIN ws_chunks c ON c.id=n.citation_id JOIN ws_documents d ON d.id=c.document_id '
            'LEFT JOIN ws_document_sources s ON s.document_id=d.id WHERE n.document_id=? ORDER BY n.citation_id',
            (row['guidance_id'],)).fetchall()
        return {'handoff_id': identifier, 'learner': row['requester_name'], 'contributor': row['contributor_name'],
                'guidance': view['guidance']['title'], 'guidance_id': row['guidance_id'], 'guidance_sha256': doc['sha256'],
                'guidance_reviewer_id': doc['reviewer_id'], 'explanation_reviewer': check['reviewer_name'],
                'reviewed_at': check['reviewed_at'], 'criteria': [RUBRIC[key] for key in json.loads(check['criteria'])],
                'sources': [dict(citation) for citation in citations], 'scope': 'reviewed explanation of this guidance edition'}


def graph_connections(db, user):
    if user.get('local_demo'):
        return [], []
    rows = db.execute(
        'SELECT h.id,h.requester_id,h.contributor_id,h.created_at,p.name AS requester_name,c.name AS contributor_name '
        'FROM ws_handoffs h JOIN ws_people p ON p.id=h.requester_id JOIN ws_people c ON c.id=h.contributor_id '
        'WHERE h.closed_by IS NULL AND (h.requester_id=? OR h.contributor_id=?) ORDER BY h.updated_at DESC LIMIT 200',
        (user['id'], user['id'])).fetchall()
    nodes, edges = {}, []
    for row in rows:
        for role in ('requester', 'contributor'):
            person_id = row[role + '_id']
            identifier = 'person:' + person_id
            nodes[identifier] = {'id': identifier, 'entity_id': person_id, 'kind': 'person',
                                 'label': row[role + '_name'], 'status': 'you' if person_id == user['id'] else 'contributor'}
        edges.append({'id': 'handoff:' + row['id'], 'source': 'person:' + row['requester_id'],
                      'target': 'person:' + row['contributor_id'], 'kind': 'guidance_requested',
                      'label': 'requested guidance', 'created_at': row['created_at'], 'basis': 'participant_only_handoff'})
    return list(nodes.values()), edges
