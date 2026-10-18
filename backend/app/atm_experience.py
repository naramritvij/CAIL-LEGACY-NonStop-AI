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
    if any(word in text for word in ('last time','previous','similar','knowledge','resolved','history','expert',
                                      'what did we learn','lesson','mentor','decision dna','reviewed')):
        return 'retrieve_knowledge'
    if any(word in text for word in ('ems','asap','pathcom','cpu','process','metrics','log',
                                     'diagnose','cause','status','latency','evidence',
                                     'why is','why did','what happened','root cause','health check')):
        return 'investigate'
    if any(word in text for word in ('where','which atm','locate','map','position')):
        return 'locate'
    if any(word in text for word in ('atm','terminal','payment','outage','down','broken',
                                     'not responding','what should','what do','help',
                                     'cash','withdraw','dispens','machine','card',
                                     'not working','offline','issue','problem',
                                     'explain','technically','engineer','next step','why')):
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
    # Not every question is a request for a full investigation. Give the
    # operator exactly the kind of answer requested, with only relevant panels.
    site_name = site['location']
    reviewed = approved_matches()
    if intent == 'locate':
        headline = 'Fictional alert located: ATM-042 at '+site_name
        explanation = (
            'ATM-042 at fictional North Exchange (North district) is the only '
            'one of six demo terminals flagged for a missed heartbeat at 01:18 '
            '(SIM-ATM-042-001). This is a schematic location, NOT a real street '
            'address or proof the physical terminal is offline.'
        )
        steps = [
            {'title':'Pinpoint the training alert',
             'instruction':'The red pin marks ATM-042 in the fictional North district; the five green pins have no demo alert.',
             'evidence_ids':['SIM-ATM-042-001']},
            {'title':'Confirm on an authorized system',
             'instruction':'Real location, reachability and customer impact remain UNKNOWN until a real operator checks authorized records.',
             'evidence_ids':['SIM-ATM-042-001']},
        ]
        commands = []
        unknowns = ['Actual ATM location','Real terminal reachability']
    elif intent == 'retrieve_knowledge':
        if reviewed:
            headline = 'Reviewed lessons available, but not verified ATM repairs'
            explanation = (
                'CAIL found '+str(len(reviewed))+' independently approved local '
                'Pathway training lesson(s). Each shows reviewer-accepted reasoning '
                'and source event IDs. Their connection to ATM-042 remains UNVERIFIED; '
                'none establishes a successful ATM repair. See the lesson cards below.'
            )
        else:
            headline = 'No independently approved previous ATM resolution'
            explanation = (
                'There is no reviewer-approved matching Decision DNA in this '
                'isolated training database. Two fictional historical examples '
                'can illustrate how an expert might investigate, but neither '
                'is an actual previous fix or an approved lesson. CAIL will '
                'not pretend it has solved this before.'
            )
        steps = [
            {'title':'Check independently reviewed knowledge',
             'instruction':'Only lessons accepted by a separate reviewer can appear as reusable Decision DNA.',
             'evidence_ids':[]},
            {'title':'Treat illustrative examples as examples',
             'instruction':'Do not use unreviewed fictional cases as a confirmed fix. A new lesson requires evidence and a distinct reviewer approval.',
             'evidence_ids':[]},
        ]
        commands = []
        unknowns = ['Whether any reviewed Pathway lesson applies to this ATM']
    elif intent == 'investigate':
        headline = ('What synthetic monitoring actually shows for ATM-042'
                    if audience == 'frontline' else
                    'ATM-042: EMS / ASAP / Guardian evidence, PATHCOM UNKNOWN')
        explanation = (
            'The demo logs show a missed terminal heartbeat (01:18), '
            'CPU 3 at 94%, payment response latency of 980 ms and payment '
            'success at 89%. EMS, ASAP and Guardian below are LOCAL '
            'SIMULATED observations, not authenticated monitoring output. '
            'PATHCOM returned no live data. None of this proves the terminal '
            'heartbeat and payment slowdown share a root cause.'
            if audience == 'frontline' else
            'Synthetic event sequence: capacity reduction SIM-EVT-301 (01:08), '
            'CPU 3 at 94% SIM-EVT-302 (01:11), Pathway warning SIM-EVT-303 '
            '(01:13), transaction latency 980 ms / success 89% SIM-EVT-304 '
            '(01:15), worker exit SIM-EVT-305 (01:17), and ATM heartbeat '
            'SIM-ATM-042-001 (01:18). See EMS/ASAP/Guardian fixtures below; '
            'real PATHCOM state is UNKNOWN. Temporal association is not causation.'
        )
        steps = [
            {'title':'Inspect simulated alerts and metrics',
             'instruction':'Expand EMS and ASAP snapshots to inspect the fictional observations and their timestamps.',
             'evidence_ids':['SIM-EVT-301','SIM-EVT-302','SIM-EVT-304']},
            {'title':'Compare process and Pathway signals',
             'instruction':'Review the fictional worker exit; PATHCOM is only a manual reference, not a successful live status query.',
             'evidence_ids':['SIM-EVT-303','SIM-EVT-305']},
            {'title':'Verify before diagnosing',
             'instruction':'An authorized engineer would need actual reachability, dependency and server-class telemetry before claiming a root cause.',
             'evidence_ids':['SIM-ATM-042-001']},
        ]
        commands = ['SHOW ALERTS','SHOW CPU METRICS','SHOW FAILED PROCESSES','STATUS PATHWAY']
        unknowns = FINANCIAL['unknowns']+['Real ATM heartbeat']
    else:
        headline = ('Next safe actions for a frontline ATM operator' if audience=='frontline'
                    else 'Engineer triage checklist for synthetic ATM-042')
        explanation = (
            'For the fictional ATM-042 at North Exchange: identify the red '
            'terminal, share the missed-heartbeat alert with operations, and '
            'ask an authorized engineer to verify reachability. Do not reset '
            'the terminal or tell customers a root cause is confirmed.'
            if audience=='frontline' else
            'For synthetic ATM-042: compare the 01:18 heartbeat with the '
            '01:08–01:17 fictional backend events; request actual terminal, '
            'network, process and PATHMON status through approved channels. '
            'Do not restart or fail over without authorization.'
        )
        steps = FRONTLINE if audience=='frontline' else ENGINEER
        commands = ['SHOW ALERTS','SHOW CPU METRICS','SHOW FAILED PROCESSES','STATUS PATHWAY']
        unknowns = FINANCIAL['unknowns']+['Real ATM heartbeat','Actual terminal location']

    routed = [command(FINANCIAL_ID, text) for text in commands]
    assert all(x['execution_allowed'] is False and x['live_connected'] is False
               and x['state_change_executed'] is False for x in routed)
    return {
        **common,'status':'guided_synthetic_investigation',
        'interpreted_intent':intent,
        'routing_basis':'bounded_operator_vocabulary_not_unrestricted_llm',
        'headline':headline,
        'explanation':explanation,
        'site_event':SITE_EVENT,
        'steps':steps,
        'source_previews':[{
            'input':query,'adapter':out['adapter'],'route_kind':out['route_kind'],
            'status':out['status'],'evidence_origin':out['evidence']['transport'],
            'native_tool_status':out['evidence']['actual_tool_status'],
            'observations':out['evidence']['observations'],
            'connected':False,
        } for query,out in zip(commands,routed)],
        'approved_knowledge_matches':reviewed,
        'fictional_history_examples':EXAMPLES,
        'unknowns':unknowns,
        'knowledge_gate':'A lesson requires independent reviewer approval before retrieval.',
    }


# Ask CAIL chat-to-visualization: bounded router, never LLM-authorized tooling.
import re

_ATM_TERMS = (
    'atm', 'cash machine', 'cash dispenser', 'cashpoint', 'cash point',
    'terminal', 'cash withdrawal', 'card stuck', 'dispense cash', 'bank machine',
    'broken machine', 'north exchange', 'south market', 'civic square',
    'west gateway', 'riverside', 'harbour point',
)
_TECH_TERMS = (
    'pathcom','pathmon','ems','asap','scf','tacl','cpu','latency',
    'process','server class','serverclass','metrics','logs',
    'network path','dependency','read-only status','trace','technical',
)

def chat(question: str, audience_mode: str = 'auto',
         selected_atm_id: str | None = None) -> dict:
    """Turn one operator message into a safe inline visualization response.

    Context is only a previously selected synthetic ATM ID supplied by client.
    No conversation text is used for command execution or privileged retrieval.
    """
    if not 3 <= len(question.strip()) <= 500:
        raise ValueError('Provide a 3-500 character question')
    if any(x in question for x in (';', '|', '\n', '\r', chr(96), '&&')):
        raise ValueError('Compound or executable-syntax requests are unsupported')
    if audience_mode not in ('auto', 'frontline', 'engineer'):
        raise ValueError('Unknown explanation mode')
    known = {s['id'] for s in SITES}
    if selected_atm_id is not None and selected_atm_id not in known:
        raise ValueError('Selected ATM is not in the fictional registry')
    lower = question.lower()
    explicit = re.search(r'\bATM-[0-9]{3}\b', question.upper())
    atm_topic = (explicit is not None or
                 bool(re.search(r'\bATM\b', question, re.IGNORECASE)) or
                 any(term in lower for term in _ATM_TERMS if term != 'atm'))
    if not atm_topic and selected_atm_id is None:
        return {
            'status':'out_of_scope','synthetic':True,
            'mode':'local_rule_based_atm_router','production_connectivity':False,
            'execution_allowed':False,'state_change_executed':False,
            'answer':'This chat is connected only to the fictional ATM incident demonstration. Ask which ATM has an alert or describe a cash-machine symptom.',
            'selected_atm_id':None,'audience':None,
            'network':None,'investigation':None,'map_triggered':False,
        }
    atm_id = (explicit.group() if explicit else
              selected_atm_id if selected_atm_id else
              next((s['id'] for s in SITES if s['status']=='attention'), None))
    if atm_id not in known:
        return {
            'status':'unknown_atm','synthetic':True,
            'mode':'local_rule_based_atm_router','production_connectivity':False,
            'execution_allowed':False,'state_change_executed':False,
            'answer':'That ATM identifier is not in the six-site fictional training map.',
            'selected_atm_id':None,'audience':None,
            'network':None,'investigation':None,'map_triggered':False,
        }
    role = (audience_mode if audience_mode != 'auto'
            else 'engineer' if any(term in lower for term in _TECH_TERMS)
            else 'frontline')
    result = assist(atm_id, role, question)
    # The map must NOT appear after an unsafe question. An unsupported input
    # must not appear to have triggered a fresh valid diagnosis.
    show_map = result['status'] in ('guided_synthetic_investigation',
                                    'no_synthetic_incident')
    network_data = network() if show_map else None
    return {
        'status':'atm_visual_response' if show_map else result['status'],
        'synthetic':True,'mode':'local_rule_based_atm_router',
        'production_connectivity':False,
        'execution_allowed':False,'state_change_executed':False,
        'answer':result['explanation'],
        'selected_atm_id':atm_id,'audience':role,
        'audience_basis':('explicit_operator_selection' if audience_mode != 'auto'
                          else 'bounded_technical_vocabulary' if role=='engineer'
                          else 'default_plain_language'),
        'network':network_data,'investigation':result,
        'map_triggered':show_map,
    }
