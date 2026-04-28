'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Mail, FlaskConical, Send } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { updateEmailPreferences, type EmailCategories } from '@/actions/user-settings'
import { createTestNotificationAction } from '@/actions/notifications'
import { dispatchInAppToast } from '@/lib/notifications'

type FrequencyOption = 'off' | 'instant' | 'daily_digest'

const frequencyOptions: { id: FrequencyOption; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No email notifications' },
  { id: 'instant', label: 'Instant', description: 'As soon as it happens' },
  { id: 'daily_digest', label: 'Daily digest', description: 'One summary per day' },
]

const testNotificationTypes: { key: string; label: string }[] = [
  { key: 'queue_completed', label: 'Queue completed' },
  { key: 'due_soon', label: 'Due soon task' },
  { key: 'new_upload', label: 'New upload' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'sync_completed', label: 'Sync completed' },
]

const SHOW_TEST_TOOLS = process.env.NEXT_PUBLIC_ENABLE_NOTIFICATION_TESTS === 'true'

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
  const [testEmailPending, setTestEmailPending] = useState(false)

  const masterEnabled = frequency !== 'off'

  function toggleCategory(key: keyof EmailCategories) {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSave() {
    startTransition(async () => {
      const result = await updateEmailPreferences({
        emailNotifications: frequency,
        emailCategories: categories,
      })
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

  async function handleTestEmail() {
    if (testEmailPending) return
    setTestEmailPending(true)
    try {
      dispatchInAppToast({ title: 'Test email queued', description: 'Email sending is not yet implemented.', tone: 'info' })
    } finally {
      setTestEmailPending(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1.6rem' }}>

      {/* Email address */}
      {notificationEmail && (
        <div className="settings-option-row ui-interactive-card" style={{ cursor: 'default' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
            <Mail style={{ width: '1rem', height: '1rem', flexShrink: 0, color: 'var(--text-muted)' }} />
            <div style={{ minWidth: 0 }}>
              <p className="settings-card-title">Notifications email</p>
              <p className="settings-card-desc">{notificationEmail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Delivery frequency */}
      <section className="settings-section">
        <div className="settings-section-header">
          <p className="ui-kicker">Email Notifications</p>
          <h2 className="settings-section-title">Delivery frequency</h2>
          <p className="settings-section-desc">Choose how often Stay Focused emails you about activity.</p>
        </div>
        <div className="settings-section-body">
          <div className="settings-option-list">
            {frequencyOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setFrequency(opt.id)}
                aria-pressed={frequency === opt.id}
                className="settings-option-row ui-interactive-card"
              >
                <div style={{ minWidth: 0 }}>
                  <p className="settings-card-title">{opt.label}</p>
                  <p className="settings-card-desc">{opt.description}</p>
                </div>
                <span
                  className="settings-option-label"
                  data-selected={frequency === opt.id ? 'true' : 'false'}
                >
                  {frequency === opt.id ? 'Selected' : 'Select'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Per-category toggles */}
      <section className="settings-section">
        <div className="settings-section-header">
          <p className="ui-kicker">Categories</p>
          <h2 className="settings-section-title">Notification categories</h2>
          <p className="settings-section-desc">Choose what triggers an email.</p>
        </div>
        <div className="settings-section-body">
          <div
            className="settings-option-list"
            style={{ opacity: masterEnabled ? 1 : 0.4, pointerEvents: masterEnabled ? undefined : 'none', transition: 'opacity 0.15s' }}
          >
            <CategoryRow
              label="Due soon"
              description="Tasks and deadlines due within 48 hours."
              checked={categories.due_soon}
              disabled={!masterEnabled}
              onChange={() => toggleCategory('due_soon')}
            />
            <CategoryRow
              label="New uploads"
              description="New modules, resources, or study materials."
              checked={categories.new_uploads}
              disabled={!masterEnabled}
              onChange={() => toggleCategory('new_uploads')}
            />
            <CategoryRow
              label="Announcements"
              description="New Canvas announcements from your courses."
              checked={categories.announcements}
              disabled={!masterEnabled}
              onChange={() => toggleCategory('announcements')}
            />
            <CategoryRow
              label="Queue completed"
              description="When a background job finishes."
              checked={categories.queue_completed}
              disabled={!masterEnabled}
              onChange={() => toggleCategory('queue_completed')}
              last
            />
          </div>

          {!masterEnabled && (
            <div style={{ padding: '0.9rem 1rem', borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)' }}>
              <p className="settings-card-desc">Email notifications are off. Select Instant or Daily digest above to start receiving updates.</p>
            </div>
          )}
        </div>
      </section>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="ui-button ui-button-primary"
        >
          {isPending && <Loader2 style={{ width: '1rem', height: '1rem', display: 'inline-block', marginRight: '0.4rem', verticalAlign: 'middle' }} className="animate-spin" />}
          Save preferences
        </button>
        {saveState === 'saved' && (
          <span style={{ fontSize: '13px', color: 'var(--green)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Check style={{ width: '1rem', height: '1rem' }} /> Saved
          </span>
        )}
        {saveState === 'error' && (
          <span style={{ fontSize: '13px', color: 'var(--red)' }}>Failed to save — try again.</span>
        )}
      </div>

      {/* Test notifications — dev/flag only */}
      {(SHOW_TEST_TOOLS || process.env.NODE_ENV === 'development') && (
        <section className="settings-section">
          <div className="settings-section-header">
            <p className="ui-kicker" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FlaskConical style={{ width: '0.85rem', height: '0.85rem' }} />
              Dev tools
            </p>
            <h2 className="settings-section-title">Test notifications</h2>
            <p className="settings-section-desc">
              Create sample in-app notifications to preview how they appear. Only visible in development or when{' '}
              <code style={{ fontSize: '11px', background: 'color-mix(in srgb, var(--surface-soft) 80%, transparent)', borderRadius: '3px', padding: '0 4px' }}>
                NEXT_PUBLIC_ENABLE_NOTIFICATION_TESTS=true
              </code>.
            </p>
          </div>
          <div className="settings-section-body">
            <div className="settings-option-list">
              {testNotificationTypes.map((t) => (
                <div key={t.key} className="settings-option-row ui-interactive-card" style={{ cursor: 'default' }}>
                  <div style={{ minWidth: 0 }}>
                    <p className="settings-card-title">{t.label}</p>
                    <p className="settings-card-desc">Creates a sample {t.label.toLowerCase()} notification.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestNotification(t.key)}
                    disabled={testingKey === t.key}
                    className="ui-button ui-button-ghost"
                    style={{ padding: '4px 12px', fontSize: '12px', flexShrink: 0 }}
                  >
                    {testingKey === t.key ? (
                      <Loader2 style={{ width: '0.85rem', height: '0.85rem', display: 'inline-block' }} className="animate-spin" />
                    ) : 'Send'}
                  </button>
                </div>
              ))}

              {/* Email test row */}
              <div className="settings-option-row ui-interactive-card" style={{ cursor: 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <Send style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0, color: 'var(--text-muted)' }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="settings-card-title">Test email</p>
                    <p className="settings-card-desc">
                      {emailProviderConfigured
                        ? 'Send a test email to your notification address.'
                        : 'Email provider not configured.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={!emailProviderConfigured || testEmailPending}
                  className="ui-button ui-button-ghost"
                  style={{ padding: '4px 12px', fontSize: '12px', flexShrink: 0, opacity: emailProviderConfigured ? 1 : 0.45 }}
                  title={emailProviderConfigured ? undefined : 'Email provider not configured'}
                >
                  {testEmailPending ? (
                    <Loader2 style={{ width: '0.85rem', height: '0.85rem', display: 'inline-block' }} className="animate-spin" />
                  ) : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function CategoryRow({
  label,
  description,
  checked,
  disabled,
  onChange,
  last = false,
}: {
  label: string
  description: string
  checked: boolean
  disabled: boolean
  onChange: () => void
  last?: boolean
}) {
  return (
    <div
      className="settings-option-row ui-interactive-card"
      style={{ cursor: 'default', borderBottom: last ? 'none' : undefined }}
    >
      <div style={{ minWidth: 0 }}>
        <p className="settings-card-title">{label}</p>
        <p className="settings-card-desc">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  )
}
