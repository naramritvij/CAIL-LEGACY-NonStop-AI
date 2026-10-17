"""Read-only Legacy Tree API tests with isolated SQLite, no HPE or Ollama access."""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.storage import connect


API = "/api/v1"
EXPERT_KEY = "tree-test-expert-key-long-12345"
REVIEWER_KEY = "tree-test-reviewer-key-long-67890"
E = {"X-Legacy-Expert-Key": EXPERT_KEY}
R = {"X-Legacy-Reviewer-Key": REVIEWER_KEY}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGACY_DATABASE_PATH", str(tmp_path / "tree.sqlite3"))
    monkeypatch.setenv("LEGACY_EXPERT_KEY", EXPERT_KEY)
    monkeypatch.setenv("LEGACY_REVIEWER_KEY", REVIEWER_KEY)
    return TestClient(app)


def make_lesson(client, incident_id="INC-DISK-001", revision_of=None):
    disk = incident_id == "INC-DISK-001"
    payload = {
        "incident_id": incident_id,
        "author_alias": "Synthetic Mentor (Unverified)",
        "symptoms": (
            "A simulated disk volume is increasing in utilization."
            if disk else
            "Simulated Pathway service performance is degraded."
        ),
        "reasoning": (
            "Review available synthetic event evidence, then inspect "
            "ownership, dependencies and policy before state changes."
        ),
        "rejected_action": "purge_files" if disk else "restart_service",
        "prerequisites": ["Verify ownership", "Check retention rules"]
        if disk else ["Verify process state", "Inspect dependencies"],
        "evidence_ids": ["SIM-EVT-101", "SIM-EVT-103"]
        if disk else ["SIM-EVT-201", "SIM-EVT-202"],
        "previous_lesson_id": revision_of,
    }
    response = client.post(f"{API}/knowledge/lessons", json=payload, headers=E)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def review(client, lesson_id, decision="approved"):
    submitted = client.post(f"{API}/knowledge/lessons/{lesson_id}/submit", headers=E)
    assert submitted.status_code == 200, submitted.text
    approved = client.post(f"{API}/knowledge/lessons/{lesson_id}/review",
                           headers=R, json={
        "decision": decision,
        "notes": "Synthetic demo review, not authenticating a real HPE operator.",
    })
    assert approved.status_code == 200, approved.text


def test_tree_empty_is_honest_and_readable_without_secrets(client):
    response = client.get(f"{API}/knowledge/legacy-tree")
    assert response.status_code == 200
    tree = response.json()
    assert tree["nodes"] == [] and tree["edges"] == []
    assert tree["returned_node_count"] == 0
    assert tree["review_scope"] == "approved_only"
    assert tree["reuse_metrics_available"] is False
    assert tree["identity_or_source_authenticity_verified"] is False


def test_draft_submitted_rejected_never_public_in_tree(client):
    approved = make_lesson(client)
    review(client, approved)
    draft = make_lesson(client)
    submitted = make_lesson(client)
    rejection = make_lesson(client)
    assert client.post(f"{API}/knowledge/lessons/{submitted}/submit", headers=E).status_code == 200
    review(client, rejection, decision="rejected")

    result = client.get(f"{API}/knowledge/legacy-tree").json()
    ids = [n["id"] for n in result["nodes"]]
    assert ids == [approved]
    assert draft not in ids and submitted not in ids and rejection not in ids
    assert result["returned_node_count"] == 1
    assert result["returned_edge_count"] == 0
    assert "reviewer_notes" not in result["nodes"][0]
    assert "expert-key" not in json.dumps(result)


def test_approved_revision_becomes_edge_but_not_fake_reuse(client):
    original = make_lesson(client)
    review(client, original)
    revision = make_lesson(client, revision_of=original)
    review(client, revision)
    other = make_lesson(client, incident_id="INC-PATH-002")
    review(client, other)

    tree = client.get(f"{API}/knowledge/legacy-tree",
                      params={"incident_id": "INC-DISK-001"}).json()
    assert tree["incident_id"] == "INC-DISK-001"
    assert tree["returned_node_count"] == 2
    assert tree["returned_edge_count"] == 1
    assert tree["edges"] == [{
        "from": original, "to": revision, "kind": "approved_revision_of"
    }]
    assert set(x["id"] for x in tree["nodes"]) == {original, revision}
    assert all(n["author_identity_verified"] is False for n in tree["nodes"])
    assert all(n["synthetic_training_context"] for n in tree["nodes"])
    assert all(n["evidence_validation"] ==
               "registered_synthetic_event_ids_only" for n in tree["nodes"])
    assert tree["reuse_metrics_available"] is False
    assert "reuse" in tree["lineage_semantics"]


def test_tree_filters_by_incident_and_rejects_unsupported_incident(client):
    disk = make_lesson(client)
    review(client, disk)
    pathway = make_lesson(client, incident_id="INC-PATH-002")
    review(client, pathway)

    tree = client.get(f"{API}/knowledge/legacy-tree",
                      params={"incident_id": "INC-PATH-002"}).json()
    assert [n["id"] for n in tree["nodes"]] == [pathway]
    assert client.get(f"{API}/knowledge/legacy-tree",
                      params={"incident_id": "not-a-real-incident"}).status_code == 404


def test_unregistered_evidence_is_excluded_even_if_database_was_modified(client):
    item = make_lesson(client)
    review(client, item)
    with connect() as db:
        db.execute("UPDATE lessons SET evidence_ids=? WHERE id=?",
                   (json.dumps(["SIM-EVT-999"]), item))
    result = client.get(f"{API}/knowledge/legacy-tree").json()
    assert result["nodes"] == []
    assert result["returned_node_count"] == 0


def test_tree_does_not_expose_approval_for_missing_previous_revision(client):
    parent = make_lesson(client)
    review(client, parent)
    child = make_lesson(client, revision_of=parent)
    # An unreleased child cannot appear as a revision edge.
    result = client.get(f"{API}/knowledge/legacy-tree").json()
    assert result["returned_node_count"] == 1
    assert result["edges"] == []
    assert all(n["id"] != child for n in result["nodes"])
