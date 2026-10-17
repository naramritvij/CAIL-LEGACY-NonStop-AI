import { Cog, Cpu, Leaf, type LucideIcon, ScanEye, ShieldAlert, Workflow, Wrench } from 'lucide-react'

export type NodeTone = 'cyan' | 'teal' | 'violet' | 'gold' | 'coral'

const AREA_STYLE: Record<string, { icon: LucideIcon; tone: NodeTone }> = {
  Safety: { icon: ShieldAlert, tone: 'coral' },
  Equipment: { icon: Cog, tone: 'cyan' },
  Operations: { icon: Workflow, tone: 'teal' },
  Troubleshooting: { icon: Wrench, tone: 'gold' },
  'Process Control': { icon: Cpu, tone: 'violet' },
  Maintenance: { icon: ScanEye, tone: 'teal' },
}

export function areaStyle(area: string): { icon: LucideIcon; tone: NodeTone } {
  return AREA_STYLE[area] ?? { icon: Leaf, tone: 'cyan' }
}

export const ORB_TONE: Record<NodeTone, string> = {
  cyan: 'border-cyan/45 text-cyan [--orb:var(--color-cyan)]',
  teal: 'border-teal/45 text-teal [--orb:var(--color-teal)]',
  violet: 'border-violet/45 text-violet [--orb:var(--color-violet)]',
  gold: 'border-gold/50 text-gold [--orb:var(--color-gold)]',
  coral: 'border-coral/45 text-coral [--orb:var(--color-coral)]',
}

export const DOT_TONE: Record<NodeTone, string> = {
  cyan: 'bg-cyan',
  teal: 'bg-teal',
  violet: 'bg-violet',
  gold: 'bg-gold',
  coral: 'bg-coral',
}

export function formatDay(iso: string): string {
  if (!iso) return 'Date not provided'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
