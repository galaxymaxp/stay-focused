import { CalendarDashboard } from '@/components/CalendarDashboard'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default async function CalendarPage() {
  const workspace = await getClarityWorkspace()

  return (
    <main className="page-shell">
      <CalendarDashboard
        items={workspace.calendarItems}
        undatedTaskCount={workspace.today.undatedTaskCount}
      />
    </main>
  )
}
