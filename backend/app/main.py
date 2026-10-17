"""LEGACY synthetic read-only training API."""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from .scenarios import list_incidents, get_incident
from .policy import ACTIONS, evaluate
from .ai import explain

app = FastAPI(title="LEGACY NonStop Simulation API", version="0.1.0",
              description="Synthetic training data only; no live host connections.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False, allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

class DiagnosticRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    action_id: str = Field(min_length=1, max_length=64)

class InvestigationRequest(BaseModel):
    incident_id: str = Field(min_length=1, max_length=64)
    question: str = Field(min_length=3, max_length=500)

def incident_or_404(incident_id: str):
    incident = get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    return incident

@app.get("/api/v1/health")
def health():
    return {"status": "ok", "mode": "synthetic_read_only"}

@app.get("/api/v1/incidents")
def incidents():
    return list_incidents()

@app.get("/api/v1/incidents/{incident_id}")
def incident_detail(incident_id: str):
    return incident_or_404(incident_id)

@app.get("/api/v1/actions")
def actions():
    return [{"id": key, **value} for key, value in ACTIONS.items()]

@app.post("/api/v1/diagnostics/preview")
def diagnostic_preview(body: DiagnosticRequest):
    incident = incident_or_404(body.incident_id)
    return evaluate(body.action_id, incident)

@app.post("/api/v1/investigate")
def investigate(body: InvestigationRequest):
    incident = incident_or_404(body.incident_id)
    return explain(body.question, incident)

@app.get("/api/v1/knowledge/example")
def example_knowledge():
    return {
        "id": "DEMO-LESSON-001", "type": "decision_dna_draft",
        "review_status": "unverified_synthetic_example",
        "incident_id": "INC-DISK-001",
        "lesson": "Inspect file ownership, dependency and retention rules before proposing deletion.",
        "rejected_action": "purge_files",
        "reason": "Destructive action with missing prerequisites.",
        "source": "Invented educational scenario, not a real senior engineer or HPE runbook.",
    }

@app.get("/api/v1/shift-briefing")
def shift_briefing():
    events = [event for case in list_incidents() for event in case["events"]]
    return {"synthetic": True, "open_incidents": len(list_incidents()),
            "event_count": len(events),
            "handover": "Both demo incidents remain under investigation; root causes have not been confirmed.",
            "next_step": "Check recent events, subsystem state and applicable approved procedures."}
