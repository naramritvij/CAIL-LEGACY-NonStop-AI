import { FlaskConical, GraduationCap, Info, Sparkles, Sprout } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client'
import { useLegacyTree } from '@/api/hooks'
import type { LegacyTreeResponse } from '@/api/types'
import { useIncidentContext } from '@/app/IncidentContext'
import { Badge } from '@/components/ui/Badge'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { celebrationStyle, celebrationTarget, type AchievementEvent } from '@/features/legacy-tree/achievements'
import { layoutTree } from '@/features/legacy-tree/layout'
import { NodeDetails } from '@/features/legacy-tree/NodeDetails'
import { RevisionLineage } from '@/features/legacy-tree/RevisionLineage'
import { SHOWCASE_TREE } from '@/features/legacy-tree/showcase'
import { TreeCanvas } from '@/features/legacy-tree/TreeCanvas'
import { ALL, assetOf, TreeFilters } from '@/features/legacy-tree/TreeFilters'
import { useCelebration } from '@/features/legacy-tree/useCelebration'
import { cn } from '@/lib/format'

type Source = 'approved' | 'showcase'

function SourceToggle({ source, onChange }: { source: Source; onChange: (s: Source) => void }) {
  const options: { id: Source; label: string }[] = [
    { id: 'approved', label: api.mode === 'http' ? 'Approved knowledge' : 'Approved (mock API)' },
    { id: 'showcase', label: 'Synthetic Showcase' },
  ]
  return (
    <div role="radiogroup" aria-label="Tree data source" className="neu-inset flex rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={source === o.id}
          onClick={() => onChange(o.id)}
          className={cn('tap rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap', source === o.id ? 'btn-primary text-white' : 'text-ink-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function DormantOverlay({ withheld, onShowcase }: { withheld: number; onShowcase: () => void }) {
  return (
    <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
      <div className="glass max-w-md px-5 py-5 text-center sm:px-7">
        <span className="mx-auto grid size-11 place-items-center rounded-2xl border border-teal/30 bg-teal/10 text-teal">
          <Sprout aria-hidden className="size-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold">The tree is resting, waiting for its first light</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-pretty text-ink-muted">
          No approved knowledge has been returned yet. Lessons appear here only after an independent mentor approves them.
          {withheld > 0 && ` ${withheld} unapproved record${withheld === 1 ? ' was' : 's were'} withheld.`}
        </p>
        <button type="button" onClick={onShowcase} className="tap neu-raised mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-violet">
          <FlaskConical aria-hidden className="size-4" />
          Explore the Synthetic Showcase
        </button>
      </div>
    </div>
  )
}

function TreeView({ tree, showcase, onShowcase }: { tree: LegacyTreeResponse; showcase: boolean; onShowcase: () => void }) {
  const { navigate } = useIncidentContext()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [area, setArea] = useState(ALL)
  const [asset, setAsset] = useState(ALL)
  const [legacyIds, setLegacyIds] = useState<Set<string>>(() => new Set())
  const celebration = useCelebration()
  const [grown, setGrown] = useState<number | null>(null)
  const growTimers = useRef<number[]>([])

  useEffect(() => () => growTimers.current.forEach((t) => window.clearTimeout(t)), [])

  const growOrder = useMemo(() => [...tree.nodes].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).map((n) => n.lesson_id), [tree.nodes])
  const growing = grown !== null
  const growingId = growing && grown > 0 ? growOrder[grown - 1] : null

  function grow() {
    growTimers.current.forEach((t) => window.clearTimeout(t))
    setArea(ALL)
    setAsset(ALL)
    setSelectedId(null)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setGrown(null)
      return
    }
    setGrown(0)
    const total = growOrder.length
    growTimers.current = Array.from({ length: total + 1 }, (_, i) =>
      window.setTimeout(() => setGrown(i === total ? null : i + 1), 700 + i * 1100 + (i === total ? 1400 : 0)),
    )
  }

  const placed = useMemo(() => layoutTree(tree.nodes), [tree.nodes])
  const nodesById = useMemo(() => new Map(tree.nodes.map((n) => [n.lesson_id, n])), [tree.nodes])
  const visibleIds = useMemo(() => {
    const allowed = growing ? new Set(growOrder.slice(0, grown)) : null
    return new Set(
      tree.nodes
        .filter((n) => (!allowed || allowed.has(n.lesson_id)) && (area === ALL || n.knowledge_area === area) && (asset === ALL || assetOf(n) === asset))
        .map((n) => n.lesson_id),
    )
  }, [tree.nodes, area, asset, growing, grown, growOrder])
  const selected = selectedId && visibleIds.has(selectedId) ? (nodesById.get(selectedId) ?? null) : null
  const dormant = tree.nodes.length === 0

  function preview(kind: AchievementEvent['kind']) {
    const newest = [...tree.nodes].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
    const event: AchievementEvent = {
      event_id: `showcase-${Date.now()}`,
      kind,
      lesson_id: selected?.lesson_id ?? newest?.lesson_id,
      source: 'showcase_preview',
      confirmed: false,
    }
    const targetId = celebrationTarget(event)
    if (targetId) {
      setArea(ALL)
      setAsset(ALL)
    }
    celebration.start({
      style: celebrationStyle(kind),
      targetId,
      onBloom: () => targetId && setLegacyIds((prev) => new Set(prev).add(targetId)),
    })
  }

  const announcement = growing
    ? `Synthetic growth demo: ${grown} of ${growOrder.length} lessons shown.`
    : celebration.active && celebration.style === 'verified'
      ? `Preview: ${nodesById.get(celebration.targetId ?? '')?.title ?? 'a lesson'} joins the tree as approved knowledge.`
      : celebration.active && celebration.style === 'personal'
        ? 'Preview: personal learning progress. This does not add or approve any knowledge.'
        : ''

  return (
    <div className="flex flex-col gap-4">
      {!dormant && <TreeFilters nodes={tree.nodes} area={area} asset={asset} onArea={setArea} onAsset={setAsset} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <TreeCanvas
            placed={placed}
            visibleIds={visibleIds}
            selectedId={selected?.lesson_id ?? null}
            onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
            legacyIds={legacyIds}
            growingId={growingId}
            celebration={celebration}
            dormant={dormant}
            overlay={dormant ? <DormantOverlay withheld={tree.withheld_count} onShowcase={onShowcase} /> : undefined}
          />

          {showcase && (
            <div className="glass-sub flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <p className="flex-1 text-xs leading-relaxed text-ink-muted">
                <span className="font-semibold text-violet">Demonstration only.</span> Celebrations normally play once, when the backend confirms an approved lesson. These previews change nothing.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={grow}
                  disabled={celebration.active || growing}
                  className="tap inline-flex items-center gap-2 rounded-xl border border-teal/40 bg-teal/10 px-3.5 py-2 text-xs font-semibold text-teal hover:bg-teal/15 disabled:opacity-50"
                >
                  <Sprout aria-hidden className="size-4" />
                  {growing ? `Growing ${grown} of ${growOrder.length}` : 'Grow from seed'}
                </button>
                <button
                  type="button"
                  onClick={() => preview('lesson_approved')}
                  disabled={celebration.active || growing}
                  className="tap inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3.5 py-2 text-xs font-semibold text-gold hover:bg-gold/15 disabled:opacity-50"
                >
                  <Sparkles aria-hidden className="size-4" />
                  Preview Celebration
                </button>
                <button
                  type="button"
                  onClick={() => preview('learning_challenge_passed')}
                  disabled={celebration.active || growing}
                  className="tap inline-flex items-center gap-2 rounded-xl border border-violet/40 bg-violet/10 px-3.5 py-2 text-xs font-semibold text-violet hover:bg-violet/15 disabled:opacity-50"
                >
                  <GraduationCap aria-hidden className="size-4" />
                  Preview learning progress
                </button>
              </div>
            </div>
          )}
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {celebration.phase === 'static' && (
            <p className="glass-sub px-3 py-2 text-xs text-ink-muted">
              {celebration.style === 'verified' ? 'A new light was added to the tree. Motion is reduced, so the change is shown without animation.' : 'Personal learning progress marked near the roots. No knowledge was added.'}
            </p>
          )}
        </div>

        {!dormant && (
          <NodeDetails node={selected} nodesById={nodesById} showcase={showcase} onSelect={setSelectedId} onOpenIncident={(id) => navigate('investigate', id)} />
        )}
      </div>

      {selected && <RevisionLineage node={selected} />}
    </div>
  )
}

export function LegacyTreePage() {
  const [source, setSource] = useState<Source>('approved')
  const { data, error, isLoading, mutate } = useLegacyTree()
  useEffect(() => { void mutate() }, [mutate])
  const showcase = source === 'showcase'
  const tree = showcase ? SHOWCASE_TREE : data

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Knowledge Tree</h1>
            {showcase ? <Badge tone="violet">Synthetic</Badge> : <Badge tone="emerald">Approved only</Badge>}
          </div>
          <p className="mt-1 text-sm text-pretty text-ink-muted">Locally reviewed synthetic Decision DNA and its revision lineage; not verified operational expertise.</p>
        </div>
        <SourceToggle source={source} onChange={setSource} />
      </header>

      <div role="note" className={cn('glass-sub flex items-start gap-3 px-4 py-3 text-sm', showcase ? 'border-violet/35' : 'border-teal/30')}>
        <Info aria-hidden className={cn('mt-0.5 size-4 shrink-0', showcase ? 'text-violet' : 'text-teal')} />
        <p className="leading-relaxed text-pretty text-ink-muted">
          {showcase
            ? 'Synthetic Showcase Mode: every lesson, incident and evidence reference shown is fictional, created only to demonstrate the experience. None of it is verified knowledge.'
            : `Only locally reviewer-approved knowledge from GET /api/v1/knowledge/knowledge-tree is shown. Drafts and unreviewed content are never displayed.${api.mode === 'http' ? '' : ' The mock adapter is active, so no approved lessons exist yet.'}`}
        </p>
      </div>

      {!tree && error ? (
        <ErrorState error={error} onRetry={() => mutate()} />
      ) : !tree || (isLoading && !showcase && !data) ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the Knowledge Tree">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="aspect-[1112/712] w-full" />
        </div>
      ) : (
        <TreeView key={source} tree={tree} showcase={showcase} onShowcase={() => setSource('showcase')} />
      )}
    </div>
  )
}
