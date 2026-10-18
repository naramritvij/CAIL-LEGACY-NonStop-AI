import { CircleAlert, Clock, FlaskConical, Server } from 'lucide-react'
import type { IncidentDetail } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { cn, formatDuration, formatTime } from '@/lib/format'
import { SEVERITY_TONE, STATUS_META } from './meta'

export function IncidentHeader({ incident, generatedAt }: { incident: IncidentDetail; generatedAt: string }) {
  const severe = incident.severity === 'SEV-1' || incident.severity === 'SEV-2'
  const status = STATUS_META[incident.status]

  return (
    <section aria-labelledby="incident-title" className={cn('glass animate-fade-up overflow-hidden p-5 sm:p-6', severe ? 'glow-coral' : 'glow-amber')}>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 -left-16 size-64 rounded-full blur-3xl',
          severe ? 'bg-coral/20' : 'bg-amber/15',
        )}
      />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-start">
        <span
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-full border-2',
            severe ? 'border-coral/60 bg-coral/15 text-coral shadow-[0_0_32px_-4px_var(--color-coral)]' : 'border-amber/60 bg-amber/15 text-amber shadow-[0_0_32px_-4px_var(--color-amber)]',
          )}
        >
          <CircleAlert aria-hidden className="size-7" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
            <span className="font-mono">{incident.incident_id}</span>
            <span aria-hidden className="size-1 rounded-full bg-ink-faint" />
            <span className="capitalize">{incident.environment}</span>
            {incident.synthetic && (
              <Badge tone="gold" icon={<FlaskConical aria-hidden className="size-3" />}>
                Synthetic incident
              </Badge>
            )}
          </div>
          <h1 id="incident-title" className="mt-2 text-2xl font-semibold text-balance sm:text-[1.75rem]">
            {incident.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-pretty text-ink-muted sm:text-[15px]">{incident.summary}</p>
          <p className="mt-3 max-w-3xl text-sm text-pretty text-ink">
            <span className="font-semibold text-gold">Impact: </span>
            {incident.impact}
          </p>
          {incident.affected_components.length > 0 && (
            <ul aria-label="Affected components" className="mt-4 flex flex-wrap gap-2">
              {incident.affected_components.map((component) => (
                <li key={component} className="neu-inset inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-xs text-ink-muted">
                  <Server aria-hidden className="size-3 text-cyan" />
                  {component}
                </li>
              ))}
            </ul>
          )}
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-3 md:w-56 md:grid-cols-1">
          <div className="flex flex-col gap-1">
            <dt className="sr-only">Severity</dt>
            <dd className="flex flex-wrap gap-2">
              <Badge tone={SEVERITY_TONE[incident.severity]} className="text-sm">
                {incident.severity}
              </Badge>
              <Badge tone={status.tone}>{status.label}</Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Started</dt>
            <dd className="mt-0.5 text-sm font-medium tabular-nums">{formatTime(incident.started_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Elapsed (simulated)</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium tabular-nums">
              <Clock aria-hidden className="size-3.5 text-cyan" />
              {formatDuration(incident.started_at, generatedAt)}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
