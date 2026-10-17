import { Star } from 'lucide-react'
import type { KnowledgeNode } from '@/api/types'
import { cn } from '@/lib/format'
import { formatDay } from './nodeStyle'

export function RevisionLineage({ node }: { node: KnowledgeNode }) {
  const revisions = node.revisions.length > 0 ? node.revisions : [{ revision: node.revision, created_at: node.updated_at, change_summary: 'Revision history was not provided.' }]

  return (
    <section aria-labelledby="lineage-title" className="glass p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="lineage-title" className="text-base font-semibold">
          Knowledge lineage
        </h2>
        <p className="text-sm text-ink-muted">How {node.title} evolved through approved revisions.</p>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {revisions.map((rev, i) => {
          const current = i === revisions.length - 1
          return (
            <li key={rev.revision} className={cn('glass-sub flex items-start gap-3 p-3', current && 'border-gold/40')}>
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full border font-mono text-xs',
                  current ? 'border-gold/50 bg-gold/10 text-gold' : 'border-cyan/35 bg-cyan/10 text-cyan',
                )}
              >
                {current ? <Star aria-hidden className="size-4" /> : `v${rev.revision}`}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {current ? 'Current version' : `Revision ${rev.revision}`}
                  <span className="ml-2 font-mono text-[11px] font-normal text-ink-faint">r{rev.revision}</span>
                </p>
                <p className="text-xs text-ink-faint">{formatDay(rev.created_at)}</p>
                <p className="mt-1 text-sm leading-relaxed text-pretty text-ink-muted">{rev.change_summary}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
