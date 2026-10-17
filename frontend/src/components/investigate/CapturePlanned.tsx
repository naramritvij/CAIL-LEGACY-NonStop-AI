import { ArrowLeft, Dna, UserRoundCheck } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

const FIELDS = ['Symptoms', 'Evidence used', 'Reasoning', 'Rejected alternatives', 'Open questions']

export function CapturePlanned({ onBack }: { onBack: () => void }) {
  return (
    <section aria-labelledby="capture-title" className="glass flex flex-col p-5 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <Dna aria-hidden className="size-5 text-gold" />
        <h2 id="capture-title" className="text-xl font-semibold">
          Capture Decision DNA
        </h2>
        <Badge tone="slate">Planned · P1</Badge>
      </header>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-pretty text-ink-muted">
        This step will turn the investigation into a reviewable lesson. It is not functional yet. Nothing you do here is saved.
      </p>

      <ol className="mt-5 grid gap-2 sm:grid-cols-2">
        {FIELDS.map((field, i) => (
          <li key={field} className="glass-sub flex items-center gap-3 border-dashed px-4 py-3 opacity-80">
            <span className="grid size-7 place-items-center rounded-lg bg-gold/10 text-xs font-semibold text-gold">{i + 1}</span>
            <span className="text-sm">{field}</span>
          </li>
        ))}
        <li className="glass-sub flex items-center gap-3 border-dashed px-4 py-3 opacity-80">
          <UserRoundCheck aria-hidden className="size-5 text-violet" />
          <span className="text-sm">Independent mentor review</span>
        </li>
      </ol>

      <button type="button" onClick={onBack} className="tap neu-raised mt-6 inline-flex items-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium">
        <ArrowLeft aria-hidden className="size-4" />
        Back to validation
      </button>
    </section>
  )
}
