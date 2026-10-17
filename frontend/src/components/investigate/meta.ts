import { Activity, Bell, Cog, GitCommitHorizontal, type LucideIcon, ScrollText, Waypoints } from 'lucide-react'
import type { EvidenceCategory, HypothesisStatus, IncidentStatus, Severity, TimelineKind } from '@/api/types'
import type { Tone } from '@/components/ui/Badge'

export const SEVERITY_TONE: Record<Severity, Tone> = {
  'SEV-1': 'coral',
  'SEV-2': 'coral',
  'SEV-3': 'amber',
  'SEV-4': 'teal',
}

export const STATUS_META: Record<IncidentStatus, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'coral' },
  investigating: { label: 'Investigating', tone: 'cyan' },
  mitigated: { label: 'Mitigated', tone: 'amber' },
  resolved: { label: 'Resolved', tone: 'emerald' },
}

export const HYPOTHESIS_META: Record<HypothesisStatus, { label: string; tone: Tone }> = {
  plausible: { label: 'Most plausible', tone: 'violet' },
  unconfirmed: { label: 'Unconfirmed', tone: 'slate' },
  weakened: { label: 'Weakened by evidence', tone: 'amber' },
}

export const EVIDENCE_META: Record<EvidenceCategory, { label: string; icon: LucideIcon; tone: Tone }> = {
  alert: { label: 'Alert', icon: Bell, tone: 'coral' },
  log: { label: 'Log', icon: ScrollText, tone: 'gold' },
  metric: { label: 'Metric', icon: Activity, tone: 'cyan' },
  trace: { label: 'Trace', icon: Waypoints, tone: 'violet' },
  deployment: { label: 'Deployment', icon: GitCommitHorizontal, tone: 'teal' },
  config: { label: 'Config', icon: Cog, tone: 'slate' },
}

export const TIMELINE_TONE: Record<TimelineKind, Tone> = {
  alert: 'coral',
  deploy: 'teal',
  change: 'gold',
  observation: 'cyan',
  escalation: 'violet',
}
