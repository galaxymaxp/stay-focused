import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getCoursesPageState } from '@/lib/app-route-states'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseSummaries, type CourseSummary } from '@/lib/course-summary'

export const revalidate = 300

export default async function CoursesPage() {
  const data = await loadCoursesPageData()

  if (data.status === 'sync_first') {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Courses" />
      </main>
    )
  }

  if (data.status === 'empty') {
    return (
      <main className="page-shell command-page">
        <GeneratedContentState
          kicker="Courses"
          title="No courses are ready to show yet."
          description="Your Canvas connection is active, but there are no visible course cards yet. Run a sync from Courses or Calendar and check again in a moment."
          action={(
            <>
              <Link href="/courses" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Retry courses
              </Link>
              <Link href="/calendar" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                Open Calendar
              </Link>
            </>
          )}
        />
      </main>
    )
  }

  if (data.status === 'error') {
    return (
      <main className="page-shell command-page">
        <GeneratedContentState
          kicker="Courses"
          title="Couldn&apos;t load your courses right now."
          description="Try reloading this page. If it keeps happening, open Calendar or Home while Stay Focused reconnects to your saved course data."
          tone="warning"
          action={(
            <>
              <Link href="/courses" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Retry courses
              </Link>
              <Link href="/" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                Go to Home
              </Link>
            </>
          )}
        />
      </main>
    )
  }

  const totalPendingTasks = data.summaries.reduce((sum, s) => sum + s.pendingTaskCount, 0)
  const totalReadyPacks = data.summaries.reduce((sum, s) => sum + s.readyPackCount, 0)

  return (
    <main className="page-shell command-page">
      <section className="motion-card section-shell section-shell-elevated" style={{ padding: '1.05rem 1.15rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <p className="ui-kicker">Courses</p>
            <h1 className="ui-page-title" style={{ marginTop: '0.35rem' }}>Your courses</h1>
            <p className="ui-page-copy" style={{ marginTop: '0.35rem', maxWidth: '36rem' }}>
              Each card shows how many tasks are due and how many you&apos;ve completed.
            </p>
          </div>
          <div className="command-stat-grid" style={{ flex: '0 1 auto' }}>
            <StatTile label="Courses" value={String(data.summaries.length)} />
            <StatTile label="Pending tasks" value={String(totalPendingTasks)} tone="warning" />
            <StatTile label="Ready packs" value={String(totalReadyPacks)} tone="accent" />
          </div>
        </div>
      </section>

      <div className="courses-grid">
        {data.summaries.map((summary, index) => (
          <CourseCard key={summary.course.id} summary={summary} index={index} />
        ))}
      </div>
    </main>
  )
}

async function loadCoursesPageData() {
  try {
    const workspace = await getClarityWorkspace()
    const supabase = await createAuthenticatedSupabaseServerClient()
    const summaries = workspace.hasSyncedData
      ? await buildCourseSummaries(workspace, supabase)
      : []
    const pageState = getCoursesPageState({
      hasSyncedData: workspace.hasSyncedData,
      summaryCount: summaries.length,
    })

    if (pageState === 'sync_first') return { status: 'sync_first' as const }
    if (pageState === 'empty') return { status: 'empty' as const }
    return { status: 'ready' as const, summaries }
  } catch (error) {
    console.error('[courses] failed to load page data', error)
    return { status: 'error' as const }
  }
}

function CourseCard({ summary, index }: { summary: CourseSummary; index: number }) {
  const href = summary.firstModuleId
    ? `/modules/${summary.firstModuleId}/learn`
    : `/courses/${summary.course.id}`

  return (
    <Link
      href={href}
      className={`motion-card motion-delay-${Math.min(index + 1, 4)} section-shell section-shell-elevated ui-interactive-card courses-card`}
      style={{ textDecoration: 'none' }}
    >
      {/* Header */}
      <div>
        <p className="ui-kicker" style={{ margin: 0 }}>{summary.course.code}</p>
        <p className="courses-card-name">
          {summary.course.name}
        </p>
        {summary.course.instructor && (
          <p className="courses-card-instructor">{summary.course.instructor}</p>
        )}
      </div>

      {/* Actionable metrics */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {summary.pendingTaskCount > 0 ? (
          <span className="ui-chip ui-status-warning" style={{ fontSize: '11px', fontWeight: 700, padding: '0.2rem 0.5rem' }}>
            {summary.pendingTaskCount} due
          </span>
        ) : (
          <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 600 }}>
            All caught up
          </span>
        )}
        {summary.readyPackCount > 0 ? (
          <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 20%, var(--border-subtle) 80%)' }}>
            {summary.readyPackCount} pack{summary.readyPackCount === 1 ? '' : 's'} ready
          </span>
        ) : null}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="home-row-open">Open course</span>
      </div>
    </Link>
  )
}

function StatTile({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'accent' | 'warning' | 'muted'
}) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{
        margin: '0.34rem 0 0',
        fontSize: '20px',
        lineHeight: 1.1,
        fontWeight: 650,
        color: tone === 'warning' ? 'var(--amber)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)',
      }}>
        {value}
      </p>
    </div>
  )
}
