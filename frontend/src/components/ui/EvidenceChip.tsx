import { Paperclip } from 'lucide-react'

interface EvidenceChipProps {
  id: string
  onSelect?: (id: string) => void
}

/** Citation link from a claim to the evidence item that supports it. */
export function EvidenceChip({ id, onSelect }: EvidenceChipProps) {
  const className = 'inline-flex items-center gap-1 rounded-md border border-cyan/25 bg-cyan/10 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-cyan'
  if (!onSelect) {
    return (
      <span className={className}>
        <Paperclip aria-hidden className="size-2.5" />
        {id}
      </span>
    )
  }
  return (
    <button type="button" onClick={() => onSelect(id)} aria-label={`Open evidence ${id}`} className={`tap ${className} hover:border-cyan/50 hover:bg-cyan/20`}>
      <Paperclip aria-hidden className="size-2.5" />
      {id}
    </button>
  )
}
