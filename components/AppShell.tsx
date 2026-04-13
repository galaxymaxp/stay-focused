'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnnouncementsMenu } from '@/components/AnnouncementsMenu'
import { AuthStatus } from '@/components/AuthStatus'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'
import type { ParsedAnnouncement } from '@/lib/announcements'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Home',
    matches: (pathname: string) => pathname === '/',
    icon: (
      <path d="M5.75 10.75 12 5.75l6.25 5v7.5h-4.5V13h-3.5v5.25h-4.5z" />
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
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
    matches: (pathname: string) => pathname.startsWith('/settings') || pathname.startsWith('/canvas') || pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up'),
    icon: (
      <>
        <path d="M12 4.75v2.1M12 17.15v2.1M6.9 6.9l1.48 1.48M15.62 15.62l1.48 1.48M4.75 12h2.1M17.15 12h2.1M6.9 17.1l1.48-1.48M15.62 8.38l1.48-1.48" />
        <circle cx="12" cy="12" r="3.05" />
      </>
    ),
  },
] as const

const MOBILE_NAV_ITEMS = NAV_ITEMS

function resolveTopbarSubLabel(pathname: string): string | null {
  if (/\/modules\/[^/]+\/learn/.test(pathname)) return 'Learn'
  if (/\/modules\/[^/]+\/quiz/.test(pathname)) return 'Quiz'
  if (/\/modules\/[^/]+\/do/.test(pathname)) return 'Do'
  if (/\/modules\/[^/]+\/review/.test(pathname)) return 'Review'
  if (/\/modules\/[^/]+\/inspect/.test(pathname)) return 'Inspect'
  if (/\/modules\/[^/]+\/source/.test(pathname)) return 'Source'
  if (/\/modules\/[^/]+/.test(pathname)) return 'Module'
  if (/\/courses\/[^/]+/.test(pathname)) return 'Course'
  return null
}

export function AppShell({
  children,
  recentAnnouncements,
}: {
  children: ReactNode
  recentAnnouncements: ParsedAnnouncement[]
}) {
  const pathname = usePathname()
  const activeSection = NAV_ITEMS.find((item) => item.matches(pathname)) ?? NAV_ITEMS[0]
  const subLabel = resolveTopbarSubLabel(pathname)

  return (
    <div className="app-frame">
      <aside className="app-sidebar">
        <div className="app-sidebar-inner">
          <Link href="/" className="app-brand" aria-label="Go to Home">
            <span className="app-brand-mark" aria-hidden="true">
              <StayFocusedIcon size={24} color="var(--accent)" />
            </span>
            <span className="app-brand-name">Stay Focused</span>
          </Link>

          <nav className="app-nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const isActive = item.matches(pathname)

              return (
                <Link key={item.href} href={item.href} className="app-nav-link" data-active={isActive} aria-current={isActive ? 'page' : undefined}>
                  <span className="app-nav-icon" aria-hidden="true">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      {item.icon}
                    </svg>
                  </span>
                  <span className="app-nav-label">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar glass-panel glass-soft">
          <div className="app-topbar-leading">
            <span className="app-topbar-mobile-mark" aria-hidden="true">
              <StayFocusedIcon size={20} color="var(--accent)" />
            </span>
            <div className="app-topbar-breadcrumb">
              <strong className="app-topbar-current">{activeSection.label}</strong>
              {subLabel ? (
                <>
                  <span className="app-topbar-sep" aria-hidden="true">/</span>
                  <span className="app-topbar-sub">{subLabel}</span>
                </>
              ) : null}
            </div>
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
            <Link key={item.href} href={item.href} className="app-bottom-nav-link" data-active={isActive} aria-current={isActive ? 'page' : undefined}>
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
