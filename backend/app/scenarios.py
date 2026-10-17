"""Synthetic operator-training fixtures. Not official HPE message definitions."""
from copy import deepcopy

INCIDENTS = {
    'INC-DISK-001': {
        'id': 'INC-DISK-001', 'title': '$DATA03 capacity increasing',
        'system': 'SIMULATED-NONSTOP-A', 'severity': 'warning', 'status': 'investigating',
        'synthetic': True,
        'summary': 'Disk utilization rose from 72% to 81% over six hours. File ownership and retention rules have not been verified.',
        'metrics': [
            {'name': 'Disk utilization', 'value': 81, 'unit': '%', 'baseline': 72},
            {'name': 'Simulated threshold', 'value': 80, 'unit': '%', 'baseline': 80},
            {'name': 'Growth over shift', 'value': 9, 'unit': 'points', 'baseline': 0}],
        'events': [
            {'id': 'SIM-EVT-101', 'time': '00:00', 'source': 'disk-monitor', 'level': 'info', 'message': 'Synthetic $DATA03 utilization: 72%'},
            {'id': 'SIM-EVT-102', 'time': '03:30', 'source': 'disk-monitor', 'level': 'warning', 'message': 'Synthetic $DATA03 utilization exceeded 75%'},
            {'id': 'SIM-EVT-103', 'time': '06:00', 'source': 'disk-monitor', 'level': 'warning', 'message': 'Synthetic $DATA03 utilization reached 81%; warning threshold 80%'}],
        'hypotheses': ['One or more application files are growing abnormally.', 'An expected retention or cleanup task may not have run.'],
        'unknowns': ['File ownership', 'Retention policy', 'Application dependencies'],
        'evidence_note': 'SIM-EVT identifiers are invented training fixtures, not HPE EMS event numbers.'},
    'INC-PATH-002': {
        'id': 'INC-PATH-002', 'title': 'Pathway service degradation',
        'system': 'SIMULATED-NONSTOP-A', 'severity': 'high', 'status': 'investigating',
        'synthetic': True, 'summary': 'A simulated Pathway service stopped responding; the cause is not established.',
        'metrics': [{'name': 'Service availability', 'value': 75, 'unit': '%', 'baseline': 100},
                    {'name': 'Response latency', 'value': 842, 'unit': 'ms', 'baseline': 120}],
        'events': [
            {'id': 'SIM-EVT-201', 'time': '14:11', 'source': 'service-monitor', 'level': 'warning', 'message': 'Synthetic payment latency above expected baseline'},
            {'id': 'SIM-EVT-202', 'time': '14:14', 'source': 'service-monitor', 'level': 'high', 'message': 'Synthetic Pathway service instance not responding'}],
        'hypotheses': ['A process stopped responding.', 'A dependent service may be slowing requests.'],
        'unknowns': ['Verified process state', 'Primary/backup status', 'Dependent service health'],
        'evidence_note': 'SIM-EVT identifiers are invented training fixtures, not HPE EMS event numbers.'}}


def get_incident(incident_id):
    item = INCIDENTS.get(incident_id)
    return deepcopy(item) if item else None


def list_incidents():
    return [deepcopy(x) for x in INCIDENTS.values()]
