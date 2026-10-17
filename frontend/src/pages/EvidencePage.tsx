import type { IncidentWorkspace } from '@/api/types'
import { EvidenceList } from '@/components/investigate/EvidenceList'
import { MetricsPanel } from '@/components/investigate/MetricsPanel'
import { Timeline } from '@/components/investigate/Timeline'
import { Badge } from '@/components/ui/Badge'

export function EvidencePage({ workspace, onSelectEvidence }: { workspace: IncidentWorkspace; onSelectEvidence: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <header className="animate-fade-up px-1">
        <p className="font-mono text-xs text-ink-faint">{workspace.incident.incident_id}</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
          Evidence locker
          <Badge tone="gold">Synthetic</Badge>
        </h1>
        <p className="mt-1 text-sm text-ink-muted text-pretty">Every item behind the analysis for “{workspace.incident.title}”. Select an item for its full detail.</p>
      </header>
      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <EvidenceList evidence={workspace.evidence} onSelectEvidence={onSelectEvidence} />
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <MetricsPanel metrics={workspace.metrics} onSelectEvidence={onSelectEvidence} />
          <Timeline events={workspace.timeline} onSelectEvidence={onSelectEvidence} />
        </div>
      </div>
    </div>
  )
}
