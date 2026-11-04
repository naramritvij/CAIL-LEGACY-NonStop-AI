"""Real graph contracts: large imports, ACLs, attachment atomicity and live reads.

Generated networks below are explicit synthetic TEST fixtures, never app seeds.
"""
from datetime import datetime, timedelta, timezone
import json

from fastapi import HTTPException
import pytest

from app import workspace_store as store, workspace_topology as topology
from test_agent_workspace import clients, approve, create_doc

BASE = '/api/v1/workspace'


def fixture(size=3):
    return {'nodes': [{'id': str(index), 'label': f'Test entity {index:06d}', 'type': 'system' if index == 0 else 'service',
                       'properties': {'test_fixture': True}} for index in range(size)],
            'edges': [{'source': str((index - 1) // 3), 'target': str(index), 'label': 'fixture connects to'} for index in range(1, size)]}


def import_graph(client, payload=None, filename='test-topology.json'):
    body = json.dumps(payload if payload is not None else fixture()).encode()
    return client.post(BASE + '/graph/import', files={'file': (filename, body, 'application/json')}, data={'title': 'Synthetic test fixture'})


def configure(monkeypatch):
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'true')
    monkeypatch.setenv('CAIL_LIVE_ALLOWED_HOSTS', 'topology.example.internal')
    monkeypatch.setenv('CAIL_LIVE_PROGNOSIS_TOPOLOGY_URL', 'https://topology.example.internal/approved/topology')
    monkeypatch.setenv('CAIL_LIVE_PROGNOSIS_TOKEN', 'server-only-topology-read-token-12345')


def source_payload(**updates):
    data = {'source_id': 'prognosis', 'system_id': 'authorized-test-system', 'observed_at': datetime.now(timezone.utc).isoformat(), **fixture()}
    data.update(updates)
    return data


def patch_gateway(monkeypatch, data, requests):
    class Response:
        status = 200
        headers = {'Content-Type': 'application/json'}
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, maximum): return json.dumps(data).encode()
    class Opener:
        def open(self, request, timeout):
            assert request.get_method() == 'GET' and timeout == 15
            assert request.full_url == 'https://topology.example.internal/approved/topology'
            assert request.get_header('Authorization') == 'Bearer server-only-topology-read-token-12345'
            requests.append(request)
            return Response()
    monkeypatch.setattr(topology, 'build_opener', lambda *args: Opener())


def test_no_network_is_fabricated_in_empty_workspace(clients):
    graph = clients[0].get(BASE + '/graph').json()
    assert len(graph['nodes']) == 1 and graph['nodes'][0]['kind'] == 'person'
    assert graph['edges'] == [] and graph['datasets'] == []
    assert all(not source['can_sync'] for source in graph['sources'])


def test_thousands_of_imported_entities_are_not_cut_at_150(clients):
    alice = clients[0]
    imported = import_graph(alice, fixture(5000))
    assert imported.status_code == 201, imported.text
    assert imported.json()['node_count'] == 5000 and imported.json()['live'] is False
    graph = alice.get(BASE + '/graph').json()
    assert len([node for node in graph['nodes'] if node['kind'] == 'entity']) == 5000
    assert len([edge for edge in graph['edges'] if edge['kind'] == 'source_relationship']) == 4999
    assert graph['total_nodes'] == len(graph['nodes']) and not graph['truncated']
    assert graph['datasets'][0]['source_kind'] == 'imported_export'
    ids = {node['id'] for node in graph['nodes']}
    assert all(edge['source'] in ids and edge['target'] in ids for edge in graph['edges'])
    repeated = alice.get(BASE + '/graph?cursor=' + graph['cursor']).json()
    assert repeated['not_modified'] is True and 'nodes' not in repeated


@pytest.mark.parametrize('change', ['duplicate', 'dangling', 'too_many', 'nonfinite'])
def test_invalid_exports_do_not_partially_create_documents(clients, change):
    data = fixture()
    if change == 'duplicate': data['nodes'].append(data['nodes'][0])
    if change == 'dangling': data['edges'][0]['target'] = 'not-supplied'
    if change == 'too_many': data['nodes'] = [{'id': str(i)} for i in range(topology.MAX_NODES + 1)]
    if change == 'nonfinite': data['nodes'][0]['properties']['invalid'] = float('nan')
    response = import_graph(clients[0], data)
    assert response.status_code == 422
    assert clients[0].get(BASE + '/graph').json()['total_documents'] == 0


def test_graphology_and_csv_input_retain_supplied_relationships(clients):
    alice = clients[0]
    data = {'nodes': [{'key': 'A', 'attributes': {'label': 'System A', 'type': 'system', 'region': 'test'}}, {'key': 'B', 'attributes': {'label': 'Service B'}}],
            'edges': [{'key': 'A-B', 'source': 'A', 'target': 'B', 'attributes': {'label': 'hosts'}}]}
    assert import_graph(alice, data).status_code == 201
    result = alice.post(BASE + '/graph/import', files={'file': ('topology.csv', b'source,target,relationship,source_label,target_label\nS,P,hosts,Test system,Test process\n', 'text/csv')}, data={'title': 'CSV test export'})
    assert result.status_code == 201, result.text
    graph = alice.get(BASE + '/graph').json()
    assert len([node for node in graph['nodes'] if node['kind'] == 'entity']) == 4
    assert len([edge for edge in graph['edges'] if edge['label'] == 'hosts']) == 2


def test_dataset_review_controls_search_details_and_neighborhood(clients):
    alice, bob, reviewer = clients
    imported = import_graph(alice).json()
    own = alice.get(BASE + '/graph').json()
    entity = next(node for node in own['nodes'] if node['kind'] == 'entity')
    assert bob.get(BASE + '/graph/search', params={'q': entity['label']}).json()['nodes'] == []
    for route in ('/graph/node', '/graph/neighborhood'):
        assert bob.get(BASE + route, params={'node_id': entity['id']}).status_code == 404
    assert not bob.get(BASE + '/graph').json()['datasets']
    approve(alice, reviewer, imported['document_id'])
    assert bob.get(BASE + '/graph/search', params={'q': entity['label']}).json()['nodes'][0]['id'] == entity['id']
    assert bob.get(BASE + '/graph/node', params={'node_id': entity['id']}).status_code == 200
    assert bob.get(BASE + '/graph/neighborhood', params={'node_id': entity['id']}).status_code == 200


def test_attachment_is_atomic_private_and_preserves_contributor(clients):
    alice, bob, reviewer = clients
    imported = import_graph(alice).json()
    graph = alice.get(BASE + '/graph').json()
    node = next(node for node in graph['nodes'] if node['kind'] == 'entity')
    denied = bob.post(BASE + '/documents', json={'title': 'Private target', 'content': 'A valid note attached to a node I cannot access.', 'target_node_id': node['id']})
    assert denied.status_code == 404
    assert bob.get(BASE + '/graph').json()['total_documents'] == 0
    approve(alice, reviewer, imported['document_id'])
    uploaded = bob.post(BASE + '/documents/upload', files={'file': ('notes.txt', b'Permitted contextual information about this test source entity.', 'text/plain')}, data={'topic': 'Test', 'target_node_id': node['id']})
    assert uploaded.status_code == 201, uploaded.text
    doc_id = uploaded.json()['id']
    own = bob.get(BASE + '/graph').json()
    assert any(edge['source'] == 'document:' + doc_id and edge['target'] == node['id'] and edge['kind'] == 'documents' for edge in own['edges'])
    assert not any(edge['source'] == 'document:' + doc_id for edge in alice.get(BASE + '/graph').json()['edges'])
    approve(bob, reviewer, doc_id)
    assert alice.get(BASE + '/documents/' + doc_id).json()['owner_id'] == 'bob'
    assert any(edge['kind'] == 'documents' for edge in alice.get(BASE + '/graph/neighborhood', params={'node_id': node['id']}).json()['edges'])


def test_source_entity_cannot_impersonate_an_authenticated_operator(clients):
    data = fixture()
    data['nodes'][0].update({'id': 'alice', 'type': 'person', 'properties': {'password': 'private-value', 'api_key': 'private-value', 'region': 'test'}})
    data['edges'][0]['source'] = 'alice'
    data['edges'][1]['source'] = 'alice'
    assert import_graph(clients[0], data).status_code == 201
    graph = clients[0].get(BASE + '/graph').json()
    node = next(node for node in graph['nodes'] if node['entity_id'] == 'alice' and node['kind'] == 'entity')
    detail = clients[0].get(BASE + '/graph/node', params={'node_id': node['id']}).json()
    assert detail['properties'] == {'region': 'test'}
    assert len([node for node in graph['nodes'] if node['kind'] == 'person']) == 1


def test_bounded_view_can_search_and_expand_unloaded_entities(clients):
    alice = clients[0]
    result = import_graph(alice, fixture(13000))
    assert result.status_code == 201
    graph = alice.get(BASE + '/graph').json()
    assert graph['truncated'] and len(graph['nodes']) <= topology.VIEW_NODES
    shown = {node['id'] for node in graph['nodes']}
    with store.database() as db:
        missing = next(dict(row) for row in db.execute('SELECT id,label FROM ws_topology_nodes') if row['id'] not in shown)
    search = alice.get(BASE + '/graph/search', params={'q': missing['label']}).json()
    assert search['nodes'][0]['id'] == missing['id']
    neighborhood = alice.get(BASE + '/graph/neighborhood', params={'node_id': missing['id']}).json()
    assert any(node['id'] == missing['id'] for node in neighborhood['nodes'])
    assert neighborhood['edges']


def test_unauthorized_live_sync_never_touches_network(clients, monkeypatch):
    configure(monkeypatch)
    monkeypatch.setattr(topology, 'read_live', lambda *args: pytest.fail('Unauthorized source read'))
    assert clients[0].post(BASE + '/graph/sync').status_code == 403


def test_live_source_validates_transport_and_retains_real_provenance(clients, monkeypatch):
    configure(monkeypatch)
    requests = []
    patch_gateway(monkeypatch, source_payload(**fixture(3000)), requests)
    reviewer = clients[2]
    result = reviewer.post(BASE + '/graph/sync')
    assert result.status_code == 200 and result.json()['sources'][0]['node_count'] == 3000
    graph = reviewer.get(BASE + '/graph').json()
    assert graph['datasets'][0]['source_kind'] == 'live_topology' and not graph['datasets'][0]['stale']
    assert len([node for node in graph['nodes'] if node['kind'] == 'entity']) == 3000
    assert len(graph['datasets'][0]['sha256']) == 64 and 'server-only-topology-read-token' not in json.dumps(graph)
    ids = {node['id'] for node in graph['nodes']}
    reviewer.post(BASE + '/graph/sync')
    assert {node['id'] for node in reviewer.get(BASE + '/graph').json()['nodes']} == ids
    assert len(requests) == 2
    assert not clients[0].get(BASE + '/graph').json()['datasets']


@pytest.mark.parametrize('bad', ['stale', 'source', 'dangling'])
def test_bad_live_payloads_do_not_substitute_synthetic_graphs(clients, monkeypatch, bad):
    configure(monkeypatch)
    data = source_payload()
    if bad == 'stale': data['observed_at'] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    if bad == 'source': data['source_id'] = 'different-vendor'
    if bad == 'dangling': data['edges'][0]['target'] = 'not-in-payload'
    patch_gateway(monkeypatch, data, [])
    result = clients[2].post(BASE + '/graph/sync').json()
    assert result['sources'][0]['status'] == 'unavailable'
    assert clients[2].get(BASE + '/graph').json()['datasets'] == []


def test_failure_marks_all_remaining_source_views_stale_and_disabling_hides_them(clients, monkeypatch):
    configure(monkeypatch)
    patch_gateway(monkeypatch, source_payload(), [])
    reviewer = clients[2]
    reviewer.post(BASE + '/graph/sync')
    initial = reviewer.get(BASE + '/graph').json()
    node = next(node for node in initial['nodes'] if node['kind'] == 'entity')
    def unavailable(key): raise HTTPException(502, 'Unavailable')
    monkeypatch.setattr(topology, 'read_live', unavailable)
    reviewer.post(BASE + '/graph/sync')
    failed = reviewer.get(BASE + '/graph').json()
    assert failed['datasets'][0]['stale']
    assert all(node['stale'] for node in failed['nodes'] if node['kind'] == 'entity')
    assert reviewer.get(BASE + '/graph/node', params={'node_id': node['id']}).json()['status'] == 'stale'
    assert reviewer.get(BASE + '/graph/search', params={'q': node['label']}).json()['nodes'][0]['stale']
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'false')
    disabled = reviewer.get(BASE + '/graph?cursor=' + failed['cursor']).json()
    assert 'not_modified' not in disabled and disabled['datasets'] == []
    assert reviewer.get(BASE + '/graph/node', params={'node_id': node['id']}).status_code == 404


def test_a_write_during_projection_is_visible_on_the_next_poll(clients, monkeypatch):
    alice = clients[0]
    original = store.knowledge_graph
    inserted = False
    def racing(user):
        nonlocal inserted
        data = original(user)
        if not inserted:
            inserted = True
            store.create_document(user, 'Race window note', 'note.txt', 'A real stored note added while the graph was being read.', 'Testing')
        return data
    monkeypatch.setattr(store, 'knowledge_graph', racing)
    first = alice.get(BASE + '/graph').json()
    next_poll = alice.get(BASE + '/graph?cursor=' + first['cursor']).json()
    assert not next_poll.get('not_modified')
    assert any(node['label'] == 'Race window note' for node in next_poll['nodes'])


@pytest.mark.parametrize('vendor', topology.VENDORS)
def test_each_vendor_can_connect_topology_without_a_metrics_endpoint(clients, monkeypatch, vendor):
    configure(monkeypatch)
    for source in topology.VENDORS:
        monkeypatch.delenv(f'CAIL_LIVE_{source.upper()}_TOPOLOGY_URL', raising=False)
        monkeypatch.delenv(f'CAIL_LIVE_{source.upper()}_URL', raising=False)
    monkeypatch.setenv(f'CAIL_LIVE_{vendor.upper()}_TOPOLOGY_URL', 'https://topology.example.internal/approved/topology')
    monkeypatch.setenv(f'CAIL_LIVE_{vendor.upper()}_TOKEN', 'server-only-topology-read-token-12345')
    requests = []
    patch_gateway(monkeypatch, source_payload(source_id=vendor), requests)
    reviewer = clients[2]
    result = reviewer.post(BASE + '/graph/sync', params={'source_id': vendor})
    assert result.status_code == 200 and result.json()['sources'][0]['id'] == vendor
    connections = reviewer.get(BASE + '/connections').json()
    source = next(item for item in connections['sources'] if item['id'] == vendor)
    assert source['topology_configured'] and source['topology_connected'] and source['connected']
    assert not source['metrics_configured'] and not source['metrics_connected']
    assert source['topology_node_count'] == 3 and source['snapshot'] is None
    assert len(requests) == 1


def test_changed_system_identity_does_not_rebind_old_annotations(clients, monkeypatch):
    configure(monkeypatch)
    patch_gateway(monkeypatch, source_payload(), [])
    reviewer = clients[2]
    reviewer.post(BASE + '/graph/sync')
    entity = next(node for node in reviewer.get(BASE + '/graph').json()['nodes'] if node['kind'] == 'entity')
    document = reviewer.post(BASE + '/documents', json={'title': 'System-specific note', 'content': 'This note belongs to the original system identity.', 'target_node_id': entity['id']}).json()
    patch_gateway(monkeypatch, source_payload(system_id='a-different-authorized-system'), [])
    reviewer.post(BASE + '/graph/sync')
    graph = reviewer.get(BASE + '/graph').json()
    assert not any(node['id'] == entity['id'] for node in graph['nodes'])
    assert not any(edge['kind'] == 'documents' for edge in graph['edges'])
    assert any(node['id'] == 'document:' + document['id'] for node in graph['nodes'])
