/**
 * Calendar page loading skeleton.
 * Rendered by Next.js App Router while the server component fetches workspace data.
 * Structure mirrors CalendarDashboard: header → two-column (grid + aside).
 */
export default function CalendarLoading() {
  return (
    <main className="page-shell">
      <section className="page-stack" style={{ gap: '1rem' }}>
        {/* Page header */}
        <div
          className="animate-pulse"
          style={{
            height: '7.5rem',
            borderRadius: 'var(--radius-page)',
            border: '1px solid var(--border-subtle)',
            background: 'color-mix(in srgb, var(--surface-soft) 94%, transparent)',
          }}
        />

        {/* Calendar grid + aside */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
          {/* Month grid */}
          <div
            className="glass-panel glass-strong animate-pulse"
            style={{
              flex: '2 1 640px',
              minWidth: 0,
              height: '28rem',
              borderRadius: 'var(--radius-page)',
              animationDelay: '60ms',
            }}
          />

          {/* Day detail aside */}
          <div
            className="glass-panel glass-strong animate-pulse"
            style={{
              flex: '1 1 320px',
              minWidth: '280px',
              height: '18rem',
              borderRadius: 'var(--radius-page)',
              animationDelay: '120ms',
            }}
          />
        </div>
      </section>
    </main>
  )
}
