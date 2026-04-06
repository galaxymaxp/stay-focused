import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const SUPABASE_FETCH_RETRIES = 3

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: retryingSupabaseFetch,
      },
    })
  : null

async function retryingSupabaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  let lastError: unknown

  for (let attempt = 1; attempt <= SUPABASE_FETCH_RETRIES; attempt += 1) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error

      if (!shouldRetrySupabaseFetch(error) || attempt === SUPABASE_FETCH_RETRIES) {
        throw error
      }

      await waitForRetry(attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Supabase fetch failed.')
}

function shouldRetrySupabaseFetch(error: unknown) {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return message.includes('fetch failed')
    || message.includes('networkerror')
    || message.includes('econnreset')
    || message.includes('etimedout')
}

function waitForRetry(attempt: number) {
  const delayMs = attempt * 250
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}
