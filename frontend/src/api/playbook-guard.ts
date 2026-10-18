/** Fail closed on untrusted playbook API payloads, including fake execution flags. */
type Dict = Record<string, unknown>
function obj(value:unknown): Dict{
  if (!value||typeof value!=='object'||Array.isArray(value))throw new Error('Unsafe command playbook: invalid object')
  return value as Dict
}
function list(value:unknown): unknown[]{
  if (!Array.isArray(value))throw new Error('Unsafe command playbook: expected list')
  return value
}
const manuals=new Set([
  'STATUS DISK $DATA03','STATUS PATHWAY','STATUS SERVER <serverclass>, DETAIL',
])
const intents=new Set(['show_alerts','open_asap'])
const evidencePattern=/^SIM-EVT-[0-9]+$/
export function assertSafePlaybook(value:unknown): void{
  const data=obj(value)
  if(data.mode!=='synthetic_guidance_no_command_execution'||
    data.release_verified!==false||data.operator_authorized!==false||
    data.manual_references_verified_for_specific_release!==false){
      throw new Error('Unsafe command playbook: missing simulation/release safeguards')
  }
  const steps=list(data.steps)
  if(steps.length<1||steps.length>20)throw new Error('Unsafe command playbook: unexpected step count')
  const seen=new Set<string>()
  for(const value of steps){
    const step=obj(value), kind=step.kind
    if(typeof step.id!=='string'||!(/^[a-z0-9-]+$/).test(step.id)||seen.has(step.id))
      throw new Error('Unsafe command playbook: bad step identifier')
    seen.add(step.id)
    if(step.synthetic!==true||step.execution_allowed!==false||
      step.state_change_executed!==false||step.command_applicability_verified!==false)
      throw new Error('Unsafe command playbook: suspicious execution/applicability flags')
    const evidences=list(step.event_ids)
    if(!evidences.every(e=>typeof e==='string'&&evidencePattern.test(e)))
      throw new Error('Unsafe command playbook: unregistered-looking evidence')
    const refs=list(step.references)
    for(const r of refs){
      const reference=obj(r)
      if(typeof reference.url!=='string'||!/^https:\/\/support\.hpe\.com\/hpesc\/public\/docDisplay\?/.test(reference.url))
        throw new Error('Unsafe command playbook: unexpected reference URL')
    }
    if(kind==='manual_reference'){
      if(typeof step.command!=='string'||!manuals.has(step.command)||
        step.local_intent!==null||refs.length===0)
        throw new Error('Unsafe command playbook: unknown manual command')
    }else if(kind==='local_preview'){
      if(step.command!==null||typeof step.local_intent!=='string'||!intents.has(step.local_intent))
        throw new Error('Unsafe command playbook: unknown local preview intent')
    }else if(kind==='checklist'){
      if(step.command!==null||step.local_intent!==null)
        throw new Error('Unsafe command playbook: unexpected checklist command')
    }else throw new Error('Unsafe command playbook: unrecognized step type')
  }
}
