"""Drill-downs must preserve the graph's real connections and permissions."""
import json

from app import workspace_topology as topology
from test_agent_workspace import clients, approve
from test_semantic_knowledge import BASE, source, note


def connected_edges(data, identifier):
    return {e['id']: e for e in data['edges'] if identifier in (e['source'], e['target'])}


def assert_complete(data):
    ids = {n['id'] for n in data['nodes']}
    assert all(e['source'] in ids and e['target'] in ids for e in data['edges'])


def test_passage_drilldown_includes_its_document_concepts_and_permitted_guidance(clients):
    alice, bob, reviewer = clients
    doc, command, citation = source(alice, reviewer)
    guidance = note(alice, command, citation, 'supports')
    graph = alice.get(BASE + '/graph').json()
    passage = next(n for n in graph['nodes'] if n['entity_id'] == 'passage:' + citation)
    path = BASE + '/graph/neighborhood'
    detail = alice.get(path, params={'node_id': passage['id']}).json()
    assert_complete(detail)
    assert connected_edges(detail, passage['id']) == connected_edges(graph, passage['id'])
    assert 'document:' + doc['id'] in {n['id'] for n in detail['nodes']}
    assert command['id'] in {n['id'] for n in detail['nodes']}
    assert any(e['kind'] == 'supports' and e['citation_id'] == citation for e in detail['edges'])
    assert detail['total_edges'] == len(connected_edges(graph, passage['id']))
    assert alice.get(BASE + '/graph/node', params={'node_id': passage['id']}).json()['relationship_count'] == detail['total_edges']
    other = bob.get(path, params={'node_id': passage['id']}).json()
    assert_complete(other)
    assert 'document:' + guidance['id'] not in {n['id'] for n in other['nodes']}
    assert not any(e['kind'] == 'supports' for e in other['edges'])
    approve(alice, reviewer, guidance['id'])
    shared = bob.get(path, params={'node_id': passage['id']}).json()
    assert any(e['kind'] == 'supports' and e['assertion_status'] == 'independently_reviewed' for e in shared['edges'])


def test_observation_drilldown_matches_concept_and_guidance_links(clients):
    alice, bob, reviewer = clients
    _, command, citation = source(alice, reviewer)
    payload = topology.normalize({'nodes': [
        {'id': 'collection', 'label': 'Explicit test export', 'type': 'dataset'},
        {'id': 'alarm-3119', 'label': 'TMF message 3119', 'type': 'alarm',
         'properties': {'message': 'Test observation names TMFCOM STATUS TMF.'}},
    ], 'edges': [{'source': 'collection', 'target': 'alarm-3119', 'label': 'contains observation'}]})
    imported = topology.import_dataset(alice.get(BASE + '/session').json(), 'Test monitoring export',
        'test.json', json.dumps(payload).encode(), supplied_payload=payload, source_kind='monitoring_export')
    graph = alice.get(BASE + '/graph').json()
    observation = next(n for n in graph['nodes'] if n['entity_id'] == 'alarm-3119')
    guidance = alice.post(BASE + '/knowledge/notes', json={
        'title': 'Source-specific test guidance', 'content': 'Use TMFCOM STATUS TMF as a documentation reference for this test observation.',
        'category': 'procedure', 'concept_ids': [command['id']], 'citations': [{'citation_id': citation, 'relation': 'cites'}],
        'sign_as_current_user': True, 'target_node_id': observation['id']}).json()
    graph = alice.get(BASE + '/graph').json()
    for local_id in ('alarm-3119', 'collection'):
        selected = next(n for n in graph['nodes'] if n['entity_id'] == local_id)
        detail = alice.get(BASE + '/graph/neighborhood', params={'node_id': selected['id']}).json()
        assert_complete(detail)
        assert connected_edges(detail, selected['id']) == connected_edges(graph, selected['id'])
    links = alice.get(BASE + '/graph/neighborhood', params={'node_id': observation['id']}).json()['edges']
    assert any(e['kind'] == 'applies_to' and e['document_id'] == guidance['id'] for e in links)
    assert any(e['kind'] == 'mentions_concept' and e['target'] == command['id'] for e in links)
    assert bob.get(BASE + '/graph/neighborhood', params={'node_id': observation['id']}).status_code == 404
    approve(alice, reviewer, imported['document_id'])
    other = bob.get(BASE + '/graph/neighborhood', params={'node_id': observation['id']}).json()
    assert_complete(other)
    assert not any(e['kind'] == 'applies_to' for e in other['edges'])


def test_trails_reach_searchable_nodes_outside_overview_without_bypassing_permissions(clients, monkeypatch):
    alice, bob, _ = clients
    _, command, citation = source(alice)
    graph = alice.get(BASE + '/graph').json()
    passage = next(n for n in graph['nodes'] if n['entity_id'] == 'passage:' + citation)
    original = topology.graph
    monkeypatch.setattr(topology, 'graph', lambda user: original(user, node_limit=3))
    overview = alice.get(BASE + '/graph').json()
    assert command['id'] not in {n['id'] for n in overview['nodes']}
    assert passage['id'] not in {n['id'] for n in overview['nodes']}
    response = alice.get(BASE + '/graph/path', params={'source': command['id'], 'target': passage['id']})
    assert response.status_code == 200, response.text
    path = response.json()
    assert path['found'], path
    assert len(path['edges']) == 1 and path['edges'][0]['kind'] in ('defined_in', 'referenced_in')
    assert_complete(path)
    assert path['edges'][0]['source'] == command['id'] and path['edges'][0]['target'] == passage['id']
    assert bob.get(BASE + '/graph/path', params={'source': command['id'], 'target': passage['id']}).status_code == 404


def test_entity_neighborhood_discloses_its_bound_with_complete_endpoints(clients):
    alice, _, _ = clients
    _, _, citation = source(alice)
    graph = alice.get(BASE + '/graph').json()
    passage = next(n for n in graph['nodes'] if n['entity_id'] == 'passage:' + citation)
    user = alice.get(BASE + '/session').json()
    bounded = topology.neighborhood(user, passage['id'], limit=2)
    assert_complete(bounded)
    assert len(bounded['edges']) == 2 and bounded['truncated']
    assert bounded['total_edges'] == len(connected_edges(graph, passage['id'])) > 2


def test_live_drilldown_marks_every_source_relationship_stale_after_sync_failure(clients, monkeypatch):
    from fastapi import HTTPException
    from test_workspace_topology import configure, patch_gateway, source_payload
    _, _, reviewer = clients
    source(clients[0], reviewer)
    configure(monkeypatch)
    payload = source_payload(nodes=[
        {'id': 'alarm', 'label': 'TMF message 3119', 'type': 'alarm'},
        {'id': 'system', 'label': 'Explicit test system', 'type': 'system'},
    ], edges=[{'source': 'system', 'target': 'alarm', 'label': 'reported'}])
    patch_gateway(monkeypatch, payload, [])
    assert reviewer.post(BASE + '/graph/sync').json()['sources'][0]['status'] == 'connected'
    graph = reviewer.get(BASE + '/graph').json()
    alarm = next(n for n in graph['nodes'] if n['entity_id'] == 'alarm')

    def fail(*_):
        raise HTTPException(503, 'Controlled source outage')

    monkeypatch.setattr(topology, 'read_live', fail)
    assert reviewer.post(BASE + '/graph/sync').json()['sources'][0]['status'] == 'unavailable'
    snapshot = reviewer.get(BASE + '/graph/neighborhood', params={'node_id': alarm['id']}).json()
    assert_complete(snapshot)
    assert all(n['stale'] for n in snapshot['nodes'] if n.get('source_kind') == 'live_topology')
    assert snapshot['edges'] and all(e['stale'] for e in snapshot['edges'])
    assert any(e['kind'] == 'mentions_concept' for e in snapshot['edges'])


def test_multipart_upload_changes_the_poll_cursor_and_retains_real_ownership(clients):
    alice, bob, _ = clients
    before = alice.get(BASE + '/graph').json()
    text = b'# TMF upload test\nTMFCOM STATUS TMF is a documentation reference in this explicit synthetic test document.'
    uploaded = alice.post(BASE + '/documents/upload',
        files={'file': ('graph-upload-test.md', text, 'text/markdown')}, data={'title': 'TMF upload test', 'topic': 'TMF'})
    assert uploaded.status_code == 201, uploaded.text
    document = uploaded.json()
    assert document['owner_id'] == 'alice'
    graph = alice.get(BASE + '/graph', params={'cursor': before['cursor']}).json()
    assert not graph.get('not_modified') and graph['cursor'] != before['cursor']
    assert_complete(graph)
    assert any(e['kind'] == 'contributed' and e['source'] == 'person:alice' and
               e['target'] == 'document:' + document['id'] for e in graph['edges'])
    assert any(e['kind'] == 'documents_concept' and e['source'] == 'document:' + document['id'] for e in graph['edges'])
    assert alice.get(BASE + '/documents/' + document['id']).json()['content'] == text.decode()
    assert bob.get(BASE + '/documents/' + document['id']).status_code == 404
