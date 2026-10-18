import { Activity, ArrowUpRight, Database, FileSearch, LockKeyhole, TerminalSquare, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DATA_MODE, API_BASE } from '@/api/client'

type StatusColor = 'green' | 'yellow' | 'red' | 'unknown'
type HealthStatus = {
  incident_id: string | null
  title: string
  system: string
  color: StatusColor
  meaning: string
  evidence_ids: string[]
  source_mode: string
}
type Overview = { tools_connected: boolean; statuses: HealthStatus[]; warning: string }
type LiveCapabilities = {
  mode: string; connectivity_checked: false
  sources: { tool_id: string; configured: boolean; connected: null; execution_allowed: false }[]
}
type Command = { id: string; label: string; execution_allowed: boolean; source_href: string | null }
type Source = {
  tool_id: string; connected: boolean; mode: string
  health_signal: StatusColor; docs_url: string
  evidence: Record<string, unknown>[]; note: string
}

const statusStyle: Record<StatusColor, string> = {
  green: 'border-emerald/35 bg-emerald/10 text-emerald',
  yellow: 'border-gold/35 bg-gold/10 text-gold',
  red: 'border-coral/35 bg-coral/10 text-coral',
  unknown: 'border-line-strong bg-white/5 text-ink-muted',
}
const sources = ['asap', 'ems', 'scf'] as const

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return (await response.json()) as T
}

export function OperatorCommandCenter({
  incidentId, onSelectIncident,
}: {
  incidentId?: string
  onSelectIncident: (incidentId: string) => void
}) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [liveCapabilities, setLiveCapabilities] = useState<LiveCapabilities | null>(null)
  const [commands, setCommands] = useState<Command[]>([])
  const [source, setSource] = useState<Source | null>(null)
  const [preview, setPreview] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (DATA_MODE !== 'http') return
    const controller = new AbortController()
    getJson<Overview>(`${API_BASE}/operations/overview`, { signal: controller.signal })
      .then(setOverview)
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(String(e)) })
    getJson<LiveCapabilities>(`${API_BASE}/integrations/capabilities`, { signal: controller.signal })
      .then(setLiveCapabilities)
      .catch(() => { /* Older demo API has no live gateway registry. */ })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (DATA_MODE !== 'http' || !incidentId) return
    const controller = new AbortController()
    setSource(null)
    setPreview(null)
    setCommands([])
    getJson<{ commands: Command[] }>(
      `${API_BASE}/operations/incidents/${encodeURIComponent(incidentId)}/commands`,
      { signal: controller.signal },
    ).then((data) => setCommands(data.commands))
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(String(e)) })
    return () => controller.abort()
  }, [incidentId])

  async function openSource(tool: string) {
    if (!incidentId || !sources.some((id) => id === tool)) return
    const data = await getJson<Source>(
      `${API_BASE}/operations/incidents/${encodeURIComponent(incidentId)}/sources/${tool}`,
    )
    setSource(data)
  }

  async function previewCommand(command: Command) {
    if (!incidentId) return
    setBusy(command.id)
    setError('')
    setPreview(null)
    try {
      const result = await getJson<unknown>(`${API_BASE}/operations/commands/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident_id: incidentId, command_id: command.id }),
      })
      setPreview(result)
      if (command.id.startsWith('open_')) await openSource(command.id.slice(5))
      if (command.id === 'show_alerts') await openSource('ems')
    } catch (e) {
      setError(String(e))
    } finally { setBusy(null) }
  }

  async function showSource(tool: string) {
    setBusy(tool)
    setError('')
    setSource(null)
    try { await openSource(tool) }
    catch (e) { setError(String(e)) }
    finally { setBusy(null) }
  }

  return (
    <section className="glass glow-cyan flex flex-col gap-4 p-5 sm:p-6" aria-label="System Health Command Center">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-cyan uppercase">Enterprise tool bridge</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">System Health Command Center</h2>
          <p className="mt-1 text-sm text-ink-muted">Check signals, inspect their origins and preview safe operator commands.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-xl border border-gold/35 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
          <LockKeyhole aria-hidden className="size-4" /> Simulated · Read only
        </span>
      </div>
      {DATA_MODE !== 'http' ? (
        <p className="glass-sub p-4 text-sm text-ink-muted">
          Source connectors require Local API mode. Showcase mode is a separate fictional interface.
        </p>
      ) : (
        <>
          {error && <p role="alert" className="rounded-xl border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
          {liveCapabilities && <div className="glass-sub p-4" aria-label="Production source gateway configuration">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <LockKeyhole aria-hidden className="size-4 text-cyan" />
              Authenticated source adapters · configuration only
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              The cards below reflect server configuration, NOT proven connections.
              Live snapshots require a separate operator credential and authorized HTTPS gateway.
              Public demo never receives those credentials.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {liveCapabilities.sources.map((tool) => <span key={tool.tool_id}
                className={'rounded-lg border px-2.5 py-1.5 text-xs font-semibold '+
                  (tool.configured ? 'border-gold/35 text-gold' : 'border-line text-ink-muted')}>
                {tool.tool_id.toUpperCase()} · {tool.configured ? 'Configured, unverified' : 'Not connected'}
              </span>)}
            </div>
          </div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {!overview && <p role="status" className="text-sm text-ink-muted">Checking synthetic health signals…</p>}
            {overview?.statuses.map((item) => (
              <button
                type="button" key={item.incident_id ?? 'explicit-green-baseline'}
                disabled={!item.incident_id}
                onClick={() => item.incident_id && onSelectIncident(item.incident_id)}
                className="glass-sub tap flex flex-col items-start gap-2 p-4 text-left disabled:cursor-default"
              >
                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold uppercase ${statusStyle[item.color]}`}>
                  {item.color}
                </span>
                <span className="text-sm font-semibold text-ink">{item.title}</span>
                <span className="text-xs text-ink-muted">{item.system}</span>
                <span className="text-xs text-ink-muted">{item.meaning}</span>
                <span className="text-[11px] text-ink-faint">{item.evidence_ids.length} simulated markers · {item.source_mode}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="glass-sub p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><TerminalSquare aria-hidden className="size-4 text-cyan" /> Operator commands</h3>
              <p className="mt-1 text-xs text-ink-muted">Display-only interface actions; never TACL/SCF execution.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {commands.map((cmd) => (
                  <button
                    key={cmd.id} type="button" disabled={!incidentId || busy !== null}
                    onClick={() => void previewCommand(cmd)}
                    className="tap rounded-lg border border-cyan/25 bg-cyan/10 px-3 py-2 text-xs font-medium text-cyan hover:border-cyan/60 disabled:opacity-50"
                  >{cmd.label}</button>
                ))}
              </div>
            </div>
            <div className="glass-sub p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Database aria-hidden className="size-4 text-cyan" /> Open original source projection</h3>
              <p className="mt-1 text-xs text-ink-muted">Fixture-derived evidence, never an authenticated HPE feed.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sources.map((tool) => (
                  <button
                    key={tool} type="button" disabled={!incidentId || busy !== null}
                    onClick={() => void showSource(tool)}
                    className="tap inline-flex items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-xs font-medium text-ink hover:border-cyan/50 disabled:opacity-50"
                  ><FileSearch aria-hidden className="size-4" /> {tool.toUpperCase()} evidence</button>
                ))}
              </div>
            </div>
          </div>
          {source && (
            <div className="glass-sub flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{source.tool_id.toUpperCase()} · {source.health_signal.toUpperCase()}</h3>
                {source.docs_url.startsWith('https://') && (
                  <a href={source.docs_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-cyan underline">
                    Official reference <ArrowUpRight aria-hidden className="size-3" />
                  </a>
                )}
              </div>
              <p className="text-xs text-ink-muted">{source.note} · Mode: {source.mode} · Live connected: {String(source.connected)}</p>
              <pre className="max-h-80 overflow-auto rounded-lg border border-line-strong bg-black/20 p-3 text-xs text-ink-muted">{JSON.stringify(source.evidence, null, 2)}</pre>
            </div>
          )}
          {preview != null && (
            <details className="glass-sub p-4">
              <summary className="cursor-pointer text-sm font-semibold text-cyan">Display-only command preview</summary>
              <pre className="mt-3 max-h-60 overflow-auto text-xs text-ink-muted">{JSON.stringify(preview, null, 2)}</pre>
            </details>
          )}
          <div className="flex items-start gap-2 text-xs leading-relaxed text-ink-muted">
            {overview?.tools_connected
              ? <Activity aria-hidden className="size-4 shrink-0 text-coral" />
              : <TriangleAlert aria-hidden className="size-4 shrink-0 text-gold" />}
            <p>{overview?.warning ?? 'Synthetic fixtures only.'} Missing evidence is UNKNOWN, never GREEN.
              No live tool connection or operational command is authorized.</p>
          </div>
        </>
      )}
    </section>
  )
}
