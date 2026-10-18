"""Offline contract tests for Library, Mentor review, Qwen reference lookup, and operator guidance."""
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import grounded_investigation as gi
from app.operator_explainer import build_operator_brief
from app.scenarios import get_incident

API = '/api/v1'
EKEY = 'test-expert-knowledge-review-key-0001'
RKEY = 'test-reviewer-knowledge-approval-key-0002'
E = {'X-Legacy-Expert-Key': EKEY}
R = {'X-Legacy-Reviewer-Key': RKEY}

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'knowledge_transfer.sqlite3'))
    monkeypatch.setenv('LEGACY_EXPERT_KEY', EKEY)
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', RKEY)
    return TestClient(app)



def test_workflow_readiness_counts_only_approved_local_lessons(client, monkeypatch):
    route = API + '/knowledge/workflow-readiness'
    before = client.get(route)
    assert before.status_code == 200
    status = before.json()
    assert status['storage_ready'] is True
    assert status['independent_reviewer_configured'] is True
    assert status['approved_source_count'] == 0
    assert status['approved_lesson_count'] == 0
    assert status['available_apprentice_challenges'] == 0
    assert status['production_ready'] is False
    assert status['real_mentor_identity_verified'] is False
    assert EKEY not in before.text and RKEY not in before.text

    incident = client.get(API + '/incidents/INC-DISK-001').json()
    created = client.post(API + '/knowledge/lessons', headers=E, json={
        'incident_id': 'INC-DISK-001', 'author_alias': 'Local Training Expert',
        'symptoms': incident['summary'],
        'reasoning': 'Review evidence and ownership before changing any resources.',
        'rejected_action': 'purge_files',
        'prerequisites': ['Verify ownership', 'Verify retention'],
        'evidence_ids': ['SIM-EVT-101', 'SIM-EVT-103'],
    })
    assert created.status_code == 201
    lesson_id = created.json()['id']
    submitted = client.post(API + f'/knowledge/lessons/{lesson_id}/submit', headers=E)
    assert submitted.status_code == 200
    assert client.get(route).json()['approved_lesson_count'] == 0
    approved = client.post(API + f'/knowledge/lessons/{lesson_id}/review', headers=R,
        json={'decision':'approved','notes':'Reviewed as local training material only.'})
    assert approved.status_code == 200
    ready = client.get(route).json()
    assert ready['approved_lesson_count'] == 1
    assert ready['available_apprentice_challenges'] == 1
    assert client.get(API + f'/training/challenges/{lesson_id}').status_code == 200

    monkeypatch.delenv('LEGACY_REVIEWER_KEY')
    missing = client.get(route).json()
    assert missing['independent_reviewer_configured'] is False
    assert missing['approved_lesson_count'] == 1


def test_workflow_readiness_disallows_same_expert_reviewer_key(client, monkeypatch):
    monkeypatch.setenv('LEGACY_REVIEWER_KEY', EKEY)
    result = client.get(API + '/knowledge/workflow-readiness').json()
    assert result['independent_reviewer_configured'] is False
    assert result['ready_for_local_review'] is False


def test_submitted_corpus_requires_reviewer_key_and_approval(client):
    body = {
        'title': 'Permitted synthetic NonStop availability notes',
        'source_url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us',
        'release': 'L23.08', 'section': 'NonStop concept',
        'content': ('HPE NonStop is a fault-tolerant enterprise platform designed '
                    'for highly available transaction processing. This is a '
                    'locally pasted synthetic training excerpt, not a checked copy of HPE text.'),
        'acknowledged_authorization': True,
    }
    response = client.post(f'{API}/knowledge/corpus/documents', headers=E, json=body)
    assert response.status_code == 201, response.text
    did = response.json()['document_id']
    assert client.get(f'{API}/knowledge/corpus/documents').json() == []
    assert client.get(f'{API}/knowledge/corpus/documents?status=submitted').status_code == 403
    assert client.get(f'{API}/knowledge/corpus/documents/{did}').status_code == 403
    submit = client.post(f'{API}/knowledge/corpus/documents/{did}/submit', headers=E)
    assert submit.status_code == 200
    queue = client.get(f'{API}/knowledge/corpus/documents?status=submitted',headers=R)
    assert queue.status_code == 200
    assert len(queue.json()) == 1
    assert 'chunks' not in queue.json()[0]
    detail = client.get(f'{API}/knowledge/corpus/documents/{did}',headers=R)
    assert detail.status_code == 200
    assert len(detail.json()['chunks']) >= 1
    assert detail.json()['content_verified_against_url'] is False
    assert client.post(f'{API}/knowledge/corpus/documents/{did}/review', headers=E,
        json={'decision':'approved', 'notes':'Attempt by incorrect role'}).status_code == 403
    review = client.post(f'{API}/knowledge/corpus/documents/{did}/review', headers=R,
        json={'decision':'approved', 'notes':'Approved for local training only, not HPE authenticated.'})
    assert review.status_code == 200
    assert len(client.get(f'{API}/knowledge/corpus/documents').json()) == 1
    search = client.post(f'{API}/knowledge/corpus/search',
        json={'query':'NonStop fault tolerant','release':'L23.08','limit':4}).json()
    assert len(search['matches']) >= 1


def test_approved_reference_calls_qwen_with_doc_ids_only(client, monkeypatch):
    body = {
        'title': 'Authorized synthetic ASAP training notes',
        'source_url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us',
        'release': 'L23.08','section':'ASAP monitoring',
        'content': 'ASAP is an availability monitoring tool in the NonStop ecosystem. '
                   'This synthetic training text describes monitoring statistics '
                   'and availability indicators for a locally authored exercise.',
        'acknowledged_authorization': True,
    }
    draft = client.post(f'{API}/knowledge/corpus/documents',json=body,headers=E).json()
    did=draft['document_id']
    client.post(f'{API}/knowledge/corpus/documents/{did}/submit',headers=E)
    client.post(f'{API}/knowledge/corpus/documents/{did}/review',headers=R,
        json={'decision':'approved','notes':'Accepted for demo use, unverified source text.'})
    calls=[]
    def model(payload):
        calls.append(payload)
        cited=payload['format']['properties']['claims']['items']['properties']['citations']['items']['enum'][0]
        assert cited.startswith('DOC-')
        return json.dumps({'claims':[{
            'text':'The locally reviewed excerpt describes ASAP as a monitoring tool.',
            'citations':[cited]}]})
    monkeypatch.setattr(gi,'_call_local_model',model)
    resp=client.post(f'{API}/investigate/grounded',
        json={'incident_id':'INC-DISK-001','question':'What is ASAP?',
              'release':'L23.08','max_chunks':3})
    assert resp.status_code == 200
    data=resp.json()
    assert data['status']=='generated_unverified_reference_citation_ids_checked'
    assert data['question_scope']=='general_reference'
    assert data['claims'][0]['citations'][0].startswith('DOC-')
    assert data['operational_action_authorized'] is False
    assert data['excerpt_authenticity_verified'] is False
    assert len(calls)==1


def test_transcript_stays_draft_until_distinct_review(client):
    body = {
        'title':'Authorized redacted synthetic expert walkthrough',
        'recording_reference':'synthetic-local-session','release':'L23.08',
        'section':'Operator disk triage',
        'content':'Synthetic operator says: check disk utilization and file ownership '
                  'before suggesting any destructive action. This is invented '
                  'training content, not a real interview or customer recording.',
        'acknowledged_authorization':True,'redaction_confirmed':True,
    }
    created=client.post(f'{API}/knowledge/transcripts',headers=E,json=body)
    assert created.status_code==201
    did=created.json()['document_id']
    assert client.get(f'{API}/knowledge/corpus/documents').json()==[]
    client.post(f'{API}/knowledge/corpus/documents/{did}/submit',headers=E)
    detail=client.get(f'{API}/knowledge/corpus/documents/{did}',headers=R)
    assert detail.status_code==200
    assert detail.json()['source_url'].startswith('urn:cail:transcript:')
    client.post(f'{API}/knowledge/corpus/documents/{did}/review',headers=R,
        json={'decision':'approved','notes':'Accepted synthetic transcript for demo review.'})
    approved=client.get(f'{API}/knowledge/corpus/documents').json()
    assert len(approved)==1
    assert approved[0]['source_kind']=='locally_supplied_operator_transcript_not_authenticated'


def test_operator_brief_cites_existing_events_and_only_read_only_previews():
    disk=get_incident('INC-DISK-001')
    brief=build_operator_brief(disk)
    assert brief['status']=='yellow'
    assert '81%' in brief['what_is_happening']
    assert set(brief['source_event_ids']) == {x['id'] for x in disk['events']}
    assert brief['root_cause_status']=='not_established'
    assert brief['safe_next_checks']
    assert all(x['policy']=='preview_allowed' for x in brief['safe_preview_actions'])
    path=build_operator_brief(get_incident('INC-PATH-002'))
    assert path['status']=='red'
    assert path['root_cause_status']=='not_established'


def test_reviewed_excerpt_allows_other_explicit_concept_questions(monkeypatch):
    import hashlib
    text='MOMI is a synthetic local training topic about a monitoring interface. This example is not authenticated vendor documentation.'
    hit={
        'citation_id':'DOC-abcdef01-C01','excerpt':text,
        'chunk_sha256':hashlib.sha256(text.encode('utf-8')).hexdigest(),
        'source_url':'https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us',
        'section':'Monitoring','release':'L23.08',
    }
    monkeypatch.setattr(gi,'search_approved',lambda *args:{'matches':[hit]})
    calls=[]
    def model(payload):
        calls.append(payload)
        return json.dumps({'claims':[{
            'text':'The locally reviewed excerpt describes a monitoring interface.',
            'citations':['DOC-abcdef01-C01']}]})
    monkeypatch.setattr(gi,'_call_local_model',model)
    result=gi.investigate_with_corpus(
        'What is MOMI?', get_incident('INC-DISK-001'), 'L23.08'
    )
    assert result['status']=='generated_unverified_reference_citation_ids_checked'
    assert result['claims'][0]['citations']==['DOC-abcdef01-C01']
    assert len(calls)==1
    assert result['state_change_executed'] is False


def test_operator_brief_accepts_partial_sprint5_fixture_without_title():
    """Valid partial incident input must not bypass citation/safety checks."""
    partial = {
        'id': 'INC-DISK-001',
        'summary': 'Synthetic disk grew to 81 percent',
        'unknowns': ['File ownership'],
        'events': [{'id': 'SIM-EVT-101', 'message': 'Synthetic disk reached 81%'}],
    }
    brief = build_operator_brief(partial)
    assert brief['heading'] == partial['summary']
    assert brief['what_is_happening'] == partial['summary']
    assert brief['status'] == 'yellow'
    assert brief['source_event_ids'] == ['SIM-EVT-101']
    assert brief['root_cause_status'] == 'not_established'
    assert all(item['policy'] == 'preview_allowed'
               for item in brief['safe_preview_actions'])
