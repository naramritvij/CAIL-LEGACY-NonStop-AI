"""Sponsor ATM demo: fictional locations, read-only investigation, approved knowledge."""
from __future__ import annotations
from .operations_lab import FINANCIAL_ID, FINANCIAL, PROHIBITED, command
from .legacy_tree import build_legacy_tree

SITES = [
    {'id':'ATM-011','location':'South Market','zone':'South','x':15,'y':70,'status':'nominal'},
    {'id':'ATM-017','location':'Civic Square','zone':'Central','x':30,'y':40,'status':'nominal'},
    {'id':'ATM-025','location':'West Gateway','zone':'West','x':12,'y':20,'status':'nominal'},
    {'id':'ATM-031','location':'Riverside','zone':'East','x':77,'y':29,'status':'nominal'},
    {'id':'ATM-042','location':'North Exchange','zone':'North','x':62,'y':65,'status':'attention'},
    {'id':'ATM-058','location':'Harbour Point','zone':'East','x':89,'y':79,'status':'nominal'},
]
SITE_EVENT = {'id':'SIM-ATM-042-001','source':'fictional_atm_heartbeat','time':'01:18',
              'message':'Synthetic missed heartbeat for ATM-042; real reachability unknown.'}
EXAMPLES = [
    {'id':'DEMO-EX-01','title':'Fictional payment timeout example',
     'shared_signals':['Pathway warnings','payment latency'],
     'expert_approach':'Compare synthetic events and performance; verify process dependencies.',
     'status':'unreviewed_fiction_not_an_actual_resolution'},
    {'id':'DEMO-EX-02','title':'Fictional terminal heartbeat example',
     'shared_signals':['unreachable terminal','network monitoring'],
     'expert_approach':'Verify heartbeat collection, then request approved network-status checks.',
     'status':'unreviewed_fiction_not_an_actual_resolution'},
]
FRONTLINE = [
    {'title':'Identify the affected terminal',
     'instruction':'The fictional North Exchange ATM-042 has a missed heartbeat. Confirm the identifier; do not assume all ATMs are down.',
     'evidence_ids':['SIM-ATM-042-001']},
    {'title':'Explain the customer impact carefully',
     'instruction':'Share the demo warning with operations support. Payment performance is degraded in synthetic monitoring, but the link to this ATM is unproven.',
     'evidence_ids':['SIM-ATM-042-001','SIM-EVT-304']},
    {'title':'Escalate for a verified safe response',
     'instruction':'Ask the authorized engineer to check actual reachability, dependencies and the approved runbook. Do not attempt a restart.',
     'evidence_ids':['SIM-EVT-303']},
]
ENGINEER = [
    {'title':'Correlate source observations',
     'instruction':'Inspect synthetic hardware, CPU, Pathway, transaction and process events SIM-EVT-301..305 with the ATM heartbeat. Sequence is not a causal diagnosis.',
     'evidence_ids':['SIM-ATM-042-001','SIM-EVT-301','SIM-EVT-304']},
    {'title':'Verify actual subsystem state before remediation',
     'instruction':'HPE PATHCOM reference STATUS PATHWAY is display-only. Confirm TS/MP version, PATHMON target and privileges before any authorized human query.',
     'evidence_ids':['SIM-EVT-303']},
    {'title':'Check dependencies and escalation gates',
     'instruction':'Obtain authenticated process, network, terminal and primary/backup status; follow site policy. No automatic failover or restart is permitted.',
     'evidence_ids':['SIM-EVT-305']},
]

def approved_matches():
    tree = build_legacy_tree('INC-PATH-002')
    assert tree['review_scope'] == 'approved_only'
    return [{
        'lesson_id': n['id'], 'title': n['title'],
        'reasoning_preview': n['reasoning_preview'],
        'review_status': n['review_status'],
        'reviewed_at': n['reviewed_at'],
        'evidence_ids': n['source_event_ids'],
        'match_reason':'Shares a fictional Pathway event family; not a verified ATM fix.',
        'relation_verified':False,
    } for n in tree['nodes'][:10]]

def network():
    return {
        'product_name':'CAIL / Nonstop AI Operations Assistant',
        'mode':'synthetic_location_schematic',
        'map_type':'fictional_district_plan_not_real_world_geolocation',
        'sites': [{**s,'live_connected':False} for s in SITES],
        'attention_count':1, 'site_event':SITE_EVENT,
        'approved_knowledge_matches':approved_matches(),
        'fictional_history_examples':EXAMPLES,
        'tools':[{'name':name,'mode':mode,'connected':False} for name,mode in [
            ('EMS','synthetic_fixture'),('ASAP','synthetic_fixture'),
            ('Guardian','synthetic_fixture'),('PATHCOM','HPE_reference_only'),
            ('CAIL Suite','not_connected')]],
        'production_connectivity':False,
        'limitations':'All locations, ATM incidents, metrics and example history are fictional.',
    }

def _intent(question):
    """Conservative glossary of allowed operator questions, not general AI intent."""
    text=question.lower()
    if any(word in text for word in ('last time','previous','similar','knowledge','resolved','history','expert')):
        return 'retrieve_knowledge'
    if any(word in text for word in ('ems','asap','pathcom','cpu','process','metrics','log',
                                     'diagnose','cause','status','latency','evidence')):
        return 'investigate'
    if any(word in text for word in ('where','which atm','locate','map','position')):
        return 'locate'
    if any(word in text for word in ('atm','terminal','payment','outage','down','broken',
                                     'not responding','what should','what do','help')):
        return 'assist'
    return 'needs_clarification'


def assist(atm_id, audience, question):
    site = next((s for s in SITES if s['id']==atm_id),None)
    if site is None: raise LookupError('Unknown fictional ATM')
    if audience not in ('frontline','engineer'): raise ValueError('Invalid explanation role')
    if not 3 <= len(question) <= 500 or any(x in question for x in (';','|','\n','\r',chr(96),'&&')):
        raise ValueError('Unsupported operator input')
    detected = __import__('re').search(r'\bATM-[0-9]{3}\b', question.upper())
    common = {'atm_id':atm_id,'audience':audience,'synthetic':True,
              'production_connectivity':False,'execution_allowed':False,
              'state_change_executed':False}
    if detected and detected.group() != atm_id:
        return {**common,'status':'context_mismatch','headline':'ATM ID does not match selection',
                'explanation':'Select the requested ATM before examining its evidence.',
                'steps':[],'source_previews':[],'approved_knowledge_matches':[],
                'unknowns':['Correct target ATM']}
    if PROHIBITED.search(question):
        return {**common,'status':'blocked_unsafe','headline':'Action not authorized',
                'explanation':'CAIL does not execute or approve modifications.',
                'steps':[],'source_previews':[],'approved_knowledge_matches':[],'unknowns':['Approved recovery plan']}
    intent=_intent(question)
    if intent=='needs_clarification':
        return {**common,'status':'needs_clarification',
                'headline':'Please describe the ATM symptom or information needed',
                'explanation':'Ask which ATM is affected, request monitoring evidence, or ask for relevant reviewed lessons.',
                'steps':[],'source_previews':[],'approved_knowledge_matches':[],
                'unknowns':['Unspecified operator intent']}
    if site['status']!='attention':
        return {**common,'status':'no_synthetic_incident','headline':'No demo alert at '+atm_id,
                'explanation':'This only describes the fictional fixture; actual health is unknown.',
                'steps':[],'source_previews':[],'approved_knowledge_matches':[],'unknowns':['Real ATM status']}
    commands = ['SHOW ALERTS','SHOW CPU METRICS','SHOW FAILED PROCESSES','STATUS PATHWAY']
    routed = [command(FINANCIAL_ID,text) for text in commands]
    assert all(x['execution_allowed'] is False and x['live_connected'] is False
               and x['state_change_executed'] is False for x in routed)
    return {
        **common,'status':'guided_synthetic_investigation',
        'interpreted_intent':intent,
        'routing_basis':'bounded_operator_vocabulary_not_unrestricted_llm',
        'headline':('ATM-042 needs operator attention' if audience=='frontline'
                    else 'ATM-042 heartbeat loss and payment-system degradation'),
        'explanation':('A synthetic ATM heartbeat was missed and synthetic payment metrics worsened. '
                       'We do not know whether these observations share a cause.'
                       if audience=='frontline' else
                       'Fictional terminal heartbeat and backend hardware, CPU, Pathway, '
                       'transaction and process signals occurred near one another; causality is unverified.'),
        'site_event':SITE_EVENT,
        'steps': FRONTLINE if audience=='frontline' else ENGINEER,
        'source_previews':[{
            'input':query,'adapter':out['adapter'],'route_kind':out['route_kind'],
            'status':out['status'],'evidence_origin':out['evidence']['transport'],
            'native_tool_status':out['evidence']['actual_tool_status'],
            'observations':out['evidence']['observations'],
            'connected':False,
        } for query,out in zip(commands,routed)],
        'approved_knowledge_matches':approved_matches(),
        'fictional_history_examples':EXAMPLES,
        'unknowns':FINANCIAL['unknowns']+['Real ATM heartbeat','Actual terminal location'],
        'knowledge_gate':'A lesson requires independent reviewer approval before retrieval.',
    }
