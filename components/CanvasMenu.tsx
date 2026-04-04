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
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 92%, #fff 8%) 0%, var(--accent) 100%)',
        color: 'var(--accent-foreground)',
        padding: '6px 14px',
        borderRadius: '999px',
        border: '1px solid var(--accent-border)',
        fontWeight: 700,
        cursor: 'pointer',
        textDecoration: 'none',
        boxShadow: 'var(--panel-glow)',
      }}
    >
      Canvas
    </Link>
  )
}
