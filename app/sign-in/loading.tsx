export default function SignInLoading() {
  return (
    <main className="page-shell page-shell-narrow page-stack" style={{ gap: '1rem' }}>
      <section
        className="glass-panel glass-strong motion-card"
        style={{ padding: '1.35rem', display: 'grid', gap: '0.9rem', borderRadius: 'var(--radius-panel)' }}
      >
        <p className="ui-kicker">Account</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem', margin: 0 }}>Loading sign-in</h1>
        <p className="ui-page-copy" style={{ marginTop: 0 }}>
          Preparing the sign-in page now.
        </p>
      </section>
    </main>
  )
}
