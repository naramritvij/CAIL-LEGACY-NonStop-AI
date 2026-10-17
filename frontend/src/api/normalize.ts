import { ApiError } from './errors'
import type { GroundedInvestigationResponse, IncidentSummary, IncidentWorkspace, KnowledgeNode, LegacyTreeResponse } from './types'

/**
 * Lightweight shape checks shared by the mock and HTTP adapters, so components never
 * receive a payload that silently differs from the documented contract.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function requireKeys(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new ApiError('contract_mismatch', `${label} is not an object.`)
  const missing = keys.filter((key) => !(key in value))
  if (missing.length > 0) {
    throw new ApiError('contract_mismatch', `${label} is missing field(s): ${missing.join(', ')}.`)
  }
}

export function normalizeIncidentList(raw: unknown): IncidentSummary[] {
  const list = isObject(raw) && Array.isArray(raw.incidents) ? raw.incidents : raw
  if (!Array.isArray(list)) throw new ApiError('contract_mismatch', 'Incident list is not an array.')
  list.forEach((item, i) => requireKeys(item, ['incident_id', 'title', 'severity'], `Incident #${i + 1}`))
  return list as IncidentSummary[]
}

export function normalizeWorkspace(raw: unknown): IncidentWorkspace {
  requireKeys(raw, ['incident', 'evidence', 'analysis'], 'Workspace')
  requireKeys(raw.incident, ['incident_id', 'title', 'severity'], 'Workspace incident')
  requireKeys(raw.analysis, ['observations', 'hypotheses'], 'Workspace analysis')
  const analysis = raw.analysis as Record<string, unknown>
  return {
    synthetic: true,
    generated_at: '',
    metrics: [],
    timeline: [],
    knowledge_pointers: [],
    training_pointers: [],
    preview_action_ids: [],
    ...raw,
    analysis: { missing_evidence: [], summary: '', ...analysis },
  } as unknown as IncidentWorkspace
}

/**
 * Enforces the approved-only rule on the client as well: anything not explicitly
 * `approved` is dropped, so a misbehaving backend can never put a draft on the tree.
 */
export function normalizeLegacyTree(raw: unknown): LegacyTreeResponse {
  const envelope = isObject(raw) && !Array.isArray(raw) ? raw : {}
  const list = Array.isArray(raw) ? raw : Array.isArray(envelope.nodes) ? envelope.nodes : Array.isArray(envelope.lessons) ? envelope.lessons : null
  if (!list) throw new ApiError('contract_mismatch', 'Legacy tree payload has no nodes array.')
  list.forEach((item, i) => requireKeys(item, ['lesson_id', 'title', 'review_status'], `Knowledge node #${i + 1}`))

  const approved = (list as Record<string, unknown>[]).filter((node) => node.review_status === 'approved')
  const nodes = approved.map((node) => ({
    knowledge_area: 'General',
    asset_type: null,
    revision: 1,
    updated_at: '',
    summary: '',
    operational_reasoning: null,
    related_incident_ids: [],
    evidence_ids: [],
    derived_from_lesson_id: null,
    revisions: [],
    synthetic: true,
    ...node,
  })) as unknown as KnowledgeNode[]

  return {
    synthetic: envelope.synthetic !== false,
    generated_at: typeof envelope.generated_at === 'string' ? envelope.generated_at : '',
    nodes,
    withheld_count: list.length - approved.length,
  }
}

export function normalizeGrounded(raw: unknown): GroundedInvestigationResponse {
  requireKeys(raw, ['claims'], 'Grounded investigation')
  return {
    cited_evidence_ids: [],
    limitations: [],
    grounded: false,
    status: 'mock_template_no_model',
    message: 'Synthetic mock response assembled from local fixture observations; no AI was used.',
    source_registry: [],
    missing_evidence: [],
    simulated: false,
    synthetic: true,
    model: 'unknown',
    ...raw,
  } as unknown as GroundedInvestigationResponse
}
