/**
 * Explicit projection from the EXISTING CAIL FastAPI synthetic read-model to
 * Maggie's v0 view model. Do not fabricate telemetry samples, expert identity,
 * root cause, evidence citations, or operational authorization here.
 *
 * Source: backend/app/{scenarios,analysis,incident_workspace,legacy_tree,
 * grounded_investigation}.py on main, 17 October 2026.
 */
import { ApiError } from './errors'
import type {
  GroundedInvestigationResponse, IncidentSummary, IncidentWorkspace,
  KnowledgeNode, LegacyTreeResponse, Severity,
} from './types'

type RecordValue = Record<string, unknown>

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('contract_mismatch', `${label} is not an object.`)
  }
  return value as RecordValue
}

function arr(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiError('contract_mismatch', `${label} must be an array.`)
  return value
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new ApiError('contract_mismatch', `${label} must be a string.`)
  return value
}

function txt(value: unknown): string { return typeof value === 'string' ? value : '' }
function strs(value: unknown): string[] { return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [] }
function num(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ApiError('contract_mismatch', `${label} must be a finite number.`)
  return value
}
function id(value: unknown, label: string): string {
  const s = str(value, label)
  if (!s.trim()) throw new ApiError('contract_mismatch', `${label} cannot be empty.`)
  return s
}

/** Backend has warning/high severity, not v0 SEV-1..4. This is a display mapping only. */
function severity(value: unknown): Severity {
  switch (value) {
    case 'high': case 'critical': return 'SEV-2'
    case 'warning': return 'SEV-3'
    case 'info': case 'low': return 'SEV-4'
    default: throw new ApiError('contract_mismatch', 'Unknown backend incident severity.')
  }
}

function timeOf(value: unknown): string {
  // Backend event times are synthetic HH:MM clock readings without a calendar date.
  // 1970-01-01 is a UI-only anchor, not an assertion about when an event occurred.
  if (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return `1970-01-01T${value}:00Z`
  throw new ApiError('contract_mismatch', 'Backend incident event lacks a valid HH:MM synthetic clock.')
}

function eventRows(incident: RecordValue): RecordValue[] {
  return arr(incident.events, 'Incident events').map((item, n) => {
    const event = record(item, `Incident event ${n + 1}`)
    id(event.id, 'Event ID')
    str(event.message, 'Event message')
    timeOf(event.time)
    return event
  })
}

function incidentSummary(raw: unknown): IncidentSummary {
  const x = record(raw, 'Incident')
  const events = eventRows(x)
  return {
    incident_id: id(x.id, 'Incident ID'),
    title: id(x.title, 'Incident title'),
    severity: severity(x.severity),
    status: x.status === 'investigating' ? 'investigating' : x.status === 'resolved' ? 'resolved' : 'open',
    service: txt(x.system) || 'Synthetic NonStop system',
    environment: 'Synthetic training environment',
    started_at: events.length ? timeOf(events[0].time) : '1970-01-01T00:00:00Z',
    synthetic: x.synthetic === true,
  }
}

export function fromBackendIncidents(raw: unknown): IncidentSummary[] {
  return arr(raw, 'GET /incidents response').map(incidentSummary)
}

export function fromBackendWorkspace(raw: unknown): IncidentWorkspace {
  const w = record(raw, 'Incident Workspace')
  if (w.synthetic !== true || w.operational_action_authorized !== false || w.state_change_executed !== false) {
    throw new ApiError('contract_mismatch', 'Workspace safety/synthetic markers were missing or unexpected.')
  }
  const original = record(w.incident, 'Workspace incident')
  const brief = record(w.analysis, 'Workspace analysis')
  if (brief.root_cause_status !== 'not_established') {
    throw new ApiError('contract_mismatch', 'Unexpected established root cause in synthetic training workspace.')
  }
  const incident = incidentSummary(original)
  const events = eventRows(original)
  const evidenceIds = new Set(events.map((event) => str(event.id, 'Event ID')))
  const lastTime = events.length ? timeOf(events[events.length - 1].time) : incident.started_at

  const normalizedMetrics = arr(original.metrics, 'Incident metrics').map((item, n) => {
    const metric = record(item, `Metric ${n + 1}`)
    const name = str(metric.name, 'Metric name')
    const current = num(metric.value, 'Metric value')
    const baseline = num(metric.baseline, 'Metric baseline')
    return {
      metric_id: `SYNTH-METRIC-${n + 1}`,
      name,
      unit: str(metric.unit, 'Metric unit'),
      current,
      baseline,
      direction: name.toLowerCase().includes('availability') ? 'lower_is_worse' as const : 'higher_is_worse' as const,
      // The FastAPI fixture only provides current and baseline, not sampled history.
      // Never invent a trend or chart samples.
      samples: [],
    }
  })
  const threshold = normalizedMetrics.find((metric) => metric.name === 'Simulated threshold' && metric.unit === '%')?.current
  const metrics = normalizedMetrics.filter((metric) => metric.name !== 'Simulated threshold').map((metric) => (
    metric.name === 'Disk utilization' && threshold !== undefined ? { ...metric, threshold } : metric
  ))

  const evidence = events.map((evt) => {
    const key = str(evt.id, 'Event ID')
    const message = str(evt.message, 'Event message')
    const level = txt(evt.level).toLowerCase()
    return {
      evidence_id: key,
      category: (level === 'warning' || level === 'high' ? 'alert' : 'log') as 'alert' | 'log',
      source: txt(evt.source) || 'synthetic event fixture',
      timestamp: timeOf(evt.time),
      observed_value: message,
      detail: message,
      verification: 'simulated' as const,
      synthetic: true,
    }
  })
  const timeline = events.map((evt) => ({
    event_id: id(evt.id, 'Event ID'),
    timestamp: timeOf(evt.time),
    kind: (evt.level === 'warning' || evt.level === 'high' ? 'alert' : 'observation') as 'alert' | 'observation',
    title: str(evt.message, 'Event message'),
    detail: txt(evt.source),
    evidence_ids: [id(evt.id, 'Event ID')],
  }))

  const observations = arr(brief.findings, 'Deterministic findings').map((item, n) => {
    const finding = record(item, `Finding ${n + 1}`)
    const cited = strs(finding.evidence_ids)
    if (cited.length === 0 || cited.some((citation) => !evidenceIds.has(citation))) {
      throw new ApiError('contract_mismatch', 'A deterministic finding cites an unknown or missing event.')
    }
    return { id: `OBS-${n + 1}`, statement: str(finding.statement, 'Finding statement'), evidence_ids: cited }
  })
  const missing = strs(brief.missing_evidence)
  const hypotheses = strs(brief.hypotheses_unverified).map((statement, n) => ({
    id: `HYP-${n + 1}`,
    statement,
    rationale: 'Unconfirmed synthetic scenario hypothesis. The evidence does not establish causation.',
    status: 'unconfirmed' as const,
    supporting_evidence_ids: [],
    confirm_with: 'Verify the missing incident evidence before drawing a conclusion.',
  }))
  const missing_evidence = missing.map((question, n) => ({
    id: `MISSING-${n + 1}`,
    question: `Verify: ${question}`,
    why_it_matters: 'Missing prerequisites prevent a confirmed root-cause assessment or operational change.',
    suggested_source: 'Operator investigation; source not provided in synthetic fixture',
  }))
  const tree = record(w.legacy_tree, 'Workspace approved tree')
  const approvedNodes = arr(tree.nodes, 'Workspace tree nodes').map((node) => record(node, 'Knowledge node'))
    .filter((node) => node.review_status === 'approved')
  const knowledge_pointers = approvedNodes.map((node) => ({
    lesson_id: id(node.id, 'Approved lesson ID'), title: str(node.title, 'Approved lesson title'), review_status: 'approved' as const,
  }))
  const training_pointers = arr(w.training_challenges, 'Training challenges').map((node) => {
    const x = record(node, 'Training challenge')
    return { lesson_id: id(x.lesson_id, 'Challenge lesson ID') }
  })
  const allowed = new Set(arr(w.sentinel_previews, 'Sentinel previews').map((value) => record(value, 'Sentinel preview'))
    .filter((preview) => preview.allowed === true && preview.simulation_only === true && preview.classification === 'read_only')
    .map((preview) => id(preview.action_id, 'Action ID')))
  const preview_action_ids = strs(brief.recommended_read_only_actions).filter((value) => allowed.has(value))

  return {
    synthetic: true,
    generated_at: lastTime,
    incident: {
      ...incident,
      summary: str(original.summary, 'Incident summary'),
      impact: 'Impact not independently measured in this synthetic training fixture.',
      detected_at: incident.started_at,
      affected_components: [],
    },
    metrics, evidence, timeline,
    analysis: {
      method: 'deterministic_rules', model_inference: false,
      summary: `Deterministic evidence review: ${observations.length} finding(s); root cause not established.`,
      observations, hypotheses, missing_evidence,
    },
    knowledge_pointers, training_pointers, preview_action_ids,
  }
}

export function fromBackendTree(raw: unknown): LegacyTreeResponse {
  const w = record(raw, 'Knowledge Tree')
  if (w.synthetic !== true || w.review_scope !== 'approved_only' || w.identity_or_source_authenticity_verified !== false) {
    throw new ApiError('contract_mismatch', 'Approved-only tree safety fields missing or unexpected.')
  }
  const items = arr(w.nodes, 'Knowledge Tree nodes').map((item) => record(item, 'Knowledge Tree node'))
  const approved = items.filter((node) => node.review_status === 'approved')
  const ids = new Set(approved.map((node) => id(node.id, 'Lesson ID')))
  const nodes: KnowledgeNode[] = approved.map((node) => {
    const parent = txt(node.revision_of)
    const incidentId = id(node.incident_id, 'Knowledge incident')
    const sourceIds = strs(node.source_event_ids)
    if (!sourceIds.length || !sourceIds.every((v) => /^SIM-EVT-\d+$/.test(v))) {
      throw new ApiError('contract_mismatch', 'Knowledge node contains missing or unregistered-looking evidence.')
    }
    return {
      lesson_id: id(node.id, 'Lesson ID'), title: str(node.title, 'Lesson title'),
      knowledge_area: 'Operations', asset_type: incidentId === 'INC-DISK-001' ? 'Disk' : 'Pathway',
      review_status: 'approved', revision: 1,
      updated_at: txt(node.reviewed_at), summary: txt(node.reasoning_preview),
      operational_reasoning: txt(node.reasoning_preview) || null,
      related_incident_ids: [incidentId], evidence_ids: sourceIds,
      derived_from_lesson_id: parent && ids.has(parent) ? parent : null,
      revisions: [], synthetic: true,
    }
  })
  return {
    synthetic: true, generated_at: '', nodes,
    // The server returns approved-only; do not pretend we know how many drafts were withheld.
    withheld_count: 0,
  }
}

export function fromBackendGrounded(raw: unknown): GroundedInvestigationResponse {
  const w = record(raw, 'Grounded investigation')
  if (w.synthetic !== true || w.operational_action_authorized !== false || w.state_change_executed !== false) {
    throw new ApiError('contract_mismatch', 'Grounded investigation safety fields missing or unexpected.')
  }
  const status = id(w.status, 'Investigation status')
  const accepted = status === 'generated_unverified_citation_ids_checked'
  const sources = arr(w.source_registry, 'AI source registry').map((entry) => {
    const x = record(entry, 'AI source')
    return { id: id(x.id, 'Source ID'), kind: txt(x.kind), source_text: txt(x.source_text) }
  })
  const registry = new Set(sources.map((source) => source.id))
  const claims = accepted ? arr(w.claims, 'AI claims').map((entry) => {
    const x = record(entry, 'AI claim')
    const citations = strs(x.citations)
    if (!citations.length || citations.some((v) => !registry.has(v))) {
      throw new ApiError('contract_mismatch', 'AI claim referenced an unregistered evidence ID.')
    }
    return { text: str(x.text, 'AI claim text'), kind: 'observed' as const, evidence_ids: citations }
  }) : []
  return {
    incident_id: id(w.incident_id, 'Investigation incident ID'),
    question: '', claims, cited_evidence_ids: [...new Set(claims.flatMap((claim) => claim.evidence_ids))],
    model: ['local_reference_explanation', 'reference_required', 'insufficient_relevant_evidence'].includes(status) ? 'not_called' : (txt(w.model) || 'local Ollama'),
    // Source ID checking is not proof of semantic grounding.
    grounded: false, simulated: true, synthetic: true,
    status, message: txt(w.message), source_registry: sources,
    missing_evidence: strs(w.missing_evidence),
    limitations: [txt(w.limitation) || 'Citation IDs exist, but the accuracy of the model explanation is not established.'],
  }
}
