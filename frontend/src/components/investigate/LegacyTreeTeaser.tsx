import { BookMarked, Sprout } from 'lucide-react'
import type { KnowledgePointer, ReviewStatus } from '@/api/types'
import { Badge, type Tone } from '@/components/ui/Badge'

const REVIEW_TONE: Record<ReviewStatus, Tone> = {
  draft: 'slate',
  submitted: 'amber',
  reviewed: 'cyan',
  approved: 'emerald',
  rejected: 'coral',
}

export function LegacyTreeTeaser({ pointers, onOpen }: { pointers: KnowledgePointer[]; onOpen: () => void }) {
  return (
    <section aria-labelledby="tree-title" className="glass glow-teal flex flex-col overflow-hidden">
      <div className="relative h-52 sm:h-60">
        <img src="/images/legacy-tree.png" alt="" className="absolute inset-0 size-full object-cover" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-midnight via-midnight/30 to-transparent" />
        <div className="absolute inset-x-5 bottom-4">
          <div className="flex items-center gap-2">
            <h2 id="tree-title" className="font-display text-lg font-semibold tracking-[0.24em]">
              KNOWLEDGE TREE
            </h2>
            <Badge tone="emerald">Approved only</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Locally reviewed synthetic Decision DNA</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5 pt-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <BookMarked aria-hidden className="size-4 text-teal" />
          Related lessons
        </h3>
        {pointers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No lessons are linked to this incident yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pointers.map((pointer) => (
              <li key={pointer.lesson_id} className="neu-inset flex items-center gap-3 rounded-xl px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{pointer.title}</span>
                  <span className="font-mono text-[11px] text-ink-faint">{pointer.lesson_id}</span>
                </span>
                <Badge tone={REVIEW_TONE[pointer.review_status]} className="capitalize">
                  {pointer.review_status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Only locally approved demo lessons appear here. Approval does not authenticate a real expert or validate HPE guidance.
        </p>
        <button type="button" onClick={onOpen} className="tap neu-raised mt-4 inline-flex items-center justify-center gap-2 self-start rounded-xl px-4 py-2 text-sm font-medium text-teal">
          <Sprout aria-hidden className="size-4" />
          Open the Knowledge Tree
        </button>
      </div>
    </section>
  )
}
