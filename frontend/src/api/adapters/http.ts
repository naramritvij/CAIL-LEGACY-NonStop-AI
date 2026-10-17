import { errorFromStatus, toApiError } from '../errors'
import { fromBackendGrounded, fromBackendIncidents, fromBackendTree, fromBackendWorkspace } from '../backend-contract'
import type { LegacyApi } from '../types'

const DEFAULT_TIMEOUT_MS = 15_000
// Local model inference can be slow on laptops.
const INFERENCE_TIMEOUT_MS = 90_000

async function request(base: string, path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
    if (!response.ok) {
      let detail: string | undefined
      try {
        const body = (await response.json()) as { detail?: unknown }
        if (typeof body.detail === 'string') detail = body.detail
      } catch {
        // Non-JSON error bodies fall back to the status-based message.
      }
      throw errorFromStatus(response.status, detail)
    }
    return await response.json()
  } catch (error) {
    throw toApiError(error)
  } finally {
    clearTimeout(timer)
  }
}

export function createHttpAdapter(base: string): LegacyApi {
  const root = base.replace(/\/$/, '')
  return {
    mode: 'http',
    async listIncidents() {
      return fromBackendIncidents(await request(root, '/incidents'))
    },
    async getWorkspace(incidentId) {
      return fromBackendWorkspace(await request(root, `/incidents/${encodeURIComponent(incidentId)}/workspace`))
    },
    async investigateGrounded(req) {
      const raw = await request(root, '/investigate/grounded', { method: 'POST', body: JSON.stringify({ ...req, release: 'L23.08', max_chunks: 3 }) }, INFERENCE_TIMEOUT_MS)
      return { ...fromBackendGrounded(raw), question: req.question }
    },
    async getLegacyTree() {
      return fromBackendTree(await request(root, '/knowledge/knowledge-tree'))
    },
  }
}
