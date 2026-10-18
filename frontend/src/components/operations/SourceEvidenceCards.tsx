import { Activity, FileClock, Info, ShieldAlert } from 'lucide-react'

type EvidenceRecord = Record<string, unknown>

function valueText(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('en-CA')
  return 'Not recorded'
}

function measurement(value: unknown, unit: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not recorded'
  const number = value.toLocaleString('en-CA', { maximumFractionDigits: 2 })
  const suffix = typeof unit === 'string' && unit.trim() ? unit.trim() : ''
  return suffix === '%' ? `${number}%` : suffix ? `${number} ${suffix}` : number
}

function heading(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/**
 * Operator-friendly display of existing source projections.
 * This is a PRESENTATION transformation only: never infer health, manufacture
 * metrics, or relabel fixture records as authenticated HPE observations.
 */
export function SourceEvidenceCards({
  toolId,
  evidence,
}: {
  toolId: string
  evidence: EvidenceRecord[]
}) {
  if (evidence.length === 0) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-gold" />
        <div>
          <p className="text-sm font-semibold text-ink">No source readings available — status unknown</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            This training fixture contains no {toolId.toUpperCase()} observation. CAIL cannot claim the subsystem is healthy, offline, or connected without evidence.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2" aria-label={`${toolId.toUpperCase()} training evidence records`}>
      {evidence.map((record, index) => {
        const id = typeof record.id === 'string' && record.id ? record.id : `record-${index + 1}`
        if (toolId === 'asap') {
          return (
            <article key={id} className="rounded-xl border border-line-strong bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan">
                  <Activity aria-hidden className="size-4" /> Training metric
                </span>
                <span className="text-[11px] text-ink-faint">ASAP-style projection</span>
              </div>
              <h4 className="mt-2 text-sm font-semibold text-ink">{valueText(record.metric)}</h4>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-line bg-black/10 p-3">
                  <p className="text-xs text-ink-muted">Observed in fixture</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{measurement(record.value, record.unit)}</p>
                </div>
                <div className="rounded-lg border border-line bg-black/10 p-3">
                  <p className="text-xs text-ink-muted">Fixture baseline</p>
                  <p className="mt-1 text-lg font-semibold text-ink">{measurement(record.baseline, record.unit)}</p>
                </div>
              </div>
              <p className="mt-3 break-all font-mono text-[11px] text-ink-faint">Evidence ID: {id}</p>
            </article>
          )
        }
        if (toolId === 'ems') {
          const level = valueText(record.level)
          const severe = /^(high|critical|error)$/i.test(level)
          const caution = /^warning$/i.test(level)
          return (
            <article key={id} className="rounded-xl border border-line-strong bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan">
                  <FileClock aria-hidden className="size-4" /> Training event
                </span>
                <span className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${severe ? 'border-coral/35 bg-coral/10 text-coral' : caution ? 'border-gold/35 bg-gold/10 text-gold' : 'border-line text-ink-muted'}`}>
                  {level}
                </span>
              </div>
              <h4 className="mt-3 text-sm font-semibold leading-relaxed text-ink">{valueText(record.message)}</h4>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-ink-faint">Fixture timestamp</dt>
                  <dd className="mt-0.5 break-words text-ink-muted">{valueText(record.time)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Original fixture source</dt>
                  <dd className="mt-0.5 break-words text-ink-muted">{valueText(record.original_fixture_source)}</dd>
                </div>
              </dl>
              <p className="mt-3 break-all font-mono text-[11px] text-ink-faint">Evidence ID: {id}</p>
              <p className="mt-1 text-[11px] text-ink-faint">Official HPE message number: {valueText(record.official_hpe_message_number)}</p>
            </article>
          )
        }
        return (
          <article key={id} className="rounded-xl border border-line-strong bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-cyan">
              <Info aria-hidden className="size-4" /> Source record
            </div>
            <dl className="mt-3 grid gap-2 text-xs">
              {Object.entries(record).map(([key, value]) => (
                <div key={key} className="grid grid-cols-[minmax(6rem,1fr)_2fr] gap-3 border-b border-line pb-2 last:border-0">
                  <dt className="break-words text-ink-faint">{heading(key)}</dt>
                  <dd className="break-words text-ink">{valueText(value)}</dd>
                </div>
              ))}
            </dl>
          </article>
        )
      })}
    </div>
  )
}
