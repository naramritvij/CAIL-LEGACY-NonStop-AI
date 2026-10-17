"""Predefined what-if training branches, NOT predictive failure probabilities."""
from .policy import evaluate

OUTCOMES = {
    'INC-DISK-001': {
        'inspect_disk_growth': ('More file metadata becomes available for review.', 'low'),
        'inspect_events': ('Synthetic event timeline is reviewed without modifying the disk.', 'low'),
        'purge_files': ('Training branch: an application-owned file is removed and the simulated application becomes unavailable.', 'high'),
        'restart_service': ('Training branch: restart does not correct underlying file growth and interrupts simulated service.', 'high'),
    },
    'INC-PATH-002': {
        'inspect_events': ('Event sequence is inspected; cause remains unconfirmed.', 'low'),
        'inspect_disk_growth': ('Disk evidence is retrieved but does not confirm the service failure cause.', 'low'),
        'purge_files': ('Training branch: file deletion introduces another simulated failure.', 'high'),
        'restart_service': ('Training branch: restart before dependency checks causes additional simulated outage.', 'high'),
    },
}


def replay(incident, action_id):
    safety = evaluate(action_id, incident)
    scenario = OUTCOMES.get(incident['id'], {}).get(action_id)
    if scenario is None:
        return {'incident_id': incident['id'], 'action_id': action_id,
                'known_branch': False, 'policy': safety,
                'simulated_outcome': None, 'risk_band': 'unknown',
                'disclaimer': 'No predefined training branch exists. No command was executed.'}
    return {'incident_id': incident['id'], 'action_id': action_id, 'known_branch': True,
            'policy': safety, 'simulated_outcome': scenario[0], 'risk_band': scenario[1],
            'state_change_executed': False, 'deterministic': True,
            'disclaimer': 'Illustrative predetermined training outcome; not a live-system prediction.'}
