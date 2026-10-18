import { useEffect, useState } from 'react'
import { BookOpen, GraduationCap, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { DATA_MODE } from '@/api/client'
import { workflowRequest } from '@/api/workflows'

type WorkflowReadiness = {
  mode: string
  storage_ready: boolean
  expert_key_configured: boolean
  reviewer_key_configured: boolean
  independent_reviewer_configured: boolean
  approved_source_count: number
  approved_lesson_count: number
  available_apprentice_challenges: number
  real_mentor_identity_verified: false
  production_ready: false
}

export function KnowledgeWorkflowStatus() {
  const [data, setData] = useState<WorkflowReadiness | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(DATA_MODE === 'http')
  async function refresh() {
    if (DATA_MODE !== 'http') return
    setLoading(true)
    setError('')
    try {
      setData(await workflowRequest<WorkflowReadiness>('/knowledge/workflow-readiness'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to check workflow readiness.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [])

  return (
    <section className="glass p-4 sm:p-5" aria-label="Knowledge workflow readiness">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Knowledge transfer · actual local readiness</h2>
        <button type="button" disabled={loading || DATA_MODE !== 'http'} onClick={() => void refresh()}
          className="tap rounded-lg border border-line px-3 py-1.5 text-xs text-cyan disabled:opacity-50">
          {loading ? 'Checking…' : 'Refresh status'}
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Current SQLite records and reviewer-key configuration, not hypothetical demo content. Approvals remain human decisions.
      </p>
      {error && <p role="alert" className="mt-2 text-xs text-coral">{error}</p>}
      {data && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted"><ShieldCheck className="size-4" /> Local storage</p>
              <p className="mt-1 text-sm font-semibold">{data.storage_ready ? 'Available' : 'Unavailable'}</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted"><UserRoundCheck className="size-4" /> Independent review</p>
              <p className="mt-1 text-sm font-semibold">{data.independent_reviewer_configured ? 'Keys configured' : 'Needs local keys'}</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted"><BookOpen className="size-4" /> Approved knowledge</p>
              <p className="mt-1 text-sm font-semibold">{data.approved_source_count} excerpts · {data.approved_lesson_count} lessons</p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <p className="flex items-center gap-1.5 text-xs text-ink-muted"><GraduationCap className="size-4" /> Apprentice</p>
              <p className="mt-1 text-sm font-semibold">{data.available_apprentice_challenges} available challenges</p>
            </div>
          </div>
          {!data.independent_reviewer_configured && (
            <p className="mt-3 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs leading-relaxed text-gold">
              Reviewer and expert actions are disabled until you configure two different local demo keys.
              From PowerShell, run <code className="font-mono">.\scripts\setup_local_knowledge_demo.ps1</code>, then restart Docker Compose.
              Never share those keys with the audience or add them to GitHub.
            </p>
          )}
          {data.independent_reviewer_configured && data.approved_lesson_count === 0 && (
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              No lesson has been approved yet. Open an incident in Investigate, write Decision DNA with the expert key, review it in Mentor with the separate reviewer key, and then open Apprentice. No artificial lessons are seeded.
            </p>
          )}
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="tap rounded-lg border border-line px-3 py-2 text-xs text-cyan" href="#/investigate">1 · Capture lesson</a>
        <a className="tap rounded-lg border border-line px-3 py-2 text-xs text-cyan" href="#/mentor">2 · Mentor review</a>
        <a className="tap rounded-lg border border-line px-3 py-2 text-xs text-cyan" href="#/library">3 · Library</a>
        <a className="tap rounded-lg border border-line px-3 py-2 text-xs text-cyan" href="#/apprentice">4 · Apprentice</a>
      </div>
      <p className="mt-2 text-[11px] text-ink-faint">This is local synthetic training, not production-grade identity verification, HPE source certification or a validated operator qualification.</p>
    </section>
  )
}
