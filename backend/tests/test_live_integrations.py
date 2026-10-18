"""No-network security tests for opt-in live gateways and independent Qwen chat."""
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import live_sources
from app import general_assistant

URL = "/api/v1"
HEADERS = {"X-CAIL-Operator-Key": "read-only-operator-key-1234567890-abcdef"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("CAIL_OPERATOR_READ_KEY", HEADERS["X-CAIL-Operator-Key"])
    monkeypatch.setenv("CAIL_LIVE_ENABLED", "true")
    monkeypatch.setenv("CAIL_LIVE_ALLOWED_HOSTS", "readbridge.example.internal")
    monkeypatch.setenv("CAIL_LIVE_EMS_URL", "https://readbridge.example.internal/v1/ems/snapshot")
    monkeypatch.setenv("CAIL_LIVE_EMS_TOKEN", "separate-gateway-read-token-123456789")
    return TestClient(app)


class FakeResponse:
    status = 200
    headers = {"Content-Type": "application/json"}

    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, *_args):
        return self.body


def good_snapshot(**updates):
    base = {
        "source_id": "ems",
        "system_id": "authorized-test-system",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "health": "critical",
        "records": [{"id": "EMS-123", "timestamp": "2026-10-18T14:00:00Z",
                     "severity": "critical", "message": "Operator event"}],
    }
    base.update(updates)
    return json.dumps(base).encode()


def patch_gateway(monkeypatch, body, requests):
    class FakeOpener:
        def open(self, request, timeout):
            assert request.get_method() == "GET"
            assert request.full_url == "https://readbridge.example.internal/v1/ems/snapshot"
            assert request.get_header("Authorization") == "Bearer separate-gateway-read-token-123456789"
            assert timeout <= 6
            requests.append(request)
            return FakeResponse(body)

    monkeypatch.setattr(live_sources, "build_opener", lambda *a, **k: FakeOpener())


def test_live_gateway_denied_without_independent_operator_auth(client):
    assert client.get(URL + "/integrations/sources/ems").status_code == 403
    assert client.get(URL + "/integrations/sources/ems",
                      headers={"X-CAIL-Operator-Key": "wrong"}).status_code == 403


def test_live_read_only_snapshot_has_real_provenance_not_demo_ids(client, monkeypatch):
    requests = []
    patch_gateway(monkeypatch, good_snapshot(), requests)
    reply = client.get(URL + "/integrations/sources/ems", headers=HEADERS)
    assert reply.status_code == 200, reply.text
    body = reply.json()
    assert body["synthetic"] is False and body["connected"] is True
    assert body["mode"] == "read_only_gateway_snapshot"
    assert body["health_signal"] == "red"
    assert body["evidence"][0]["id"] == "EMS-123"
    assert len(body["snapshot_sha256"]) == 64
    assert body["execution_allowed"] is False
    assert body["state_change_executed"] is False
    assert len(requests) == 1
    assert "separate-gateway-read-token" not in str(body)


@pytest.mark.parametrize("updated", [
    {"source_id": "asap"},
    {"records": []},
    {"observed_at": "2020-01-01T00:00:00Z"},
    {"observed_at": "2026-10-18T00:00:00"},
    {"records": [{"id": "EMS-123", "message": "x" * 1001}]},
])
def test_bad_or_missing_live_evidence_fails_closed(client, monkeypatch, updated):
    patch_gateway(monkeypatch, good_snapshot(**updated), [])
    reply = client.get(URL + "/integrations/sources/ems", headers=HEADERS)
    if updated == {"records": []}:
        assert reply.status_code == 200
        assert reply.json()["health_signal"] == "unknown"
    else:
        assert reply.status_code == 502
        assert "UNKNOWN" in reply.json()["detail"]


def test_disabled_or_untrusted_host_does_not_call_network(client, monkeypatch):
    monkeypatch.setattr(live_sources, "build_opener", lambda *args: (_ for _ in ()).throw(
        AssertionError("Network call must not occur")))
    monkeypatch.setenv("CAIL_LIVE_ALLOWED_HOSTS", "other.example")
    assert client.get(URL + "/integrations/sources/ems", headers=HEADERS).status_code == 503
    monkeypatch.setenv("CAIL_LIVE_ENABLED", "false")
    assert client.get(URL + "/integrations/sources/ems", headers=HEADERS).status_code == 503
    meta = client.get(URL + "/integrations/capabilities").json()
    assert meta["mode"] == "disabled"
    assert "readbridge.example.internal" not in str(meta)
    assert "TOKEN" not in str(meta)


def test_no_arbitrary_sources_or_native_command_arguments(client, monkeypatch):
    assert client.get(URL + "/integrations/sources/restart", headers=HEADERS).status_code == 404
    assert client.post(URL + "/integrations/sources/ems", headers=HEADERS).status_code == 405


def test_general_ai_does_not_receive_incident_records(client, monkeypatch):
    seen = []

    def fake_model(request, timeout):
        payload = json.loads(request.data)
        seen.append(payload)
        assert "INC-DISK" not in json.dumps(payload)
        assert "SIM-EVT" not in json.dumps(payload)
        assert payload["stream"] is False
        return FakeResponse(json.dumps({"response": "Kubernetes schedules containers through a control plane."}).encode())

    monkeypatch.setattr(general_assistant, "urlopen", fake_model)
    response = client.post(URL + "/assistant/ask", json={"question": "What is Kubernetes?"})
    assert response.status_code == 200
    result = response.json()
    assert result["scope"] == "general_knowledge_no_incident_evidence"
    assert result["status"] == "generated_unverified"
    assert result["citations"] == []
    assert result["execution_allowed"] is False
    assert "Kubernetes" in result["answer"]
    assert len(seen) == 1


def test_model_unavailable_is_not_a_fake_answer(client, monkeypatch):
    def failed(*args, **kwargs):
        raise TimeoutError()

    monkeypatch.setattr(general_assistant, "urlopen", failed)
    response = client.post(URL + "/assistant/ask", json={"question": "What is gravity?"})
    assert response.status_code == 200
    assert response.json()["status"] == "model_unavailable"
    assert response.json()["citations"] == []


def test_live_ai_grounded_only_in_registered_gateway_ids(client, monkeypatch):
    from app import live_investigation
    snapshot = {
        "snapshot_sha256": "a" * 64, "observed_at": datetime.now(timezone.utc).isoformat(),
        "health_signal": "yellow",
        "evidence": [{"id": "EMS-123", "severity": "warning",
                      "message": "Read-only registered gateway alert"}],
    }
    monkeypatch.setattr(live_investigation, "read_source", lambda tool: snapshot)
    def model(request, timeout):
        assert "EMS-123" in json.loads(request.data)["prompt"]
        return FakeResponse(json.dumps({"response": json.dumps({"claims": [{
            "text": "The gateway snapshot contains a warning event.",
            "citations": ["EMS-123"],
        }]})}).encode())
    monkeypatch.setattr(live_investigation, "urlopen", model)
    resp = client.post(URL + "/integrations/ask", headers=HEADERS,
                       json={"tool_id": "ems", "question": "What evidence was observed?"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "generated_unverified"
    assert data["claims"][0]["citations"] == ["EMS-123"]
    assert data["execution_allowed"] is False
    assert data["source_snapshot_sha256"] == "a" * 64


def test_live_ai_rejects_hallucinated_citations(client, monkeypatch):
    from app import live_investigation
    snapshot = {
        "snapshot_sha256": "b" * 64, "observed_at": datetime.now(timezone.utc).isoformat(),
        "health_signal": "unknown", "evidence": [{"id": "EMS-123"}],
    }
    monkeypatch.setattr(live_investigation, "read_source", lambda tool: snapshot)
    monkeypatch.setattr(live_investigation, "urlopen",
        lambda request, timeout: FakeResponse(
            json.dumps({"response": json.dumps({"claims": [{
                "text": "Invented evidence proves the root cause.",
                "citations": ["EMS-FORGED"],
            }]})}).encode()))
    result = client.post(URL + "/integrations/ask", headers=HEADERS,
                         json={"tool_id": "ems", "question": "What is the root cause?"})
    assert result.status_code == 200
    assert result.json()["status"] == "model_unavailable_or_rejected"
    assert result.json()["claims"] == []


def test_live_ai_requires_independent_operator_key(client):
    result = client.post(URL + "/integrations/ask",
                         json={"tool_id": "ems", "question": "What happened?"})
    assert result.status_code == 403
