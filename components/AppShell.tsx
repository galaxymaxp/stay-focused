'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CanvasMenu } from '@/components/CanvasMenu'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Overview',
    description: 'Your clearest next view',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.75 6.75h14.5v10.5H4.75z" stroke="currentColor" strokeWidth="1.6" rx="2.5" />
        <path d="M8 10.25h8M8 13.75h5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/canvas',
    label: 'Canvas Sync',
    description: 'Bring courses in quietly',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.75 7.5A5.25 5.25 0 0 1 12 4.75a5.25 5.25 0 0 1 5.25 5.25v.5h1A2.75 2.75 0 0 1 21 13.25v1A5 5 0 0 1 16 19.25H9A6.25 6.25 0 0 1 6.75 7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M12 10v6m0 0-2.25-2.25M12 16l2.25-2.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Adjust the study atmosphere',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 8.75A3.25 3.25 0 1 0 12 15.25A3.25 3.25 0 1 0 12 8.75Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M19.25 13.25v-2.5l-1.97-.34a5.65 5.65 0 0 0-.52-1.26l1.15-1.64-1.76-1.76-1.64 1.15c-.4-.22-.82-.4-1.26-.52l-.34-1.97h-2.5l-.34 1.97c-.44.12-.86.3-1.26.52L6.12 5.75 4.36 7.5l1.15 1.64c-.22.4-.4.82-.52 1.26l-1.97.35v2.5l1.97.34c.12.44.3.86.52 1.26L4.36 16.5l1.76 1.76 1.64-1.15c.4.22.82.4 1.26.52l.34 1.97h2.5l.34-1.97c.44-.12.86-.3 1.26-.52l1.64 1.15 1.76-1.76-1.15-1.64c.22-.4.4-.82.52-1.26l1.97-.34Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="app-frame">
      <aside className="app-sidebar glass-panel glass-soft">
        <Link href="/" className="app-sidebar-header">
          <span
            className="app-sidebar-icon"
            style={{
              width: 'auto',
              height: 'auto',
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              borderRadius: 0,
              color: 'var(--accent)',
            }}
          >
            <StayFocusedIcon size={34} color="var(--accent)" />
          </span>
          <span>
            <strong>Stay Focused</strong>
            <span>Soft Focus Academic OS</span>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))

            return (
              <Link key={item.href} href={item.href} className="app-nav-link" data-active={isActive}>
                <span className="app-nav-icon">{item.icon}</span>
                <span className="app-nav-copy">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
              </Link>
            )
          })}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-note">
            <strong>Stay with the next thing</strong>
            <p>Built to reduce Canvas clutter and keep your coursework readable when your energy is low.</p>
          </div>
          <CanvasMenu />
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar glass-panel glass-soft">
          <div className="app-topbar-title">
            <strong>Quiet workspace</strong>
            <span>Clear modules, clear tasks, less noise.</span>
          </div>
          <div className="app-topbar-actions">
            <CanvasMenu />
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
