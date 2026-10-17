"""Documented, display-only diagnostics. Never executes NonStop or shell commands."""
from __future__ import annotations

TEMPLATES = {
    'read_operator_message_header': {
        'id': 'read_operator_message_header',
        'title': 'Inspect operator message identification fields',
        'mode': 'checklist_only',
        'command': None,
        'steps': ['Locate the original message record',
                  'Record actual subsystem name, event number and generation time',
                  'Record system name and process/processor identifier',
                  'Confirm relevant release and approved local procedures'],
        'reference_id': 'HPE-OPERATOR-INTRO',
        'reference_url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c03911514en_us&docLocale=en_US&page=ch01_Introduction.html',
        'release_scope': 'manual_release_not_verified',
    },
    'scf_kernel_status_lseries': {
        'id': 'scf_kernel_status_lseries',
        'title': 'SCF kernel status reference (L-Series only)',
        'mode': 'documentation_reference_only',
        'command': 'STATUS SUBSYS $ZZKRN',
        'steps': ['Verify that the target is an authorized L-Series NonStop environment',
                  'Check your system and object naming against the applicable SCF manual',
                  'Get local operational authorization before using this reference'],
        'reference_id': 'HPE-SCF-L-SUBSYS-STATUS',
        'reference_url': 'https://support.hpe.com/hpesc/public/docDisplay?docId=c04583315en_us&docLocale=en_US&page=GUID-D7147C7F-2016-0901-02DF-0000000004D7.html',
        'release_scope': 'L-Series_kernel_only',
    },
}


def list_templates() -> dict:
    return {'mode': 'display_only_no_command_execution', 'templates': list(TEMPLATES.values()),
            'warning': 'The actual target system release and local permissions have not been verified.'}


def preview_template(template_id: str, incident: dict) -> dict:
    t = TEMPLATES.get(template_id)
    if not t:
        return {'template_id': template_id, 'incident_id': incident['id'], 'status': 'blocked',
                'reason': 'Unknown or unreviewed template: default deny',
                'execution_allowed': False, 'state_change_executed': False,
                'template': None}
    return {'template_id': template_id, 'incident_id': incident['id'],
            'status': 'reference_only', 'reason': 'Documentation preview only; no system release or authorization verified',
            'execution_allowed': False, 'state_change_executed': False,
            'synthetic': True, 'template': t,
            'evidence_ids': [e['id'] for e in incident['events']]}
