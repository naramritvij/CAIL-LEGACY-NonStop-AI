"""Memory, ownership, orchestration and source authorization regressions."""
import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient
import pytest

from app.main import app
from app import agent_orchestrator as agents, workspace_store as store, live_sources

BASE = '/api/v1/workspace'
USERS = [
    {'id': 'alice', 'name': 'Alice Engineer', 'key': 'alice-operator-access-key-00000000000001'},
    {'id': 'bob', 'name': 'Bob Operator', 'key': 'bob-operator-access-key-0000000000000002'},
    {'id': 'reviewer', 'name': 'Independent Reviewer', 'key': 'independent-reviewer-access-key-00000003', 'can_review': True, 'can_read_live': True},
]


@pytest.fixture
def clients(tmp_path, monkeypatch):
    monkeypatch.setenv('LEGACY_DATABASE_PATH', str(tmp_path / 'workspace.sqlite3'))
    monkeypatch.setenv('CAIL_WORKSPACE_USERS', json.dumps(USERS))
    monkeypatch.setenv('CAIL_WORKSPACE_LOCAL_DEMO', 'false')
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'false')
    result = []
    for user in USERS:
        client = TestClient(app)
        response = client.post(BASE + '/session', json={'access_key': user['key']})
        assert response.status_code == 200
        assert 'HttpOnly' in response.headers['set-cookie']
        assert user['key'] not in response.text
        result.append(client)
    return result


def create_doc(client):
    response = client.post(BASE + '/documents', json={'title': 'ASAP operator notes', 'content': 'ASAP monitors availability and performance. Check the source timestamp before trusting current status.', 'topic': 'Availability'})
    assert response.status_code == 201, response.text
    return response.json()


def approve(alice, reviewer, identifier):
    assert alice.post(f'{BASE}/documents/{identifier}/review', json={'decision': 'submitted'}).status_code == 200
    response = reviewer.post(f'{BASE}/documents/{identifier}/review', json={'decision': 'approved', 'notes': 'Reviewed the source.'})
    assert response.status_code == 200, response.text


def test_private_durable_conversations_and_revoked_sessions(clients, monkeypatch):
    alice, bob, _ = clients
    thread = alice.post(BASE + '/conversations').json()
    assert bob.get(f'{BASE}/conversations/{thread["id"]}').status_code == 404
    assert bob.get(BASE + '/conversations').json() == []
    restarted = TestClient(app)
    restarted.cookies.update(alice.cookies)
    assert restarted.get(f'{BASE}/conversations/{thread["id"]}').status_code == 200
    assert TestClient(app).get(BASE + '/conversations').status_code == 401
    monkeypatch.setenv('CAIL_WORKSPACE_USERS', json.dumps(USERS[1:]))
    assert alice.get(BASE + '/session').status_code == 401


def test_history_contains_both_roles_after_topic_changes(clients, monkeypatch):
    alice, _, _ = clients
    calls = []
    def model(system, messages, timeout=0):
        calls.append((system, messages))
        if system == agents.PLANNER:
            return {'intent': 'general', 'query': messages[-1]['content'], 'queries': [], 'sources': []}
        return {'answer': 'We called it the Maple handover checklist.', 'citations': []}
    monkeypatch.setattr(agents, 'model_json', model)
    identifier = alice.post(BASE + '/conversations').json()['id']
    for index, question in enumerate(['Call our checklist Maple.', 'What is a binary search tree?', 'What did you call our checklist?']):
        response = alice.post(f'{BASE}/conversations/{identifier}/messages', json={'question': question, 'request_id': 'request_0000' + str(index)})
        assert response.status_code == 200, response.text
    context = [messages for system, messages in calls if system == agents.CONVERSATIONAL][-1]
    assert any(turn['role'] == 'user' and 'Call our checklist Maple.' in turn['content'] for turn in context)
    assert any(turn['role'] == 'assistant' and 'Maple handover' in turn['content'] for turn in context)
    saved = alice.get(f'{BASE}/conversations/{identifier}').json()['messages']
    assert len(saved) == 6
    assert saved[-1]['metadata']['memory']['saved_turns_before'] == 4
    assert agents.fallback_plan('Explain photosynthesis.', [{'role': 'user', 'content': 'Which ATM is broken?'}])['intent'] == 'general'


def test_idempotent_turns_and_database_lease(clients, monkeypatch):
    alice, _, _ = clients
    calls = []
    monkeypatch.setattr(agents, 'run', lambda *args: calls.append(1) or {'answer': 'Saved answer', 'sources': [], 'trace': []})
    identifier = alice.post(BASE + '/conversations').json()['id']
    body = {'question': 'Remember this.', 'request_id': 'same_request_001'}
    first = alice.post(f'{BASE}/conversations/{identifier}/messages', json=body).json()
    second = alice.post(f'{BASE}/conversations/{identifier}/messages', json=body).json()
    assert first['id'] == second['id'] and calls == [1]
    assert len(alice.get(f'{BASE}/conversations/{identifier}').json()['messages']) == 2
    assert alice.post(f'{BASE}/conversations/{identifier}/messages', json=dict(body, question='A different question')).status_code == 409
    principal = alice.get(BASE + '/session').json()
    store.begin_turn(principal, identifier, 'running_request', 'Pending question')
    assert alice.post(f'{BASE}/conversations/{identifier}/messages', json={'question': 'Concurrent question', 'request_id': 'next_request_1'}).status_code == 409


def test_run_failure_preserves_both_turns(clients, monkeypatch):
    alice, _, _ = clients
    def fail(*args):
        raise RuntimeError('private internal detail')
    monkeypatch.setattr(agents, 'run', fail)
    identifier = alice.post(BASE + '/conversations').json()['id']
    response = alice.post(f'{BASE}/conversations/{identifier}/messages', json={'question': 'Keep my context.', 'request_id': 'failed_request_1'})
    assert response.status_code == 200 and response.json()['metadata']['status'] == 'failed'
    assert 'private internal detail' not in response.text
    assert len(alice.get(f'{BASE}/conversations/{identifier}').json()['messages']) == 2


def test_graph_ownership_independent_review_and_real_access(clients):
    alice, bob, reviewer = clients
    did = create_doc(alice)['id']
    graph = alice.get(BASE + '/graph').json()
    assert any(edge['source'] == 'person:alice' and edge['target'] == 'document:' + did and edge['kind'] == 'contributed' for edge in graph['edges'])
    assert bob.get(f'{BASE}/documents/{did}').status_code == 404
    assert bob.get(BASE + '/graph').json()['total_documents'] == 0
    assert alice.post(f'{BASE}/documents/{did}/review', json={'decision': 'approved'}).status_code == 403
    assert reviewer.get(f'{BASE}/documents/{did}').status_code == 404
    approve(alice, reviewer, did)
    assert bob.get(f'{BASE}/documents/{did}').json()['owner_id'] == 'alice'
    after = bob.get(BASE + '/graph').json()
    assert after['revision'] > graph['revision']
    assert any(edge['source'] == 'person:bob' and edge['target'] == 'document:' + did and edge['kind'] == 'accessed' for edge in after['edges'])
    assert after['poll_interval_ms'] <= 3000
    assert len([node for node in after['nodes'] if node['kind'] == 'document']) == 1


def test_reviewers_cannot_approve_their_own_upload(clients):
    _, _, reviewer = clients
    did = create_doc(reviewer)['id']
    assert reviewer.post(f'{BASE}/documents/{did}/review', json={'decision': 'submitted'}).status_code == 200
    assert reviewer.post(f'{BASE}/documents/{did}/review', json={'decision': 'approved'}).status_code == 403


def test_reviewed_retrieval_has_citations_and_access_provenance(clients, monkeypatch):
    alice, bob, reviewer = clients
    did = create_doc(alice)['id']
    principal = bob.get(BASE + '/session').json()
    assert store.retrieve_documents(principal, 'ASAP availability') == []
    approve(alice, reviewer, did)
    def model(system, messages, timeout=0):
        if system == agents.PLANNER:
            return {'intent': 'knowledge', 'query': 'ASAP availability', 'queries': []}
        evidence = store.retrieve_documents(principal, 'ASAP availability')[0]
        assert any(evidence['text'] in message['content'] for message in messages)
        return {'answer': f'Check the source timestamp. [{evidence["id"]}]', 'citations': [evidence['id']]}
    monkeypatch.setattr(agents, 'model_json', model)
    identifier = bob.post(BASE + '/conversations').json()['id']
    response = bob.post(f'{BASE}/conversations/{identifier}/messages', json={'question': 'Find ASAP availability guidance.', 'request_id': 'approved_rag_001'}).json()
    assert response['metadata']['citations'][0].startswith('DOC-')
    assert any(item['kind'] == 'retrieved' and item['person_id'] == 'bob' for item in bob.get(BASE + '/graph').json()['events'])


def test_general_questions_do_not_call_unrelated_tools(clients, monkeypatch):
    alice, _, _ = clients
    monkeypatch.setattr(agents, 'plan', lambda *args: ({'intent': 'general', 'queries': ['Hello'], 'sources': [], 'query': 'Hello'}, True))
    monkeypatch.setattr(agents, 'knowledge_agent', lambda *args: pytest.fail('Unrelated retrieval'))
    monkeypatch.setattr(agents, 'telemetry_agent', lambda *args: pytest.fail('Unrelated telemetry'))
    monkeypatch.setattr(agents, 'model_json', lambda *args, **kwargs: {'answer': 'Hello. How can I help?', 'citations': []})
    assert agents.run(alice.get(BASE + '/session').json(), 'Hello', [])['route'] == 'general'


def test_live_status_stays_unknown_without_authorized_evidence(clients, monkeypatch):
    alice, _, _ = clients
    monkeypatch.setattr(agents, 'plan', lambda *args: ({'intent': 'live', 'queries': ['system health'], 'sources': ['asap', 'momi', 'prognosis'], 'query': 'system health'}, True))
    monkeypatch.setattr(agents, 'model_json', lambda *args, **kwargs: pytest.fail('Live conclusion without evidence'))
    monkeypatch.setattr(live_sources, 'read_source', lambda *args: pytest.fail('Unauthorized connector call'))
    result = agents.run(alice.get(BASE + '/session').json(), 'Is the system healthy right now?', [])
    assert result['status'] == 'live_unavailable' and 'unknown' in result['answer']
    assert result['sources'] == [] and result['execution_allowed'] is False


def test_three_vendor_connectors_use_real_snapshot_contract(clients, monkeypatch):
    _, _, reviewer = clients
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'true')
    monkeypatch.setenv('CAIL_LIVE_ALLOWED_HOSTS', 'bridge.example.internal')
    for source_id in ('prognosis', 'asap', 'momi'):
        monkeypatch.setenv(f'CAIL_LIVE_{source_id.upper()}_URL', f'https://bridge.example.internal/{source_id}')
        monkeypatch.setenv(f'CAIL_LIVE_{source_id.upper()}_TOKEN', 'independent-source-access-token-0001')
    calls = []
    def snapshot(source_id):
        calls.append(source_id)
        return {'tool_id': source_id, 'observed_at': datetime.now(timezone.utc).isoformat(), 'system_id': 'test-system',
                'evidence': [{'id': 'CPU0', 'name': 'CPU', 'component': 'CPU0', 'value': 31, 'unit': '%'}],
                'snapshot_sha256': 'a' * 64, 'connected': True, 'synthetic': False, 'health_signal': 'green'}
    monkeypatch.setattr(live_sources, 'read_source', snapshot)
    for key in ('prognosis', 'asap', 'momi'):
        result = reviewer.post(BASE + f'/connections/{key}/check')
        assert result.status_code == 200 and result.json()['synthetic'] is False
    assert calls == ['prognosis', 'asap', 'momi']
    assert all(item['connected'] for item in reviewer.get(BASE + '/connections').json()['sources'])
    from fastapi import HTTPException
    def fail(key):
        raise HTTPException(502, 'Source is unavailable')
    monkeypatch.setattr(live_sources, 'read_source', fail)
    assert reviewer.post(BASE + '/connections/asap/check').status_code == 502
    failed = next(item for item in reviewer.get(BASE + '/connections').json()['sources'] if item['id'] == 'asap')
    assert failed['connected'] is False and failed['snapshot'] is None
    assert len(failed['history']) == 1


def test_upload_filename_format_and_cross_origin_controls(clients):
    alice, _, _ = clients
    result = alice.post(BASE + '/documents/upload', files={'file': ('../shift-notes.md', b'ASAP availability observations with useful timestamped context.', 'text/markdown')}, data={'topic': 'Handover'})
    assert result.status_code == 201
    assert result.json()['filename'] == 'shift-notes.md' and result.json()['owner_name'] == 'Alice Engineer'
    assert alice.post(BASE + '/documents/upload', files={'file': ('test.exe', b'not a document', 'application/octet-stream')}).status_code == 415
    assert alice.post(BASE + '/conversations', headers={'Origin': 'https://unrelated.example'}).status_code == 403
    assert alice.post(BASE + '/conversations', headers={'Origin': 'http://testserver'}).status_code == 201


def test_unknown_citations_and_old_relevant_memory():
    with pytest.raises(ValueError):
        agents.validated_answer({'answer': 'A claim [DOC-invented-1]', 'citations': ['DOC-invented-1']}, [])
    history = [{'role': 'user', 'content': 'My name is Alice. Call me Alice.'}, {'role': 'assistant', 'content': 'Hello, Alice.'}]
    history.extend({'role': 'user' if index % 2 == 0 else 'assistant', 'content': 'Unrelated exchange about weather.'} for index in range(30))
    context, _ = agents.context_messages('What is my name?', history)
    assert any('My name is Alice' in turn['content'] for turn in context)


def test_evaluator_rewrites_irrelevant_retrieval_with_a_hard_limit(clients, monkeypatch):
    alice, _, _ = clients
    calls = []
    monkeypatch.setattr(agents, 'plan', lambda *args: ({'intent': 'knowledge', 'query': 'first query', 'queries': ['first query'], 'sources': []}, True))
    monkeypatch.setattr(agents, 'knowledge_agent', lambda user, query: calls.append(query) or [])
    def model(system, messages, timeout=0):
        if system == agents.EVALUATOR:
            return {'relevant_ids': [], 'sufficient': False, 'next_query': 'variant ' + str(len(calls))}
        return {'answer': 'No reviewed procedure was found. Please add an authorized source for review.', 'citations': []}
    monkeypatch.setattr(agents, 'model_json', model)
    result = agents.run(alice.get(BASE + '/session').json(), 'Find a reviewed procedure.', [])
    assert len(calls) == agents.MAX_ATTEMPTS == 5
    assert result['sources'] == []


def test_ollama_wire_format_keeps_both_conversation_roles(monkeypatch):
    history = [{'role': 'user', 'content': 'Remember Maple.'}, {'role': 'assistant', 'content': 'I will refer to the checklist as Maple.'}, {'role': 'user', 'content': 'What did you call it?'}]
    class Response:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self, limit):
            return json.dumps({'message': {'content': json.dumps({'answer': 'Maple.', 'citations': []})}}).encode()
    def open_request(request, timeout):
        assert request.full_url.endswith('/api/chat')
        payload = json.loads(request.data)
        assert payload['messages'][0]['role'] == 'system'
        assert payload['messages'][1:] == history
        assert payload['format'] == 'json' and payload['stream'] is False
        return Response()
    monkeypatch.setattr(agents, 'urlopen', open_request)
    assert agents.model_json('System instructions', history)['answer'] == 'Maple.'


def test_unavailable_model_preserves_context_without_fake_answer(clients, monkeypatch):
    alice, _, _ = clients
    def unavailable(*args, **kwargs):
        raise agents.ModelUnavailable()
    monkeypatch.setattr(agents, 'model_json', unavailable)
    identifier = alice.post(BASE + '/conversations').json()['id']
    reply = alice.post(f'{BASE}/conversations/{identifier}/messages', json={'question': 'Explain binary search.', 'request_id': 'offline_model_01'}).json()
    assert reply['metadata']['status'] == 'model_unavailable'
    assert reply['metadata']['model'] is None
    assert len(alice.get(f'{BASE}/conversations/{identifier}').json()['messages']) == 2


@pytest.mark.parametrize('name', ['Maple', 'Cedar-47', 'North Star'])
def test_user_notes_and_recall_use_conversation_not_empty_monitoring_evidence(clients, monkeypatch, name):
    alice, _, _ = clients
    received = []
    def model(system, messages, timeout=0):
        current = messages[-1]['content']
        if system == agents.PLANNER:
            return {'intent': 'general', 'query': current, 'queries': [], 'sources': []}
        # Check the actual inference boundary, not only persistence of a canned
        # answer. A missing/empty monitoring packet caused the reported failure.
        assert system == agents.CONVERSATIONAL
        assert all('EVIDENCE (REFERENCE DATA)' not in item['content'] for item in messages)
        received.append(messages)
        if current.startswith('Remember that '):
            return {'answer': f'I will remember in this conversation that your checklist is called {name}.', 'citations': []}
        if current == 'Explain what an API is.':
            return {'answer': 'An API is an application programming interface that lets software interact.', 'citations': []}
        original = next(item['content'] for item in messages if item['role'] == 'user' and item['content'].startswith('Remember that '))
        assert name in original
        return {'answer': f'You named your checklist {name}.', 'citations': []}
    monkeypatch.setattr(agents, 'model_json', model)
    monkeypatch.setattr(agents, 'telemetry_agent', lambda *args: pytest.fail('A conversational note triggered live monitoring'))
    identifier = alice.post(BASE + '/conversations').json()['id']
    questions = [f'Remember that our checklist is called {name}.', 'Explain what an API is.', 'What did I name our checklist?']
    replies = []
    for index, question in enumerate(questions):
        reply = alice.post(f'{BASE}/conversations/{identifier}/messages', json={'question': question, 'request_id': 'conversation_note_' + str(index)})
        assert reply.status_code == 200
        replies.append(reply.json())
    assert [items[-1]['content'] for items in received] == questions
    assert name in replies[0]['content'] and name in replies[-1]['content']
    assert len(alice.get(f'{BASE}/conversations/{identifier}').json()['messages']) == 6
    assert 'current message is already saved' in replies[0]['metadata']['trace'][0]['detail']


def test_explicit_notes_survive_unrelated_topics_without_lexical_overlap():
    history = [{'role': 'user', 'content': 'Remember the recovery label: Lantern-92.'},
               {'role': 'assistant', 'content': 'I have noted that label for this conversation.'}]
    history.extend({'role': 'user' if index % 2 == 0 else 'assistant', 'content': 'Unrelated discussion of sorting algorithms.'} for index in range(40))
    context, _ = agents.context_messages('What did I ask you to retain?', history)
    assert any(item['role'] == 'user' and 'Lantern-92' in item['content'] for item in context)
