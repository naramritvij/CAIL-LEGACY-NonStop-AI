import { useEffect, useState } from 'react'
import { BookOpen, FileText, Search, Send, ShieldCheck } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { KnowledgeWorkflowStatus } from '@/components/knowledge/KnowledgeWorkflowStatus'
import { workflowRequest, type CorpusRecord, type DecisionLesson } from '@/api/workflows'

type Match = { citation_id:string;title:string;excerpt:string;source_url:string;section:string;release:string;source_kind:string;content_verified_against_url:boolean }
type CorpusSearch = {status:string;matches:Match[];retrieval_method:string}
type Kind = 'document' | 'transcript'

function validSource(url:string) { return /^https:\/\/support\.hpe\.com\/hpesc\/public\/docDisplay\?/.test(url) }

export function LibraryPage() {
  const [docs,setDocs]=useState<CorpusRecord[]>([])
  const [lessons,setLessons]=useState<DecisionLesson[]>([])
  const [loading,setLoading]=useState(true)
  const [err,setErr]=useState('')
  const [query,setQuery]=useState('disk')
  const [release,setRelease]=useState('L23.08')
  const [results,setResults]=useState<Match[]>([])
  const [searched,setSearched]=useState(false)
  const [lastSearch,setLastSearch]=useState('')
  const [kind,setKind]=useState<Kind>('document')
  const [title,setTitle]=useState('')
  const [section,setSection]=useState('')
  const [source,setSource]=useState('https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us&docLocale=en_US')
  const [content,setContent]=useState('')
  const [expertKey,setExpertKey]=useState('')
  const [authorized,setAuthorized]=useState(false)
  const [redacted,setRedacted]=useState(false)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  async function refresh() {
    if (DATA_MODE!=='http') return
    setLoading(true);setErr('')
    try {
      const [d,l]=await Promise.all([
        workflowRequest<CorpusRecord[]>('/knowledge/corpus/documents?status=approved&limit=100'),
        workflowRequest<DecisionLesson[]>('/knowledge/lessons?status=approved'),
      ])
      setDocs(d);setLessons(l)
    } catch(e) {setErr(String(e))}
    finally{setLoading(false)}
  }
  useEffect(()=>{void refresh()},[])
  async function search() {
    setErr('');setBusy(true);setSearched(false)
    try {
      const result=await workflowRequest<CorpusSearch>('/knowledge/corpus/search','POST',{query,release,limit:8})
      setResults(result.matches)
      setSearched(true)
      setLastSearch(query.trim()+' · '+release.trim())
    }catch(e){setErr(String(e))}
    finally{setBusy(false)}
  }
  async function ingest() {
    setErr('');setNotice('');setBusy(true)
    try {
      if (!authorized) throw new Error('Confirm that you are authorized to store this source text.')
      if (kind==='transcript'&&!redacted) throw new Error('Confirm transcript redaction before submitting.')
      const body = kind==='document' ? {
        title,source_url:source,release,section,content,acknowledged_authorization:authorized,
      } : {
        title,recording_reference:source,release,section,content,
        acknowledged_authorization:authorized,redaction_confirmed:redacted,
      }
      if (kind==='document'&&!validSource(source)) throw new Error('The current adapter accepts only the specified public HPE support document URL pattern.')
      const intakePath=kind==='document'?'/knowledge/corpus/documents':'/knowledge/transcripts'
      const draft=await workflowRequest<{document_id:string}>(intakePath,'POST',body,'expert',expertKey)
      await workflowRequest<unknown>(
        '/knowledge/corpus/documents/'+encodeURIComponent(draft.document_id)+'/submit',
        'POST',undefined,'expert',expertKey,
      )
      setNotice('Submitted as a local, unverified '+kind+' for separate mentor review. Document ID: '+draft.document_id)
      setExpertKey('');setContent('');setAuthorized(false);setRedacted(false)
    }catch(e){setErr(String(e))}
    finally{setBusy(false)}
  }
  return <div className="flex flex-col gap-5">
    <header className="glass p-6">
      <p className="text-xs font-semibold tracking-widest text-cyan uppercase">Knowledge Engine</p>
      <h1 className="mt-1 text-2xl font-semibold">Library · Approved Sources & Decision DNA</h1>
      <p className="mt-2 text-sm text-ink-muted">Search approved local excerpts and lessons. Submit authorized source text for independent review. No URL downloads, recording capture, or automatic approval.</p>
    </header>
    <KnowledgeWorkflowStatus />
    {DATA_MODE!=='http'&&<p className="glass p-4 text-sm text-gold">Switch to Local API · Synthetic mode to use review and retrieval workflows.</p>}
    {err&&<p role="alert" className="glass border border-coral/40 p-3 text-sm text-coral">{err}</p>}
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="size-5 text-teal"/> Approved corpus & lessons</h2>
      <p className="mt-1 text-xs text-ink-muted">Only approved records appear here; local approval is not proof of HPE authenticity or operational applicability.</p>
      <button type="button" onClick={()=>void refresh()} className="tap mt-3 rounded-lg border border-line px-3 py-2 text-xs">Refresh approved records</button>
      {loading?<p className="mt-3 text-sm text-ink-muted">Loading…</p>:<>
        <p className="mt-3 text-sm font-medium">{docs.length} source(s) · {lessons.length} approved lesson(s)</p>
        {docs.length===0&&lessons.length===0&&<p className="mt-2 text-sm text-ink-muted">Nothing approved yet. Use the intake and mentor review journey below.</p>}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {docs.map(d=><article key={d.id} className="glass-sub p-3">
            <p className="text-sm font-semibold">{d.title}</p><p className="mt-1 text-xs text-ink-muted">{d.release} · {d.section} · {d.source_kind}</p>
            {d.source_url.startsWith('https://support.hpe.com/')&&<a className="mt-1 block text-xs text-cyan underline" href={d.source_url} target="_blank" rel="noopener noreferrer">Open referenced HPE page ↗</a>}
          </article>)}
          {lessons.map(l=><article key={l.id} className="glass-sub p-3">
            <p className="text-sm font-semibold">{l.symptoms}</p><p className="mt-1 text-xs text-ink-muted">{l.incident_id} · {l.evidence_ids.join(', ')} · approved locally</p>
            <p className="mt-2 text-xs text-ink-muted">{l.reasoning.slice(0,240)}</p>
          </article>)}
        </div>
      </>}
    </section>
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Search className="size-5 text-cyan"/> Search reviewed excerpts</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_8rem_auto]">
        <input aria-label="Search question" className="neu-inset min-w-0 rounded-lg p-3 text-sm" value={query} onChange={e=>setQuery(e.target.value)} placeholder="disk, Pathway, NonStop…"/>
        <input aria-label="HPE release" className="neu-inset min-w-0 rounded-lg p-3 text-sm" value={release} onChange={e=>setRelease(e.target.value)}/>
        <button type="button" disabled={busy||query.trim().length<3} onClick={()=>void search()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">Search</button>
      </div>
      {results.length===0?<p className="mt-3 text-sm text-ink-muted">{searched
        ? 'No approved excerpts match '+lastSearch+'. Try another term or release; unapproved text is never returned.'
        : 'Enter a query and click Search. Only reviewer-approved local excerpts are searchable.'}</p>:
      <div className="mt-3 flex flex-col gap-3">{results.map(m=><article key={m.citation_id} className="glass-sub p-3 text-sm">
        <p className="font-semibold">{m.title} <span className="font-mono text-xs text-cyan">{m.citation_id}</span></p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-muted">{m.excerpt}</p>
        <p className="mt-2 text-xs text-ink-faint">Locally reviewed · not independently authenticated · {m.release}</p>
        {m.source_url.startsWith('https://support.hpe.com/')&&<a className="text-xs text-cyan underline" href={m.source_url} target="_blank" rel="noopener noreferrer">Referenced HPE document ↗</a>}
      </article>)}</div>}
    </section>
    <section className="glass p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><FileText className="size-5 text-violet"/> Submit knowledge for independent review</h2>
      <p className="mt-2 text-xs text-ink-muted">Paste short permitted excerpts or redacted transcripts (80–12,000 characters). Do not paste credentials, customer data or proprietary content without authorization.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['document','transcript'] as Kind[]).map(k=><button key={k} type="button" onClick={()=>{setKind(k);setSource(k==='document'?'https://support.hpe.com/hpesc/public/docDisplay?docId=a00099017en_us&docLocale=en_US':'synthetic-demo-session')}} className={`tap rounded-lg border px-3 py-2 text-sm ${kind===k?'border-cyan text-cyan':'border-line text-ink-muted'}`}>{k==='document'?'HPE excerpt':'Redacted transcript'}</button>)}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Title<input className="neu-inset mt-1 w-full rounded-lg p-3" value={title} maxLength={160} onChange={e=>setTitle(e.target.value)}/></label>
        <label className="text-sm">Applicable release<input className="neu-inset mt-1 w-full rounded-lg p-3" value={release} onChange={e=>setRelease(e.target.value)}/></label>
        <label className="text-sm">Section/topic<input className="neu-inset mt-1 w-full rounded-lg p-3" value={section} maxLength={120} onChange={e=>setSection(e.target.value)}/></label>
        <label className="text-sm">{kind==='document'?'HPE source URL':'Recording/session reference'}<input className="neu-inset mt-1 w-full rounded-lg p-3" value={source} onChange={e=>setSource(e.target.value)}/></label>
      </div>
      <label className="mt-3 block text-sm">Authorized source text<textarea className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" rows={7} maxLength={12000} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste only text you are permitted to store and review…"/></label>
      <label className="mt-3 flex gap-2 text-xs"><input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>I confirm permission to store this text in the local review corpus.</label>
      {kind==='transcript'&&<label className="mt-2 flex gap-2 text-xs"><input type="checkbox" checked={redacted} onChange={e=>setRedacted(e.target.checked)}/>I confirm the transcript has been reviewed and sensitive information removed.</label>}
      <label className="mt-3 block text-sm">Local expert demo key<input type="password" autoComplete="off" className="neu-inset mt-1 w-full rounded-lg p-3" value={expertKey} onChange={e=>setExpertKey(e.target.value)}/></label>
      {notice&&<div role="status" className="mt-3 rounded-lg border border-teal/30 p-3">
        <p className="text-sm text-teal">{notice}</p>
        <a href="#/mentor" className="mt-2 inline-block text-xs text-cyan underline">Open Mentor to review this submission →</a>
      </div>}
      <button type="button" disabled={busy||content.trim().length<80||title.trim().length<5||section.trim().length<3||!authorized} onClick={()=>void ingest()} className="btn-primary mt-4 inline-flex items-center gap-2 rounded-xl p-3 text-sm disabled:opacity-50"><Send className="size-4"/> {busy?'Submitting…':'Create draft and send to Mentor'}</button>
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-faint"><ShieldCheck className="size-4"/> Expert key stays only in temporary component state and is cleared on successful submission. Approval requires a different reviewer key.</p>
    </section>
  </div>
}
