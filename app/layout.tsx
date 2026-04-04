import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stay Focused',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <nav style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)',
          padding: '0 1.5rem',
          height: '52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Link href="/" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', textDecoration: 'none' }}>
            Stay Focused
          </Link>
          <Link href="/canvas" style={{
            fontSize: '13px',
            background: 'var(--accent)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 500,
          }}>
            Canvas
          </Link>
        </nav>
        {children}
      </body>
    </html>
  )
}
