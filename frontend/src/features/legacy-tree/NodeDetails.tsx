import { ArrowUpRight, BadgeCheck, FileText, GitBranch, MousePointerClick, X } from 'lucide-react'
import type { KnowledgeNode } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/format'
import { areaStyle, formatDay, ORB_TONE } from './nodeStyle'

interface NodeDetailsProps {
  node: KnowledgeNode | null
  nodesById: Map<string, KnowledgeNode>
  showcase: boolean
  onSelect: (id: string | null) => void
  onOpenIncident: (incidentId: string) => void
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-xs font-semibold tracking-wider text-ink-faint uppercase">{title}</h3>
      {children}
    </div>
  )
}

export function NodeDetails({ node, nodesById, showcase, onSelect, onOpenIncident }: NodeDetailsProps) {
  if (!node) {
    return (
      <aside aria-label="Knowledge details" className="glass flex flex-col items-center justify-center gap-3 p-6 text-center xl:min-h-full">
        <span className="grid size-11 place-items-center rounded-2xl border border-cyan/25 bg-cyan/10 text-cyan">
          <MousePointerClick aria-hidden className="size-5" />
        </span>
        <h2 className="text-base font-semibold">Select a light on the tree</h2>
        <p className="max-w-xs text-sm leading-relaxed text-pretty text-ink-muted">
          Each light is an approved lesson. Open one to read its operational reasoning, incident context and evidence.
        </p>
      </aside>
    )
  }

  const { icon: Icon, tone } = areaStyle(node.knowledge_area)
  const parent = node.derived_from_lesson_id ? nodesById.get(node.derived_from_lesson_id) : undefined
  const children = [...nodesById.values()].filter((n) => n.derived_from_lesson_id === node.lesson_id)

  return (
    <aside aria-labelledby="node-title" className="glass flex animate-fade-up flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-full border bg-midnight/70', ORB_TONE[tone])}>
          <Icon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="node-title" className="text-lg leading-snug font-semibold text-balance">
            {node.title}
          </h2>
          <p className="mt-0.5 font-mono text-[11px] text-ink-faint">{node.lesson_id}</p>
        </div>
        <button type="button" onClick={() => onSelect(null)} aria-label="Close details" className="tap -mt-1 -mr-1 grid size-8 place-items-center rounded-lg text-ink-faint hover:bg-white/5 hover:text-ink">
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="emerald" icon={<BadgeCheck aria-hidden className="size-3.5" />}>
          Approved
        </Badge>
        <span className="text-xs text-ink-muted">
          {showcase ? `Revision ${node.revision}` : 'Locally approved'} · {formatDay(node.updated_at)}
        </span>
        {showcase && <Badge tone="violet">Synthetic demo</Badge>}
      </div>

      <p className="text-sm leading-relaxed text-pretty text-ink-muted">{node.summary || 'No summary was provided for this lesson.'}</p>

      <Section title="Operational reasoning">
        <p className="text-sm leading-relaxed text-pretty text-ink">{node.operational_reasoning ?? 'No reasoning was recorded with this lesson.'}</p>
      </Section>

      <Section title="Incident context">
        {node.related_incident_ids.length === 0 ? (
          <p className="text-sm text-ink-muted">No incident is linked to this lesson.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {node.related_incident_ids.map((id) => (
              <li key={id}>
                {showcase ? (
                  <span className="neu-inset flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                    <span className="font-mono text-xs text-cyan">{id}</span>
                    <span className="text-[11px] text-ink-faint">Fictional incident</span>
                  </span>
                ) : (
                  <button type="button" onClick={() => onOpenIncident(id)} className="tap neu-inset flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:text-cyan">
                    <span className="font-mono text-xs text-cyan">{id}</span>
                    <ArrowUpRight aria-hidden className="size-4 text-ink-faint" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Evidence references">
        {node.evidence_ids.length === 0 ? (
          <p className="text-sm text-ink-muted">No evidence references were attached.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {node.evidence_ids.map((id) => (
              <li key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-ink-muted">
                <FileText aria-hidden className="size-3.5 text-ink-faint" />
                {id}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(parent || children.length > 0) && (
        <Section title="Lineage">
          <ul className="flex flex-col gap-2">
            {parent && (
              <li>
                <button type="button" onClick={() => onSelect(parent.lesson_id)} className="tap flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-violet/45">
                  <GitBranch aria-hidden className="size-4 rotate-180 text-violet" />
                  <span className="text-ink-faint">Extends</span>
                  <span className="truncate">{parent.title}</span>
                </button>
              </li>
            )}
            {children.map((child) => (
              <li key={child.lesson_id}>
                <button type="button" onClick={() => onSelect(child.lesson_id)} className="tap flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-violet/45">
                  <GitBranch aria-hidden className="size-4 text-violet" />
                  <span className="text-ink-faint">Extended by</span>
                  <span className="truncate">{child.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  )
}
