"""SQLite-backed Decision DNA, version history and verifiable local audit chain.

Demo-only: audit hashes detect accidental modification, not a malicious database
administrator. Authentication is supplied by the API layer.
"""
from __future__ import annotations
import hashlib
import json
import os
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def now():
    return datetime.now(timezone.utc).isoformat()


def database_path():
    return Path(os.getenv('LEGACY_DATABASE_PATH', str(Path(tempfile.gettempdir()) / 'legacy-cail-demo.sqlite3')))


@contextmanager
def connect():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(path), timeout=8, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA busy_timeout=8000')
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('''CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, author_alias TEXT NOT NULL,
        symptoms TEXT NOT NULL, reasoning TEXT NOT NULL, rejected_action TEXT NOT NULL,
        prerequisites TEXT NOT NULL, evidence_ids TEXT NOT NULL,
        previous_lesson_id TEXT, status TEXT NOT NULL, reviewer_notes TEXT,
        created_at TEXT NOT NULL, reviewed_at TEXT,
        FOREIGN KEY(previous_lesson_id) REFERENCES lessons(id))''')
    db.execute('''CREATE TABLE IF NOT EXISTS audit (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
        event_type TEXT NOT NULL, lesson_id TEXT NOT NULL, payload TEXT NOT NULL,
        previous_hash TEXT NOT NULL, entry_hash TEXT NOT NULL)''')
    try:
        yield db
    finally:
        db.close()


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def _audit(db, event_type, lesson_id, payload):
    previous = db.execute('SELECT entry_hash FROM audit ORDER BY sequence DESC LIMIT 1').fetchone()
    prev = previous['entry_hash'] if previous else 'GENESIS'
    ts = now()
    representation = _json({'created_at': ts, 'event_type': event_type, 'lesson_id': lesson_id,
                            'payload': payload, 'previous_hash': prev})
    digest = hashlib.sha256(representation.encode()).hexdigest()
    db.execute('''INSERT INTO audit(created_at,event_type,lesson_id,payload,previous_hash,entry_hash)
                  VALUES (?,?,?,?,?,?)''', (ts, event_type, lesson_id, _json(payload), prev, digest))


def _record(row):
    if row is None:
        return None
    d = dict(row)
    for name in ('prerequisites', 'evidence_ids'):
        d[name] = json.loads(d[name])
    return d


def create_lesson(incident_id, author_alias, symptoms, reasoning, rejected_action,
                  prerequisites, evidence_ids, previous_lesson_id=None):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if previous_lesson_id:
            previous = db.execute('SELECT incident_id,status FROM lessons WHERE id=?', (previous_lesson_id,)).fetchone()
            if previous is None or previous['status'] != 'approved' or previous['incident_id'] != incident_id:
                db.execute('ROLLBACK')
                raise ValueError('Previous lesson must be approved and refer to the same incident')
        lesson_id = str(uuid4())
        created = now()
        db.execute('''INSERT INTO lessons
            (id, incident_id, author_alias, symptoms, reasoning, rejected_action,
             prerequisites, evidence_ids, previous_lesson_id, status, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
            (lesson_id, incident_id, author_alias, symptoms, reasoning, rejected_action,
             _json(prerequisites), _json(evidence_ids), previous_lesson_id, 'draft', created))
        _audit(db, 'lesson_created', lesson_id, {'incident_id': incident_id, 'status': 'draft'})
        db.execute('COMMIT')
        return get_lesson(lesson_id)


def get_lesson(lesson_id):
    with connect() as db:
        return _record(db.execute('SELECT * FROM lessons WHERE id=?', (lesson_id,)).fetchone())


def list_lessons(incident_id=None, status='approved'):
    where, values = [], []
    if incident_id:
        where.append('incident_id=?')
        values.append(incident_id)
    if status != 'all':
        where.append('status=?')
        values.append(status)
    clause = ' WHERE ' + ' AND '.join(where) if where else ''
    with connect() as db:
        return [_record(x) for x in db.execute('SELECT * FROM lessons' + clause +
                                               ' ORDER BY created_at DESC, id DESC LIMIT 100', values).fetchall()]


def transition_lesson(lesson_id, expected, new_status, event_type, reviewer_notes=None):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        existing = db.execute('SELECT status FROM lessons WHERE id=?', (lesson_id,)).fetchone()
        if existing is None:
            db.execute('ROLLBACK')
            return 'missing'
        if existing['status'] != expected:
            db.execute('ROLLBACK')
            return 'invalid_state'
        reviewed_at = now() if new_status in ('approved', 'rejected') else None
        db.execute('UPDATE lessons SET status=?, reviewer_notes=?, reviewed_at=? WHERE id=?',
                   (new_status, reviewer_notes, reviewed_at, lesson_id))
        _audit(db, event_type, lesson_id, {'before': expected, 'after': new_status,
                                           'reviewer_notes': reviewer_notes})
        db.execute('COMMIT')
        return 'ok'


def verify_audit():
    with connect() as db:
        rows = db.execute('SELECT * FROM audit ORDER BY sequence').fetchall()
    previous = 'GENESIS'
    for row in rows:
        if row['previous_hash'] != previous:
            return {'valid': False, 'entries': len(rows), 'failed_at': row['sequence']}
        representation = _json({'created_at': row['created_at'], 'event_type': row['event_type'],
                                'lesson_id': row['lesson_id'], 'payload': json.loads(row['payload']),
                                'previous_hash': row['previous_hash']})
        if hashlib.sha256(representation.encode()).hexdigest() != row['entry_hash']:
            return {'valid': False, 'entries': len(rows), 'failed_at': row['sequence']}
        previous = row['entry_hash']
    return {'valid': True, 'entries': len(rows), 'failed_at': None,
            'warning': 'Unkeyed local audit hashes are not tamper-proof against an administrator'}
