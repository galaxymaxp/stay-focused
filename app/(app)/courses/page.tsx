import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseSummaries, type CourseSummary } from '@/lib/course-summary'

export const revalidate = 300

export default async function CoursesPage() {
  const workspace = await getClarityWorkspace()
  const supabase = await createAuthenticatedSupabaseServerClient()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Courses" />
      </main>
    )
  }

  const summaries = await buildCourseSummaries(workspace, supabase)
  const totalPendingTasks = summaries.reduce((sum, s) => sum + s.pendingTaskCount, 0)
  const totalReadyPacks = summaries.reduce((sum, s) => sum + s.readyPackCount, 0)

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
            <StatTile label="Courses" value={String(summaries.length)} />
            <StatTile label="Pending tasks" value={String(totalPendingTasks)} tone="warning" />
            <StatTile label="Ready packs" value={String(totalReadyPacks)} tone="accent" />
          </div>
        </div>
      </section>

      <div className="courses-grid">
        {summaries.map((summary, index) => (
          <CourseCard key={summary.course.id} summary={summary} index={index} />
        ))}
      </div>

    </main>
  )
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
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--amber)' }}>
          Due: {summary.pendingTaskCount}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Done: {summary.completedTaskCount}
        </span>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span className="workspace-row-link" style={{ fontSize: '12px', flexShrink: 0 }}>Open course</span>
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
