import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'

export interface AuthenticatedSupabaseServerContext {
  client: SupabaseClient
  user: User
}

export async function getAuthenticatedSupabaseServerContext(): Promise<AuthenticatedSupabaseServerContext | null> {
  if (!isSupabaseAuthConfigured) return null

  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }))
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Read-mostly usage in server components and server actions.
        }
      },
    },
  })

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user?.id) return null

  return {
    client,
    user,
  }
}
