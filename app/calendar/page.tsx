import { CalendarDashboard } from '@/components/CalendarDashboard'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default function CalendarPage() {
  const workspace = getClarityWorkspace()

  return (
    <main className="page-shell">
      <CalendarDashboard
        items={workspace.calendarItems}
        undatedTaskCount={workspace.today.undatedTaskCount}
      />
    </main>
  )
}
