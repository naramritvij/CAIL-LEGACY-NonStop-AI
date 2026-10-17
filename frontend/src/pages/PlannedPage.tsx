import { ArrowLeft, Construction } from 'lucide-react'
import type { NavItem } from '@/app/routes'
import { Badge } from '@/components/ui/Badge'

/** Placeholder for P1/P2 sections so they are never presented as functional. */
export function PlannedPage({ item, onBack }: { item: NavItem; onBack: () => void }) {
  const Icon = item.icon
  return (
    <section aria-labelledby="planned-title" className="glass animate-fade-up flex flex-col items-center px-6 py-16 text-center">
      {item.id === 'tree' && <img src="/images/legacy-tree.png" alt="" className="mb-6 h-48 w-auto rounded-3xl object-cover opacity-80 sm:h-64" />}
      <span className="grid size-14 place-items-center rounded-2xl border border-violet/30 bg-violet/10 text-violet">
        <Icon aria-hidden className="size-6" />
      </span>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <h1 id="planned-title" className="text-2xl font-semibold">
          {item.label}
        </h1>
        <Badge tone="slate" icon={<Construction aria-hidden className="size-3" />}>
          Not yet functional · {item.milestone}
        </Badge>
      </div>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-pretty text-ink-muted">{item.description}</p>
      <p className="mt-2 max-w-lg text-xs text-ink-faint">This section is scheduled for milestone {item.milestone}. No data shown here is real or saved.</p>
      <button type="button" onClick={onBack} className="tap btn-primary mt-8 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
        <ArrowLeft aria-hidden className="size-4" />
        Back to Investigate
      </button>
    </section>
  )
}
