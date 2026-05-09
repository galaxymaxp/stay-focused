import Link from 'next/link'
import { CalendarDashboard } from '@/components/CalendarDashboard'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { getCalendarPageState } from '@/lib/app-route-states'
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
  const data = await loadCalendarPageData()

  if (data.status === 'sync_first') {
    return (
      <main className="page-shell">
        <SyncFirstEmptyState eyebrow="Calendar" />
      </main>
    )
  }

  if (data.status === 'empty') {
    return (
      <main className="page-shell">
        <GeneratedContentState
          kicker="Calendar"
          title="Nothing is on your calendar yet."
          description="Your synced tasks will appear here once they have due dates. Open Tasks to review undated work or sync Canvas again."
          action={(
            <>
              <Link href="/tasks" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Open Tasks
              </Link>
              <Link href="/calendar" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                Retry calendar
              </Link>
            </>
          )}
        />
      </main>
    )
  }

  if (data.status === 'error') {
    return (
      <main className="page-shell">
        <GeneratedContentState
          kicker="Calendar"
          title="Couldn&apos;t load your calendar right now."
          description="Reload this page to try again. If the issue continues, head back to Tasks or Courses while the calendar data catches up."
          tone="warning"
          action={(
            <>
              <Link href="/calendar" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Retry calendar
              </Link>
              <Link href="/courses" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                Go to Courses
              </Link>
            </>
          )}
        />
      </main>
    )
  }

  return (
    <main className="page-shell">
      <CalendarDashboard
        items={data.workspace.calendarItems}
        undatedTaskCount={data.workspace.today.undatedTaskCount}
      />
    </main>
  )
}

async function loadCalendarPageData() {
  try {
    const workspace = await getClarityWorkspace()
    const pageState = getCalendarPageState({
      hasSyncedData: workspace.hasSyncedData,
      scheduledCount: workspace.calendarItems.length,
      undatedTaskCount: workspace.today.undatedTaskCount,
    })

    if (pageState === 'sync_first') return { status: 'sync_first' as const }
    if (pageState === 'empty') return { status: 'empty' as const }
    return { status: 'ready' as const, workspace }
  } catch (error) {
    console.error('[calendar] failed to load page data', error)
    return { status: 'error' as const }
  }
}
