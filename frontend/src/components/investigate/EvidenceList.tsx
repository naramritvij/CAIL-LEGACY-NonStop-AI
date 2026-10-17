import { FileSearch } from 'lucide-react'
import { useState } from 'react'
import type { EvidenceCategory, EvidenceItem } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { cn, formatTime } from '@/lib/format'
import { EVIDENCE_META } from './meta'

interface Props {
  evidence: EvidenceItem[]
  onSelectEvidence: (id: string) => void
  limit?: number
  onViewAll?: () => void
}

export function EvidenceList({ evidence, onSelectEvidence, limit, onViewAll }: Props) {
  const [filter, setFilter] = useState<EvidenceCategory | 'all'>('all')
  const categories = Array.from(new Set(evidence.map((item) => item.category)))
  const filtered = filter === 'all' ? evidence : evidence.filter((item) => item.category === filter)
  const visible = limit ? filtered.slice(0, limit) : filtered

  return (
    <section aria-labelledby="evidence-title" className="glass p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="evidence-title" className="text-lg font-semibold">
            Evidence
          </h2>
          <p className="text-xs text-ink-faint">
            {evidence.length} item{evidence.length === 1 ? '' : 's'} from {categories.length} source type{categories.length === 1 ? '' : 's'}
          </p>
        </div>
        {onViewAll && (
          <button type="button" onClick={onViewAll} className="tap neu-raised rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink">
            View all
          </button>
        )}
      </header>

      {evidence.length === 0 ? (
        <EmptyState icon={FileSearch} title="No evidence collected" className="py-8">
          Nothing has been attached to this incident yet.
        </EmptyState>
      ) : (
        <>
          <div role="group" aria-label="Filter evidence by type" className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto">
            {(['all', ...categories] as const).map((category) => {
              const active = filter === category
              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(category)}
                  className={cn(
                    'tap shrink-0 rounded-full border px-3 py-1 text-xs font-medium',
                    active ? 'border-cyan/40 bg-cyan/15 text-cyan' : 'border-line text-ink-muted hover:bg-white/5',
                  )}
                >
                  {category === 'all' ? 'All' : EVIDENCE_META[category].label}
                </button>
              )
            })}
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {visible.map((item) => {
              const meta = EVIDENCE_META[item.category]
              const Icon = meta.icon
              return (
                <li key={item.evidence_id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvidence(item.evidence_id)}
                    className="tap neu-inset flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left hover:ring-1 hover:ring-cyan/30"
                  >
                    <Badge tone={meta.tone} icon={<Icon aria-hidden className="size-3" />} className="mt-0.5">
                      {meta.label}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{item.observed_value}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">
                        <span className="font-mono">{item.evidence_id}</span> · {item.source} · {formatTime(item.timestamp)}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {limit && filtered.length > limit && (
            <p className="mt-3 text-center text-xs text-ink-faint">
              Showing {limit} of {filtered.length}
            </p>
          )}
        </>
      )}
    </section>
  )
}
