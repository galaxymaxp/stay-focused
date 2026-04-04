import type { Metadata } from 'next'
import { CanvasMenu } from '@/components/CanvasMenu'
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
        yellow: ['#E3B437', '#CCA02D', '#FFF5CC', '#4C3900', '#E2C15F', 'rgba(227, 180, 55, 0.28)'],
        orange: ['#D97757', '#C4673F', '#FAF0EB', '#FFFFFF', '#DD916F', 'rgba(217, 119, 87, 0.24)'],
        blue: ['#4F8FE8', '#3E7BD1', '#EAF3FF', '#FFFFFF', '#79A7EE', 'rgba(79, 143, 232, 0.24)'],
        green: ['#5B9B72', '#4B875F', '#EAF6EE', '#FFFFFF', '#7AB18D', 'rgba(91, 155, 114, 0.24)']
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
      <body style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <ThemeProvider>
          <nav style={{
            borderBottom: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
            boxShadow: 'var(--shadow-sm)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            padding: '0 1rem 0 1.5rem',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <Link href="/" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', textDecoration: 'none' }}>
              Stay Focused
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/settings" style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 500, padding: '0.45rem 0.7rem', borderRadius: '999px', background: 'var(--surface-soft)', border: '1px solid var(--border)' }}>
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
