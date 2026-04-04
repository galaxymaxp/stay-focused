'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ACCENT_OPTIONS, DEFAULT_ACCENT, DEFAULT_THEME_MODE, type AccentName, type ThemeMode } from '@/lib/theme'

const STORAGE_MODE_KEY = 'stay-focused.theme-mode'
const STORAGE_ACCENT_KEY = 'stay-focused.theme-accent'

interface ThemeContextValue {
  mode: ThemeMode
  accent: AccentName
  resolvedTheme: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentName) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode() ?? DEFAULT_THEME_MODE)
  const [accent, setAccentState] = useState<AccentName>(() => readStoredAccent() ?? DEFAULT_ACCENT)
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => readSystemPrefersDark())
  const resolvedTheme: 'light' | 'dark' = mode === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : mode

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    applyThemeToDocument(mode, accent, systemPrefersDark)

    function handleMediaChange() {
      const nextPrefersDark = mediaQuery.matches
      setSystemPrefersDark(nextPrefersDark)

      if (mode === 'system') {
        applyThemeToDocument(mode, accent, nextPrefersDark)
      }
    }

    mediaQuery.addEventListener('change', handleMediaChange)
    return () => mediaQuery.removeEventListener('change', handleMediaChange)
  }, [accent, mode, systemPrefersDark])

  const value = useMemo(() => ({
    mode,
    accent,
    resolvedTheme,
    setMode(nextMode: ThemeMode) {
      setModeState(nextMode)
      window.localStorage.setItem(STORAGE_MODE_KEY, nextMode)
    },
    setAccent(nextAccent: AccentName) {
      setAccentState(nextAccent)
      window.localStorage.setItem(STORAGE_ACCENT_KEY, nextAccent)
    },
  }), [accent, mode, resolvedTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useThemeSettings() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useThemeSettings must be used within ThemeProvider.')
  }

  return context
}

function readStoredMode() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_MODE_KEY)
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null
}

function readStoredAccent() {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_ACCENT_KEY)
  return raw && raw in ACCENT_OPTIONS ? (raw as AccentName) : null
}

function readSystemPrefersDark() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeToDocument(mode: ThemeMode, accent: AccentName, systemPrefersDark: boolean) {
  const resolvedTheme = mode === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : mode

  const palette = ACCENT_OPTIONS[accent]
  const root = document.documentElement

  root.dataset.theme = resolvedTheme
  root.dataset.accent = accent
  root.style.colorScheme = resolvedTheme
  root.style.setProperty('--accent', palette.accent)
  root.style.setProperty('--accent-hover', palette.accentHover)
  root.style.setProperty('--accent-light', palette.accentLight)
  root.style.setProperty('--accent-foreground', palette.accentForeground)
  root.style.setProperty('--accent-border', palette.accentBorder)
  root.style.setProperty('--accent-shadow', palette.accentShadow)

  if (document.body) {
    document.body.dataset.theme = resolvedTheme
  }

  return resolvedTheme
}
