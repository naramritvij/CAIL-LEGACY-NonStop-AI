import { IncidentProvider } from '@/app/IncidentContext'
import { AtmChat } from '@/components/operations/AtmChat'
import { ShieldCheck, GitBranch, MapPin, BookOpen, Activity } from 'lucide-react'

/** Separate, publicly shareable static rehearsal. Does not load FastAPI or Ollama. */
export function PublicDemoApp(){
  return <IncidentProvider>
    <div className="min-h-screen bg-midnight px-3 py-6 text-ink sm:px-6 lg:py-10">
      <div className="mx-auto max-w-[1140px]">
        <header className="glass glow-cyan mb-5 overflow-hidden p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan">
            CAIL / Nonstop AI Operations Assistant
          </p>
          <h1 className="mt-3 max-w-3xl text-2xl font-semibold sm:text-4xl">
            From an ATM problem to a visual operational investigation.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted sm:text-base">
            Interactive investor rehearsal: locate an affected fictional ATM, inspect
            linked simulated evidence, compare how the assistant explains the issue
            to different operators, and explore how expert knowledge can be preserved.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
            {['Locate','Investigate','Retrieve','Assist','Learn'].map((x,i)=>
              <span key={x} className="rounded-lg border border-cyan/20 bg-cyan/5 px-3 py-2">
                <span className="mr-1 text-cyan">{i+1}.</span>{x}
              </span>)}
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs leading-relaxed text-gold">
            <ShieldCheck className="mt-0.5 size-4 shrink-0"/>
            PUBLIC STATIC DEMO · All ATMs, locations, monitoring records and example histories
            are fictional. Scripted rule-based responses run in your browser. No live bank,
            CAIL Suite, HPE NonStop, LLM or approved customer records are connected.
          </div>
        </header>
        <AtmChat />
        <section className="glass mt-5 p-5 sm:p-7" aria-label="Solution demonstration boundaries">
          <h2 className="text-lg font-semibold">Why this is more than a chatbot</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="glass-sub p-4">
              <MapPin className="size-5 text-cyan"/>
              <p className="mt-2 text-sm font-semibold">Locate & correlate</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">Find the fictional ATM-042 and expand offline EMS, ASAP and process-monitoring examples.</p>
            </div>
            <div className="glass-sub p-4">
              <Activity className="size-5 text-violet"/>
              <p className="mt-2 text-sm font-semibold">Explain appropriately</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">Ask with plain language or technical terms. The same fictional evidence leads to different explanations.</p>
            </div>
            <div className="glass-sub p-4">
              <BookOpen className="size-5 text-teal"/>
              <p className="mt-2 text-sm font-semibold">Preserve expert reasoning</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">The full local prototype has a separate expert submission and reviewer approval gate. This public demo does not simulate an approval.</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-faint">
            <GitBranch className="mt-0.5 size-4 shrink-0"/>
            Full local implementation: FastAPI, reviewer-gated Knowledge Tree,
            synthetic scenario simulator and optional Ollama/Qwen investigations.
            Those backend workflows are not deployed on this static Netlify site.
          </p>
        </section>
        <footer className="mt-5 pb-6 text-center text-xs text-ink-faint">
          CAIL / Nonstop AI Operations Assistant · Illustrative $0 software-cost hackathon prototype
        </footer>
      </div>
    </div>
  </IncidentProvider>
}
