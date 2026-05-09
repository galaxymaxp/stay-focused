const PUBLIC_AUTH_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/auth',
  '/forgot-password',
  '/reset-password',
  '/update-password',
] as const

const AUTH_ENTRY_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
] as const

const PROTECTED_ROUTE_PREFIXES = [
  '/',
  '/admin',
  '/calendar',
  '/canvas',
  '/course',
  '/courses',
  '/do',
  '/drafts',
  '/learn',
  '/library',
  '/modules',
  '/settings',
  '/sync',
  '/tasks',
] as const

export const APP_SHELL_PUBLIC_HEADER = 'x-stay-focused-public-route'
export const APP_SHELL_PATHNAME_HEADER = 'x-stay-focused-pathname'

export function isPublicAuthPath(pathname: string) {
  return matchesRoutePrefix(pathname, PUBLIC_AUTH_ROUTE_PREFIXES)
}

export function isAuthEntryPath(pathname: string) {
  return matchesRoutePrefix(pathname, AUTH_ENTRY_ROUTE_PREFIXES)
}

export function isProtectedAppPath(pathname: string) {
  if (isPublicAuthPath(pathname)) return false
  return matchesRoutePrefix(pathname, PROTECTED_ROUTE_PREFIXES)
}

export function shouldRenderAppShell(pathname: string) {
  return !isPublicAuthPath(pathname)
}

export function getSafeRedirectPath(value: string | null | undefined, fallback = '/') {
  if (!value) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback

  let parsed: URL
  try {
    parsed = new URL(value, 'https://stayfocused.local')
  } catch {
    return fallback
  }

  if (!parsed.pathname.startsWith('/')) return fallback
  if (isPublicAuthPath(parsed.pathname)) return fallback

  parsed.searchParams.delete('next')

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
  return normalized || fallback
}

export function buildProtectedRedirectDestination(pathname: string, search = '') {
  const nextPath = getSafeRedirectPath(`${pathname}${search}`, pathname || '/')
  return `/sign-in?next=${encodeURIComponent(nextPath)}`
}

export function getAuthProxyRedirect(pathname: string, search: string, userId: string | null) {
  if (!userId && isProtectedAppPath(pathname)) {
    return buildProtectedRedirectDestination(pathname, search)
  }

  if (userId && isAuthEntryPath(pathname)) {
    const nextValue = new URLSearchParams(stripLeadingQuestionMark(search)).get('next')
    return getSafeRedirectPath(nextValue, '/')
  }

  return null
}

export function resolveAuthEntryParams(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  fallback = '/',
) {
  const nextValue = searchParams?.next
  const errorValue = searchParams?.error

  return {
    nextPath: getSafeRedirectPath(Array.isArray(nextValue) ? nextValue[0] : nextValue, fallback),
    initialError: Array.isArray(errorValue) ? errorValue[0] : errorValue ?? null,
  }
}

function matchesRoutePrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function stripLeadingQuestionMark(value: string) {
  return value.startsWith('?') ? value.slice(1) : value
}
