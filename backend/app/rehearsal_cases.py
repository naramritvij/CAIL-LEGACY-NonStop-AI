"""Synthetic rehearsal records and operator decisions for four training cases."""

from .operations_lab import FINANCIAL_ID, incident

DISK = 'INC-DISK-001'
PATHWAY = 'INC-PATH-002'
TMF = 'INC-TMF-004'

ACTIONS = {
    'sample_disk': 'Collect a second timestamped utilization sample for $DATA03.',
    'verify_retention': 'Verify ownership, retention policy and dependencies with the responsible operator.',
    'disk_handoff': 'Escalate the observed threshold breach with the baseline, current utilization and retention gaps.',
    'compare_latency': 'Compare the timestamped latency with the expected baseline and check service availability.',
    'verify_pathway': 'Verify the affected service instance and its primary, backup and dependency status.',
    'dependency_handoff': 'Escalate the Pathway symptom and downstream delay together, with their timestamps.',
    'compare_capacity': 'Confirm the affected node and compare available capacity with other nodes.',
    'preserve_sequence': 'Record the order of the hardware, CPU and service symptoms and check for shared dependencies.',
    'payment_handoff': 'Escalate payment impact and the worker exit with timestamps and request an authorized dependency check.',
    'sample_audit': 'Collect another timestamped sample of audit utilization on the same training system.',
    'third_audit_sample': 'Collect a third comparable observation before estimating the time to the exercise threshold.',
    'audit_handoff': 'Escalate the conditional trend estimate and ask the owner to verify retention and capacity.',
    'assume_impact': 'Report confirmed impact using only this first observation.',
    'declare_cause': 'Declare the first observation to be the confirmed cause.',
    'restart_service': 'Restart the affected service immediately.',
    'delete_files': 'Delete files to free space immediately.',
    'assume_recovery': 'Mark the incident recovered and close the investigation.',
}


def checkpoint(label, count, level, task, correct, alternatives, evidence, rationale, unknowns):
    return {
        'label': label, 'count': count, 'level': level, 'task': task,
        'correct': correct, 'options': sorted([correct, *alternatives]),
        'requires': evidence, 'rationale': rationale, 'unknowns': unknowns,
    }


CHECKPOINTS = {
    DISK: [
        checkpoint('Establish the baseline', 1, 'info', 'Which read should you request from the baseline?',
                   'sample_disk', ['assume_impact', 'delete_files'], ['SIM-EVT-101'],
                   'The baseline is 72%. A second comparable sample is needed before judging change.',
                   'The growth rate, file ownership and retention policy are unverified.'),
        checkpoint('Investigate growth', 2, 'warning', 'Which missing evidence matters before anyone proposes cleanup?',
                   'verify_retention', ['declare_cause', 'delete_files'], ['SIM-EVT-101', 'SIM-EVT-102'],
                   'The later sample exceeded 75%. The rise warrants a retention and ownership check.',
                   'The exact second utilization, growing files and cleanup authority are unknown.'),
        checkpoint('Hand off the threshold breach', 3, 'warning', 'What should the next operator receive?',
                   'disk_handoff', ['verify_retention', 'delete_files'], ['SIM-EVT-101', 'SIM-EVT-103'],
                   'The replay records 81% against the 80% exercise threshold. Preserve the 72% baseline and scope.',
                   'File ownership, retention policy and application dependencies still require verification.'),
    ],
    PATHWAY: [
        checkpoint('Triage the first symptom', 1, 'warning', 'What is supported by the initial symptom?',
                   'compare_latency', ['assume_impact', 'restart_service'], ['SIM-EVT-201'],
                   'The first report concerns latency. Compare it with the baseline and check availability.',
                   'Service instance state and the source of latency are unverified.'),
        checkpoint('Verify service scope', 2, 'high', 'Which read can narrow the observed service failure?',
                   'verify_pathway', ['declare_cause', 'restart_service'], ['SIM-EVT-201', 'SIM-EVT-202'],
                   'The latency warning preceded the unresponsive instance. Verify which instances and dependencies are affected.',
                   'Primary and backup state, actual PATHMON output and the cause are unknown.'),
        checkpoint('Hand off competing signals', 3, 'high', 'Which escalation preserves the dependency evidence?',
                   'dependency_handoff', ['assume_recovery', 'restart_service'], ['SIM-EVT-202', 'SIM-EVT-203'],
                   'The unresponsive instance and downstream latency are both relevant observations.',
                   'The dependency direction and recovery state require an authorized source check.'),
    ],
    FINANCIAL_ID: [
        checkpoint('Scope the capacity warning', 1, 'high', 'What should be verified after the hardware warning?',
                   'compare_capacity', ['assume_impact', 'restart_service'], ['SIM-EVT-301'],
                   'The hardware monitor recorded a capacity reduction on node B. Scope the affected node first.',
                   'The hardware cause, spare capacity and service impact are unverified.'),
        checkpoint('Correlate without assuming cause', 3, 'high', 'How should the three observations be connected?',
                   'preserve_sequence', ['declare_cause', 'restart_service'], ['SIM-EVT-301', 'SIM-EVT-303'],
                   'Capacity loss came before CPU pressure and the Pathway delay. Chronology can guide checks.',
                   'The causal link and shared service dependencies are unverified.'),
        checkpoint('Hand off payment impact', 5, 'high', 'What should go into the payment incident escalation?',
                   'payment_handoff', ['preserve_sequence', 'restart_service'], ['SIM-EVT-304', 'SIM-EVT-305'],
                   'The payment measurements and worker exit must both be retained with their times.',
                   'Actual production impact, worker dependencies and recovery actions are unknown.'),
    ],
    TMF: [
        checkpoint('Record the first audit sample', 1, 'info', 'What does one sample justify?',
                   'sample_audit', ['audit_handoff', 'delete_files'], ['SIM-EVT-401'],
                   'The first sample is 60%. A comparable observation is needed to establish direction.',
                   'The rate of change and time to the exercise threshold are unknown.'),
        checkpoint('Check the upward movement', 2, 'warning', 'What would make an estimate defensible in this exercise?',
                   'third_audit_sample', ['declare_cause', 'delete_files'], ['SIM-EVT-401', 'SIM-EVT-402'],
                   'Two samples show an increase. This exercise requires three comparable samples for a projection.',
                   'Trend persistence, retention and workload changes are unverified.'),
        checkpoint('Escalate a conditional projection', 3, 'warning', 'How should the observed rise be handed over?',
                   'audit_handoff', ['assume_recovery', 'delete_files'], ['SIM-EVT-401', 'SIM-EVT-402', 'SIM-EVT-403'],
                   'Three observations support a conditional estimate to the 80% exercise threshold.',
                   'Future workload, actual capacity, retention and root cause remain unverified.'),
    ],
}

OVERVIEWS = {
    DISK: 'Trace a growing storage reading, check retention constraints and hand off the warning.',
    PATHWAY: 'Separate a service symptom from a potential dependency problem.',
    FINANCIAL_ID: 'Build a cross-source account of capacity, CPU, service and payment symptoms.',
    TMF: 'Use timestamped audit samples to decide when a conditional warning is justified.',
}


def case_definition(case_id):
    if case_id not in CHECKPOINTS:
        raise LookupError(case_id)
    if case_id == TMF:
        item = {'id': TMF, 'title': 'TMF audit utilization trend', 'system': 'SIM-TMF-TRAINING',
                'events': [
                    {'id': 'SIM-EVT-401', 'time': '02:00', 'source': 'audit-monitor', 'level': 'info',
                     'message': 'Synthetic audit utilization: 60%', 'value': 60},
                    {'id': 'SIM-EVT-402', 'time': '02:10', 'source': 'audit-monitor', 'level': 'warning',
                     'message': 'Synthetic audit utilization: 65%', 'value': 65},
                    {'id': 'SIM-EVT-403', 'time': '02:20', 'source': 'audit-monitor', 'level': 'warning',
                     'message': 'Synthetic audit utilization: 70%', 'value': 70},
                ]}
    else:
        item = incident(case_id)
    if case_id == PATHWAY:
        item['events'].append({
            'id': 'SIM-EVT-203', 'time': '14:17', 'source': 'dependency-monitor', 'level': 'warning',
            'message': 'Synthetic downstream dependency response time above its expected baseline.',
        })
    return {key: item[key] for key in ('id', 'title', 'system', 'events')} | {
        'checkpoints': CHECKPOINTS[case_id],
        'actions': {key: ACTIONS[key] for stage in CHECKPOINTS[case_id] for key in stage['options']},
        'overview': OVERVIEWS[case_id], 'threshold': 80 if case_id == TMF else None,
    }


def catalogue():
    cases = (case_definition(case_id) for case_id in CHECKPOINTS)
    return [{key: case[key] for key in ('id', 'title', 'system', 'overview')} for case in cases]
