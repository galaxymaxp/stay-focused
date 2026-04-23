'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { requestNotificationPermission, setNotificationVolume, setSoundEnabled, playNotificationSound } from '@/lib/notifications'
import { useResolvedUserAvatar } from '@/components/useResolvedUserAvatar'
import { UserAvatar } from '@/components/UserAvatar'
import { useThemeSettings } from '@/components/ThemeProvider'
import { useAuthSummary } from '@/components/useAuthSummary'
import type { UserAvatarApiResponse } from '@/components/useUserAvatarProfile'
import type { AvatarSource } from '@/lib/profile-avatar'
import { ACCENT_OPTIONS, type AccentName, type ThemeMode } from '@/lib/theme'

const MODE_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Keep the interface bright and clean.' },
  { value: 'dark', label: 'Dark', description: 'Use a darker look for lower-glare studying.' },
  { value: 'system', label: 'System', description: 'Follow your device preference automatically.' },
]

export function SettingsPage() {
  const { mode, accent, resolvedTheme, setMode, setAccent } = useThemeSettings()
  const authSummary = useAuthSummary()
  const resolvedAvatar = useResolvedUserAvatar(authSummary.user)
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

      resolvedAvatar.setAvatar(payload)
      setAvatarActionMessage(nextSource === 'google' ? 'Now using your Google photo.' : 'Now using your uploaded photo.')
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

      resolvedAvatar.setAvatar(payload)
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

      resolvedAvatar.setAvatar(payload)
      setAvatarActionMessage(payload.profile.avatarSource === 'google' ? 'Custom photo removed. Back to Google photo.' : 'Custom photo removed.')
    } catch (error) {
      setAvatarActionError(error instanceof Error ? error.message : 'Could not remove uploaded profile photo.')
    } finally {
      setAvatarActionPending(null)
    }
  }

  return (
    <main className="page-shell page-shell-narrow page-stack settings-page">
      <header className="motion-card settings-page-header">
        <p className="ui-kicker">Settings</p>
        <h1 className="ui-page-title">Preferences</h1>
        <p className="ui-page-copy settings-page-intro">
          Adjust the appearance of the app. These settings apply across Today, Learn, Do, Calendar, and module workspaces.
        </p>
      </header>

      <SettingsSection
        eyebrow="Account"
        title="Authentication"
        description="Sign in to save your progress and access Stay Focused from any device. Email/password and Google sign-in are both supported."
      >
        {!authSummary.user ? (
          <div className="settings-account-card">
            <div>
              <p className="settings-card-title">Not signed in</p>
              <p className="settings-card-desc">Sign in to keep your work saved across devices and sessions.</p>
            </div>
            <div className="settings-card-actions">
              <Link href="/sign-in?next=%2Fsettings" className="ui-button ui-button-primary">
                Sign in
              </Link>
              <Link href="/sign-up?next=%2Fsettings" className="ui-button ui-button-secondary">
                Create account
              </Link>
            </div>
          </div>
        ) : (
          <div className="settings-profile-card">
            <div className="settings-profile-row">
              <UserAvatar
                value={{
                  url: resolvedAvatar.resolvedAvatar.url,
                  initials: resolvedAvatar.resolvedAvatar.initials,
                }}
                size={64}
                active
              />
              <div style={{ minWidth: 0 }}>
                <p className="settings-card-title">Profile photo</p>
                <p className="settings-card-desc">
                  Current source: {getAvatarSourceLabel(resolvedAvatar.resolvedAvatar.source)}
                </p>
                <p className="settings-card-desc">
                  {resolvedAvatar.loading
                    ? 'Loading your avatar settings...'
                    : resolvedAvatar.error
                      ? 'Could not load your avatar settings right now.'
                    : resolvedAvatar.hasGoogleAvatar
                      ? 'Google photo is available for this account.'
                      : 'No Google photo detected for this account. Placeholder initials will be used until you upload one.'}
                </p>
              </div>
            </div>

            <div className="settings-card-actions">
              <button
                type="button"
                className="ui-button ui-button-secondary"
                onClick={() => setAvatarSource('google')}
                disabled={!resolvedAvatar.hasGoogleAvatar || Boolean(avatarActionPending)}
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
                disabled={!resolvedAvatar.profile.avatarUrl || Boolean(avatarActionPending)}
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

            <p className="settings-card-note">
              Accepted: JPG, PNG, WEBP, GIF — max 5 MB. Priority: custom upload, then Google photo, then initials.
            </p>
            {resolvedAvatar.error ? <p className="settings-card-error">{resolvedAvatar.error}</p> : null}
            {avatarActionError ? <p className="settings-card-error">{avatarActionError}</p> : null}
            {avatarActionMessage ? <p className="settings-card-message">{avatarActionMessage}</p> : null}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        eyebrow="Appearance"
        title="Theme mode"
        description={`Choose how the app handles light and dark mode. Current: ${resolvedTheme}.`}
      >
        <div className="settings-option-list">
          {MODE_OPTIONS.map((option) => {
            const selected = option.value === mode

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={selected}
                className="settings-option-row ui-interactive-card"
              >
                <div style={{ minWidth: 0 }}>
                  <p className="settings-card-title">{option.label}</p>
                  <p className="settings-card-desc">{option.description}</p>
                </div>
                <span
                  className="settings-option-label"
                  data-selected={selected ? 'true' : 'false'}
                >
                  {selected ? 'Current' : 'Select'}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Accent"
        title="Highlight color"
        description="Choose the accent used for key actions, highlights, and supporting emphasis."
      >
        <div className="settings-swatch-grid">
          {Object.entries(ACCENT_OPTIONS).map(([name, palette]) => {
            const selected = name === accent

            return (
              <button
                key={name}
                type="button"
                onClick={() => setAccent(name as AccentName)}
                aria-pressed={selected}
                className="settings-swatch-card ui-interactive-card"
              >
                <div className="settings-swatch-dots">
                  <span className="settings-swatch-dot" style={{ background: palette.accent, borderColor: palette.accentBorder }} />
                  <span className="settings-swatch-dot" style={{ background: palette.accentLight, borderColor: palette.accentBorder }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="settings-card-title">{palette.label}</p>
                  <p className="settings-card-desc">{selected ? 'Current accent' : 'Apply accent'}</p>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSection>
      <BrowserNotificationsSection />
    </main>
  )
}

function BrowserNotificationsSection() {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [soundEnabled, setSoundEnabledState] = useState(true)
  const [volume, setVolumeState] = useState(50)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    const storedSound = localStorage.getItem('stay-focused.sound-enabled')
    setSoundEnabledState(storedSound !== 'false')
    const storedVol = localStorage.getItem('stay-focused.sound-volume')
    const parsed = storedVol ? parseFloat(storedVol) : 0.5
    setVolumeState(isNaN(parsed) ? 50 : Math.round(parsed * 100))
  }, [])

  async function handleRequestPermission() {
    const granted = await requestNotificationPermission()
    setPermission(granted ? 'granted' : Notification.permission)
  }

  function handleSoundToggle() {
    const next = !soundEnabled
    setSoundEnabledState(next)
    setSoundEnabled(next)
  }

  function handleVolumeChange(value: number) {
    setVolumeState(value)
    setNotificationVolume(value / 100)
  }

  function handleTestSound() {
    playNotificationSound('success')
  }

  return (
    <SettingsSection
      eyebrow="Notifications"
      title="Browser notifications"
      description="Get notified about Canvas syncs and important events even when the tab is in the background."
    >
      <div className="settings-option-list">
        <div className="settings-option-row ui-interactive-card" style={{ cursor: 'default' }}>
          <div style={{ minWidth: 0 }}>
            <p className="settings-card-title">Permission</p>
            <p className="settings-card-desc">
              {permission === 'unsupported' && 'Your browser does not support notifications.'}
              {permission === 'granted' && 'Notifications are allowed.'}
              {permission === 'denied' && 'Notifications are blocked. Enable them in browser settings.'}
              {permission === 'default' && 'Grant permission to receive background notifications.'}
            </p>
          </div>
          {permission === 'default' && (
            <button type="button" className="ui-button ui-button-primary" onClick={handleRequestPermission}>
              Allow
            </button>
          )}
          {permission === 'granted' && (
            <span className="settings-option-label" data-selected="true">Allowed</span>
          )}
          {permission === 'denied' && (
            <span className="settings-option-label" data-selected="false">Blocked</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSoundToggle}
          aria-pressed={soundEnabled}
          className="settings-option-row ui-interactive-card"
        >
          <div style={{ minWidth: 0 }}>
            <p className="settings-card-title">Notification sounds</p>
            <p className="settings-card-desc">Play a sound when a sync completes or an alert fires.</p>
          </div>
          <span className="settings-option-label" data-selected={soundEnabled ? 'true' : 'false'}>
            {soundEnabled ? 'On' : 'Off'}
          </span>
        </button>

        {soundEnabled && (
          <div className="settings-option-row ui-interactive-card" style={{ cursor: 'default', flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <p className="settings-card-title">Volume</p>
                <p className="settings-card-desc">Adjust how loud notification sounds play.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="settings-option-label" data-selected="false" style={{ minWidth: '3ch', textAlign: 'right' }}>
                  {volume}%
                </span>
                <button type="button" className="ui-button ui-button-ghost" onClick={handleTestSound} style={{ padding: '4px 10px', fontSize: '12px' }}>
                  Test
                </button>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </div>
        )}
      </div>
    </SettingsSection>
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
    <section className="settings-section">
      <div className="settings-section-header">
        <p className="ui-kicker">{eyebrow}</p>
        <h2 className="settings-section-title">{title}</h2>
        <p className="settings-section-desc">{description}</p>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
  )
}

function getAvatarSourceLabel(source: AvatarSource) {
  if (source === 'upload') return 'Custom photo'
  if (source === 'google') return 'Google photo'
  return 'Placeholder'
}
