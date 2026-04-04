import type { Metadata } from 'next'
import { CanvasMenu } from '@/components/CanvasMenu'
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
          <CanvasMenu />
        </nav>
        {children}
      </body>
    </html>
  )
}
