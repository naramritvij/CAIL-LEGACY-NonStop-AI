import { useId } from 'react'
import type { MetricSample } from '@/api/types'
import { cn } from '@/lib/format'

interface SparklineProps {
  samples: MetricSample[]
  threshold?: number
  color: string
  className?: string
}

const W = 120
const H = 36
const PAD = 3

export function Sparkline({ samples, threshold, color, className }: SparklineProps) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  if (samples.length < 2) return null

  const values = samples.map((s) => s.value)
  const min = Math.min(...values, threshold ?? Infinity)
  const max = Math.max(...values, threshold ?? -Infinity)
  const range = max - min || 1
  const x = (i: number) => (i / (samples.length - 1)) * W
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const lastX = x(values.length - 1)
  const lastY = y(values[values.length - 1])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className={cn('overflow-visible', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {threshold !== undefined && (
        <line x1="0" x2={W} y1={y(threshold)} y2={y(threshold)} stroke="rgb(245 198 107 / 0.55)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}
