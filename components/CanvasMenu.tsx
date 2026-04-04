'use client'

import Link from 'next/link'

export function CanvasMenu() {
  return (
    <Link
      href="/canvas"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        fontSize: '13px',
        background: 'var(--accent)',
        color: 'var(--accent-foreground)',
        padding: '6px 14px',
        borderRadius: '999px',
        border: '1px solid var(--accent-border)',
        fontWeight: 600,
        cursor: 'pointer',
        textDecoration: 'none',
        boxShadow: '0 8px 20px var(--accent-shadow)',
      }}
    >
      Canvas
    </Link>
  )
}
