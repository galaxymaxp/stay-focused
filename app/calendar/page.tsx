import { CalendarDashboard } from '@/components/CalendarDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

// Force dynamic rendering so the calendar always reads fresh task data from the
// database on every request. Without this, Next.js caches the RSC payload in
// both the server full-route cache and the client-side router cache. When a
// server action calls revalidatePath('/calendar'), the server cache is purged,
// but the client router cache may still serve the stale payload on the next
// navigation — causing CalendarDashboard to mount with old items and show
// stale badge counts on month cells (including adjacent-month padding cells).
export const dynamic = 'force-dynamic'

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
