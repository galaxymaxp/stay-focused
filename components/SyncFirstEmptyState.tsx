import Link from 'next/link'

export function SyncFirstEmptyState({
  eyebrow,
}: {
  eyebrow: string
}) {
  return (
    <section className="section-shell section-shell-elevated" style={{ padding: '1.35rem 1.4rem', display: 'grid', gap: '0.9rem' }}>
      <div>
        <p className="ui-kicker">{eyebrow}</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem', marginTop: '0.45rem' }}>No courses synced yet</h1>
        <p className="ui-page-copy" style={{ maxWidth: '44rem' }}>
          Connect and sync your Canvas account to load your courses, modules, tasks, and study material.
        </p>
      </div>

      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
        Nothing will appear here until your first sync finishes.
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <Link href="/canvas" className="ui-button ui-button-primary">
          Sync Canvas
        </Link>
      </div>
    </section>
  )
}
