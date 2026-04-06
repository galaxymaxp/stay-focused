'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CanvasMenu } from '@/components/CanvasMenu'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Today',
    description: 'Your clearest next focus',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4.75 6.75h14.5v10.5H4.75z" stroke="currentColor" strokeWidth="1.6" rx="2.5" />
        <path d="M8 10.25h8M8 13.75h5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
    description: 'See each class clearly',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5.75 6.75h12.5a2 2 0 0 1 2 2v8.5H7.75a2 2 0 0 0-2 2V6.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.75 17.25V8.25a1.5 1.5 0 0 0-1.5-1.5h-.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/learn',
    label: 'Learn',
    description: 'Open each module learning workspace',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5.75 8.25c0-1.1.9-2 2-2h10.5v11.5H7.75a2 2 0 0 0-2 2V8.25Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9.25 10.25h5.5M9.25 13.5h6.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/do',
    label: 'Do',
    description: 'See the extracted work',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.75 12.25 10 15.5l7.25-7.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    description: 'Place work on the week',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7.25 4.75v2.5M16.75 4.75v2.5M5.75 8.25h12.5M6.75 6.25h10.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-9.5a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 11.5h2.25v2.25H9zM12.75 11.5H15v2.25h-2.25z" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Theme and accent controls',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M19.25 13.2v-2.4l-1.78-.5a5.98 5.98 0 0 0-.55-1.32l.94-1.6-1.7-1.7-1.6.94c-.42-.23-.86-.41-1.32-.55l-.5-1.78h-2.4l-.5 1.78c-.46.14-.9.32-1.32.55l-1.6-.94-1.7 1.7.94 1.6c-.23.42-.41.86-.55 1.32l-1.78.5v2.4l1.78.5c.14.46.32.9.55 1.32l-.94 1.6 1.7 1.7 1.6-.94c.42.23.86.41 1.32.55l.5 1.78h2.4l.5-1.78c.46-.14.9-.32 1.32-.55l1.6.94 1.7-1.7-.94-1.6c.23-.42.41-.86.55-1.32l1.78-.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
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
