'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnnouncementsMenu } from '@/components/AnnouncementsMenu'
import { AuthStatus } from '@/components/AuthStatus'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'
import type { ParsedAnnouncement } from '@/lib/announcements'

const DESKTOP_NAV_ITEMS = [
  {
    href: '/',
    label: 'Home',
    title: 'Home',
    note: 'What needs your attention first.',
    matches: (pathname: string) => pathname === '/',
    icon: (
      <path d="M5.75 10.75 12 5.75l6.25 5v7.5h-4.5V13h-3.5v5.25h-4.5z" />
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
    title: 'Courses',
    note: 'Open one class at a time, with less clutter.',
    matches: (pathname: string) => pathname.startsWith('/courses') || pathname === '/learn' || pathname.includes('/learn'),
    icon: (
      <>
        <path d="M6 6.75h11.5a1.75 1.75 0 0 1 1.75 1.75v8.75H8a2 2 0 0 0-2 2V6.75Z" />
        <path d="M8 17.25V8.5a1.75 1.75 0 0 0-1.75-1.75H5.5" />
      </>
    ),
  },
  {
    href: '/do',
    label: 'Do Now',
    title: 'Do Now',
    note: 'One clear starting point instead of a crowded board.',
    matches: (pathname: string) => pathname === '/do',
    icon: (
      <>
        <circle cx="12" cy="12" r="8.25" />
        <path d="m9.75 12.1 1.6 1.65 3.2-3.45" />
      </>
    ),
  },
  {
    href: '/tasks',
    label: 'Tasks',
    title: 'Tasks',
    note: 'Your full task list, grouped for triage.',
    matches: (pathname: string) => pathname === '/tasks' || /\/modules\/.+\/do/.test(pathname),
    icon: (
      <>
        <rect x="5.75" y="6.5" width="12.5" height="11" rx="2" />
        <path d="M9 10h6M9 13.25h6M9 16.5h3.75" />
      </>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    title: 'Calendar',
    note: 'See deadlines in time, not just in lists.',
    matches: (pathname: string) => pathname.startsWith('/calendar'),
    icon: (
      <>
        <path d="M7.5 5.5v2.25M16.5 5.5v2.25M5.75 9h12.5" />
        <rect x="5.75" y="7.25" width="12.5" height="10.5" rx="2" />
      </>
    ),
  },
  {
    href: '/settings',
    label: 'Settings',
    title: 'Settings',
    note: 'Account, sync, and preferences.',
    matches: (pathname: string) => pathname.startsWith('/settings') || pathname.startsWith('/canvas') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'),
    icon: (
      <>
        <path d="M12 4.75v2.1M12 17.15v2.1M6.9 6.9l1.48 1.48M15.62 15.62l1.48 1.48M4.75 12h2.1M17.15 12h2.1M6.9 17.1l1.48-1.48M15.62 8.38l1.48-1.48" />
        <circle cx="12" cy="12" r="3.05" />
      </>
    ),
  },
] as const

const MOBILE_NAV_ITEMS = DESKTOP_NAV_ITEMS.filter((item) => item.href !== '/settings')

export function AppShell({
  children,
  recentAnnouncements,
}: {
  children: ReactNode
  recentAnnouncements: ParsedAnnouncement[]
}) {
  const pathname = usePathname()
  const activeSection = DESKTOP_NAV_ITEMS.find((item) => item.matches(pathname)) ?? DESKTOP_NAV_ITEMS[0]

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link href="/" className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <StayFocusedIcon size={30} color="var(--accent)" />
            </span>
            <span className="app-brand-copy">
              <strong>Stay Focused</strong>
              <span>Calm school planning</span>
            </span>
          </Link>

          <nav className="app-nav" aria-label="Primary">
            {DESKTOP_NAV_ITEMS.map((item) => {
              const isActive = item.matches(pathname)

              return (
                <Link key={item.href} href={item.href} className="app-nav-link" data-active={isActive}>
                  <span className="app-nav-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      {item.icon}
                    </svg>
                  </span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-copy">
            <p className="ui-kicker" style={{ margin: 0 }}>{activeSection.label}</p>
            <h1 className="app-topbar-title">{activeSection.title}</h1>
            <p className="app-topbar-note">{activeSection.note}</p>
          </div>

          <div className="app-topbar-actions">
            <AnnouncementsMenu announcements={recentAnnouncements} />
            <AuthStatus />
          </div>
        </header>

        <div className="app-content">
          {children}
        </div>
      </div>

      <nav className="app-bottom-nav" aria-label="Primary mobile">
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = item.matches(pathname)

          return (
            <Link key={item.href} href={item.href} className="app-bottom-nav-link" data-active={isActive}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
