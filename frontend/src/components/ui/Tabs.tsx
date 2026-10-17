import { type KeyboardEvent, type ReactNode, useRef } from 'react'
import { cn } from '@/lib/format'

export interface TabItem<T extends string> {
  id: T
  label: string
  count?: number
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (id: T) => void
  idPrefix: string
  label: string
}

export function Tabs<T extends string>({ items, value, onChange, idPrefix, label }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.id === value)
    const last = items.length - 1
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : -1
    if (next < 0) return
    event.preventDefault()
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
      {items.map((item, i) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'tap relative flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-medium',
              selected ? 'bg-cyan/10 text-ink' : 'text-ink-muted hover:bg-white/5 hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', selected ? 'bg-cyan/20 text-cyan' : 'bg-white/5 text-ink-faint')}>
                {item.count}
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-3 -bottom-px h-0.5 rounded-full transition-colors',
                selected ? 'bg-cyan shadow-[0_0_12px_var(--color-cyan)]' : 'bg-transparent',
              )}
            />
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({ idPrefix, id, children }: { idPrefix: string; id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className="animate-fade-up">
      {children}
    </div>
  )
}
