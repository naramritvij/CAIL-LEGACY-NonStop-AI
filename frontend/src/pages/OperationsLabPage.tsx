import { useEffect, useState } from 'react'
import { ArrowRight, BarChart3, Clock3, FlaskConical, ShieldCheck } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { workflowRequest } from '@/api/workflows'
import { UnifiedCommandConsole } from '@/components/operations/UnifiedCommandConsole'

interface LabScenario {id:string;title:string;summary:string;severity:string;type:string;system:string}
interface ShiftSection {incident_id:string;title:string;severity:string;observations:string[];evidence_ids:string[];missing:string[];recommendation:string}
interface ShiftBrief {synthetic:true;live_connected:false;event_count:number;incident_count:number;unresolved_count:number;
  approved_resolutions_reported:number;documented_process_restarts:null;sections:ShiftSection[];handover:string;limitation:string}
interface ToolRecord {name:string;adapter_id:string;availability:string;purpose:string;live_connected:false}
interface ToolDirectory {mode:string;real_cail_suite_integration:false;native_command_execution:false;tools:ToolRecord[]}
interface Protocol {measurement_status:string;procedure:string[];metrics:string[];scenarios:string[]}
interface AiAssessment {
  status: string; message: string; synthetic: boolean
  model?: string; claims: {text:string;citations:string[]}[]
  source_registry: {id:string;kind:string;source_text:string}[]
  missing_evidence?:string[]; citations_validation?:string
}
type Trial = {mode:'Static evidence'|'CAIL';seconds:number;safe:boolean;events:number}
export function OperationsLabPage(){
  const [scenarios,setScenarios]=useState<LabScenario[]>([])
  const [selected,setSelected]=useState('INC-FIN-HW-003')
  const [brief,setBrief]=useState<ShiftBrief|null>(null)
  const [protocol,setProtocol]=useState<Protocol|null>(null)
  const [tools,setTools]=useState<ToolDirectory|null>(null)
  const [error,setError]=useState('')
  const [started,setStarted]=useState<number|null>(null)
  const [mode,setMode]=useState<Trial['mode']>('CAIL')
  const [safe,setSafe]=useState(false)
  const [events,setEvents]=useState(0)
  const [trials,setTrials]=useState<Trial[]>([])
  const [aiQuestion,setAiQuestion]=useState('What does the evidence show, and what remains unknown?')
  const [aiResponse,setAiResponse]=useState<AiAssessment|null>(null)
  const [aiBusy,setAiBusy]=useState(false)
  const [aiError,setAiError]=useState('')
  useEffect(()=>{
    if(DATA_MODE!=='http')return
    let valid=true
    Promise.all([
      workflowRequest<{scenarios:LabScenario[]}>('/operations/lab/scenarios'),
      workflowRequest<ShiftBrief>('/operations/lab/shift-summary'),
      workflowRequest<Protocol>('/operations/lab/evaluation-protocol'),
      workflowRequest<ToolDirectory>('/operations/lab/tools'),
    ]).then(([s,b,p,d])=>{if(valid){setScenarios(s.scenarios);setBrief(b);setProtocol(p);setTools(d)}})
      .catch(e=>{if(valid)setError(String(e))})
    return()=>{valid=false}
  },[])
  function completeTrial(){
    if(started===null)return
    const seconds=Math.round((performance.now()-started)/100)/10
    setTrials(v=>[...v,{mode,seconds,safe,events}])
    setStarted(null);setSafe(false);setEvents(0)
  }
  const fin=scenarios.find(s=>s.id===selected)
  return <div className="flex flex-col gap-5">
    <header className="glass glow-cyan p-6">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-widest text-cyan uppercase"><FlaskConical className="size-4"/> Sponsor mission demo</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">CAIL Operations Lab · Financial Resilience</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">Hardware pressure → process and Pathway warnings → slower fictional payment transactions. Explore synthetic tools, trace evidence, and practice a safe response. No actual bank, HPE system or CAIL Suite session is connected.</p>
    </header>
    {error&&<p role="alert" className="glass p-4 text-coral">{error}</p>}
    <section className="glass p-5">
      <h2 className="text-lg font-semibold">Choose a synthetic investigation</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {scenarios.map(s=><button key={s.id} type="button" onClick={()=>setSelected(s.id)} aria-pressed={selected===s.id} className={'tap rounded-xl border p-3 text-left text-xs '+(selected===s.id?'border-cyan bg-cyan/10 text-cyan':'border-line text-ink-muted')}>{s.title}</button>)}
      </div>
      {fin&&<div className="glass-sub mt-4 p-4">
        <p className="text-sm font-semibold">{fin.title}</p>
        <p className="mt-2 text-sm text-ink-muted">{fin.summary}</p>
        <p className="mt-2 text-xs text-gold">{fin.system} · No customer transactions · Causal relationships unverified</p>
        {selected!=='INC-FIN-HW-003'&&<a href={'#/investigate/'+encodeURIComponent(selected)} className="mt-3 inline-flex items-center gap-1 text-xs text-cyan underline">Open full investigation and Decision DNA <ArrowRight className="size-3"/></a>}
      </div>}
    </section>
    <section className="glass p-5" aria-label="Source tool connections">
      <h2 className="text-lg font-semibold">Operational tool coverage · honesty dashboard</h2>
      <p className="mt-2 text-sm text-ink-muted">This registry shows exactly what the prototype can inspect. “Fixture observations” means local invented data; a published command reference does not imply a real session.</p>
      {tools&&<div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tools.tools.map(tool=><article key={tool.adapter_id} className="glass-sub rounded-lg p-3">
          <p className="text-sm font-semibold">{tool.name}</p>
          <p className="mt-1 text-xs text-ink-muted">{tool.purpose}</p>
          <p className={'mt-2 text-xs font-semibold '+(tool.availability==='fixture_observations'?'text-teal':'text-gold')}>{tool.availability.replaceAll('_',' ')} · no live connection</p>
        </article>)}
      </div>}
    </section>
    <UnifiedCommandConsole incidentId={selected}/>

    <section className="glass p-5" aria-label="Financial incident AI explanation">
      <h2 className="text-lg font-semibold">Ask CAIL · Grounded AI explanation</h2>
      <p className="mt-2 text-sm text-ink-muted">The local Qwen model interprets registered synthetic evidence using the existing citation-ID safety checks. The model cannot authorize commands, and citation matching is not factual verification.</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async e=>{
        e.preventDefault();setAiBusy(true);setAiError('');setAiResponse(null)
        try{
          const result=await workflowRequest<AiAssessment>('/operations/lab/ask','POST',{
            incident_id:selected,question:aiQuestion,release:'L23.08',max_chunks:3,
          })
          if(result.synthetic!==true)throw new Error('Unsafe non-synthetic model result.')
          setAiResponse(result)
        }catch(err){setAiError(String(err))}
        finally{setAiBusy(false)}
      }}>
        <input aria-label="Ask CAIL about the financial incident" className="neu-inset min-w-0 flex-1 rounded-lg p-3 text-sm" value={aiQuestion} maxLength={500} onChange={e=>setAiQuestion(e.target.value)}/>
        <button type="submit" disabled={aiBusy||aiQuestion.trim().length<3||DATA_MODE!=='http'} className="btn-primary rounded-lg px-4 py-3 text-sm disabled:opacity-50">{aiBusy?'Checking citations…':'Ask local Qwen'}</button>
      </form>
      {aiError&&<p role="alert" className="mt-3 text-sm text-coral">{aiError}</p>}
      {aiResponse&&<div role="status" className="glass-sub mt-3 p-4">
        <p className="text-sm font-semibold">{aiResponse.status.replaceAll('_',' ')}</p>
        <p className="mt-2 text-sm text-ink-muted">{aiResponse.message}</p>
        {aiResponse.claims?.map((claim,i)=><article key={i} className="mt-3 border-t border-line pt-3">
          <p className="text-sm">{claim.text}</p>
          <p className="mt-1 font-mono text-xs text-cyan">Registered citation IDs: {claim.citations.join(', ')}</p>
          {claim.citations.map(id=>{
            const source=aiResponse.source_registry?.find(s=>s.id===id)
            return source?<p key={id} className="mt-2 text-xs text-ink-muted">{source.id}: {source.source_text}</p>:null
          })}
        </article>)}
        <p className="mt-3 text-xs text-gold">Unverified Qwen claims; identifiers checked, not semantically fact-checked. No actual system command executed.</p>
      </div>}
    </section>
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="size-5 text-cyan"/> Overnight & management briefing</h2>
      <p className="mt-2 text-sm text-ink-muted">A derived summary of fixed invented shift events. It never claims processes were restarted, CPU was normal, or service availability was restored without supporting records.</p>
      {brief&&<>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['Incidents',brief.incident_count],['Events',brief.event_count],['Unresolved',brief.unresolved_count]].map(([label,val])=><div key={String(label)} className="glass-sub rounded-xl p-3"><p className="text-xl font-semibold text-cyan">{val}</p><p className="text-xs text-ink-muted">{label}</p></div>)}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {brief.sections.map(s=><article className="glass-sub p-4" key={s.incident_id}>
            <p className="text-sm font-semibold">{s.title}</p><p className="mt-1 font-mono text-xs text-cyan">{s.incident_id} · {s.severity}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-ink-muted">{s.observations.slice(0,5).map(e=><li key={e}>{e}</li>)}</ul>
            <p className="mt-3 text-xs text-gold">Unknown: {s.missing.slice(0,3).join('; ')}</p>
          </article>)}
        </div>
        <p className="mt-3 text-sm text-ink-muted">{brief.handover}</p>
        <p className="mt-2 text-xs text-ink-faint">{brief.limitation}</p>
      </>}
    </section>
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Clock3 className="size-5 text-violet"/> Measurable operator evaluation</h2>
      <p className="mt-2 text-sm text-ink-muted">Run controlled, consented trials comparing static evidence against this CAIL console. The browser timer measures local task time; it is not a claim of production MTTR improvement.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <select aria-label="Evaluation mode" className="neu-inset rounded-lg p-2 text-sm" value={mode} onChange={e=>setMode(e.target.value as Trial['mode'])}><option>CAIL</option><option>Static evidence</option></select>
        <button type="button" className="btn-primary rounded-lg px-3 py-2 text-sm" onClick={()=>{if(started===null)setStarted(performance.now());else completeTrial()}}>{started===null?'Start timed trial':'Finish trial'}</button>
      </div>
      {started!==null&&<div className="mt-3 flex flex-wrap gap-3 text-sm">
        <label className="flex gap-2"><input type="checkbox" checked={safe} onChange={e=>setSafe(e.target.checked)}/> Safe, cited next-step decision?</label>
        <label>Evidence IDs cited <input aria-label="Evidence IDs cited" type="number" min={0} max={20} value={events} className="neu-inset ml-2 w-16 rounded-lg p-2" onChange={e=>setEvents(Math.max(0,Math.min(20,Number(e.target.value)||0)))}/></label>
      </div>}
      {trials.length>0&&<div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th>Mode</th><th>Seconds</th><th>Safe</th><th>Evidence</th></tr></thead><tbody>{trials.map((t,i)=><tr key={i} className="border-t border-line"><td className="p-2">{t.mode}</td><td>{t.seconds.toFixed(1)}</td><td>{t.safe?'Yes':'No'}</td><td>{t.events}</td></tr>)}</tbody></table></div>}
      {protocol&&<details className="glass-sub mt-3 p-3 text-xs"><summary className="cursor-pointer font-semibold"><ShieldCheck className="mr-2 inline size-4"/> Independent measurement protocol</summary><ol className="mt-2 list-inside list-decimal space-y-2 text-ink-muted">{protocol.procedure.map(x=><li key={x}>{x}</li>)}</ol><p className="mt-2 text-gold">No pre-existing MTTR improvement claim. Results above remain temporary in the current browser view.</p></details>}
    </section>
  </div>
}
