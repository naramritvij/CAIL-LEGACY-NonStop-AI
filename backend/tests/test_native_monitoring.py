"""Controlled native monitoring fixtures, never customer access or app seed data."""
import base64
from datetime import datetime, timedelta, timezone
import json
import os
import ssl

import pytest
from app import live_sources, vendor_datasets as vendor
from test_agent_workspace import clients, approve

BASE = '/api/v1/workspace'


def configure(monkeypatch):
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'true')
    monkeypatch.setenv('CAIL_LIVE_ALLOWED_HOSTS', 'source.example.internal')
    monkeypatch.setenv('CAIL_PROGNOSIS_DATASET_URL', 'https://source.example.internal/Prognosis/Rest/v1/data/ApprovedProblems')
    monkeypatch.setenv('CAIL_PROGNOSIS_USER', 'test-reader')
    monkeypatch.setenv('CAIL_PROGNOSIS_PASSWORD', 'test-only-password-not-real')
    monkeypatch.setenv('CAIL_PROGNOSIS_SYSTEM_ID', 'SITE7')
    monkeypatch.delenv('CAIL_PROGNOSIS_FIELDS', raising=False)
    monkeypatch.delenv('CAIL_PROGNOSIS_ROWS_KEY', raising=False)


def rows(count=2):
    return [{'ProblemId': f'test-{index}', 'NodeName': '\\SITE7', 'Description': f'Test source alarm {index}',
             'Category': 'Test category', 'Severity': 'Source severity', 'TimeRaised': '2026-01-01 13:22:00', 'secret': 'must-not-be-forwarded'} for index in range(count)]


def gateway(monkeypatch, raw, calls):
    class Response:
        status = 200
        headers = {'Content-Type': 'application/json'}
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self, maximum): return json.dumps(raw).encode()
    class Opener:
        def open(self, request, timeout):
            assert request.get_method() == 'GET' and timeout == 15
            expected = 'Basic ' + base64.b64encode(b'test-reader:test-only-password-not-real').decode()
            assert request.get_header('Authorization') == expected
            calls.append(request.full_url)
            return Response()
    def build(*handlers):
        assert handlers[0].__class__ == live_sources._NoRedirect
        assert handlers[1]._context.verify_mode == ssl.CERT_REQUIRED
        return Opener()
    monkeypatch.setattr(vendor, 'build_opener', build)


def test_direct_prognosis_get_populates_graph_and_assistant_observations(clients, monkeypatch):
    configure(monkeypatch)
    calls = []
    gateway(monkeypatch, {'data': rows()}, calls)
    alice, _, reviewer = clients
    assert alice.post(BASE + '/graph/sync').status_code == 403 and not calls
    assert reviewer.post(BASE + '/graph/sync').json()['sources'][0]['status'] == 'connected'
    graph = reviewer.get(BASE + '/graph').json()
    assert any(node.get('entity_type') == 'reported_alarm' for node in graph['nodes'])
    assert any(edge['label'] == 'reported on' for edge in graph['edges'])
    assert any(edge['kind'] == 'provenance' and edge['source'] == 'source:prognosis' for edge in graph['edges'])
    assert not any(edge['label'] == 'depends on' for edge in graph['edges'])
    observed = reviewer.post(BASE + '/connections/prognosis/check').json()
    assert observed['mode'] == 'prognosis_rest_dataset' and observed['health_signal'] == 'unknown'
    assert observed['evidence'][0]['event_timestamp_raw'] == '2026-01-01 13:22:00'
    serialized = json.dumps([graph, observed, reviewer.get(BASE + '/connections').json()])
    for private in ('test-only-password-not-real', 'source.example.internal', 'must-not-be-forwarded'):
        assert private not in serialized
    assert len(calls) == 2


@pytest.mark.parametrize('bad', ['http', 'host', 'wrong_system', 'bad_rows'])
def test_native_failures_never_connect_to_demo_or_guess_a_system(clients, monkeypatch, bad):
    configure(monkeypatch)
    data = rows()
    if bad == 'http': monkeypatch.setenv('CAIL_PROGNOSIS_DATASET_URL', 'http://source.example.internal/data')
    if bad == 'host': monkeypatch.setenv('CAIL_LIVE_ALLOWED_HOSTS', 'a-different-host.example')
    if bad == 'wrong_system': data[0]['NodeName'] = 'SITE8'
    if bad == 'bad_rows': del data[0]['Description']
    calls = []
    gateway(monkeypatch, data, calls)
    result = clients[2].post(BASE + '/graph/sync').json()
    assert not result['sources'] or result['sources'][0]['status'] == 'unavailable'
    assert clients[2].get(BASE + '/graph').json()['datasets'] == []
    if bad in ('http', 'host'): assert not calls


def test_dataset_column_and_rows_mappings_are_configurable(monkeypatch):
    configure(monkeypatch)
    monkeypatch.setenv('CAIL_PROGNOSIS_FIELDS', json.dumps({'id': 'uid', 'node': 'system', 'message': 'alarm'}))
    monkeypatch.setenv('CAIL_PROGNOSIS_ROWS_KEY', 'result.items')
    records = vendor.prognosis_records({'result': {'items': [{'uid': 'one', 'system': 'ANY-REAL-NAME', 'alarm': 'Literal alarm'}]}})
    network = vendor.observation_network(records, 'prognosis')
    assert any(node['label'] == 'ANY-REAL-NAME' for node in network['nodes'])
    assert not any(node['label'] == 'PROD' for node in network['nodes'])


def test_raw_monitoring_export_is_private_review_gated_and_not_live(clients):
    alice, bob, reviewer = clients
    response = alice.post(BASE + '/graph/monitoring-import', files={'file': ('prognosis.json', json.dumps(rows()).encode(), 'application/json')},
                          data={'source_id': 'prognosis', 'title': 'Source-provided test export'})
    assert response.status_code == 201, response.text
    imported = response.json()
    assert imported['source_kind'] == 'monitoring_export' and imported['live'] is False
    assert bob.get(BASE + '/graph').json()['datasets'] == []
    approve(alice, reviewer, imported['document_id'])
    graph = bob.get(BASE + '/graph').json()
    assert graph['datasets'][0]['source_kind'] == 'monitoring_export'
    assert any(node.get('entity_type') == 'reported_alarm' for node in graph['nodes'])


@pytest.mark.parametrize('text', [
    'tool=momi\nnode=SITE7\nstate=SET\ndate=2026-01-01\ntime=13:22:00\nalarm=Test alarm\ntext=Literal exported alarm',
    'Date\tTime\tNode\tText\n2026-01-01\t13:22:00\tSITE7\tLiteral exported alarm',
    '2026-01-01\t13:22:00\tSITE7\tLiteral exported alarm',
])
def test_momi_template_and_tab_exports_preserve_systems_and_naive_times(text):
    records = vendor.momi_records(text)
    assert records[0]['node'] == 'SITE7' and records[0]['timestamp'] == '2026-01-01 13:22:00'
    network = vendor.observation_network(records, 'momi')
    alarm = next(node for node in network['nodes'] if node['entity_type'] == 'reported_alarm')
    assert alarm['properties']['timestamp_timezone'] == 'as_exported_not_assumed_UTC'


def test_momi_directory_read_never_moves_files_and_marks_stale_exports(clients, monkeypatch, tmp_path):
    monkeypatch.setenv('CAIL_LIVE_ENABLED', 'true')
    monkeypatch.setenv('CAIL_MOMI_EXPORT_DIR', str(tmp_path))
    monkeypatch.setenv('CAIL_MOMI_SYSTEM_ID', 'SITE7')
    path = tmp_path / 'alarms.txt'
    body = 'node=SITE7\ntext=Source provided test alarm\nstate=SET\ndate=2026-01-01\ntime=13:22:00'
    path.write_text(body)
    reviewer = clients[2]
    first = reviewer.post(BASE + '/graph/sync').json()
    assert next(source for source in first['sources'] if source['id'] == 'momi')['status'] == 'connected'
    graph = reviewer.get(BASE + '/graph').json()
    assert graph['datasets'][0]['system_id'] == 'SITE7' and not graph['datasets'][0]['stale']
    assert path.read_text() == body and [file.name for file in tmp_path.iterdir() if file.name.startswith('alarms') or file.name == 'done'] == ['alarms.txt']
    stale = (datetime.now(timezone.utc) - timedelta(minutes=30)).timestamp()
    os.utime(path, (stale, stale))
    failed = reviewer.post(BASE + '/graph/sync').json()
    assert next(source for source in failed['sources'] if source['id'] == 'momi')['status'] == 'unavailable'
    assert reviewer.get(BASE + '/graph').json()['datasets'][0]['stale']


def test_native_evidence_discloses_bounded_rows_and_never_infers_green(monkeypatch):
    configure(monkeypatch)
    gateway(monkeypatch, rows(live_sources.MAX_RECORDS + 2), [])
    snapshot = live_sources.read_source('prognosis')
    assert len(snapshot['evidence']) == live_sources.MAX_RECORDS
    assert snapshot['evidence_truncated'] and snapshot['total_record_count'] == live_sources.MAX_RECORDS + 2
    assert snapshot['health_signal'] == 'unknown' and not snapshot['execution_allowed']


def test_changing_native_system_scope_hides_old_data_before_another_read(clients, monkeypatch):
    configure(monkeypatch)
    gateway(monkeypatch, rows(), [])
    reviewer = clients[2]
    reviewer.post(BASE + '/graph/sync')
    reviewer.post(BASE + '/connections/prognosis/check')
    before = reviewer.get(BASE + '/graph').json()
    node = next(item for item in before['nodes'] if item.get('entity_type') == 'reported_alarm')
    monkeypatch.setenv('CAIL_PROGNOSIS_SYSTEM_ID', 'SITE8')
    after = reviewer.get(BASE + '/graph', params={'cursor': before['cursor']}).json()
    assert not after.get('not_modified') and after['datasets'] == []
    assert reviewer.get(BASE + '/graph/node', params={'node_id': node['id']}).status_code == 404
    source = next(item for item in reviewer.get(BASE + '/connections').json()['sources'] if item['id'] == 'prognosis')
    assert source['history'] == [] and source['snapshot'] is None and not source['connected']
