import type { Metadata } from 'next'
import Script from 'next/script'
import { AppShell } from '@/components/AppShell'
import { ThemeProvider } from '@/components/ThemeProvider'
import { getRecentAnnouncements } from '@/lib/announcements'
import { loadWorkspaceSource } from '@/lib/workspace-source'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const source = await loadWorkspaceSource()
  const recentAnnouncements = getRecentAnnouncements(
    source.modules,
    new Map(source.courses.map((course) => [course.id, course])),
  )

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="app-shell" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        <ThemeProvider>
          <AppShell recentAnnouncements={recentAnnouncements}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
