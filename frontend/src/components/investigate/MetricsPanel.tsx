import { Activity } from 'lucide-react'
import type { IncidentMetric } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { EvidenceChip } from '@/components/ui/EvidenceChip'
import { Sparkline } from '@/components/ui/Sparkline'
import { EmptyState } from '@/components/ui/States'
import { cn, formatChange, formatValue } from '@/lib/format'

function isDegraded(metric: IncidentMetric) {
  const worse = metric.direction === 'higher_is_worse' ? metric.current > metric.baseline : metric.current < metric.baseline
  if (metric.threshold === undefined) return worse
  return metric.direction === 'higher_is_worse' ? metric.current >= metric.threshold : metric.current <= metric.threshold
}

export function MetricsPanel({ metrics, onSelectEvidence }: { metrics: IncidentMetric[]; onSelectEvidence: (id: string) => void }) {
  return (
    <section aria-labelledby="metrics-title" className="glass p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="metrics-title" className="text-lg font-semibold">
            Metrics
          </h2>
          <p className="text-xs text-ink-faint">Synthetic fixture values vs. baseline · chart shown only when samples exist</p>
        </div>
        <Badge tone="gold">Synthetic</Badge>
      </header>

      {metrics.length === 0 ? (
        <EmptyState icon={Activity} title="No metrics recorded" className="py-8">
          This incident has no metric series attached.
        </EmptyState>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {metrics.map((metric) => {
            const degraded = isDegraded(metric)
            return (
              <li key={metric.metric_id} className="neu-inset grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-xl px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{metric.name}</p>
                  <p className="text-xs text-ink-faint tabular-nums">baseline {formatValue(metric.baseline, metric.unit)}</p>
                </div>
                <Sparkline
                  samples={metric.samples}
                  threshold={metric.threshold}
                  color={degraded ? '#FB7185' : '#2DD4BF'}
                  className="order-last col-span-2 h-9 w-full sm:order-none sm:col-span-1"
                />
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatValue(metric.current, metric.unit)}</p>
                  <p className={cn('text-xs font-medium tabular-nums', degraded ? 'text-coral' : 'text-teal')}>{formatChange(metric.current, metric.baseline)}</p>
                </div>
                {metric.evidence_id && (
                  <div className="order-last col-span-2 sm:col-span-3">
                    <EvidenceChip id={metric.evidence_id} onSelect={onSelectEvidence} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
