'use client'

import { useState } from 'react'
import { Mail, Check, Pencil } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { SettingsSection, SettingsRow } from './SettingsSection'
import { cn } from '@/lib/cn'

type Frequency = 'instant' | 'daily' | 'important'

const frequencyOptions: { id: Frequency; label: string; description: string }[] = [
  { id: 'instant', label: 'Instant', description: 'As soon as it happens' },
  { id: 'daily', label: 'Daily digest', description: 'One email per day' },
  { id: 'important', label: 'Important only', description: 'High-priority items only' },
]

export function NotificationSettings() {
  const [masterEnabled, setMasterEnabled] = useState(true)
  const [newTasks, setNewTasks] = useState(true)
  const [newMaterials, setNewMaterials] = useState(true)
  const [nearingDeadlines, setNearingDeadlines] = useState(true)
  const [frequency, setFrequency] = useState<Frequency>('daily')
  const [editingEmail, setEditingEmail] = useState(false)
  const [email, setEmail] = useState('alex@university.edu')

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <SettingsSection
        title="Email Notifications"
        description="Receive updates about your courses and deadlines by email."
      >
        <SettingsRow
          label="Email notifications"
          description="Enable or disable all email notifications from Stay Focused."
        >
          <Toggle checked={masterEnabled} onChange={setMasterEnabled} />
        </SettingsRow>

        {/* Email address */}
        <div className={cn('px-6 py-4 border-b border-sf-border transition-opacity', !masterEnabled && 'opacity-40 pointer-events-none')}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-sf-text">Destination email</p>
              <p className="text-xs text-sf-muted mt-0.5">Notifications will be sent to this address.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!editingEmail ? (
                <>
                  <div className="flex items-center gap-2 rounded-lg bg-sf-surface-2 px-3 py-1.5 border border-sf-border">
                    <Mail className="h-3.5 w-3.5 text-sf-muted" />
                    <span className="text-sm text-sf-text">{email}</span>
                  </div>
                  <button
                    onClick={() => setEditingEmail(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors border border-sf-border"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg border border-sf-accent px-3 py-1.5 text-sm text-sf-text bg-sf-surface focus:outline-none focus:ring-2 focus:ring-sf-accent/30 w-56"
                    autoFocus
                  />
                  <button
                    onClick={() => setEditingEmail(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-sf-accent text-white hover:bg-sf-accent-hover transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Per-type toggles */}
      <SettingsSection
        title="Notification Types"
        description="Choose what you want to be notified about."
      >
        <div className={cn('transition-opacity', !masterEnabled && 'opacity-40 pointer-events-none')}>
          <SettingsRow
            label="New tasks"
            description="When new assignments or labs are posted to your courses."
          >
            <Toggle checked={newTasks} onChange={setNewTasks} disabled={!masterEnabled} />
          </SettingsRow>

          <SettingsRow
            label="New learning material"
            description="When new modules, lessons, or readings are available."
          >
            <Toggle checked={newMaterials} onChange={setNewMaterials} disabled={!masterEnabled} />
          </SettingsRow>

          <SettingsRow
            label="Nearing deadlines"
            description="Reminders when assignments are due within 48 hours."
            border={false}
          >
            <Toggle checked={nearingDeadlines} onChange={setNearingDeadlines} disabled={!masterEnabled} />
          </SettingsRow>
        </div>
      </SettingsSection>

      {/* Frequency */}
      <SettingsSection
        title="Delivery Style"
        description="How often should we send you notification emails?"
      >
        <div className={cn('p-4 transition-opacity', !masterEnabled && 'opacity-40 pointer-events-none')}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {frequencyOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => !masterEnabled || setFrequency(opt.id)}
                disabled={!masterEnabled}
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

      {/* Status preview */}
      {masterEnabled && (
        <div className="rounded-2xl border border-sf-success-bg bg-sf-success-bg/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-7 w-7 rounded-full bg-sf-success flex items-center justify-center">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-sm font-semibold text-sf-success">Notifications active</p>
          </div>
          <p className="text-xs text-sf-muted ml-10">
            Sending to <strong className="text-sf-text">{email}</strong> ·{' '}
            {[newTasks && 'new tasks', newMaterials && 'new materials', nearingDeadlines && 'deadlines']
              .filter(Boolean)
              .join(', ')}{' '}
            · {frequencyOptions.find((o) => o.id === frequency)?.label}
          </p>
        </div>
      )}

      {!masterEnabled && (
        <div className="rounded-2xl border border-sf-border bg-sf-surface-2 p-5">
          <p className="text-sm font-medium text-sf-muted">Email notifications are disabled.</p>
          <p className="text-xs text-sf-subtle mt-1">Enable the toggle above to start receiving updates.</p>
        </div>
      )}
    </div>
  )
}
