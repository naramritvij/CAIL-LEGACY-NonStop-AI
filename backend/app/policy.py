"""Independent default-deny safety policy; no real commands are run."""
ACTIONS = {
    "inspect_disk_growth": {
        "title": "Inspect disk trends and file metadata",
        "classification": "read_only",
        "explanation": "Collect synthetic capacity and ownership evidence without modifying files.",
    },
    "inspect_events": {
        "title": "Review recent event timeline",
        "classification": "read_only",
        "explanation": "Read the synthetic event timeline without changing system state.",
    },
    "purge_files": {
        "title": "Purge application files",
        "classification": "destructive",
        "explanation": "File ownership, dependencies, and retention rules are unverified.",
    },
    "restart_service": {
        "title": "Restart application service",
        "classification": "state_changing",
        "explanation": "Impact, failover readiness, and authorization are unverified.",
    },
}

def evaluate(action_id: str, incident: dict) -> dict:
    action = ACTIONS.get(action_id)
    if action is None:
        return {
            "action_id": action_id, "allowed": False, "status": "blocked",
            "reason": "Unknown action: default-deny policy.",
            "simulation_only": True, "output": None
        }
    allowed = action["classification"] == "read_only"
    if not allowed:
        reason = action["explanation"] + " No state-changing command is available in this prototype."
    else:
        reason = "Allowed for synthetic read-only preview. No real NonStop command is executed."
    preview = {
        "incident_id": incident["id"],
        "event_ids": [event["id"] for event in incident["events"]],
        "unverified_conditions": incident["unknowns"],
    } if allowed else None
    return {
        "action_id": action_id,
        "title": action["title"],
        "classification": action["classification"],
        "allowed": allowed,
        "status": "preview_allowed" if allowed else "blocked",
        "reason": reason,
        "simulation_only": True,
        "output": preview,
    }
