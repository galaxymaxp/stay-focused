import type { User } from '@supabase/supabase-js'

export const PROFILE_AVATAR_BUCKET = 'profile-avatars'
export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024

export const PROFILE_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export type AvatarSource = 'google' | 'upload' | 'none'

export interface UserAvatarProfile {
  avatar_source: AvatarSource
  avatar_url: string | null
  google_avatar_url: string | null
}

export interface ResolvedAvatar {
  source: AvatarSource
  url: string | null
  initials: string | null
}

export function getUserInitialsFromEmail(email: string | null | undefined) {
  const normalizedEmail = typeof email === 'string' ? email.trim() : ''
  if (!normalizedEmail) return null

  const local = normalizedEmail.split('@')[0]?.replace(/[^a-z0-9]+/gi, ' ').trim()
  if (!local) return normalizedEmail.slice(0, 2).toUpperCase()

  return local
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

export function resolveAvatarSource(value: unknown): AvatarSource {
  if (value === 'google' || value === 'upload' || value === 'none') return value
  return 'none'
}

export function resolveUserAvatar(profile: UserAvatarProfile | null, email: string | null | undefined): ResolvedAvatar {
  const initials = getUserInitialsFromEmail(email)

  if (!profile) {
    return {
      source: 'none',
      url: null,
      initials,
    }
  }

  if (profile.avatar_source === 'upload' && profile.avatar_url) {
    return {
      source: 'upload',
      url: profile.avatar_url,
      initials,
    }
  }

  if (profile.google_avatar_url) {
    return {
      source: 'google',
      url: profile.google_avatar_url,
      initials,
    }
  }

  return {
    source: 'none',
    url: null,
    initials,
  }
}

export function extractGoogleAvatarUrlFromUser(user: User): string | null {
  const providers = getUserProviders(user)
  if (!providers.has('google')) return null

  const metadata = user.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata as Record<string, unknown>
    : null
  const googleIdentityData = getGoogleIdentityData(user)

  const candidates = [
    metadata ? getStringValue(metadata, 'avatar_url') : null,
    metadata ? getStringValue(metadata, 'picture') : null,
    metadata ? getStringValue(metadata, 'photo_url') : null,
    googleIdentityData ? getStringValue(googleIdentityData, 'avatar_url') : null,
    googleIdentityData ? getStringValue(googleIdentityData, 'picture') : null,
    googleIdentityData ? getStringValue(googleIdentityData, 'photo_url') : null,
  ]

  const match = candidates.find((value) => isHttpUrl(value))
  return match ?? null
}

export function getStorageObjectPathFromPublicUrl(url: string | null | undefined, bucket = PROFILE_AVATAR_BUCKET) {
  if (typeof url !== 'string' || !url) return null

  try {
    const parsed = new URL(url)
    const marker = `/storage/v1/object/public/${bucket}/`
    const idx = parsed.pathname.indexOf(marker)
    if (idx < 0) return null
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length))
  } catch {
    return null
  }
}

export function getAvatarFileExtension(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/gif') return 'gif'
  return null
}

function getUserProviders(user: User) {
  const providers = new Set<string>()
  const appMetadata = user.app_metadata && typeof user.app_metadata === 'object'
    ? user.app_metadata as Record<string, unknown>
    : null

  const provider = appMetadata ? getStringValue(appMetadata, 'provider') : null
  if (provider) providers.add(provider)

  const providersList = appMetadata && Array.isArray((appMetadata as { providers?: unknown[] }).providers)
    ? (appMetadata as { providers: unknown[] }).providers
    : []

  for (const value of providersList) {
    if (typeof value === 'string' && value) {
      providers.add(value)
    }
  }

  for (const identity of user.identities ?? []) {
    if (identity.provider) {
      providers.add(identity.provider)
    }
  }

  return providers
}

function getGoogleIdentityData(user: User) {
  for (const identity of user.identities ?? []) {
    if (identity.provider !== 'google') continue

    const rawIdentityData = (identity as { identity_data?: unknown }).identity_data
    if (rawIdentityData && typeof rawIdentityData === 'object') {
      return rawIdentityData as Record<string, unknown>
    }
  }

  return null
}

function getStringValue(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function isHttpUrl(value: string | null) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
