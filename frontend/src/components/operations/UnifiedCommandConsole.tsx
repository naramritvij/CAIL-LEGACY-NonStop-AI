import { useEffect, useState } from 'react'
import { Activity, ArrowRight, BookOpen, CircleAlert, FileSearch, LockKeyhole, Send, ShieldCheck, TerminalSquare } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { workflowRequest } from '@/api/workflows'
import { assertSafeConsoleResult } from '@/api/console-guard'

interface SourceResult {
  adapter: string; transport: string; connected_to_live_hpe: false
  data_status: string; actual_tool_status: string
  observations: Record<string, unknown>[]; retrieved_at: string
  reference_url: string | null; time_scope: string; source_authenticity_verified: false
}
interface CommandResult {
  incident_id: string; input: string; status: string; adapter: string | null
  route_kind?: string; evidence: SourceResult | null
  interpretation?: string; recommended_next?: string; suggested_incident_id?: string
  reason?: string; correlation?: {
    ordered_evidence: {id:string;time:string;observation:string;source:string}[]
    hypotheses: string[]; unknowns: string[]; root_cause_confirmed: false
    conclusion: string; recommended_next: string
  } | null
  execution_allowed: false; state_change_executed: false; live_connected: false
  source_authenticity_verified: false; synthetic: true
}
const SUGGESTIONS = [
  {label:'System health',command:'CHECK HEALTH'},
  {label:'EMS event history',command:'SHOW ALERTS'},
  {label:'CPU / performance',command:'Why is CPU 3 busy?'},
  {label:'Processes',command:'SHOW FAILED PROCESSES'},
  {label:'Event correlation',command:'SHOW CORRELATION'},
  {label:'Pathway status',command:'STATUS PATHWAY'},
]
export function UnifiedCommandConsole({incidentId, condensed = false}:{
  incidentId:string; condensed?:boolean
}) {
  const [value,setValue]=useState('')
  const [result,setResult]=useState<CommandResult|null>(null)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [elapsed,setElapsed]=useState<number|null>(null)
  useEffect(()=>{setValue('');setResult(null);setError('');setElapsed(null)},[incidentId])
  async function send(query:string){
    if(!query.trim()||loading)return
    setLoading(true);setError('');setResult(null)
    const start=performance.now()
    try{
      const received=await workflowRequest<CommandResult>(
        '/operations/lab/command','POST',{incident_id:incidentId,input:query.trim()},
      )
      assertSafeConsoleResult(received)
      setResult(received)
      setElapsed(Math.round(performance.now()-start))
    }catch(e){setError(String(e))}
    finally{setLoading(false)}
  }
  return <section aria-label="Unified command console" className="glass glow-cyan p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">CAIL Suite compatible · offline adapters</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold"><TerminalSquare className="size-5 text-cyan"/> Unified Command Console</h2>
        <p className="mt-2 text-sm text-ink-muted">Type an allowlisted native reference or ask in everyday language. CAIL routes to registered synthetic tool data; it does not connect to HPE.</p>
      </div>
      <span className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold"><LockKeyhole className="mr-1 inline size-4"/> Read-only simulation</span>
    </div>
    <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();void send(value)}}>
      <label className="sr-only" htmlFor={condensed?'unified-command-inline':'unified-command-lab'}>Operator command or natural-language request</label>
      <input id={condensed?'unified-command-inline':'unified-command-lab'} className="neu-inset min-w-0 flex-1 rounded-xl p-3 text-sm" value={value} maxLength={500} onChange={e=>setValue(e.target.value)} placeholder="e.g. STATUS PATHWAY or Show failed processes"/>
      <button className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-50" type="submit" disabled={!value.trim()||loading||DATA_MODE!=='http'}><Send className="size-4"/>{loading?'Routing…':'Inspect source'}</button>
    </form>
    <div className="mt-3 flex flex-wrap gap-2">
      {(condensed?SUGGESTIONS.slice(0,4):SUGGESTIONS).map(item=><button key={item.label} type="button" disabled={loading||DATA_MODE!=='http'} onClick={()=>{setValue(item.command);void send(item.command)}} className="tap rounded-lg border border-line-strong px-3 py-1.5 text-xs text-ink-muted hover:text-cyan disabled:opacity-50">{item.label}</button>)}
    </div>
    {DATA_MODE!=='http'&&<p className="mt-3 text-xs text-gold">Requires Local API · Synthetic mode.</p>}
    {error&&<p className="mt-4 rounded-lg border border-coral/30 p-3 text-sm text-coral" role="alert">{error}</p>}
    {result&&<div role="status" className="glass-sub mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-teal"/> {result.status.replaceAll('_',' ')}</p>
        <span className="font-mono text-xs text-ink-faint">{elapsed??'—'} ms local API response</span>
      </div>
      {result.adapter&&<p className="mt-2 text-sm text-cyan">Selected adapter: {result.adapter.toUpperCase()} · {result.route_kind?.replaceAll('_',' ')}</p>}
      {result.reason&&<p className="mt-2 text-sm text-gold">{result.reason}</p>}
      {result.suggested_incident_id&&<a href={'#/investigate/'+encodeURIComponent(result.suggested_incident_id)} className="mt-2 inline-flex items-center gap-2 text-sm text-cyan underline">Switch to relevant incident <ArrowRight className="size-4"/></a>}
      {result.interpretation&&<p className="mt-2 text-sm leading-relaxed text-ink-muted">{result.interpretation}</p>}
      {result.evidence&&<div className="mt-3 rounded-xl border border-line p-3">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
          <span>Source: {result.evidence.adapter.toUpperCase()} · {result.evidence.transport}</span>
          <span>Live HPE connection: NO · Actual tool status: {result.evidence.actual_tool_status.toUpperCase()}</span>
        </div>
        {result.evidence.reference_url&&<a href={result.evidence.reference_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan underline"><BookOpen className="size-3"/> Published HPE syntax reference ↗</a>}
        {result.evidence.observations.length>0?<div className="mt-3 overflow-x-auto rounded-lg bg-black/20 p-3">
          <pre className="text-xs leading-relaxed text-ink-muted">{JSON.stringify(result.evidence.observations,null,2)}</pre>
        </div>:<p className="mt-2 inline-flex gap-2 text-xs text-gold"><CircleAlert className="size-4"/> No authenticated subsystem output; do not assume healthy status.</p>}
        <p className="mt-2 text-xs text-ink-faint">Snapshot: {result.evidence.retrieved_at} · {result.evidence.time_scope.replaceAll('_',' ')}</p>
      </div>}
      {result.correlation&&<div className="mt-3 border-t border-line pt-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-gold"/> Cross-tool investigation · temporal evidence</h3>
        <ol className="mt-3 space-y-2">
          {result.correlation.ordered_evidence.map(e=><li className="rounded-lg border border-line p-3 text-xs" key={e.id}>
            <span className="font-mono text-cyan">{e.id} · {e.time}</span><span className="ml-2 text-ink-muted">{e.source}</span><p className="mt-1 text-sm">{e.observation}</p>
          </li>)}
        </ol>
        <p className="mt-3 text-sm text-ink-muted">{result.correlation.conclusion}</p>
        <p className="mt-2 text-xs text-gold">Root cause not established. Unknowns: {result.correlation.unknowns.join('; ')}</p>
        {result.correlation.hypotheses.map(h=><p key={h} className="mt-2 text-xs text-ink-muted">Hypothesis only: {h}</p>)}
      </div>}
      {result.recommended_next&&<p className="mt-3 text-xs text-ink-muted"><FileSearch className="mr-1 inline size-4 text-teal"/> Next: {result.recommended_next}</p>}
      <p className="mt-3 text-xs text-ink-faint">Synthetic evidence only · no terminal commands executed · no confirmed production impact.</p>
    </div>}
  </section>
}
