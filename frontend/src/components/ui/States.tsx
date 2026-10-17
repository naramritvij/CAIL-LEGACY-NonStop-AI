import { CloudOff, type LucideIcon, RotateCw, SearchX, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { ApiError } from '@/api/errors'
import { cn } from '@/lib/format'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  tone?: 'cyan' | 'gold' | 'violet'
  className?: string
}

const ICON_TONE = {
  cyan: 'text-cyan border-cyan/25 bg-cyan/10',
  gold: 'text-gold border-gold/30 bg-gold/10',
  violet: 'text-violet border-violet/30 bg-violet/10',
}

export function EmptyState({ icon: Icon, title, children, action, tone = 'cyan', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className={cn('grid size-12 place-items-center rounded-2xl border', ICON_TONE[tone])}>
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-sm leading-relaxed text-pretty text-ink-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

const ERROR_COPY: Record<ApiError['code'], { title: string; icon: LucideIcon }> = {
  network: { title: 'Cannot reach CAIL', icon: CloudOff },
  timeout: { title: 'The request timed out', icon: CloudOff },
  unavailable: { title: 'Service unavailable', icon: CloudOff },
  not_found: { title: 'Incident not found', icon: SearchX },
  validation: { title: 'Request not accepted', icon: TriangleAlert },
  contract_mismatch: { title: 'Unexpected response shape', icon: TriangleAlert },
  server: { title: 'The server reported an error', icon: TriangleAlert },
  unknown: { title: 'Something went wrong', icon: TriangleAlert },
}

interface ErrorStateProps {
  error: ApiError
  onRetry?: () => Promise<unknown> | void
  secondaryAction?: ReactNode
  className?: string
}

export function ErrorState({ error, onRetry, secondaryAction, className }: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false)
  const copy = ERROR_COPY[error.code] ?? ERROR_COPY.unknown
  const Icon = copy.icon

  async function retry() {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div role="alert" className={cn('glass flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="grid size-12 place-items-center rounded-2xl border border-coral/30 bg-coral/10 text-coral">
        <Icon aria-hidden className="size-5" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{copy.title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-pretty text-ink-muted">{error.message}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onRetry && error.retryable !== false && (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            className="tap btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <RotateCw aria-hidden className={cn('size-4', retrying && 'animate-spin')} />
            {retrying ? 'Retrying…' : 'Try again'}
          </button>
        )}
        {secondaryAction}
      </div>
    </div>
  )
}
