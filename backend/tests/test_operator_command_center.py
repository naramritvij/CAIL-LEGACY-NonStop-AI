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
    assert len(cat["commands"]) == 6
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
