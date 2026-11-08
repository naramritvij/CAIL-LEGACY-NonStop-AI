"""Private, resumable synthetic rehearsals with an evidence cutoff at each decision."""
from __future__ import annotations

import hashlib
import json
from math import ceil
from uuid import uuid4

from fastapi import HTTPException

from . import rehearsal_cases, workspace_store as store


def decode(row):
    return {**dict(row), 'definition': json.loads(row['definition']), 'decisions': json.loads(row['decisions'])}


def owned(db, user, run_id):
    row = db.execute('SELECT * FROM ws_rehearsals WHERE id=? AND owner_id=?', (run_id, user['id'])).fetchone()
    if row is None:
        raise HTTPException(404, 'Rehearsal not found.')
    return decode(row)


def current_index(run):
    return min(len(run['decisions']), len(run['definition']['checkpoints']) - 1)


def minutes(value):
    hours, mins = map(int, value.split(':'))
    return hours * 60 + mins


def trend(events, threshold):
    if threshold is None or len(events) < 3:
        return None
    first, last = events[0], events[-1]
    elapsed = minutes(last['time']) - minutes(first['time'])
    rate = (last['value'] - first['value']) / elapsed
    if rate <= 0 or last['value'] >= threshold:
        return None
    return {'rate': round(rate, 3), 'threshold': threshold, 'minutes_remaining': ceil((threshold - last['value']) / rate),
            'latest_value': last['value'], 'evidence_ids': [event['id'] for event in events]}


def snapshot(run, index):
    case = run['definition']
    stage = case['checkpoints'][index]
    events = case['events'][:stage['count']]
    return {
        'run_id': run['id'], 'case_id': case['id'], 'title': case['title'], 'system': case['system'],
        'checkpoint': index + 1, 'label': stage['label'], 'level': stage['level'], 'task': stage['task'],
        'as_of': events[-1]['time'], 'events': events, 'unknowns': stage['unknowns'],
        'options': [{'id': key, 'label': case['actions'][key]} for key in stage['options']],
        'trend': trend(events, case['threshold']),
        'synthetic': True, 'execution_allowed': False, 'state_change_executed': False,
    }


def view(run):
    case = run['definition']
    return {**snapshot(run, current_index(run)),
            'checkpoint_count': len(case['checkpoints']), 'decisions': run['decisions'],
            'complete': len(run['decisions']) == len(case['checkpoints']),
            'updated_at': run['updated_at']}


def list_runs(user):
    with store.database() as db:
        rows = db.execute(
            'SELECT id,case_id,updated_at,json_array_length(decisions) AS completed_checkpoints FROM ws_rehearsals '
            'WHERE owner_id=? ORDER BY updated_at DESC,id LIMIT 40', (user['id'],)).fetchall()
    return {'cases': rehearsal_cases.catalogue(), 'runs': [dict(row) for row in rows]}


def start(user, case_id, request_id):
    try:
        case = rehearsal_cases.case_definition(case_id)
    except LookupError:
        raise HTTPException(404, 'Unknown synthetic case.') from None
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT * FROM ws_rehearsals WHERE owner_id=? AND request_id=?',
                         (user['id'], request_id)).fetchone()
        if row:
            run = decode(row)
            if run['case_id'] != case_id:
                raise HTTPException(409, 'This start request belongs to another case.')
            return view(run)
        identifier, timestamp = str(uuid4()), store.now()
        db.execute('INSERT INTO ws_rehearsals VALUES (?,?,?,?,?,?,?,?)',
                   (identifier, user['id'], case_id, request_id, timestamp, timestamp, json.dumps(case), '[]'))
        db.execute('COMMIT')
        return view(owned(db, user, identifier))


def detail(user, run_id):
    with store.database() as db:
        return view(owned(db, user, run_id))


def decide(user, run_id, checkpoint, action_id, citations):
    with store.database() as db:
        db.execute('BEGIN IMMEDIATE')
        run = owned(db, user, run_id)
        decisions = run['decisions']
        supplied = set(citations)
        if checkpoint <= len(decisions):
            saved = decisions[checkpoint - 1]
            if saved['action_id'] == action_id and set(saved['evidence_ids']) == supplied:
                return {'passed': True, 'feedback': saved['reason'], 'run': view(run)}
            raise HTTPException(409, 'That checkpoint already has a saved decision. Refresh the rehearsal.')
        index = current_index(run)
        if checkpoint != index + 1:
            raise HTTPException(409, 'Complete the current checkpoint first.')
        stage = run['definition']['checkpoints'][index]
        available = snapshot(run, index)
        visible = {event['id'] for event in available['events']}
        if not supplied <= visible:
            raise HTTPException(422, 'Choose only observations visible at this checkpoint.')
        if action_id not in stage['options']:
            raise HTTPException(422, 'Choose an action offered at this checkpoint.')
        if action_id != stage['correct']:
            feedback = ('State-changing actions are blocked. Choose an authorized read or escalation.'
                        if action_id in ('restart_service', 'delete_files') else
                        'This choice goes beyond the evidence or misses the immediate decision. Recheck the observations and limits.')
            return {'passed': False, 'feedback': feedback, 'run': view(run)}
        if not set(stage['requires']) <= supplied:
            return {'passed': False, 'feedback': 'Select the observations that support the decision. Include the relevant comparison when available.',
                    'run': view(run)}
        decisions.append({
            'checkpoint': checkpoint, 'label': stage['label'], 'as_of': available['as_of'],
            'action_id': action_id, 'action': run['definition']['actions'][action_id],
            'evidence_ids': [event['id'] for event in available['events'] if event['id'] in supplied],
            'reason': stage['rationale'], 'recorded_at': store.now(),
        })
        run['updated_at'] = store.now()
        db.execute('UPDATE ws_rehearsals SET decisions=?,updated_at=? WHERE id=?',
                   (json.dumps(decisions), run['updated_at'], run_id))
        db.execute('COMMIT')
        return {'passed': True, 'feedback': stage['rationale'], 'run': view(run)}


def conversation(user, run_id, checkpoint):
    with store.database() as db:
        run = owned(db, user, run_id)
        if checkpoint > current_index(run) + 1:
            raise HTTPException(409, 'That checkpoint has not been reached.')
        # Persist the observed prefix and keep it pinned even as the run advances.
        context = snapshot(run, checkpoint - 1)
        stage = run['definition']['checkpoints'][checkpoint - 1]
        context['next_check'] = run['definition']['actions'][stage['correct']]
    return store.new_conversation(user, rehearsal=context)


def brief(user, run_id):
    with store.database() as db:
        run = owned(db, user, run_id)
        current = view(run)
        if not current['complete']:
            raise HTTPException(409, 'Complete all three evidence decisions to produce the debrief.')
        version = hashlib.sha256(json.dumps(run['definition'], sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        return {
            'kind': 'cail_synthetic_rehearsal_debrief', 'run_id': run_id, 'case_id': current['case_id'],
            'title': current['title'], 'system': current['system'], 'operator': user['name'],
            'started_at': run['started_at'], 'completed_at': current['decisions'][-1]['recorded_at'], 'case_sha256': version,
            'observations': current['events'], 'decisions': current['decisions'], 'unresolved': current['unknowns'],
            'next_authorized_check': current['decisions'][-1]['action'], 'trend': current['trend'],
            'synthetic': True, 'execution_allowed': False, 'state_change_executed': False,
        }
