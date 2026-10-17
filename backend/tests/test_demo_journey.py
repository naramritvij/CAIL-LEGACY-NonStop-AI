"""Full synthetic LEGACY journeys through real FastAPI routes, without network or live HPE.

The LLM is stubbed, persistence is isolated in pytest temp directories, and
expert/reviewer demo credentials are never reused from the developer's machine.
These are integration CONTRACT tests, not a real-operator or real-model evaluation.
"""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app import grounded_investigation as gi


API = "/api/v1"
EXPERT = "contract-test-expert-key-12345678"
REVIEWER = "contract-test-reviewer-key-87654321"
E = {"X-Legacy-Expert-Key": EXPERT}
R = {"X-Legacy-Reviewer-Key": REVIEWER}


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LEGACY_DATABASE_PATH", str(tmp_path / "journey.sqlite3"))
    monkeypatch.setenv("LEGACY_EXPERT_KEY", EXPERT)
    monkeypatch.setenv("LEGACY_REVIEWER_KEY", REVIEWER)

    def model(payload):
        source = json.loads(payload["prompt"].split("UNTRUSTED SOURCE JSON:\n", 1)[1])
        event = next(s for s in source["sources"] if s["id"].startswith("SIM-EVT-"))
        return json.dumps({"claims": [{
            "text": "The synthetic monitor reports a recorded event for review.",
            "citations": [event["id"]],
        }]})

    monkeypatch.setattr(gi, "_call_local_model", model)
    return TestClient(app)


CASES = [
    {
        "incident": "INC-DISK-001",
        "question": "What does the disk evidence show?",
        "query": "disk ownership retention",
        "evidence": ["SIM-EVT-101", "SIM-EVT-103"],
        "safe": "inspect_disk_growth",
        "unsafe": "purge_files",
        "training": ["TRAIN-EVT-301", "TRAIN-EVT-302"],
        "prerequisites": ["Verify file ownership", "Check retention policy"],
    },
    {
        "incident": "INC-PATH-002",
        "question": "What do the Pathway events show?",
        "query": "pathway process dependency",
        "evidence": ["SIM-EVT-201", "SIM-EVT-202"],
        "safe": "inspect_events",
        "unsafe": "restart_service",
        "training": ["TRAIN-EVT-401", "TRAIN-EVT-402"],
        "prerequisites": ["Verify process state", "Check dependency health"],
    },
]


@pytest.mark.parametrize("case", CASES, ids=["disk", "pathway"])
def test_complete_investigation_to_knowledge_transfer(env, case):
    """Exercise each stage through the same HTTP contracts Maggie will consume."""
    client = env
    incident_id = case["incident"]
    incident = client.get(f"{API}/incidents/{incident_id}")
    assert incident.status_code == 200
    detail = incident.json()
    assert detail["synthetic"] is True
    event_ids = {event["id"] for event in detail["events"]}

    # Deterministic evidence is distinct from model-generated statements.
    brief = client.get(f"{API}/incidents/{incident_id}/grounded-brief").json()
    assert brief["root_cause_status"] == "not_established"
    assert brief["missing_evidence"]
    assert all(not claim["proves_root_cause"] for claim in brief["claims"])

    llm = client.post(f"{API}/investigate/grounded", json={
        "incident_id": incident_id, "question": case["question"],
        "release": "L23.08", "max_chunks": 3,
    })
    assert llm.status_code == 200
    generated = llm.json()
    assert generated["status"] == "generated_unverified_citation_ids_checked"
    assert generated["root_cause_status"] == "not_established"
    assert generated["missing_evidence"] == detail["unknowns"]
    assert generated["state_change_executed"] is False
    assert generated["operational_action_authorized"] is False
    assert set(generated["claims"][0]["citations"]).issubset(event_ids)
    assert generated["citations_validation"] == "id_presence_only_not_claim_entailment"

    # Sentinel authorization is independent of generated text.
    permitted = client.post(f"{API}/diagnostics/preview", json={
        "incident_id": incident_id, "action_id": case["safe"]}).json()
    blocked = client.post(f"{API}/diagnostics/preview", json={
        "incident_id": incident_id, "action_id": case["unsafe"]}).json()
    assert permitted["allowed"] is True and permitted["simulation_only"] is True
    assert blocked["allowed"] is False and blocked["simulation_only"] is True
    assert blocked["output"] is None
    what_if = client.post(f"{API}/replay", json={
        "incident_id": incident_id, "action_id": case["unsafe"]}).json()
    assert what_if["deterministic"] is True
    assert what_if["state_change_executed"] is False
    assert what_if["policy"]["allowed"] is False

    # The public listing MUST remain empty until separate reviewer approval.
    assert client.get(f"{API}/knowledge/lessons",
                      params={"incident_id": incident_id}).json() == []
    draft = client.post(f"{API}/knowledge/lessons", headers=E, json={
        "incident_id": incident_id,
        "author_alias": "Synthetic Mentor - Not a Real Operator",
        "symptoms": detail["summary"],
        "reasoning": (
            "Check event sequence and verify all relevant dependencies and "
            "preconditions before any state-changing proposal."
        ),
        "rejected_action": case["unsafe"],
        "prerequisites": case["prerequisites"],
        "evidence_ids": case["evidence"],
    })
    assert draft.status_code == 201, draft.text
    lesson_id = draft.json()["id"]
    assert draft.json()["status"] == "draft"
    assert client.get(f"{API}/knowledge/lessons",
                      params={"incident_id": incident_id}).json() == []
    assert client.get(f"{API}/training/challenges/{lesson_id}").status_code == 404

    # Incorrect reviewer privilege must fail. Submission is a separate step.
    assert client.post(f"{API}/knowledge/lessons/{lesson_id}/review",
                       headers={"X-Legacy-Reviewer-Key": EXPERT},
                       json={"decision": "approved", "notes": "Not authorized for review."}
                       ).status_code == 403
    submit = client.post(f"{API}/knowledge/lessons/{lesson_id}/submit", headers=E)
    assert submit.status_code == 200, submit.text
    assert client.get(f"{API}/knowledge/lessons",
                      params={"incident_id": incident_id}).json() == []
    approval = client.post(f"{API}/knowledge/lessons/{lesson_id}/review",
                           headers=R, json={
        "decision": "approved",
        "notes": "Accepted as synthetic teaching material, not certified HPE expertise.",
    })
    assert approval.status_code == 200, approval.text

    approved = client.get(f"{API}/knowledge/lessons",
                          params={"incident_id": incident_id}).json()
    assert len(approved) == 1
    assert approved[0]["id"] == lesson_id
    assert approved[0]["status"] == "approved"

    retrieved = client.post(f"{API}/knowledge/retrieve", json={
        "incident_id": incident_id, "query": case["query"]}).json()
    assert retrieved["approved_lessons"][0]["id"] == lesson_id
    assert retrieved["verified_for_live_use"] is False

    # The learner sees a changed case with no answer key, then both good and
    # unsafe answers are graded by the deterministic policy, not by the LLM.
    training = client.get(f"{API}/training/challenges/{lesson_id}")
    assert training.status_code == 200
    challenge = training.json()
    assert challenge["synthetic"] is True
    assert "safe_first_action" not in challenge
    assert set(case["training"]) == {event["id"] for event in challenge["events"]}

    answer = {
        "action_id": case["safe"],
        "evidence_ids": case["training"],
        "prerequisites": case["prerequisites"],
        "reasoning": "Before changing anything, verify evidence and relevant prerequisites.",
    }
    graded = client.post(f"{API}/training/challenges/{lesson_id}/assess",
                         json=answer).json()
    assert graded["passed"] is True
    assert graded["score"] == 100
    assert graded["state_change_executed"] is False
    assert graded["attempt_persisted"] is False

    unsafe = client.post(f"{API}/training/challenges/{lesson_id}/assess",
                         json={**answer, "action_id": case["unsafe"]}).json()
    assert unsafe["passed"] is False
    assert unsafe["score"] <= 20
    assert unsafe["state_change_executed"] is False

    briefing = client.get(f"{API}/shift-briefing").json()
    assert briefing["synthetic"] is True
    assert briefing["approved_knowledge_records"] == 1
    assert briefing["approval_state"] == "generated_from_synthetic_records_not_operator_signed"
    audit = client.get(f"{API}/audit/verify", headers=R)
    assert audit.status_code == 200
    assert audit.json()["valid"] is True
    assert audit.json()["entries"] >= 3


def test_unavailable_model_keeps_evidence_safety_and_lessons_separate(env, monkeypatch):
    client = env

    def offline(_payload):
        raise OSError("simulated local Ollama outage")

    monkeypatch.setattr(gi, "_call_local_model", offline)
    reply = client.post(f"{API}/investigate/grounded", json={
        "incident_id": "INC-DISK-001",
        "question": "What does the evidence show?",
        "release": "L23.08",
    })
    assert reply.status_code == 200
    body = reply.json()
    assert body["status"] == "model_unavailable"
    assert body["claims"] == []
    assert body["source_registry"]
    assert body["missing_evidence"]
    assert body["operational_action_authorized"] is False
    assert body["state_change_executed"] is False

    fallback = client.get(f"{API}/incidents/INC-DISK-001/grounded-brief").json()
    assert fallback["claims"]
    assert fallback["root_cause_status"] == "not_established"
    blocked = client.post(f"{API}/diagnostics/preview", json={
        "incident_id": "INC-DISK-001", "action_id": "purge_files"}).json()
    assert blocked["allowed"] is False


def test_rejected_llm_claims_never_unlock_actions_or_training(env, monkeypatch):
    client = env
    attempts = []

    def forged(_payload):
        attempts.append(1)
        return json.dumps({"claims": [{
            "text": "Synthetic source proves everything is resolved.",
            "citations": ["SIM-EVT-999"],
        }]})

    monkeypatch.setattr(gi, "_call_local_model", forged)
    reply = client.post(f"{API}/investigate/grounded", json={
        "incident_id": "INC-PATH-002", "question": "What is wrong?",
        "release": "L23.08",
    })
    assert reply.status_code == 200
    result = reply.json()
    assert len(attempts) == 2
    assert result["status"] == "model_output_rejected"
    assert result["claims"] == []
    assert result["state_change_executed"] is False
    assert client.get(f"{API}/knowledge/lessons").json() == []
    assert client.get(f"{API}/training/challenges/fake").status_code == 404
    assert client.post(f"{API}/diagnostics/preview", json={
        "incident_id": "INC-PATH-002",
        "action_id": "restart_service",
    }).json()["allowed"] is False
