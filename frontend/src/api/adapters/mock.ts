import { ApiError } from '../errors'
import { getMockScenario } from '../mock/controls'
import { MOCK_INCIDENTS, MOCK_WORKSPACES } from '../mock/data'
import { normalizeGrounded, normalizeIncidentList, normalizeLegacyTree, normalizeWorkspace } from '../normalize'
import type { LegacyApi } from '../types'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function simulateNetwork() {
  const scenario = getMockScenario()
  await wait(scenario === 'slow' ? 2400 : 380)
  if (scenario === 'error') {
    throw new ApiError('unavailable', 'The CAIL API is unavailable (simulated failure).')
  }
  return scenario
}

// Deep copy keeps components from mutating the shared fixtures.
const clone = <T,>(value: T): T => structuredClone(value)

export function createMockAdapter(): LegacyApi {
  return {
    mode: 'mock',
    async listIncidents() {
      const scenario = await simulateNetwork()
      return normalizeIncidentList(scenario === 'empty' ? [] : clone(MOCK_INCIDENTS))
    },
    async getWorkspace(incidentId) {
      await simulateNetwork()
      const workspace = MOCK_WORKSPACES[incidentId]
      if (!workspace) throw new ApiError('not_found', `Incident ${incidentId} was not found.`, { status: 404 })
      return normalizeWorkspace(clone(workspace))
    },
    async investigateGrounded(req) {
      await simulateNetwork()
      const workspace = MOCK_WORKSPACES[req.incident_id]
      if (!workspace) throw new ApiError('not_found', `Incident ${req.incident_id} was not found.`, { status: 404 })
      const claims = workspace.analysis.observations.slice(0, 3).map((o) => ({
        text: o.statement,
        kind: 'observed' as const,
        evidence_ids: o.evidence_ids,
      }))
      return normalizeGrounded({
        incident_id: req.incident_id,
        question: req.question,
        claims,
        cited_evidence_ids: claims.flatMap((c) => c.evidence_ids),
        model: 'mock-template',
        grounded: true,
        simulated: true,
        synthetic: true,
        limitations: ['Mock response assembled from fixture observations. No model was called.'],
      })
    },
    async getLegacyTree() {
      await simulateNetwork()
      // Mentor approval does not exist yet, so the honest mock answer is an empty, approved-only tree.
      return normalizeLegacyTree({ synthetic: true, generated_at: '2026-03-14T15:00:00Z', nodes: [] })
    },
  }
}
