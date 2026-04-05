'use client'

import type { CSSProperties } from 'react'
import { useThemeSettings } from '@/components/ThemeProvider'
import { ACCENT_OPTIONS, type AccentName, type ThemeMode } from '@/lib/theme'

const MODE_OPTIONS: { value: ThemeMode; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Keep the interface bright and clean.' },
  { value: 'dark', label: 'Dark', description: 'Use a darker look for lower-glare studying.' },
  { value: 'system', label: 'System', description: 'Follow your device preference automatically.' },
]

export function SettingsPage() {
  const { mode, accent, resolvedTheme, setMode, setAccent } = useThemeSettings()

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <section className="motion-card glass-panel glass-accent" style={heroStyle}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-foreground)' }}>
          Settings
        </p>
        <h1 style={{ margin: '0.45rem 0 0', fontSize: '32px', lineHeight: 1.08, letterSpacing: '-0.04em', fontWeight: 650, color: 'var(--text-primary)' }}>Personalize the study atmosphere</h1>
        <p style={{ margin: '0.7rem 0 0', fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: '56ch' }}>
          Adjust appearance for your own study style. Theme mode and accent color are applied across the app through the same centralized design tokens.
        </p>
      </section>

      <section className="motion-card motion-delay-1 glass-panel glass-strong" style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <p style={eyebrowStyle}>Appearance</p>
          <h2 style={{ margin: 0, fontSize: '22px', lineHeight: 1.15, letterSpacing: '-0.03em', fontWeight: 650, color: 'var(--text-primary)' }}>Theme mode</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Choose whether the app stays light, stays dark, or follows your system setting. Current resolved theme: <strong style={{ color: 'var(--text-primary)' }}>{resolvedTheme}</strong>.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {MODE_OPTIONS.map((option) => {
            const selected = option.value === mode

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                className="glass-panel glass-hover"
                style={{
                  '--glass-panel-bg': selected ? 'color-mix(in srgb, var(--surface-selected) 86%, var(--accent) 14%)' : 'var(--glass-surface-soft)',
                  '--glass-panel-border': selected ? 'var(--accent-border)' : 'var(--glass-border)',
                  '--glass-panel-shadow': selected ? 'var(--glass-shadow-strong)' : 'var(--glass-shadow)',
                  '--glass-panel-glow': 'none',
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 'var(--radius-panel)',
                  padding: '0.95rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                } as CSSProperties}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>{option.label}</div>
                  <div style={{ marginTop: '0.25rem', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {option.description}
                  </div>
                </div>
                <span className={selected ? 'ui-chip ui-chip-selected' : 'ui-chip'} style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: 'var(--radius-pill)',
                  padding: '0.35rem 0.55rem',
                }}>
                  {selected ? 'Selected' : 'Choose'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="motion-card motion-delay-2 glass-panel glass-strong" style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <p style={eyebrowStyle}>Accent</p>
          <h2 style={{ margin: 0, fontSize: '22px', lineHeight: 1.15, letterSpacing: '-0.03em', fontWeight: 650, color: 'var(--text-primary)' }}>Highlight color</h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Pick the accent that appears on buttons, highlights, chips, and supporting emphasis across the interface. Yellow stays the default.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: '0.75rem' }}>
          {Object.entries(ACCENT_OPTIONS).map(([name, palette]) => {
            const selected = name === accent

            return (
              <button
                key={name}
                type="button"
                onClick={() => setAccent(name as AccentName)}
                className="glass-panel glass-hover"
                style={{
                  '--glass-panel-bg': selected ? 'color-mix(in srgb, var(--glass-surface-accent) 34%, var(--glass-surface-strong) 66%)' : 'var(--glass-surface-soft)',
                  '--glass-panel-border': selected ? 'var(--accent-border)' : 'var(--glass-border)',
                  '--glass-panel-shadow': selected ? 'var(--glass-shadow-strong)' : 'var(--glass-shadow)',
                  '--glass-panel-glow': 'none',
                  borderRadius: 'var(--radius-panel)',
                  padding: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.7rem',
                } as CSSProperties}
              >
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: palette.accent, border: `1px solid ${palette.accentBorder}` }} />
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: palette.accentLight, border: `1px solid ${palette.accentBorder}` }} />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 650, color: 'var(--text-primary)' }}>{palette.label}</div>
                  <div style={{ marginTop: '0.25rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selected ? 'Current accent' : 'Tap to apply'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>
    </main>
  )
}

const heroStyle = {
  borderRadius: 'var(--radius-page)',
  padding: '1.45rem',
  boxShadow: 'var(--shadow-medium), var(--highlight-sheen)',
} as const

const cardStyle = {
  borderRadius: 'var(--radius-page)',
  padding: '1.15rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  boxShadow: 'var(--shadow-low), var(--highlight-sheen)',
} as const

const eyebrowStyle = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
} as const
