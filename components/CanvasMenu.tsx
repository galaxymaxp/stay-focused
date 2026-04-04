'use client'

import Link from 'next/link'

export function CanvasMenu() {
  return (
    <Link
      href="/canvas"
      className="ui-button ui-button-primary"
      style={{
        fontSize: '13px',
        padding: '6px 14px',
        borderRadius: '999px',
        fontWeight: 700,
        textDecoration: 'none',
        minHeight: '38px',
      }}
    >
      Canvas
    </Link>
  )
}
