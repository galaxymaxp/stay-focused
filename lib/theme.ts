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
    accentLight: '#F3E7B4',
    accentForeground: '#151006',
    accentBorder: '#C89E30',
    accentShadow: 'rgba(227, 180, 55, 0.16)',
  },
  orange: {
    label: 'Orange',
    accent: '#D97757',
    accentHover: '#C4673F',
    accentLight: '#F0D5CB',
    accentForeground: '#FFFFFF',
    accentBorder: '#C56E4F',
    accentShadow: 'rgba(217, 119, 87, 0.14)',
  },
  blue: {
    label: 'Blue',
    accent: '#4F8FE8',
    accentHover: '#3E7BD1',
    accentLight: '#CFE0FB',
    accentForeground: '#FFFFFF',
    accentBorder: '#5B90DB',
    accentShadow: 'rgba(79, 143, 232, 0.14)',
  },
  green: {
    label: 'Green',
    accent: '#5B9B72',
    accentHover: '#4B875F',
    accentLight: '#D2E7DA',
    accentForeground: '#FFFFFF',
    accentBorder: '#649D79',
    accentShadow: 'rgba(91, 155, 114, 0.14)',
  },
}
