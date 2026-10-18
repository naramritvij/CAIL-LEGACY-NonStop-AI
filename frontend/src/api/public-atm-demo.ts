/** Public, static, scripted ATM rehearsal. NEVER live telemetry or a model. */
type Role='auto'|'frontline'|'engineer'
const terminals=[
  {id:'ATM-011',location:'South Market',zone:'South',x:15,y:70,status:'nominal',live_connected:false},
  {id:'ATM-017',location:'Civic Square',zone:'Central',x:30,y:40,status:'nominal',live_connected:false},
  {id:'ATM-025',location:'West Gateway',zone:'West',x:12,y:20,status:'nominal',live_connected:false},
  {id:'ATM-031',location:'Riverside',zone:'East',x:77,y:29,status:'nominal',live_connected:false},
  {id:'ATM-042',location:'North Exchange',zone:'North',x:62,y:65,status:'attention',live_connected:false},
  {id:'ATM-058',location:'Harbour Point',zone:'East',x:89,y:79,status:'nominal',live_connected:false},
]
const events=[
  {id:'SIM-EVT-301',time:'01:08',source:'hardware-monitor',message:'Fictional processing node B lost capacity'},
  {id:'SIM-EVT-302',time:'01:11',source:'service-monitor',message:'Fictional CPU 3 utilization reached 94%'},
  {id:'SIM-EVT-303',time:'01:13',source:'pathway-monitor',message:'Fictional payment Pathway response warning'},
  {id:'SIM-EVT-304',time:'01:15',source:'transaction-monitor',message:'Fictional payment latency 980 ms; success rate 89%'},
  {id:'SIM-EVT-305',time:'01:17',source:'process-audit',message:'Fictional payment worker P-22 exit'},
]
const metrics=[
  {id:'SIM-ASAP-01',name:'CPU 3 utilization',value:94,unit:'%',provenance:'fictional metric, not ASAP'},
  {id:'SIM-ASAP-02',name:'Payment response latency',value:980,unit:'ms',provenance:'fictional metric, not ASAP'},
  {id:'SIM-ASAP-03',name:'Payment success rate',value:89,unit:'%',provenance:'fictional metric, not ASAP'},
]
const examples=[
  {id:'DEMO-EX-01',title:'Illustrative payment timeout',expert_approach:'Compare monitoring events and verify dependencies.',status:'unreviewed_fiction_not_an_actual_resolution'},
  {id:'DEMO-EX-02',title:'Illustrative heartbeat warning',expert_approach:'Confirm terminal reachability and network status.',status:'unreviewed_fiction_not_an_actual_resolution'},
]
const bad=/\b(?:stop|start|restart|delete|purge|alter|shutdown|kill|terminate|control|switch|format|erase|drop|chmod|execute|run|sudo|remove)\b/i
const tech=['pathcom','pathmon','ems','asap','scf','tacl','cpu','latency','process','metrics','logs','server class','technical']
const subject=['cash machine','cash dispenser','cashpoint','cash point','terminal','cash withdrawal','bank machine','broken machine','north exchange','south market','civic square','west gateway','riverside','harbour point']
const gate={synthetic:true,production_connectivity:false,execution_allowed:false,state_change_executed:false}
const record=(input:string,adapter:string,observations:Record<string,unknown>[])=>({
  input,adapter,status:adapter==='pathcom'?'reference_only_unknown_status':'synthetic_result',
  evidence_origin:'local_fixture_adapter',native_tool_status:'unknown',connected:false,observations,
})
const previews=[
  record('SHOW ALERTS','ems',events),
  record('SHOW CPU METRICS','asap',metrics),
  record('SHOW FAILED PROCESSES','guardian',[{id:'SIM-PROC-301',process:'PAYMENT-WORKER-P22',observed_state:'terminated_in_fictional_log',event_id:'SIM-EVT-305'}]),
  record('STATUS PATHWAY','pathcom',[]),
]
const step=(title:string,instruction:string,evidence_ids:string[])=>({title,instruction,evidence_ids})
function mapFixture(){
  return {product_name:'CAIL / Nonstop AI Operations Assistant',mode:'synthetic_location_schematic',
    map_type:'fictional_district_plan_not_real_world_geolocation',
    sites:terminals,attention_count:1,
    approved_knowledge_matches:[],
    fictional_history_examples:examples,
    production_connectivity:false,
    limitations:'Offline static fictional scenario. No independently approved repairs or real APIs.',
  }
}
export function publicAtmChat(question:string,choice:Role='auto',prior:string|null=null){
  const q=question.trim(), lower=q.toLowerCase()
  if(q.length<3||q.length>500||/[;|\r\n\x60]/.test(q)||q.includes('&&'))
    throw Error('Unsupported or compound operator request')
  const found=/\bATM-[0-9]{3}\b/i.exec(q)?.[0].toUpperCase()
  const names=terminals.map(t=>t.id)
  if(prior!==null&&!names.includes(prior))throw Error('Invalid selected terminal')
  const common={...gate,mode:'local_rule_based_atm_router'}
  const reply=(status:string,answer:string,id:string|null=null)=>({
    ...common,status,answer,selected_atm_id:id,audience:null,
    network:null,investigation:null,map_triggered:false,
  })
  if(!found&&!prior&&!/\bATM\b/i.test(q)&&!subject.some(s=>lower.includes(s)))
    return reply('out_of_scope','This public rehearsal covers only fictional ATM incidents. Ask which ATM is down.')
  if(found&&!names.includes(found))return reply('unknown_atm','Unknown fictional ATM identifier.')
  const id=found??prior??'ATM-042'
  if(bad.test(q))return reply('blocked_unsafe','CAIL cannot authorize or execute a restart or system modification.',id)
  const chosen=terminals.find(t=>t.id===id)
  if(!chosen)return reply('unknown_atm','Unknown fictional ATM identifier.')
  const role=choice==='auto'?(tech.some(t=>lower.includes(t))?'engineer':'frontline'):choice
  const active=chosen.status==='attention'
  const explanation=!active
    ? 'No synthetic warning is registered for '+id+'. Real health has not been checked.'
    : role==='engineer'
      ? 'Synthetic ATM heartbeat loss coincides with fictional CPU pressure, Pathway latency and process exit. Causality is not established.'
      : 'This fictional ATM missed a heartbeat while simulated payments slowed down. We have not confirmed why.'
  const steps=!active?[]:role==='frontline'?[
    step('Find the terminal','ATM-042 at fictional North Exchange is flagged. Confirm the terminal ID.',['SIM-ATM-042-001']),
    step('Describe the issue','Pass the missed heartbeat and synthetic payment warning to the duty operator.',['SIM-ATM-042-001','SIM-EVT-304']),
    step('Escalate safely','Ask the engineer to verify actual reachability. Do not restart the ATM.',['SIM-EVT-303']),
  ]:[
    step('Correlate events','Compare synthetic CPU, Pathway and payment events; temporal order does not prove cause.',['SIM-EVT-301','SIM-EVT-304']),
    step('Check PATHCOM prerequisites','STATUS PATHWAY is reference syntax only. Real PATHMON state is UNKNOWN.',['SIM-EVT-303']),
    step('Check dependencies','Verify real process, network and approved recovery prerequisites before action.',['SIM-EVT-305']),
  ]
  const investigation={
    ...gate,atm_id:id,audience:role,
    status:active?'guided_synthetic_investigation':'no_synthetic_incident',
    headline:active?'ATM-042 requires operator attention':'No fictional incident at '+id,
    explanation,steps,source_previews:active?previews:[],
    approved_knowledge_matches:[],
    unknowns:active?['Authenticated ATM heartbeat','Real PATHCOM status','Approved recovery plan']:['Actual ATM health'],
  }
  return {
    ...common,status:'atm_visual_response',answer:explanation,
    selected_atm_id:id,audience:role,
    audience_basis:choice==='auto'
      ? role==='engineer'?'bounded_technical_vocabulary':'default_plain_language'
      :'explicit_operator_selection',
    network:mapFixture(),investigation,map_triggered:true,
  }
}
