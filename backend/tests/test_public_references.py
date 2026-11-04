"""Publisher access contracts use controlled fixtures; no CI downloads."""
import ssl

from fastapi import HTTPException
from app import public_references as references, workspace_api
from test_agent_workspace import clients, approve

BASE = '/api/v1/workspace'
COVER = 'Test publisher manual\nPart Number: TEST-123\nPublished: Test edition\nTACL STATUS is literal text in this controlled fixture.'


def patch_publisher(monkeypatch, calls):
    class Response:
        status = 200
        headers = {'Content-Type': 'application/pdf'}
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, limit): return b'%PDF-controlled-test-fixture'
    class Opener:
        def open(self, request, timeout):
            assert request.get_method() == 'GET' and timeout == 20
            assert request.full_url in {value['url'] for value in references.CATALOG.values()}
            assert request.get_header('Authorization') is None
            calls.append(request.full_url)
            return Response()
    def build(*handlers):
        assert handlers[0].__class__.__name__ == '_NoRedirect'
        assert handlers[1]._context.verify_mode == ssl.CERT_REQUIRED
        return Opener()
    monkeypatch.setattr(references, 'build_opener', build)
    monkeypatch.setattr(workspace_api, 'extract_text', lambda *args, **kwargs: COVER)


def test_catalog_does_not_read_remote_data_and_cannot_fetch_arbitrary_urls(clients, monkeypatch):
    calls = []
    patch_publisher(monkeypatch, calls)
    catalog = clients[0].get(BASE + '/references').json()
    assert len(catalog['references']) == 2 and not catalog['customer_monitoring_data'] and not calls
    bad = clients[0].post(BASE + '/references/import', json={'reference_key': 'https://unapproved.example/private'})
    assert bad.status_code == 404 and not calls


def test_publisher_download_has_private_owner_edition_and_stable_reimport(clients, monkeypatch):
    calls = []
    patch_publisher(monkeypatch, calls)
    alice, bob, reviewer = clients
    response = alice.post(BASE + '/references/import', json={'reference_key': 'hpe-tacl-reference'})
    assert response.status_code == 201, response.text
    document = response.json()
    assert document['owner_id'] == 'alice' and document['status'] == 'draft'
    assert document['reference']['source_kind'] == 'downloaded_public_hpe_reference'
    assert 'TEST-123' in document['reference']['edition']
    assert bob.get(BASE + '/graph').json()['datasets'] == []
    same = alice.post(BASE + '/references/import', json={'reference_key': 'hpe-tacl-reference'}).json()
    assert same['id'] == document['id'] and alice.get(BASE + '/graph').json()['total_documents'] == 1
    approve(alice, reviewer, document['id'])
    assert bob.get(BASE + '/graph').json()['datasets'][0]['source_kind'] == 'document_evidence'
    assert len(calls) == 2


def test_publisher_failure_leaves_no_partial_contribution(clients, monkeypatch):
    def fail(*args): raise HTTPException(502, 'Controlled publisher failure')
    monkeypatch.setattr(references, 'download', fail)
    response = clients[0].post(BASE + '/references/import', json={'reference_key': 'hpe-tacl-reference'})
    assert response.status_code == 502
    assert clients[0].get(BASE + '/graph').json()['total_documents'] == 0


def test_same_pdf_does_not_assign_another_operators_contribution(clients, monkeypatch):
    patch_publisher(monkeypatch, [])
    alice, bob, _ = clients
    first = alice.post(BASE + '/references/import', json={'reference_key': 'hpe-tacl-reference'}).json()
    second = bob.post(BASE + '/references/import', json={'reference_key': 'hpe-tacl-reference'}).json()
    assert first['id'] != second['id']
    assert first['owner_id'] == 'alice' and second['owner_id'] == 'bob'
