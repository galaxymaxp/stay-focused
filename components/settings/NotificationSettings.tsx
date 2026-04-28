'use client'

import { useState, useTransition } from 'react'
import { Mail, Check, Loader2, FlaskConical, Send } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsSection, SettingsRow } from './SettingsSection'
import { cn } from '@/lib/cn'
import { updateEmailPreferences, type EmailCategories } from '@/actions/user-settings'
import { createTestNotificationAction } from '@/actions/notifications'
import { dispatchInAppToast } from '@/lib/notifications'

type FrequencyOption = 'off' | 'instant' | 'daily_digest'

const frequencyOptions: { id: FrequencyOption; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No email notifications' },
  { id: 'instant', label: 'Instant', description: 'As soon as it happens' },
  { id: 'daily_digest', label: 'Daily digest', description: 'One email per day' },
]

const testNotificationTypes: { key: string; label: string }[] = [
  { key: 'queue_completed', label: 'Queue completed' },
  { key: 'due_soon', label: 'Due soon task' },
  { key: 'new_upload', label: 'New upload' },
  { key: 'announcement', label: 'Announcement' },
  { key: 'sync_completed', label: 'Sync completed' },
]

const SHOW_TEST_TOOLS =
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

  return (
    <div className="space-y-6">
      {/* Email address display */}
      {notificationEmail && (
        <div className="rounded-xl border border-sf-border bg-sf-surface-2 px-4 py-3 flex items-center gap-2.5">
          <Mail className="h-4 w-4 text-sf-muted flex-shrink-0" />
          <div>
            <p className="text-xs text-sf-muted">Notifications sent to</p>
            <p className="text-sm font-medium text-sf-text">{notificationEmail}</p>
          </div>
        </div>
      )}

      {/* Delivery frequency */}
      <SettingsSection
        title="Email Notifications"
        description="Choose how often Stay Focused emails you about activity."
      >
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {frequencyOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setFrequency(opt.id)}
                className={cn(
                  'flex flex-col items-start rounded-xl border p-4 text-left transition-all',
                  frequency === opt.id
                    ? 'border-sf-accent bg-sf-accent-light'
                    : 'border-sf-border bg-sf-surface hover:bg-sf-surface-2',
                )}
              >
                <div className="flex items-center justify-between w-full mb-1.5">
                  <p className={cn('text-sm font-medium', frequency === opt.id ? 'text-sf-accent' : 'text-sf-text')}>
                    {opt.label}
                  </p>
                  {frequency === opt.id && (
                    <div className="h-4 w-4 rounded-full bg-sf-accent flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-sf-muted">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Per-category toggles */}
      <SettingsSection
        title="Notification Types"
        description="Choose what triggers an email."
      >
        <div className={cn('transition-opacity', !masterEnabled && 'opacity-40 pointer-events-none')}>
          <SettingsRow label="Due soon" description="Tasks and deadlines due within 48 hours.">
            <Toggle checked={categories.due_soon} onChange={() => toggleCategory('due_soon')} disabled={!masterEnabled} />
          </SettingsRow>
          <SettingsRow label="New uploads" description="New modules, resources, or study materials.">
            <Toggle checked={categories.new_uploads} onChange={() => toggleCategory('new_uploads')} disabled={!masterEnabled} />
          </SettingsRow>
          <SettingsRow label="Announcements" description="New Canvas announcements from your courses.">
            <Toggle checked={categories.announcements} onChange={() => toggleCategory('announcements')} disabled={!masterEnabled} />
          </SettingsRow>
          <SettingsRow label="Queue completed" description="When a background job finishes." border={false}>
            <Toggle checked={categories.queue_completed} onChange={() => toggleCategory('queue_completed')} disabled={!masterEnabled} />
          </SettingsRow>
        </div>

        {!masterEnabled && (
          <div className="px-6 py-3 border-t border-sf-border">
            <p className="text-xs text-sf-muted">Select Instant or Daily digest above to enable email categories.</p>
          </div>
        )}
      </SettingsSection>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-sf-accent text-white hover:bg-sf-accent-hover transition-colors', isPending && 'opacity-70 cursor-not-allowed')}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preferences
        </button>
        {saveState === 'saved' && <span className="text-sm text-green-600 font-medium flex items-center gap-1.5"><Check className="h-4 w-4" /> Saved</span>}
        {saveState === 'error' && <span className="text-sm text-red-500">Failed to save — try again.</span>}
      </div>

      {/* Test notification tools — dev / flag only */}
      {SHOW_TEST_TOOLS && (
        <SettingsSection
          title="Test Notifications"
          description={`Create sample in-app notifications. Visible because NODE_ENV=development or NEXT_PUBLIC_ENABLE_NOTIFICATION_TESTS=true.`}
        >
          <div className={cn('transition-opacity')}>
            {testNotificationTypes.map((t, i) => (
              <SettingsRow
                key={t.key}
                label={t.label}
                description={`Create a sample ${t.label.toLowerCase()} notification.`}
                border={i < testNotificationTypes.length - 1}
              >
                <button
                  onClick={() => handleTestNotification(t.key)}
                  disabled={testingKey === t.key}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-sf-border bg-sf-surface hover:bg-sf-surface-2 transition-colors disabled:opacity-60"
                >
                  {testingKey === t.key
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <FlaskConical className="h-3 w-3" />}
                  Send
                </button>
              </SettingsRow>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-sf-border flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-sf-text flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5 text-sf-muted" /> Test email
              </p>
              <p className="text-xs text-sf-muted mt-0.5">
                {emailProviderConfigured ? 'Send a test email to your notification address.' : 'Email provider not configured.'}
              </p>
            </div>
            <button
              disabled={!emailProviderConfigured}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-sf-border bg-sf-surface hover:bg-sf-surface-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              title={emailProviderConfigured ? undefined : 'Email provider not configured'}
            >
              Send email
            </button>
          </div>
        </SettingsSection>
      )}
    </div>
  )
}
