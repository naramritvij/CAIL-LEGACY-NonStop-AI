import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { ShieldCheck, UserRoundCheck, ClipboardCheck } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { KnowledgeWorkflowStatus } from '@/components/knowledge/KnowledgeWorkflowStatus'
import { workflowRequest, type CorpusRecord, type DecisionLesson } from '@/api/workflows'

type Decision = 'approved' | 'rejected'
type Tab = 'sources' | 'lessons'
export function MentorPage() {
  const {mutate}=useSWRConfig()
  const [key,setKey]=useState('')
  const [tab,setTab]=useState<Tab>('lessons')
  const [docs,setDocs]=useState<CorpusRecord[]>([])
  const [lessons,setLessons]=useState<DecisionLesson[]>([])
  const [selectedDoc,setSelectedDoc]=useState<CorpusRecord|null>(null)
  const [selectedLesson,setSelectedLesson]=useState<DecisionLesson|null>(null)
  const [notes,setNotes]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function load() {
    setBusy(true);setError('');setNotice('')
    try {
      const [d,l]=await Promise.all([
        workflowRequest<CorpusRecord[]>('/knowledge/corpus/documents?status=submitted','GET',undefined,'reviewer',key),
        workflowRequest<DecisionLesson[]>('/knowledge/lessons?status=submitted','GET',undefined,'reviewer',key),
      ])
      setDocs(d);setLessons(l)
      if(selectedDoc&&!d.some(x=>x.id===selectedDoc.id))setSelectedDoc(null)
      if(selectedLesson&&!l.some(x=>x.id===selectedLesson.id))setSelectedLesson(null)
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  async function openDocument(id:string) {
    setError('');setSelectedLesson(null)
    try{setSelectedDoc(await workflowRequest<CorpusRecord>('/knowledge/corpus/documents/'+encodeURIComponent(id),'GET',undefined,'reviewer',key))}
    catch(e){setError(String(e))}
  }
  async function review(kind:Tab,id:string,decision:Decision) {
    setBusy(true);setError('');setNotice('')
    try{
      if(notes.trim().length<10)throw new Error('Write review notes explaining the decision (at least 10 characters).')
      const url=kind==='sources'?'/knowledge/corpus/documents/':'/knowledge/lessons/'
      await workflowRequest<unknown>(url+encodeURIComponent(id)+'/review','POST',{decision,notes},'reviewer',key)
      // Update the current queue immediately after the confirmed server response.
      // Do not block the operator on an unnecessary full reload of both queues.
      if (kind === 'sources') setDocs(prev => prev.filter(doc => doc.id !== id))
      else setLessons(prev => prev.filter(lesson => lesson.id !== id))
      setNotes('');setSelectedDoc(null);setSelectedLesson(null)
      setNotice((decision==='approved'?'Approved':'Rejected')+' locally for '+kind+'. Review does not authenticate identity or sources.')
      void mutate(['legacy-tree','live']).catch(() => { /* Revalidation is best effort. */ })
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }
  return <div className="flex flex-col gap-5">
    <header className="glass p-6">
      <p className="text-xs font-semibold tracking-widest text-violet uppercase">Independent review</p>
      <h1 className="mt-1 text-2xl font-semibold">Mentor · Review Knowledge</h1>
      <p className="mt-2 text-sm text-ink-muted">A distinct local reviewer can examine submitted Decision DNA and source excerpts, then approve or reject them. Approval gates retrieval and Knowledge Tree visibility.</p>
    </header>
    <KnowledgeWorkflowStatus />
    {DATA_MODE!=='http'&&<p className="glass p-3 text-sm text-gold">Reviewer workflows require Local API mode, not the fictional mock showcase.</p>}
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRoundCheck className="size-5 text-violet"/> Reviewer access</h2>
      <p className="mt-1 text-xs text-ink-muted">Use only a locally generated reviewer demo key, never the expert key or production credentials. The key is held in memory only; it is not persisted or put in the URL.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input type="password" autoComplete="off" aria-label="Reviewer demo key" className="neu-inset min-w-0 flex-1 rounded-lg p-3 text-sm" value={key} onChange={e=>{setKey(e.target.value);setDocs([]);setLessons([]);setSelectedDoc(null);setSelectedLesson(null);setNotice('')}} placeholder="Reviewer key in private .env"/>
        <button type="button" onClick={()=>void load()} disabled={!key.trim()||busy} className="btn-primary rounded-lg px-4 py-3 text-sm disabled:opacity-50">{busy?'Working…':'Load review queue'}</button>
        <button type="button" onClick={()=>{setKey('');setDocs([]);setLessons([]);setSelectedDoc(null);setSelectedLesson(null)}} className="tap rounded-lg border border-line px-3 py-3 text-xs">Clear access</button>
      </div>
      {error&&<p role="alert" className="mt-3 text-sm text-coral">{error}</p>}
      {notice&&<p role="status" className="mt-3 text-sm text-teal">{notice}</p>}
    </section>
    <section className="glass p-5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>setTab('lessons')} className={`tap rounded-lg border px-3 py-2 text-sm ${tab==='lessons'?'border-cyan text-cyan':'border-line text-ink-muted'}`}>Decision DNA · {lessons.length}</button>
        <button type="button" onClick={()=>setTab('sources')} className={`tap rounded-lg border px-3 py-2 text-sm ${tab==='sources'?'border-cyan text-cyan':'border-line text-ink-muted'}`}>Source excerpts · {docs.length}</button>
      </div>
      {!lessons.length&&!docs.length?<p className="mt-4 text-sm text-ink-muted">{key.trim()
        ? 'Queue empty or not loaded. Click Load review queue to check current submitted lessons and documents. Approved records are already in Library and Knowledge Tree.'
        : 'Enter a valid reviewer key and load the queue. Submitted records appear here; approved records remain searchable in Library.'}</p>:null}
      {tab==='lessons'&&<div className="mt-3 grid gap-3">
        {lessons.map(l=><button key={l.id} type="button" onClick={()=>{setSelectedLesson(l);setSelectedDoc(null);setNotes('')}} className="tap glass-sub p-4 text-left">
          <p className="text-sm font-semibold">{l.symptoms}</p>
          <p className="mt-1 text-xs text-ink-muted">{l.incident_id} · {l.evidence_ids.join(', ')} · submitted</p>
        </button>)}
      </div>}
      {tab==='sources'&&<div className="mt-3 grid gap-3">
        {docs.map(d=><button key={d.id} type="button" onClick={()=>void openDocument(d.id)} className="tap glass-sub p-4 text-left">
          <p className="text-sm font-semibold">{d.title}</p>
          <p className="mt-1 text-xs text-ink-muted">{d.source_kind} · {d.release} · {d.section}</p>
        </button>)}
      </div>}
    </section>
    {(selectedDoc||selectedLesson)&&<section className="glass border border-violet/30 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardCheck className="size-5 text-teal"/> Independent review details</h2>
      {selectedLesson&&<div className="mt-3 grid gap-3 text-sm">
        <p><strong>Incident:</strong> {selectedLesson.incident_id}</p>
        <p><strong>Author label:</strong> {selectedLesson.author_alias} (identity not verified)</p>
        <p><strong>Symptoms:</strong> {selectedLesson.symptoms}</p>
        <p><strong>Reasoning:</strong> {selectedLesson.reasoning}</p>
        <p><strong>Rejected action:</strong> {selectedLesson.rejected_action}</p>
        <p><strong>Prerequisites:</strong> {selectedLesson.prerequisites.join('; ')}</p>
        <p><strong>Evidence IDs:</strong> {selectedLesson.evidence_ids.join(', ')}</p>
        <p className="text-xs text-ink-faint">Review source event IDs against the corresponding synthetic incident before approval.</p>
      </div>}
      {selectedDoc&&<div className="mt-3 grid gap-3 text-sm">
        <p><strong>Title:</strong> {selectedDoc.title}</p><p><strong>Release/section:</strong> {selectedDoc.release} / {selectedDoc.section}</p>
        <p><strong>Origin:</strong> <span className="break-all font-mono text-xs">{selectedDoc.source_url}</span></p>
        <p className="text-xs text-gold">URL contents, recording provenance and authenticity have NOT been independently verified.</p>
        {selectedDoc.chunks?.map(c=><article key={c.citation_id} className="glass-sub p-3">
          <p className="font-mono text-xs text-cyan">{c.citation_id}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{c.excerpt}</p>
        </article>)}
      </div>}
      <label className="mt-4 block text-sm">Reasoned review notes<textarea rows={3} className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" maxLength={700} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Explain what was checked, remaining gaps, and whether this is acceptable for synthetic training…"/></label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['approved','rejected'] as Decision[]).map(d=><button key={d} type="button" disabled={busy||notes.trim().length<10} onClick={()=>void review(selectedDoc?'sources':'lessons',(selectedDoc?.id??selectedLesson?.id) as string,d)} className={`tap rounded-lg border px-4 py-3 text-sm font-semibold disabled:opacity-50 ${d==='approved'?'border-teal/40 text-teal':'border-coral/40 text-coral'}`}>{d==='approved'?'Approve for local training':'Reject with notes'}</button>)}
      </div>
      <p className="mt-3 flex gap-2 text-xs text-ink-faint"><ShieldCheck className="size-4 shrink-0"/>Demo keys do not verify the human's employment or credentials. Never treat local approval as production authorization.</p>
    </section>}
  </div>
}
