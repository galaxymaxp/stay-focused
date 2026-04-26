import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAuthUrl } from '@/lib/supabase-auth-config'

let cachedServiceClient: SupabaseClient | null | undefined

export function createSupabaseServiceRoleClient() {
  if (cachedServiceClient !== undefined) return cachedServiceClient

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()

  if (!supabaseAuthUrl || !serviceRoleKey) {
    cachedServiceClient = null
    return cachedServiceClient
  }

  cachedServiceClient = createClient(supabaseAuthUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return cachedServiceClient
}
