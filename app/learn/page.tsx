import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview, type CourseLearnOverview } from '@/lib/course-learn-overview'

export default async function LearnPage() {
  const workspace = await getClarityWorkspace()

  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Learn" />
      </main>
    )
  }

  const courseOverviews = (await Promise.all(
    workspace.courses.map((course) => buildCourseLearnOverview(workspace, course.id)),
  )).filter((course): course is CourseLearnOverview => Boolean(course))
  const readyPacks = courseOverviews.reduce((sum, course) => sum + course.modules.reduce((total, module) => total + module.studyMaterials.filter((material) => material.deepLearnStatus === 'ready').length, 0), 0)

  return (
    <main className="page-shell command-page">
      <section className="motion-card section-shell section-shell-elevated" style={{ padding: '1.05rem 1.15rem' }}>
        <div className="command-header">
          <div className="command-header-main">
            <p className="ui-kicker">Learn</p>
            <h1 className="ui-page-title">A calmer way into your course material</h1>
            <p className="ui-page-copy" style={{ maxWidth: '46rem' }}>
              Start at the course level. Choose the class you want, then open one module workspace at a time instead of seeing every resource and status all at once.
            </p>
          </div>

          <div className="command-header-side">
            <div className="command-stat-grid">
              <StatTile label="Courses" value={String(courseOverviews.length)} />
              <StatTile label="Study items" value={String(courseOverviews.reduce((sum, course) => sum + course.studyCount, 0))} />
              <StatTile label="Action items" value={String(courseOverviews.reduce((sum, course) => sum + course.actionCount, 0))} tone="warning" />
              <StatTile label="Ready packs" value={String(readyPacks)} tone="accent" />
            </div>
            <div className="workspace-quiet-panel">
              <p className="ui-kicker" style={{ margin: 0 }}>Learn flow</p>
              <p className="workspace-quiet-panel-copy">
                Pick one course, then one module. Keep the study lane compact and only open the deeper source view when needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="motion-card motion-delay-1 command-panel-grid">
        {courseOverviews.map((course, index) => (
          <article
            key={course.course.id}
            className={`section-shell section-shell-elevated motion-card motion-delay-${Math.min(index + 1, 4)}`}
            style={{
              padding: '1rem 1.05rem',
              display: 'grid',
              gap: '0.9rem',
              alignContent: 'start',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <p className="ui-kicker">{course.course.code}</p>
                <h2 className="ui-section-title" style={{ marginTop: '0.42rem' }}>{course.course.name}</h2>
                <p className="ui-section-copy" style={{ marginTop: '0.42rem' }}>{course.course.focusLabel}</p>
              </div>
              <span className="ui-chip ui-chip-soft">{course.visibleModuleCount} module{course.visibleModuleCount === 1 ? '' : 's'}</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <CountChip label={`${course.studyCount} study item${course.studyCount === 1 ? '' : 's'}`} />
              <CountChip label={`${course.actionCount} action item${course.actionCount === 1 ? '' : 's'}`} />
            </div>

            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {course.note}
            </p>

            {course.resumeCue && (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                <p className="ui-kicker">{course.resumeCue.promptLabel}</p>
                <p style={{ margin: '0.42rem 0 0', fontSize: '15px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                  {course.resumeCue.title}
                </p>
                <p style={{ margin: '0.28rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                  {course.resumeCue.moduleTitle}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link href={`/courses/${course.course.id}/learn`} className="ui-button ui-button-secondary">
                Open course Learn
              </Link>
              {course.resumeCue && (
                course.resumeCue.external ? (
                  <a href={course.resumeCue.href} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost">
                    {course.resumeCue.actionLabel}
                  </a>
                ) : (
                  <Link href={course.resumeCue.href} className="ui-button ui-button-ghost">
                    {course.resumeCue.actionLabel}
                  </Link>
                )
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  )
}

function CountChip({ label }: { label: string }) {
  return (
    <span className="ui-chip ui-chip-soft" style={{ fontWeight: 600 }}>
      {label}
    </span>
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
      <p style={{ margin: '0.34rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: tone === 'warning' ? 'var(--amber)' : 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}
