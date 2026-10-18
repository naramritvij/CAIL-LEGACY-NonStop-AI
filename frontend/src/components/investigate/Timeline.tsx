import { History } from 'lucide-react'
import type { TimelineEvent } from '@/api/types'
import { TONE_DOT } from '@/components/ui/Badge'
import { EvidenceChip } from '@/components/ui/EvidenceChip'
import { EmptyState } from '@/components/ui/States'
import { cn, formatTime } from '@/lib/format'
import { TIMELINE_TONE } from './meta'

export function Timeline({ events, onSelectEvidence }: { events: TimelineEvent[]; onSelectEvidence: (id: string) => void }) {
  const sorted = [...events].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))

  return (
    <section aria-labelledby="timeline-title" className="glass p-5">
      <header>
        <h2 id="timeline-title" className="text-lg font-semibold">
          Event timeline
        </h2>
        <p className="text-xs text-ink-faint">Simulated events in UTC, oldest first</p>
      </header>

      {sorted.length === 0 ? (
        <EmptyState icon={History} title="No events recorded" className="py-8" />
      ) : (
        <ol className="relative mt-5 flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-gradient-to-b before:from-cyan/50 before:via-line-strong before:to-transparent">
          {sorted.map((event) => (
            <li key={event.event_id} className="relative pl-7">
              <span aria-hidden className={cn('absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-midnight', TONE_DOT[TIMELINE_TONE[event.kind]])} />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <time dateTime={event.timestamp} className="font-mono text-xs text-ink-faint tabular-nums">
                  {formatTime(event.timestamp)}
                </time>
                <span className="text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{event.kind}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-pretty">{event.title}</p>
              {event.detail && <p className="mt-1 text-sm leading-relaxed text-pretty text-ink-muted">{event.detail}</p>}
              {event.evidence_ids.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.evidence_ids.map((id) => (
                    <EvidenceChip key={id} id={id} onSelect={onSelectEvidence} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
