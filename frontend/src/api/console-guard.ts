/** Command-to-tool UI contract: no claim of live connectivity or native execution. */
type RecordShape = Record<string,unknown>
function object(v:unknown):RecordShape{
  if(v===null||typeof v!=='object'||Array.isArray(v))
    throw new Error('Unsafe command response shape')
  return v as RecordShape
}
const allowedStatus=new Set([
  'synthetic_result','reference_only_unknown_status','blocked_unsafe',
  'unsupported_command','context_mismatch','needs_clarification',
  'no_matching_observation',
])
const adapters=new Set(['health','asap','ems','ems_pathway','guardian','scf','pathcom','correlation'])
export function assertSafeConsoleResult(input:unknown):void{
  const data=object(input)
  if(data.synthetic!==true||data.live_connected!==false||
    data.execution_allowed!==false||data.state_change_executed!==false||
    data.source_authenticity_verified!==false)
    throw new Error('Unsafe command response: live/execution/authenticity claims')
  if(typeof data.status!=='string'||!allowedStatus.has(data.status))
    throw new Error('Unsafe command response: unsupported status')
  if(data.adapter!==null&&(!adapters.has(String(data.adapter))))
    throw new Error('Unsafe command response: unregistered adapter')
  const source=data.evidence
  if(source!==null){
    const s=object(source)
    if(s.connected_to_live_hpe!==false||s.source_authenticity_verified!==false||
      s.actual_tool_status!=='unknown'||s.transport!=='local_fixture_adapter')
      throw new Error('Unsafe command response: tool source claims')
    if(!Array.isArray(s.observations)||s.observations.length>30)
      throw new Error('Unsafe command response: invalid observations')
    if(data.status==='reference_only_unknown_status'){
      if(s.observations.length!==0||
        typeof s.reference_url!=='string'||
        !s.reference_url.startsWith('https://support.hpe.com/hpesc/public/docDisplay?'))
        throw new Error('Unsafe command response: fake native command result')
    }
  } else if(data.status==='synthetic_result'||data.status==='reference_only_unknown_status'){
    throw new Error('Unsafe command response: missing registered tool source')
  }
  if(data.status==='context_mismatch' && !['INC-DISK-001','INC-PATH-002'].includes(String(data.suggested_incident_id)))
    throw new Error('Unsafe command response: invalid incident suggestion')
  if(data.status==='blocked_unsafe' && (data.adapter!==null||source!==null))
    throw new Error('Unsafe command response: blocked action returned data')
}
