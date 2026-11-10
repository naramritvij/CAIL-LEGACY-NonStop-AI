"""Semantic meaning, real provenance, privacy and honest learning claims."""
import pytest

from app import semantic_graph as knowledge, workspace_store as store
from test_agent_workspace import clients, approve

BASE = '/api/v1/workspace'
SOURCE = ('# TMF Reference\nTMFCOM STATUS TMF reports TMF information.\n'
          'TMF Message 3119 describes an operator message in this manual.\n'
          'The documented example uses $AUDIT on \\PROD and discusses CPU busy for L15.02.\n'
          'This fixture is documentation, not a current production observation.')


def source(alice, reviewer=None, content=SOURCE):
    result = alice.post(BASE + '/documents', json={'title': 'TMF reference', 'topic': 'TMF', 'content': content})
    assert result.status_code == 201, result.text
    doc = result.json()
    if reviewer:
        approve(alice, reviewer, doc['id'])
    graph = alice.get(BASE + '/graph').json()
    command = next(n for n in graph['nodes'] if n.get('entity_type') == 'command' and n['label'] == 'TMFCOM STATUS TMF')
    detail = alice.get(BASE + '/graph/node', params={'node_id': command['id']}).json()
    return doc, command, detail['evidence'][0]['citation_id']


def note(alice, command, citation, relation='cites'):
    response = alice.post(BASE + '/knowledge/notes', json={
        'title': 'TMF investigation guidance',
        'content': 'During a TMF investigation, consult TMFCOM STATUS TMF before escalation. Interpret its documented information against the approved site procedure.',
        'category': 'procedure', 'concept_ids': [command['id']],
        'citations': [{'citation_id': citation, 'relation': relation}], 'sign_as_current_user': True})
    assert response.status_code == 201, response.text
    return response.json()


def kinds(client):
    return {e['kind'] for e in client.get(BASE + '/graph').json()['edges']}


def test_typed_entities_cite_exact_text_without_inventing_topology(clients):
    alice, bob, reviewer = clients
    doc, command, citation_id = source(alice)
    graph = alice.get(BASE + '/graph').json()
    types = {n.get('entity_type') for n in graph['nodes']}
    assert {'subsystem', 'command', 'event', 'object_reference', 'site_reference', 'metric', 'version'} <= types
    detail = alice.get(BASE + '/graph/node', params={'node_id': command['id']}).json()
    assert detail['properties']['executable'] is False
    assert detail['properties']['operational_state'] == 'not_inferred_from_documentation'
    assert detail['evidence'][0]['citation_id'] == citation_id
    assert detail['evidence'][0]['quote'] in SOURCE
    assert not {'hosts', 'causes', 'depends_on'} & kinds(alice)
    assert bob.get(BASE + '/graph/node', params={'node_id': command['id']}).status_code == 404
    assert bob.get(BASE + '/graph/search', params={'q': 'STATUS TMF'}).json()['nodes'] == []
    assert not bob.get(BASE + '/knowledge/catalog').json()['citations']
    approve(alice, reviewer, doc['id'])
    assert bob.get(BASE + '/graph/node', params={'node_id': command['id']}).status_code == 200


def test_shared_literal_identity_preserves_each_document_acl_and_evidence(clients):
    alice, bob, reviewer = clients
    doc, command, _ = source(alice, reviewer)
    private, same, _ = source(bob)
    assert command['id'] == same['id']
    evidence = alice.get(BASE + '/graph/node', params={'node_id': command['id']}).json()['evidence']
    assert {e['document_id'] for e in evidence} == {doc['id']}
    evidence = bob.get(BASE + '/graph/node', params={'node_id': command['id']}).json()['evidence']
    assert {e['document_id'] for e in evidence} == {doc['id'], private['id']}


def test_signed_guidance_and_declared_conflicts_wait_for_independent_approval(clients):
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    guidance = note(alice, command, citation_id, 'contradicts')
    assert guidance['owner_id'] == 'alice' and guidance['expert_note']['category'] == 'procedure'
    assert 'wrote' in kinds(alice) and 'contradicts' in kinds(alice)
    assert 'expert_in' not in kinds(alice)
    assert not bob.get(BASE + '/knowledge/catalog').json()['notes']
    assert alice.post(f'{BASE}/documents/{guidance["id"]}/review', json={'decision': 'approved'}).status_code == 403
    approve(alice, reviewer, guidance['id'])
    assert 'expert_in' in kinds(bob)
    conflict = next(e for e in bob.get(BASE + '/graph').json()['edges'] if e['kind'] == 'contradicts')
    assert conflict['basis'] == 'author_declared_citation_relation'
    assert conflict['assertion_status'] == 'independently_reviewed'


def test_learning_requires_check_and_sharing_is_revocable(clients):
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    guidance = note(alice, command, citation_id)
    assert bob.post(BASE + '/knowledge/checks', json={'document_id': guidance['id']}).status_code == 404
    approve(alice, reviewer, guidance['id'])
    bob.get(BASE + '/documents/' + guidance['id'])
    assert 'knows' not in kinds(bob)
    assert alice.post(BASE + '/knowledge/checks', json={'document_id': guidance['id']}).status_code == 409
    check = bob.post(BASE + '/knowledge/checks', json={'document_id': guidance['id']}).json()
    assert 'expected' not in check and '____' in check['prompt']
    assert alice.post(BASE + '/knowledge/checks/' + check['id'] + '/answer', json={'answer': 'TMFCOM STATUS TMF'}).status_code == 404
    failed = bob.post(BASE + '/knowledge/checks/' + check['id'] + '/answer', json={'answer': 'wrong command'}).json()
    assert failed['passed'] is False and 'knows' not in kinds(bob)
    # A failed attempt cannot be changed into a pass by submitting it again.
    assert not bob.post(BASE + '/knowledge/checks/' + check['id'] + '/answer', json={'answer': 'TMFCOM STATUS TMF'}).json()['passed']
    check = bob.post(BASE + '/knowledge/checks', json={'document_id': guidance['id']}).json()
    passed = bob.post(BASE + '/knowledge/checks/' + check['id'] + '/answer', json={'answer': ' tmfcom   status tmf '}).json()
    assert passed['passed'] is True
    assert {'knows', 'learned_from'} <= kinds(bob)
    assert 'knows' not in kinds(alice)
    assert not any(e['kind'] == 'knowledge_demonstrated' for e in alice.get(BASE + '/graph').json()['events'])
    assert bob.post(BASE + '/knowledge/profile', json={'role': 'learner', 'share_activity': True}).status_code == 200
    assert 'knows' in kinds(alice)
    assert bob.post(BASE + '/knowledge/profile', json={'role': 'mentor', 'share_activity': False}).status_code == 200
    assert 'knows' not in kinds(alice)
    assert bob.get(BASE + '/session').json()['can_review'] is False


def test_edition_change_flags_guidance_and_hides_outdated_expertise(clients):
    alice, bob, reviewer = clients
    old, command, citation_id = source(alice, reviewer)
    guidance = note(alice, command, citation_id)
    approve(alice, reviewer, guidance['id'])
    newer, _, _ = source(alice, content=SOURCE + '\nAn updated published edition is now available.')
    assert bob.post(BASE + '/knowledge/editions', json={'newer_id': newer['id'], 'previous_id': old['id']}).status_code == 404
    assert alice.post(BASE + '/knowledge/editions', json={'newer_id': newer['id'], 'previous_id': old['id']}).status_code == 201
    assert alice.post(BASE + '/knowledge/editions', json={'newer_id': old['id'], 'previous_id': newer['id']}).status_code == 409
    assert not alice.get(BASE + '/documents/' + guidance['id']).json()['expert_note']['needs_review']
    approve(alice, reviewer, newer['id'])
    assert bob.get(BASE + '/documents/' + guidance['id']).json()['expert_note']['needs_review']
    assert 'expert_in' not in kinds(bob)
    assert bob.post(BASE + '/knowledge/checks', json={'document_id': guidance['id']}).status_code == 409
    user = bob.get(BASE + '/session').json()
    assert guidance['id'] not in {s['document_id'] for s in store.retrieve_documents(user, 'TMF investigation escalation', 20)}


def test_paths_use_stored_relationships_and_refuse_private_targets(clients):
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice)
    guidance = note(alice, command, citation_id)
    result = alice.get(BASE + '/graph/path', params={'source': 'person:alice', 'target': command['id']})
    assert result.status_code == 200, result.text
    assert result.json()['found'] and result.json()['edges']
    assert bob.get(BASE + '/graph/path', params={'source': 'person:bob', 'target': command['id']}).status_code == 404
    assert not any(n['id'] == 'document:' + guidance['id'] for n in bob.get(BASE + '/graph').json()['nodes'])


@pytest.mark.parametrize('interpreted', [False, True])
def test_question_links_do_not_publish_private_conversation_text(clients, monkeypatch, interpreted):
    from app import agent_orchestrator
    alice, bob, reviewer = clients
    doc, command, citation_id = source(alice, reviewer)
    result = {'answer': 'Consult the source.', 'sources': [{'id': citation_id, 'document_id': doc['id']}], 'trace': []}
    if interpreted:
        result['interpretation'] = 'Explain what TMFCOM STATUS TMF reports for my private-case-phrase.'
    monkeypatch.setattr(agent_orchestrator, 'run', lambda *a: result)
    thread = bob.post(BASE + '/conversations').json()['id']
    question = 'What about it for my private-case-phrase?' if interpreted else 'Does TMFCOM STATUS TMF include my private-case-phrase?'
    payload = {'question': question, 'request_id': 'semantic_request_001'}
    response = bob.post(f'{BASE}/conversations/{thread}/messages', json=payload)
    assert response.status_code == 200
    assert bob.get(f'{BASE}/conversations/{thread}').json()['messages'][0]['content'] == question
    assert 'asked_about' in kinds(bob) and 'knows' not in kinds(bob)
    assert 'asked_about' not in kinds(alice)
    assert 'private-case-phrase' not in bob.get(BASE + '/graph').text
    bob.post(BASE + '/knowledge/profile', json={'role': 'learner', 'share_activity': True})
    shared = alice.get(BASE + '/graph')
    assert 'asked_about' in kinds(alice) and 'private-case-phrase' not in shared.text
    assert bob.post(f'{BASE}/conversations/{thread}/messages', json=payload).status_code == 200
    graph = bob.get(BASE + '/graph').json()
    assert len([e for e in graph['edges'] if e['kind'] == 'asked_about' and e['target'] == command['id']]) == 1


def test_sparse_headings_are_conservative_and_reindex_is_idempotent(clients):
    alice, _, _ = clients
    assert not knowledge.extract('Message 3119\nRUN Command', 'General notes')
    assert any(e['label'] == 'TACL RUN' for e in knowledge.extract('RUN Command', 'TACL Reference'))
    assert not any(e['kind'] == 'event' for e in knowledge.extract('See page 3119', 'TACL Reference'))
    assert not any(e['method'].startswith('explicit_heading') for e in knowledge.extract('FC Command on page 147', 'TACL Reference'))
    doc, _, _ = source(alice)
    before = alice.get(BASE + '/graph').json()
    assert alice.post(BASE + '/graph/index-documents', json={}).json()['indexed_documents'] == 0
    after = alice.get(BASE + '/graph').json()
    assert {n['id'] for n in before['nodes']} == {n['id'] for n in after['nodes']}
    assert after['semantic']['needs_index'] == 0


def test_explanation_feedback_cannot_award_learning_without_independent_review(clients, monkeypatch):
    from app import knowledge_assessment
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    guidance = note(alice, command, citation_id)
    approve(alice, reviewer, guidance['id'])
    monkeypatch.setattr(knowledge_assessment, 'assess', lambda *a: 'Model feedback for the reviewer only.')
    check = bob.post(BASE + '/knowledge/checks', json={'document_id': guidance['id'], 'mode': 'explanation'}).json()
    response = bob.post(BASE + '/knowledge/checks/' + check['id'] + '/answer', json={'answer': 'TMFCOM STATUS TMF supplies documented TMF information. I would compare it with the approved site procedure before escalation.'})
    assert response.status_code == 200 and response.json()['awaiting_review']
    assert 'knows' not in kinds(bob)
    assert not alice.get(BASE + '/knowledge/check-reviews').json()['checks']
    pending = reviewer.get(BASE + '/knowledge/check-reviews').json()['checks']
    assert pending and pending[0]['person_id'] == 'bob'
    body = {'decision': 'approved', 'notes': 'The explanation cites the correct command and explicitly retains the site-procedure limit.'}
    assert bob.post(BASE + '/knowledge/checks/' + check['id'] + '/review', json=body).status_code == 403
    assert reviewer.post(BASE + '/knowledge/checks/' + check['id'] + '/review', json=body).json()['passed']
    learning = [e for e in bob.get(BASE + '/graph').json()['edges'] if e['kind'] == 'knows']
    assert learning and learning[0]['basis'] == 'independently_reviewed_explanation'
    assert 'knows' not in kinds(alice)


def test_model_feedback_requires_literal_support_and_missing_model_is_safe(monkeypatch):
    from app import knowledge_assessment, agent_orchestrator
    monkeypatch.setattr(agent_orchestrator, 'model_json', lambda *a, **kw: {'feedback': 'Looks good', 'source_quotes': ['invented quote']})
    assert 'unavailable' in knowledge_assessment.assess({'content': SOURCE}, 'Learner explanation')
    monkeypatch.setattr(agent_orchestrator, 'model_json', lambda *a, **kw: {'feedback': 'Check the stated scope.', 'source_quotes': ['TMFCOM STATUS TMF reports TMF information.']})
    assert 'Supporting guidance' in knowledge_assessment.assess({'content': SOURCE}, 'Learner explanation')


def test_guidance_rejects_missing_signature_duplicate_or_mismatched_evidence(clients):
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    body = {'title': 'Guidance', 'content': 'Consult the documented command before making a decision.',
            'concept_ids': [command['id']], 'citations': [{'citation_id': citation_id, 'relation': 'cites'}]}
    assert alice.post(BASE + '/knowledge/notes', json=body).status_code == 422
    body['sign_as_current_user'] = True
    body['citations'] *= 2
    assert alice.post(BASE + '/knowledge/notes', json=body).status_code == 422
    other = alice.post(BASE + '/documents', json={'title': 'Other source', 'topic': 'SCF', 'content': 'SCF INFO PROCESS is an explicitly mentioned command in this test reference.'}).json()
    with store.database() as db:
        different_citation = db.execute('SELECT id FROM ws_chunks WHERE document_id=?', (other['id'],)).fetchone()['id']
    body['citations'] = [{'citation_id': different_citation, 'relation': 'cites'}]
    assert alice.post(BASE + '/knowledge/notes', json=body).status_code == 422


def test_index_upgrade_preserves_old_citation_and_passage_ids(clients):
    alice, bob, _ = clients
    doc, command, citation_id = source(alice)
    before = alice.get(BASE + '/graph').json()
    with store.database() as db:
        db.execute('DELETE FROM ws_semantic_indexes WHERE document_id=?', (doc['id'],))
        db.execute('DELETE FROM ws_concept_mentions WHERE document_id=?', (doc['id'],))
    assert alice.get(BASE + '/graph').json()['semantic']['needs_index'] == 1
    assert bob.post(BASE + '/graph/index-documents', json={'document_id': doc['id']}).status_code == 404
    assert alice.post(BASE + '/graph/index-documents', json={}).json()['indexed_documents'] == 1
    after = alice.get(BASE + '/graph').json()
    assert {n['id'] for n in before['nodes']} == {n['id'] for n in after['nodes']}
    assert after['semantic']['needs_index'] == 0


def test_concept_neighborhood_is_bounded_and_has_stable_edge_ids(clients):
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    guidance = note(alice, command, citation_id)
    approve(alice, reviewer, guidance['id'])
    graph = bob.get(BASE + '/graph').json()
    neighborhood = bob.get(BASE + '/graph/neighborhood', params={'node_id': command['id']}).json()
    assert any(e['kind'] == 'expert_in' for e in neighborhood['edges'])
    assert {e['id'] for e in neighborhood['edges']} <= {e['id'] for e in graph['edges']}


def test_learning_bookkeeping_failure_does_not_lose_the_answer(clients, monkeypatch):
    from app import agent_orchestrator
    alice, _, _ = clients
    monkeypatch.setattr(agent_orchestrator, 'run', lambda *a: {'answer': 'Your answer was saved.', 'sources': [], 'trace': []})
    monkeypatch.setattr(knowledge, 'record_question', lambda *a: (_ for _ in ()).throw(RuntimeError('bookkeeping unavailable')))
    thread = alice.post(BASE + '/conversations').json()['id']
    response = alice.post(f'{BASE}/conversations/{thread}/messages', json={'question': 'Keep this turn.', 'request_id': 'learning_failure_001'})
    assert response.status_code == 200
    messages = alice.get(BASE + '/conversations/' + thread).json()['messages']
    assert len(messages) == 2 and messages[-1]['content'] == 'Your answer was saved.'


def test_monitoring_observation_links_only_to_literal_permitted_concepts(clients):
    import json
    from app import workspace_topology
    alice, bob, reviewer = clients
    _, command, citation_id = source(alice, reviewer)
    user = alice.get(BASE + '/session').json()
    payload = workspace_topology.normalize({'nodes': [
        {'id': 'record-3119', 'label': 'TMF message 3119', 'type': 'alarm',
         'properties': {'message': 'The source record names TMFCOM STATUS TMF.'}},
    ], 'edges': []})
    imported = workspace_topology.import_dataset(user, 'Observed alarm export', 'source.json', json.dumps(payload).encode(),
                                                  supplied_payload=payload, source_kind='monitoring_export')
    graph = alice.get(BASE + '/graph').json()
    links = [e for e in graph['edges'] if e['kind'] == 'mentions_concept']
    assert links and any(e['target'] == command['id'] for e in links)
    assert all(e['basis'] == 'literal_source_observation_text_not_causation' for e in links)
    assert 'mentions_concept' not in kinds(bob)
    approve(alice, reviewer, imported['document_id'])
    assert 'mentions_concept' in kinds(bob)
