import { useEffect, useState } from 'react'
import { ArrowUpRight, BookOpen, ChevronDown, CircleHelp, FileSearch, LockKeyhole, Search, ShieldCheck, TerminalSquare } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { workflowRequest } from '@/api/workflows'
import { assertSafePlaybook } from '@/api/playbook-guard'

type Reference = { title: string; url: string; note: string }
type PlaybookStep = {
  id: string; title: string; kind: 'local_preview' | 'manual_reference' | 'checklist'
  tool: string; command: string | null; local_intent: string | null; source_tool: string | null
  purpose: string; why_now: string; look_for: string[]; interpretation: string
  if_missing: string; if_present: string; event_ids: string[]
  references: Reference[]; prerequisites: string[]
  execution_allowed: false; state_change_executed: false; synthetic: true
  command_applicability_verified: false; source_status: string
}
type Playbook = {
  incident_id: string; title: string; mode: string; steps: PlaybookStep[]
  approved_lessons: {id:string; title:string; evidence_ids:string[]}[]
  release_verified: false; operator_authorized: false; limitations: string
}
type Recommendation = {
  status: 'matched' | 'needs_clarification' | 'context_mismatch'; recommended_step_id: string | null; suggested_incident_id?:string
  reason: string; matched_terms: string[]; recommendation_basis: string
}
type Preview = {
  status: string; step_id: string; execution_allowed: false; state_change_executed: false
  message?: string; preview?: {status:string; result:unknown} | null
  source?: {tool_id:string; health_signal:string; evidence: Record<string,unknown>[]; note:string} | null
}

export function GuidedCommandPlaybook({ incidentId, onSelectEvidence, onAskEvidence }: {
  incidentId: string; onSelectEvidence: (evidenceId:string)=>void
  onAskEvidence: (question:string)=>void
}) {
  const [playbook,setPlaybook]=useState<Playbook|null>(null)
  const [active,setActive]=useState('')
  const [question,setQuestion]=useState('')
  const [recommendation,setRecommendation]=useState<Recommendation|null>(null)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let current=true
    setPlaybook(null);setPreview(null);setRecommendation(null);setActive('');setError('')
    if(DATA_MODE !== 'http')return
    workflowRequest<Playbook>('/operations/incidents/'+encodeURIComponent(incidentId)+'/playbook')
      .then(data=>{if(current){assertSafePlaybook(data);setPlaybook(data);setActive(data.steps[0]?.id??'')}})
      .catch(e=>{if(current)setError(String(e))})
    return()=>{current=false}
  },[incidentId])
  async function recommend(){
    setBusy(true);setError('');setRecommendation(null);setPreview(null)
    try{
      const next=await workflowRequest<Recommendation>('/operations/playbook/recommend','POST',{incident_id:incidentId,question})
      setRecommendation(next)
      if(next.recommended_step_id&&playbook?.steps.some(s=>s.id===next.recommended_step_id)){
        setActive(next.recommended_step_id)
      }
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  async function inspect(step:PlaybookStep){
    setBusy(true);setError('');setPreview(null)
    try{
      const reply=await workflowRequest<Preview>('/operations/playbook/preview','POST',{
        incident_id:incidentId,step_id:step.id,
      })
      if(reply.execution_allowed!==false||reply.state_change_executed!==false)
        throw new Error('Unsafe or unexpected preview safety contract.')
      setPreview(reply)
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  return <section id="guided-commands" className="glass glow-cyan p-5 sm:p-6" aria-label="Guided command playbook">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold tracking-[0.17em] text-cyan uppercase">From symptom to evidence</p>
        <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold"><TerminalSquare className="size-5 text-cyan"/> Guided Command Playbook</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">Find the right observation, learn which HPE status command is documented, inspect synthetic evidence, and decide what to verify next.</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold"><LockKeyhole className="size-4"/> Reference & preview only</span>
    </header>
    {DATA_MODE!=='http'&&<p className="glass-sub mt-4 p-4 text-sm text-ink-muted">Guided operator commands need Local API · Synthetic mode. No production system is connected.</p>}
    {error&&<p role="alert" className="mt-3 rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
    {DATA_MODE==='http'&&!playbook&&!error&&<p role="status" className="mt-3 text-sm text-ink-muted">Loading incident-specific read-only playbook…</p>}
    {playbook&&<>
      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={e=>{e.preventDefault();if(!busy&&question.trim().length>=3)void recommend()}}>
        <label htmlFor="cail-command-question" className="sr-only">Describe the symptom or information needed</label>
        <input id="cail-command-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} placeholder="E.g. check disk status, Pathway server state, EMS alerts…" className="neu-inset min-w-0 flex-1 rounded-xl p-3 text-sm"/>
        <button type="submit" disabled={busy||question.trim().length<3} className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-50"><Search className="size-4"/> Find relevant check</button>
      </form>
      {recommendation&&<div role="status" className="mt-2 text-xs text-ink-muted">
        <p>{recommendation.reason} {recommendation.matched_terms.length>0?'Matched: '+recommendation.matched_terms.join(', '):''} <span className="text-ink-faint">· Curated rule-based routing, not an AI diagnosis.</span></p>
        {recommendation.suggested_incident_id&&<a href={'#/investigate/'+encodeURIComponent(recommendation.suggested_incident_id)} className="mt-2 inline-flex items-center gap-2 text-cyan underline">Open the matching incident →</a>}
      </div>}
      <p className="mt-4 text-xs text-ink-faint">Steps are ordered for this synthetic incident, not a universally valid production runbook. All HPE command applicability and operator privileges remain unverified.</p>
      <div className="mt-3 flex flex-col gap-3">
        {playbook.steps.map((step,index)=>{
          const expanded=active===step.id
          return <article key={step.id} className="glass-sub overflow-hidden">
            <button type="button" className="tap flex w-full items-center gap-3 p-4 text-left" aria-expanded={expanded} onClick={()=>{setActive(expanded?'':step.id);setPreview(null)}}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-cyan/25 bg-cyan/10 font-mono text-xs text-cyan">{index+1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{step.title}</span>
                <span className="mt-1 block text-xs text-ink-muted">{step.tool} · {step.kind==='local_preview'?'CAIL synthetic evidence':step.kind==='manual_reference'?'HPE documentation reference':'Human verification checklist'}</span>
              </span>
              <ChevronDown aria-hidden className={'size-4 shrink-0 text-cyan transition-transform '+(expanded?'rotate-180':'')}/>
            </button>
            {expanded&&<div className="border-t border-line px-4 pb-4 pt-3 text-sm">
              <p className="text-sm leading-relaxed text-ink-muted">{step.purpose}</p>
              <p className="mt-3 text-xs font-semibold text-cyan">Why this check?</p>
              <p className="mt-1 text-sm text-ink-muted">{step.why_now}</p>
              {step.command&&<div className="mt-3 rounded-xl border border-gold/25 bg-gold/5 p-3">
                <p className="text-xs font-semibold text-gold">Documented command example · not executed</p>
                <code className="mt-2 block overflow-x-auto whitespace-pre text-sm text-ink">{step.command}</code>
                <p className="mt-2 text-xs text-ink-muted">Check the HPE reference, actual system release, process/volume name and local authorization before any external use. This application cannot run it.</p>
              </div>}
              {step.local_intent&&<p className="mt-3 rounded-lg border border-teal/25 bg-teal/5 p-3 text-xs text-teal"><ShieldCheck className="mr-2 inline size-4"/>CAIL interface intent: {step.local_intent}. This is NOT an HPE command.</p>}
              <p className="mt-3 text-xs font-semibold">What information should appear?</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-muted">{step.look_for.map(v=><li key={v}>{v}</li>)}</ul>
              <p className="mt-3 text-xs font-semibold">How to interpret it</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.interpretation}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-line p-3"><p className="text-xs font-semibold text-teal">If evidence is available</p><p className="mt-1 text-xs text-ink-muted">{step.if_present}</p></div>
                <div className="rounded-lg border border-gold/25 p-3"><p className="text-xs font-semibold text-gold">If missing / unknown</p><p className="mt-1 text-xs text-ink-muted">{step.if_missing}</p></div>
              </div>
              {step.prerequisites.length>0&&<p className="mt-3 text-xs text-ink-muted"><strong>Before external use:</strong> {step.prerequisites.join(' · ')}</p>}
              {step.references.length>0&&<div className="mt-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold"><BookOpen className="size-4"/> HPE reference pages</p>
                {step.references.map(ref=><div key={ref.url} className="mt-2">
                  <a className="inline-flex items-center gap-1 text-xs font-semibold text-cyan underline" href={ref.url} target="_blank" rel="noopener noreferrer">{ref.title}<ArrowUpRight className="size-3"/></a>
                  <p className="mt-1 text-xs text-ink-muted">{ref.note}</p>
                </div>)}
              </div>}
              <div className="mt-3 flex flex-wrap gap-2">
                {step.event_ids.map(id=><button type="button" key={id} className="tap inline-flex items-center gap-1 rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 text-xs text-cyan" onClick={()=>onSelectEvidence(id)}><FileSearch className="size-3"/>{id}</button>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={()=>void inspect(step)} className="tap rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-semibold text-teal disabled:opacity-50">{busy?'Inspecting…':step.kind==='local_preview'?'Preview registered synthetic evidence':step.kind==='manual_reference'?'Check availability of synthetic status':'Confirm missing prerequisite context'}</button>
                <button type="button" onClick={()=>onAskEvidence(
                  incidentId==='INC-DISK-001'
                    ? 'What does the disk incident evidence show, and what remains unknown?'
                    : 'What does the Pathway incident evidence show, and what remains unknown?'
                )} className="tap inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold"><CircleHelp className="size-3"/> Prepare CAIL evidence question</button>
              </div>
              {preview&&preview.step_id===step.id&&<div role="status" className="mt-3 rounded-xl border border-line p-3 text-xs">
                <p className="font-semibold text-teal">{preview.status==='synthetic_preview'?'Synthetic preview ready':'No external command issued'} · {preview.status}</p>
                {preview.message&&<p className="mt-1 text-ink-muted">{preview.message}</p>}
                {preview.source&&<p className="mt-1 text-ink-muted">Source: {preview.source.tool_id.toUpperCase()} · status {preview.source.health_signal.toUpperCase()} · {preview.source.note}</p>}
                {preview.source?.evidence&&preview.source.evidence.length>0&&<pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/20 p-3 text-xs text-ink-muted">{JSON.stringify(preview.source.evidence,null,2)}</pre>}
                {(!preview.source?.evidence||preview.source.evidence.length===0)&&<p className="mt-2 text-gold">No authenticated output for this check. Status remains UNKNOWN.</p>}
              </div>}
            </div>}
          </article>
        })}
      </div>
      {playbook.approved_lessons.length>0&&<div className="glass-sub mt-4 p-4">
        <p className="text-sm font-semibold">Related locally approved Decision DNA</p>
        {playbook.approved_lessons.map(lesson=><p className="mt-2 text-xs" key={lesson.id}><a href="#/tree" className="text-cyan underline">{lesson.title}</a> · {lesson.evidence_ids.join(', ')}</p>)}
      </div>}
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">{playbook.limitations}</p>
    </>}
  </section>
}
