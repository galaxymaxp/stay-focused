'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AuthSummary } from '@/lib/auth'
import { extractGoogleAvatarUrlFromUser } from '@/lib/profile-avatar'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth-browser'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'

const INITIAL_AUTH_SUMMARY: AuthSummary = {
  isConfigured: isSupabaseAuthConfigured,
  user: null,
}

export function useAuthSummary() {
  const [authSummary, setAuthSummary] = useState<AuthSummary>(INITIAL_AUTH_SUMMARY)

  useEffect(() => {
    if (!isSupabaseAuthConfigured) return

    const supabase = createSupabaseBrowserClient()
    let active = true

    function applyUser(user: User | null) {
      if (!active) return

      setAuthSummary({
        isConfigured: true,
        user: user
          ? {
              id: user.id,
              email: typeof user.email === 'string' ? user.email : null,
              googleAvatarUrl: extractGoogleAvatarUrlFromUser(user),
            }
          : null,
      })
    }

    void supabase.auth.getUser().then(({ data }) => {
      applyUser(data.user)
    }).catch((error) => {
      console.error('[auth] Failed to load browser auth state.', error)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return authSummary
}
