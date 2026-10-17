import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.storage import connect

client = TestClient(app)
E = {'X-Legacy-Expert-Key': 'expert-key-is-very-long-1234'}
R = {'X-Legacy-Reviewer-Key': 'reviewer-key-is-long-enough-5678'}


@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'records.sqlite3'))
    monkeypatch.setenv('LEGACY_EXPERT_KEY', E['X-Legacy-Expert-Key'])
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', R['X-Legacy-Reviewer-Key'])


def lesson_payload():
    return {
        'incident_id': 'INC-DISK-001', 'author_alias': 'Demo Expert',
        'symptoms': 'Capacity has increased through the shift.',
        'reasoning': 'Inspect file metadata and ownership before any removal; trend alone does not prove a cause.',
        'rejected_action': 'purge_files',
        'prerequisites': ['Confirm file ownership', 'Verify retention requirement'],
        'evidence_ids': ['SIM-EVT-101', 'SIM-EVT-103']
    }


def draft():
    response = client.post('/api/v1/knowledge/lessons', json=lesson_payload(), headers=E)
    assert response.status_code == 201, response.text
    return response.json()


def approve(item):
    assert client.post(f"/api/v1/knowledge/lessons/{item['id']}/submit", headers=E).status_code == 200
    return client.post(f"/api/v1/knowledge/lessons/{item['id']}/review",
                       headers=R, json={'decision': 'approved', 'notes': 'Reviewed against simulation evidence.'})


def test_analysis_requires_no_llm_and_has_linked_evidence():
    response = client.get('/api/v1/incidents/INC-DISK-001/analysis')
    assert response.status_code == 200
    data = response.json()
    assert data['root_cause'] is None
    assert data['root_cause_status'] == 'not_established'
    assert data['findings'][0]['evidence_ids'] == ['SIM-EVT-101', 'SIM-EVT-103']
    assert all(edge['causal'] is False for edge in data['edges'])


def test_unknown_analysis_incident_is_404():
    assert client.get('/api/v1/incidents/unknown/analysis').status_code == 404


def test_replay_is_deterministic_never_executes():
    request = {'incident_id': 'INC-DISK-001', 'action_id': 'purge_files'}
    a = client.post('/api/v1/replay', json=request).json()
    b = client.post('/api/v1/replay', json=request).json()
    assert a == b and a['state_change_executed'] is False
    assert a['policy']['allowed'] is False and a['risk_band'] == 'high'


def test_unknown_replay_has_no_invented_outcome():
    data = client.post('/api/v1/replay', json={'incident_id':'INC-DISK-001', 'action_id':'alien_action'}).json()
    assert data['known_branch'] is False and data['simulated_outcome'] is None
    assert data['policy']['allowed'] is False


def test_writes_fail_closed_without_credential(monkeypatch):
    assert client.post('/api/v1/knowledge/lessons', json=lesson_payload()).status_code == 403
    monkeypatch.delenv('LEGACY_EXPERT_KEY')
    assert client.post('/api/v1/knowledge/lessons', json=lesson_payload(), headers=E).status_code == 503


def test_draft_not_visible_publicly():
    item = draft()
    assert client.get('/api/v1/knowledge/lessons').json() == []
    assert client.get('/api/v1/knowledge/lessons', params={'status': 'all'}).status_code == 403
    assert client.get(f"/api/v1/knowledge/lessons/{item['id']}").status_code == 403
    assert client.get(f"/api/v1/knowledge/lessons/{item['id']}", headers=E).status_code == 200


def test_invalid_evidence_is_rejected():
    p = lesson_payload(); p['evidence_ids'] = ['SIM-EVT-NOT-REAL']
    assert client.post('/api/v1/knowledge/lessons', json=p, headers=E).status_code == 422


def test_requires_submit_then_independent_reviewer():
    item = draft()
    url = f"/api/v1/knowledge/lessons/{item['id']}/review"
    review = {'decision': 'approved', 'notes': 'Reviewed against simulation evidence.'}
    assert client.post(url, json=review, headers=R).status_code == 409
    client.post(f"/api/v1/knowledge/lessons/{item['id']}/submit", headers=E)
    assert client.post(url, json=review, headers=E).status_code == 403
    result = client.post(url, json=review, headers=R)
    assert result.status_code == 200 and result.json()['status'] == 'approved'
    assert len(client.get('/api/v1/knowledge/lessons').json()) == 1
    assert client.post(url, json=review, headers=R).status_code == 409


def test_approved_knowledge_is_in_shift_summary():
    item = draft()
    assert approve(item).status_code == 200
    assert client.get('/api/v1/shift-briefing').json()['approved_knowledge_records'] == 1


def test_audit_chain_detects_modified_payload():
    item = draft()
    assert approve(item).status_code == 200
    assert client.get('/api/v1/audit/verify').status_code == 403
    ok = client.get('/api/v1/audit/verify', headers=R).json()
    assert ok['valid'] is True and ok['entries'] == 3
    with connect() as db:
        db.execute("UPDATE audit SET payload=? WHERE sequence=1", ('{}',))
    invalid = client.get('/api/v1/audit/verify', headers=R).json()
    assert invalid['valid'] is False


def test_version_link_must_target_approved_same_incident():
    item = draft()
    p = lesson_payload(); p['previous_lesson_id'] = item['id']
    assert client.post('/api/v1/knowledge/lessons', json=p, headers=E).status_code == 422
    assert approve(item).status_code == 200
    assert client.post('/api/v1/knowledge/lessons', json=p, headers=E).status_code == 201
    p['incident_id'] = 'INC-PATH-002'
    p['evidence_ids'] = ['SIM-EVT-201']
    assert client.post('/api/v1/knowledge/lessons', json=p, headers=E).status_code == 422


def test_rejected_lesson_never_used_as_approved():
    item = draft()
    client.post(f"/api/v1/knowledge/lessons/{item['id']}/submit", headers=E)
    result = client.post(f"/api/v1/knowledge/lessons/{item['id']}/review", headers=R,
                         json={'decision': 'rejected', 'notes': 'Insufficient evidence for this claim.'})
    assert result.status_code == 200
    assert client.get('/api/v1/knowledge/lessons').json() == []


def test_fallback_when_ai_unreachable(monkeypatch):
    monkeypatch.setenv('OLLAMA_URL', 'http://127.0.0.1:9')
    data = client.post('/api/v1/investigate', json={
        'incident_id': 'INC-DISK-001', 'question': 'What happened to disk usage?'
    }).json()
    assert data['status'] == 'model_unavailable'
    assert data['evidence_ids']


def test_same_expert_and_reviewer_key_is_rejected(monkeypatch):
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', E['X-Legacy-Expert-Key'])
    response = client.post('/api/v1/knowledge/lessons', json=lesson_payload(), headers=E)
    assert response.status_code == 503
