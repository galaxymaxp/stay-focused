import type { ReactNode } from 'react'
import Link from 'next/link'

export function ModuleLensShell({
  currentLens,
  moduleId,
  courseId,
  courseName,
  title,
  summary,
  dueCount,
  completedCount,
  children,
}: {
  currentLens: 'learn' | 'do' | 'quiz'
  moduleId: string
  courseId?: string
  courseName: string
  title: string
  summary: string | null
  dueCount?: number
  completedCount?: number
  children: ReactNode
}) {
  const lensLabel = currentLens === 'learn'
    ? 'Learn'
    : currentLens === 'quiz'
      ? 'Quiz'
      : 'Do'
  const lensCopy = currentLens === 'learn'
    ? 'Learning material and source files all together so the module makes sense in one pass.'
    : currentLens === 'quiz'
      ? 'Grounded questions drawn from extracted study note bullets. Pick a note, choose a question count, and test what you know.'
      : 'A clearer action lens for seeing exactly what still needs to get done.'

  return (
    <main className="page-shell command-page command-page-tight">
      <section
        className={`motion-card section-shell ${currentLens === 'do' ? 'section-shell-elevated' : ''}`}
        style={{ padding: currentLens === 'do' ? '1.1rem 1.2rem' : '1.05rem 1.15rem' }}
      >
        <div className="command-header">
          <div className="command-header-main">
            <p className="ui-kicker">{lensLabel}</p>
            <h1 className="ui-page-title">{title}</h1>
            <p className="ui-page-copy" style={{ maxWidth: '56rem' }}>
              {lensCopy}
            </p>
            <nav className="module-lens-tabs" aria-label="Module sections">
              <LensTab href={`/modules/${moduleId}/learn`} label="Deep Learn" active={currentLens === 'learn'} />
              <LensTab href={`/modules/${moduleId}/do`} label="Do" active={currentLens === 'do'} />
              <LensTab href={`/modules/${moduleId}/quiz`} label="Quiz" active={currentLens === 'quiz'} />
            </nav>
          </div>

          <div className="command-header-side">
            <div className="command-header-actions">
              <span className="ui-chip ui-chip-soft">{courseName}</span>
              {courseId && (
                <Link href={`/courses/${courseId}`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Course Learn
                </Link>
              )}
            </div>

            {dueCount !== undefined && completedCount !== undefined ? (
              <div style={{ display: 'flex', gap: '1.5rem', padding: '0.9rem 1rem', borderRadius: 'var(--radius-tight)', background: 'var(--surface-soft)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Due now</p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '20px', fontWeight: 650, color: 'var(--amber)' }}>{dueCount}</p>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Completed</p>
                  <p style={{ margin: '0.3rem 0 0', fontSize: '20px', fontWeight: 650, color: 'var(--text-muted)' }}>{completedCount}</p>
                </div>
              </div>
            ) : summary ? (
              <div className="workspace-quiet-panel" style={{ gap: '0.32rem' }}>
                <p className="ui-kicker" style={{ margin: 0 }}>Working context</p>
                <p className="workspace-quiet-panel-copy">{summary}</p>
              </div>
            ) : null}
          </div>
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
      className={`module-lens-tab${active ? ' module-lens-tab-active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}
