import { useIncidentContext } from '@/app/IncidentContext'
import { NAV_ITEMS } from '@/app/routes'
import { cn } from '@/lib/format'

const MOBILE_IDS = ['home', 'chat', 'investigate', 'tree', 'apprentice'] as const

/** The Ask CAIL chat demo is a primary mobile tab; ATM, Evidence, Mentor and Library remain reachable from Home. */
export function MobileNav() {
  const { section, navigate, selectedId } = useIncidentContext()
  const items = NAV_ITEMS.filter((item) => (MOBILE_IDS as readonly string[]).includes(item.id))

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-midnight/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {items.map((item) => {
          const Icon = item.icon
          const active = section === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(item.id, item.incidentScoped ? selectedId : undefined)}
                aria-current={active ? 'page' : undefined}
                className={cn('tap flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-cyan' : 'text-ink-faint')}
              >
                <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-cyan/15 shadow-[0_0_18px_-6px_var(--color-cyan)]')}>
                  <Icon aria-hidden className="size-[18px]" />
                </span>
                <span className="flex items-center gap-1">
                  {item.shortLabel ?? item.label}
                  {item.status === 'planned' && <span aria-label="planned" className="size-1 rounded-full bg-ink-faint" />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
