import type { NextRequest } from 'next/server'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'

export { getSafeRedirectPath } from '@/lib/auth-routing'

export interface AuthSummary {
  isConfigured: boolean
  user: {
    id: string
    email: string | null
    googleAvatarUrl: string | null
  } | null
}

export async function getAuthenticatedUserIdFromRequest(request: NextRequest) {
  if (!isSupabaseAuthConfigured) return null

  try {
    const supabase = createSupabaseRouteClient(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch (error) {
    console.error('[auth] Failed to resolve request user.', error)
    return null
  }
}
