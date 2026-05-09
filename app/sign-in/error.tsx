'use client'

export default function SignInError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="page-shell page-shell-narrow page-stack" style={{ gap: '1rem' }}>
      <section
        className="glass-panel glass-strong motion-card"
        style={{ padding: '1.35rem', display: 'grid', gap: '0.9rem', borderRadius: 'var(--radius-panel)' }}
      >
        <p className="ui-kicker">Account</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem', margin: 0 }}>Sign-in could not load</h1>
        <p className="ui-page-copy" style={{ marginTop: 0 }}>
          Stay Focused could not prepare the sign-in page right now. Try again in a moment.
        </p>
        <button type="button" className="ui-button ui-button-primary" onClick={reset} style={{ minHeight: '2.7rem' }}>
          Retry sign-in
        </button>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Internal error: {error.message || 'Unknown sign-in route failure.'}
        </p>
      </section>
    </main>
  )
}
