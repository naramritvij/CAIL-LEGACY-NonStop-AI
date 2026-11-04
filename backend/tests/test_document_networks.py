"""Evidence graphs use actual stored test text, with no generated site topology."""
import hashlib

from fastapi import HTTPException
from app import document_network, workspace_store as store
from test_agent_workspace import clients, approve

BASE = '/api/v1/workspace'
TEXT = '# Handover notes\nTMFCOM STATUS TMF reports TMF information.\nUse the approved Pathway manual for PATHCOM STATUS SERVER.\nThese notes describe documentation, not the current site state.'


def upload(client):
    response = client.post(BASE + '/documents', json={'title': 'Operator reference', 'topic': 'TMF', 'content': TEXT})
    assert response.status_code == 201, response.text
    return response.json()


def test_upload_creates_cited_passages_and_literal_references(clients):
    alice, bob, reviewer = clients
    document = upload(alice)
    graph = alice.get(BASE + '/graph').json()
    dataset = next(item for item in graph['datasets'] if item['document_id'] == document['id'])
    assert dataset['source_kind'] == 'document_evidence' and dataset['status'] == 'draft'
    passages = [node for node in graph['nodes'] if node.get('entity_type') == 'passage']
    assert passages
    detail = alice.get(BASE + '/graph/node', params={'node_id': passages[0]['id']}).json()
    assert detail['properties']['citation_id'].startswith('DOC-')
    assert detail['properties']['excerpt'] in TEXT
    assert any(node['label'] == 'TMFCOM STATUS TMF' for node in graph['nodes'])
    assert any(edge['source'] == 'document:' + document['id'] and edge['target'] == passages[0]['id'] and edge['kind'] == 'contains' for edge in graph['edges'])
    assert any(edge['label'] == 'mentions' for edge in graph['edges'])
    assert not any(edge['label'] in ('causes', 'hosts', 'depends on') for edge in graph['edges'])
    assert not bob.get(BASE + '/graph').json()['datasets']
    assert bob.get(BASE + '/graph/node', params={'node_id': passages[0]['id']}).status_code == 404
    approve(alice, reviewer, document['id'])
    assert bob.get(BASE + '/graph/node', params={'node_id': passages[0]['id']}).status_code == 200
    assert bob.get(BASE + '/documents/' + document['id']).json()['owner_id'] == 'alice'


def test_existing_document_index_is_owner_scoped_and_idempotent(clients):
    alice, bob, _ = clients
    with store.database() as db:
        identifier = store.insert_document(db, {'id': 'alice', 'name': 'Alice'}, 'Before graph indexing', 'old.txt', TEXT, 'TMF', build_network=False)
    assert alice.get(BASE + '/graph').json()['datasets'] == []
    assert bob.post(BASE + '/graph/index-documents', json={'document_id': identifier}).status_code == 404
    assert alice.post(BASE + '/graph/index-documents', json={'document_id': identifier}).json()['indexed_documents'] == 1
    first = alice.get(BASE + '/graph').json()
    assert alice.post(BASE + '/graph/index-documents', json={'document_id': identifier}).json()['indexed_documents'] == 0
    assert {node['id'] for node in alice.get(BASE + '/graph').json()['nodes']} == {node['id'] for node in first['nodes']}


def test_graph_index_failure_rolls_back_document_and_chunks(clients, monkeypatch):
    def fail(*args):
        raise HTTPException(422, 'Test indexing failure')
    monkeypatch.setattr(document_network, 'index', fail)
    response = clients[0].post(BASE + '/documents', json={'title': 'Atomic upload', 'content': TEXT})
    assert response.status_code == 422
    with store.database() as db:
        for table in ('ws_documents', 'ws_chunks', 'ws_topology_datasets', 'ws_topology_nodes'):
            assert db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] == 0


def test_full_reference_manual_has_edition_provenance_and_review_gated_retrieval(clients):
    alice, bob, reviewer = clients
    text = (TEXT + '\n') * 1400  # Explicit synthetic text fixture larger than normal note limits.
    raw = text.encode()
    response = alice.post(BASE + '/documents/manual', files={'file': ('reference.txt', raw, 'text/plain')},
                          data={'title': 'Test reference edition', 'topic': 'TMF', 'edition': 'Test edition A', 'source_url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=test'})
    assert response.status_code == 201, response.text
    document = response.json()
    assert document['reference']['edition'] == 'Test edition A'
    assert document['reference']['file_sha256'] == hashlib.sha256(raw).hexdigest()
    assert len(document['content']) > 200000
    assert len([node for node in alice.get(BASE + '/graph').json()['nodes'] if node.get('entity_type') == 'passage']) > 180
    assert store.retrieve_documents({'id': 'bob'}, 'TMFCOM') == []
    approve(alice, reviewer, document['id'])
    retrieved = store.retrieve_documents({'id': 'bob'}, 'TMFCOM')
    assert retrieved and retrieved[0]['edition'] == 'Test edition A'
    assert retrieved[0]['release_applicability'] == 'not_inferred'
    assert bob.get(BASE + '/documents/' + document['id']).json()['owner_id'] == 'alice'


def test_manual_validation_does_not_leave_partial_records(clients):
    alice = clients[0]
    for data, body in [({'source_url': 'http://not-https.example'}, TEXT), ({}, 'x' * 2_000_001)]:
        response = alice.post(BASE + '/documents/manual', files={'file': ('bad.txt', body.encode(), 'text/plain')}, data=data)
        assert response.status_code == 422
    assert alice.get(BASE + '/graph').json()['total_documents'] == 0
