"""Source-aware CAIL operator center. Synthetic adapters ONLY; never connects to HPE."""
from __future__ import annotations
from datetime import datetime, timezone
from .scenarios import list_incidents
from .runtime_health import runtime_health

TOOLS = {
    "asap": {
        "name": "ASAP", "purpose": "Availability and performance",
        "docs": "https://www.nonstopasap.com/"},
    "ems": {
        "name": "EMS", "purpose": "Operator event messages",
        "docs": "https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=EMS_Messages.html"},
    "scf": {
        "name": "SCF", "purpose": "Subsystem status",
        "docs": "https://support.hpe.com/hpesc/public/docDisplay?docId=c04583315en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-02DF-0000000004D7.html"},
}
COMMANDS = {
    "check_health": ("CHECK HEALTH", None),
    "show_alerts": ("SHOW ALERTS", "ems"),
    "open_asap": ("OPEN ASAP SOURCE", "asap"),
    "open_ems": ("OPEN EMS SOURCE", "ems"),
    "open_scf": ("OPEN SCF SOURCE", "scf"),
    "show_scf_reference": ("SHOW SCF REFERENCE", "scf"),
}
EXPLANATIONS = {
    "green": "Explicitly normal simulated baseline",
    "yellow": "Warning or caution in training evidence",
    "red": "Critical synthetic incident needing operator review",
    "unknown": "Insufficient observations: unknown is never green",
}
SEVERITY = {"high": "red", "critical": "red", "warning": "yellow", "normal": "green"}


def _incident(incident_id):
    return next((x for x in list_incidents() if x["id"] == incident_id), None)


def indicator(incident):
    """Deterministic demo health policy; these are NOT HPE default thresholds."""
    events = incident.get("events", [])
    metrics = incident.get("metrics", [])
    findings = []
    if events:
        levels = [str(e.get("level", "")).lower() for e in events]
        if "high" in levels or "critical" in levels or "error" in levels:
            findings.append(("red", "High-severity synthetic event"))
        elif "warning" in levels:
            findings.append(("yellow", "Warning-level synthetic event"))
    for m in metrics:
        name = str(m.get("name", "")).lower()
        val = m.get("value")
        baseline = m.get("baseline")
        if not isinstance(val, (int, float)):
            continue
        if name == "disk utilization":
            if val >= 90:
                findings.append(("red", "Disk utilization >= 90% demo threshold"))
            elif val >= 80:
                findings.append(("yellow", "Disk utilization >= 80% demo threshold"))
        elif name == "service availability":
            if val < 80:
                findings.append(("red", "Availability < 80% demo threshold"))
            elif val < 99:
                findings.append(("yellow", "Availability < 99% demo threshold"))
        elif name == "response latency" and isinstance(baseline, (int, float)) and baseline > 0:
            if val >= 4 * baseline:
                findings.append(("red", "Latency >= 4x demo baseline"))
            elif val >= 2 * baseline:
                findings.append(("yellow", "Latency >= 2x demo baseline"))
    if not events and not metrics:
        color = "unknown"
    elif any(level == "red" for level, _ in findings):
        color = "red"
    elif findings:
        color = "yellow"
    else:
        # A record with some evidence and no alarms is not automatically healthy.
        color = "green" if incident.get("severity") == "normal" else "unknown"
    return {
        "incident_id": incident["id"], "title": incident["title"],
        "system": incident["system"], "color": color, "meaning": EXPLANATIONS[color],
        "signal_reasons": [description for level, description in findings],
        "status_policy": "illustrative_training_thresholds_not_hpe_certified",
        "source_mode": "synthetic_fixture_not_live",
        "source_hrefs": {
            tool: f"/api/v1/operations/incidents/{incident['id']}/sources/{tool}"
            for tool in TOOLS
        },
        "evidence_ids": [e["id"] for e in events],
        "operational_action_authorized": False,
    }

def overview():
    indicators = [indicator(i) for i in list_incidents()]
    indicators.append({
        "incident_id": None, "title": "Explicit synthetic healthy baseline",
        "system": "SIM-HEALTHY-BASELINE", "color": "green",
        "meaning": EXPLANATIONS["green"], "evidence_ids": ["SIM-BASELINE-001"],
        "source_mode": "synthetic_explicit_baseline", "source_hrefs": {},
        "operational_action_authorized": False,
    })
    return {
        "product_name": "CAIL/Nonstop AI Operations Assistant",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "simulation_only", "tools_connected": False,
        "polling_live_tools": False, "legend": EXPLANATIONS,
        "statuses": indicators,
        "warning": "Green/yellow/red colors refer only to simulated training fixtures.",
    }


def registry():
    return {"mode": "simulation_only", "tools": [
        {"id": k, **v, "connected": False,
         "transport": "synthetic_fixture_projection", "can_execute_commands": False}
        for k, v in TOOLS.items()]}


def source(incident_id, tool):
    incident = _incident(incident_id)
    tool = tool.lower()
    if not incident or tool not in TOOLS:
        return None
    if tool == "asap":
        records = [
            {"id": f"SIM-ASAP-{incident_id}-{i+1:02d}", "metric": m["name"],
             "value": m["value"], "unit": m["unit"], "baseline": m["baseline"]}
            for i, m in enumerate(incident["metrics"])]
    elif tool == "ems":
        records = [
            {"id": e["id"], "level": e["level"], "message": e["message"],
             "time": e["time"], "original_fixture_source": e["source"],
             "official_hpe_message_number": None}
            for e in incident["events"]]
    else:
        records = []  # No SCF status observation is present in original fixture.
    return {
        "incident_id": incident_id, "tool_id": tool,
        "name": TOOLS[tool]["name"], "connected": False,
        "mode": "synthetic_projection_not_real_tool_output",
        "health_signal": indicator(incident)["color"] if records else "unknown",
        "evidence": records, "docs_url": TOOLS[tool]["docs"],
        "fixture_origin": "backend/app/scenarios.py",
        "real_system_status_verified": False, "execution_allowed": False,
        "note": ("No status reading exists: unknown is not green." if tool == "scf" else
                 "Original local training events/metrics, not actual ASAP or EMS records."),
    }


def _documented_references(incident_id):
    """Public HPE references already curated by our guided incident playbook."""
    from .command_playbook import GUIDES
    return [
        {
            "id": "reference:" + step["id"],
            "label": step["command"],
            "type": "hpe_manual_reference_only",
            "command": step["command"],
            "title": step["title"],
            "purpose": step["purpose"],
            "look_for": step["look_for"],
            "prerequisites": step["prerequisites"],
            "if_missing": step["if_missing"],
            "references": step["references"],
            "execution_allowed": False,
            "state_change_executed": False,
            "release_verified": False,
        }
        for step in GUIDES.get(incident_id, [])
        if step["kind"] == "manual_reference" and step["command"]
    ]


def command_catalog(incident_id):
    if not _incident(incident_id):
        return None
    commands = [
        {"id": key, "label": label, "type": "local_ui_intent_only",
         "execution_allowed": False,
         "source_href": (
             f"/api/v1/operations/incidents/{incident_id}/sources/{tool}"
             if tool else None)}
        for key, (label, tool) in COMMANDS.items()
        # An SCF reference is not meaningful on a Pathway-only incident.
        if key != "show_scf_reference" or incident_id == "INC-DISK-001"
    ]
    return {
        "incident_id": incident_id, "execution_allowed": False,
        "commands": commands,
        "documented_commands": _documented_references(incident_id),
    }

def command_preview(incident_id, command_id):
    incident = _incident(incident_id)
    if not incident:
        return None
    base = {
        "incident_id": incident_id, "command_id": command_id,
        "execution_allowed": False, "state_change_executed": False,
    }
    if command_id.startswith("reference:"):
        reference = next((item for item in _documented_references(incident_id)
                          if item["id"] == command_id), None)
        if not reference:
            return {**base, "status": "blocked_unknown_command", "result": None}
        return {
            **base, "status": "hpe_reference_only_unknown_status",
            "result": reference, "hpe_nonstop_health": "unknown",
            "message": "Documentation only: no HPE terminal, collector or device was queried.",
        }
    if command_id not in COMMANDS:
        return {**base, "status": "blocked_unknown_command", "result": None}
    if command_id == "show_scf_reference":
        if incident_id != "INC-DISK-001":
            return {**base, "status": "context_mismatch", "result": None}
        return {
            **base, "status": "hpe_reference_only_unknown_status",
            "result": _documented_references(incident_id)[0],
            "hpe_nonstop_health": "unknown",
            "message": "The HPE STATUS DISK syntax is shown for operator review; it was not executed.",
        }
    result = None
    if command_id == "check_health":
        result = {
            "runtime_health": runtime_health(),
            "selected_synthetic_incident": indicator(incident),
            "hpe_nonstop_health": "unknown",
            "explanation": "Live local runtime observations are separate from simulated NonStop incident signals.",
        }
    elif command_id == "show_alerts":
        result = source(incident_id, "ems")
    else:
        tool = COMMANDS[command_id][1]
        result = source(incident_id, tool) if tool in TOOLS else None
    return {**base, "status": "read_only_result", "result": result}
