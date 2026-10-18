import { useState } from 'react'
import { BrainCircuit, FileSearch, LoaderCircle, ShieldAlert } from 'lucide-react'
import { api, DATA_MODE } from '@/api/client'
import type { GroundedInvestigationResponse } from '@/api/types'
import { Badge } from '@/components/ui/Badge'

/** User-triggered optional local Ollama request. Never grants or executes any action. */
export function AiInvestigation({ incidentId, onSelectEvidence }: {
  incidentId: string
  onSelectEvidence: (id: string) => void
}) {
  const [question, setQuestion] = useState('What do the recorded synthetic events establish, and what remains unknown?')
  const [response, setResponse] = useState<GroundedInvestigationResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function ask() {
    setLoading(true)
    setError('')
    setResponse(null)
    try {
      const result = await api.investigateGrounded({ incident_id: incidentId, question: question.trim() })
      setResponse(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The local AI request failed.')
    } finally {
      setLoading(false)
    }
  }

  const accepted = response?.status === 'generated_unverified_citation_ids_checked'
  const reference = response?.status === 'local_reference_explanation'
  const noReference = response?.status === 'reference_required' || response?.status === 'insufficient_relevant_evidence'
  const mock = DATA_MODE === 'mock'
  const registry = new Map(response?.source_registry?.map((item) => [item.id, item]) ?? [])

  return (
    <section aria-labelledby="ai-investigation-title" className="glass p-5 sm:p-6">
      <header className="flex flex-wrap items-center gap-2">
        <BrainCircuit aria-hidden className="size-5 text-violet" />
        <h2 id="ai-investigation-title" className="text-lg font-semibold">Ask CAIL · optional AI</h2>
        <Badge tone="gold">Requires human verification</Badge>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        {mock
          ? 'Mock mode: generates a deterministic template from fictional observations. No model is called.'
          : 'General definitions use a labeled local training reference. Incident questions use Ollama and synthetic source IDs; citation IDs do not establish relevance or truth. No operational action can run.'}
      </p>
      <form onSubmit={(event) => { event.preventDefault(); if (!loading && question.trim().length >= 3 && question.length <= 500) void ask() }} className="mt-4 flex flex-col gap-3">
        <label className="text-xs font-medium text-ink-muted" htmlFor="cail-evidence-question">Investigation question</label>
        <textarea
          id="cail-evidence-question"
          className="neu-inset min-h-20 w-full rounded-xl border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-cyan"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={500}
          placeholder="What does the available evidence show?"
        />
        <button type="submit" disabled={loading || question.trim().length < 3} className="btn-primary flex items-center justify-center gap-2 self-start rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <FileSearch aria-hidden className="size-4" />}
          {loading ? 'Reviewing source IDs…' : mock ? 'Preview mock response' : 'Ask CAIL assistant'}
        </button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
      {response && (
        <div aria-live="polite" className="glass-sub mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert aria-hidden className="size-4 text-gold" />
            <span className="text-sm font-semibold">{mock ? 'Mock template · not AI' : reference ? 'Local training reference · not AI-generated' : noReference ? 'No relevant reference available' : accepted ? 'Unverified model explanation' : 'Model claims unavailable'}</span>
            <Badge tone="slate">{response.status ?? 'mock'}</Badge>
          </div>
          {response.message && <p className="mt-2 text-xs text-ink-muted">{response.message}</p>}
          {!accepted && !reference && !noReference && !mock && <p className="mt-2 text-sm text-ink-muted">The independent deterministic evidence above is still available. No substitute AI claims were invented.</p>}
          {response.claims.length > 0 && (accepted || mock) && (
            <ul className="mt-3 flex flex-col gap-3">
              {response.claims.map((claim, i) => (
                <li key={`${i}-${claim.text}`} className="rounded-lg border border-line p-3">
                  <p className="text-sm leading-relaxed">{claim.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {claim.evidence_ids.map((citation) => (
                      <button
                        key={citation}
                        type="button"
                        onClick={() => onSelectEvidence(citation)}
                        title={registry.get(citation)?.source_text ?? 'Open evidence detail where available'}
                        className="rounded-lg border border-cyan/30 bg-cyan/10 px-2 py-1 font-mono text-xs text-cyan"
                      >{citation}</button>
                    ))}
                  </div>
                  {claim.evidence_ids.map((citation) => registry.get(citation) ? (
                    <p key={`source-${citation}`} className="mt-2 text-xs leading-relaxed text-ink-muted">
                      <span className="font-mono text-cyan">{citation}:</span> {registry.get(citation)?.source_text}
                    </p>
                  ) : null)}
                </li>
              ))}
            </ul>
          )}
          {reference && <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Educational overview authored for this prototype. Not independently verified against HPE documentation;
            no Ollama call was made and no incident evidence is cited.
          </p>}
          {!!response.missing_evidence?.length && (
            <p className="mt-3 text-xs text-ink-muted">Still missing: {response.missing_evidence.join('; ')}</p>
          )}
          <p className="mt-3 text-xs text-ink-faint">Synthetic educational environment. No root cause is confirmed, no source semantics are verified, and no system command is authorized or executed.</p>
        </div>
      )}
    </section>
  )
}
