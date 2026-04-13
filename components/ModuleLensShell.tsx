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
  currentLens: 'learn' | 'do' | 'quiz'
  moduleId: string
  courseId?: string
  courseName: string
  title: string
  summary: string | null
  children: ReactNode
}) {
  const lensLabel = currentLens === 'learn'
    ? 'Learn'
    : currentLens === 'quiz'
      ? 'Quiz'
      : 'Do'
  const lensCopy = currentLens === 'learn'
    ? 'Learning material, extracted terms, and source files all together so the module makes sense in one pass.'
    : currentLens === 'quiz'
      ? 'Grounded questions drawn from extracted study note bullets. Pick a note, choose a question count, and test what you know.'
      : 'A clearer action lens for seeing exactly what still needs to get done.'

  return (
    <main className="page-shell page-stack" style={{ gap: '1.4rem' }}>
      <section className={`motion-card section-shell ${currentLens === 'do' ? 'section-shell-elevated' : ''}`} style={{ padding: currentLens === 'do' ? '1.35rem 1.4rem' : '1.3rem 1.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 520px' }}>
            <p className="ui-kicker">{lensLabel}</p>
            <h1 className="ui-page-title">{title}</h1>
            <p className="ui-page-copy" style={{ maxWidth: '56rem' }}>
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
          <p className="ui-page-copy" style={{ marginTop: '1rem', maxWidth: '60rem' }}>
            {summary}
          </p>
        )}

        <nav className="module-lens-tabs" aria-label="Module sections" style={{ marginTop: '1.05rem' }}>
          <LensTab href={`/modules/${moduleId}/learn`} label="Learn" active={currentLens === 'learn'} />
          <LensTab href={`/modules/${moduleId}/do`} label="Do" active={currentLens === 'do'} />
          <LensTab href={`/modules/${moduleId}/quiz`} label="Quiz" active={currentLens === 'quiz'} />
        </nav>
      </section>

      {children}
    </main>
  )
}

function LensTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`module-lens-tab${active ? ' module-lens-tab-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}
