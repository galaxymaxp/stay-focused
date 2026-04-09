export const supabaseAuthUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
export const supabaseAuthAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY

export const isSupabaseAuthConfigured = Boolean(supabaseAuthUrl && supabaseAuthAnonKey)

export function getRequiredSupabaseAuthEnv() {
  if (!supabaseAuthUrl || !supabaseAuthAnonKey) {
    throw new Error('Supabase auth is not configured. Missing URL or anon key.')
  }

  return {
    supabaseUrl: supabaseAuthUrl,
    supabaseAnonKey: supabaseAuthAnonKey,
  }
}
