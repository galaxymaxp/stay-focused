import { CalendarDashboard } from '@/components/CalendarDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default async function CalendarPage() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell">
        <SyncFirstEmptyState eyebrow="Calendar" />
      </main>
    )
  }

  return (
    <main className="page-shell">
      <CalendarDashboard
        items={workspace.calendarItems}
        undatedTaskCount={workspace.today.undatedTaskCount}
      />
    </main>
  )
}
