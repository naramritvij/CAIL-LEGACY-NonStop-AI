"""Sponsor-facing command/tool integration tests. NO real NonStop access."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.operations_lab import FINANCIAL_ID, command, shift_summary, evaluation_protocol, scenarios

API='/api/v1/operations/lab'

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH',str(tmp_path/'command_lab.sqlite3'))
    return TestClient(app)

def test_three_training_scenarios_without_changing_canonical_incident_queue(client):
    response=client.get(API+'/scenarios')
    assert response.status_code==200
    data=response.json()
    assert data['live_connected'] is False
    assert {x['id'] for x in data['scenarios']}=={
        'INC-DISK-001','INC-PATH-002',FINANCIAL_ID
    }

def test_financial_hardware_failure_has_traced_multitool_chronology(client):
    data=client.post(API+'/command',json={
        'incident_id':FINANCIAL_ID,'input':'SHOW CORRELATION'
    }).json()
    assert data['status']=='synthetic_result'
    assert data['adapter']=='correlation'
    assert data['state_change_executed'] is False
    assert data['live_connected'] is False
    events=data['correlation']['ordered_evidence']
    assert [x['id'] for x in events]==['SIM-EVT-301','SIM-EVT-302',
                                      'SIM-EVT-303','SIM-EVT-304','SIM-EVT-305']
    assert data['correlation']['root_cause_confirmed'] is False
    assert len(data['correlation']['unknowns'])>=5

@pytest.mark.parametrize('query,expected_tool,count',[
    ('SHOW ALERTS','ems',5),
    ('SHOW FAILED PROCESSES','guardian',1),
    ('SHOW CPU METRICS','asap',4),
    ('Why is CPU 3 very busy?','asap',4),
    ('Show me processes that have failed in the last hour.','guardian',1),
    ('Show recent EMS errors related to Pathway','ems_pathway',1),
    ('What changed before this application failed?','correlation',0),
    ('Are there any problems on the system?','health',1),
])
def test_native_intents_and_natural_language_route_to_same_synthetic_adapters(client,query,expected_tool,count):
    resp=client.post(API+'/command',json={'incident_id':FINANCIAL_ID,'input':query})
    assert resp.status_code==200, resp.text
    body=resp.json()
    assert body['adapter']==expected_tool,body
    assert body['status']=='synthetic_result'
    assert body['execution_allowed'] is False
    assert body['state_change_executed'] is False
    assert len(body['evidence']['observations'])==count
    assert body['evidence']['actual_tool_status']=='unknown'
    assert body['evidence']['connected_to_live_hpe'] is False
    assert body['evidence']['source_authenticity_verified'] is False

@pytest.mark.parametrize('query,adapter',[
    ('STATUS PATHWAY','pathcom'),
    ('STATUS SERVER <serverclass>, DETAIL','pathcom'),
])
def test_actual_pathway_syntax_is_reference_only_no_fake_output(client,query,adapter):
    response=client.post(API+'/command',json={'incident_id':FINANCIAL_ID,'input':query})
    assert response.status_code==200
    data=response.json()
    assert data['adapter']==adapter
    assert data['status']=='reference_only_unknown_status'
    assert data['route_kind']=='hpe_command_reference_only'
    assert data['evidence']['reference_url'].startswith('https://support.hpe.com/')
    assert data['evidence']['observations']==[]
    assert data['execution_allowed'] is False

def test_scf_disk_status_is_not_executed(client):
    response=client.post(API+'/command',json={
        'incident_id':'INC-DISK-001','input':'STATUS DISK $DATA03'
    }).json()
    assert response['status']=='reference_only_unknown_status'
    assert response['adapter']=='scf'
    assert response['evidence']['observations']==[]
    assert response['execution_allowed'] is False

@pytest.mark.parametrize('text',[
    'STOP PATHWAY','RESTART SERVICE','PURGE FILES','DELETE DISK $DATA03',
    'What would you do to shutdown the server?'
])
def test_dangerous_actions_are_rejected_without_tool_read(text,client):
    data=client.post(API+'/command',json={
        'incident_id':FINANCIAL_ID,'input':text
    }).json()
    assert data['status']=='blocked_unsafe'
    assert data['adapter'] is None and data['evidence'] is None
    assert data['state_change_executed'] is False

@pytest.mark.parametrize('text',[
    'STATUS PATHWAY; STOP PATHWAY',
    'SHOW ALERTS\nSTATUS PATHWAY',
    'SHOW ALERTS && DELETE FILE',
    'SHOW ALERTS | cat',
])
def test_compound_pipelines_rejected_by_request_validation(client,text):
    resp=client.post(API+'/command',json={'incident_id':FINANCIAL_ID,'input':text})
    assert resp.status_code==422

def test_unsupported_native_commands_do_not_reach_any_adapter(client):
    resp=client.post(API+'/command',json={
        'incident_id':FINANCIAL_ID,'input':'STATUS $XYZ'
    })
    assert resp.status_code==200
    data=resp.json()
    assert data['status']=='unsupported_command'
    assert data['adapter'] is None
    assert data['evidence'] is None
    assert data['state_change_executed'] is False

def test_wrong_incident_does_not_confidently_return_wrong_subsystem(client):
    response=client.post(API+'/command',json={
        'incident_id':'INC-DISK-001','input':'Check server status in PATHCOM'
    }).json()
    assert response['status']=='context_mismatch'
    assert response['suggested_incident_id']=='INC-PATH-002'
    assert response['adapter'] is None
    assert response['evidence'] is None
    actual=client.post(API+'/command',json={
        'incident_id':'INC-PATH-002','input':'STATUS DISK $DATA03'
    }).json()
    assert actual['status']=='context_mismatch'
    assert actual['suggested_incident_id']=='INC-DISK-001'

def test_existing_scenarios_still_route_to_existing_real_fixture_content(client):
    for incident_id,expected in [('INC-DISK-001',3),('INC-PATH-002',2)]:
        data=client.post(API+'/command',json={
            'incident_id':incident_id,'input':'SHOW EMS EVENTS'
        }).json()
        assert data['adapter']=='ems'
        assert len(data['evidence']['observations'])==expected
        assert data['state_change_executed'] is False

def test_all_synthetic_shift_counts_derived_not_fabricated(client):
    response=client.get(API+'/shift-summary')
    assert response.status_code==200
    data=response.json()
    assert data['synthetic'] is True
    assert data['incident_count']==3
    assert data['event_count']==10
    assert data['unresolved_count']==3
    assert data['approved_resolutions_reported']==0
    assert data['documented_process_restarts'] is None
    assert data['actual_cpu_normality_confirmed'] is False
    assert len(data['sections'])==3

def test_honest_evaluation_protocol_no_premature_mttr_claims(client):
    data=client.get(API+'/evaluation-protocol').json()
    assert data['measurement_status']=='not_yet_measured'
    assert data['real_world_mttr_claim_allowed'] is False
    assert 'time_to_safe_decision_seconds' in data['metrics']

def test_unknown_incident_is_not_assumed_healthy_or_connected(client):
    resp=client.post(API+'/command',json={'incident_id':'UNKNOWN','input':'SHOW ALERTS'})
    assert resp.status_code==404

def test_mismatch_is_flagged_in_original_guided_command_playbook():
    from app.command_playbook import recommend_step
    from app.scenarios import get_incident
    item=recommend_step(get_incident('INC-DISK-001'),'Check server process status in PATHCOM')
    assert item['status']=='context_mismatch'
    assert item['suggested_incident_id']=='INC-PATH-002'
    assert item['recommended_step_id'] is None


def test_financial_ai_reuses_existing_registered_citation_controls(client,monkeypatch):
    import json
    from app import grounded_investigation as gi
    calls=[]
    def local_model(payload):
        calls.append(payload)
        return json.dumps({'claims':[{
            'text':'The simulated event log shows hardware pressure preceding payment latency.',
            'citations':['SIM-EVT-301','SIM-EVT-304']
        }]})
    monkeypatch.setattr(gi,'_call_local_model',local_model)
    resp=client.post(API+'/ask',json={
        'incident_id':FINANCIAL_ID,
        'question':'What evidence is there for payment slowdown?',
        'release':'L23.08','max_chunks':3,
    })
    assert resp.status_code==200,resp.text
    data=resp.json()
    assert data['status']=='generated_unverified_citation_ids_checked'
    assert data['claims'][0]['citations']==['SIM-EVT-301','SIM-EVT-304']
    assert data['state_change_executed'] is False
    assert data['operational_action_authorized'] is False
    assert len(calls)==1

def test_financial_ai_rejects_fabricated_citation_ids(client,monkeypatch):
    import json
    from app import grounded_investigation as gi
    monkeypatch.setattr(gi,'_call_local_model',lambda payload:json.dumps({
        'claims':[{'text':'Fake process event asserted without registered evidence.',
                   'citations':['SIM-EVT-999']}]}
    ))
    resp=client.post(API+'/ask',json={
        'incident_id':FINANCIAL_ID,
        'question':'What evidence is there for payment slowdown?',
        'release':'L23.08','max_chunks':3,
    })
    assert resp.status_code==200
    data=resp.json()
    assert data['claims']==[]
    assert data['status'] in ('model_output_rejected','insufficient_relevant_evidence')
