import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseSummaries, type CourseSummary } from '@/lib/course-summary'

export default async function CoursesPage() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Courses" />
      </main>
    )
  }

  const summaries = await buildCourseSummaries(workspace)
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
              Each card shows the current task load, ready exam-prep packs, and the next item due.
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
  const href = `/courses/${summary.course.id}`

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

      {/* Stat chips */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        <span className="ui-chip ui-chip-soft">
          {summary.moduleCount} module{summary.moduleCount === 1 ? '' : 's'}
        </span>
        {summary.pendingTaskCount > 0 && (
          <span className="ui-chip ui-chip-soft" style={{ color: 'var(--amber)' }}>
            {summary.pendingTaskCount} task{summary.pendingTaskCount === 1 ? '' : 's'}
          </span>
        )}
        {summary.readyPackCount > 0 && (
          <span className="ui-chip ui-chip-soft" style={{ color: 'var(--accent)' }}>
            {summary.readyPackCount} pack{summary.readyPackCount === 1 ? '' : 's'} ready
          </span>
        )}
        {summary.recentAnnouncementCount > 0 && (
          <span className="ui-chip ui-chip-soft">
            {summary.recentAnnouncementCount} announcement{summary.recentAnnouncementCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Next due task */}
      <div style={{ flex: 1 }}>
        {summary.nextDueTask ? (
          <p className="courses-card-next-task">
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Next: </span>
            <span className="courses-card-next-task-title">{summary.nextDueTask.title}</span>
            <span style={{ color: 'var(--text-muted)' }}>{' — '}{formatDeadlineLabel(summary.nextDueTask.deadline)}</span>
          </p>
        ) : (
          <p className="courses-card-empty">No pending tasks</p>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        {summary.lastSyncedAt ? (
          <p className="courses-card-synced">
            Synced {formatRelativeTime(summary.lastSyncedAt)}
          </p>
        ) : (
          <span />
        )}
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

function formatDeadlineLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Overdue'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 7) return `Due in ${daysUntil} days`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'recently'
  const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (daysAgo === 0) return 'today'
  if (daysAgo === 1) return 'yesterday'
  if (daysAgo <= 7) return `${daysAgo} days ago`
  if (daysAgo <= 30) return `${Math.floor(daysAgo / 7)} week${Math.floor(daysAgo / 7) === 1 ? '' : 's'} ago`
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
