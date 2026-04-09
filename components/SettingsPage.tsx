'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { UserAvatar } from '@/components/UserAvatar'
import { useThemeSettings } from '@/components/ThemeProvider'
import { SignOutButton } from '@/components/SignOutButton'
import { useAuthSummary } from '@/components/useAuthSummary'
import { useUserAvatarProfile, type UserAvatarApiResponse } from '@/components/useUserAvatarProfile'
import { getUserInitialsFromEmail, type AvatarSource } from '@/lib/profile-avatar'
import { ACCENT_OPTIONS, type AccentName, type ThemeMode } from '@/lib/theme'

const MODE_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Keep the interface bright and clean.' },
  { value: 'dark', label: 'Dark', description: 'Use a darker look for lower-glare studying.' },
  { value: 'system', label: 'System', description: 'Follow your device preference automatically.' },
]

export function SettingsPage() {
  const { mode, accent, resolvedTheme, setMode, setAccent } = useThemeSettings()
  const authSummary = useAuthSummary()
  const avatarProfile = useUserAvatarProfile(Boolean(authSummary.user))
  const fallbackInitials = getUserInitialsFromEmail(authSummary.user?.email ?? null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarActionPending, setAvatarActionPending] = useState<'source' | 'upload' | 'remove' | null>(null)
  const [avatarActionError, setAvatarActionError] = useState<string | null>(null)
  const [avatarActionMessage, setAvatarActionMessage] = useState<string | null>(null)

  async function setAvatarSource(nextSource: AvatarSource) {
    if (!authSummary.user) return

    setAvatarActionPending('source')
    setAvatarActionError(null)
    setAvatarActionMessage(null)

    try {
      const response = await fetch('/api/profile/avatar', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatarSource: nextSource }),
      })
      const payload = await response.json().catch(() => null) as UserAvatarApiResponse | { error?: string } | null

      if (!response.ok || !payload || !('profile' in payload)) {
        throw new Error((payload && 'error' in payload && typeof payload.error === 'string') ? payload.error : 'Could not update avatar source.')
      }

      avatarProfile.setAvatar(payload)
      setAvatarActionMessage(nextSource === 'google' ? 'Now using your Google photo.' : nextSource === 'upload' ? 'Now using your uploaded photo.' : 'Now using initials placeholder.')
    } catch (error) {
      setAvatarActionError(error instanceof Error ? error.message : 'Could not update avatar source.')
    } finally {
      setAvatarActionPending(null)
    }
  }

  async function uploadCustomPhoto(file: File) {
    if (!authSummary.user) return

    setAvatarActionPending('upload')
    setAvatarActionError(null)
    setAvatarActionMessage(null)

    try {
      const formData = new FormData()
      formData.set('avatar', file)

      const response = await fetch('/api/profile/avatar/upload', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json().catch(() => null) as UserAvatarApiResponse | { error?: string } | null

      if (!response.ok || !payload || !('profile' in payload)) {
        throw new Error((payload && 'error' in payload && typeof payload.error === 'string') ? payload.error : 'Could not upload profile photo.')
      }

      avatarProfile.setAvatar(payload)
      setAvatarActionMessage('Custom photo uploaded.')
    } catch (error) {
      setAvatarActionError(error instanceof Error ? error.message : 'Could not upload profile photo.')
    } finally {
      setAvatarActionPending(null)
    }
  }

  async function removeCustomPhoto() {
    if (!authSummary.user) return

    setAvatarActionPending('remove')
    setAvatarActionError(null)
    setAvatarActionMessage(null)

    try {
      const response = await fetch('/api/profile/avatar/upload', {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null) as UserAvatarApiResponse | { error?: string } | null

      if (!response.ok || !payload || !('profile' in payload)) {
        throw new Error((payload && 'error' in payload && typeof payload.error === 'string') ? payload.error : 'Could not remove uploaded profile photo.')
      }

      avatarProfile.setAvatar(payload)
      setAvatarActionMessage(payload.profile.avatarSource === 'google' ? 'Custom photo removed. Back to Google photo.' : 'Custom photo removed.')
    } catch (error) {
      setAvatarActionError(error instanceof Error ? error.message : 'Could not remove uploaded profile photo.')
    } finally {
      setAvatarActionPending(null)
    }
  }

  return (
    <main className="page-shell page-shell-narrow page-stack" style={{ gap: '1rem' }}>
      <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <p className="ui-kicker">Settings</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Preferences</h1>
        <p className="ui-page-copy" style={{ maxWidth: '46rem', marginTop: 0 }}>
          Adjust the appearance of the app. These settings apply across Today, Learn, Do, Calendar, and module workspaces.
        </p>
      </header>

      <SettingsSection
        eyebrow="Account"
        title="Authentication"
        description="Email/password and Google sign-in are now available. The app still works without login, but authenticated sessions establish a stable user identity for future ownership hardening."
      >
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {authSummary.user ? (
            <div style={accountCardStyle}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {authSummary.user.email ?? 'Signed-in user'}
                </div>
                <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  Session cookies are active. Auto Prompt can now promote saved anonymous results onto your authenticated identity without breaking existing cache hits.
                </div>
              </div>
              <SignOutButton className="ui-button ui-button-secondary" style={{ minHeight: '2.4rem' }} />
            </div>
          ) : (
            <div style={accountCardStyle}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Not signed in</div>
                <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  Anonymous cookie identity still works, but sign-in is the path forward for durable user-owned persistence.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <Link href="/sign-in?next=%2Fsettings" className="ui-button ui-button-primary" style={{ textDecoration: 'none' }}>
                  Sign in
                </Link>
                <Link href="/sign-up?next=%2Fsettings" className="ui-button ui-button-secondary" style={{ textDecoration: 'none' }}>
                  Create account
                </Link>
              </div>
            </div>
          )}

          <div style={noteCardStyle}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Google sign-in</div>
            <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Google OAuth is wired into the same session flow as email/password. Enable the Google provider in Supabase Auth and set the callback URL before using it in production.
            </div>
          </div>

          <div style={noteCardStyle}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Canvas connect plan</div>
            <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              Canvas sync still uses the manual URL plus access-token flow. The intended next step is a user-owned Canvas connection record keyed to the authenticated Supabase user so the raw token entry UI can be replaced with a real connect/reconnect flow.
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Appearance"
        title="Theme mode"
        description={`Choose how the app handles light and dark mode. Current resolved theme: ${resolvedTheme}.`}
      >
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {MODE_OPTIONS.map((option) => {
            const selected = option.value === mode

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={selected}
                className="ui-interactive-card"
                data-open={selected ? 'true' : 'false'}
                style={optionRowStyle(selected)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{option.label}</div>
                  <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    {option.description}
                  </div>
                </div>
                <span style={selectionLabelStyle(selected)}>
                  {selected ? 'Current' : 'Select'}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      {authSummary.user ? (
        <SettingsSection
          eyebrow="Profile"
          title="Profile picture"
          description="Use your Google photo when available, upload your own image, or fall back to initials."
        >
          <div style={{ display: 'grid', gap: '0.8rem' }}>
            <div style={avatarCardStyle}>
              <UserAvatar
                value={{
                  url: avatarProfile.avatar?.resolved.url ?? null,
                  initials: avatarProfile.avatar?.resolved.initials ?? fallbackInitials,
                }}
                size={64}
                active
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Current source: {getAvatarSourceLabel(avatarProfile.avatar?.resolved.source ?? 'none')}
                </div>
                <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {avatarProfile.loading
                    ? 'Loading your avatar settings...'
                    : avatarProfile.error
                      ? 'Could not load your avatar settings right now.'
                    : avatarProfile.avatar?.hasGoogleAvatar
                      ? 'Google photo is available for this account.'
                      : 'No Google photo detected for this account.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              <button
                type="button"
                className="ui-button ui-button-secondary"
                onClick={() => setAvatarSource('google')}
                disabled={!avatarProfile.avatar?.hasGoogleAvatar || Boolean(avatarActionPending)}
              >
                Use Google photo
              </button>
              <button
                type="button"
                className="ui-button ui-button-primary"
                onClick={() => uploadInputRef.current?.click()}
                disabled={Boolean(avatarActionPending)}
              >
                {avatarActionPending === 'upload' ? 'Uploading...' : 'Upload custom photo'}
              </button>
              <button
                type="button"
                className="ui-button ui-button-ghost"
                onClick={removeCustomPhoto}
                disabled={!avatarProfile.avatar?.profile.avatarUrl || Boolean(avatarActionPending)}
              >
                Remove custom photo
              </button>
            </div>

            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null
                if (file) {
                  void uploadCustomPhoto(file)
                }
                event.currentTarget.value = ''
              }}
            />

            <div style={noteCardStyle}>
              <div style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                Allowed types: JPG, PNG, WEBP, GIF. Max size: 5 MB. Placeholder initials are used automatically when no Google or uploaded photo is active.
              </div>
              {avatarProfile.error ? (
                <div style={{ marginTop: '0.32rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--red)' }}>
                  {avatarProfile.error}
                </div>
              ) : null}
              {avatarActionError ? (
                <div style={{ marginTop: '0.32rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--red)' }}>
                  {avatarActionError}
                </div>
              ) : null}
              {avatarActionMessage ? (
                <div style={{ marginTop: '0.32rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--blue)' }}>
                  {avatarActionMessage}
                </div>
              ) : null}
            </div>
          </div>
        </SettingsSection>
      ) : null}

      <SettingsSection
        eyebrow="Accent"
        title="Highlight color"
        description="Choose the accent used for key actions, highlights, and supporting emphasis."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
          {Object.entries(ACCENT_OPTIONS).map(([name, palette]) => {
            const selected = name === accent

            return (
              <button
                key={name}
                type="button"
                onClick={() => setAccent(name as AccentName)}
                aria-pressed={selected}
                className="ui-interactive-card"
                data-open={selected ? 'true' : 'false'}
                style={swatchCardStyle(selected)}
              >
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: palette.accent, border: `1px solid ${palette.accentBorder}` }} />
                  <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: palette.accentLight, border: `1px solid ${palette.accentBorder}` }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{palette.label}</div>
                  <div style={{ marginTop: '0.22rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selected ? 'Current accent' : 'Apply accent'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSection>
    </main>
  )
}

function SettingsSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section style={sectionStyle}>
      <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)' }}>
        <p className="ui-kicker">{eyebrow}</p>
        <h2 style={{ margin: '0.4rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
      <div style={{ padding: '1rem 1.1rem' }}>
        {children}
      </div>
    </section>
  )
}

function optionRowStyle(selected: boolean): React.CSSProperties {
  return {
    width: '100%',
    borderRadius: '12px',
    border: `1px solid ${selected
      ? 'color-mix(in srgb, var(--accent-border) 48%, var(--border-subtle) 52%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
    background: selected
      ? 'color-mix(in srgb, var(--surface-selected) 60%, var(--surface-elevated) 40%)'
      : 'var(--surface-elevated)',
    padding: '0.85rem 0.95rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.8rem',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function swatchCardStyle(selected: boolean): React.CSSProperties {
  return {
    borderRadius: '12px',
    border: `1px solid ${selected
      ? 'color-mix(in srgb, var(--accent-border) 48%, var(--border-subtle) 52%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
    background: selected
      ? 'color-mix(in srgb, var(--surface-selected) 60%, var(--surface-elevated) 40%)'
      : 'var(--surface-elevated)',
    padding: '0.85rem 0.95rem',
    display: 'grid',
    gap: '0.65rem',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function selectionLabelStyle(selected: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
  }
}

const sectionStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 98%, transparent)',
  boxShadow: 'var(--highlight-sheen)',
  overflow: 'hidden',
}

const accountCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  padding: '0.95rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.9rem',
  flexWrap: 'wrap',
}

const noteCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 92%, var(--surface-base) 8%)',
  padding: '0.95rem',
}

const avatarCardStyle: React.CSSProperties = {
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  padding: '0.95rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
}

function getAvatarSourceLabel(source: AvatarSource) {
  if (source === 'upload') return 'Custom photo'
  if (source === 'google') return 'Google photo'
  return 'Placeholder'
}
