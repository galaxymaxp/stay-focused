import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CourseLearnExplorer } from '@/components/CourseLearnExplorer'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { buildCourseLearnOverview } from '@/lib/course-learn-overview'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CourseLearnPage({ params }: Props) {
  const { id } = await params
  const workspace = await getClarityWorkspace()
  const courseOverview = await buildCourseLearnOverview(workspace, id)

  if (!courseOverview) notFound()

  const { course, modules, resumeCue } = courseOverview

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <section className="motion-card section-shell section-shell-elevated" style={{ padding: '1.35rem 1.4rem', display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 520px' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <p className="ui-kicker">Learn</p>
              <span className="ui-chip ui-chip-soft">{course.code}</span>
            </div>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>{course.name}</h1>
            <p className="ui-page-copy" style={{ maxWidth: '48rem' }}>
              A tighter course workspace. Scan compact module cards, expand one inline when you need it, and hide the rest when you want to focus on a single module.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href="/learn" className="ui-button ui-button-ghost">Back to Learn</Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.8rem' }}>
          <StatTile label="Modules in Learn" value={String(courseOverview.visibleModuleCount)} />
          <StatTile label="Study items" value={String(courseOverview.studyCount)} />
          <StatTile label="Action items" value={String(courseOverview.actionCount)} />
          <StatTile label="Hidden modules" value={String(courseOverview.hiddenModuleCount)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
            <p className="ui-kicker">Course view</p>
            <p style={{ margin: '0.48rem 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {courseOverview.note}
            </p>
          </div>

          {resumeCue && (
            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
              <p className="ui-kicker">{resumeCue.promptLabel}</p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '16px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                {resumeCue.title}
              </p>
              <p style={{ margin: '0.28rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                {resumeCue.moduleTitle}
              </p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {resumeCue.note}
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {resumeCue.external ? (
                  <a href={resumeCue.href} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs">
                    {resumeCue.actionLabel}
                  </a>
                ) : (
                  <Link href={resumeCue.href} className="ui-button ui-button-secondary ui-button-xs">
                    {resumeCue.actionLabel}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="motion-card motion-delay-1 section-shell" style={{ padding: '1.2rem 1.25rem', display: 'grid', gap: '0.9rem' }}>
        <div>
          <p className="ui-kicker">Modules</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Open only what you need</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
            Every module stays collapsed by default. Expand one to reveal the full study outline, inline terms, quick quiz, and source support without leaving the course list.
          </p>
        </div>

        {modules.length === 0 ? (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
            {courseOverview.hiddenModuleCount > 0
              ? 'All modules in this course are currently hidden from Learn.'
              : 'No modules are available in Learn for this course yet.'}
          </div>
        ) : (
          <CourseLearnExplorer modules={modules} />
        )}
      </section>
    </main>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.82rem 0.9rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}
