"""Backend source provenance, safe reference templates and evidence joins."""
from fastapi.testclient import TestClient
from app.main import app
from app.references import source_list, search_sources

client = TestClient(app)


def test_registry_contains_official_source_metadata():
    sources = client.get('/api/v1/knowledge/sources').json()
    assert len(sources['sources']) >= 4
    assert all(s['url'].startswith('https://support.hpe.com/hpesc/public/docDisplay?') for s in sources['sources'])
    assert all(s['validated_for_live_system'] is False for s in sources['sources'])


def test_disk_search_returns_disk_source_with_provenance():
    r = client.post('/api/v1/knowledge/search', json={'query': 'disk capacity utilization'})
    assert r.status_code == 200
    hits = r.json()['hits']
    assert any(h['id'] == 'HPE-DISK-CHAPTER' for h in hits)
    assert all(h['ranking_method'] == 'lexical_overlap_not_confidence' for h in hits)


def test_unmatched_query_returns_no_hallucinated_results():
    r = client.post('/api/v1/knowledge/search', json={'query': 'quasar quasarbaz plutoid'})
    assert r.json()['status'] == 'no_source_match'
    assert r.json()['hits'] == []


def test_search_length_is_restricted():
    r = client.post('/api/v1/knowledge/search', json={'query': 'x' * 700})
    assert r.status_code == 422


def test_no_real_message_lookups_from_simulated_ids():
    r = client.get('/api/v1/incidents/INC-DISK-001/evidence-pack')
    assert r.status_code == 200
    body = r.json()
    assert body['root_cause_status'] == 'not_established'
    assert body['official_message_match'] is None
    assert body['official_message_match_status'] == 'not_possible_with_synthetic_event_ids'
    assert body['release_verified'] is False
    assert set(body['verified_synthetic_observations'][0]['evidence_ids']) <= {'SIM-EVT-101','SIM-EVT-103'}


def test_pathway_pack_not_automatically_assigned_specific_event():
    body = client.get('/api/v1/incidents/INC-PATH-002/evidence-pack').json()
    assert body['official_message_match'] is None
    assert any(h['id'] == 'HPE-PATHWAY-CHAPTER' for h in body['sources'])


def test_unknown_incident_is_404_for_evidence():
    assert client.get('/api/v1/incidents/INC-FAKE/evidence-pack').status_code == 404


def test_template_is_display_only_and_release_unverified():
    r = client.get('/api/v1/diagnostics/templates')
    assert r.status_code == 200
    assert all(t['reference_url'].startswith('https://support.hpe.com') for t in r.json()['templates'])
    preview = client.post('/api/v1/diagnostics/templates/preview',json={'incident_id':'INC-DISK-001','template_id':'scf_kernel_status_lseries'}).json()
    assert preview['status'] == 'reference_only'
    assert preview['execution_allowed'] is False
    assert preview['state_change_executed'] is False
    assert preview['template']['release_scope'] == 'L-Series_kernel_only'


def test_unknown_command_id_default_denies():
    response = client.post('/api/v1/diagnostics/templates/preview', json={'incident_id':'INC-DISK-001','template_id':'rm -rf /'})
    assert response.status_code == 200
    assert response.json()['status'] == 'blocked'
    assert response.json()['execution_allowed'] is False


def test_unavailable_template_never_executes_even_with_dangerous_string():
    attack = 'STATUS SUBSYS $ZZKRN; DELETE EVERYTHING'
    r = client.post('/api/v1/diagnostics/templates/preview', json={'incident_id': 'INC-PATH-002','template_id':attack})
    assert r.json()['template'] is None
    assert r.json()['state_change_executed'] is False


def test_evidence_pack_includes_reference_provenance():
    pack = client.get('/api/v1/incidents/INC-PATH-002/evidence-pack').json()
    assert pack['sources']
    assert all('reference' not in h or isinstance(h.get('reference'), str) for h in pack['sources'])
    assert pack['operator_checks']['execution_allowed'] is False
