import { ArrowRight, CircleHelp, Eye, Lightbulb, ShieldCheck, Sparkles } from 'lucide-react'
import type { DeterministicAnalysis } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { EvidenceChip } from '@/components/ui/EvidenceChip'
import { EmptyState } from '@/components/ui/States'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { HYPOTHESIS_META } from './meta'

export type AnalysisTab = 'observations' | 'hypotheses' | 'missing'

interface Props {
  analysis: DeterministicAnalysis
  tab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
  onSelectEvidence: (id: string) => void
  onNext: () => void
}

const NEXT_COPY: Record<AnalysisTab, string> = {
  observations: 'Compare the observations against the candidate hypotheses.',
  hypotheses: 'Identify which missing evidence would confirm or rule out the leading hypothesis.',
  missing: 'Capturing the reasoning as Decision DNA arrives in P1. Review the summary before moving on.',
}

export function AnalysisPanel({ analysis, tab, onTabChange, onSelectEvidence, onNext }: Props) {
  return (
    <section aria-labelledby="analysis-title" className="glass flex flex-col p-5 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Sparkles aria-hidden className="size-5 text-cyan" />
        <h2 id="analysis-title" className="text-xl font-semibold">
          Evidence analysis
        </h2>
        <Badge tone="cyan">Synthetic evidence</Badge>
        <Badge tone="teal" icon={<ShieldCheck aria-hidden className="size-3" />} className="ml-auto">
          Deterministic rules · not AI-generated
        </Badge>
      </header>

      <div className="mt-5">
        <Tabs
          idPrefix="analysis"
          label="Analysis sections"
          value={tab}
          onChange={onTabChange}
          items={[
            { id: 'observations', label: 'Observations', count: analysis.observations.length },
            { id: 'hypotheses', label: 'Hypotheses', count: analysis.hypotheses.length },
            { id: 'missing', label: 'Missing evidence', count: analysis.missing_evidence.length },
          ]}
        />
      </div>

      <div className="mt-5 flex-1">
        {tab === 'observations' && (
          <TabPanel idPrefix="analysis" id="observations">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <img src="/images/legacy-assistant.png" alt="" width={96} height={96} className="size-20 shrink-0 rounded-2xl object-cover sm:size-24" />
              <div>
                <h3 className="text-base font-semibold">{"Here's what the evidence shows"}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-pretty text-ink-muted">{analysis.summary}</p>
              </div>
            </div>
            <div className="glass-sub mt-5 p-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-teal">
                <Eye aria-hidden className="size-4" />
                Observations
                <span className="font-normal text-ink-faint">(from evidence)</span>
              </h4>
              {analysis.observations.length === 0 ? (
                <EmptyState icon={Eye} title="No observations yet" className="py-6">
                  No evidence has been collected that supports a factual observation.
                </EmptyState>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {analysis.observations.map((obs) => (
                    <li key={obs.id} className="flex gap-3 text-sm leading-relaxed">
                      <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-teal shadow-[0_0_8px_var(--color-teal)]" />
                      <span className="min-w-0">
                        <span className="text-ink">{obs.statement}</span>{' '}
                        <span className="inline-flex flex-wrap gap-1 align-middle">
                          {obs.evidence_ids.map((id) => (
                            <EvidenceChip key={id} id={id} onSelect={onSelectEvidence} />
                          ))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabPanel>
        )}

        {tab === 'hypotheses' && (
          <TabPanel idPrefix="analysis" id="hypotheses">
            <p className="mb-4 text-sm text-pretty text-ink-muted">
              Hypotheses are <span className="font-semibold text-violet">possible causes</span>, not conclusions. Each lists the check that would confirm it.
            </p>
            {analysis.hypotheses.length === 0 ? (
              <EmptyState icon={Lightbulb} tone="violet" title="No hypotheses yet">
                There is not yet enough evidence to propose a cause.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {analysis.hypotheses.map((h, i) => {
                  const meta = HYPOTHESIS_META[h.status]
                  return (
                    <li key={h.id} className="glass-sub p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-violet/30 bg-violet/10 text-xs font-semibold text-violet">H{i + 1}</span>
                        <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug sm:text-[15px]">{h.statement}</h3>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-pretty text-ink-muted">{h.rationale}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-ink-faint">Supporting evidence:</span>
                        {h.supporting_evidence_ids.length ? (
                          h.supporting_evidence_ids.map((id) => <EvidenceChip key={id} id={id} onSelect={onSelectEvidence} />)
                        ) : (
                          <span className="text-xs text-amber">none cited</span>
                        )}
                      </div>
                      <p className="neu-inset mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed text-ink-muted">
                        <span className="font-semibold text-cyan">Confirm with: </span>
                        {h.confirm_with}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </TabPanel>
        )}

        {tab === 'missing' && (
          <TabPanel idPrefix="analysis" id="missing">
            <p className="mb-4 text-sm text-pretty text-ink-muted">
              <span className="font-semibold text-gold">Unknowns</span> the evidence cannot answer yet. Treat any conclusion as provisional until they are resolved.
            </p>
            {analysis.missing_evidence.length === 0 ? (
              <EmptyState icon={CircleHelp} tone="gold" title="No open evidence gaps">
                The current evidence covers every question the rules check for.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {analysis.missing_evidence.map((gap) => (
                  <li key={gap.id} className="glass-sub border-dashed border-gold/30 p-4">
                    <h3 className="flex items-start gap-2 text-sm font-semibold leading-snug">
                      <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
                      {gap.question}
                    </h3>
                    <p className="mt-2 pl-6 text-sm leading-relaxed text-pretty text-ink-muted">{gap.why_it_matters}</p>
                    <p className="mt-2 pl-6 text-xs text-ink-faint">
                      Suggested source: <span className="font-mono text-ink-muted">{gap.suggested_source}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabPanel>
        )}
      </div>

      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-violet/25 bg-gradient-to-r from-violet/15 to-royal/10 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-violet/30 bg-violet/15 text-violet">
          <Lightbulb aria-hidden className="size-5" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-pretty">
          <span className="block font-semibold">Next step</span>
          <span className="text-ink-muted">{NEXT_COPY[tab]}</span>
        </p>
        <button type="button" onClick={onNext} className="tap grid size-10 shrink-0 place-items-center rounded-full bg-violet text-midnight shadow-[0_0_24px_-4px_var(--color-violet)] hover:brightness-110">
          <ArrowRight aria-hidden className="size-5" />
          <span className="sr-only">Go to next step</span>
        </button>
      </div>
    </section>
  )
}
