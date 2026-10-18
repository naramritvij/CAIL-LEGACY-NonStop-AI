/** ATM WOW trust boundary. No browser visualization may claim live telemetry. */
type Obj = Record<string, unknown>
function record(v:unknown):Obj{
  if(v===null||typeof v!=='object'||Array.isArray(v))
    throw new Error('Invalid ATM data shape')
  return v as Obj
}
export function assertSyntheticAtmNetwork(value:unknown):void{
  const data=record(value)
  if(data.production_connectivity!==false||
    data.mode!=='synthetic_location_schematic'||
    data.map_type!=='fictional_district_plan_not_real_world_geolocation')
    throw new Error('ATM locator cannot claim real geospatial or live connectivity')
  if(!Array.isArray(data.sites)||data.sites.length<2||data.sites.length>20)
    throw new Error('Unexpected ATM demo site list')
  const ids=new Set<string>()
  let problems=0
  for(const value of data.sites){
    const site=record(value)
    if(typeof site.id!=='string'||!/^ATM-[0-9]{3}$/.test(site.id)||ids.has(site.id))
      throw new Error('Unknown or duplicate fictional ATM')
    ids.add(site.id)
    if(site.live_connected!==false||!Number.isFinite(site.x)||!Number.isFinite(site.y)||
      Number(site.x)<0||Number(site.x)>100||Number(site.y)<0||Number(site.y)>100)
      throw new Error('Untrusted ATM source or plot position')
    if(site.status==='attention')problems++
    else if(site.status!=='nominal')throw new Error('Unsupported ATM status')
  }
  if(problems!==data.attention_count||!ids.has('ATM-042'))
    throw new Error('Synthetic ATM warning count mismatch')
  if(!Array.isArray(data.approved_knowledge_matches)||
    data.approved_knowledge_matches.some(value=>record(value).review_status!=='approved'))
    throw new Error('Unapproved knowledge exposed as reviewed')
  if(!Array.isArray(data.fictional_history_examples)||
    data.fictional_history_examples.some(value=>record(value).status!=='unreviewed_fiction_not_an_actual_resolution'))
    throw new Error('Fictional history misrepresented as approved')
}
export function assertSyntheticAtmAssist(value:unknown):void{
  const data=record(value)
  if(data.synthetic!==true||data.production_connectivity!==false||
    data.execution_allowed!==false||data.state_change_executed!==false)
    throw new Error('ATM response may not authorize native execution')
  const valid=new Set(['guided_synthetic_investigation','blocked_unsafe','no_synthetic_incident','context_mismatch','needs_clarification'])
  if(!valid.has(String(data.status)))throw new Error('Unexpected ATM response status')
  if(!Array.isArray(data.steps)||!Array.isArray(data.source_previews))
    throw new Error('Missing ATM evidence contract')
  if(['blocked_unsafe','context_mismatch','needs_clarification'].includes(String(data.status))&&
    (data.steps.length!==0||data.source_previews.length!==0))
    throw new Error('Unsafe ATM action leaked tool output')
  for(const p of data.source_previews){
    const preview=record(p)
    if(preview.connected!==false||preview.evidence_origin!=='local_fixture_adapter'||
      preview.native_tool_status!=='unknown'||!Array.isArray(preview.observations))
      throw new Error('ATM returned unauthenticated live tool claim')
    if(preview.adapter==='pathcom'&&preview.observations.length!==0)
      throw new Error('Native PATHCOM command output must remain UNKNOWN')
  }
  if(data.approved_knowledge_matches!==undefined&&
    (!Array.isArray(data.approved_knowledge_matches)||
      data.approved_knowledge_matches.some(x=>record(x).review_status!=='approved')))
    throw new Error('ATM response returned unapproved lessons as approved')
}
