'use client'

import { useId, useState } from 'react'
import type { LearnSection } from '@/lib/module-workspace'

export function StudyModeSwitcher({
  modes,
  summaryLabel = 'Study modes',
}: {
  modes: LearnSection[]
  summaryLabel?: string
}) {
  const [activeModeId, setActiveModeId] = useState<string | null>(null)
  const panelId = useId()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        {modes.map((mode) => {
          const active = mode.id === activeModeId

          return (
            <button
              key={mode.id}
              type="button"
              className={active ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
              aria-expanded={active}
              aria-controls={panelId}
              onClick={() => setActiveModeId((current) => current === mode.id ? null : mode.id)}
              style={{ cursor: 'pointer' }}
            >
              {mode.title}
            </button>
          )
        })}
      </div>

      {activeModeId ? (
        <section
          id={panelId}
          className="ui-card-soft"
          style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem' }}
        >
          {modes
            .filter((mode) => mode.id === activeModeId)
            .map((mode) => (
              <div key={mode.id}>
                <p className="ui-kicker">{mode.title}</p>
                <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {mode.body.split('\n').filter(Boolean).map((paragraph, index) => (
                    <p
                      key={`${mode.id}-${index}`}
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        lineHeight: 1.7,
                        color: index === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      }}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
        </section>
      ) : (
        <div
          className="ui-card-soft"
          style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.95rem', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}
        >
          {summaryLabel}. Open one mode at a time to keep this resource compact.
        </div>
      )}
    </div>
  )
}
