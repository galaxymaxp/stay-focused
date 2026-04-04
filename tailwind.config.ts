import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--app-bg)',
        card: 'var(--surface-base)',
        hover: 'var(--interactive-hover-bg)',
        border: 'var(--border-subtle)',
        surface: {
          base: 'var(--surface-base)',
          elevated: 'var(--surface-elevated)',
          selected: 'var(--surface-selected)',
          accent: 'var(--surface-accent)',
          soft: 'var(--surface-soft)',
        },
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        accent: 'var(--accent)',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
        hover: 'var(--interactive-hover-border)',
      },
      boxShadow: {
        low: 'var(--shadow-low)',
        medium: 'var(--shadow-medium)',
        high: 'var(--shadow-high)',
      },
      borderRadius: {
        premium: 'var(--radius-premium)',
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
    },
  },
}

export default config
