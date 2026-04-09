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

const AVATAR_PROFILE_EVENT = 'stay-focused-avatar-profile'
const avatarProfileCache = new Map<string, UserAvatarApiResponse>()

export function useUserAvatarProfile(userId: string | null) {
  const [avatar, setAvatarState] = useState<UserAvatarApiResponse | null>(() => (
    userId ? avatarProfileCache.get(userId) ?? null : null
  ))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setAvatar = useCallback((nextAvatar: UserAvatarApiResponse | null) => {
    if (userId) {
      if (nextAvatar) {
        avatarProfileCache.set(userId, nextAvatar)
      } else {
        avatarProfileCache.delete(userId)
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AVATAR_PROFILE_EVENT, {
          detail: {
            userId,
            avatar: nextAvatar,
          },
        }))
      }
    }

    setAvatarState(nextAvatar)
    setError(null)
  }, [userId])

  const refresh = useCallback(async () => {
    if (!userId) {
      setAvatar(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/profile/avatar', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
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
  }, [setAvatar, userId])

  useEffect(() => {
    if (!userId) {
      setAvatarState(null)
      setLoading(false)
      setError(null)
      return
    }

    setAvatarState(avatarProfileCache.get(userId) ?? null)
    void refresh()
  }, [refresh, userId])

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    function handleAvatarProfile(event: Event) {
      const detail = (event as CustomEvent<{ userId: string, avatar: UserAvatarApiResponse | null }>).detail
      if (!detail || detail.userId !== userId) return
      setAvatarState(detail.avatar)
      setError(null)
    }

    window.addEventListener(AVATAR_PROFILE_EVENT, handleAvatarProfile)

    return () => {
      window.removeEventListener(AVATAR_PROFILE_EVENT, handleAvatarProfile)
    }
  }, [userId])

  const value = useMemo(() => {
    return {
      avatar,
      setAvatar,
      loading,
      error,
      refresh,
    }
  }, [avatar, error, loading, refresh, setAvatar])

  return value
}
