import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { EvidenceItem } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatTime } from '@/lib/format'
import { EVIDENCE_META } from './meta'

const VERIFICATION_TONE = { simulated: 'gold', observed: 'teal', unverified: 'amber' } as const

export function EvidenceDialog({ item, onClose }: { item: EvidenceItem | undefined; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (item && !dialog.open) dialog.showModal()
    if (!item && dialog.open) dialog.close()
  }, [item])

  const meta = item ? EVIDENCE_META[item.category] : undefined
  const Icon = meta?.icon

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="evidence-dialog-title"
      className="glass m-auto w-[min(36rem,calc(100vw-2rem))] p-0 text-ink backdrop:bg-midnight/70 backdrop:backdrop-blur-sm"
    >
      {item && meta && Icon && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan/25 bg-cyan/10 text-cyan">
              <Icon aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs text-ink-faint">{item.evidence_id}</p>
              <h2 id="evidence-dialog-title" className="mt-0.5 text-lg font-semibold text-pretty">
                {item.observed_value}
              </h2>
            </div>
            <button type="button" onClick={onClose} className="tap grid size-9 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-white/5 hover:text-ink">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Badge tone={VERIFICATION_TONE[item.verification]} className="capitalize">
              {item.verification}
            </Badge>
            {item.synthetic && <Badge tone="gold">Synthetic</Badge>}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-pretty text-ink-muted">{item.detail}</p>

          {item.related_claim && (
            <p className="neu-inset mt-4 rounded-xl px-3.5 py-2.5 text-sm text-pretty">
              <span className="font-semibold text-cyan">Supports: </span>
              {item.related_claim}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-ink-faint">Source</dt>
              <dd className="mt-0.5 font-mono text-xs break-words">{item.source}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-faint">Captured</dt>
              <dd className="mt-0.5 text-xs tabular-nums">
                {formatDate(item.timestamp)} · {formatTime(item.timestamp)}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </dialog>
  )
}
