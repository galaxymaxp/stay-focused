import type { Metadata } from 'next'
import { CanvasMenu } from '@/components/CanvasMenu'
import { StayFocusedIcon } from '@/components/StayFocusedIcon'
import { ThemeProvider } from '@/components/ThemeProvider'
import Link from 'next/link'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Stay Focused',
}

const THEME_INIT_SCRIPT = `
  (function() {
    try {
      var mode = localStorage.getItem('stay-focused.theme-mode') || 'system';
      var accent = localStorage.getItem('stay-focused.theme-accent') || 'yellow';
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var resolvedTheme = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
      var palettes = {
        yellow: ['#E3B437', '#CCA02D', '#F3E7B4', '#151006', '#C89E30', 'rgba(227, 180, 55, 0.16)'],
        orange: ['#D97757', '#C4673F', '#F0D5CB', '#FFFFFF', '#C56E4F', 'rgba(217, 119, 87, 0.14)'],
        blue: ['#4F8FE8', '#3E7BD1', '#CFE0FB', '#FFFFFF', '#5B90DB', 'rgba(79, 143, 232, 0.14)'],
        green: ['#5B9B72', '#4B875F', '#D2E7DA', '#FFFFFF', '#649D79', 'rgba(91, 155, 114, 0.14)']
      };
      var palette = palettes[accent] || palettes.yellow;
      var root = document.documentElement;
      root.dataset.theme = resolvedTheme;
      root.dataset.accent = accent;
      root.style.colorScheme = resolvedTheme;
      root.style.setProperty('--accent', palette[0]);
      root.style.setProperty('--accent-hover', palette[1]);
      root.style.setProperty('--accent-light', palette[2]);
      root.style.setProperty('--accent-foreground', palette[3]);
      root.style.setProperty('--accent-border', palette[4]);
      root.style.setProperty('--accent-shadow', palette[5]);
    } catch (error) {}
  })();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="app-shell" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <ThemeProvider>
          <nav className="app-topbar glass-panel glass-soft" style={{
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0 1rem 0 1.5rem',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontWeight: 600,
                fontSize: '15px',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                minHeight: '40px',
              }}
            >
              <StayFocusedIcon size={18} style={{ flexShrink: 0 }} />
              <span>Stay Focused</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/settings" className="ui-button ui-button-secondary" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500, padding: '0.45rem 0.7rem', borderRadius: '999px', minHeight: '36px' }}>
                Settings
              </Link>
              <CanvasMenu />
            </div>
          </nav>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
