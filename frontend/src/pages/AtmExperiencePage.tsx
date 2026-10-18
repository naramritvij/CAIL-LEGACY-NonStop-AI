import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, CircleHelp, GitBranch,
  MapPin, RefreshCw, Send, Sparkles, TerminalSquare, UserRoundCheck,
} from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { assertSyntheticAtmNetwork, assertSyntheticAtmAssist } from '@/api/atm-guard'
import { workflowRequest, type DecisionLesson } from '@/api/workflows'
import { useIncidentContext } from '@/app/IncidentContext'

type Audience = 'frontline' | 'engineer'
interface AtmSite {
  id:string;location:string;zone:string;x:number;y:number
  status:'nominal'|'attention';live_connected:false
}
interface MatchedLesson {
  lesson_id:string;title:string;reasoning_preview:string
  review_status:'approved';reviewed_at:string;evidence_ids:string[]
  match_reason:string;relation_verified:false
}
interface Example {
  id:string;title:string;shared_signals:string[];expert_approach:string
  status:string
}
interface NetworkData {
  product_name:string;mode:string;map_type:string;sites:AtmSite[]
  attention_count:number;site_event:{id:string;message:string;time:string}
  approved_knowledge_matches:MatchedLesson[]
  fictional_history_examples:Example[]
  tools:{name:string;mode:string;connected:false}[]
  production_connectivity:false;limitations:string
}
interface SourcePreview {
  input:string;adapter:string;route_kind:string;status:string
  evidence_origin:string;native_tool_status:string
  observations:Record<string,unknown>[];connected:false
}
interface AssistData {
  atm_id:string;audience:Audience;status:string;headline:string;explanation:string
  steps:{title:string;instruction:string;evidence_ids:string[]}[]
  source_previews:SourcePreview[];approved_knowledge_matches:MatchedLesson[]
  fictional_history_examples?:Example[];unknowns?:string[]
  production_connectivity:false;execution_allowed:false
  state_change_executed:false;synthetic:true
}
interface AiData {
  synthetic:boolean;status:string;message:string
  claims:{text:string;citations:string[]}[]
  source_registry:{id:string;kind:string;source_text:string}[]
}
const STAGES = ['Locate','Investigate','Retrieve','Assist','Learn']
const DEFAULT_QUESTION = 'An ATM is not responding. Which one and what should I check?'

export function AtmExperiencePage(){
  const { navigate } = useIncidentContext()
  const [network,setNetwork] = useState<NetworkData|null>(null)
  const [selectedId,setSelectedId] = useState('ATM-042')
  const [audience,setAudience] = useState<Audience>('frontline')
  const [question,setQuestion] = useState(DEFAULT_QUESTION)
  const [answer,setAnswer] = useState<AssistData|null>(null)
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [expandedTool,setExpandedTool] = useState<string|null>(null)
  const [showCapture,setShowCapture] = useState(false)
  const [key,setKey] = useState('')
  const [alias,setAlias] = useState('Demo expert')
  const [symptoms,setSymptoms] = useState('Fictional Pathway latency and payment-service warning')
  const [reasoning,setReasoning] = useState('')
  const [captureBusy,setCaptureBusy] = useState(false)
  const [captureNotice,setCaptureNotice] = useState('')
  const [aiResponse,setAiResponse] = useState<AiData|null>(null)
  const [aiBusy,setAiBusy] = useState(false)
  const [aiError,setAiError] = useState('')

  const loadNetwork = useCallback(async()=>{
    try {
      const n = await workflowRequest<NetworkData>('/operations/atm/network')
      assertSyntheticAtmNetwork(n)
      if(n.product_name!=='CAIL / Nonstop AI Operations Assistant')
        throw new Error('Unexpected CAIL product identity.')
      setNetwork(n);setError('')
    } catch(e){setError(String(e))}
  },[])
  useEffect(()=>{if(DATA_MODE==='http')void loadNetwork()},[loadNetwork])

  async function ask(nextAudience:Audience=audience){
    if(DATA_MODE!=='http' || busy || question.trim().length<3)return
    setBusy(true);setError('');setAnswer(null);setExpandedTool(null);setAiResponse(null)
    try{
      const match = question.match(/ATM-[0-9]{3}/i)
      const id = match ? match[0].toUpperCase() : selectedId
      const a = await workflowRequest<AssistData>('/operations/atm/assist','POST',{
        atm_id:id,audience:nextAudience,question:question.trim(),
      })
      assertSyntheticAtmAssist(a)
      setSelectedId(id);setAnswer(a)
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  }

  async function explainWithQwen(){
    setAiBusy(true);setAiError('');setAiResponse(null)
    try{
      const a=await workflowRequest<AiData>('/operations/lab/ask','POST',{
        incident_id:'INC-FIN-HW-003',
        question:'What do the recorded payment latency and Pathway events establish?',
        release:'L23.08',max_chunks:3,
      })
      if(a.synthetic!==true)throw new Error('Untrusted AI source-mode response.')
      setAiResponse(a)
    }catch(e){setAiError(String(e))}
    finally{setAiBusy(false)}
  }

  async function submitLesson(){
    setCaptureNotice('')
    if(!key.trim()) {setCaptureNotice('Enter the local expert demo key.');return}
    if(!reasoning.trim()||reasoning.trim().length<20) {
      setCaptureNotice('Describe the evidence and reasoning in at least 20 characters.');return
    }
    setCaptureBusy(true)
    try{
      // Only canonical Pathway fixture IDs may be submitted here.
      // The ATM heartbeat event is NOT part of that verified registry.
      const draft = await workflowRequest<DecisionLesson>('/knowledge/lessons','POST',{
        incident_id:'INC-PATH-002', author_alias:alias.trim(),
        symptoms:symptoms.trim(),reasoning:reasoning.trim(),
        rejected_action:'Unapproved service restart',
        prerequisites:['Verify actual PATHCOM/PATHMON state','Confirm owner and site-approved runbook'],
        evidence_ids:['SIM-EVT-201','SIM-EVT-202'],previous_lesson_id:null,
      },'expert',key)
      await workflowRequest<DecisionLesson>(
        '/knowledge/lessons/'+encodeURIComponent(draft.id)+'/submit','POST',undefined,'expert',key
      )
      setCaptureNotice('Lesson submitted. It is NOT retrievable yet: a separate Mentor reviewer must approve it.')
      setKey('')
      await loadNetwork()
    }catch(e){setCaptureNotice(String(e))}
    finally{setCaptureBusy(false)}
  }

  const selected = network?.sites.find(s=>s.id===selectedId)
  const approved = answer?.approved_knowledge_matches ?? network?.approved_knowledge_matches ?? []
  const examples = answer?.fictional_history_examples ?? network?.fictional_history_examples ?? []

  return <div className="flex flex-col gap-5">
    <header className="glass glow-cyan p-6 sm:p-7">
      <p className="text-xs font-semibold tracking-[0.18em] text-cyan uppercase">
        CAIL / Nonstop AI Operations Assistant
      </p>
      <h1 className="mt-2 text-2xl font-bold sm:text-3xl">An ATM goes down. CAIL connects the dots.</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
        A working synthetic demonstration of the sponsor scenario: locate a terminal, inspect existing-tool adapters, connect a reviewed lesson, and guide both a frontline employee and an engineer.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((stage,i)=><span key={stage} className="rounded-lg border border-cyan/25 bg-cyan/5 px-3 py-2 text-xs font-medium">
          <span className="mr-2 text-cyan">{i+1}</span>{stage}
        </span>)}
      </div>
      <p className="mt-3 text-xs font-semibold text-gold">
        DEMO ONLY · Fictional district layout and ATM identities · No live ATM, GPS, CAIL Suite or HPE connection
      </p>
    </header>
    {DATA_MODE!=='http'&&<p className="glass p-4 text-gold">Use Local API · Synthetic mode for this interactive workflow.</p>}
    {error&&<p role="alert" className="glass border border-coral/40 p-4 text-sm text-coral">{error}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
      <section className="glass p-5" aria-label="Interactive fictional ATM locator">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="size-5 text-cyan"/> 1. Locate the affected ATM</h2>
          <span className="rounded-xl border border-coral/35 bg-coral/10 px-3 py-1 text-xs font-semibold text-coral">{network?.attention_count??'—'} incident</span>
        </div>
        <p className="mt-1 text-xs text-ink-muted">Fictional Metro District · schematic positions, not real geographic coordinates</p>
        <div className="relative mt-4 aspect-[1.55] min-h-[240px] overflow-hidden rounded-2xl border border-cyan/15 bg-[#091c2b]">
          <svg viewBox="0 0 800 520" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <linearGradient id="map-gradient" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#0e3043"/><stop offset="1" stopColor="#092034"/></linearGradient>
            </defs>
            <rect width="800" height="520" fill="url(#map-gradient)"/>
            <path d="M 0 110 L 800 110 M 0 240 L 800 240 M 0 402 L 800 402 M 120 0 L 120 520 M 345 0 L 345 520 M 600 0 L 600 520" stroke="#255069" strokeWidth="12" opacity=".7"/>
            <path d="M -30 470 Q 200 180 420 280 T 850 30" fill="none" stroke="#1c6f8a" strokeWidth="22" opacity=".4"/>
            <path d="M 80 70 L 270 200 L 496 338 L 616 151 L 720 421" fill="none" stroke="#53c6d4" strokeWidth="2" strokeDasharray="8 10" opacity=".5"/>
            <text x="40" y="57" fill="#6f9ba9" fontSize="17" letterSpacing="3">WEST</text>
            <text x="386" y="58" fill="#6f9ba9" fontSize="17" letterSpacing="3">NORTH DISTRICT</text>
            <text x="48" y="326" fill="#6f9ba9" fontSize="17" letterSpacing="3">SOUTH DISTRICT</text>
            <text x="555" y="489" fill="#6f9ba9" fontSize="17" letterSpacing="3">EAST</text>
          </svg>
          {network?.sites.map(site=><button key={site.id} type="button"
            aria-label={site.id+' '+site.location+' '+site.status}
            aria-pressed={selectedId===site.id}
            onClick={()=>{setSelectedId(site.id);setAnswer(null);setAiResponse(null)}}
            style={{left:site.x+'%',top:site.y+'%'}}
            className={'tap absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] p-2 shadow-xl transition-transform hover:scale-110 focus:outline-2 focus:outline-white '+
              (site.status==='attention'
                ? 'border-white bg-coral text-white ring-8 ring-coral/25'
                : 'border-cyan/50 bg-emerald text-midnight')+
              (selectedId===site.id?' outline-2 outline-offset-4 outline-cyan':'')}
            >
            <MapPin aria-hidden="true" className="size-5 sm:size-6"/>
          </button>)}
          <div className="absolute bottom-3 left-3 rounded-lg bg-midnight/90 px-3 py-2 text-[11px] text-ink-muted">
            <span className="mr-3 text-emerald">● Nominal fixture</span><span className="text-coral">● Attention</span>
          </div>
        </div>
        {network&&<div className="mt-4 grid gap-2 sm:grid-cols-2">
          {network.sites.map(site=><button key={site.id} type="button" onClick={()=>{setSelectedId(site.id);setAnswer(null)}}
            className={'tap rounded-xl border p-3 text-left '+(site.id===selectedId?'border-cyan bg-cyan/10':'border-line bg-white/[0.02]')}>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className={site.status==='attention'?'text-coral':'text-emerald'}>●</span>{site.id}
              <span className="text-xs font-normal text-ink-muted">{site.location}</span>
            </span>
            <span className="mt-1 block text-xs text-ink-faint">{site.zone} · {site.status==='attention'?'Synthetic warning':'Invented nominal fixture'}</span>
          </button>)}
        </div>}
      </section>
      <section className="glass p-5" aria-label="Adaptive operator assistant">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 text-cyan"/> 2. Ask CAIL</h2>
        <p className="mt-2 text-sm text-ink-muted">The same registered evidence, explained for your experience level. Select a terminal on the map or mention its ID.</p>
        <div className="neu-inset mt-4 flex rounded-xl p-1" role="group" aria-label="Explanation audience">
          {([{id:'frontline',name:'Frontline employee'},{id:'engineer',name:'Technical engineer'}] as const).map(x=>
            <button key={x.id} type="button" aria-pressed={audience===x.id}
              onClick={()=>{setAudience(x.id);if(answer)void ask(x.id)}}
              className={'tap flex-1 rounded-lg px-3 py-2 text-xs font-semibold '+(audience===x.id?'bg-royal text-white':'text-ink-muted')}>{x.name}</button>)}
        </div>
        <form className="mt-4" onSubmit={e=>{e.preventDefault();void ask()}}>
          <label htmlFor="atm-question" className="text-xs font-semibold text-ink-muted">What do you need help with?</label>
          <textarea id="atm-question" rows={3} maxLength={500} className="neu-inset mt-2 w-full resize-y rounded-xl p-3 text-sm"
            value={question} onChange={e=>setQuestion(e.target.value)}/>
          <button disabled={busy||DATA_MODE!=='http'||question.trim().length<3} type="submit"
            className="btn-primary mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-50">
            <Send className="size-4"/>{busy?'Inspecting synthetic evidence…':'Find & explain incident'}
          </button>
        </form>
        {selected&&<div className="glass-sub mt-4 p-3">
          <p className="text-xs font-semibold">{selected.id} · {selected.location}</p>
          <p className="mt-1 text-xs text-ink-muted">Mode: {selected.status==='attention'?'synthetic incident requires attention':'no synthetic incident'} · Real-world status unknown</p>
        </div>}
        {answer&&<div role="status" className="mt-4 space-y-3">
          <div className="rounded-xl border border-cyan/30 bg-cyan/5 p-4">
            {answer.status==='guided_synthetic_investigation'&&'interpreted_intent' in answer&&<p className="mb-2 text-[11px] uppercase tracking-widest text-teal">Interpreted request: {String(answer.interpreted_intent).replaceAll('_',' ')}</p>}
          <p className="text-sm font-semibold text-cyan">{answer.headline}</p>
            <p className="mt-2 text-sm leading-relaxed">{answer.explanation}</p>
          </div>
          {answer.steps.map((step,i)=><article key={step.title} className="glass-sub rounded-xl p-3">
            <p className="text-sm font-semibold">{i+1}. {step.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">{step.instruction}</p>
            <p className="mt-2 font-mono text-[11px] text-cyan">Evidence: {step.evidence_ids.join(', ')}</p>
          </article>)}
          {answer.unknowns&&<p className="text-xs text-gold"><AlertTriangle className="mr-1 inline size-4"/> Still unverified: {answer.unknowns.slice(0,3).join('; ')}</p>}
          {answer.status==='blocked_unsafe'&&<p className="text-xs text-coral">No action or tool was executed.</p>}
        </div>}
      </section>
    </div>
    <section className="glass p-5" aria-label="Existing source adapters and evidence">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><TerminalSquare className="size-5 text-cyan"/> 3. Inspect existing operational tools</h2>
      <p className="mt-2 text-sm text-ink-muted">Our read-only CAIL adapter layer reuses the existing synthetic EMS, ASAP and Guardian results. PATHCOM is a published syntax reference with UNKNOWN native status. No real CAIL Suite app is connected.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {(answer?.source_previews??[]).map(source=><div key={source.input} className="glass-sub p-3">
          <p className="text-xs font-semibold text-cyan">{source.adapter.toUpperCase()}</p>
          <p className="mt-1 font-mono text-xs">{source.input}</p>
          <p className="mt-2 text-xs text-ink-muted">{source.observations.length} synthetic records · actual status {source.native_tool_status.toUpperCase()}</p>
          <button type="button" onClick={()=>setExpandedTool(expandedTool===source.input?null:source.input)}
            className="tap mt-2 text-xs font-semibold text-cyan underline">
            {expandedTool===source.input?'Close evidence':'Inspect evidence'}
          </button>
        </div>)}
      </div>
      {answer&&answer.source_previews.length===0&&<p className="mt-3 text-xs text-gold">No source records requested for this response.</p>}
      {!answer&&<p className="mt-3 text-xs text-ink-muted">Ask CAIL about the highlighted incident to retrieve traceable adapter records.</p>}
      {answer?.source_previews.map(source=>
        expandedTool===source.input?<div key={source.input} className="mt-3 overflow-auto rounded-xl border border-line bg-black/20 p-4">
          <p className="text-xs font-semibold text-cyan">{source.input} · local fixture, never native command output</p>
          {source.observations.length===0?<p className="mt-2 text-sm text-gold">UNKNOWN — no authenticated subsystem status.</p>
            :<pre className="mt-2 whitespace-pre-wrap break-words text-xs text-ink-muted">{JSON.stringify(source.observations,null,2)}</pre>}
        </div>:null)}
      <div className="mt-3 flex flex-wrap gap-2">
        {network?.tools.map(tool=><span key={tool.name} className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted">
          {tool.name} · {tool.mode.replaceAll('_',' ')}
        </span>)}
      </div>
      {answer?.status==='guided_synthetic_investigation'&&<div className="mt-4 border-t border-line pt-4">
        <button type="button" onClick={()=>void explainWithQwen()} disabled={aiBusy}
          className="tap rounded-lg border border-violet/30 bg-violet/10 px-4 py-2 text-sm text-violet disabled:opacity-50">
          {aiBusy?'Checking local model…':'Ask local Qwen for a cited backend explanation'}
        </button>
        <p className="mt-2 text-xs text-ink-faint">This optional AI call discusses only the registered financial backend evidence, not verified ATM hardware or physical locations.</p>
        {aiError&&<p role="alert" className="mt-2 text-sm text-coral">{aiError}</p>}
        {aiResponse&&<div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-xs font-semibold">{aiResponse.status.replaceAll('_',' ')}</p>
          <p className="mt-2 text-xs text-ink-muted">{aiResponse.message}</p>
          {aiResponse.claims.map((claim,i)=><p key={i} className="mt-2 text-sm">{claim.text} <span className="font-mono text-xs text-cyan">[{claim.citations.join(', ')}]</span></p>)}
          <p className="mt-2 text-xs text-gold">IDs validated, factual entailment not verified.</p>
        </div>}
      </div>}
    </section>
    <section className="glass p-5" aria-label="Reviewed knowledge and historical examples">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><GitBranch className="size-5 text-violet"/> 4. Retrieve expert knowledge</h2>
        <button type="button" onClick={()=>void loadNetwork()} className="tap inline-flex items-center gap-1 text-xs text-cyan underline"><RefreshCw className="size-3"/> Refresh reviewed knowledge</button>
      </div>
      <p className="mt-2 text-sm text-ink-muted">Only independently approved Decision DNA enters the retrievable Knowledge Tree. Similarity of synthetic symptoms is not proof that a prior fix applies.</p>
      {approved.length>0?<div className="mt-3 grid gap-3 md:grid-cols-2">{approved.map(lesson=><article key={lesson.lesson_id} className="glass-sub p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-teal"><CheckCircle2 className="size-4"/> Approved local lesson</p>
        <p className="mt-2 text-sm font-semibold">{lesson.title}</p>
        <p className="mt-1 text-xs text-ink-muted">{lesson.reasoning_preview}</p>
        <p className="mt-2 text-xs text-gold">{lesson.match_reason}</p>
        <p className="mt-1 font-mono text-xs text-cyan">{lesson.evidence_ids.join(', ')}</p>
      </article>)}</div>:<p className="glass-sub mt-3 p-4 text-sm text-gold">
        No independently reviewed matching lesson yet. The approved Knowledge Tree stays empty until Mentor approves a submission.
      </p>}
      <details className="glass-sub mt-3 p-4">
        <summary className="cursor-pointer text-sm font-semibold">View fictional historical examples (NOT approved or verified)</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {examples.map(item=><article key={item.id} className="rounded-xl border border-line p-3">
            <p className="text-xs font-semibold text-gold">{item.title}</p>
            <p className="mt-1 text-xs text-ink-muted">{item.expert_approach}</p>
            <p className="mt-2 text-xs text-gold">{item.status.replaceAll('_',' ')}</p>
          </article>)}
        </div>
      </details>
      <div className="mt-3 flex flex-wrap gap-3">
        <button onClick={()=>navigate('tree')} type="button" className="tap rounded-lg border border-violet/30 px-4 py-2 text-sm text-violet">Open Knowledge Tree <ArrowRight className="inline size-4"/></button>
        <button onClick={()=>navigate('mentor')} type="button" className="tap rounded-lg border border-line px-4 py-2 text-sm">Open Mentor review</button>
      </div>
    </section>
    <section className="glass p-5" aria-label="Capture and learn from operators">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><BookOpen className="size-5 text-teal"/> 5. Preserve and pass on expert reasoning</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Write a Decision DNA lesson supported by the canonical fictional Pathway events. Submit it using the local expert key. A separate Mentor must approve it before it becomes retrievable here and visible on the Knowledge Tree.
      </p>
      <button type="button" onClick={()=>setShowCapture(!showCapture)} className="tap mt-3 rounded-xl border border-teal/30 bg-teal/10 px-4 py-2 text-sm text-teal">
        {showCapture?'Hide capture form':'Capture a reviewed-knowledge candidate'}
      </button>
      {showCapture&&<div className="mt-4 grid gap-3">
        <label className="text-xs font-semibold">Local expert demo key
          <input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} className="neu-inset mt-1 w-full rounded-lg p-3 text-sm" placeholder="Private expert key, not the reviewer key"/>
        </label>
        <label className="text-xs font-semibold">Expert display alias
          <input value={alias} maxLength={80} onChange={e=>setAlias(e.target.value)} className="neu-inset mt-1 w-full rounded-lg p-3 text-sm"/>
        </label>
        <label className="text-xs font-semibold">Observed Pathway symptoms (canonical training events)
          <textarea rows={2} value={symptoms} maxLength={2000} onChange={e=>setSymptoms(e.target.value)} className="neu-inset mt-1 w-full rounded-lg p-3 text-sm"/>
        </label>
        <label className="text-xs font-semibold">Your reasoning, evidence limits and next safe step
          <textarea rows={4} value={reasoning} maxLength={4000} onChange={e=>setReasoning(e.target.value)} placeholder="Explain how SIM-EVT-201 and SIM-EVT-202 informed your reasoning; do not invent a confirmed fix." className="neu-inset mt-1 w-full rounded-lg p-3 text-sm"/>
        </label>
        <p className="text-xs text-gold">Evidence IDs: SIM-EVT-201 and SIM-EVT-202. The separate fictional ATM heartbeat is not eligible as Pathway lesson evidence. Approval does not verify real identity or a real ATM repair.</p>
        <button type="button" disabled={captureBusy||DATA_MODE!=='http'} onClick={()=>void submitLesson()} className="btn-primary w-fit rounded-lg px-4 py-3 text-sm disabled:opacity-50">
          {captureBusy?'Submitting…':'Submit Decision DNA for independent review'}
        </button>
        {captureNotice&&<p role="status" className="text-sm text-gold">{captureNotice}</p>}
        <button type="button" onClick={()=>navigate('mentor')} className="tap w-fit text-sm text-cyan underline">Continue to Mentor for independent approval →</button>
      </div>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={()=>navigate('apprentice')} className="tap rounded-lg border border-line px-4 py-2 text-sm"><UserRoundCheck className="mr-2 inline size-4"/> Test the knowledge with Apprentice</button>
        <button type="button" onClick={()=>navigate('operations')} className="tap rounded-lg border border-line px-4 py-2 text-sm"><CircleHelp className="mr-2 inline size-4"/> Open the full Operations Lab</button>
      </div>
      <p className="mt-4 text-xs text-ink-faint">
        No real bank data, ATM coordinates, outage diagnosis, live tool session, command execution or measured productivity improvement is represented by this demo.
      </p>
    </section>
  </div>
}
