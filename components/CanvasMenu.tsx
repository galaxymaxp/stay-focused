'use client'

import Link from 'next/link'

export function CanvasMenu() {
  return (
    <Link
      href="/canvas"
      className="ui-button ui-button-primary"
      style={{
        fontSize: '12px',
        padding: '0.55rem 0.82rem',
        borderRadius: 'var(--radius-control)',
        fontWeight: 700,
        textDecoration: 'none',
        minHeight: '40px',
      }}
    >
      Sync Canvas
    </Link>
  )
}
