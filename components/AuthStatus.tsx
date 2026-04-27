'use client'

import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import { UserAvatar } from '@/components/UserAvatar'
import { useAuthSummary } from '@/components/useAuthSummary'
import { useResolvedUserAvatar } from '@/components/useResolvedUserAvatar'

export function AuthStatus() {
  const authSummary = useAuthSummary()
  const pathname = usePathname()
  const next = pathname || '/settings'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const resolvedAvatar = useResolvedUserAvatar(authSummary.user)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (!authSummary.isConfigured) {
    return null
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="ui-button ui-button-secondary"
        style={triggerStyle}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <UserAvatar
          value={{
            url: authSummary.user ? resolvedAvatar.resolvedAvatar.url : null,
            initials: authSummary.user ? resolvedAvatar.resolvedAvatar.initials : null,
          }}
          active={Boolean(authSummary.user)}
        />
        <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-primary)' }}>
          {authSummary.user ? 'Account' : 'Sign in'}
        </span>
        <span aria-hidden="true" style={chevronStyle}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="ui-floating"
          style={menuStyle}
        >
          {authSummary.user ? (
            <>
              <div style={summaryCardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <UserAvatar
                    value={{
                      url: resolvedAvatar.resolvedAvatar.url,
                      initials: resolvedAvatar.resolvedAvatar.initials,
                    }}
                    size={40}
                    active
                  />
                  <div style={{ minWidth: 0 }}>
                    <p className="ui-kicker" style={{ margin: 0 }}>Account</p>
                    <div style={{ marginTop: '0.32rem', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                      {authSummary.user.email ?? 'Signed-in account'}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: '0.24rem', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  Session active. Canvas sync and user-owned read state follow this account.
                </div>
              </div>

              <Link href="/settings" className="ui-button ui-button-ghost" style={menuButtonStyle} onClick={() => setOpen(false)}>
                Settings
              </Link>
              <Link href="/canvas" className="ui-button ui-button-ghost" style={menuButtonStyle} onClick={() => setOpen(false)}>
                Canvas sync
              </Link>
              <SignOutButton className="ui-button ui-button-ghost" style={menuButtonStyle} />
            </>
          ) : (
            <>
              <div style={summaryCardStyle}>
                <p className="ui-kicker" style={{ margin: 0 }}>Account</p>
                <div style={{ marginTop: '0.32rem', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Signed out
                </div>
                <div style={{ marginTop: '0.24rem', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  Sign in to keep Canvas sync and personal read state tied to your account.
                </div>
              </div>

              <Link
                href={`/sign-in?next=${encodeURIComponent(next)}`}
                className="ui-button ui-button-secondary"
                style={menuButtonStyle}
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href={`/sign-up?next=${encodeURIComponent(next)}`}
                className="ui-button ui-button-ghost"
                style={menuButtonStyle}
                onClick={() => setOpen(false)}
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const triggerStyle: CSSProperties = {
  minHeight: '2.6rem',
  padding: '0.42rem 0.52rem 0.42rem 0.42rem',
  gap: '0.4rem',
  borderRadius: 'var(--radius-control)',
}

const chevronStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--text-muted)',
  flexShrink: 0,
}

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 0.42rem)',
  right: 0,
  minWidth: '18rem',
  maxWidth: 'min(20rem, calc(100vw - 2rem))',
  borderRadius: 'var(--radius-panel)',
  padding: '0.55rem',
  display: 'grid',
  gap: '0.4rem',
  zIndex: 30,
}

const summaryCardStyle: CSSProperties = {
  borderRadius: '12px',
  padding: '0.8rem 0.85rem',
  background: 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
}

const menuButtonStyle: CSSProperties = {
  width: '100%',
  justifyContent: 'flex-start',
  minHeight: '2.3rem',
  padding: '0.62rem 0.78rem',
}
