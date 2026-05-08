'use client'

import { useActionState } from 'react'
import {
  getNotificationLabInitialState,
  NOTIFICATION_LAB_PRESETS,
  runNotificationLabAction,
} from '@/actions/admin-notification-lab'

export function NotificationLab() {
  const [state, formAction, pending] = useActionState(
    runNotificationLabAction,
    getNotificationLabInitialState(),
  )

  return (
    <section className="motion-card" style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <p className="ui-kicker">Admin</p>
        <h1 className="ui-page-title" style={{ margin: 0 }}>Notification Lab</h1>
        <p className="ui-page-copy" style={{ margin: 0 }}>
          Insert one realistic notification event and run the same Resend email path the external Canvas sync uses.
        </p>
      </div>

      <div className="settings-option-list">
        {NOTIFICATION_LAB_PRESETS.map((preset) => (
          <form key={preset.key} action={formAction} style={{ margin: 0 }}>
            <input type="hidden" name="presetKey" value={preset.key} />
            <button
              type="submit"
              className="settings-option-row ui-interactive-card"
              disabled={pending}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <div style={{ minWidth: 0 }}>
                <p className="settings-card-title">{preset.label}</p>
                <p className="settings-card-desc">Insert the event, then attempt immediate delivery with current notification settings.</p>
              </div>
              <span className="settings-option-label" data-selected="false">
                {pending ? 'Running' : 'Send'}
              </span>
            </button>
          </form>
        ))}
      </div>

      <div className="settings-profile-card" aria-live="polite">
        <p className="settings-card-title">Latest result</p>
        {!state.presetLabel && !state.error ? (
          <p className="settings-card-desc" style={{ marginBottom: 0 }}>No test event has run yet.</p>
        ) : null}
        {state.error ? (
          <p className="settings-card-error" style={{ marginBottom: 0 }}>{state.error}</p>
        ) : null}
        {state.presetLabel ? (
          <dl style={{ margin: 0, display: 'grid', gap: '0.45rem' }}>
            <ResultRow label="Preset" value={state.presetLabel} />
            <ResultRow
              label="Event"
              value={state.eventInserted ? 'inserted' : state.eventSkipped ? 'skipped' : 'unknown'}
            />
            <ResultRow
              label="Email"
              value={state.emailSent ? 'sent' : state.emailSkipped ? 'skipped' : state.emailFailed ? 'failed' : 'unknown'}
            />
            <ResultRow label="Recipient" value={state.recipient ?? 'none'} />
            <ResultRow label="Skip reason" value={state.skipReason ?? 'none'} />
            <ResultRow label="Resend configured" value={state.resendConfigured ? 'yes' : 'no'} />
          </dl>
        ) : null}
      </div>
    </section>
  )
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: '0.6rem' }}>
      <dt style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  )
}
