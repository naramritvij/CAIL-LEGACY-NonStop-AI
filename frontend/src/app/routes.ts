import { useCallback, useSyncExternalStore } from 'react'
import {
  FileSearch,
  GraduationCap,
  House,
  LibraryBig,
  type LucideIcon,
  ScanSearch,
  Sprout,
  UserRoundCheck,
} from 'lucide-react'

export type SectionId = 'home' | 'investigate' | 'evidence' | 'tree' | 'apprentice' | 'mentor' | 'library'

export interface NavItem {
  id: SectionId
  label: string
  shortLabel?: string
  icon: LucideIcon
  status: 'ready' | 'planned'
  milestone?: 'P1' | 'P2'
  /** Sections scoped to an incident keep the selected incident in the URL. */
  incidentScoped?: boolean
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: House, status: 'ready', description: 'Overview of open simulated incidents.' },
  { id: 'investigate', label: 'Investigate', icon: ScanSearch, status: 'ready', incidentScoped: true, description: 'Guided, evidence-grounded investigation.' },
  { id: 'evidence', label: 'Evidence', icon: FileSearch, status: 'ready', incidentScoped: true, description: 'Every evidence item for the selected incident.' },
  {
    id: 'tree',
    label: 'Knowledge Tree',
    shortLabel: 'Tree',
    icon: Sprout,
    status: 'ready',
    description: 'An interactive, bioluminescent map of approved operational knowledge. Each branch grows from a reviewed lesson.',
  },
  {
    id: 'mentor',
    label: 'Mentor',
    icon: UserRoundCheck,
    status: 'ready',
    description: 'Independent expert review of Decision DNA drafts before they become retrievable knowledge.',
  },
  {
    id: 'library',
    label: 'Library',
    icon: LibraryBig,
    status: 'planned',
    milestone: 'P1',
    description: 'Searchable Decision DNA records: symptoms, evidence, reasoning, rejected alternatives and open questions.',
  },
  {
    id: 'apprentice',
    label: 'Apprentice',
    shortLabel: 'Learn',
    icon: GraduationCap,
    status: 'ready',
    description: 'Scenario challenges built from approved lessons, with safe-ops XP, levels and mentor recognition.',
  },
]

export interface Route {
  section: SectionId
  param?: string
}

const SECTION_IDS = new Set<string>(NAV_ITEMS.map((item) => item.id))

function parseHash(hash: string): Route {
  const [section, param] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return { section: SECTION_IDS.has(section) ? (section as SectionId) : 'investigate', param: param || undefined }
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

const getHash = () => window.location.hash

export function useHashRoute() {
  const hash = useSyncExternalStore(subscribe, getHash, () => '')
  const route = parseHash(hash)

  const navigate = useCallback((section: SectionId, param?: string) => {
    window.location.hash = param ? `#/${section}/${encodeURIComponent(param)}` : `#/${section}`
    window.scrollTo({ top: 0 })
  }, [])

  return { ...route, navigate }
}

export function getNavItem(id: SectionId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}
