'use client'

import { useState } from 'react'
import { User, RefreshCw, Bell, Sliders, Bot, ChevronRight } from 'lucide-react'
import { SettingsSection, SettingsRow } from '@/components/settings/SettingsSection'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/lib/cn'

type Section = 'account' | 'canvas' | 'notifications' | 'preferences' | 'ai'

const sections: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'canvas', label: 'Canvas Sync', icon: RefreshCw },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'preferences', label: 'Preferences', icon: Sliders },
  { id: 'ai', label: 'AI Providers', icon: Bot },
]

function AccountSection() {
  return (
    <SettingsSection title="Account" description="Manage your identity and authentication.">
      <SettingsRow label="Name" description="Alex Student" />
      <SettingsRow label="Email" description="alex@university.edu" />
      <SettingsRow label="Institution" description="State University · Spring 2026" />
      <div className="px-6 py-4 flex items-center justify-between border-t border-sf-border">
        <div>
          <p className="text-sm font-medium text-sf-error">Sign out</p>
          <p className="text-xs text-sf-muted mt-0.5">You will need to sign in again to access Stay Focused.</p>
        </div>
        <button className="rounded-xl border border-sf-error/30 px-4 py-2 text-sm font-medium text-sf-error hover:bg-sf-error-bg transition-colors">
          Sign out
        </button>
      </div>
    </SettingsSection>
  )
}

function CanvasSection() {
  return (
    <div className="space-y-6">
      <SettingsSection title="Canvas Sync" description="Connect Stay Focused to your Canvas LMS account.">
        <div className="px-6 py-5 flex items-start gap-4 border-b border-sf-border">
          <div className="h-10 w-10 rounded-xl bg-sf-success-bg flex items-center justify-center flex-shrink-0">
            <RefreshCw className="h-5 w-5 text-sf-success" />
          </div>
          <div>
            <p className="text-sm font-semibold text-sf-text">Connected</p>
            <p className="text-xs text-sf-muted mt-0.5">Last synced 2 hours ago · 5 courses active</p>
          </div>
        </div>
        <SettingsRow label="Auto-sync" description="Sync courses and tasks automatically every hour.">
          <Toggle checked={true} onChange={() => {}} />
        </SettingsRow>
        <SettingsRow label="Sync on launch" description="Perform a sync when you open the app." border={false}>
          <Toggle checked={true} onChange={() => {}} />
        </SettingsRow>
      </SettingsSection>

      <div className="rounded-2xl border border-sf-border bg-sf-surface p-5">
        <p className="text-xs font-semibold text-sf-text mb-1">Canvas API Token</p>
        <p className="text-xs text-sf-muted mb-3">Your token is encrypted and stored securely.</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg border border-sf-border bg-sf-surface-2 px-3 py-2 font-mono text-xs text-sf-muted">
            ••••••••••••••••••••••••••••••••
          </div>
          <button className="rounded-lg border border-sf-border px-3 py-2 text-xs font-medium text-sf-muted hover:bg-sf-surface-2 transition-colors">
            Replace
          </button>
        </div>
      </div>
    </div>
  )
}

function PreferencesSection() {
  return (
    <SettingsSection title="Preferences" description="Customize how Stay Focused looks and behaves.">
      <SettingsRow label="Compact task list" description="Show more tasks with reduced row height.">
        <Toggle checked={false} onChange={() => {}} />
      </SettingsRow>
      <SettingsRow label="Show completed tasks" description="Include completed tasks in task lists." border={false}>
        <Toggle checked={true} onChange={() => {}} />
      </SettingsRow>
    </SettingsSection>
  )
}

function AISection() {
  const providers = [
    { id: 'claude', name: 'Claude (Anthropic)', description: 'Default · claude-sonnet-4-6', available: true, active: true },
    { id: 'openai', name: 'OpenAI', description: 'GPT-4o, o3', available: false, active: false },
    { id: 'gemini', name: 'Gemini (Google)', description: 'Gemini 2.5 Pro', available: false, active: false },
    { id: 'nemotron', name: 'Nemotron (NVIDIA)', description: 'Coming soon', available: false, active: false },
  ]

  return (
    <div className="space-y-6">
      <SettingsSection title="AI Provider" description="Choose which AI model powers your draft generation and study tools.">
        <div className="p-4 space-y-2">
          {providers.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-center gap-4 rounded-xl border p-4 transition-all',
                p.active ? 'border-sf-accent bg-sf-accent-light' : 'border-sf-border bg-sf-surface',
                !p.available && 'opacity-50',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm font-medium', p.active ? 'text-sf-accent' : 'text-sf-text')}>{p.name}</p>
                  {!p.available && (
                    <span className="text-[10px] font-medium text-sf-muted border border-sf-border rounded-full px-2 py-0.5">Coming soon</span>
                  )}
                </div>
                <p className="text-xs text-sf-muted mt-0.5">{p.description}</p>
              </div>
              {p.active && (
                <div className="h-2 w-2 rounded-full bg-sf-accent flex-shrink-0" />
              )}
              {!p.active && p.available && (
                <button className="text-xs font-medium text-sf-accent hover:underline flex-shrink-0">Select</button>
              )}
            </div>
          ))}
        </div>
      </SettingsSection>

      <div className="rounded-2xl border border-sf-border bg-sf-surface-2 p-5">
        <p className="text-xs font-semibold text-sf-text mb-1">Per-generation override</p>
        <p className="text-xs text-sf-muted">
          You&apos;ll be able to select a different AI model for individual drafts in a future update.
          The default provider above is used for all generations currently.
        </p>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('account')

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-sf-text">Settings</h1>
        <p className="text-sm text-sf-muted mt-1">Manage your account, integrations, and preferences</p>
      </div>

      <div className="flex gap-8 items-start">
        {/* Settings nav */}
        <nav className="w-44 flex-shrink-0 hidden md:block">
          <div className="space-y-0.5">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-left transition-colors',
                  activeSection === id
                    ? 'bg-sf-accent-light text-sf-accent font-medium'
                    : 'text-sf-muted hover:bg-sf-surface hover:text-sf-text',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile section nav */}
        <div className="md:hidden w-full mb-6">
          <div className="flex flex-wrap gap-2">
            {sections.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors border',
                  activeSection === id
                    ? 'bg-sf-accent text-white border-sf-accent'
                    : 'bg-sf-surface text-sf-muted border-sf-border hover:border-sf-border',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeSection === 'account' && <AccountSection />}
          {activeSection === 'canvas' && <CanvasSection />}
          {activeSection === 'notifications' && <NotificationSettings />}
          {activeSection === 'preferences' && <PreferencesSection />}
          {activeSection === 'ai' && <AISection />}
        </div>
      </div>
    </div>
  )
}
