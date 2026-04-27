'use client'

import type { AuthSummary } from '@/lib/auth'
import { resolveUserAvatar } from '@/lib/profile-avatar'
import { useUserAvatarProfile } from '@/components/useUserAvatarProfile'

export function useResolvedUserAvatar(user: AuthSummary['user']) {
  const avatarProfile = useUserAvatarProfile(user?.id ?? null)
  const fallbackProfile = user
    ? {
        avatar_source: 'none' as const,
        avatar_url: null,
        google_avatar_url: user.googleAvatarUrl,
      }
    : null

  const resolvedAvatar = avatarProfile.avatar?.resolved ?? resolveUserAvatar(fallbackProfile, user?.email ?? null)
  const profile = avatarProfile.avatar?.profile ?? {
    avatarSource: fallbackProfile?.google_avatar_url ? 'google' as const : 'none' as const,
    avatarUrl: null,
    googleAvatarUrl: fallbackProfile?.google_avatar_url ?? null,
  }

  return {
    ...avatarProfile,
    profile,
    resolvedAvatar,
    hasGoogleAvatar: avatarProfile.avatar?.hasGoogleAvatar ?? Boolean(fallbackProfile?.google_avatar_url),
  }
}
