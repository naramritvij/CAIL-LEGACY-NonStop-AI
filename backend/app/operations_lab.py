"""CAIL Suite-style command router and financial incident lab (offline, synthetic only).

Explicit command inputs are matched to a bounded allowlist. Natural-language
questions select a read-only synthetic adapter; model output is never used to
authorize/execute a native command. No network/terminal/NonStop transport.
"""
from __future__ import annotations
from datetime import datetime, timezone
import re
from .scenarios import get_incident, list_incidents
from .enterprise_bridge import source as existing_source, indicator
from .command_playbook import HPE_STORAGE, HPE_PATHWAY_MON, HPE_PATHWAY_CASE

FINANCIAL_ID = 'INC-FIN-HW-003'
FINANCIAL = {
    'id': FINANCIAL_ID, 'title': 'Financial payments — hardware capacity reduction',
    'system': 'SIM-FINANCIAL-NONSTOP', 'severity': 'high', 'status': 'investigating',
    'synthetic': True,
    'summary': ('A fictional processing node reported a hardware capacity warning '
                'before payment response times increased. The cause of the '
                'subsequent Pathway/transaction symptoms is unverified.'),
    'metrics': [
        {'name':'Processing capacity index','value':65,'baseline':100,'unit':'index'},
        {'name':'Payment response latency','value':980,'baseline':140,'unit':'ms'},
        {'name':'Payment success rate','value':89,'baseline':99.9,'unit':'%'},
        {'name':'CPU 3 utilization','value':94,'baseline':54,'unit':'%'},
    ],
    'events': [
        {'id':'SIM-EVT-301','time':'01:08','source':'hardware-monitor',
         'level':'high','message':'Training hardware capacity reduction on processing node B'},
        {'id':'SIM-EVT-302','time':'01:11','source':'service-monitor',
         'level':'warning','message':'Training CPU 3 utilization reached 94%'},
        {'id':'SIM-EVT-303','time':'01:13','source':'pathway-monitor',
         'level':'warning','message':'Training payment Pathway server class response delay'},
        {'id':'SIM-EVT-304','time':'01:15','source':'transaction-monitor',
         'level':'high','message':'Training payment latency 980ms; success rate 89%'},
        {'id':'SIM-EVT-305','time':'01:17','source':'process-audit',
         'level':'warning','message':'Training payment worker P-22 terminated unexpectedly'},
    ],
    'hypotheses': [
        'Capacity loss may be contributing to contention; temporal order alone cannot establish causation.',
        'A payment worker exit may be related to the transaction slowdown, but dependency status is unknown.',
    ],
    'unknowns': [
        'Authenticated hardware fault report','Actual CPU/queue counters',
        'Verified PATHMON/server-class state','Other processing node capacity',
        'Transaction downstream dependencies','Approved recovery plan',
    ],
    'evidence_note':'All identifiers and measurements are invented; no bank data or real failure records.',
}
DOCS = {
    'scf':'https://support.hpe.com/hpesc/public/docDisplay?docId=a00022757en_us&page=GUID-D7147C7F-2016-0901-027E-000000000720.html',
    'pathcom':HPE_PATHWAY_MON,
    'pathcom_server':HPE_PATHWAY_CASE,
}
NATIVE = {
    'STATUS PATHWAY': {'adapter':'pathcom','allowed_incidents':{'INC-PATH-002',FINANCIAL_ID},
                       'manual_url':DOCS['pathcom']},
    'STATUS SERVER <SERVERCLASS>, DETAIL': {
        'adapter':'pathcom','allowed_incidents':{'INC-PATH-002',FINANCIAL_ID},
        'manual_url':DOCS['pathcom_server']},
    'STATUS DISK $DATA03': {'adapter':'scf','allowed_incidents':{'INC-DISK-001'},
                            'manual_url':DOCS['scf']},
}
UI_ACTIONS = {
    'CHECK HEALTH':'health', 'SHOW ALERTS':'ems',
    'OPEN EMS SOURCE':'ems', 'SHOW EMS EVENTS':'ems',
    'OPEN ASAP SOURCE':'asap', 'SHOW METRICS':'asap',
    'SHOW CPU METRICS':'asap', 'SHOW FAILED PROCESSES':'guardian',
    'SHOW PROCESS EVENTS':'guardian', 'SHOW RECENT PATHWAY EMS':'ems_pathway',
    'SHOW CORRELATION':'correlation',
}
PROHIBITED = re.compile(
    r'(?i)\b(?:stop|start|restart|delete|purge|alter|shutdown|kill|terminate|'
    r'control|switch|format|erase|drop|chmod|execute|run|sudo|remove)\b'
)
SEMANTIC = [
    ('guardian',('failed process','process failed','processes failed','terminated process',
                 'process termination','processes that failed')),
    ('ems_pathway',('ems','pathway')),
    ('correlation',('what changed','before failure','related','root cause','correlat','why did')),
    ('asap',('cpu','processor','utilization','capacity','latency','performance','disk approaching',
             'response time','transactions slowing','transaction rate','payment success')),
    ('ems',('error','alert','warning','event','overnight shift','overnight events')),
    ('pathcom',('pathway','pathmon','server class','serverclass','service not responding')),
    ('health',('problem','issue','system health','system status','wrong','failing')),
]

# Treat equivalent descriptions of failed processes as the same read-only
# topic; don't reclassify unrelated application failures as process failures.
_FAILED_PROCESS_QUERY = re.compile(
    r'\b(?:failed|failing|exited|terminated)\s+(?:[a-z]+\s+){0,3}process(?:es)?\b'
    r'|\bprocess(?:es)?\b(?:\s+[a-z]+){0,4}\s+(?:failed|failing|exited|terminated)\b',
    re.IGNORECASE,
)


def _is_failed_process_question(question: str) -> bool:
    match = _FAILED_PROCESS_QUERY.search(question)
    # "Processes that have NOT failed" must not be reported as failed.
    return bool(match and not re.search(r'\b(?:not|never|without)\b', match.group(), re.IGNORECASE))


def incident(incident_id: str) -> dict | None:
    if incident_id == FINANCIAL_ID:
        from copy import deepcopy
        return deepcopy(FINANCIAL)
    return get_incident(incident_id)

def scenarios() -> list[dict]:
    return [{
        'id':x['id'],'title':x['title'],'summary':x['summary'],
        'system':x['system'],'synthetic':True,'status':x['status'],
        'severity':x['severity'],'type':('financial_hardware_failure'
                   if x['id']==FINANCIAL_ID else 'original_training_incident'),
    } for x in list_incidents()+[FINANCIAL]]

def _records(item:dict,adapter:str)->list[dict]:
    if adapter in ('ems','ems_pathway'):
        events=item['events']
        if adapter=='ems_pathway':
            events=[e for e in events if 'pathway' in
                    (e['message']+' '+e['source']).lower()]
        return [{**e,'official_hpe_message_number':None} for e in events]
    if adapter=='asap':
        return [{'id':f"SIM-ASAP-{item['id']}-{i+1:02d}",
                 **m,'provenance':'fictional metric, not authenticated ASAP'}
                for i,m in enumerate(item['metrics'])]
    if adapter=='guardian':
        return ([{'id':'SIM-PROC-301','process':'PAYMENT-WORKER-P22',
                  'observed_state':'terminated_in_fictional_log',
                  'time':'01:17','event_id':'SIM-EVT-305',
                  'provenance':'synthetic process audit, not Guardian output'}]
                if item['id']==FINANCIAL_ID else [])
    if adapter=='pathcom':
        # Unlike live PATHCOM, only illustrative source records are available.
        # Never fabricate a PATHCOM STATUS result.
        return []
    if adapter=='scf':
        return []
    return []

def _source_record(item:dict,adapter:str,records:list[dict],manual_url:str|None=None)->dict:
    return {
        'adapter':adapter,'transport':'local_fixture_adapter',
        'connected_to_live_hpe':False,'mode':'synthetic_fixture_not_native_output',
        'reference_url':manual_url,
        'target_release_verified':False,'actual_tool_status': 'unknown',
        'data_status':'synthetic_observations' if records else 'unknown',
        'observations':records,
        'evidence_ids':[r['id'] for r in records if isinstance(r.get('id'),str) and r['id'].startswith('SIM-EVT-')],
        'retrieved_at':datetime.now(timezone.utc).isoformat(),
        'time_scope':'fixed_fictional_shift_not_live_last_hour',
        'source_authenticity_verified':False,
    }

def _correlate(item:dict)->dict:
    evidence=[e['id'] for e in item['events']]
    return {
        'status':'hypothesis_only_no_causal_proof',
        'ordered_evidence':[{'id':e['id'],'time':e['time'],'observation':e['message'],
                             'source':e['source']} for e in item['events']],
        'hypotheses':item['hypotheses'],
        'unknowns':item['unknowns'],
        'conclusion':('The listed synthetic signals occurred in sequence. '
                      'The records do not prove one event caused another.'),
        'evidence_ids':evidence,
        'recommended_next':('Review authorized source records, verify dependencies '
                            'and escalation policy; do not restart or fail over blindly.'),
        'root_cause_confirmed':False,
    }

def _normalize(value:str)->str:
    return re.sub(r'\s+',' ',value.strip().upper())

def command(incident_id:str,text:str)->dict:
    item=incident(incident_id)
    if item is None:
        raise LookupError('Unknown incident')
    if not 3<=len(text)<=500 or any(x in text for x in (';', '\n','\r','&&','||','|','`')):
        raise ValueError('Unsupported or compound command/question')
    cleaned=_normalize(text)
    base={
        'incident_id':item['id'],'input':text,'synthetic':True,
        'mode':'read_only_simulation','execution_allowed':False,
        'state_change_executed':False,'live_connected':False,
        'source_authenticity_verified':False,
    }
    if PROHIBITED.search(cleaned):
        return {**base,'status':'blocked_unsafe','adapter':None,'evidence':None,
                'reason':'Potential state-changing or destructive wording is not supported.'}
    # Exact CAIL UI intents are already matched above. Only native STATUS
    # syntax is treated as a strict command; "Check ..." and "Show me ..."
    # remain natural-language requests, including cross-incident hints.
    is_command=cleaned.startswith('STATUS ')
    target=None
    mode=None
    manual=None
    if cleaned in NATIVE:
        cfg=NATIVE[cleaned]
        if item['id'] not in cfg['allowed_incidents']:
            return {**base,'status':'context_mismatch','adapter':None,'evidence':None,
                    'suggested_incident_id':('INC-PATH-002' if cfg['adapter']=='pathcom'
                                             else 'INC-DISK-001'),
                    'reason':'Native reference belongs to a different incident/subsystem.'}
        target=cfg['adapter'];manual=cfg['manual_url'];mode='hpe_command_reference_only'
    elif cleaned in UI_ACTIONS:
        target=UI_ACTIONS[cleaned];mode='cail_simulated_interface_intent'
    elif is_command:
        return {**base,'status':'unsupported_command','adapter':None,'evidence':None,
                'reason':'Not an allowlisted native reference or local read-only UI intent.'}
    else:
        lower=text.lower()
        # Strong subsystem hints override generic words and prevent mistaken
        # disk-status recommendations for Pathway-specific questions.
        if any(x in lower for x in ('pathcom','pathmon','pathway server','serverclass')):
            if item['id']=='INC-DISK-001':
                return {**base,'status':'context_mismatch','adapter':None,'evidence':None,
                        'suggested_incident_id':'INC-PATH-002',
                        'reason':'PATHCOM/Pathway question does not match selected disk incident.'}
            target='pathcom'
        elif 'disk' in lower and item['id']=='INC-PATH-002':
            return {**base,'status':'context_mismatch','adapter':None,'evidence':None,
                    'suggested_incident_id':'INC-DISK-001',
                    'reason':'Disk command request does not match selected Pathway incident.'}
        if target is None:
            # "Failed processes" and "processes that have failed" map to
            # the same read-only simulated process-audit adapter.
            if _is_failed_process_question(lower):
                target='guardian'
            else:
                for tool,keywords in SEMANTIC:
                    if tool=='ems_pathway':
                        if all(k in lower for k in keywords):
                            target=tool;break
                    elif any(k in lower for k in keywords):
                        target=tool;break
        if not target:
            return {**base,'status':'needs_clarification','adapter':None,'evidence':None,
                    'reason':'No registered read-only tool matches the question. Ask about health, CPU, disks, process, EMS, Pathway or correlation.'}
        mode='bounded_natural_language_to_simulated_adapter'
    if target=='health':
        observations=[indicator(item)]
    elif target=='correlation':
        observations=[]
    else:
        observations=_records(item,target)
    if mode=='hpe_command_reference_only':
        # Never imply that command syntax is a query to a real subsystem.
        observations=[]
    result=_source_record(item,target,observations,manual)
    return {
        **base,'status':('reference_only_unknown_status' if mode=='hpe_command_reference_only'
                        else 'synthetic_result' if observations or target in ('health','correlation')
                        else 'no_matching_observation'),
        'route_kind':mode,'adapter':target,'evidence':result,
        'correlation':_correlate(item) if target=='correlation' else None,
        'interpretation':(
            'HPE syntax reference only; target release, role and actual status are unknown.'
            if mode=='hpe_command_reference_only' else
            'Review the invented source records. Data chronology suggests investigation priorities but cannot prove a cause.'
            if observations else
            'No authenticated status observation is available. The condition remains UNKNOWN.'),
        'recommended_next':'Use the Guided Playbook and preserve evidence; consult the authorized operator before state changes.',
        'operator_approval_required_for_action':True,
    }

def shift_summary() -> dict:
    items=list_incidents()+[FINANCIAL]
    return {
        'synthetic':True,'live_connected':False,'generated_at':datetime.now(timezone.utc).isoformat(),
        'source_kind':'curated_synthetic_shift_fixtures',
        'event_count':sum(len(x['events']) for x in items),
        'incident_count':len(items),'unresolved_count':len(items),
        'approved_resolutions_reported':0,
        'documented_process_restarts':None,
        'actual_cpu_normality_confirmed':False,
        'no_expand_failures_verified':False,
        'sections':[{
            'incident_id':x['id'],'title':x['title'],
            'severity':x['severity'],'observations':[e['message'] for e in x['events']],
            'evidence_ids':[e['id'] for e in x['events']],
            'missing':x['unknowns'],
            'recommendation':'Verify source status, ownership and dependencies before action.'
        } for x in items],
        'handover':'All three simulated cases are open; no root cause or production recovery is confirmed.',
        'limitation':'Not a real overnight report; no external logs or actual operator sign-off.',
    }

def evaluation_protocol()->dict:
    return {
        'synthetic':True,'measurement_status':'not_yet_measured',
        'scenarios': [x['id'] for x in list_incidents()+[FINANCIAL]],
        'procedure':[
            'Recruit participants with permission and consent; record role and prior NonStop familiarity without storing personal data.',
            'Assign the same synthetic scenario once with a static evidence pack and once with CAIL; counterbalance order.',
            'Start a stopwatch at incident presentation; stop at a cited, safe next-step decision.',
            'Record elapsed seconds, supported evidence identifiers, unsafe proposals, and missing-condition acknowledgment.',
            'Use a second independent reviewer; never claim actual MTTR reduction from these fictional cases.',
        ],
        'metrics':['time_to_evidence_seconds','time_to_safe_decision_seconds',
                   'supported_evidence_count','unsafe_action_count',
                   'unknowns_acknowledged','participant_feedback_1_to_5'],
        'real_world_mttr_claim_allowed':False,
    }


def tool_capabilities()->dict:
    """Tell the trainee which adapters have *synthetic* data or no data at all."""
    tools=[
        ('EMS','ems','fixture_observations','Event chronology and synthetic alerts'),
        ('ASAP','asap','fixture_observations','Synthetic metrics and baselines'),
        ('Guardian','guardian','fixture_observations','Invented process exit records for financial case'),
        ('PATHCOM / Pathway','pathcom','manual_reference_only','Documented STATUS syntax; native output unavailable'),
        ('SCF','scf','manual_reference_only','Documented disk STATUS syntax; native output unavailable'),
        ('TACL','tacl','not_connected','No authenticated shell or TACL session'),
        ('OSS','oss','not_connected','No authenticated OSS process or logs'),
        ('Expand','expand','not_connected','No cross-node network-status feed'),
        ('Spoolers','spooler','not_connected','No print/queue subsystem output'),
        ('Communications','comms','not_connected','No communications subsystem feed'),
        ('Application logs','app_logs','not_connected','No customer application log access'),
    ]
    return {
        'mode':'synthetic_compatibility_layer','real_cail_suite_integration':False,
        'native_command_execution':False,'data_origin':'curated_local_fixtures',
        'tools':[{
            'name':name,'adapter_id':key,'availability':status,
            'purpose':purpose,'live_connected':False,
        } for name,key,status,purpose in tools],
        'next_integration_step':'Obtain authorized CAIL Suite/test NonStop interfaces, release details, and security review before any live adapter.',
    }
