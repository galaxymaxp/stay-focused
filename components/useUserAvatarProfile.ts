'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AvatarSource } from '@/lib/profile-avatar'

export interface UserAvatarApiResponse {
  profile: {
    avatarSource: AvatarSource
    avatarUrl: string | null
    googleAvatarUrl: string | null
  }
  resolved: {
    source: AvatarSource
    url: string | null
    initials: string | null
  }
  hasGoogleAvatar: boolean
}

export function useUserAvatarProfile(enabled: boolean) {
  const [avatar, setAvatar] = useState<UserAvatarApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAvatar(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/profile/avatar', { method: 'GET', cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Could not load avatar profile (${response.status}).`)
      }

      const payload = await response.json() as UserAvatarApiResponse
      setAvatar(payload)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load avatar profile.')
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(() => {
    return {
      avatar,
      setAvatar,
      loading,
      error,
      refresh,
    }
  }, [avatar, error, loading, refresh])

  return value
}
