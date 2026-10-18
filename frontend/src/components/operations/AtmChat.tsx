import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Bot, BookOpen, BrainCircuit, CircleAlert, MapPin,
  MessageCircle, Send, ShieldCheck, TerminalSquare, UserRound,
} from 'lucide-react'
import './AtmChat.css'
import { DATA_MODE } from '@/api/client'
import { assertSyntheticAtmChat } from '@/api/atm-guard'
import { workflowRequest } from '@/api/workflows'
import { useIncidentContext } from '@/app/IncidentContext'

type Mode = 'auto' | 'frontline' | 'engineer'
interface AtmSite {
  id:string; location:string;zone:string;x:number;y:number
  status:'nominal'|'attention';live_connected:false
}
interface Match {
  lesson_id:string;title:string;reasoning_preview:string
  review_status:'approved';evidence_ids:string[];match_reason:string
}
interface Network {
  sites:AtmSite[];attention_count:number;map_type:string
  approved_knowledge_matches:Match[]
  fictional_history_examples:{id:string;title:string;expert_approach:string;status:string}[]
  production_connectivity:false
}
interface Preview {
  input:string;adapter:string;status:string;evidence_origin:string
  native_tool_status:string;observations:Record<string,unknown>[];connected:false
}
interface Investigation {
  status:string;headline:string;explanation:string
  steps:{title:string;instruction:string;evidence_ids:string[]}[]
  source_previews:Preview[];approved_knowledge_matches:Match[]
  unknowns?:string[]
}
interface ChatReply {
  status:string;synthetic:true;mode:'local_rule_based_atm_router'
  production_connectivity:false;execution_allowed:false;state_change_executed:false
  answer:string;selected_atm_id:string|null
  audience:'frontline'|'engineer'|null;audience_basis?:string
  network:Network|null;investigation:Investigation|null;map_triggered:boolean
}
interface Turn {
  id:number;role:'operator'|'assistant';text:string
  reply?:ChatReply
}
const SUGGESTIONS=[
  'Which ATM is broken, and where is it?',
  'Our cash machine is down. What should I do?',
  'Show EMS and CPU evidence for ATM-042.',
  'Have we learned anything from similar ATM incidents?',
]
const AUDIENCES:{id:Mode;label:string}[]=[
  {id:'auto',label:'Adapt automatically'},
  {id:'frontline',label:'Plain language'},
  {id:'engineer',label:'Engineer'},
]

/** Inline rich response: map, source drilldown and review-gated knowledge. */
function ChatResult({data, onPick}:{
  data:ChatReply;onPick:(id:string)=>void
}){
  const {navigate}=useIncidentContext()
  const network=data.network
  const investigation=data.investigation
  return <div className="mt-3 space-y-3" aria-label="CAIL interactive ATM response">
    <p className="text-sm leading-relaxed">{data.answer}</p>
    {data.audience&&<p className="text-[11px] text-ink-faint">
      Response style: {data.audience==='engineer'?'Technical engineer':'Frontline operator'} · {data.audience_basis?.replaceAll('_',' ')}
    </p>}
    {network&&<section className="atm-map-reveal overflow-hidden rounded-xl border border-cyan/30 bg-[#091c2b] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-cyan"><MapPin className="size-4"/> ATM incident locator</h4>
        <span className="rounded-lg bg-coral/15 px-2 py-1 text-xs font-semibold text-coral">
          {network.attention_count} synthetic warning
        </span>
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">Fictional district diagram · positions are NOT GPS coordinates</p>
      <div className="atm-map-canvas relative mt-3 aspect-[1.8] min-h-[180px] overflow-hidden rounded-xl border border-line bg-[#0a2334]">
        <svg viewBox="0 0 800 440" preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 size-full" aria-hidden="true">
          <path d="M0 90 H800 M0 220 H800 M0 380 H800 M150 0 V440 M365 0 V440 M620 0 V440"
            stroke="#22536a" strokeWidth="12" opacity=".65"/>
          <path d="M-20 355 Q170 175 360 250 T850 65" stroke="#1e8195"
            strokeWidth="18" opacity=".28" fill="none"/>
          <path d="M15 260 L240 150 L480 220 L700 80" stroke="#47c9dc"
            strokeWidth="2" opacity=".45" strokeDasharray="10 10" fill="none"/>
          <text x="36" y="43" fontSize="16" fill="#87a7b7">FICTIONAL METRO DISTRICT</text>
        </svg>
        {network.sites.map((site,index)=><button type="button" key={site.id}
          aria-label={'Inspect '+site.id+' '+site.location}
          title={site.id+' — '+site.location}
          style={{
            left:site.x+'%',top:site.y+'%',
            // Pins appear after the map has begun revealing; the affected ATM
            // enters last so the incident visually becomes the focal point.
            animationDelay:site.status==='attention'
              ? '1050ms, 1550ms'
              : (620+index*100)+'ms',
          }}
          onClick={()=>onPick(site.id)}
          className={'atm-pin tap absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 p-2 shadow-lg focus:outline-2 focus:outline-white '+
            (site.status==='attention'
              ? 'atm-pin-alert border-white bg-coral text-white ring-8 ring-coral/20'
              : 'border-cyan/50 bg-emerald text-midnight')+
            (data.selected_atm_id===site.id?' atm-pin-selected outline-2 outline-offset-2 outline-cyan':'')}>
          <MapPin className="size-4" aria-hidden="true"/>
        </button>)}
      </div>
      <p className="mt-3 text-xs font-medium text-ink-muted">
        Selected: <span className="text-cyan">{data.selected_atm_id}</span>
        {' · '}Red = fictional warning, green = fictional normal baseline
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {network.sites.map(site=><button key={site.id} type="button"
          onClick={()=>onPick(site.id)}
          className={'tap rounded-lg border px-2 py-1 text-[11px] '+
            (data.selected_atm_id===site.id?'border-cyan text-cyan':'border-line text-ink-muted')}>
          <span className={site.status==='attention'?'text-coral':'text-emerald'}>●</span>
          {' '+site.id+' · '+site.location}
        </button>)}
      </div>
    </section>}
    {investigation&&<section className="rounded-xl border border-line p-3">
      <h4 className="text-sm font-semibold">{investigation.headline}</h4>
      {investigation.steps.length>0&&<ol className="mt-3 space-y-2">
        {investigation.steps.map((step,i)=><li key={step.title} className="rounded-lg bg-white/[0.03] p-3">
          <p className="text-sm font-semibold">{i+1}. {step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{step.instruction}</p>
          <p className="mt-1 font-mono text-[11px] text-cyan">Evidence: {step.evidence_ids.join(', ')}</p>
        </li>)}
      </ol>}
      {!!investigation.source_previews.length&&<div className="mt-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <TerminalSquare className="size-4"/> Existing-tool adapter results
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {investigation.source_previews.map(source=><details key={source.input}
            className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-xs font-semibold text-cyan">
              {source.adapter.toUpperCase()} · {source.observations.length} fictional records
            </summary>
            <p className="mt-2 font-mono text-[11px]">{source.input}</p>
            <p className="mt-2 text-[11px] text-gold">Real subsystem: {source.native_tool_status.toUpperCase()} · Not connected</p>
            {source.observations.length>0
              ? <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-words text-[11px] text-ink-muted">{JSON.stringify(source.observations,null,2)}</pre>
              : <p className="mt-2 text-xs text-ink-muted">No actual native output available.</p>}
          </details>)}
        </div>
      </div>}
      {!!investigation.unknowns?.length&&<p className="mt-3 flex items-start gap-2 text-xs text-gold">
        <CircleAlert className="mt-0.5 size-4 shrink-0"/>
        Unverified: {investigation.unknowns.slice(0,3).join('; ')}
      </p>}
    </section>}
    {network&&<section className="rounded-xl border border-violet/30 p-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-violet"/>
        Similar reviewed operational knowledge
      </h4>
      {network.approved_knowledge_matches.length===0?
        <p className="mt-2 text-xs text-gold">No independently approved matching Decision DNA yet. CAIL will not invent a previous repair.</p>:
        network.approved_knowledge_matches.map(lesson=><article key={lesson.lesson_id} className="mt-2 rounded-lg bg-violet/5 p-3">
          <p className="text-xs font-semibold text-teal">Approved local lesson · Not a verified ATM repair</p>
          <p className="mt-1 text-sm font-semibold">{lesson.title}</p>
          <p className="mt-1 text-xs text-ink-muted">{lesson.reasoning_preview}</p>
          <p className="mt-1 font-mono text-[11px] text-cyan">{lesson.evidence_ids.join(', ')}</p>
        </article>)
      }
      <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted">
        <summary className="cursor-pointer">Show fictional unreviewed historical examples</summary>
        {network.fictional_history_examples.map(e=><p key={e.id} className="mt-2">
          <span className="font-semibold text-gold">{e.title}:</span> {e.expert_approach}
        </p>)}
      </details>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={()=>navigate('tree')} className="tap text-xs text-cyan underline">
          Open approved Knowledge Tree →
        </button>
        <button type="button" onClick={()=>navigate('atm')} className="tap text-xs text-cyan underline">
          Open complete ATM investigation →
        </button>
      </div>
    </section>}
    <p className="text-[11px] text-ink-faint">
      Synthetic simulation; citation identifiers do not prove causality or a genuine repair.
      No native command was executed.
    </p>
  </div>
}

export function AtmChat({incomingPrompt, promptToken, compact=false}:{
  incomingPrompt?:string;promptToken?:number;compact?:boolean
}){
  const { navigate }=useIncidentContext()
  const [input,setInput]=useState('')
  const [mode,setMode]=useState<Mode>('auto')
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [messages,setMessages]=useState<Turn[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const busy=useRef(false)
  const counter=useRef(0)
  const previousToken=useRef<number|undefined>(undefined)
  const latestReplyRef=useRef<HTMLDivElement|null>(null)

  async function send(text:string,selectedMode:Mode=mode,overrideId?:string){
    const clean=text.trim()
    if(!clean||clean.length<3||clean.length>500||busy.current||DATA_MODE!=='http')return
    busy.current=true;setLoading(true);setError('')
    setMessages(old=>[...old,{id:++counter.current,role:'operator',text:clean}])
    setInput('')
    try{
      const data=await workflowRequest<ChatReply>('/operations/atm/chat','POST',{
        question:clean,audience_mode:selectedMode,
        selected_atm_id:overrideId??selectedId,
      })
      assertSyntheticAtmChat(data)
      if(data.selected_atm_id)setSelectedId(data.selected_atm_id)
      setMessages(old=>[...old,{id:++counter.current,role:'assistant',text:data.answer,reply:data}])
    }catch(err){
      const message=err instanceof Error?err.message:String(err)
      setError(message)
      setMessages(old=>[...old,{id:++counter.current,role:'assistant',
        text:'The local ATM training lookup could not complete. No system action was taken.'}])
    }finally{
      busy.current=false;setLoading(false)
    }
  }
  useEffect(()=>{
    if(promptToken!==undefined&&promptToken!==previousToken.current&&incomingPrompt){
      previousToken.current=promptToken
      void send(incomingPrompt)
    }
    // incoming prompts are event tokens, never re-run because local chat state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[promptToken,incomingPrompt])

  useEffect(()=>{
    // Stage-demo usability: when the assistant creates a map, surface it
    // immediately instead of leaving the screen at the Send button.
    if(messages.length>0 && messages[messages.length-1].role==='assistant'){
      latestReplyRef.current?.scrollIntoView({behavior:'smooth',block:'start'})
    }
  },[messages])

  return <section aria-label="Ask CAIL conversational ATM assistant"
    className={'glass glow-cyan '+(compact?'p-4 sm:p-5':'p-5 sm:p-7')}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
          CAIL / Nonstop AI Operations Assistant
        </p>
        <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold sm:text-2xl">
          <MessageCircle className="size-5 text-cyan"/> Ask CAIL · Interactive Operations Chat
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          Describe an ATM problem naturally. CAIL selects the fictional terminal,
          displays its map, inspects existing synthetic tools, and retrieves only
          reviewer-approved operational knowledge.
        </p>
      </div>
      <span className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
        <ShieldCheck className="mr-1 inline size-4"/> Offline · Read-only
      </span>
    </header>

    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Explanation level">
      {AUDIENCES.map(option=><button key={option.id} type="button"
        aria-pressed={mode===option.id} onClick={()=>setMode(option.id)}
        className={'tap rounded-lg border px-3 py-2 text-xs font-medium '+
          (mode===option.id?'border-cyan bg-cyan/10 text-cyan':'border-line text-ink-muted')}>
        {option.label}
      </button>)}
    </div>
    <p className="mt-2 text-[11px] text-ink-faint">
      Auto detects technical terms such as PATHCOM, EMS and CPU.
      It is bounded keyword routing, not permission to run commands.
    </p>
    <div className="mt-4 flex max-h-[760px] flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-midnight/30 p-3 sm:p-4" aria-live="polite">
      {messages.length===0&&<div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4">
        <div className="flex items-center gap-2"><Bot className="size-5 text-cyan"/><p className="text-sm font-semibold">CAIL is ready.</p></div>
        <p className="mt-2 text-sm text-ink-muted">
          Ask: “Which ATM is down and where?” The answer becomes a clickable
          map with source evidence and related approved knowledge—not just text.
        </p>
      </div>}
      {messages.map(message=><div key={message.id}
        className={'flex '+(message.role==='operator'?'justify-end':'justify-start')}>
        <div ref={message.role==='assistant' && message.id===messages[messages.length-1]?.id?latestReplyRef:undefined}
          className={'min-w-0 rounded-2xl p-3 sm:p-4 '+
          (message.role==='operator'
            ? 'max-w-[90%] border border-cyan/30 bg-cyan/10'
            : 'w-full border border-line bg-white/[0.03]')}>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-ink-faint">
            {message.role==='operator'?<UserRound className="size-4"/>:<Bot className="size-4 text-cyan"/>}
            {message.role==='operator'?'Operator':'CAIL assistant'}
          </p>
          {message.reply?<ChatResult data={message.reply}
            onPick={id=>{void send('What is happening with '+id+'?',mode,id)}}/>:
            <p className="mt-2 text-sm leading-relaxed">{message.text}</p>}
        </div>
      </div>)}
      {loading&&<p className="flex items-center gap-2 text-xs text-cyan">
        <BrainCircuit className="size-4 animate-pulse"/> Routing to local synthetic tool adapters…
      </p>}
    </div>
    {error&&<p className="mt-3 text-xs text-coral" role="alert">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {SUGGESTIONS.map(example=><button key={example} type="button"
        disabled={loading||DATA_MODE!=='http'} onClick={()=>void send(example)}
        className="tap rounded-lg border border-line px-3 py-2 text-xs text-ink-muted hover:text-cyan disabled:opacity-50">
        {example}
      </button>)}
    </div>
    <form className="mt-3 flex flex-col gap-2 sm:flex-row"
      onSubmit={e=>{e.preventDefault();void send(input)}}>
      <label htmlFor={compact?'cail-atm-chat-compact':'cail-atm-chat'} className="sr-only">
        Ask CAIL a question about an ATM
      </label>
      <input id={compact?'cail-atm-chat-compact':'cail-atm-chat'}
        value={input} maxLength={500} onChange={e=>setInput(e.target.value)}
        placeholder="Ask CAIL: which ATM failed, why, and what should I check?"
        className="neu-inset min-w-0 flex-1 rounded-xl px-4 py-3 text-sm"/>
      <button type="submit" disabled={loading||input.trim().length<3||DATA_MODE!=='http'}
        className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-50">
        <Send className="size-4"/> {loading?'Checking…':'Send to CAIL'}
      </button>
    </form>
    {DATA_MODE!=='http'&&<p className="mt-2 text-xs text-gold">
      Switch to Local API · Synthetic mode to use the conversational map.
    </p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <p className="text-[11px] text-ink-faint">
        Demo locations and history are fictional. No live GPS, bank systems or HPE connectivity.
      </p>
      <button type="button" onClick={()=>navigate('atm')}
        className="tap inline-flex items-center gap-1 text-xs text-cyan underline">
        Full ATM workflow <ArrowRight className="size-3"/>
      </button>
    </div>
  </section>
}
