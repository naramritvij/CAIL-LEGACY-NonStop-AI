import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { useWorkspace } from '@/api/hooks'
import { DATA_MODE } from '@/api/client'
import { useIncidentContext } from '@/app/IncidentContext'
import { EvidenceDialog } from '@/components/investigate/EvidenceDialog'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { EvidencePage } from './EvidencePage'
import { InvestigatePage } from './InvestigatePage'

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading incident" className="flex flex-col gap-5">
      <Skeleton className="h-44 rounded-[1.25rem]" />
      <Skeleton className="h-20 rounded-[1.25rem]" />
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Skeleton className="h-[28rem] rounded-[1.25rem]" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-56 rounded-[1.25rem]" />
          <Skeleton className="h-52 rounded-[1.25rem]" />
        </div>
      </div>
    </div>
  )
}

export function WorkspaceView({ view }: { view: 'investigate' | 'evidence' }) {
  const { selectedId, incidents, incidentsLoading, navigate } = useIncidentContext()
  const { data, error, isLoading, mutate } = useWorkspace(selectedId)
  const [openEvidenceId, setOpenEvidenceId] = useState<string>()

  if (incidentsLoading || (isLoading && !data)) return <WorkspaceSkeleton />

  if (!incidents?.length) {
    return (
      <div className="glass">
        <EmptyState icon={Inbox} title="No incidents to investigate">
          {DATA_MODE === 'mock' ? 'The mock incident queue is empty. Choose Normal responses in the demo scenario menu.' : 'The local synthetic backend returned no incidents. Check its availability.'}
        </EmptyState>
      </div>
    )
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => mutate()}
        secondaryAction={
          error.code === 'not_found' && incidents[0] ? (
            <button type="button" onClick={() => navigate('investigate', incidents[0].incident_id)} className="tap neu-raised rounded-xl px-4 py-2 text-sm font-medium">
              Open latest incident
            </button>
          ) : undefined
        }
      />
    )
  }

  if (!data) return <WorkspaceSkeleton />

  const openItem = data.evidence.find((item) => item.evidence_id === openEvidenceId)
  const Page = view === 'evidence' ? EvidencePage : InvestigatePage

  return (
    <>
      <Page key={data.incident.incident_id} workspace={data} onSelectEvidence={setOpenEvidenceId} />
      <EvidenceDialog item={openItem} onClose={() => setOpenEvidenceId(undefined)} />
    </>
  )
}
