import { SWRConfig } from 'swr'
import { IncidentProvider, useIncidentContext } from '@/app/IncidentContext'
import { MobileNav } from '@/components/shell/MobileNav'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { ErrorState } from '@/components/ui/States'
import { HomePage } from '@/pages/HomePage'
import { OperatorCommandCenter } from '@/components/operations/OperatorCommandCenter'
import { LegacyTreePage } from '@/pages/LegacyTreePage'
import { MentorPage } from '@/pages/MentorPage'
import { LibraryPage } from '@/pages/LibraryPage'
import { ApprenticePage } from '@/pages/ApprenticePage'
import { OperationsLabPage } from '@/pages/OperationsLabPage'
import { AtmExperiencePage } from '@/pages/AtmExperiencePage'
import { AtmChat } from '@/components/operations/AtmChat'
import { WorkspaceView } from '@/pages/WorkspaceView'

function Content() {
  const { section, incidentsError, retryIncidents, selectedId, selectIncident } = useIncidentContext()
  if (section === 'chat') return <AtmChat />
  if (section === 'atm') return <AtmExperiencePage />
  if (section === 'operations') return <OperationsLabPage />
  if (section === 'mentor') return <MentorPage />
  if (section === 'library') return <LibraryPage />
  if (section === 'apprentice') return <ApprenticePage />
  if (section === 'tree') return <LegacyTreePage />
  if (incidentsError) return <ErrorState error={incidentsError} onRetry={retryIncidents} />
  if (section === 'home') return <>
    <OperatorCommandCenter incidentId={selectedId} onSelectIncident={(id) => selectIncident(id, 'investigate')} />
    <HomePage />
  </>
  return <WorkspaceView view={section === 'evidence' ? 'evidence' : 'investigate'} />
}

export function App() {
  return (
    <SWRConfig value={{ revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true }}>
      <IncidentProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-royal focus:px-4 focus:py-2">
          Skip to content
        </a>
        <div className="mx-auto flex max-w-[1600px] gap-5 sm:p-4">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col gap-4 lg:gap-5">
            <TopBar />
            <main id="main" className="min-w-0 px-3 pb-28 sm:px-0 lg:pb-6">
              <Content />
            </main>
          </div>
        </div>
        <MobileNav />
      </IncidentProvider>
    </SWRConfig>
  )
}
