import { FlaskConical } from 'lucide-react'
import { useIncidentContext } from '@/app/IncidentContext'
import { NAV_ITEMS, type NavItem } from '@/app/routes'
import { cn } from '@/lib/format'
import { BrandMark } from './BrandMark'

function NavLink({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: () => void }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'tap group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium',
        active
          ? 'border-cyan/35 bg-gradient-to-r from-royal/45 to-cyan/10 text-ink shadow-[0_0_28px_-10px_var(--color-cyan)]'
          : 'border-transparent text-ink-muted hover:border-line hover:bg-white/[0.04] hover:text-ink',
      )}
    >
      <Icon aria-hidden className={cn('size-[18px] shrink-0', active ? 'text-cyan' : 'text-ink-faint group-hover:text-ink-muted')} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.status === 'planned' && (
        <span className="rounded-md border border-line px-1.5 py-px text-[10px] font-semibold tracking-wide text-ink-faint">{item.milestone}</span>
      )}
    </button>
  )
}

export function Sidebar() {
  const { section, navigate, selectedId } = useIncidentContext()
  const ready = NAV_ITEMS.filter((item) => item.status === 'ready')
  const planned = NAV_ITEMS.filter((item) => item.status === 'planned')

  const go = (item: NavItem) => navigate(item.id, item.incidentScoped ? selectedId : undefined)

  return (
    <aside className="glass sticky top-4 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col p-4 lg:flex">
      <a href="#/home" className="rounded-xl px-2 py-1">
        <BrandMark />
      </a>

      <nav aria-label="Primary" className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {ready.map((item) => (
            <li key={item.id}>
              <NavLink item={item} active={section === item.id} onSelect={() => go(item)} />
            </li>
          ))}
        </ul>
        <div>
          <p className="px-3 text-[11px] font-semibold tracking-[0.14em] text-ink-faint uppercase">Coming next</p>
          <ul className="mt-2 flex flex-col gap-1">
            {planned.map((item) => (
              <li key={item.id}>
                <NavLink item={item} active={section === item.id} onSelect={() => go(item)} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="neu-inset mt-4 flex items-start gap-3 rounded-2xl p-3">
        <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-gold" />
        <p className="text-xs leading-relaxed text-ink-muted">
          <span className="font-semibold text-gold">Simulation Mode.</span> All incidents are synthetic. Nothing connects to production.
        </p>
      </div>
    </aside>
  )
}
