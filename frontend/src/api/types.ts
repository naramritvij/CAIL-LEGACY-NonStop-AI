/**
 * Frontend contracts for the LEGACY FastAPI service (/api/v1).
 * HTTP payloads are explicitly mapped from the real FastAPI contract in backend-contract.ts.
 */

export type DataMode = 'mock' | 'http'

export type Severity = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4'
export type IncidentStatus = 'open' | 'investigating' | 'mitigated' | 'resolved'

/** GET /incidents */
export interface IncidentSummary {
  incident_id: string
  title: string
  severity: Severity
  status: IncidentStatus
  service: string
  environment: string
  started_at: string
  synthetic: boolean
}

/** GET /incidents/{incident_id} */
export interface IncidentDetail extends IncidentSummary {
  summary: string
  impact: string
  detected_at: string
  affected_components: string[]
}

export interface MetricSample {
  t: string
  value: number
}

export interface IncidentMetric {
  metric_id: string
  name: string
  unit: string
  current: number
  baseline: number
  threshold?: number
  direction: 'higher_is_worse' | 'lower_is_worse'
  samples: MetricSample[]
  evidence_id?: string
}

export type EvidenceCategory = 'alert' | 'log' | 'metric' | 'trace' | 'deployment' | 'config'
export type EvidenceVerification = 'simulated' | 'observed' | 'unverified'

export interface EvidenceItem {
  evidence_id: string
  category: EvidenceCategory
  source: string
  timestamp: string
  observed_value: string
  detail: string
  related_claim?: string
  verification: EvidenceVerification
  synthetic: boolean
}

export type TimelineKind = 'alert' | 'deploy' | 'change' | 'observation' | 'escalation'

export interface TimelineEvent {
  event_id: string
  timestamp: string
  kind: TimelineKind
  title: string
  detail?: string
  evidence_ids: string[]
}

export interface AnalysisObservation {
  id: string
  statement: string
  evidence_ids: string[]
}

export type HypothesisStatus = 'plausible' | 'unconfirmed' | 'weakened'

export interface AnalysisHypothesis {
  id: string
  statement: string
  rationale: string
  status: HypothesisStatus
  supporting_evidence_ids: string[]
  confirm_with: string
}

export interface MissingEvidence {
  id: string
  question: string
  why_it_matters: string
  suggested_source: string
}

/** Deterministic, model-independent analysis bundled in the workspace payload. */
export interface DeterministicAnalysis {
  method: 'deterministic_rules'
  model_inference: false
  summary: string
  observations: AnalysisObservation[]
  hypotheses: AnalysisHypothesis[]
  missing_evidence: MissingEvidence[]
}

export type ReviewStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'rejected'

export interface KnowledgePointer {
  lesson_id: string
  title: string
  review_status: ReviewStatus
}

/** GET /incidents/{incident_id}/workspace — read-only, no AI inference. */
export interface IncidentWorkspace {
  synthetic: boolean
  generated_at: string
  incident: IncidentDetail
  metrics: IncidentMetric[]
  evidence: EvidenceItem[]
  timeline: TimelineEvent[]
  analysis: DeterministicAnalysis
  knowledge_pointers: KnowledgePointer[]
  training_pointers: { lesson_id: string }[]
  preview_action_ids: string[]
}

/** POST /investigate/grounded */
export interface GroundedInvestigationRequest {
  incident_id: string
  question: string
}

export type ClaimKind = 'observed' | 'hypothesis' | 'unknown'

export interface GroundedClaim {
  text: string
  kind: ClaimKind
  evidence_ids: string[]
}

export interface GroundedInvestigationResponse {
  status?: string
  message?: string
  source_registry?: { id: string; kind: string; source_text: string }[]
  missing_evidence?: string[]
  incident_id: string
  question: string
  claims: GroundedClaim[]
  cited_evidence_ids: string[]
  model: string
  grounded: boolean
  simulated: boolean
  synthetic: boolean
  limitations: string[]
}

export interface KnowledgeRevision {
  revision: number
  created_at: string
  change_summary: string
}

/** One approved lesson rendered as a light on the Legacy Tree. */
export interface KnowledgeNode {
  lesson_id: string
  title: string
  knowledge_area: string
  asset_type: string | null
  review_status: ReviewStatus
  revision: number
  updated_at: string
  summary: string
  operational_reasoning: string | null
  related_incident_ids: string[]
  evidence_ids: string[]
  /** Lineage: the approved lesson this one extends, if any. */
  derived_from_lesson_id: string | null
  revisions: KnowledgeRevision[]
  synthetic: boolean
}

/** GET /knowledge/legacy-tree — the backend serves approved knowledge only. */
export interface LegacyTreeResponse {
  synthetic: boolean
  generated_at: string
  nodes: KnowledgeNode[]
  /** Client-computed: records the normalizer discarded because they were not approved. */
  withheld_count: number
}

/** The single surface every component uses. Mock and HTTP adapters both implement it. */
export interface LegacyApi {
  readonly mode: DataMode
  listIncidents(): Promise<IncidentSummary[]>
  getWorkspace(incidentId: string): Promise<IncidentWorkspace>
  investigateGrounded(req: GroundedInvestigationRequest): Promise<GroundedInvestigationResponse>
  getLegacyTree(): Promise<LegacyTreeResponse>
}
