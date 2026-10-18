import { useEffect, useState } from 'react'
import { GraduationCap, ShieldCheck, Trophy } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { KnowledgeWorkflowStatus } from '@/components/knowledge/KnowledgeWorkflowStatus'
import { workflowRequest, type DecisionLesson, type TransferChallenge, type TransferScore } from '@/api/workflows'

type Action = { id:string;title:string;classification:string }
export function ApprenticePage() {
  const [lessons,setLessons]=useState<DecisionLesson[]>([])
  const [actions,setActions]=useState<Action[]>([])
  const [lessonId,setLessonId]=useState('')
  const [challenge,setChallenge]=useState<TransferChallenge|null>(null)
  const [action,setAction]=useState('inspect_events')
  const [evidence,setEvidence]=useState<string[]>([])
  const [prerequisites,setPrerequisites]=useState('')
  const [reasoning,setReasoning]=useState('')
  const [score,setScore]=useState<TransferScore|null>(null)
  const [busy,setBusy]=useState(false)
  const [loaded,setLoaded]=useState(false)
  const [error,setError]=useState('')
  async function load() {
    setBusy(true);setError('')
    try {
      const [l,a]=await Promise.all([
        workflowRequest<DecisionLesson[]>('/knowledge/lessons?status=approved'),
        workflowRequest<Action[]>('/actions'),
      ])
      setLessons(l);setActions(a)
    }catch(e){setError(String(e))}
    finally{setBusy(false);setLoaded(true)}
  }
  useEffect(()=>{if(DATA_MODE==='http')void load()},[])
  async function choose(id:string) {
    setLessonId(id);setScore(null);setEvidence([]);setPrerequisites('');setReasoning('');setChallenge(null)
    if(!id)return
    setBusy(true);setError('')
    try{setChallenge(await workflowRequest<TransferChallenge>('/training/challenges/'+encodeURIComponent(id)))}
    catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  async function assess() {
    setBusy(true);setError('');setScore(null)
    try {
      if(!challenge)throw new Error('Select an approved training challenge.')
      const result=await workflowRequest<TransferScore>(
        '/training/challenges/'+encodeURIComponent(lessonId)+'/assess','POST',{
          action_id:action,evidence_ids:evidence,
          prerequisites:prerequisites.split(',').map(x=>x.trim()).filter(Boolean),
          reasoning,
        },
      )
      setScore(result)
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  return <div className="flex flex-col gap-5">
    <header className="glass p-6">
      <p className="text-xs font-semibold tracking-widest text-violet uppercase">Knowledge transfer</p>
      <h1 className="mt-1 text-2xl font-semibold">Apprentice · Simulation Challenge</h1>
      <p className="mt-2 text-sm text-ink-muted">Practice on a changed, fictional incident created from an approved local lesson. A deterministic rubric checks safe actions, event citations, prerequisites and reasoning.</p>
    </header>
    <KnowledgeWorkflowStatus />
    {DATA_MODE!=='http'&&<p className="glass p-4 text-sm text-gold">Challenges are available only in Local API · Synthetic mode.</p>}
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><GraduationCap className="size-5 text-violet"/> Select an approved lesson</h2>
      <button type="button" onClick={()=>void load()} className="tap mt-2 rounded-lg border border-line px-3 py-2 text-xs">Refresh lessons</button>
      <select aria-label="Approved lesson" className="neu-inset mt-3 w-full rounded-lg p-3 text-sm" value={lessonId} onChange={e=>void choose(e.target.value)}>
        <option value="">Choose a reviewed synthetic lesson…</option>
        {lessons.map(l=><option key={l.id} value={l.id}>{l.incident_id} · {l.symptoms.slice(0,90)}</option>)}
      </select>
      {loaded&&!lessons.length&&<div className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-3">
        <p className="text-sm text-gold">No approved lessons yet — the training challenge cannot start without an independently reviewed decision.</p>
        <p className="mt-1 text-xs text-ink-muted">Open an incident in Investigate, capture its evidence-linked Decision DNA, then review it using a separate mentor credential.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <a className="text-xs text-cyan underline" href="#/investigate">Capture Decision DNA →</a>
          <a className="text-xs text-cyan underline" href="#/mentor">Review in Mentor →</a>
        </div>
      </div>}
    </section>
    {error&&<p role="alert" className="glass border border-coral/30 p-3 text-sm text-coral">{error}</p>}
    {challenge&&<section className="glass flex flex-col gap-4 p-5">
      <h2 className="text-lg font-semibold">{challenge.title} <span className="ml-2 text-xs text-gold">Synthetic</span></h2>
      <p className="text-sm leading-relaxed text-ink-muted">{challenge.situation}</p>
      <p className="text-xs font-semibold text-cyan">{challenge.task}</p>
      <p className="text-xs text-ink-muted">Known unknowns to consider: {challenge.unknowns.join(' · ')}</p>
      <fieldset className="glass-sub p-4">
        <legend className="text-sm font-semibold">Select supporting training observations</legend>
        {challenge.events.map(e=><label key={e.id} className="mt-2 flex items-start gap-3 text-sm">
          <input type="checkbox" checked={evidence.includes(e.id)} onChange={event=>setEvidence(p=>event.target.checked?[...p,e.id]:p.filter(x=>x!==e.id))}/>
          <span><span className="font-mono text-xs text-cyan">{e.id}</span> · {e.observation}</span>
        </label>)}
      </fieldset>
      <label className="text-sm">Choose first action
        <select className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" value={action} onChange={e=>setAction(e.target.value)}>
          {actions.map(a=><option key={a.id} value={a.id}>{a.title} ({a.classification})</option>)}
        </select>
      </label>
      <label className="text-sm">Prerequisites you must verify (comma-separated)
        <input className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" value={prerequisites} onChange={e=>setPrerequisites(e.target.value)} placeholder="ownership, retention, dependencies…"/>
      </label>
      <label className="text-sm">Why this is the safest first step
        <textarea className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" rows={3} maxLength={1000} value={reasoning} onChange={e=>setReasoning(e.target.value)} placeholder="Before changing anything, I would verify…"/>
      </label>
      <button type="button" disabled={busy||reasoning.trim().length<10||evidence.length===0} onClick={()=>void assess()} className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl p-3 text-sm disabled:opacity-50"><ShieldCheck className="size-4"/>{busy?'Scoring…':'Assess my decision (no real command)'}</button>
      {score&&<div role="status" className="glass-sub border border-teal/25 p-4">
        <div className="flex items-center gap-2"><Trophy className="size-5 text-gold"/><strong className="text-lg">{score.score}/100 · {score.passed?'Training rubric passed':'Needs review'}</strong></div>
        <p className="mt-2 text-sm text-ink-muted">Mandatory gates: {score.unmet_mandatory_conditions.length?score.unmet_mandatory_conditions.join(', '):'Satisfied'}</p>
        <p className="mt-2 text-xs text-ink-muted">Missing evidence: {score.evidence.missing.join(', ')||'None'} · Unsupported: {score.evidence.unsupported.join(', ')||'None'}</p>
        <p className="mt-1 text-xs text-ink-muted">Missing prerequisites: {score.prerequisites.missing.join(', ')||'None'}</p>
        {!score.passed&&<p className="mt-2 text-sm text-gold">Improve your response: use the supported diagnostic first action, cite all required events, name the missing prerequisites, and explain why you would verify before changing the system.</p>}
        <p className="mt-2 text-xs text-ink-faint">One-time synthetic score; attempt not persisted, no credential or production operation involved. This does not certify real operator competence.</p>
      </div>}
    </section>}
  </div>
}
