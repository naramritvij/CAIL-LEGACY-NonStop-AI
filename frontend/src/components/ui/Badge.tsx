import type { ReactNode } from 'react'
import { cn } from '@/lib/format'

export type Tone = 'cyan' | 'violet' | 'gold' | 'teal' | 'coral' | 'amber' | 'emerald' | 'slate'

const TONES: Record<Tone, string> = {
  cyan: 'border-cyan/30 bg-cyan/10 text-cyan',
  violet: 'border-violet/30 bg-violet/10 text-violet',
  gold: 'border-gold/35 bg-gold/10 text-gold',
  teal: 'border-teal/30 bg-teal/10 text-teal',
  coral: 'border-coral/40 bg-coral/10 text-coral',
  amber: 'border-amber/35 bg-amber/10 text-amber',
  emerald: 'border-emerald/30 bg-emerald/10 text-emerald',
  slate: 'border-line-strong bg-white/5 text-ink-muted',
}

export const TONE_DOT: Record<Tone, string> = {
  cyan: 'bg-cyan',
  violet: 'bg-violet',
  gold: 'bg-gold',
  teal: 'bg-teal',
  coral: 'bg-coral',
  amber: 'bg-amber',
  emerald: 'bg-emerald',
  slate: 'bg-ink-faint',
}

interface BadgeProps {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'slate', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
