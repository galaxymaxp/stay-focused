'use client'

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnnouncementsMenu } from '@/components/AnnouncementsMenu'
import { AuthStatus } from '@/components/AuthStatus'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'
import { QueuePanel } from '@/components/shell/QueuePanel'
import type { ParsedAnnouncement } from '@/lib/announcements'

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Home',
    mobileLabel: 'Home',
    matches: (pathname: string) => pathname === '/',
    icon: (
      <>
        <path d="M4.75 11.25 12 5.5l7.25 5.75" />
        <path d="M7.25 10.25v8h9.5v-8" />
        <path d="M10.25 18.25v-4.5h3.5v4.5" />
      </>
    ),
  },
  {
    href: '/courses',
    label: 'Courses',
    mobileLabel: 'Courses',
    matches: (pathname: string) =>
      pathname.startsWith('/courses') ||
      pathname.startsWith('/modules') ||
      pathname === '/learn' ||
      pathname.includes('/learn'),
    icon: (
      <>
        <path d="M6 6.75h11.5a1.75 1.75 0 0 1 1.75 1.75v8.75H8a2 2 0 0 0-2 2V6.75Z" />
        <path d="M8 17.25V8.5a1.75 1.75 0 0 0-1.75-1.75H5.5" />
      </>
    ),
  },
  {
    href: '/library',
    label: 'Study Library',
    mobileLabel: 'Library',
    matches: (pathname: string) => pathname.startsWith('/library') || pathname.startsWith('/drafts'),
    icon: (
      <>
        <rect x="4.75" y="6.75" width="3" height="10" rx="0.75" />
        <rect x="10.25" y="4.75" width="3.5" height="12" rx="0.75" />
        <rect x="16" y="8.75" width="3.25" height="8" rx="0.75" />
        <path d="M3.75 17.25h16.5" />
      </>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    mobileLabel: 'Calendar',
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
    mobileLabel: 'Settings',
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
const EXPANSION_TRIGGER_SELECTOR = 'button[aria-expanded], [role="button"][aria-expanded], summary'
const EXPANSION_TARGET_SELECTOR = '[data-expanded-scroll-target], .ui-interactive-card, details, article, section'
const MOBILE_NAV_STYLE = { '--mobile-nav-count': MOBILE_NAV_ITEMS.length } as CSSProperties

function normalizeNavigationPath(pathname: string): string {
  if (pathname.startsWith('/course/courses')) return '/courses'
  return pathname
}

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
  const normalizedPathname = normalizeNavigationPath(pathname)
  const activeSection = NAV_ITEMS.find((item) => item.matches(normalizedPathname)) ?? NAV_ITEMS[0]
  const subLabel = resolveTopbarSubLabel(normalizedPathname)
  const [scrolled, setScrolled] = useState(false)
  const currentModuleId = normalizedPathname.match(/\/modules\/([^/]+)/)?.[1] ?? null

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const notificationRequested = useRef(false)
  useEffect(() => {
    if (notificationRequested.current) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'default') return

    function handleFirstClick() {
      if (notificationRequested.current) return
      notificationRequested.current = true
      void Notification.requestPermission()
      document.removeEventListener('click', handleFirstClick)
    }

    document.addEventListener('click', handleFirstClick, { once: true })
    return () => document.removeEventListener('click', handleFirstClick)
  }, [])

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    function onExpansionClick(event: MouseEvent) {
      if (event.defaultPrevented || prefersReducedMotion.matches) return

      const eventTarget = event.target
      if (!(eventTarget instanceof Element)) return
      if (eventTarget.closest('[data-review-support-trigger]')) return

      const trigger = eventTarget.closest(EXPANSION_TRIGGER_SELECTOR)
      if (!trigger || !trigger.closest('.app-content')) return
      if (trigger.closest('[data-disable-expansion-scroll]')) return

      const isOpeningDetails = trigger.tagName.toLowerCase() === 'summary'
        && trigger.parentElement instanceof HTMLDetailsElement
        && !trigger.parentElement.open
      const ariaExpanded = trigger.getAttribute('aria-expanded')
      const isOpeningAriaControl = ariaExpanded === 'false'

      if (!isOpeningDetails && !isOpeningAriaControl) return

      const scrollTarget = trigger.closest(EXPANSION_TARGET_SELECTOR)
      if (!(scrollTarget instanceof HTMLElement)) return

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          scrollTarget.scrollIntoView({ block: 'start', behavior: 'smooth' })
        })
      })
    }

    document.addEventListener('click', onExpansionClick, true)
    return () => document.removeEventListener('click', onExpansionClick, true)
  }, [])

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
              const isActive = item.matches(normalizedPathname)
              const showSubNav = item.href === '/courses' && currentModuleId !== null

              return (
                <div key={item.href}>
                  <Link href={item.href} className="app-nav-link" data-active={isActive} aria-current={isActive ? 'page' : undefined}>
                    <span className="app-nav-icon" aria-hidden="true">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        {item.icon}
                      </svg>
                    </span>
                    <span className="app-nav-label">{item.label}</span>
                  </Link>
                  {showSubNav && (
                    <div className="app-nav-sub-group">
                      {[
                        { label: 'Learn', href: `/modules/${currentModuleId}/learn` },
                        { label: 'Do', href: `/modules/${currentModuleId}/do` },
                        { label: 'Quiz', href: `/modules/${currentModuleId}/quiz` },
                      ].map((sub) => (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="app-nav-sub-link"
                          data-active={normalizedPathname.startsWith(sub.href)}
                          aria-current={normalizedPathname.startsWith(sub.href) ? 'page' : undefined}
                        >
                          {sub.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-leading">
            <span className="app-topbar-mobile-mark" aria-hidden="true">
              <StayFocusedIcon size={20} color="var(--accent)" />
            </span>
            <div className="app-topbar-breadcrumb" data-scrolled={scrolled}>
              <strong className="app-topbar-current">{activeSection?.label ?? 'Stay Focused'}</strong>
              {subLabel ? (
                <>
                  <span className="app-topbar-sep" aria-hidden="true">/</span>
                  <span className="app-topbar-sub">{subLabel}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="app-topbar-actions">
            <QueuePanel />
            <AnnouncementsMenu announcements={recentAnnouncements} />
            <AuthStatus />
          </div>
        </header>

        <div className="app-content">
          {children}
        </div>
      </div>

      <nav className="app-bottom-nav" aria-label="Primary mobile" style={MOBILE_NAV_STYLE}>
        {MOBILE_NAV_ITEMS.map((item) => {
          const isActive = item.matches(normalizedPathname)

          return (
            <Link key={item.href} href={item.href} className="app-bottom-nav-link" data-active={isActive} aria-current={isActive ? 'page' : undefined}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {item.icon}
              </svg>
              <span>{item.mobileLabel}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
