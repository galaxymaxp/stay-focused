'use client'

import { useState, useTransition } from 'react'
import { Mail, Check, Loader2 } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsSection, SettingsRow } from './SettingsSection'
import { updateEmailPreferences, type EmailCategories } from '@/actions/user-settings'
import { cn } from '@/lib/cn'

type FrequencyOption = 'off' | 'instant' | 'daily_digest'

const frequencyOptions: { id: FrequencyOption; label: string; description: string }[] = [
  { id: 'off', label: 'Off', description: 'No email notifications' },
  { id: 'instant', label: 'Instant', description: 'As soon as it happens' },
  { id: 'daily_digest', label: 'Daily digest', description: 'One summary per day' },
]

interface Props {
  initialEmailNotifications: FrequencyOption
  initialEmailCategories: EmailCategories
  notificationEmail: string | null
}

export function NotificationSettings({
  initialEmailNotifications,
  initialEmailCategories,
  notificationEmail,
}: Props) {
  const [frequency, setFrequency] = useState<FrequencyOption>(initialEmailNotifications)
  const [categories, setCategories] = useState<EmailCategories>(initialEmailCategories)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isPending, startTransition] = useTransition()

  const masterEnabled = frequency !== 'off'

  function toggleCategory(key: keyof EmailCategories) {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleFrequencyChange(f: FrequencyOption) {
    setFrequency(f)
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

  return (
    <div className="space-y-6">
      {/* Email address */}
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
        description="Choose how often you want Stay Focused to email you."
      >
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {frequencyOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleFrequencyChange(opt.id)}
                className={cn(
                  'flex flex-col items-start rounded-xl border p-4 text-left transition-all',
                  frequency === opt.id
                    ? 'border-sf-accent bg-sf-accent-light'
                    : 'border-sf-border bg-sf-surface hover:border-sf-border hover:bg-sf-surface-2',
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
        title="Notification Categories"
        description="Choose what you want to be emailed about."
      >
        <div className={cn('transition-opacity', !masterEnabled && 'opacity-40 pointer-events-none')}>
          <SettingsRow label="Due soon" description="Tasks and deadlines due within 48 hours.">
            <Toggle
              checked={categories.due_soon}
              onChange={() => toggleCategory('due_soon')}
              disabled={!masterEnabled}
            />
          </SettingsRow>
          <SettingsRow label="New uploads" description="New modules, resources, or study materials.">
            <Toggle
              checked={categories.new_uploads}
              onChange={() => toggleCategory('new_uploads')}
              disabled={!masterEnabled}
            />
          </SettingsRow>
          <SettingsRow label="Announcements" description="New Canvas announcements from your courses.">
            <Toggle
              checked={categories.announcements}
              onChange={() => toggleCategory('announcements')}
              disabled={!masterEnabled}
            />
          </SettingsRow>
          <SettingsRow label="Queue completed" description="When a background job finishes." border={false}>
            <Toggle
              checked={categories.queue_completed}
              onChange={() => toggleCategory('queue_completed')}
              disabled={!masterEnabled}
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-sf-accent text-white hover:bg-sf-accent-hover',
            isPending && 'opacity-70 cursor-not-allowed',
          )}
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save preferences
        </button>
        {saveState === 'saved' && (
          <span className="text-sm text-green-600 font-medium flex items-center gap-1.5">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {saveState === 'error' && (
          <span className="text-sm text-red-500">Failed to save — try again.</span>
        )}
      </div>

      {!masterEnabled && (
        <div className="rounded-2xl border border-sf-border bg-sf-surface-2 p-5">
          <p className="text-sm font-medium text-sf-muted">Email notifications are off.</p>
          <p className="text-xs text-sf-subtle mt-1">Select Instant or Daily digest above to start receiving updates.</p>
        </div>
      )}
    </div>
  )
}
