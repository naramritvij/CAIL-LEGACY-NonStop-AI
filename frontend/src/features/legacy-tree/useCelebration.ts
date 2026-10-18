import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '@/lib/useMediaQuery'
import type { CelebrationStyle } from './achievements'

/**
 * recognition → travel → bloom → celebrate → settle → idle.
 * `static` replaces the whole sequence when the user prefers reduced motion.
 */
export type CelebrationPhase = 'idle' | 'recognition' | 'travel' | 'bloom' | 'celebrate' | 'settle' | 'static'

export interface CelebrationState {
  phase: CelebrationPhase
  style?: CelebrationStyle
  targetId?: string
  runId: number
}

const SCHEDULES: Record<CelebrationStyle, [CelebrationPhase, number][]> = {
  verified: [
    ['travel', 600],
    ['bloom', 2000],
    ['celebrate', 2700],
    ['settle', 3900],
    ['idle', 5200],
  ],
  personal: [
    ['celebrate', 300],
    ['settle', 2600],
    ['idle', 3800],
  ],
}

interface StartOptions {
  style: CelebrationStyle
  targetId?: string
  /** Fires when the new light blooms (immediately under reduced motion). */
  onBloom?: () => void
}

export function useCelebration() {
  const reduced = usePrefersReducedMotion()
  const [state, setState] = useState<CelebrationState>({ phase: 'idle', runId: 0 })
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const start = useCallback(
    ({ style, targetId, onBloom }: StartOptions) => {
      timers.current.forEach((id) => window.clearTimeout(id))
      timers.current = []
      setState((prev) => ({ phase: reduced ? 'static' : 'recognition', style, targetId, runId: prev.runId + 1 }))

      if (reduced) {
        onBloom?.()
        timers.current.push(window.setTimeout(() => setState((prev) => ({ ...prev, phase: 'idle' })), 3200))
        return
      }
      for (const [phase, at] of SCHEDULES[style]) {
        timers.current.push(
          window.setTimeout(() => {
            setState((prev) => ({ ...prev, phase }))
            if (phase === 'bloom') onBloom?.()
          }, at),
        )
      }
    },
    [reduced],
  )

  return { ...state, active: state.phase !== 'idle', reduced, start }
}

export type Celebration = ReturnType<typeof useCelebration>
