"""Auditable read-only command-playbook routing, HPE references and safety gates."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.command_playbook import build_playbook, preview_playbook, recommend_step
from app.scenarios import get_incident

API = '/api/v1'

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'playbook.sqlite3'))
    return TestClient(app)

@pytest.mark.parametrize('incident_id,expected',[
    ('INC-DISK-001', ['disk-events','disk-asap','disk-scf-status','disk-ownership']),
    ('INC-PATH-002', ['path-events','path-status','path-server','path-asap','path-review']),
])
def test_playbooks_are_incident_scoped_evidence_linked_and_never_executable(client,incident_id,expected):
    incident=get_incident(incident_id)
    response=client.get(f'{API}/operations/incidents/{incident_id}/playbook')
    assert response.status_code==200
    data=response.json()
    assert data['mode']=='synthetic_guidance_no_command_execution'
    assert data['release_verified'] is False
    assert data['operator_authorized'] is False
    assert data['manual_references_verified_for_specific_release'] is False
    assert [step['id'] for step in data['steps']]==expected
    allowed={e['id'] for e in incident['events']}
    for step in data['steps']:
        assert step['synthetic'] is True
        assert step['execution_allowed'] is False
        assert step['state_change_executed'] is False
        assert step['command_applicability_verified'] is False
        assert set(step['event_ids']).issubset(allowed)
        assert step['look_for'] and step['if_missing'] and step['if_present']
        if step['kind']=='manual_reference':
            assert step['references']
            assert all(ref['url'].startswith('https://support.hpe.com/hpesc/public/docDisplay?') for ref in step['references'])
            assert step['local_intent'] is None

def test_disk_reference_is_exactly_documented_storage_status_and_does_not_fake_output(client):
    response=client.get(f'{API}/operations/incidents/INC-DISK-001/playbook').json()
    item=next(x for x in response['steps'] if x['id']=='disk-scf-status')
    assert item['command']=='STATUS DISK $DATA03'
    assert item['tool']=='SCF — Storage Subsystem'
    preview=client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-DISK-001','step_id':item['id']})
    assert preview.status_code==200
    result=preview.json()
    assert result['status']=='manual_reference_only'
    assert result['state_change_executed'] is False
    assert result['execution_allowed'] is False
    assert result['preview'] is None
    assert result['source']['health_signal']=='unknown'
    assert result['source']['evidence']==[]

def test_pathway_reference_requires_real_serverclass_not_guessed(client):
    data=client.get(f'{API}/operations/incidents/INC-PATH-002/playbook').json()
    item=next(x for x in data['steps'] if x['id']=='path-server')
    assert item['command']=='STATUS SERVER <serverclass>, DETAIL'
    assert '<serverclass>' in item['if_missing']
    result=client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-PATH-002','step_id':'path-server'}).json()
    assert result['preview'] is None
    assert result['source'] is None
    assert result['state_change_executed'] is False

def test_local_preview_only_returns_current_fixture_records(client):
    result=client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-PATH-002','step_id':'path-events'}).json()
    assert result['status']=='synthetic_preview'
    assert result['source']['tool_id']=='ems'
    assert [x['id'] for x in result['source']['evidence']]==['SIM-EVT-201','SIM-EVT-202']
    assert result['preview']['execution_allowed'] is False
    assert result['preview']['state_change_executed'] is False
    assert result['state_change_executed'] is False

@pytest.mark.parametrize('unapproved_id',[
    'restart_service','purge_files','unknown','disk-events;DELETE','STATUS DISK $*'
])
def test_arbitrary_or_dangerous_command_is_not_accepted(client,unapproved_id):
    response=client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-DISK-001','step_id':unapproved_id})
    if response.status_code==200:
        data=response.json()
        assert data['status']=='blocked_unknown_step'
        assert data['preview'] is None
        assert data['state_change_executed'] is False
    else:
        assert response.status_code==422

@pytest.mark.parametrize('incident_id,question,step',[
    ('INC-DISK-001','Show disk status','disk-scf-status'),
    ('INC-DISK-001','Why is utilization trending?','disk-asap'),
    ('INC-DISK-001','Review EMS warning alerts','disk-events'),
    ('INC-PATH-002','Check server process status in PATHCOM','path-server'),
    ('INC-PATH-002','Investigate latency performance','path-asap'),
])
def test_deterministic_question_routing_matches_registered_steps(client,incident_id,question,step):
    response=client.post(f'{API}/operations/playbook/recommend',
        json={'incident_id':incident_id,'question':question})
    assert response.status_code==200
    data=response.json()
    assert data['status']=='matched'
    assert data['recommended_step_id']==step
    assert data['recommendation_basis']=='deterministic_curated_terms_not_ai'
    assert data['state_change_executed'] is False

def test_irrelevant_question_must_not_fabricate_command(client):
    result=client.post(f'{API}/operations/playbook/recommend',
        json={'incident_id':'INC-DISK-001','question':'Why is Kubernetes scheduler offline?'}).json()
    assert result['status']=='needs_clarification'
    assert result['recommended_step_id'] is None
    assert result['execution_allowed'] is False

def test_unknown_incident_or_nonsensical_payload_fails_closed(client):
    assert client.get(f'{API}/operations/incidents/INC-DOES-NOT-EXIST/playbook').status_code==404
    assert client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-DOES-NOT-EXIST','step_id':'disk-events'}).status_code==404
    assert client.post(f'{API}/operations/playbook/preview',
        json={'incident_id':'INC-DISK-001','step_id':'../../etc/passwd'}).status_code==422

def test_only_approved_related_lessons_are_linked(monkeypatch,tmp_path):
    monkeypatch.setenv('LEGACY_DATABASE_PATH',str(tmp_path/'no-lessons.sqlite3'))
    incident=get_incident('INC-DISK-001')
    playbook=build_playbook(incident)
    assert playbook['approved_lessons']==[]
    assert preview_playbook(incident,'disk-ownership')['status']=='checklist_only'
    assert recommend_step(incident,'Kubernetes unrelated query')['recommended_step_id'] is None
