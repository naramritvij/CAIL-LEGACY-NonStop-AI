import { useState } from 'react'
import type { IncidentWorkspace } from '@/api/types'
import { useIncidentContext } from '@/app/IncidentContext'
import { AnalysisPanel, type AnalysisTab } from '@/components/investigate/AnalysisPanel'
import { AiInvestigation } from '@/components/investigate/AiInvestigation'
import { CapturePlanned } from '@/components/investigate/CapturePlanned'
import { EvidenceList } from '@/components/investigate/EvidenceList'
import { IncidentHeader } from '@/components/investigate/IncidentHeader'
import { InvestigationProgress, type StepId } from '@/components/investigate/InvestigationProgress'
import { LegacyTreeTeaser } from '@/components/investigate/LegacyTreeTeaser'
import { MetricsPanel } from '@/components/investigate/MetricsPanel'
import { SafeChecks } from '@/components/investigate/SafeChecks'
import { Timeline } from '@/components/investigate/Timeline'

const STEP_TAB: Record<Exclude<StepId, 'capture'>, AnalysisTab> = {
  understand: 'observations',
  diagnose: 'hypotheses',
  validate: 'missing',
}
const TAB_STEP: Record<AnalysisTab, StepId> = { observations: 'understand', hypotheses: 'diagnose', missing: 'validate' }
const NEXT_STEP: Record<StepId, StepId> = { understand: 'diagnose', diagnose: 'validate', validate: 'capture', capture: 'capture' }

interface Props {
  workspace: IncidentWorkspace
  onSelectEvidence: (id: string) => void
}

/** Keyed by incident id in the parent so step state resets on incident switch. */
export function InvestigatePage({ workspace, onSelectEvidence }: Props) {
  const { navigate } = useIncidentContext()
  const [step, setStep] = useState<StepId>('understand')
  const tab = step === 'capture' ? 'missing' : STEP_TAB[step]

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <IncidentHeader incident={workspace.incident} generatedAt={workspace.generated_at} />
      <InvestigationProgress current={step} onChange={setStep} />

      <div className="grid gap-4 lg:gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          {step === 'capture' ? (
            <CapturePlanned onBack={() => setStep('validate')} />
          ) : (
            <AnalysisPanel
              analysis={workspace.analysis}
              tab={tab}
              onTabChange={(next) => setStep(TAB_STEP[next])}
              onSelectEvidence={onSelectEvidence}
              onNext={() => setStep(NEXT_STEP[step])}
            />
          )}
          <AiInvestigation incidentId={workspace.incident.incident_id} onSelectEvidence={onSelectEvidence} />
          <Timeline events={workspace.timeline} onSelectEvidence={onSelectEvidence} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <MetricsPanel metrics={workspace.metrics} onSelectEvidence={onSelectEvidence} />
          <EvidenceList
            evidence={workspace.evidence}
            onSelectEvidence={onSelectEvidence}
            limit={4}
            onViewAll={() => navigate('evidence', workspace.incident.incident_id)}
          />
          <SafeChecks actionIds={workspace.preview_action_ids} />
          <LegacyTreeTeaser pointers={workspace.knowledge_pointers} onOpen={() => navigate('tree')} />
        </div>
      </div>
    </div>
  )
}
