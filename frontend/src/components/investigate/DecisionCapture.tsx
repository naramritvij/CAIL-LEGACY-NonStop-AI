import { useState } from 'react'
import { Dna, LockKeyhole, Send } from 'lucide-react'
import { workflowRequest, type DecisionLesson } from '@/api/workflows'

export function DecisionCapture({ incidentId, eventIds, symptoms }: {
  incidentId: string; eventIds: string[]; symptoms: string
}) {
  const [alias, setAlias] = useState('Synthetic Demo Expert — not a verified operator')
  const [reasoning, setReasoning] = useState('')
  const [rejected, setRejected] = useState('No destructive or state-changing action without verified prerequisites')
  const [prereqs, setPrereqs] = useState('Verify ownership,Verify dependencies,Review applicable runbook')
  const [selected, setSelected] = useState<string[]>(eventIds)
  const [expertKey, setExpertKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState<DecisionLesson | null>(null)
  async function submit() {
    setBusy(true); setError('')
    try {
      if (selected.length === 0) throw new Error('Select at least one recorded incident event.')
      const body = {
        incident_id: incidentId, author_alias: alias, symptoms, reasoning,
        rejected_action: rejected,
        prerequisites: prereqs.split(',').map(s => s.trim()).filter(Boolean),
        evidence_ids: selected,
      }
      const draft = await workflowRequest<DecisionLesson>('/knowledge/lessons','POST',body,'expert',expertKey)
      const item = await workflowRequest<DecisionLesson>(
        '/knowledge/lessons/' + encodeURIComponent(draft.id) + '/submit','POST',undefined,'expert',expertKey,
      )
      setSubmitted(item); setExpertKey('')
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }
  return <section className="glass flex flex-col gap-4 p-5 sm:p-6" aria-label="Capture Decision DNA">
    <div className="flex items-center gap-2"><Dna className="size-5 text-gold"/><h2 className="text-lg font-semibold">Capture Decision DNA</h2></div>
    <p className="text-sm text-ink-muted">Create a synthetic, event-linked lesson for independent mentor review. Drafts never enter the Knowledge Tree or retrieval until approved.</p>
    {submitted ? <div role="status" className="glass-sub border border-teal/30 p-4 text-sm">
      <strong className="text-teal">Submitted for independent review.</strong>
      <p className="mt-2 break-all text-xs">Lesson: {submitted.id}</p>
      <p className="mt-2 text-xs text-ink-muted">Open Mentor with a different reviewer key to inspect and approve/reject. Author identity has not been independently verified.</p>
    </div> : <>
      <label className="text-sm">Demo author label<input className="neu-inset mt-1 w-full rounded-lg p-3 text-ink" value={alias} onChange={e=>setAlias(e.target.value)} maxLength={80}/></label>
      <label className="text-sm">Operational reasoning<textarea className="neu-inset mt-1 w-full rounded-lg p-3 text-ink" rows={4} value={reasoning} onChange={e=>setReasoning(e.target.value)} maxLength={4000} placeholder="What does the evidence mean? What is still unknown? Why avoid premature remediation?"/></label>
      <label className="text-sm">Rejected or deferred action<input className="neu-inset mt-1 w-full rounded-lg p-3 text-ink" value={rejected} onChange={e=>setRejected(e.target.value)} maxLength={500}/></label>
      <label className="text-sm">Prerequisites (comma-separated)<input className="neu-inset mt-1 w-full rounded-lg p-3 text-ink" value={prereqs} onChange={e=>setPrereqs(e.target.value)}/></label>
      <fieldset className="glass-sub p-3"><legend className="text-sm font-medium">Recorded synthetic evidence</legend>
        {eventIds.map(id=><label key={id} className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(v=>e.target.checked?[...v,id]:v.filter(x=>x!==id))}/>{id}</label>)}
      </fieldset>
      <label className="text-sm"><span className="inline-flex items-center gap-2"><LockKeyhole className="size-4"/> Local expert demo key</span>
        <input type="password" autoComplete="off" className="neu-inset mt-1 w-full rounded-lg p-3 text-ink" value={expertKey} onChange={e=>setExpertKey(e.target.value)} placeholder="Key configured in private .env"/></label>
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      <button type="button" disabled={busy || reasoning.trim().length<20 || alias.trim().length<2} onClick={()=>void submit()} className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl p-3 disabled:opacity-50"><Send className="size-4"/>{busy?'Submitting…':'Save draft and submit for mentor review'}</button>
      <p className="text-xs text-ink-faint">Local demo credentials remain in this component's memory only; they are not saved to the browser, URL, or repository. Never use production keys.</p>
    </>}
  </section>
}
