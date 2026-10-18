"""Operator source/safety and transcript workflow regressions (no Ollama or HPE)."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.scenarios import get_incident
from app.grounded_investigation import _source_registry

API = "/api/v1"
E = {"X-Legacy-Expert-Key": "operator-test-expert-1234"}
R = {"X-Legacy-Reviewer-Key": "operator-test-reviewer-5678"}

@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("LEGACY_DATABASE_PATH", str(tmp_path / "transcripts.sqlite3"))
    monkeypatch.setenv("LEGACY_EXPERT_KEY", E["X-Legacy-Expert-Key"])
    monkeypatch.setenv("LEGACY_REVIEWER_KEY", R["X-Legacy-Reviewer-Key"])
    return TestClient(app)

def test_indicator_colors_explicit_and_no_live_connection(client):
    r = client.get(API + "/operations/overview")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tools_connected"] is False
    assert body["polling_live_tools"] is False
    items = {x["incident_id"]: x for x in body["statuses"]}
    assert items["INC-DISK-001"]["color"] == "yellow"
    assert items["INC-PATH-002"]["color"] == "red"
    assert items[None]["color"] == "green"
    assert items[None]["source_mode"] == "synthetic_explicit_baseline"

def test_registered_sources_never_invent_scf_status(client):
    r = client.get(API + "/operations/tools")
    assert r.status_code == 200
    assert all(not t["connected"] for t in r.json()["tools"])
    scf = client.get(API + "/operations/incidents/INC-DISK-001/sources/scf").json()
    assert scf["health_signal"] == "unknown"
    assert scf["evidence"] == []
    assert scf["real_system_status_verified"] is False
    ems = client.get(API + "/operations/incidents/INC-DISK-001/sources/ems").json()
    assert ems["evidence"][0]["id"] == "SIM-EVT-101"
    assert ems["evidence"][0]["original_fixture_source"] == "disk-monitor"
    assert ems["evidence"][0]["official_hpe_message_number"] is None
    assert client.get(API + "/operations/incidents/INC-DISK-001/sources/bad").status_code == 404

def test_command_id_allowlist_and_no_execution(client):
    cat = client.get(API + "/operations/incidents/INC-DISK-001/commands").json()
    assert len(cat["commands"]) == 6\n    assert len(cat["documented_commands"]) == 1\n    assert cat["documented_commands"][0]["command"] == "STATUS DISK $DATA03"\n    assert cat["documented_commands"][0]["execution_allowed"] is False\n    assert cat["documented_commands"][0]["references"]
    assert all(not cmd["execution_allowed"] for cmd in cat["commands"])
    for cmd in ["check_health", "show_alerts", "open_asap", "open_ems", "open_scf",
                "show_scf_reference", "restart_service; DROP"]:
        result = client.post(API + "/operations/commands/preview",
                             json={"incident_id": "INC-DISK-001", "command_id": cmd})
        assert result.status_code == 200, result.text
        assert result.json()["execution_allowed"] is False
        assert result.json()["state_change_executed"] is False
    bad = client.post(API + "/operations/commands/preview",
                      json={"incident_id": "INC-DISK-001", "command_id": "restart_service; DROP"})
    assert bad.json()["status"] == "blocked_unknown_command"
    assert client.post(API + "/operations/commands/preview",
                       json={"incident_id": "NOT-FOUND", "command_id": "check_health"}).status_code == 404


def test_real_runtime_probe_separates_local_observations_from_hpe(client, monkeypatch):
    from app import runtime_health

    class FakeResponse:
        status = 200
        headers = {"Content-Type": "application/json"}
        def __enter__(self):
            return self
        def __exit__(self, *_):
            return False
        def read(self, size):
            return b'{"models":[{"name":"qwen3:4b-instruct"}]}'

    monkeypatch.setenv("OLLAMA_MODEL", "qwen3:4b-instruct")
    monkeypatch.setenv("OLLAMA_URL", "http://host.docker.internal:11434")
    monkeypatch.setattr(runtime_health, "urlopen", lambda req, timeout: FakeResponse())
    response = client.get(API + "/operations/runtime-health")
    assert response.status_code == 200
    health = response.json()
    assert health["overall_status"] == "available"
    assert health["backend"]["status"] == "responding"
    assert health["ollama"]["model_installed"] is True
    assert health["hpe_nonstop_health"] == "unknown"
    assert health["live_hpe_queried"] is False
    assert health["execution_allowed"] is False

    cmd = client.post(API + "/operations/commands/preview",
                      json={"incident_id": "INC-DISK-001", "command_id": "check_health"}).json()
    assert cmd["result"]["runtime_health"]["ollama"]["status"] == "reachable"
    assert cmd["result"]["selected_synthetic_incident"]["color"] == "yellow"
    assert cmd["result"]["hpe_nonstop_health"] == "unknown"


def test_runtime_probe_handles_unreachable_ollama_without_pretending_green(client, monkeypatch):
    from app import runtime_health
    from urllib.error import URLError

    def unreachable(*_args, **_kwargs):
        raise URLError("unreachable")

    monkeypatch.setattr(runtime_health, "urlopen", unreachable)
    response = client.get(API + "/operations/runtime-health")
    assert response.status_code == 200
    health = response.json()
    assert health["overall_status"] == "degraded"
    assert health["ollama"]["status"] == "unavailable"
    assert health["ollama"]["model_installed"] is None
    assert health["hpe_nonstop_health"] == "unknown"


def test_native_hpe_references_are_read_only_and_incident_specific(client):
    disk = client.get(API + "/operations/incidents/INC-DISK-001/commands").json()
    disk_ref = disk["documented_commands"][0]
    assert disk_ref["command"] == "STATUS DISK $DATA03"
    assert disk_ref["references"][0]["url"].startswith("https://support.hpe.com/")
    r = client.post(API + "/operations/commands/preview",
                    json={"incident_id": "INC-DISK-001", "command_id": disk_ref["id"]}).json()
    assert r["status"] == "hpe_reference_only_unknown_status"
    assert r["result"]["command"] == "STATUS DISK $DATA03"
    assert r["execution_allowed"] is False
    assert r["state_change_executed"] is False
    assert r["hpe_nonstop_health"] == "unknown"
    path = client.get(API + "/operations/incidents/INC-PATH-002/commands").json()
    assert "show_scf_reference" not in {x["id"] for x in path["commands"]}
    commands = {c["command"] for c in path["documented_commands"]}
    assert commands == {"STATUS PATHWAY", "STATUS SERVER <serverclass>, DETAIL"}
    forged = client.post(API + "/operations/commands/preview",
                        json={"incident_id": "INC-PATH-002", "command_id": disk_ref["id"]}).json()
    assert forged["status"] == "blocked_unknown_command"
    assert client.post(API + "/operations/commands/preview",
                       json={"incident_id": "INC-PATH-002",
                             "command_id": "show_scf_reference"}).json()["status"] == "context_mismatch"

def test_grounded_source_ids_match_operator_asap_drilldown(client):
    incident = get_incident("INC-DISK-001")
    source = client.get(API + "/operations/incidents/INC-DISK-001/sources/asap").json()
    registry = _source_registry(incident, [])
    ids = {item["id"] for item in registry}
    assert all(m["id"] in ids for m in source["evidence"])
    assert all(item.get("official_hpe_message") is False
               for item in registry if item["id"].startswith("SIM-ASAP"))

def test_canonical_knowledge_tree_and_backwards_compatibility(client):
    legacy = client.get(API + "/knowledge/legacy-tree")
    canonical = client.get(API + "/knowledge/knowledge-tree")
    assert legacy.status_code == canonical.status_code == 200
    assert legacy.json() == canonical.json()
    view = client.get(API + "/incidents/INC-DISK-001/workspace").json()
    assert view["knowledge_tree"] == view["legacy_tree"]

def test_transcript_cannot_bypass_authorization_or_review(client):
    payload = {
        "title": "Synthetic operator debrief about disk alerts",
        "recording_reference": "SHIFT-DEMO-024",
        "release": "L23.08", "section": "Shift transfer",
        "content": ("Synthetic disk capacity debrief: inspect the event sequence, "
                    "confirm retention and verify file ownership before deciding. ") * 3,
        "acknowledged_authorization": True, "redaction_confirmed": True,
    }
    url = API + "/knowledge/transcripts"
    assert client.post(url, json=payload).status_code in (403, 503)
    assert client.post(url, headers=E, json={**payload, "redaction_confirmed": False}).status_code == 422
    r = client.post(url, headers=E, json=payload)
    assert r.status_code == 201, r.text
    ident = r.json()["document_id"]
    search = API + "/knowledge/corpus/search"
    q = {"query": "disk capacity", "release": "L23.08"}
    assert client.post(search, json=q).json()["matches"] == []
    assert client.post(API + f"/knowledge/corpus/documents/{ident}/submit", headers=E).status_code == 200
    assert client.post(search, json=q).json()["matches"] == []
    assert client.post(API + f"/knowledge/corpus/documents/{ident}/review",
                       headers=E, json={"decision": "approved",
                                        "notes": "Wrong role may not approve."}).status_code == 403
    assert client.post(API + f"/knowledge/corpus/documents/{ident}/review",
                       headers=R, json={"decision": "approved",
                                        "notes": "Permission and redaction checked by local reviewer."}).status_code == 200
    hit = client.post(search, json=q).json()["matches"][0]
    assert hit["source_kind"] == "locally_supplied_operator_transcript_not_authenticated"
    assert hit["source_url"].startswith("urn:cail:transcript:")
    assert client.post(search, json={**q, "release": "L24.01"}).json()["matches"] == []
