'use client'

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
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '2.25rem 1.25rem 2.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <section className="motion-card" style={heroStyle}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-foreground)' }}>
          Settings
        </p>
        <h1 style={{ margin: '0.4rem 0 0', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>Personalize how the app feels</h1>
        <p style={{ margin: '0.65rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '56ch' }}>
          Adjust appearance for your own study style. Theme mode and accent color are applied across the app through the same centralized design tokens.
        </p>
      </section>

      <section className="motion-card motion-delay-1" style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <p style={eyebrowStyle}>Appearance</p>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Theme mode</h2>
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
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: selected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  background: selected ? 'var(--accent-light)' : 'var(--bg-card)',
                  borderRadius: '14px',
                  padding: '0.95rem 1rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{option.label}</div>
                  <div style={{ marginTop: '0.25rem', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {option.description}
                  </div>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: selected ? 'var(--accent-foreground)' : 'var(--text-muted)',
                  background: selected ? 'var(--accent)' : 'var(--bg)',
                  border: selected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  borderRadius: '999px',
                  padding: '0.35rem 0.55rem',
                }}>
                  {selected ? 'Selected' : 'Choose'}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="motion-card motion-delay-2" style={cardStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <p style={eyebrowStyle}>Accent</p>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>Highlight color</h2>
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
                style={{
                  border: selected ? '1px solid var(--accent-border)' : '1px solid var(--border)',
                  background: selected ? 'var(--bg)' : 'var(--bg-card)',
                  borderRadius: '16px',
                  padding: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.7rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: palette.accent, border: `1px solid ${palette.accentBorder}` }} />
                  <span style={{ width: '24px', height: '24px', borderRadius: '999px', background: palette.accentLight, border: `1px solid ${palette.accentBorder}` }} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{palette.label}</div>
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
  border: '1px solid var(--accent-border)',
  background: 'linear-gradient(180deg, var(--accent-light) 0%, var(--bg-card) 100%)',
  borderRadius: '20px',
  padding: '1.35rem',
  boxShadow: '0 18px 36px var(--accent-shadow)',
} as const

const cardStyle = {
  border: '1px solid var(--border)',
  borderRadius: '18px',
  background: 'var(--bg-card)',
  padding: '1.25rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
} as const

const eyebrowStyle = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
} as const
