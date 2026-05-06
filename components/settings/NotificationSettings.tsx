'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { updateEmailPreferences, type EmailCategories } from '@/actions/user-settings'
import { createTestNotificationAction, sendTestEmailAction } from '@/actions/notifications'
import { dispatchInAppToast } from '@/lib/notifications'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth-browser'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import type { NotificationEmailSource, NotificationEmailOption } from '@/lib/notification-email-options'

type FrequencyOption = 'off' | 'instant' | 'daily_digest'

const frequencyOptions: { id: FrequencyOption; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No email notifications' },
  { id: 'instant', label: 'Instant', description: 'As events happen' },
  { id: 'daily_digest', label: 'Daily digest', description: 'One email per day' },
]

const testNotificationTypes: { key: string; label: string }[] = [
  { key: 'queue_completed', label: 'Queue completed' },
  { key: 'due_soon', label: 'Due soon task' },
  { key: 'new_upload', label: 'New upload' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'sync_completed', label: 'Sync completed' },
]

const SHOW_IN_APP_TESTS =
  process.env.NEXT_PUBLIC_ENABLE_NOTIFICATION_TESTS === 'true' ||
  process.env.NODE_ENV === 'development'

interface Props {
  initialEmailNotifications: FrequencyOption
  initialEmailCategories: EmailCategories
  notificationEmail: string | null
  notificationEmailSource?: NotificationEmailSource
  notificationEmailOptions?: NotificationEmailOption[]
  emailProviderConfigured?: boolean
  isResendDevSender?: boolean
  isAdmin?: boolean
  onNotificationEmailSourceChange?: (source: NotificationEmailSource) => void
}

export function NotificationSettings({
  initialEmailNotifications,
  initialEmailCategories,
  notificationEmail,
  notificationEmailSource = 'supabase_account',
  notificationEmailOptions = [],
  emailProviderConfigured = false,
  isResendDevSender = false,
  isAdmin = false,
  onNotificationEmailSourceChange,
}: Props) {
  const [frequency, setFrequency] = useState<FrequencyOption>(initialEmailNotifications)
  const [categories, setCategories] = useState<EmailCategories>(initialEmailCategories)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()
  const [testingKey, setTestingKey] = useState<string | null>(null)
  const [emailTestState, setEmailTestState] = useState<{ pending: boolean; result: { ok: boolean; message: string } | null }>({
    pending: false,
    result: null,
  })
  const [sourceSaving, setSourceSaving] = useState(false)
  const [linkPending, setLinkPending] = useState<NotificationEmailSource | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const masterEnabled = frequency !== 'off'

  function toggleCategory(key: keyof EmailCategories) {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateEmailPreferences({ emailNotifications: frequency, emailCategories: categories })
      setSaveState(result.ok ? 'saved' : 'error')
      setTimeout(() => setSaveState('idle'), 3000)
    })
  }

  async function handleTestNotification(key: string) {
    if (testingKey) return
    setTestingKey(key)
    try {
      const result = await createTestNotificationAction(key)
      if (result.ok) {
        dispatchInAppToast({ title: 'Test notification created', description: 'Check the notifications panel.', tone: 'success' })
      } else {
        dispatchInAppToast({ title: 'Test failed', description: result.error ?? 'Unknown error', tone: 'error' })
      }
    } finally {
      setTestingKey(null)
    }
  }

  async function handleEmailTest() {
    if (emailTestState.pending || !emailProviderConfigured) return
    setEmailTestState({ pending: true, result: null })
    try {
      const result = await sendTestEmailAction()
      setEmailTestState({
        pending: false,
        result: { ok: result.ok, message: result.ok ? 'Test email sent.' : (result.error ?? 'Failed to send.') },
      })
    } catch {
      setEmailTestState({ pending: false, result: { ok: false, message: 'Unexpected error.' } })
    }
  }

  async function handleSourceChange(source: NotificationEmailSource) {
    if (sourceSaving || source === notificationEmailSource) return
    setSourceSaving(true)
    try {
      await onNotificationEmailSourceChange?.(source)
    } finally {
      setSourceSaving(false)
    }
  }

  async function handleLinkIdentity(source: 'linked_google' | 'linked_microsoft') {
    if (linkPending || !isSupabaseAuthConfigured) return
    setLinkPending(source)
    setLinkError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/settings?section=notifications')}`
      const provider = source === 'linked_google' ? 'google' as const : 'azure' as const
      const options = provider === 'azure'
        ? { redirectTo, scopes: 'email' }
        : { redirectTo }
      const { error } = await supabase.auth.linkIdentity({ provider, options })
      if (error) {
        setLinkError(error.message)
        setLinkPending(null)
      }
      // On success the browser is redirected to the OAuth provider.
      // linkPending stays set until navigation completes.
    } catch {
      setLinkError('Could not start identity linking.')
      setLinkPending(null)
    }
  }

  // Determine whether selected source's email is unavailable (warn the user).
  const selectedOption = notificationEmailOptions.find((o) => o.source === notificationEmailSource)
  const selectedSourceUnavailable = selectedOption && !selectedOption.available

  // Derive the display email for the currently active source.
  const activeDisplayEmail = selectedOption?.email ?? notificationEmail

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>

      {/* Email address */}
      {activeDisplayEmail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem 0.85rem', borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-soft)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Digests sent to</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeDisplayEmail}
            </p>
          </div>
        </div>
      )}

      {/* Selected source unavailable warning */}
      {selectedSourceUnavailable && (
        <div style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--radius-panel)', border: '1px solid color-mix(in srgb, var(--yellow, #ca8a04) 35%, var(--border-subtle) 65%)', background: 'color-mix(in srgb, var(--yellow, #ca8a04) 8%, var(--surface-base) 92%)' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>Selected email is no longer linked</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            Digests will fall back to your account email until you re-link the provider or change your selection.
          </p>
        </div>
      )}

      {/* Delivery frequency */}
      <section>
        <div style={{ marginBottom: '0.65rem' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Email Notifications</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Choose how often Stay Focused emails you about activity. Digests are sent to your account email. Stay Focused sends through its notification service — it will not send mail from your personal inbox.</p>
        </div>
        <div style={{ borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', overflow: 'hidden' }}>
          {frequencyOptions.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFrequency(opt.id)}
              aria-pressed={frequency === opt.id}
              className="ui-interactive-card"
              data-hover="flat"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
                width: '100%',
                padding: '0.85rem 1rem',
                textAlign: 'left',
                background: 'transparent',
                cursor: 'pointer',
                borderBottom: i < frequencyOptions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</p>
                <p style={{ margin: '0.12rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{opt.description}</p>
              </div>
              <span style={{
                flexShrink: 0,
                fontSize: '11px',
                fontWeight: 700,
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                border: `1px solid ${frequency === opt.id ? 'color-mix(in srgb, var(--accent) 40%, var(--border-subtle) 60%)' : 'var(--border-subtle)'}`,
                background: frequency === opt.id ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-elevated) 88%)' : 'var(--surface-soft)',
                color: frequency === opt.id ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
                {frequency === opt.id ? 'Active' : 'Select'}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* resend.dev sender warning — admin only */}
      {isAdmin && isResendDevSender && (
        <div style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--radius-panel)', border: '1px solid color-mix(in srgb, var(--yellow, #ca8a04) 35%, var(--border-subtle) 65%)', background: 'color-mix(in srgb, var(--yellow, #ca8a04) 8%, var(--surface-base) 92%)' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600 }}>Resend test sender is limited</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
            <code style={{ fontFamily: 'monospace' }}>onboarding@resend.dev</code> can only deliver to your Resend account email. Verify a domain in Resend and update <code style={{ fontFamily: 'monospace' }}>EMAIL_FROM</code> before sending to other users.
          </p>
        </div>
      )}

      {/* Category toggles */}
      <section>
        <div style={{ marginBottom: '0.65rem' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Notification Types</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Choose what triggers an email.</p>
        </div>
        <div
          style={{
            borderRadius: 'var(--radius-panel)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--surface-base)',
            overflow: 'hidden',
            opacity: masterEnabled ? 1 : 0.45,
            pointerEvents: masterEnabled ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}
        >
          {([
            { key: 'due_soon' as const, label: 'Due soon', desc: 'Tasks and deadlines due within 48 hours.' },
            { key: 'new_uploads' as const, label: 'New uploads', desc: 'New modules, resources, or study materials.' },
            { key: 'announcements' as const, label: 'Announcements', desc: 'New Canvas announcements from your courses.' },
            { key: 'queue_completed' as const, label: 'Queue completed', desc: 'When a background job finishes.' },
            { key: 'canvas_updates' as const, label: 'Canvas updates digest', desc: 'Grouped digest of Canvas updates sent to your account email.' },
          ] as const).map(({ key, label, desc }, i, arr) => (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.5rem',
                padding: '0.85rem 1rem',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
                <p style={{ margin: '0.12rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{desc}</p>
              </div>
              <Toggle checked={categories[key]} onChange={() => toggleCategory(key)} disabled={!masterEnabled} />
            </div>
          ))}
        </div>
        {!masterEnabled && (
          <p style={{ margin: '0.5rem 0 0', fontSize: '12px', color: 'var(--text-muted)', paddingLeft: '0.1rem' }}>
            Select Instant or Daily digest above to enable email categories.
          </p>
        )}
      </section>

      {/* Canvas digest recipient */}
      {notificationEmailOptions.length > 0 && (
        <section>
          <div style={{ marginBottom: '0.65rem' }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Send Canvas update digests to</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Stay Focused sends email through its notification service. It will not send mail from your personal inbox.
            </p>
          </div>
          <div style={{ borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', overflow: 'hidden', opacity: sourceSaving ? 0.7 : 1, transition: 'opacity 0.15s' }}>
            {notificationEmailOptions.map((opt, i) => {
              const selected = opt.source === notificationEmailSource
              const canLink = !opt.available && (opt.source === 'linked_google' || opt.source === 'linked_microsoft') && isSupabaseAuthConfigured
              const disabled = !opt.available || sourceSaving
              return (
                <div
                  key={opt.source}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1.5rem',
                    padding: '0.85rem 1rem',
                    borderBottom: i < notificationEmailOptions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    opacity: opt.available ? 1 : 0.75,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</p>
                    <p style={{ margin: '0.12rem 0 0', fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.available && opt.email
                        ? opt.email
                        : (opt.disabledReason ?? 'Not available')}
                    </p>
                  </div>
                  {canLink ? (
                    <button
                      type="button"
                      onClick={() => handleLinkIdentity(opt.source as 'linked_google' | 'linked_microsoft')}
                      disabled={linkPending !== null}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.28rem 0.7rem',
                        borderRadius: 'var(--radius-control)',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--surface-soft)',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        cursor: linkPending !== null ? 'not-allowed' : 'pointer',
                        opacity: linkPending !== null ? 0.6 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {linkPending === opt.source
                        ? <Loader2 style={{ width: '11px', height: '11px', animation: 'spin 1s linear infinite' }} />
                        : null}
                      {linkPending === opt.source
                        ? 'Connecting...'
                        : opt.source === 'linked_google' ? 'Connect Google' : 'Connect Microsoft'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => opt.available && handleSourceChange(opt.source)}
                      aria-pressed={selected}
                      disabled={disabled}
                      className="ui-interactive-card"
                      data-hover="flat"
                      style={{
                        flexShrink: 0,
                        padding: '0.2rem 0.6rem',
                        borderRadius: '999px',
                        border: `1px solid ${selected ? 'color-mix(in srgb, var(--accent) 40%, var(--border-subtle) 60%)' : 'var(--border-subtle)'}`,
                        background: selected ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-elevated) 88%)' : 'var(--surface-soft)',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: selected ? 'var(--accent)' : 'var(--text-muted)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected ? 'Active' : 'Select'}
                    </button>
                  )}
                </div>
              )
            })}
            {linkError && (
              <p style={{ margin: '0.4rem 1rem', fontSize: '12px', color: 'var(--red)', fontWeight: 600 }}>
                {linkError}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="ui-button ui-button-primary"
          style={{ opacity: isPending ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {isPending && <Loader2 style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />}
          Save preferences
        </button>
        {saveState === 'saved' && (
          <span style={{ fontSize: '13px', color: 'var(--green, #16a34a)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <Check style={{ width: '14px', height: '14px' }} /> Saved
          </span>
        )}
        {saveState === 'error' && (
          <span style={{ fontSize: '13px', color: 'var(--red)' }}>Failed to save — try again.</span>
        )}
      </div>

      {/* Email test — admin only */}
      {isAdmin && <section>
        <div style={{ marginBottom: '0.65rem' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Test email</h3>
        </div>
        <div style={{ borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', padding: '0.85rem 1rem' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Send test email</p>
              <p style={{ margin: '0.12rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {emailProviderConfigured
                  ? `Send a test to ${activeDisplayEmail ?? 'your notification address'}.`
                  : 'Email notifications require a provider configured in Vercel environment variables.'}
              </p>
              {emailTestState.result && (
                <p style={{ margin: '0.3rem 0 0', fontSize: '11px', color: emailTestState.result.ok ? 'var(--green, #16a34a)' : 'var(--red)', fontWeight: 600 }}>
                  {emailTestState.result.message}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={!emailProviderConfigured || emailTestState.pending}
              onClick={handleEmailTest}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.8rem',
                borderRadius: 'var(--radius-control)',
                border: '1px solid var(--border-subtle)',
                background: 'var(--surface-soft)',
                fontSize: '12px',
                fontWeight: 600,
                color: emailProviderConfigured ? 'var(--text-primary)' : 'var(--text-muted)',
                cursor: emailProviderConfigured && !emailTestState.pending ? 'pointer' : 'not-allowed',
                opacity: emailProviderConfigured ? 1 : 0.5,
              }}
            >
              {emailTestState.pending
                ? <Loader2 style={{ width: '12px', height: '12px', animation: 'spin 1s linear infinite' }} />
                : <Send style={{ width: '12px', height: '12px' }} />}
              Send test
            </button>
          </div>
        </div>
      </section>}

      {/* In-app notification tests — dev mode only */}
      {SHOW_IN_APP_TESTS && (
        <section>
          <div style={{ marginBottom: '0.65rem' }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>In-app notification tests</h3>
            <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Dev/staging only — creates sample in-app notifications.</p>
          </div>
          <div style={{ borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', overflow: 'hidden' }}>
            {testNotificationTypes.map((t, i) => (
              <div
                key={t.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1.5rem',
                  padding: '0.75rem 1rem',
                  borderBottom: i < testNotificationTypes.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</p>
                <button
                  type="button"
                  onClick={() => handleTestNotification(t.key)}
                  disabled={testingKey === t.key}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    padding: '0.28rem 0.65rem',
                    borderRadius: 'var(--radius-control)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--surface-soft)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    cursor: testingKey === t.key ? 'not-allowed' : 'pointer',
                    opacity: testingKey === t.key ? 0.6 : 1,
                  }}
                >
                  {testingKey === t.key && <Loader2 style={{ width: '11px', height: '11px', animation: 'spin 1s linear infinite' }} />}
                  Send
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
