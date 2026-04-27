import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'

export interface AuthenticatedUserSummary {
  id: string
  email: string | null
}

export async function createAuthenticatedSupabaseServerClient() {
  if (!isSupabaseAuthConfigured) return null

  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
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
          // Read-mostly usage in server components.
        }
      },
    },
  })
}

export async function getAuthenticatedUserServer(): Promise<AuthenticatedUserSummary | null> {
  const client = await createAuthenticatedSupabaseServerClient()
  if (!client) return null

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user?.id) return null

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
  }
}

export async function requireAuthenticatedUserServer() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    throw new Error('You need to sign in before using Canvas sync.')
  }
  return user
}
