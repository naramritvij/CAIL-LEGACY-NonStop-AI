import { FlaskConical, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DATA_MODE } from '@/api/client'
import { MOCK_SCENARIOS, setMockScenario, useMockScenario } from '@/api/mock/controls'
import { cn } from '@/lib/format'
import { BrandMark } from './BrandMark'
import { IncidentPicker } from './IncidentPicker'

function ScenarioMenu() {
  const scenario = useMockScenario()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn('tap neu-raised grid size-10 place-items-center rounded-xl text-ink-muted hover:text-ink', scenario !== 'normal' && 'text-gold')}
      >
        <Settings2 aria-hidden className="size-4" />
        <span className="sr-only">Mock data scenario</span>
      </button>
      {open && (
        <div role="menu" aria-label="Mock data scenario" className="glass animate-fade-up absolute right-0 z-50 mt-2 w-60 p-1.5">
          <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">Demo scenario</p>
          {MOCK_SCENARIOS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={scenario === option.id}
              onClick={() => {
                setMockScenario(option.id)
                setOpen(false)
              }}
              className={cn('tap flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm', scenario === option.id ? 'bg-cyan/10 text-ink' : 'text-ink-muted hover:bg-white/5')}
            >
              {option.label}
              {scenario === option.id && <span aria-hidden className="size-1.5 rounded-full bg-cyan" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const isMock = DATA_MODE === 'mock'
  return (
    <header className="glass sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-3 sm:rounded-2xl sm:border lg:static lg:rounded-2xl">
      <a href="#/home" className="rounded-xl lg:hidden" aria-label="CAIL / Nonstop AI Operations Assistant home">
        <BrandMark compact />
      </a>

      <div className="order-last w-full sm:order-none sm:w-auto">
        <IncidentPicker />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold',
            isMock ? 'border-gold/40 bg-gold/10 text-gold shadow-[0_0_24px_-10px_var(--color-gold)]' : 'border-emerald/35 bg-emerald/10 text-emerald',
          )}
        >
          <FlaskConical aria-hidden className="size-4" />
          <span className="hidden sm:inline">{isMock ? 'Showcase · Mock' : 'Local API · Synthetic'}</span>
          <span className="sm:hidden">{isMock ? 'Mock' : 'Local API'}</span>
        </span>
        {isMock && <ScenarioMenu />}
      </div>
    </header>
  )
}
