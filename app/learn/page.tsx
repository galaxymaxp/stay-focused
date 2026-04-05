import Link from 'next/link'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview, type CourseLearnOverview } from '@/lib/course-learn-overview'

export default async function LearnPage() {
  const workspace = await getClarityWorkspace()
  const courseOverviews = (await Promise.all(
    workspace.courses.map((course) => buildCourseLearnOverview(workspace, course.id)),
  )).filter((course): course is CourseLearnOverview => Boolean(course))

  return (
    <main className="page-shell page-stack">
      <header className="motion-card section-shell section-shell-elevated" style={{ padding: '1.35rem 1.4rem', display: 'grid', gap: '0.85rem' }}>
        <div>
          <p className="ui-kicker">Learn</p>
          <h1 className="ui-page-title">A calmer way into your course material</h1>
          <p className="ui-page-copy" style={{ maxWidth: '46rem' }}>
            Start at the course level. Choose the class you want, then open one module at a time instead of seeing every resource and status all at once.
          </p>
        </div>
      </header>

      <section className="motion-card motion-delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {courseOverviews.map((course, index) => (
          <article
            key={course.course.id}
            className={`section-shell section-shell-elevated motion-card motion-delay-${Math.min(index + 1, 4)}`}
            style={{
              padding: '1.15rem 1.2rem',
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
