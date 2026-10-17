import { ChevronDown, Lock, ShieldCheck, Terminal } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/States'
import { cn } from '@/lib/format'

/** Display copy for read-only preview actions. Execution is intentionally not wired in P0. */
const ACTION_COPY: Record<string, { label: string; preview: string }> = {
  inspect_disk_growth: {
    label: 'Inspect disk trends and file metadata',
    preview: 'Preview only: compare the provided synthetic capacity values and verify ownership/retention prerequisites. No actual NonStop command is executed.',
  },
  inspect_events: {
    label: 'Review recent synthetic event timeline',
    preview: 'Preview only: review the event IDs shown in the current incident. These are fictional fixtures, not official HPE event codes.',
  },
}

export function SafeChecks({ actionIds }: { actionIds: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(actionIds))
  const [expanded, setExpanded] = useState<string>()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-labelledby="checks-title" className="glass p-5">
      <header className="flex flex-wrap items-center gap-2">
        <h2 id="checks-title" className="text-lg font-semibold">
          Recommended safe checks
        </h2>
        <Badge tone="violet">Preview only</Badge>
      </header>

      {actionIds.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No safe checks suggested" className="py-8">
          The rules found no read-only diagnostic that applies to this incident yet.
        </EmptyState>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {actionIds.map((id) => {
              const copy = ACTION_COPY[id] ?? { label: id, preview: 'Preview not available for this action.' }
              const isOpen = expanded === id
              const panelId = `check-${id}`
              return (
                <li key={id} className="neu-inset rounded-xl">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      id={`${panelId}-select`}
                      checked={selected.has(id)}
                      onChange={() => toggle(id)}
                      className="size-4 shrink-0 accent-cyan"
                    />
                    <label htmlFor={`${panelId}-select`} className="min-w-0 flex-1 cursor-pointer text-sm">
                      {copy.label}
                    </label>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setExpanded(isOpen ? undefined : id)}
                      className="tap neu-raised inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      Preview
                      <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                    </button>
                  </div>
                  {isOpen && (
                    <div id={panelId} className="animate-fade-up border-t border-line px-3 py-2.5">
                      <p className="flex items-start gap-2 font-mono text-xs leading-relaxed break-words text-cyan">
                        <Terminal aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        {copy.preview}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            disabled
            aria-describedby="checks-note"
            className="btn-primary mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white opacity-55"
          >
            <Lock aria-hidden className="size-4" />
            Run {selected.size} selected check{selected.size === 1 ? '' : 's'} (read-only)
          </button>
          <p id="checks-note" className="mt-2 text-center text-xs text-ink-faint">
            Previews only. Read-only check execution ships in a later milestone.
          </p>
        </>
      )}
    </section>
  )
}
