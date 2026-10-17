import useSWR from 'swr'
import { api, DATA_MODE } from './client'
import type { ApiError } from './errors'
import { useMockScenario } from './mock/controls'
import type { IncidentSummary, IncidentWorkspace, LegacyTreeResponse } from './types'

/** Mock scenario is part of the key so switching it refetches without touching components. */
function useScenarioKey() {
  const scenario = useMockScenario()
  return DATA_MODE === 'mock' ? scenario : 'live'
}

export function useIncidents() {
  const scenario = useScenarioKey()
  return useSWR<IncidentSummary[], ApiError>(['incidents', scenario], () => api.listIncidents())
}

export function useLegacyTree() {
  const scenario = useScenarioKey()
  return useSWR<LegacyTreeResponse, ApiError>(['legacy-tree', scenario], () => api.getLegacyTree())
}

export function useWorkspace(incidentId: string | undefined) {
  const scenario = useScenarioKey()
  return useSWR<IncidentWorkspace, ApiError>(incidentId ? ['workspace', incidentId, scenario] : null, () =>
    api.getWorkspace(incidentId as string),
  )
}
