"""Deterministic operator narrative derived only from synthetic scenario facts.

This briefing is separate from model inference. It never claims real system
health or root cause, never executes commands, and stays useful if Qwen fails.
"""
from __future__ import annotations
from .policy import evaluate

def build_operator_brief(incident: dict) -> dict:
    metrics = incident.get('metrics', [])
    events = incident.get('events', [])
    # Some callers (including validated Sprint 5 tests) provide a bounded
    # partial incident containing only id/summary/events/unknowns. A briefing
    # must never crash the evidence or model-safety workflow over display text.
    name = incident.get('title') or incident.get('summary') or 'Unnamed synthetic incident'
    ids = [event['id'] for event in events]
    if incident['id'] == 'INC-DISK-001':
        utilization = next((m for m in metrics if m.get('name') == 'Disk utilization'), None)
        baseline = utilization.get('baseline') if utilization else None
        current = utilization.get('value') if utilization else None
        what = (
            f"Synthetic {name} moved from {baseline}% to {current}% over the scenario shift; "
            "the training warning threshold is 80%."
            if baseline is not None and current is not None else incident['summary']
        )
        significance = (
            "This indicates growing storage pressure, not a verified outage. "
            "The evidence does not identify which files caused it."
        )
        next_checks = [
            'Review the simulated capacity trend and event order.',
            'Identify file ownership, retention rules, and dependent applications before any change.',
        ]
        safe_actions = ['inspect_disk_growth', 'inspect_events']
        status = 'yellow'
    elif incident['id'] == 'INC-PATH-002':
        what = incident['summary']
        significance = (
            "The synthetic service-availability and latency observations warrant "
            "attention. A specific failed component or root cause is not established."
        )
        next_checks = [
            'Review the synthetic event timeline and latency/availability metrics.',
            'Verify process state, primary/backup readiness and dependency health.',
        ]
        safe_actions = ['inspect_events']
        status = 'red'
    else:
        what = incident.get('summary') or 'No independently verified observation.'
        significance = 'Insufficient validated context to establish service impact or cause.'
        next_checks = ['Inspect registered evidence and applicable reviewed runbooks.']
        safe_actions = []
        status = 'unknown'
    previews = [
        {'action_id': action, 'display_only': True, 'policy': evaluate(action, incident)['status']}
        for action in safe_actions if evaluate(action, incident)['allowed']
    ]
    return {
        'heading': name, 'status': status, 'what_is_happening': what,
        'why_it_matters': significance, 'safe_next_checks': next_checks,
        'source_event_ids': ids, 'missing_evidence': list(incident.get('unknowns', [])),
        'safe_preview_actions': previews, 'root_cause_status': 'not_established',
        'synthetic': True, 'generated_by': 'deterministic_scenario_brief_not_ai',
        'limitation': 'Training scenario only; verify all facts and procedures before real-world use.',
    }
