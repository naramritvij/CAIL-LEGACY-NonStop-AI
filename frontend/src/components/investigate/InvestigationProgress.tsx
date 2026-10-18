import { Check } from 'lucide-react'
import { cn } from '@/lib/format'

export type StepId = 'understand' | 'diagnose' | 'validate' | 'capture'

export const STEPS: { id: StepId; label: string; hint: string; planned?: boolean }[] = [
  { id: 'understand', label: 'Understand', hint: 'Review observations' },
  { id: 'diagnose', label: 'Diagnose', hint: 'Weigh hypotheses' },
  { id: 'validate', label: 'Validate', hint: 'Close evidence gaps' },
  { id: 'capture', label: 'Capture', hint: 'Decision DNA review' },
]

interface Props {
  current: StepId
  onChange: (id: StepId) => void
}

export function InvestigationProgress({ current, onChange }: Props) {
  const currentIndex = STEPS.findIndex((step) => step.id === current)

  return (
    <nav aria-label="Investigation progress" className="glass p-2">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {STEPS.map((step, i) => {
          const active = i === currentIndex
          const done = i < currentIndex
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onChange(step.id)}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'tap flex h-full w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left',
                  active
                    ? 'btn-primary border-cyan/40 text-white'
                    : 'border-transparent text-ink-muted hover:border-line hover:bg-white/[0.04]',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full border text-sm font-semibold tabular-nums',
                    active && 'border-white/40 bg-white/15 shadow-[0_0_18px_-2px_rgb(255_255_255/0.5)]',
                    done && 'border-teal/40 bg-teal/15 text-teal',
                    !active && !done && 'border-line-strong bg-midnight/60',
                  )}
                >
                  {done ? <Check aria-hidden className="size-4" /> : i + 1}
                  {done && <span className="sr-only">Step {i + 1} complete</span>}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm font-semibold', active ? 'text-white' : 'text-ink')}>{step.label}</span>
                  <span className={cn('block truncate text-xs', active ? 'text-white/80' : step.planned ? 'text-ink-faint' : 'text-ink-muted')}>{step.hint}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
