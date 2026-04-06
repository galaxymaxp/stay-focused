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
    <main className="page-shell page-shell-narrow page-stack" style={{ gap: '1rem' }}>
      <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
        <p className="ui-kicker">Settings</p>
        <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Preferences</h1>
        <p className="ui-page-copy" style={{ maxWidth: '46rem', marginTop: 0 }}>
          Adjust the appearance of the app. These settings apply across Today, Learn, Do, Calendar, and module workspaces.
        </p>
      </header>

      <SettingsSection
        eyebrow="Appearance"
        title="Theme mode"
        description={`Choose how the app handles light and dark mode. Current resolved theme: ${resolvedTheme}.`}
      >
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {MODE_OPTIONS.map((option) => {
            const selected = option.value === mode

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setMode(option.value)}
                aria-pressed={selected}
                className="ui-interactive-card"
                data-open={selected ? 'true' : 'false'}
                style={optionRowStyle(selected)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{option.label}</div>
                  <div style={{ marginTop: '0.22rem', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                    {option.description}
                  </div>
                </div>
                <span style={selectionLabelStyle(selected)}>
                  {selected ? 'Current' : 'Select'}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        eyebrow="Accent"
        title="Highlight color"
        description="Choose the accent used for key actions, highlights, and supporting emphasis."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.6rem' }}>
          {Object.entries(ACCENT_OPTIONS).map(([name, palette]) => {
            const selected = name === accent

            return (
              <button
                key={name}
                type="button"
                onClick={() => setAccent(name as AccentName)}
                aria-pressed={selected}
                className="ui-interactive-card"
                data-open={selected ? 'true' : 'false'}
                style={swatchCardStyle(selected)}
              >
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: palette.accent, border: `1px solid ${palette.accentBorder}` }} />
                  <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: palette.accentLight, border: `1px solid ${palette.accentBorder}` }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{palette.label}</div>
                  <div style={{ marginTop: '0.22rem', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {selected ? 'Current accent' : 'Apply accent'}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSection>
    </main>
  )
}

function SettingsSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section style={sectionStyle}>
      <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)' }}>
        <p className="ui-kicker">{eyebrow}</p>
        <h2 style={{ margin: '0.4rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
          {description}
        </p>
      </div>
      <div style={{ padding: '1rem 1.1rem' }}>
        {children}
      </div>
    </section>
  )
}

function optionRowStyle(selected: boolean): React.CSSProperties {
  return {
    width: '100%',
    borderRadius: '12px',
    border: `1px solid ${selected
      ? 'color-mix(in srgb, var(--accent-border) 48%, var(--border-subtle) 52%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
    background: selected
      ? 'color-mix(in srgb, var(--surface-selected) 60%, var(--surface-elevated) 40%)'
      : 'var(--surface-elevated)',
    padding: '0.85rem 0.95rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.8rem',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function swatchCardStyle(selected: boolean): React.CSSProperties {
  return {
    borderRadius: '12px',
    border: `1px solid ${selected
      ? 'color-mix(in srgb, var(--accent-border) 48%, var(--border-subtle) 52%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
    background: selected
      ? 'color-mix(in srgb, var(--surface-selected) 60%, var(--surface-elevated) 40%)'
      : 'var(--surface-elevated)',
    padding: '0.85rem 0.95rem',
    display: 'grid',
    gap: '0.65rem',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function selectionLabelStyle(selected: boolean): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: '12px',
    fontWeight: 600,
    color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
  }
}

const sectionStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 98%, transparent)',
  boxShadow: 'var(--highlight-sheen)',
  overflow: 'hidden',
}
