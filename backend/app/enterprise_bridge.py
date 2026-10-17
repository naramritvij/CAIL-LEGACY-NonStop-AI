"""Source-aware CAIL operator center. Synthetic adapters ONLY; never connects to HPE."""
from __future__ import annotations
from datetime import datetime, timezone
from .scenarios import list_incidents

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
    evidence = incident.get("events", []) + incident.get("metrics", [])
    color = SEVERITY.get(incident.get("severity", ""), "unknown") if evidence else "unknown"
    return {
        "incident_id": incident["id"], "title": incident["title"],
        "system": incident["system"], "color": color, "meaning": EXPLANATIONS[color],
        "source_mode": "synthetic_fixture_not_live",
        "source_hrefs": {tool: f"/api/v1/operations/incidents/{incident['id']}/sources/{tool}"
                         for tool in TOOLS},
        "evidence_ids": [e["id"] for e in incident.get("events", [])],
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


def command_catalog(incident_id):
    if not _incident(incident_id):
        return None
    return {"incident_id": incident_id, "execution_allowed": False, "commands": [
        {"id": key, "label": label, "type": "local_ui_intent_only",
         "execution_allowed": False,
         "source_href": (
             f"/api/v1/operations/incidents/{incident_id}/sources/{tool}"
             if tool else None)}
        for key, (label, tool) in COMMANDS.items()]}


def command_preview(incident_id, command_id):
    incident = _incident(incident_id)
    if not incident:
        return None
    if command_id not in COMMANDS:
        return {"incident_id": incident_id, "command_id": command_id,
                "status": "blocked_unknown_command", "execution_allowed": False,
                "state_change_executed": False, "result": None}
    result = None
    if command_id == "check_health":
        result = indicator(incident)
    elif command_id == "show_alerts":
        result = source(incident_id, "ems")
    elif command_id == "show_scf_reference":
        result = {
            "display_only_reference": "STATUS SUBSYS $ZZKRN",
            "release_scope": "L-Series kernel only; applicability NOT validated",
            "docs_url": TOOLS["scf"]["docs"],
            "execute_this": False}
    else:
        result = source(incident_id, COMMANDS[command_id][1])
    return {"incident_id": incident_id, "command_id": command_id,
            "status": "display_only", "execution_allowed": False,
            "state_change_executed": False, "result": result}
