import { createBrowserClient } from '@supabase/ssr'
import { getRequiredSupabaseAuthEnv } from '@/lib/supabase-auth-config'

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
