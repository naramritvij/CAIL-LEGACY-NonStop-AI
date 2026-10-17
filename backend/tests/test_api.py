from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_is_explicitly_simulated():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["mode"] == "synthetic_read_only"

def test_incident_has_provenance():
    data = client.get("/api/v1/incidents/INC-DISK-001").json()
    assert data["synthetic"] is True
    assert all(e["id"].startswith("SIM-EVT-") for e in data["events"])

def test_read_only_preview_has_no_production_execution():
    response = client.post("/api/v1/diagnostics/preview",
        json={"incident_id": "INC-DISK-001", "action_id": "inspect_disk_growth"})
    data = response.json()
    assert data["allowed"] is True
    assert data["simulation_only"] is True

def test_destructive_action_is_blocked():
    data = client.post("/api/v1/diagnostics/preview",
        json={"incident_id": "INC-DISK-001", "action_id": "purge_files"}).json()
    assert data["allowed"] is False
    assert data["output"] is None

def test_unknown_actions_are_default_denied():
    data = client.post("/api/v1/diagnostics/preview",
        json={"incident_id": "INC-DISK-001", "action_id": "execute_arbitrary_shell"}).json()
    assert data["allowed"] is False

def test_bad_incident_returns_404():
    result = client.get("/api/v1/incidents/NOT-FOUND")
    assert result.status_code == 404

def test_investigation_validation():
    result = client.post("/api/v1/investigate",
        json={"incident_id": "INC-DISK-001", "question": "x"})
    assert result.status_code == 422

def test_unverified_knowledge_must_be_labeled():
    record = client.get("/api/v1/knowledge/example").json()
    assert record["review_status"] == "unverified_synthetic_example"
