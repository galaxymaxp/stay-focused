import type { ReactNode } from 'react'
import Link from 'next/link'

export function ModuleLensShell({
  currentLens,
  moduleId,
  courseId,
  courseName,
  title,
  summary,
  children,
}: {
  currentLens: 'learn' | 'review' | 'do'
  moduleId: string
  courseId?: string
  courseName: string
  title: string
  summary: string | null
  children: ReactNode
}) {
  const lensLabel = currentLens === 'learn'
    ? 'Learn'
    : currentLens === 'review'
      ? 'Review'
      : 'Do'
  const lensCopy = currentLens === 'learn'
    ? 'A calmer reading lens for understanding what this module is actually saying.'
    : currentLens === 'review'
      ? 'A grounded reviewer for terminology, quiz focus, and exam prep built from extracted study text.'
      : 'A clearer action lens for seeing exactly what needs to get done.'

  return (
    <main className={currentLens === 'learn' ? 'page-shell page-shell-narrow page-stack' : 'page-shell page-stack'} style={{ gap: '1.4rem' }}>
      <section className={`motion-card section-shell ${currentLens === 'learn' ? '' : 'section-shell-elevated'}`} style={{ padding: currentLens === 'learn' ? '1.3rem 1.35rem' : '1.35rem 1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 520px' }}>
            <p className="ui-kicker">{lensLabel}</p>
            <h1 className="ui-page-title" style={{ fontSize: currentLens === 'learn' ? '34px' : '32px' }}>
              {title}
            </h1>
            <p className="ui-page-copy" style={{ maxWidth: currentLens === 'learn' ? '48rem' : '54rem' }}>
              {lensCopy}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="ui-chip ui-chip-soft">{courseName}</span>
            {courseId && (
              <Link href={`/courses/${courseId}/learn`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                Course Learn
              </Link>
            )}
          </div>
        </div>

        {summary && (
          <p className="ui-page-copy" style={{ marginTop: '1rem', maxWidth: currentLens === 'learn' ? '50rem' : '60rem' }}>
            {summary}
          </p>
        )}

        <div className="ui-tab-group" style={{ marginTop: '1.05rem' }}>
          <LensTab href={`/modules/${moduleId}/learn`} label="Learn" active={currentLens === 'learn'} />
          <LensTab href={`/modules/${moduleId}/review`} label="Review" active={currentLens === 'review'} />
          <LensTab href={`/modules/${moduleId}/do`} label="Do" active={currentLens === 'do'} />
        </div>
      </section>

      {children}
    </main>
  )
}

function LensTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={active ? 'ui-button ui-button-primary' : 'ui-button ui-button-ghost'}
      style={{
        minHeight: '2.3rem',
        padding: '0.58rem 0.9rem',
        fontSize: '13px',
        boxShadow: active ? undefined : 'none',
      }}
    >
      {label}
    </Link>
  )
}
