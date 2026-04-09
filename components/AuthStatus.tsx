'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import { useAuthSummary } from '@/components/useAuthSummary'

export function AuthStatus() {
  const authSummary = useAuthSummary()
  const pathname = usePathname()
  const next = pathname || '/settings'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const avatarLabel = useMemo(() => {
    const email = authSummary.user?.email?.trim()
    if (!email) return null

    const local = email.split('@')[0]?.replace(/[^a-z0-9]+/gi, ' ').trim()
    if (!local) return email.slice(0, 2).toUpperCase()

    return local
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2)
  }, [authSummary.user?.email])

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
        <span style={avatarStyle(Boolean(authSummary.user))}>
          {authSummary.user ? (
            avatarLabel ?? <ProfileGlyph />
          ) : (
            <ProfileGlyph />
          )}
        </span>
        <span style={{ display: 'grid', gap: '0.12rem', textAlign: 'left', minWidth: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            {authSummary.user ? 'Signed in' : 'Account'}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '11rem' }}>
            {authSummary.user?.email ?? 'Sign in or create an account'}
          </span>
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
                <p className="ui-kicker" style={{ margin: 0 }}>Account</p>
                <div style={{ marginTop: '0.32rem', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                  {authSummary.user.email ?? 'Signed-in account'}
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

function ProfileGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a3.75 3.75 0 1 0 0-7.5a3.75 3.75 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

const triggerStyle: CSSProperties = {
  minHeight: '40px',
  padding: '0.42rem 0.55rem 0.42rem 0.45rem',
  gap: '0.55rem',
  borderRadius: '999px',
}

function avatarStyle(active: boolean): CSSProperties {
  return {
    width: '2rem',
    height: '2rem',
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '11px',
    fontWeight: 700,
    background: active
      ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
      : 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
    color: active ? 'var(--accent-foreground)' : 'var(--text-secondary)',
    border: `1px solid ${active
      ? 'color-mix(in srgb, var(--accent-border) 54%, var(--border-subtle) 46%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
  }
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
