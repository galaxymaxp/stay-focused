import type { ReactNode } from 'react'

export function AuthPageFrame({
  title,
  description,
  children,
  diagnosticLabel = null,
}: {
  title: string
  description: string
  children: ReactNode
  diagnosticLabel?: string | null
}) {
  return (
    <main className="auth-page">
      <section className="auth-page-panel glass-panel glass-strong motion-card">
        <header className="auth-page-header">
          <p className="ui-kicker">Account</p>
          <h1 className="ui-page-title auth-page-title">{title}</h1>
          <p className="ui-page-copy auth-page-copy">{description}</p>
        </header>

        <div className="auth-page-body">
          {children}
        </div>

        {diagnosticLabel ? (
          <footer className="auth-page-footer">
            <p className="auth-page-diagnostic" data-auth-diagnostic="loaded">
              {diagnosticLabel}
            </p>
          </footer>
        ) : null}
      </section>
    </main>
  )
}

export function AuthStatusNotice({
  title,
  description,
  tone = 'neutral',
  detail = null,
}: {
  title: string
  description: string
  tone?: 'neutral' | 'warning' | 'error'
  detail?: ReactNode
}) {
  return (
    <div className="auth-status-notice" data-tone={tone} role="status">
      <p className="auth-status-title">{title}</p>
      <p className="auth-status-copy">{description}</p>
      {detail ? <div className="auth-status-detail">{detail}</div> : null}
    </div>
  )
}
