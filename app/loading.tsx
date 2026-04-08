/**
 * Home page loading skeleton.
 * Rendered by Next.js App Router while the server component fetches workspace data.
 * Structure mirrors TodayDashboard: header → bulletin → hero → announcements → 2-col → coming up.
 */
export default function HomeLoading() {
  return (
    <main className="page-shell">
      <section className="page-stack" style={{ gap: '1.1rem' }}>
        {/* Page header */}
        <div
          className="section-shell section-shell-elevated animate-pulse"
          style={{ height: '9rem' }}
        />

        {/* Module bulletin */}
        <div
          className="section-shell animate-pulse"
          style={{ height: '5.5rem', animationDelay: '40ms' }}
        />

        {/* Best next step hero card */}
        <div
          className="glass-panel animate-pulse"
          style={{
            height: '15rem',
            borderRadius: 'var(--radius-page)',
            animationDelay: '80ms',
          }}
        />

        {/* Announcements band */}
        <div
          className="section-shell section-shell-elevated animate-pulse"
          style={{ height: '7rem', animationDelay: '120ms' }}
        />

        {/* Needs attention + Worth reviewing columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          <div
            className="section-shell section-shell-elevated animate-pulse"
            style={{ height: '18.5rem', animationDelay: '160ms' }}
          />
          <div
            className="section-shell section-shell-elevated animate-pulse"
            style={{ height: '18.5rem', animationDelay: '200ms' }}
          />
        </div>

        {/* Coming up */}
        <div
          className="section-shell section-shell-elevated animate-pulse"
          style={{ height: '8rem', animationDelay: '240ms' }}
        />
      </section>
    </main>
  )
}
