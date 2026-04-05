'use client'

import Link from 'next/link'

export function CanvasMenu() {
  return (
    <Link
      href="/canvas"
      className="ui-button ui-button-primary"
      style={{
        fontSize: '13px',
        padding: '0.62rem 0.92rem',
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
