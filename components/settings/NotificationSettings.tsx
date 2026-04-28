'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { updateEmailPreferences, type EmailCategories } from '@/actions/user-settings'
import { createTestNotificationAction, sendTestEmailAction } from '@/actions/notifications'
import { dispatchInAppToast } from '@/lib/notifications'

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
  emailProviderConfigured?: boolean
}

export function NotificationSettings({
  initialEmailNotifications,
  initialEmailCategories,
  notificationEmail,
  emailProviderConfigured = false,
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

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>

      {/* Email address */}
      {notificationEmail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem 0.85rem', borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-soft)' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Notifications sent to</p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {notificationEmail}
            </p>
          </div>
        </div>
      )}

      {/* Delivery frequency */}
      <section>
        <div style={{ marginBottom: '0.65rem' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Email Notifications</h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Choose how often Stay Focused emails you about activity.</p>
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

      {/* Email test — always visible, disabled when provider not configured */}
      <section>
        <div style={{ marginBottom: '0.65rem' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Test email</h3>
        </div>
        <div style={{ borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-subtle)', background: 'var(--surface-base)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', padding: '0.85rem 1rem' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Send test email</p>
              <p style={{ margin: '0.12rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                {emailProviderConfigured
                  ? `Send a test to ${notificationEmail ?? 'your notification address'}.`
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
      </section>

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
