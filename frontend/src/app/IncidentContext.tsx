import { createContext, type ReactNode, useCallback, useContext, useMemo } from 'react'
import { useIncidents } from '@/api/hooks'
import type { IncidentSummary } from '@/api/types'
import type { ApiError } from '@/api/errors'
import { getNavItem, useHashRoute, type SectionId } from './routes'

interface IncidentContextValue {
  incidents: IncidentSummary[] | undefined
  incidentsError: ApiError | undefined
  incidentsLoading: boolean
  retryIncidents: () => Promise<unknown>
  selectedId: string | undefined
  selected: IncidentSummary | undefined
  selectIncident: (id: string, section?: SectionId) => void
  section: SectionId
  navigate: (section: SectionId, param?: string) => void
}

const IncidentContext = createContext<IncidentContextValue | null>(null)

/** The selected incident lives in the URL (#/investigate/INC-…) so it survives reloads and is shareable. */
export function IncidentProvider({ children }: { children: ReactNode }) {
  const { section, param, navigate } = useHashRoute()
  const { data, error, isLoading, mutate } = useIncidents()

  const scoped = getNavItem(section).incidentScoped
  const selectedId = (scoped && param) || data?.[0]?.incident_id
  const selected = data?.find((incident) => incident.incident_id === selectedId)

  const selectIncident = useCallback(
    (id: string, target?: SectionId) => {
      const next = target ?? (getNavItem(section).incidentScoped ? section : 'investigate')
      navigate(next, id)
    },
    [navigate, section],
  )

  const value = useMemo<IncidentContextValue>(
    () => ({
      incidents: data,
      incidentsError: error,
      incidentsLoading: isLoading,
      retryIncidents: () => mutate(),
      selectedId,
      selected,
      selectIncident,
      section,
      navigate,
    }),
    [data, error, isLoading, mutate, selectedId, selected, selectIncident, section, navigate],
  )

  return <IncidentContext.Provider value={value}>{children}</IncidentContext.Provider>
}

export function useIncidentContext() {
  const value = useContext(IncidentContext)
  if (!value) throw new Error('useIncidentContext must be used inside IncidentProvider')
  return value
}
