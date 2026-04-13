export const supabaseAuthUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
export const supabaseAuthAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseAuthConfigError = getSupabaseAuthConfigError()
export const isSupabaseAuthConfigured = supabaseAuthConfigError == null

export function getRequiredSupabaseAuthEnv() {
  if (supabaseAuthConfigError) {
    throw new Error(supabaseAuthConfigError)
  }

  return {
    supabaseUrl: supabaseAuthUrl!,
    supabaseAnonKey: supabaseAuthAnonKey!,
  }
}

function getSupabaseAuthConfigError() {
  if (!supabaseAuthUrl || !supabaseAuthAnonKey) {
    return 'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  }

  if (isLocalSupabaseUrl(supabaseAuthUrl)) {
    return 'NEXT_PUBLIC_SUPABASE_URL must point to your hosted Supabase project, not localhost.'
  }

  return null
}

function isLocalSupabaseUrl(value: string) {
  try {
    const host = new URL(value).hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}
