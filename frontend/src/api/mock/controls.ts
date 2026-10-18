import { useSyncExternalStore } from 'react'

/** Lets demos exercise loading, empty and failure states without a backend. Mock mode only. */
export type MockScenario = 'normal' | 'slow' | 'empty' | 'error'

export const MOCK_SCENARIOS: { id: MockScenario; label: string }[] = [
  { id: 'normal', label: 'Normal responses' },
  { id: 'slow', label: 'Slow network' },
  { id: 'empty', label: 'No incidents' },
  { id: 'error', label: 'API unavailable' },
]

let scenario: MockScenario = 'normal'
const listeners = new Set<() => void>()

export function getMockScenario(): MockScenario {
  return scenario
}

export function setMockScenario(next: MockScenario) {
  scenario = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useMockScenario(): MockScenario {
  return useSyncExternalStore(subscribe, getMockScenario, getMockScenario)
}
