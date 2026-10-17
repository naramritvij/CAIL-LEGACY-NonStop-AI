import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useIncidentContext } from '@/app/IncidentContext'
import { SEVERITY_TONE } from '@/components/investigate/meta'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/format'

export function IncidentPicker() {
  const { incidents, selected, selectIncident, incidentsLoading } = useIncidentContext()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (incidentsLoading) return <div className="skeleton h-10 w-full sm:w-64" />
  if (!incidents?.length) return null

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="tap neu-raised flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm sm:w-72"
      >
        <span className="sr-only">Selected incident:</span>
        {selected && <Badge tone={SEVERITY_TONE[selected.severity]}>{selected.severity}</Badge>}
        <span className="min-w-0 flex-1 truncate font-medium">{selected?.title ?? 'Select incident'}</span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Incidents"
          className="glass animate-fade-up absolute right-0 z-50 mt-2 w-full overflow-hidden p-1.5 sm:w-96"
        >
          {incidents.map((incident) => {
            const active = incident.incident_id === selected?.incident_id
            return (
              <li key={incident.incident_id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    selectIncident(incident.incident_id)
                    setOpen(false)
                  }}
                  className={cn('tap flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', active ? 'bg-cyan/10' : 'hover:bg-white/5')}
                >
                  <Badge tone={SEVERITY_TONE[incident.severity]} className="mt-0.5">
                    {incident.severity}
                  </Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{incident.title}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">
                      {incident.incident_id} · {incident.service}
                    </span>
                  </span>
                  {active && <Check aria-hidden className="mt-1 size-4 text-cyan" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
