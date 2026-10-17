"""Approved-only retrieval and transfer challenge integration tests."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.retrieval import retrieve_approved
from app.scenarios import get_incident

client = TestClient(app)
E = {'X-Legacy-Expert-Key': 'expert-key-is-very-long-1234'}
R = {'X-Legacy-Reviewer-Key': 'reviewer-key-is-long-enough-5678'}


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'sprint3.sqlite3'))
    monkeypatch.setenv('LEGACY_EXPERT_KEY', E['X-Legacy-Expert-Key'])
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', R['X-Legacy-Reviewer-Key'])


def approved_lesson(incident_id='INC-DISK-001'):
    disk = incident_id == 'INC-DISK-001'
    payload = {
        'incident_id': incident_id,
        'author_alias': 'Synthetic Demo Expert',
        'symptoms': 'Disk capacity increased sharply in a simulated shift.' if disk
                    else 'Service latency increased followed by instance unavailability.',
        'reasoning': 'Verify file ownership and retention constraints before changing storage.' if disk
                     else 'Inspect process state and dependencies before restarting a service.',
        'rejected_action': 'purge_files' if disk else 'restart_service',
        'prerequisites': ['File ownership', 'Retention'] if disk else ['Process state', 'Dependency state'],
        'evidence_ids': ['SIM-EVT-101', 'SIM-EVT-103'] if disk else ['SIM-EVT-201', 'SIM-EVT-202'],
    }
    create = client.post('/api/v1/knowledge/lessons', json=payload, headers=E)
    assert create.status_code == 201, create.text
    ident = create.json()['id']
    assert client.post(f'/api/v1/knowledge/lessons/{ident}/submit', headers=E).status_code == 200
    review = client.post(f'/api/v1/knowledge/lessons/{ident}/review', headers=R,
                         json={'decision': 'approved', 'notes': 'Approved for synthetic rubric demonstration.'})
    assert review.status_code == 200, review.text
    return ident


def valid_answer():
    return {
        'action_id': 'inspect_disk_growth',
        'evidence_ids': ['TRAIN-EVT-301', 'TRAIN-EVT-302'],
        'prerequisites': ['Verify file ownership', 'Check retention policy'],
        'reasoning': 'Before making any change, verify the files and investigate the evidence.'
    }


def test_no_approved_lesson_returns_empty_retrieval():
    answer = client.post('/api/v1/knowledge/retrieve', json={
        'incident_id': 'INC-DISK-001', 'query': 'capacity ownership'}).json()
    assert answer['approved_lessons'] == []
    assert answer['status'] == 'no_relevant_approved_lessons'


def test_approved_lesson_is_retrieved_with_provenance():
    ident = approved_lesson()
    answer = client.post('/api/v1/knowledge/retrieve', json={
        'incident_id': 'INC-DISK-001', 'query': 'disk ownership retention'}).json()
    assert answer['approved_lessons'][0]['id'] == ident
    assert answer['approved_lessons'][0]['citation']['review_status'] == 'approved'
    assert answer['verified_for_live_use'] is False


def test_retrieval_never_trusts_unapproved_or_bad_event_ids():
    lesson = {'id': 'FAKE', 'status': 'draft', 'incident_id': 'INC-DISK-001',
              'evidence_ids': ['SIM-EVT-101'], 'reasoning': 'disk capacity'}
    incident = get_incident('INC-DISK-001')
    assert retrieve_approved('disk capacity', incident, [lesson])['approved_lessons'] == []
    lesson['status'] = 'approved'
    lesson['evidence_ids'] = ['SIM-EVT-999']
    assert retrieve_approved('disk capacity', incident, [lesson])['approved_lessons'] == []


def test_retrieval_input_limits_and_nonexistent_incident():
    assert client.post('/api/v1/knowledge/retrieve', json={
        'incident_id': 'INC-DISK-001', 'query': 'disk', 'max_lessons': 99}).status_code == 422
    assert client.post('/api/v1/knowledge/retrieve', json={
        'incident_id': 'missing', 'query': 'disk'}).status_code == 404


def test_claim_level_evidence_is_explicitly_synthetic():
    brief = client.get('/api/v1/incidents/INC-DISK-001/grounded-brief').json()
    assert brief['root_cause_status'] == 'not_established'
    assert brief['mode'] == 'deterministic_evidence_grounding'
    assert all(claim['validation'] == 'synthetic_fixture_evidence_exists' for claim in brief['claims'])
    assert all(not claim['proves_root_cause'] for claim in brief['claims'])
    assert 'semantic_entailment' in brief['evidence_validation_level']


def test_no_challenge_from_missing_or_unreviewed_lesson():
    assert client.get('/api/v1/training/challenges/not-found').status_code == 404
    payload = {
        'incident_id': 'INC-DISK-001', 'author_alias': 'Test Expert',
        'symptoms': 'Synthetic disk capacity is growing rapidly.',
        'reasoning': 'Validate ownership and retention before any file changes.',
        'rejected_action': 'purge_files', 'prerequisites': ['Check ownership'],
        'evidence_ids': ['SIM-EVT-101']
    }
    draft = client.post('/api/v1/knowledge/lessons', json=payload, headers=E).json()
    assert client.get(f"/api/v1/training/challenges/{draft['id']}").status_code == 404


def test_approved_lesson_unlocks_changed_scenario():
    ident = approved_lesson()
    challenge = client.get(f'/api/v1/training/challenges/{ident}')
    assert challenge.status_code == 200
    data = challenge.json()
    assert data['synthetic'] is True
    assert data['challenge_id'] == 'TRANSFER-DISK-A'
    assert 'safe_first_action' not in data
    assert data['events'][0]['id'] == 'TRAIN-EVT-301'


def test_transferred_knowledge_safe_answer_scores_and_passes():
    ident = approved_lesson()
    r = client.post(f'/api/v1/training/challenges/{ident}/assess', json=valid_answer())
    assert r.status_code == 200
    data = r.json()
    assert data['score'] == 100
    assert data['passed'] is True
    assert data['state_change_executed'] is False
    assert data['attempt_persisted'] is False


def test_unsafe_action_never_passes_even_with_perfect_evidence():
    ident = approved_lesson()
    submission = valid_answer()
    submission['action_id'] = 'purge_files'
    result = client.post(f'/api/v1/training/challenges/{ident}/assess', json=submission).json()
    assert result['score'] <= 20
    assert result['passed'] is False
    assert result['safety']['unsafe_score_cap_applied'] is True
    assert result['state_change_executed'] is False


def test_fabricated_training_evidence_is_penalized():
    ident = approved_lesson()
    answer = valid_answer(); answer['evidence_ids'].append('TRAIN-EVT-999')
    data = client.post(f'/api/v1/training/challenges/{ident}/assess', json=answer).json()
    assert data['evidence']['points'] == 0
    assert data['evidence']['unsupported'] == ['TRAIN-EVT-999']
    assert data['passed'] is False


def test_missing_prerequisites_does_not_pass():
    ident = approved_lesson()
    answer = valid_answer(); answer['prerequisites'] = []
    data = client.post(f'/api/v1/training/challenges/{ident}/assess', json=answer).json()
    assert data['score'] < 75
    assert data['passed'] is False


def test_pathway_variant_has_distinct_rubric_and_safe_choice():
    ident = approved_lesson('INC-PATH-002')
    answer = {
        'action_id': 'inspect_events',
        'evidence_ids': ['TRAIN-EVT-401', 'TRAIN-EVT-402'],
        'prerequisites': ['Verify process state', 'Check dependency health'],
        'reasoning': 'Check the evidence before making any restart decisions.'
    }
    data = client.post(f'/api/v1/training/challenges/{ident}/assess', json=answer).json()
    assert data['score'] == 100 and data['passed'] is True


def test_training_grader_rejects_excessive_input():
    ident = approved_lesson()
    answer = valid_answer(); answer['reasoning'] = 'a' * 1001
    assert client.post(f'/api/v1/training/challenges/{ident}/assess',json=answer).status_code == 422
