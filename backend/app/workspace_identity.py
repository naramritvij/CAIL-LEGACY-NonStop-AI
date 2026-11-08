"""Server-owned operator identities for the local workspace and invited users.

Configured access keys are a small deployment's login mechanism, not enterprise
SSO. Browser sessions never contain a role or a connector credential.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import os
import secrets

from fastapi import HTTPException, Request
from . import workspace_store as store
from .storage import database_path

COOKIE = 'cail_workspace_session'
DEMO_ROLES = ('transfer-learner', 'transfer-expert', 'transfer-reviewer')


def configured_users():
    try:
        entries = json.loads(os.getenv('CAIL_WORKSPACE_USERS', '[]'))
        if not isinstance(entries, list) or len(entries) > 200:
            raise ValueError()
        seen_ids, seen_keys = set(), set()
        for row in entries:
            if (not isinstance(row, dict) or not isinstance(row.get('id'), str) or
                    not 1 <= len(row['id']) <= 100 or not isinstance(row.get('name'), str) or
                    not 1 <= len(row['name']) <= 100 or not isinstance(row.get('key'), str) or len(row['key']) < 32 or
                    row['id'] in seen_ids or row['key'] in seen_keys):
                raise ValueError()
            seen_ids.add(row['id'])
            seen_keys.add(row['key'])
        return entries
    except (ValueError, TypeError):
        raise HTTPException(503, 'Operator identity configuration is invalid.') from None


def demo_roles(users):
    if (os.getenv('CAIL_TRANSFER_DEMO') == 'true' and os.getenv('CAIL_TRANSFER_DEMO_ROLES') == 'true'
            and os.getenv('CAIL_LIVE_ENABLED', '').lower() == 'false'
            and database_path().name == 'knowledge-transfer-demo.sqlite3'
            and not any(user.get('can_read_live') is True for user in users)
            and set(user['id'] for user in users) == set(DEMO_ROLES)):
        return {identifier: next(user for user in users if user['id'] == identifier) for identifier in DEMO_ROLES}
    return {}


def public_identity(row, local=False, managed=False, roles=()):
    return {'id': row['id'], 'name': row['name'], 'local_demo': local,
            'can_review': bool(row.get('can_review')) if managed else row.get('can_review') is True,
            'can_read_live': row.get('can_read_live') is True,
            'can_manage_members': row.get('can_manage_members') is True,
            'transfer_demo': os.getenv('CAIL_TRANSFER_DEMO') == 'true',
            'demo_roles': [{'id': role['id'], 'name': role['name']} for role in roles],
            'auth_method': 'local_demo' if local else 'member_access_key' if managed else 'configured_operator_session'}


def active_members(db):
    members = {row['id']: {'id': row['id'], 'name': row['name'], 'managed': False,
                          'can_review': row.get('can_review') is True} for row in configured_users()}
    for row in db.execute('SELECT p.id,p.name,m.can_review FROM ws_members m JOIN ws_people p ON p.id=m.person_id WHERE m.active=1'):
        members.setdefault(row['id'], {**dict(row), 'managed': True, 'can_review': bool(row['can_review'])})
    return members


def principal(request: Request):
    users = configured_users()
    roles = demo_roles(users)
    cookie = request.cookies.get(COOKIE, '')
    with store.database() as db:
        result = None
        if cookie:
            session = db.execute('SELECT person_id FROM ws_sessions WHERE token_hash=? AND expires_at>?',
                                 (hashlib.sha256(cookie.encode()).hexdigest(), store.now())).fetchone()
            if session:
                row = next((row for row in users if row['id'] == session['person_id']), None)
                if row:
                    result = public_identity(row, roles=roles.values())
                else:
                    member = db.execute('SELECT p.id,p.name,m.can_review FROM ws_members m JOIN ws_people p ON p.id=m.person_id '
                                        'WHERE m.person_id=? AND m.active=1', (session['person_id'],)).fetchone()
                    if member:
                        result = public_identity(dict(member), managed=True)
        if result is None and roles:
            result = public_identity(roles['transfer-learner'], roles=roles.values())
        if (result is None and not users and os.getenv('CAIL_WORKSPACE_LOCAL_DEMO', 'true').lower() == 'true'
                and not db.execute('SELECT 1 FROM ws_members LIMIT 1').fetchone()):
            result = public_identity({'id': 'local-operator', 'name': os.getenv('CAIL_WORKSPACE_LOCAL_NAME', 'Local operator')[:100]}, local=True)
        if result:
            # Unchanged sessions stay read-only, including graph polling.
            existing = db.execute('SELECT name FROM ws_people WHERE id=?', (result['id'],)).fetchone()
            if not existing or existing['name'] != result['name']:
                store.record_person(db, result)
            return result
    raise HTTPException(401, 'Sign in with your operator access key to open this workspace.')


def login(key):
    users = configured_users()
    row = next((row for row in users if hmac.compare_digest(row['key'].encode(), key.encode())), None)
    token = secrets.token_urlsafe(48)
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        if row:
            result = public_identity(row, roles=demo_roles(users).values())
        else:
            member = db.execute('SELECT p.id,p.name,m.can_review FROM ws_members m JOIN ws_people p ON p.id=m.person_id '
                                'WHERE m.key_hash=? AND m.active=1', (hashlib.sha256(key.encode()).hexdigest(),)).fetchone()
            if not member or any(row['id'] == member['id'] for row in users):
                raise HTTPException(401, 'Operator key not recognized.')
            result = public_identity(dict(member), managed=True)
        store.record_person(db, result)
        db.execute('DELETE FROM ws_sessions WHERE expires_at<?', (store.now(),))
        db.execute('INSERT INTO ws_sessions VALUES (?,?,?)',
                   (hashlib.sha256(token.encode()).hexdigest(), result['id'],
                    (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()))
        db.execute('COMMIT')
    return result, token
