"""Independent default-deny safety policy; no real commands are run."""
import re

_CHANGING_VERB = r'(?:restart|stop|start(?!\s+(?:with|by|over)\b)|delete|purge|alter|shutdown|kill|terminate|format|erase|drop|chmod|remove)'
_OPERATION_TARGET = r'(?:\b(?:pathway|pathmon|serverclass|servers?|services?|programs?|process(?:es)?|nodes?|cpu|system|disks?|volumes?|files?|audit|workers?|database|tables?|data|logs?|jobs?)\b|\$[A-Z][A-Z0-9_]*)'
_CHANGE_INTENT = re.compile(
    r'(?:^|[;\n|&])\s*(?:(?:please|run|execute|sudo)\s+)*' + _CHANGING_VERB + r'\b|'
    r'\b(?:can you|could you|please|run|execute|go ahead and|i need you to)\s+' + _CHANGING_VERB + r'\b',
    re.I,
)


def requests_state_change(question):
    """Identify explicit command/execution requests before invoking the assistant."""
    match = _CHANGE_INTENT.search(question)
    return bool(match and re.search(_OPERATION_TARGET, question[match.end():], re.I))


ACTIONS = {
    'inspect_disk_growth': {'title': 'Inspect disk trends and file metadata', 'classification': 'read_only',
                            'explanation': 'Collect synthetic capacity and ownership evidence without modifying files.'},
    'inspect_events': {'title': 'Review recent event timeline', 'classification': 'read_only',
                       'explanation': 'Read the synthetic event timeline without changing system state.'},
    'purge_files': {'title': 'Purge application files', 'classification': 'destructive',
                    'explanation': 'File ownership, dependencies, and retention rules are unverified.'},
    'restart_service': {'title': 'Restart application service', 'classification': 'state_changing',
                        'explanation': 'Impact, failover readiness, and authorization are unverified.'}}


def evaluate(action_id, incident):
    action = ACTIONS.get(action_id)
    if action is None:
        return {'action_id': action_id, 'allowed': False, 'status': 'blocked',
                'reason': 'Unknown action: default-deny policy.',
                'simulation_only': True, 'output': None}
    allowed = action['classification'] == 'read_only'
    reason = ('Allowed for synthetic read-only preview. No real NonStop command is executed.' if allowed
              else action['explanation'] + ' No state-changing command is available in this prototype.')
    preview = ({'incident_id': incident['id'],
                'event_ids': [event['id'] for event in incident['events']],
                'unverified_conditions': incident['unknowns']} if allowed else None)
    return {'action_id': action_id, 'title': action['title'], 'classification': action['classification'],
            'allowed': allowed, 'status': 'preview_allowed' if allowed else 'blocked',
            'reason': reason, 'simulation_only': True, 'output': preview}
