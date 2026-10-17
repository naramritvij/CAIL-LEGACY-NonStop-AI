import { ArrowRight, Inbox } from 'lucide-react'
import { useIncidentContext } from '@/app/IncidentContext'
import { DATA_MODE } from '@/api/client'
import { NAV_ITEMS } from '@/app/routes'
import { SEVERITY_TONE, STATUS_META } from '@/components/investigate/meta'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { formatTime } from '@/lib/format'

export function HomePage() {
  const { incidents = [], selectIncident, navigate } = useIncidentContext()
  const planned = NAV_ITEMS.filter((item) => item.status === 'planned')

  return (
    <div className="flex flex-col gap-5">
      <header className="glass glow-cyan animate-fade-up overflow-hidden p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-10 size-72 rounded-full bg-cyan/15 blur-3xl" />
        <p className="relative text-xs font-semibold tracking-[0.2em] text-cyan uppercase">Welcome back</p>
        <h1 className="relative mt-2 max-w-2xl text-3xl font-semibold text-balance sm:text-4xl">
          <span className="text-gradient">Preserving human expertise.</span> Powering the next generation.
        </h1>
        <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-pretty text-ink-muted sm:text-base">
          Investigate simulated incidents with evidence-grounded analysis. Every claim links back to the evidence that supports it.
        </p>
      </header>

      <section aria-labelledby="incidents-title" className="glass p-5 sm:p-6">
        <h2 id="incidents-title" className="text-lg font-semibold">
          Simulated incidents
        </h2>
        {incidents.length === 0 ? (
          <EmptyState icon={Inbox} title="No incidents to investigate">
            {DATA_MODE === 'mock' ? 'The mock incident queue is empty. Choose Normal responses in the demo scenario menu.' : 'The local synthetic backend has no incidents.'}
          </EmptyState>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {incidents.map((incident) => {
              const status = STATUS_META[incident.status]
              return (
                <li key={incident.incident_id}>
                  <button
                    type="button"
                    onClick={() => selectIncident(incident.incident_id, 'investigate')}
                    className="tap glass-sub group flex h-full w-full flex-col p-4 text-left hover:border-cyan/35"
                  >
                    <span className="flex flex-wrap gap-2">
                      <Badge tone={SEVERITY_TONE[incident.severity]}>{incident.severity}</Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                    <span className="mt-3 text-base font-semibold text-pretty">{incident.title}</span>
                    <span className="mt-1 font-mono text-xs text-ink-faint">
                      {incident.incident_id} · {incident.service} · {formatTime(incident.started_at)}
                    </span>
                    <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-cyan">
                      Investigate
                      <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="roadmap-title" className="glass p-5 sm:p-6">
        <h2 id="roadmap-title" className="text-lg font-semibold">
          Coming next
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {planned.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <button type="button" onClick={() => navigate(item.id)} className="tap glass-sub flex h-full w-full flex-col gap-2 p-4 text-left hover:border-line-strong">
                  <span className="flex items-center justify-between">
                    <Icon aria-hidden className="size-5 text-violet" />
                    <Badge tone="slate">Planned · {item.milestone}</Badge>
                  </span>
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="text-xs leading-relaxed text-ink-muted">{item.description}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
