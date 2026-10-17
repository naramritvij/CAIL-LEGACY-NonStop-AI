"""HTTP contract tests for LEGACY's complete synthetic read-only workspace.

No Ollama calls, real HPE connectors or writes to the persistent demo DB.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import grounded_investigation as gi

API = '/api/v1'
EXPERT = {'X-Legacy-Expert-Key': 'workspace-demo-expert-12345678'}
REVIEWER = {'X-Legacy-Reviewer-Key': 'workspace-demo-reviewer-87654321'}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'workspace.sqlite3'))
    monkeypatch.setenv('LEGACY_EXPERT_KEY', EXPERT['X-Legacy-Expert-Key'])
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', REVIEWER['X-Legacy-Reviewer-Key'])

    def no_llm(_payload):
        raise AssertionError('Read-only workspace must never invoke local Ollama')
    monkeypatch.setattr(gi, '_call_local_model', no_llm)
    return TestClient(app)


@pytest.mark.parametrize('incident,unsafe', [
    ('INC-DISK-001', 'purge_files'),
    ('INC-PATH-002', 'restart_service'),
])
def test_workspace_reuses_evidence_sentinel_and_handover_without_model(client, incident, unsafe):
    response = client.get(f'{API}/incidents/{incident}/workspace')
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['mode'] == 'synthetic_read_only_incident_workspace'
    assert data['incident_id'] == incident
    assert data['synthetic'] is True and data['incident']['synthetic'] is True
    assert data['root_cause_status'] == 'not_established'
    assert data['analysis']['root_cause_status'] == 'not_established'
    assert data['grounded_brief']['root_cause_status'] == 'not_established'
    assert data['missing_evidence'] == data['incident']['unknowns']
    assert data['shift_handover_excerpt']['operator_signed'] is False
    assert data['sentinel_independent_of_ai'] is True
    assert data['operational_action_authorized'] is False
    assert data['state_change_executed'] is False
    assert data['ai_investigation']['status'] == 'not_requested'
    assert data['ai_investigation']['claims_semantically_verified'] is False
    assert data['ai_investigation']['needs_separate_model_call'] is True

    previews = {p['action_id']: p for p in data['sentinel_previews']}
    assert len(previews) == 4
    assert previews[unsafe]['allowed'] is False
    assert previews[unsafe]['simulation_only'] is True
    assert previews[unsafe]['output'] is None
    assert any(x['allowed'] and x['simulation_only'] for x in previews.values())
    assert data['reviewed_knowledge']['relevant_approved_lessons'] == []
    assert data['training_challenges'] == []
    assert data['legacy_tree']['nodes'] == []


def _lesson(client, status='draft'):
    reply = client.post(f'{API}/knowledge/lessons', headers=EXPERT, json={
        'incident_id': 'INC-DISK-001',
        'author_alias': 'Synthetic Mentor (Not Verified)',
        'symptoms': 'A training disk volume grew past a warning threshold.',
        'reasoning': 'Inspect synthetic event chronology and verify ownership and retention rules.',
        'rejected_action': 'purge_files',
        'prerequisites': ['File ownership', 'Check retention policy'],
        'evidence_ids': ['SIM-EVT-101', 'SIM-EVT-103'],
    })
    assert reply.status_code == 201, reply.text
    ident = reply.json()['id']
    if status in ('submitted', 'approved', 'rejected'):
        assert client.post(f'{API}/knowledge/lessons/{ident}/submit',
                           headers=EXPERT).status_code == 200
    if status in ('approved', 'rejected'):
        assert client.post(f'{API}/knowledge/lessons/{ident}/review',
                           headers=REVIEWER, json={
                               'decision': status,
                               'notes': 'Synthetic test review, not a real expert endorsement.',
                           }).status_code == 200
    return ident


def test_only_approved_knowledge_unlocks_workspace_tree_and_training(client):
    draft = _lesson(client, 'draft')
    submitted = _lesson(client, 'submitted')
    rejected = _lesson(client, 'rejected')

    before = client.get(f'{API}/incidents/INC-DISK-001/workspace',
                        params={'question': 'disk ownership retention'}).json()
    assert before['reviewed_knowledge']['relevant_approved_lessons'] == []
    assert before['legacy_tree']['nodes'] == []
    assert before['training_challenges'] == []

    good = _lesson(client, 'approved')
    after = client.get(f'{API}/incidents/INC-DISK-001/workspace',
                       params={'question': 'disk ownership retention'}).json()
    nodes = after['legacy_tree']['nodes']
    assert [x['id'] for x in nodes] == [good]
    assert after['legacy_tree']['edges'] == []
    assert after['legacy_tree']['reuse_metrics_available'] is False
    assert [x['id'] for x in after['reviewed_knowledge']['relevant_approved_lessons']] == [good]
    assert [x['lesson_id'] for x in after['training_challenges']] == [good]
    assert after['training_challenges'][0]['challenge_id'] == 'TRANSFER-DISK-A'
    assert after['training_challenges'][0]['assessment_persisted'] is False

    all_text = json.dumps(after)
    for disallowed in (draft, submitted, rejected,
                       EXPERT['X-Legacy-Expert-Key'], REVIEWER['X-Legacy-Reviewer-Key']):
        assert disallowed not in all_text
    assert 'Synthetic test review, not a real expert endorsement.' not in all_text


def test_workspace_rejects_unknown_incident_and_bad_question(client):
    assert client.get(f'{API}/incidents/NOT-REAL/workspace').status_code == 404
    assert client.get(f'{API}/incidents/INC-DISK-001/workspace',
                      params={'question': 'x'}).status_code == 422
    assert client.get(f'{API}/incidents/INC-DISK-001/workspace',
                      params={'question': 'a' * 501}).status_code == 422


def test_workspace_does_not_change_knowledge_or_audit_records(client):
    lesson_id = _lesson(client, 'approved')
    before = client.get(f'{API}/audit/verify', headers=REVIEWER).json()
    for _ in range(3):
        workspace = client.get(f'{API}/incidents/INC-DISK-001/workspace')
        assert workspace.status_code == 200
        assert workspace.json()['training_challenges'][0]['lesson_id'] == lesson_id
    after = client.get(f'{API}/audit/verify', headers=REVIEWER).json()
    assert after['valid'] is True
    assert after['entries'] == before['entries']


def test_api_security_headers_applied_to_success_and_errors(client):
    for path, code in [
        (f'{API}/health', 200),
        (f'{API}/incidents/INC-DISK-001/workspace', 200),
        (f'{API}/incidents/NO-SUCH/workspace', 404),
    ]:
        result = client.get(path, headers={'Origin': 'http://localhost:5173'})
        assert result.status_code == code
        assert result.headers['cache-control'] == 'no-store'
        assert result.headers['x-content-type-options'] == 'nosniff'
        assert result.headers['x-frame-options'] == 'DENY'
        assert result.headers['access-control-allow-origin'] == 'http://localhost:5173'

def test_corrupted_approved_provenance_cannot_unlock_workspace_training(client):
    from app.storage import connect
    ident = _lesson(client, 'approved')
    with connect() as db:
        db.execute('UPDATE lessons SET evidence_ids=? WHERE id=?',
                   (json.dumps(['SIM-EVT-999']), ident))
    result = client.get(f'{API}/incidents/INC-DISK-001/workspace',
                        params={'question': 'disk ownership retention'})
    assert result.status_code == 200
    data = result.json()
    assert data['legacy_tree']['nodes'] == []
    assert data['reviewed_knowledge']['relevant_approved_lessons'] == []
    assert data['training_challenges'] == []
    assert data['operational_action_authorized'] is False
