'use client'

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { requestNotificationPermission, setNotificationVolume, setSoundEnabled, playNotificationSound } from '@/lib/notifications'
import { getUserSettings, updateCanvasSettings, type UserSettings } from '@/actions/user-settings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
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

const SECTION_ORDER = ['account', 'canvas', 'theme', 'notifications', 'advanced'] as const

type SettingsSectionId = typeof SECTION_ORDER[number]

interface SettingsSectionLinkItem {
  id: SettingsSectionId
  label: string
  description: string
}

const SECTION_LABELS: Record<Exclude<SettingsSectionId, 'advanced'>, SettingsSectionLinkItem> = {
  account: {
    id: 'account',
    label: 'Account',
    description: 'Identity, sign-in state, and profile photo.',
  },
  canvas: {
    id: 'canvas',
    label: 'Canvas',
    description: 'Connection setup, sync flow, and course import actions.',
  },
  theme: {
    id: 'theme',
    label: 'Theme',
    description: 'Appearance mode and accent color.',
  },
  notifications: {
    id: 'notifications',
    label: 'Notifications',
    description: 'Browser permission, sound, and volume.',
  },
}

export function SettingsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { mode, accent, resolvedTheme, setMode, setAccent } = useThemeSettings()
  const authSummary = useAuthSummary()
  const resolvedAvatar = useResolvedUserAvatar(authSummary.user)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [avatarActionPending, setAvatarActionPending] = useState<'source' | 'upload' | 'remove' | null>(null)
  const [avatarActionError, setAvatarActionError] = useState<string | null>(null)
  const [avatarActionMessage, setAvatarActionMessage] = useState<string | null>(null)
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [canvasSaving, setCanvasSaving] = useState(false)
  const [canvasSaveMessage, setCanvasSaveMessage] = useState<string | null>(null)

  const availableSections = buildAvailableSections()
  const requestedSection = searchParams.get('section')
  const activeSection = resolveActiveSection(requestedSection, availableSections)

  useEffect(() => {
    if (!authSummary.user) {
      setSettingsLoading(false)
      return
    }

    let mounted = true

    async function loadSettings() {
      setSettingsLoading(true)
      setSettingsError(null)

      const result = await getUserSettings()

      if (!mounted) return

      if (result.ok) {
        setUserSettings(result.settings)
      } else {
        setSettingsError(result.error)
      }

      setSettingsLoading(false)
    }

    void loadSettings()

    return () => {
      mounted = false
    }
  }, [authSummary.user])

  useEffect(() => {
    if (!requestedSection) return
    if (requestedSection === activeSection) return

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('section', activeSection)
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false })
  }, [activeSection, pathname, requestedSection, router, searchParams])

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
          Move between account, Canvas, appearance, and notification controls without scanning one long mixed page.
        </p>
      </header>

      <div className="settings-layout">
        <nav className="settings-nav motion-card" aria-label="Settings sections">
          <div className="settings-nav-list" role="tablist" aria-orientation="vertical">
            {availableSections.map((section) => {
              const href = buildSectionHref(pathname, searchParams, section.id)
              const selected = section.id === activeSection

              return (
                <Link
                  key={section.id}
                  href={href}
                  scroll={false}
                  role="tab"
                  aria-selected={selected}
                  aria-current={selected ? 'page' : undefined}
                  className="settings-nav-link ui-interactive-card"
                  data-active={selected ? 'true' : 'false'}
                >
                  <span className="settings-nav-label">{section.label}</span>
                  <span className="settings-nav-desc">{section.description}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="settings-panel-stack">
          {activeSection === 'account' ? (
            <SettingsSection
              id="account"
              eyebrow="Account"
              title="Account"
              description="View your sign-in state and manage the profile photo tied to this workspace."
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
                    Accepted: JPG, PNG, WEBP, GIF, max 5 MB. Priority: custom upload, then Google photo, then initials.
                  </p>
                  {resolvedAvatar.error ? <p className="settings-card-error">{resolvedAvatar.error}</p> : null}
                  {avatarActionError ? <p className="settings-card-error">{avatarActionError}</p> : null}
                  {avatarActionMessage ? <p className="settings-card-message">{avatarActionMessage}</p> : null}
                </div>
              )}
            </SettingsSection>
          ) : null}

          {activeSection === 'canvas' ? (
            <SettingsSection
              id="canvas"
              eyebrow="Canvas"
              title="Canvas"
              description="Configure your Canvas API connection for syncing courses, modules, and tasks."
            >
              {!authSummary.user ? (
                <div className="settings-account-card">
                  <div>
                    <p className="settings-card-title">Canvas sync needs an account</p>
                    <p className="settings-card-desc">Sign in before connecting Canvas so sync data stays tied to your account.</p>
                  </div>
                  <div className="settings-card-actions">
                    <Link href="/sign-in?next=%2Fsettings%3Fsection%3Dcanvas" className="ui-button ui-button-primary">
                      Sign in
                    </Link>
                    <Link href="/sign-up?next=%2Fsettings%3Fsection%3Dcanvas" className="ui-button ui-button-secondary">
                      Create account
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="settings-option-list">
                  <div className="settings-profile-card">
                    <div className="settings-stack-tight">
                      <p className="settings-card-title">Canvas API Connection</p>
                      <p className="settings-card-desc">
                        {settingsLoading
                          ? 'Loading your Canvas settings...'
                          : userSettings?.canvasApiUrl && userSettings?.canvasAccessToken
                            ? `Connected to ${new URL(userSettings.canvasApiUrl).hostname}. Your Canvas token is saved securely.`
                            : 'Add your Canvas URL and access token to enable course syncing.'}
                      </p>
                    </div>

                    {!settingsLoading && (
                      <form
                        style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}
                        onSubmit={async (e) => {
                          e.preventDefault()
                          setCanvasSaving(true)
                          setCanvasSaveMessage(null)
                          setSettingsError(null)

                          const formData = new FormData(e.currentTarget)
                          const canvasApiUrl = formData.get('canvasApiUrl') as string
                          const canvasAccessToken = formData.get('canvasAccessToken') as string

                          const result = await updateCanvasSettings({
                            canvasApiUrl,
                            canvasAccessToken,
                          })

                          if (result.ok) {
                            setCanvasSaveMessage('Canvas settings saved successfully!')
                            const refreshResult = await getUserSettings()
                            if (refreshResult.ok) {
                              setUserSettings(refreshResult.settings)
                            }
                          } else {
                            setSettingsError(result.error)
                          }

                          setCanvasSaving(false)
                        }}
                      >
                        <label style={{ display: 'grid', gap: '0.4rem' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Canvas URL
                          </span>
                          <input
                            type="url"
                            name="canvasApiUrl"
                            defaultValue={userSettings?.canvasApiUrl ?? ''}
                            placeholder="https://yourschool.instructure.com"
                            required
                            className="ui-input"
                            style={{ width: '100%', minHeight: '2.7rem', borderRadius: 'var(--radius-control)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', padding: '0.7rem 0.85rem', color: 'var(--text-primary)' }}
                          />
                        </label>

                        <label style={{ display: 'grid', gap: '0.4rem' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            Access Token
                          </span>
                          <input
                            type="password"
                            name="canvasAccessToken"
                            defaultValue={userSettings?.canvasAccessToken ?? ''}
                            placeholder="Paste your Canvas access token"
                            required
                            className="ui-input"
                            style={{ width: '100%', minHeight: '2.7rem', borderRadius: 'var(--radius-control)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', padding: '0.7rem 0.85rem', color: 'var(--text-primary)' }}
                          />
                        </label>

                        <button
                          type="submit"
                          className="ui-button ui-button-primary"
                          style={{ minHeight: '2.7rem' }}
                          disabled={canvasSaving}
                        >
                          {canvasSaving ? 'Saving...' : 'Save Canvas Settings'}
                        </button>

                        {canvasSaveMessage && (
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--blue)' }}>{canvasSaveMessage}</p>
                        )}
                        {settingsError && (
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--red)' }}>{settingsError}</p>
                        )}
                      </form>
                    )}

                    <p className="settings-card-note" style={{ marginTop: '1rem' }}>
                      To create a Canvas access token: Go to Canvas → Account → Settings → New Access Token. Your token is stored securely and only used to sync your courses.
                    </p>
                  </div>

                  {userSettings?.canvasApiUrl && userSettings?.canvasAccessToken && (
                    <div className="settings-card-actions">
                      <Link href="/canvas" className="ui-button ui-button-secondary">
                        Go to Canvas Sync
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </SettingsSection>
          ) : null}

          {activeSection === 'theme' ? (
            <SettingsSection
              id="theme"
              eyebrow="Theme"
              title="Theme"
              description="Choose the appearance mode and accent color used across the app."
            >
              <div className="settings-subsection">
                <div className="settings-subsection-header">
                  <h3 className="settings-subsection-title">Appearance mode</h3>
                  <p className="settings-subsection-desc">Current: {resolvedTheme}.</p>
                </div>
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
              </div>

              <div className="settings-subsection">
                <div className="settings-subsection-header">
                  <h3 className="settings-subsection-title">Accent color</h3>
                  <p className="settings-subsection-desc">Used for highlights, selected states, and primary emphasis.</p>
                </div>
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
              </div>
            </SettingsSection>
          ) : null}

          {activeSection === 'notifications' ? (
            <>
              {userSettings && (
                <div className="mb-6">
                  <NotificationSettings
                    initialEmailNotifications={userSettings.emailNotifications}
                    initialEmailCategories={userSettings.emailCategories}
                    notificationEmail={userSettings.notificationEmail}
                    emailProviderConfigured={userSettings.emailProviderConfigured}
                  />
                </div>
              )}
              <BrowserNotificationsSection />
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function BrowserNotificationsSection() {
  const settings = useSyncExternalStore(
    subscribeNotificationSettings,
    getNotificationSettingsSnapshot,
    getNotificationSettingsServerSnapshot,
  )
  const { permission, soundEnabled, volume } = settings

  async function handleRequestPermission() {
    await requestNotificationPermission()
    emitNotificationSettingsChange()
  }

  function handleSoundToggle() {
    const next = !soundEnabled
    setSoundEnabled(next)
    emitNotificationSettingsChange()
  }

  function handleVolumeChange(value: number) {
    setNotificationVolume(value / 100)
    emitNotificationSettingsChange()
  }

  function handleTestSound() {
    playNotificationSound('success')
  }

  return (
    <SettingsSection
      id="notifications"
      eyebrow="Notifications"
      title="Notifications"
      description="Manage browser permission, sound playback, and notification volume for sync updates."
    >
      <div className="settings-option-list">
        <div className="settings-option-row ui-interactive-card" style={{ cursor: 'default' }}>
          <div style={{ minWidth: 0 }}>
            <p className="settings-card-title">Permission</p>
            <p className="settings-card-desc">
              {permission === 'unsupported' && 'Your browser does not support notifications.'}
              {permission === 'granted' && 'Notifications are allowed.'}
              {permission === 'denied' && 'Notifications are blocked. Open your browser site permissions, allow notifications, then return here.'}
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
          <div className="settings-option-row settings-option-row-stack ui-interactive-card" style={{ cursor: 'default' }}>
            <div className="settings-inline-header">
              <div style={{ minWidth: 0 }}>
                <p className="settings-card-title">Volume</p>
                <p className="settings-card-desc">Adjust how loud notification sounds play.</p>
              </div>
              <div className="settings-inline-actions">
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
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="settings-section" id={`settings-section-${id}`} aria-labelledby={`settings-section-title-${id}`}>
      <div className="settings-section-header">
        <p className="ui-kicker">{eyebrow}</p>
        <h2 className="settings-section-title" id={`settings-section-title-${id}`}>{title}</h2>
        <p className="settings-section-desc">{description}</p>
      </div>
      <div className="settings-section-body">
        {children}
      </div>
    </section>
  )
}

function buildAvailableSections() {
  return SECTION_ORDER
    .map((id) => SECTION_LABELS[id as keyof typeof SECTION_LABELS] ?? null)
    .filter((section): section is SettingsSectionLinkItem => section !== null)
}

function resolveActiveSection(
  requested: string | null,
  sections: SettingsSectionLinkItem[],
): SettingsSectionId {
  const fallback = sections[0]?.id ?? 'account'

  if (!requested) return fallback

  return sections.some((section) => section.id === requested)
    ? requested as SettingsSectionId
    : fallback
}

function buildSectionHref(pathname: string, searchParams: URLSearchParams, sectionId: SettingsSectionId) {
  const nextParams = new URLSearchParams(searchParams.toString())
  nextParams.set('section', sectionId)
  return `${pathname}?${nextParams.toString()}`
}

function getAvatarSourceLabel(source: AvatarSource) {
  if (source === 'upload') return 'Custom photo'
  if (source === 'google') return 'Google photo'
  return 'Placeholder'
}

function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return Notification.permission
}

function getStoredSoundEnabled() {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('stay-focused.sound-enabled') !== 'false'
}

function getStoredVolume() {
  if (typeof window === 'undefined') return 50

  const storedValue = localStorage.getItem('stay-focused.sound-volume')
  const parsed = storedValue ? parseFloat(storedValue) : 0.5
  return Number.isNaN(parsed) ? 50 : Math.round(parsed * 100)
}


type NotificationSettingsSnapshot = {
  permission: NotificationPermission | 'unsupported'
  soundEnabled: boolean
  volume: number
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsSnapshot = {
  permission: 'default',
  soundEnabled: true,
  volume: 50,
}

const notificationSettingsListeners = new Set<() => void>()
let lastNotificationSnapshot: NotificationSettingsSnapshot | null = null

function subscribeNotificationSettings(listener: () => void) {
  notificationSettingsListeners.add(listener)

  if (typeof window === 'undefined') {
    return () => {
      notificationSettingsListeners.delete(listener)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith('stay-focused.sound-')) {
      listener()
    }
  }

  window.addEventListener('storage', handleStorage)

  return () => {
    notificationSettingsListeners.delete(listener)
    window.removeEventListener('storage', handleStorage)
  }
}

function emitNotificationSettingsChange() {
  notificationSettingsListeners.forEach((listener) => listener())
}

function getNotificationSettingsSnapshot(): NotificationSettingsSnapshot {
  const nextSnapshot = {
    permission: getNotificationPermissionState(),
    soundEnabled: getStoredSoundEnabled(),
    volume: getStoredVolume(),
  }

  if (
    lastNotificationSnapshot &&
    lastNotificationSnapshot.permission === nextSnapshot.permission &&
    lastNotificationSnapshot.soundEnabled === nextSnapshot.soundEnabled &&
    lastNotificationSnapshot.volume === nextSnapshot.volume
  ) {
    return lastNotificationSnapshot
  }

  lastNotificationSnapshot = nextSnapshot
  return nextSnapshot
}

function getNotificationSettingsServerSnapshot(): NotificationSettingsSnapshot {
  return DEFAULT_NOTIFICATION_SETTINGS
}
