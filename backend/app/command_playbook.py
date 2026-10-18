"""Curated, evidence-linked, READ-ONLY operator playbooks for synthetic NonStop incidents.

This registry distinguishes actual HPE-documented command syntax from CAIL's
invented UI intents. The HPE sources are public references, NOT approval for
the selected release, object names or operator privileges. Nothing is executed.
"""
from __future__ import annotations
from .enterprise_bridge import command_preview, source
from .legacy_tree import build_legacy_tree
from .scenarios import get_incident

HPE_STORAGE = (
    'https://support.hpe.com/hpesc/public/docDisplay?'
    'docId=a00022757en_us&page=GUID-D7147C7F-2016-0901-027E-000000000720.html'
)
HPE_STORAGE_CASE = (
    'https://support.hpe.com/hpesc/public/docDisplay?'
    'docId=sf000098023en_us&docLocale=en_US'
)
HPE_PATHWAY = (
    'https://support.hpe.com/hpesc/public/docDisplay?'
    'docId=a00090085en_us&docLocale=en_US&'
    'page=GUID-D7147C7F-2016-0901-029E-000000000B58.html'
)
HPE_PATHWAY_MON = (
    'https://support.hpe.com/hpesc/public/docDisplay?'
    'docId=a00090085en_us&docLocale=en_US&'
    'page=GUID-D7147C7F-2016-0901-029E-000000000AF3.html'
)
HPE_PATHWAY_CASE = (
    'https://support.hpe.com/hpesc/public/docDisplay?'
    'docId=ns102.0.31297146.4515804en_us&docLocale=en_US'
)

# display_name != actual syntax: CAIL intents only point to offline fixture data.
# manual references are NOT issued to a shell, command proxy, or HPE device.
GUIDES = {
    'INC-DISK-001': [
        {
            'id': 'disk-events', 'title': 'Identify the first capacity warning',
            'kind': 'local_preview', 'tool': 'EMS', 'command': None,
            'local_intent': 'show_alerts', 'source_tool': 'ems',
            'purpose': 'Read synthetic operator events chronologically.',
            'why_now': 'Time ordering distinguishes an increasing trend from a single alert.',
            'look_for': ['Earliest event time', 'Warning threshold', 'Latest observed value'],
            'interpretation': 'The supplied events show 72%, then above 75%, then 81%; they do not identify which files grew.',
            'if_missing': 'No events means the timeline is unverified. Ask for authorized EMS records.',
            'if_present': 'Compare the event sequence with the capacity metrics in the next step.',
            'event_ids': ['SIM-EVT-101','SIM-EVT-102','SIM-EVT-103'],
            'references': [], 'prerequisites': [],
        },
        {
            'id': 'disk-asap', 'title': 'Compare capacity baseline and current value',
            'kind': 'local_preview', 'tool': 'ASAP-style synthetic metrics',
            'command': None, 'local_intent': 'open_asap', 'source_tool': 'asap',
            'purpose': 'Inspect baseline, current utilization and the demo threshold.',
            'why_now': 'A warning should be compared with recorded metrics before discussing remediation.',
            'look_for': ['Disk utilization: baseline 72%, current 81%', 'Synthetic warning threshold: 80%'],
            'interpretation': 'Capacity exceeded the TRAINING threshold; this is not authenticated ASAP data or a proven outage.',
            'if_missing': 'Treat real utilization as unknown and request an authorized measurement.',
            'if_present': 'Confirm whether the target volume and its status exist using the documented reference.',
            'event_ids': ['SIM-EVT-101','SIM-EVT-103'],
            'references': [], 'prerequisites': [],
        },
        {
            'id': 'disk-scf-status', 'title': 'Verify disk state and process paths',
            'kind': 'manual_reference', 'tool': 'SCF — Storage Subsystem',
            'command': 'STATUS DISK $DATA03', 'local_intent': None, 'source_tool': 'scf',
            'purpose': 'Show a documented storage status reference for a named volume, not a local command execution.',
            'why_now': 'Capacity alone does not prove whether the disk paths and processes are healthy.',
            'look_for': ['Actual disk object/volume name', 'State and primary/backup paths', 'Primary and backup PID if available'],
            'interpretation': 'ACTIVE/INACTIVE and STARTED relate to paths/state; they do NOT report the 81% utilization fixture.',
            'if_missing': 'No SCF response exists in this demo. Preserve UNKNOWN; do not interpret it as GREEN.',
            'if_present': 'Review the actual status with a qualified operator before deciding on next steps.',
            'event_ids': ['SIM-EVT-103'],
            'references': [
                {'title': 'HPE Storage SCF — status and path output example',
                 'url': HPE_STORAGE,
                 'note': 'A published status output example; target release and object name are not validated.'},
                {'title': 'HPE support example — STATUS DISK $*',
                 'url': HPE_STORAGE_CASE,
                 'note': 'Illustrates actual STATUS DISK syntax. The $DATA03 name belongs to this synthetic scenario.'},
            ],
            'prerequisites': ['Confirm storage SCF context and correct volume name',
                              'Verify target release, privileges, and site runbook'],
        },
        {
            'id': 'disk-ownership', 'title': 'Confirm file ownership before changing anything',
            'kind': 'checklist', 'tool': 'Human-runbook review',
            'command': None, 'local_intent': None, 'source_tool': None,
            'purpose': 'Check the missing operational facts before recommending any cleanup.',
            'why_now': 'The incident fixture contains no file inventory, retention rules or dependent applications.',
            'look_for': ['File owner', 'Retention policy', 'Application dependencies'],
            'interpretation': 'Without these facts, a cleanup recommendation would be unsupported.',
            'if_missing': 'Escalate to the application owner. Never suggest deleting files from missing context.',
            'if_present': 'Record verified facts and capture a lesson for separate mentor review.',
            'event_ids': ['SIM-EVT-103'], 'references': [],
            'prerequisites': ['Application owner verification', 'Approved local retention runbook'],
        },
    ],
    'INC-PATH-002': [
        {
            'id': 'path-events', 'title': 'Inspect service degradation events',
            'kind': 'local_preview', 'tool': 'EMS',
            'command': None, 'local_intent': 'show_alerts', 'source_tool': 'ems',
            'purpose': 'Establish the event order before treating service degradation as a known failure.',
            'why_now': 'A latency warning preceded a service-not-responding event in the fixture.',
            'look_for': ['Latency warning', 'Not-responding event', 'Their timestamps'],
            'interpretation': 'These invented events indicate a symptom, not a confirmed root cause.',
            'if_missing': 'Request properly captured operator events before attributing the failure.',
            'if_present': 'Investigate the Pathway environment state, then the affected server class.',
            'event_ids': ['SIM-EVT-201','SIM-EVT-202'], 'references': [], 'prerequisites': [],
        },
        {
            'id': 'path-status', 'title': 'Check the Pathway environment status',
            'kind': 'manual_reference', 'tool': 'PATHCOM — TS/MP',
            'command': 'STATUS PATHWAY', 'local_intent': None, 'source_tool': None,
            'purpose': 'Illustrate a documented read-only Pathway status query.',
            'why_now': 'The fixture does not provide an authenticated PATHMON/PATHCOM status.',
            'look_for': ['PATHWAY state', 'PATHMON-controlled environment status', 'Linked processes if shown'],
            'interpretation': 'A reported state must come from the actual configured PATHMON environment; synthetic EMS cannot supply it.',
            'if_missing': 'Mark Pathway status as UNKNOWN and request an authorized status capture.',
            'if_present': 'If the environment is running, inspect the particular server class.',
            'event_ids': ['SIM-EVT-202'],
            'references': [{'title': 'HPE TS/MP 2.8 — STATUS PATHWAY example',
                            'url': HPE_PATHWAY_MON,
                            'note': 'Manual for TS/MP 2.8; actual environment/version not verified.'}],
            'prerequisites': ['Identify the actual PATHMON process and TS/MP version',
                              'Confirm authorized PATHCOM access and operational procedure'],
        },
        {
            'id': 'path-server', 'title': 'Check the affected server class and processes',
            'kind': 'manual_reference', 'tool': 'PATHCOM — TS/MP',
            'command': 'STATUS SERVER <serverclass>, DETAIL',
            'local_intent': None, 'source_tool': None,
            'purpose': 'Explain the read-only status query used to inspect a named server class.',
            'why_now': 'A service-not-responding alert cannot prove if a class is stopped, pending, in error or busy.',
            'look_for': ['Actual server class name', 'RUNNING/PENDING/STOPPED or error state',
                         'Process count and available detail'],
            'interpretation': 'Use the actual site status to distinguish cases. The fixture does not name the server class.',
            'if_missing': 'The <serverclass> placeholder MUST be resolved using authorized system records. Otherwise stop at UNKNOWN.',
            'if_present': 'Ask the owner to verify dependencies, process state and approved escalation procedure.',
            'event_ids': ['SIM-EVT-201','SIM-EVT-202'],
            'references': [
                {'title': 'HPE TS/MP — PATHCOM command list',
                 'url': HPE_PATHWAY,
                 'note': 'Documents STATUS support for SERVER objects; check version/site applicability.'},
                {'title': 'HPE support — Pathway server stops responding',
                 'url': HPE_PATHWAY_CASE,
                 'note': 'Uses STATUS SERVER <serverclass>, DETAIL; subsequent corrective actions are NOT authorized here.'},
            ],
            'prerequisites': ['Identify target PATHMON and server class',
                              'Check deployment-specific Pathway product/release'],
        },
        {
            'id': 'path-asap', 'title': 'Compare service latency and availability',
            'kind': 'local_preview', 'tool': 'ASAP-style synthetic metrics',
            'command': None, 'local_intent': 'open_asap', 'source_tool': 'asap',
            'purpose': 'Compare synthetic service availability and response latency to their baselines.',
            'why_now': 'Performance observations help triage severity but do not establish causality.',
            'look_for': ['Availability 75% vs baseline 100%', 'Latency 842ms vs baseline 120ms'],
            'interpretation': 'Numbers come from the demo fixture; they are not live ASAP measurements.',
            'if_missing': 'Do not assume the service recovered. Seek authenticated observations.',
            'if_present': 'Combine with authorized server status and review escalation conditions.',
            'event_ids': ['SIM-EVT-201'], 'references': [], 'prerequisites': [],
        },
        {
            'id': 'path-review', 'title': 'Confirm dependencies and safe escalation',
            'kind': 'checklist', 'tool': 'Human-runbook review',
            'command': None, 'local_intent': None, 'source_tool': None,
            'purpose': 'Prevent an unsupported restart or failover intervention.',
            'why_now': 'Primary/backup state and dependent service health remain unknown.',
            'look_for': ['Verified process state', 'Primary/backup status', 'Dependent service health'],
            'interpretation': 'A service alert does not justify restarting production processes.',
            'if_missing': 'Escalate to the appropriate on-call owner and retain unknowns explicitly.',
            'if_present': 'Capture reasoning as reviewed Decision DNA instead of a speculative fix.',
            'event_ids': ['SIM-EVT-202'], 'references': [],
            'prerequisites': ['Authorized owner review', 'Approved incident runbook'],
        },
    ],
}

def _public_step(incident: dict, item: dict) -> dict:
    event_ids = {x['id'] for x in incident['events']}
    assert set(item['event_ids']).issubset(event_ids), 'Playbook references unknown scenario evidence'
    return {
        **item, 'execution_allowed': False, 'state_change_executed': False,
        'synthetic': True, 'command_applicability_verified': False,
        'source_status': ('hpe_public_reference_reviewed_not_release_verified'
                          if item['references'] else 'local_synthetic_training_fixture'),
        'source_hrefs': {
            tool: '/api/v1/operations/incidents/' + incident['id'] + '/sources/' + tool
            for tool in ([item['source_tool']] if item['source_tool'] else [])
        },
    }


def build_playbook(incident: dict) -> dict:
    raw_steps = GUIDES.get(incident['id'], [])
    steps = [_public_step(incident, item) for item in raw_steps]
    tree = build_legacy_tree(incident['id'])
    return {
        'incident_id': incident['id'], 'title': incident['title'],
        'mode': 'synthetic_guidance_no_command_execution',
        'generated_by': 'curated_incident_mapping_not_unrestricted_llm',
        'release_verified': False, 'operator_authorized': False,
        'manual_references_verified_for_specific_release': False,
        'source_authenticity_of_local_telemetry_verified': False,
        'steps': steps,
        'approved_lessons': [
            {'id': n['id'], 'title': n['title'], 'evidence_ids': n['source_event_ids']}
            for n in tree['nodes'][:5]
        ],
        'limitations': 'Reference syntax is published HPE material but is NOT verified for the current target release or access. All observations are synthetic; run no commands.',
    }


def preview_playbook(incident: dict, step_id: str) -> dict:
    step = next((item for item in GUIDES.get(incident['id'], []) if item['id'] == step_id), None)
    if step is None:
        return {
            'incident_id': incident['id'], 'step_id': step_id,
            'status': 'blocked_unknown_step', 'preview': None, 'source': None,
            'state_change_executed': False, 'execution_allowed': False,
        }
    if step['kind'] != 'local_preview':
        return {
            'incident_id': incident['id'], 'step_id': step_id,
            'status': 'manual_reference_only' if step['kind']=='manual_reference' else 'checklist_only',
            'preview': None,
            'source': (source(incident['id'], step['source_tool'])
                       if step['source_tool'] in ('asap','ems','scf') else None),
            'message': 'This is a documentation/checklist step, not a command preview. No system was queried.',
            'execution_allowed': False, 'state_change_executed': False, 'synthetic': True,
        }
    allowed = {'show_alerts', 'open_asap'}
    if step['local_intent'] not in allowed:
        return {
            'incident_id': incident['id'], 'step_id': step_id, 'status': 'blocked',
            'preview': None, 'source': None, 'execution_allowed': False,
            'state_change_executed': False, 'synthetic': True,
        }
    projected = command_preview(incident['id'], step['local_intent'])
    assert projected['execution_allowed'] is False and projected['state_change_executed'] is False
    return {
        'incident_id': incident['id'], 'step_id': step_id, 'status': 'synthetic_preview',
        'preview': projected, 'source': source(incident['id'], step['source_tool']),
        'execution_allowed': False, 'state_change_executed': False, 'synthetic': True,
        'message': 'CAIL previewed registered local fixture data; this did NOT issue a PATHCOM, SCF, TACL, or other external command.',
    }


# These bounded tokens select a documented/evidence-linked step, never a command
# supplied by the user or by an LLM. No match means ask for clarification.
TOPICS = {
    'INC-DISK-001': [
        ('disk-scf-status', {'scf','status','state','path','paths','backup','process'}),
        ('disk-ownership', {'file','files','owner','ownership','retention','delete','cleanup'}),
        ('disk-asap', {'asap','capacity','utilization','percent','threshold','metric','trend'}),
        ('disk-events', {'ems','alert','alerts','events','timeline','warning'}),
    ],
    'INC-PATH-002': [
        ('path-server', {'server','serverclass','process','pending','hung','stopped','pathcom'}),
        ('path-status', {'pathway','pathmon','environment','state','status'}),
        ('path-asap', {'latency','performance','availability','asap','slow'}),
        ('path-events', {'ems','alert','alerts','events','timeline','warning'}),
    ],
}

def recommend_step(incident: dict, question: str) -> dict:
    import re
    tokens = set(re.findall(r'[a-z0-9]+', question.lower()))
    # A native subsystem hint must never be silently reinterpreted as a
    # generic keyword from the currently selected, unrelated incident.
    if incident['id']=='INC-DISK-001' and tokens.intersection(
        {'pathway','pathcom','pathmon','serverclass'}
    ):
        return {
            'incident_id':incident['id'], 'status':'context_mismatch',
            'recommended_step_id':None, 'matched_terms':sorted(tokens.intersection(
                {'pathway','pathcom','pathmon','serverclass'})),
            'suggested_incident_id':'INC-PATH-002',
            'reason':'PATHCOM/Pathway terms do not match the selected disk incident. Switch to the Pathway investigation.',
            'recommendation_basis':'deterministic_curated_terms_not_ai',
            'execution_allowed':False,'state_change_executed':False,
        }
    if incident['id']=='INC-PATH-002' and tokens.intersection(
        {'disk','scf','volume','retention'}
    ):
        return {
            'incident_id':incident['id'], 'status':'context_mismatch',
            'recommended_step_id':None, 'matched_terms':sorted(tokens.intersection(
                {'disk','scf','volume','retention'})),
            'suggested_incident_id':'INC-DISK-001',
            'reason':'Storage/SCF terms do not match the selected Pathway incident. Switch to the disk investigation.',
            'recommendation_basis':'deterministic_curated_terms_not_ai',
            'execution_allowed':False,'state_change_executed':False,
        }
    candidates = []
    for step_id, terms in TOPICS.get(incident['id'], []):
        hits = sorted(tokens & terms)
        if hits:
            candidates.append((len(hits), step_id, hits))
    candidates.sort(key=lambda item: (-item[0], item[1]))
    if not candidates:
        return {
            'incident_id': incident['id'], 'status': 'needs_clarification',
            'recommended_step_id': None, 'matched_terms': [],
            'reason': 'No incident-specific symptom terms matched. Select a playbook step or describe an observed disk/Pathway symptom.',
            'recommendation_basis': 'deterministic_curated_terms_not_ai',
            'execution_allowed': False, 'state_change_executed': False,
        }
    _, recommended, hits = candidates[0]
    return {
        'incident_id': incident['id'], 'status': 'matched',
        'recommended_step_id': recommended, 'matched_terms': hits,
        'reason': 'Mapped supplied symptom words to an existing, reviewed read-only training step. This does not diagnose the cause.',
        'recommendation_basis': 'deterministic_curated_terms_not_ai',
        'execution_allowed': False, 'state_change_executed': False,
    }
