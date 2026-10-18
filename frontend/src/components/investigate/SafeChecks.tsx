import { useState } from 'react'
import { ShieldCheck, Terminal, AlertTriangle } from 'lucide-react'
import { workflowRequest, type SafePreview } from '@/api/workflows'

const LABELS: Record<string,string> = {
  inspect_disk_growth:'Inspect disk trends and file metadata',
  inspect_events:'Review recent synthetic event timeline',
}
export function SafeChecks({ actionIds, incidentId }: {actionIds:string[];incidentId:string}) {
  const [selected,setSelected] = useState<string[]>(actionIds)
  const [results,setResults] = useState<SafePreview[]>([])
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  async function preview() {
    setBusy(true);setError('');setResults([])
    try {
      const output:SafePreview[]=[]
      for (const id of selected) {
        // Every preview is independently re-evaluated by the backend default-deny policy.
        const result=await workflowRequest<SafePreview>('/diagnostics/preview','POST',{incident_id:incidentId,action_id:id})
        output.push(result)
      }
      setResults(output)
    } catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  return <section aria-label="Recommended safe checks" className="glass p-5">
    <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-teal"/><h2 className="text-lg font-semibold">Recommended safe checks</h2></div>
    <p className="mt-2 text-xs text-ink-muted">Preview synthetic results only. No NonStop shell, SCF or TACL command is executed.</p>
    {actionIds.length===0?<p className="mt-4 text-sm text-ink-muted">No read-only checks are suggested for this incident.</p>:
      <div className="mt-4 flex flex-col gap-2">
        {actionIds.map(id=><label key={id} className="neu-inset flex items-center gap-3 rounded-lg p-3 text-sm">
          <input type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>
          {LABELS[id]??id}</label>)}
        <button type="button" disabled={!selected.length || busy} onClick={()=>void preview()} className="btn-primary mt-2 flex items-center justify-center gap-2 rounded-xl p-3 text-sm disabled:opacity-50"><Terminal className="size-4"/>{busy?'Checking policy…':`Preview ${selected.length} selected read-only check(s)`}</button>
      </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-coral">{error}</p>}
    {results.map(item=><article key={item.action_id} className="glass-sub mt-3 p-3 text-xs">
      <p className="font-semibold">{LABELS[item.action_id]??item.action_id}: {item.status}</p>
      <p className="mt-1 text-ink-muted">{item.reason}</p>
      {item.allowed&&item.simulation_only&&item.output?<div className="mt-2 text-ink-muted">
        <p>Evidence: {item.output.event_ids.join(', ')}</p>
        <p>Unverified: {item.output.unverified_conditions.join('; ')}</p>
      </div>:<p className="mt-2 inline-flex items-center gap-2 text-coral"><AlertTriangle className="size-3"/> Blocked; no output or state change.</p>}
    </article>)}
  </section>
}
