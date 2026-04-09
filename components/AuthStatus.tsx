'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignOutButton } from '@/components/SignOutButton'
import { useAuthSummary } from '@/components/useAuthSummary'

export function AuthStatus() {
  const authSummary = useAuthSummary()
  const pathname = usePathname()
  const next = pathname || '/settings'

  if (!authSummary.isConfigured) {
    return null
  }

  if (!authSummary.user) {
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(next)}`}
        className="ui-button ui-button-secondary"
        style={buttonStyle}
      >
        Sign in
      </Link>
    )
  }

  return (
    <div
      className="glass-panel glass-soft"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.4rem 0.55rem 0.4rem 0.75rem',
        borderRadius: '999px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Signed in
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
          {authSummary.user.email ?? 'Account active'}
        </div>
      </div>
      <SignOutButton className="ui-button ui-button-ghost" style={{ minHeight: '34px', padding: '0.45rem 0.7rem', fontSize: '12px' }} />
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '0.55rem 0.82rem',
  borderRadius: 'var(--radius-control)',
  fontWeight: 700,
  textDecoration: 'none',
  minHeight: '40px',
}
