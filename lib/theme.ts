export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentName = 'yellow' | 'orange' | 'blue' | 'green'

export interface AccentPalette {
  accent: string
  accentHover: string
  accentLight: string
  accentForeground: string
  accentBorder: string
  accentShadow: string
}

export const DEFAULT_THEME_MODE: ThemeMode = 'system'
export const DEFAULT_ACCENT: AccentName = 'yellow'

export const ACCENT_OPTIONS: Record<AccentName, AccentPalette & { label: string }> = {
  yellow: {
    label: 'Yellow',
    accent: '#E3B437',
    accentHover: '#CCA02D',
    accentLight: '#FFF5CC',
    accentForeground: '#4C3900',
    accentBorder: '#E2C15F',
    accentShadow: 'rgba(227, 180, 55, 0.28)',
  },
  orange: {
    label: 'Orange',
    accent: '#D97757',
    accentHover: '#C4673F',
    accentLight: '#FAF0EB',
    accentForeground: '#FFFFFF',
    accentBorder: '#DD916F',
    accentShadow: 'rgba(217, 119, 87, 0.24)',
  },
  blue: {
    label: 'Blue',
    accent: '#4F8FE8',
    accentHover: '#3E7BD1',
    accentLight: '#EAF3FF',
    accentForeground: '#FFFFFF',
    accentBorder: '#79A7EE',
    accentShadow: 'rgba(79, 143, 232, 0.24)',
  },
  green: {
    label: 'Green',
    accent: '#5B9B72',
    accentHover: '#4B875F',
    accentLight: '#EAF6EE',
    accentForeground: '#FFFFFF',
    accentBorder: '#7AB18D',
    accentShadow: 'rgba(91, 155, 114, 0.24)',
  },
}
