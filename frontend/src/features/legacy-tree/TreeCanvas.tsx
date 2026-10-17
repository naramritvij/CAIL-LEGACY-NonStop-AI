import { Minus, Plus, ScanLine } from 'lucide-react'
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/format'
import { ART, lineagePath, type PlacedNode, ROOT, ROOT_PATHS, TRUNK_PATH, VIEWBOX } from './layout'
import { areaStyle, ORB_TONE } from './nodeStyle'
import type { Celebration } from './useCelebration'

function seeded(i: number, n: number) {
  const x = Math.sin(i * 928.37 + n * 13.1) * 43758.5453
  return x - Math.floor(x)
}

const FIREFLIES = Array.from({ length: 16 }, (_, i) => ({
  x: 240 + seeded(i, 1) * 930,
  y: 60 + seeded(i, 2) * 580,
  r: 1.6 + seeded(i, 3) * 1.8,
  dur: 9 + seeded(i, 4) * 9,
  delay: -seeded(i, 5) * 14,
  dx: (seeded(i, 6) - 0.5) * 46,
  dy: (seeded(i, 7) - 0.5) * 34,
}))

const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + seeded(i, 8) * 0.4
  const dist = 46 + seeded(i, 9) * 48
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, delay: seeded(i, 10) * 0.5, r: 1.4 + seeded(i, 11) * 1.6 }
})

const GATHER = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2
  return { fx: Math.cos(angle) * 150, fy: Math.sin(angle) * 110, delay: i * 0.06 }
})

const pct = (value: number, start: number, size: number) => `${((value - start) / size) * 100}%`

const MIN_ZOOM = 1
const MAX_ZOOM = 2.5
const LABEL_ROOM = 0.2

interface TreeCanvasProps {
  placed: PlacedNode[]
  visibleIds: Set<string>
  selectedId: string | null
  onSelect: (id: string) => void
  legacyIds: Set<string>
  growingId?: string | null
  celebration: Celebration
  dormant: boolean
  overlay?: ReactNode
}

export function TreeCanvas({ placed, visibleIds, selectedId, onSelect, legacyIds, growingId, celebration, dormant, overlay }: TreeCanvasProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(placed.map((p) => [p.node.lesson_id, p])), [placed])
  const { phase, style, targetId, runId } = celebration
  const target = targetId ? byId.get(targetId) : undefined
  const verified = style === 'verified'
  const celebrating = verified && (phase === 'celebrate' || phase === 'bloom')
  const pendingId = verified && (phase === 'recognition' || phase === 'travel') ? targetId : undefined

  function clampPan(x: number, y: number, z: number) {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect) return { x, y }
    const maxX = ((z - 1) * rect.width) / 2
    const maxY = ((z - 1) * rect.height) / 2
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) }
  }

  function zoomTo(next: number) {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(next * 100) / 100))
    setZoom(z)
    setPan((p) => clampPan(p.x, p.y, z))
  }

  function reset() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (zoom === 1 || (event.target as HTMLElement).closest('button')) return
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    setPan(clampPan(d.px + event.clientX - d.x, d.py + event.clientY - d.y, zoom))
  }

  function endDrag() {
    drag.current = null
    setDragging(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const step = 40
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (moves[event.key]) {
      event.preventDefault()
      setPan((p) => clampPan(p.x + moves[event.key][0], p.y + moves[event.key][1], zoom))
    } else if (event.key === '+' || event.key === '=') zoomTo(zoom + 0.25)
    else if (event.key === '-') zoomTo(zoom - 0.25)
    else if (event.key === '0') reset()
  }

  const artStyle: CSSProperties = {
    width: `${(ART.w / VIEWBOX.w) * 100}%`,
    height: `${(ART.h / VIEWBOX.h) * 100}%`,
    left: `${(-VIEWBOX.x / VIEWBOX.w) * 100}%`,
    top: `${(-VIEWBOX.y / VIEWBOX.h) * 100}%`,
    opacity: dormant ? 0.26 : celebrating ? 0.92 : 0.52,
    filter: dormant ? 'saturate(0.35) brightness(0.7)' : celebrating ? 'saturate(1.05) brightness(1.04)' : 'saturate(0.8) brightness(0.78)',
    transition: `opacity ${celebrating ? 1.1 : 1.6}s ease, filter ${celebrating ? 1.1 : 1.6}s ease`,
  }

  return (
    <div className="glass relative overflow-hidden p-0">
      <div
        ref={frame}
        role="group"
        aria-label="Knowledge Tree canvas. Use arrow keys to pan when zoomed, plus and minus to zoom, 0 to reset."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          'relative overflow-hidden rounded-[1.25rem] bg-midnight focus-visible:outline-offset-[-2px]',
          zoom > 1 ? 'touch-none' : 'touch-pan-y',
          zoom > 1 && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
        )}
      >
        <div
          className="relative aspect-[1112/712] w-full origin-center"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        >
          <img src="/images/legacy-tree.png" alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={artStyle} />
          {!dormant && <div aria-hidden className="tree-breathe pointer-events-none absolute inset-0" />}

          <svg aria-hidden viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`} className="pointer-events-none absolute inset-0 size-full overflow-visible">
            <defs>
              <radialGradient id="lt-gold">
                <stop offset="0%" stopColor="#fff6dc" />
                <stop offset="45%" stopColor="#f5c66b" />
                <stop offset="100%" stopColor="#f5c66b" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="lt-violet">
                <stop offset="0%" stopColor="#ede9fe" />
                <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
              </radialGradient>
            </defs>

            {!dormant && <path d={TRUNK_PATH} pathLength={1} className="trunk-flow" />}
            {!dormant && ROOT_PATHS.map((d) => <path key={d} d={d} pathLength={1} className="trunk-flow trunk-flow-root" />)}

            {placed.map((p) => {
              const visible = visibleIds.has(p.node.lesson_id)
              const active = p.node.lesson_id === selectedId
              return <path key={p.node.lesson_id} d={p.branchPath} className={cn('branch', active && 'branch-active', !visible && 'opacity-0')} />
            })}

            {placed.map((p) => {
              const parent = p.node.derived_from_lesson_id ? byId.get(p.node.derived_from_lesson_id) : undefined
              if (!parent || !visibleIds.has(p.node.lesson_id) || !visibleIds.has(parent.node.lesson_id)) return null
              const active = selectedId === p.node.lesson_id || selectedId === parent.node.lesson_id
              return <path key={`lineage-${p.node.lesson_id}`} d={lineagePath(parent, p)} className={cn('lineage', active && 'lineage-active')} />
            })}

            {FIREFLIES.slice(0, dormant ? 5 : 16).map((f, i) => (
              <circle
                key={i}
                cx={f.x}
                cy={f.y}
                r={f.r}
                className="firefly"
                style={{ '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDuration: `${f.dur}s, ${f.dur * 0.6}s`, animationDelay: `${f.delay}s` } as CSSProperties}
              />
            ))}

            {verified && target && (phase === 'recognition' || phase === 'travel') && (
              <circle key={`spark-${runId}`} cx={ROOT.x} cy={ROOT.y} r={16} fill="url(#lt-gold)" className={cn('root-spark', phase === 'travel' && 'root-spark-fade')} />
            )}

            {verified && target && phase === 'travel' && (
              <g key={`travel-${runId}`}>
                <path d={target.pulsePath} pathLength={1} className="pulse-trail" />
                <circle r={12} fill="url(#lt-gold)">
                  <animateMotion dur="1.4s" fill="freeze" path={target.pulsePath} calcMode="spline" keyTimes="0;1" keySplines="0.45 0 0.2 1" />
                </circle>
              </g>
            )}

            {verified && target && (phase === 'bloom' || phase === 'celebrate' || phase === 'settle') && (
              <path key={`glow-${runId}`} d={target.branchPath} className={cn('branch-celebrate', phase === 'settle' && 'branch-celebrate-out')} />
            )}

            {verified && target && phase === 'celebrate' && (
              <g key={`party-${runId}`}>
                {GATHER.map((g, i) => (
                  <circle
                    key={`g${i}`}
                    cx={target.x}
                    cy={target.y}
                    r={3}
                    fill="url(#lt-gold)"
                    className="gather"
                    style={{ '--fx': `${g.fx}px`, '--fy': `${g.fy}px`, animationDelay: `${g.delay}s` } as CSSProperties}
                  />
                ))}
                {PARTICLES.map((p, i) => (
                  <circle
                    key={`p${i}`}
                    cx={target.x}
                    cy={target.y}
                    r={p.r}
                    className="particle"
                    style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, animationDelay: `${0.5 + p.delay}s` } as CSSProperties}
                  />
                ))}
              </g>
            )}

            {style === 'personal' && (phase === 'celebrate' || phase === 'settle' || phase === 'static') && (
              <g key={`personal-${runId}`} className={cn('personal-ring', phase === 'settle' && 'personal-ring-out', phase === 'static' && 'personal-ring-static')}>
                <circle cx={ROOT.x} cy={ROOT.y - 10} r={34} fill="url(#lt-violet)" />
                <circle cx={ROOT.x} cy={ROOT.y - 10} r={46} fill="none" stroke="#a78bfa" strokeOpacity="0.55" strokeWidth={1.5} strokeDasharray="3 6" />
              </g>
            )}
          </svg>

          {placed.map((p) => {
            const id = p.node.lesson_id
            const visible = visibleIds.has(id)
            const { icon: Icon, tone } = areaStyle(p.node.knowledge_area)
            const selected = id === selectedId
            const pending = id === pendingId
            const blooming = id === growingId || (verified && id === targetId && (phase === 'bloom' || phase === 'celebrate'))
            const legacy = legacyIds.has(id) && !pending
            const fraction = (p.x - VIEWBOX.x) / VIEWBOX.w
            const nearRight = fraction > 1 - LABEL_ROOM
            const nearLeft = fraction < LABEL_ROOM
            const labelLeft = nearRight || (p.side === 'left' && !nearLeft)
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                tabIndex={visible ? 0 : -1}
                aria-hidden={!visible}
                aria-pressed={selected}
                aria-label={`${p.node.title}. ${p.node.knowledge_area}. Revision ${p.node.revision}, approved.`}
                className={cn(
                  'group absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-500',
                  !visible && 'pointer-events-none opacity-0',
                  pending && 'opacity-20',
                )}
                style={{ left: pct(p.x, VIEWBOX.x, VIEWBOX.w), top: pct(p.y, VIEWBOX.y, VIEWBOX.h) }}
              >
                <span
                  className={cn(
                    'node-orb grid size-8 place-items-center rounded-full border bg-midnight/75 backdrop-blur-sm transition-[transform,box-shadow] duration-300 group-hover:scale-110 sm:size-11',
                    ORB_TONE[tone],
                    selected && 'node-selected',
                    legacy && 'node-legacy',
                    blooming && 'node-bloom',
                    phase === 'static' && id === targetId && verified && 'node-static',
                  )}
                >
                  <Icon aria-hidden className="size-3.5 sm:size-5" />
                </span>
                <span
                  className={cn(
                    'glass-sub pointer-events-none absolute top-1/2 hidden -translate-y-1/2 flex-col rounded-xl px-2.5 py-1.5 text-left whitespace-nowrap md:flex',
                    labelLeft ? 'right-full mr-2 items-end text-right' : 'left-full ml-2',
                    selected ? 'border-cyan/45' : 'opacity-85 group-hover:opacity-100',
                  )}
                >
                  {p.lines.map((line) => (
                    <span key={line} className="text-xs leading-tight font-semibold text-ink">
                      {line}
                    </span>
                  ))}
                  <span className="mt-0.5 text-[11px] leading-tight text-ink-faint">Revision {p.node.revision} · Approved</span>
                </span>
              </button>
            )
          })}
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgb(9_15_31/0.75))]" />
        {overlay}
      </div>

      {!dormant && (
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <div className="glass-sub flex items-center rounded-xl">
            <button type="button" onClick={() => zoomTo(zoom - 0.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" className="tap grid size-9 place-items-center rounded-l-xl text-ink-muted hover:text-ink disabled:opacity-40">
              <Minus aria-hidden className="size-4" />
            </button>
            <span aria-live="polite" className="w-12 text-center font-mono text-xs text-ink-muted tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" onClick={() => zoomTo(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" className="tap grid size-9 place-items-center rounded-r-xl text-ink-muted hover:text-ink disabled:opacity-40">
              <Plus aria-hidden className="size-4" />
            </button>
          </div>
          <button type="button" onClick={reset} className="tap glass-sub inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink-muted hover:text-ink">
            <ScanLine aria-hidden className="size-4" />
            Reset view
          </button>
        </div>
      )}
    </div>
  )
}
