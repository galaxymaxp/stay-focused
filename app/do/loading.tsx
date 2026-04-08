/**
 * Do page loading skeleton.
 * Rendered by Next.js App Router while the server component fetches workspace data.
 * Structure mirrors the Do page: header → three urgency group sections.
 */
export default function DoLoading() {
  return (
    <main className="page-shell page-stack">
      {/* Page header */}
      <div
        className="animate-pulse"
        style={{
          height: '7rem',
          borderRadius: 'var(--radius-page)',
          border: '1px solid var(--border-subtle)',
          background: 'color-mix(in srgb, var(--surface-soft) 94%, transparent)',
        }}
      />

      {/* Urgency groups: needs action now, coming up soon, can wait */}
      <div
        className="section-shell section-shell-elevated animate-pulse"
        style={{ height: '10rem', animationDelay: '60ms' }}
      />
      <div
        className="section-shell section-shell-elevated animate-pulse"
        style={{ height: '10rem', animationDelay: '120ms' }}
      />
      <div
        className="section-shell section-shell-elevated animate-pulse"
        style={{ height: '10rem', animationDelay: '180ms' }}
      />
    </main>
  )
}
