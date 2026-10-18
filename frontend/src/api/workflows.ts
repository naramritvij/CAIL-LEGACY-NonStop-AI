import { API_BASE, DATA_MODE } from '@/api/client'

export type DemoRole = 'expert' | 'reviewer'
export interface CorpusRecord {
  id: string; title: string; source_url: string; section: string; release: string
  source_kind: string; status: string; created_at: string; reviewed_at: string | null
  reviewer_notes: string | null; content_verified_against_url: boolean
  chunks?: { citation_id: string; ordinal: number; excerpt: string; sha256: string }[]
}
export interface DecisionLesson {
  id: string; incident_id: string; author_alias: string; symptoms: string
  reasoning: string; rejected_action: string; prerequisites: string[]
  evidence_ids: string[]; previous_lesson_id: string | null
  status: string; reviewer_notes: string | null; reviewed_at: string | null
}
export interface TransferChallenge {
  challenge_id: string; based_on_approved_lesson_id: string; title: string
  situation: string; task: string; synthetic: boolean
  events: { id: string; observation: string }[]; unknowns: string[]
}
export interface TransferScore {
  score: number; passed: boolean; unmet_mandatory_conditions: string[]
  safety: { allowed: boolean; policy_reason: string }
  evidence: { supported: string[]; missing: string[]; unsupported: string[] }
  prerequisites: { missing: string[] }
  state_change_executed: boolean; attempt_persisted: boolean
}
export interface SafePreview {
  action_id: string; status: string; allowed: boolean; simulation_only: boolean
  reason: string; output: { incident_id: string; event_ids: string[]; unverified_conditions: string[] } | null
}

export async function workflowRequest<T>(
  path: string, method: 'GET' | 'POST' = 'GET', body?: unknown,
  role?: DemoRole, credential?: string,
): Promise<T> {
  if (DATA_MODE !== 'http') throw new Error('This workflow requires Local API · Synthetic mode.')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (role) {
    if (!credential?.trim()) throw new Error('Enter your local demo ' + role + ' key.')
    headers[role === 'expert' ? 'X-Legacy-Expert-Key' : 'X-Legacy-Reviewer-Key'] = credential
  }
  // Local knowledge actions should never leave a spinner waiting indefinitely.
  // Timeout is bounded and is not a retry: do not duplicate writes.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(API_BASE + path, {
      method, headers, cache: 'no-store', signal: controller.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (!response.ok) {
      const data: unknown = await response.json().catch(() => null)
      const detail = data && typeof data === 'object' && 'detail' in data
        ? String((data as { detail: unknown }).detail) : 'Request failed'
      throw new Error(`${detail} (HTTP ${response.status})`)
    }
    return await response.json() as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The local knowledge service did not respond in 15 seconds. Check Docker and refresh the queue before retrying a submission; it may have been saved.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
