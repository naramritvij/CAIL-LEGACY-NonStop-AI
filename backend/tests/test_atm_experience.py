"""Sponsor ATM 'locate > investigate > retrieve > assist > learn' safety tests."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import atm_experience as atm

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH',str(tmp_path/'atm.sqlite3'))
    return TestClient(app)

ROOT='/api/v1/operations/atm'

def post(client, atm_id='ATM-042',audience='frontline',question='An ATM is broken, what should I do?'):
    return client.post(ROOT+'/assist',json={
        'atm_id':atm_id,'audience':audience,'question':question,
    })

def test_fictional_map_locates_one_affected_atm_and_disclaims_real_positions(client):
    r=client.get(ROOT+'/network')
    assert r.status_code==200
    data=r.json()
    assert data['product_name']=='CAIL / Nonstop AI Operations Assistant'
    assert data['production_connectivity'] is False
    assert 'fictional' in data['map_type']
    assert len(data['sites'])==6
    assert data['attention_count']==1
    assert [s['id'] for s in data['sites'] if s['status']=='attention']==['ATM-042']
    assert all(s['live_connected'] is False for s in data['sites'])

def test_same_evidence_both_audiences_with_different_explanation_language(client):
    basic=post(client,audience='frontline').json()
    tech=post(client,audience='engineer').json()
    assert basic['status']==tech['status']=='guided_synthetic_investigation'
    assert basic['source_previews']==tech['source_previews']
    assert basic['headline']!=tech['headline']
    assert basic['steps']!=tech['steps']
    assert basic['execution_allowed'] is tech['execution_allowed'] is False
    assert basic['state_change_executed'] is tech['state_change_executed'] is False
    assert len(basic['source_previews'])==4
    assert [x['adapter'] for x in tech['source_previews']]==['ems','asap','guardian','pathcom']
    assert all(x['connected'] is False for x in tech['source_previews'])
    assert tech['source_previews'][-1]['observations']==[]
    assert tech['source_previews'][-1]['native_tool_status']=='unknown'

def test_no_fabricated_reviewed_cases_for_an_empty_knowledge_tree(client):
    data=client.get(ROOT+'/network').json()
    assert data['approved_knowledge_matches']==[]
    assert len(data['fictional_history_examples'])==2
    assert all(x['status']=='unreviewed_fiction_not_an_actual_resolution'
               for x in data['fictional_history_examples'])

def test_a_reviewer_approved_synthetic_lesson_is_visible_only_after_review(client,monkeypatch):
    from app import atm_experience
    nodes={'review_scope':'approved_only','nodes':[{
        'id':'LESSON-APPROVED-001','title':'Review Pathway warnings',
        'reasoning_preview':'Verified demo evidence sequence; no confirmed repair.',
        'review_status':'approved','reviewed_at':'2026-10-18T00:00:00Z',
        'source_event_ids':['SIM-EVT-202'],
    }]}
    monkeypatch.setattr(atm_experience,'build_legacy_tree',lambda incident_id:nodes)
    returned=client.get(ROOT+'/network').json()
    assert returned['approved_knowledge_matches'][0]['lesson_id']=='LESSON-APPROVED-001'
    assert returned['approved_knowledge_matches'][0]['relation_verified'] is False

@pytest.mark.parametrize('phrase',[
    'restart the payment server now',
    'purge transaction files',
    'STOP PATHWAY immediately',
])
def test_unsafe_operator_actions_never_call_native_tools(client,phrase):
    result=post(client,audience='engineer',question=phrase).json()
    assert result['status']=='blocked_unsafe'
    assert result['execution_allowed'] is False
    assert result['state_change_executed'] is False
    assert result['source_previews']==[]

@pytest.mark.parametrize('bad',[
    'Check ATM-042; restart it',
    'What is wrong | bash',
    'Show incidents\nrun command',
])
def test_compound_inputs_are_rejected(client,bad):
    assert post(client,question=bad).status_code==422

def test_fictional_nominal_site_does_not_return_breakdown(client):
    result=post(client,atm_id='ATM-011').json()
    assert result['status']=='no_synthetic_incident'
    assert result['source_previews']==[]
    assert 'unknown' in result['explanation'].lower()

def test_missing_site_and_unknown_roles_are_refused(client):
    assert post(client,atm_id='ATM-999').status_code==404
    assert post(client,audience='administrator').status_code==422

def test_no_live_tool_access_is_ever_reported(client):
    result=post(client,audience='engineer').json()
    assert result['production_connectivity'] is False
    assert result['source_previews'][0]['status']=='synthetic_result'
    assert all(x['evidence_origin']=='local_fixture_adapter' for x in result['source_previews'])
    assert result['source_previews'][-1]['status']=='reference_only_unknown_status'


def test_submitted_expert_lesson_stays_invisible_until_distinct_reviewer_approves(client,monkeypatch):
    expert='demo-atm-local-expert-long-private-test-key'
    reviewer='demo-atm-local-reviewer-long-private-test-key'
    monkeypatch.setenv('LEGACY_EXPERT_KEY',expert)
    monkeypatch.setenv('LEGACY_REVIEWER_KEY',reviewer)
    E={'X-Legacy-Expert-Key':expert}
    R={'X-Legacy-Reviewer-Key':reviewer}
    body={
        'incident_id':'INC-PATH-002',
        'author_alias':'Synthetic mentor',
        'symptoms':'Synthetic Pathway latency and service not responding',
        'reasoning':'Inspect the chronological warnings and verify actual process state before acting.',
        'rejected_action':'Unapproved restart',
        'prerequisites':['Confirm PATHMON target','Site-approved runbook'],
        'evidence_ids':['SIM-EVT-201','SIM-EVT-202'],
        'previous_lesson_id':None,
    }
    created=client.post('/api/v1/knowledge/lessons',json=body,headers=E)
    assert created.status_code==201,created.text
    lesson_id=created.json()['id']
    assert client.get(ROOT+'/network').json()['approved_knowledge_matches']==[]
    submitted=client.post('/api/v1/knowledge/lessons/'+lesson_id+'/submit',headers=E)
    assert submitted.status_code==200,submitted.text
    assert client.get(ROOT+'/network').json()['approved_knowledge_matches']==[]
    wrong_role=client.post('/api/v1/knowledge/lessons/'+lesson_id+'/review',headers=E,
                           json={'decision':'approved','notes':'Not my approval role'})
    assert wrong_role.status_code==403
    approved=client.post('/api/v1/knowledge/lessons/'+lesson_id+'/review',headers=R,
                         json={'decision':'approved','notes':'Accepted for fictional local training only'})
    assert approved.status_code==200,approved.text
    visible=client.get(ROOT+'/network').json()['approved_knowledge_matches']
    assert len(visible)==1
    assert visible[0]['lesson_id']==lesson_id
    assert visible[0]['review_status']=='approved'
    assert visible[0]['relation_verified'] is False


@pytest.mark.parametrize('q,intent',[
    ('Which ATM is down and where is it?','locate'),
    ('Show EMS alerts and CPU metrics','investigate'),
    ('Find a similar previous resolution','retrieve_knowledge'),
    ('An ATM is not responding','assist'),
])
def test_operator_questions_are_actually_classified_into_workflow_intents(client,q,intent):
    response=post(client,question=q)
    assert response.status_code==200,response.text
    assert response.json()['interpreted_intent']==intent

def test_unrelated_questions_do_not_receive_canned_atm_diagnosis(client):
    data=post(client,question='What is a quantum rainbow?').json()
    assert data['status']=='needs_clarification'
    assert data['source_previews']==[]

def test_a_different_explicit_atm_id_cannot_reuse_selected_site_evidence(client):
    data=post(client,atm_id='ATM-042',
              question='Can you explain the issue with ATM-011?').json()
    assert data['status']=='context_mismatch'
    assert data['source_previews']==[]
