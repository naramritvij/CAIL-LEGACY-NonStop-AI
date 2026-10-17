import type { KnowledgeNode } from '@/api/types'
import { cn } from '@/lib/format'
import { areaStyle, DOT_TONE } from './nodeStyle'

export const ALL = 'all'

function counts(nodes: KnowledgeNode[], key: (n: KnowledgeNode) => string) {
  const map = new Map<string, number>()
  for (const n of nodes) map.set(key(n), (map.get(key(n)) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export const assetOf = (n: KnowledgeNode) => n.asset_type ?? 'Unspecified'

interface ChipProps {
  active: boolean
  onClick: () => void
  label: string
  count: number
  dot?: string
}

function Chip({ active, onClick, label, count, dot }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'tap inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium',
        active ? 'border-cyan/45 bg-cyan/12 text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />}
      {label}
      <span className="font-mono text-[11px] text-ink-faint tabular-nums">{count}</span>
    </button>
  )
}

interface TreeFiltersProps {
  nodes: KnowledgeNode[]
  area: string
  asset: string
  onArea: (value: string) => void
  onAsset: (value: string) => void
}

export function TreeFilters({ nodes, area, asset, onArea, onAsset }: TreeFiltersProps) {
  const areas = counts(nodes, (n) => n.knowledge_area)
  const assets = counts(nodes, assetOf)

  return (
    <section aria-label="Knowledge filters" className="glass flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <h2 className="w-24 shrink-0 text-xs font-semibold tracking-wider text-ink-faint uppercase">Area</h2>
        <div className="no-scrollbar -my-1 flex gap-2 overflow-x-auto py-1">
          <Chip active={area === ALL} onClick={() => onArea(ALL)} label="All knowledge" count={nodes.length} />
          {areas.map(([name, count]) => (
            <Chip key={name} active={area === name} onClick={() => onArea(name)} label={name} count={count} dot={DOT_TONE[areaStyle(name).tone]} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <h2 className="w-24 shrink-0 text-xs font-semibold tracking-wider text-ink-faint uppercase">Asset type</h2>
        <div className="no-scrollbar -my-1 flex gap-2 overflow-x-auto py-1">
          <Chip active={asset === ALL} onClick={() => onAsset(ALL)} label="All assets" count={nodes.length} />
          {assets.map(([name, count]) => (
            <Chip key={name} active={asset === name} onClick={() => onAsset(name)} label={name} count={count} />
          ))}
        </div>
      </div>
    </section>
  )
}
