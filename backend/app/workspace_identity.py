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

COOKIE = 'cail_workspace_session'


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


def public_identity(row, local=False):
    return {'id': row['id'], 'name': row['name'], 'local_demo': local,
            'can_review': row.get('can_review') is True,
            'can_read_live': row.get('can_read_live') is True,
            'auth_method': 'local_demo' if local else 'configured_operator_session'}


def principal(request: Request):
    users = configured_users()
    cookie = request.cookies.get(COOKIE, '')
    if cookie:
        with store.database() as db:
            session = db.execute('SELECT person_id FROM ws_sessions WHERE token_hash=? AND expires_at>?',
                                 (hashlib.sha256(cookie.encode()).hexdigest(), store.now())).fetchone()
        if session:
            row = next((row for row in users if row['id'] == session['person_id']), None)
            if row:
                result = public_identity(row)
                store.person(result)
                return result
    if not users and os.getenv('CAIL_WORKSPACE_LOCAL_DEMO', 'true').lower() == 'true':
        result = public_identity({'id': 'local-operator', 'name': os.getenv('CAIL_WORKSPACE_LOCAL_NAME', 'Local operator')[:100]}, local=True)
        store.person(result)
        return result
    raise HTTPException(401, 'Sign in with your operator access key to open this workspace.')


def login(key):
    row = next((row for row in configured_users() if hmac.compare_digest(row['key'], key)), None)
    if row is None:
        raise HTTPException(401, 'Operator key not recognized.')
    result = public_identity(row)
    store.person(result)
    token = secrets.token_urlsafe(48)
    with store.database() as db:
        db.execute('DELETE FROM ws_sessions WHERE expires_at<?', (store.now(),))
        db.execute('INSERT INTO ws_sessions VALUES (?,?,?)',
                   (hashlib.sha256(token.encode()).hexdigest(), result['id'],
                    (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat()))
    return result, token
