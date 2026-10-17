import { cn } from '@/lib/format'

export const PRODUCT_NAME = 'CAIL / Nonstop AI Operations Assistant'

export function BrandGlyph({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-xl border border-cyan/35 bg-cyan/10 shadow-[0_0_24px_-6px_var(--color-cyan)]',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-cyan">
        <path d="M17.6 7.2A7 7 0 1 0 17.6 16.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 12h5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.9" fill="currentColor" />
        <circle cx="18.6" cy="12" r="1.3" fill="currentColor" />
      </svg>
    </span>
  )
}

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandGlyph />
      <span className="sr-only">{PRODUCT_NAME}</span>
      {compact ? (
        <span aria-hidden className="font-display text-lg font-bold tracking-[0.18em] text-ink">
          CAIL
        </span>
      ) : (
        <span aria-hidden className="flex items-center gap-2">
          <span className="font-display text-2xl font-bold leading-none tracking-[0.12em] text-ink">CAIL</span>
          <span className="font-display text-xl font-light leading-none text-cyan">/</span>
          <span className="flex flex-col text-[11px] font-medium leading-tight text-ink-muted">
            <span>Nonstop AI</span>
            <span>Operations Assistant</span>
          </span>
        </span>
      )}
    </span>
  )
}
