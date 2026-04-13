import { createClient } from '@supabase/supabase-js'
import {
  getRequiredSupabaseAuthEnv,
  isSupabaseAuthConfigured,
  supabaseAuthConfigError,
  supabaseAuthUrl,
} from '@/lib/supabase-auth-config'

const supabaseUrl = supabaseAuthUrl

const SUPABASE_FETCH_RETRIES = 3

const supabaseEnvPresence = {
  hasNextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  hasNextPublicSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
}

const supabaseHost = getSupabaseHost(supabaseUrl)

export const isSupabaseConfigured = isSupabaseAuthConfigured

let supabaseClientCreationError: Record<string, unknown> | null = null
export const supabase = (() => {
  if (!isSupabaseConfigured) {
    logSupabaseClientEvent('client_not_configured', {
      supabaseHost,
      envPresence: supabaseEnvPresence,
      isSupabaseConfigured,
      configError: supabaseAuthConfigError,
    })
    return null
  }

  try {
    const { supabaseUrl: requiredSupabaseUrl, supabaseAnonKey: requiredSupabaseAnonKey } = getRequiredSupabaseAuthEnv()
    const client = createClient(requiredSupabaseUrl, requiredSupabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: retryingSupabaseFetch,
      },
    })

    logSupabaseClientEvent('client_created', {
      supabaseHost,
      envPresence: supabaseEnvPresence,
      isSupabaseConfigured,
      configError: supabaseAuthConfigError,
      fetchRetries: SUPABASE_FETCH_RETRIES,
    })

    return client
  } catch (error) {
    supabaseClientCreationError = serializeErrorForLogging(error)
    logSupabaseClientEvent('client_create_failed', {
      supabaseHost,
      envPresence: supabaseEnvPresence,
      isSupabaseConfigured,
      configError: supabaseAuthConfigError,
      fetchRetries: SUPABASE_FETCH_RETRIES,
      error: supabaseClientCreationError,
    })
    return null
  }
})()

export function getSupabaseLoggingContext() {
  return {
    supabaseHost,
    envPresence: supabaseEnvPresence,
    isSupabaseConfigured,
    configError: supabaseAuthConfigError,
    clientCreated: Boolean(supabase),
    fetchRetries: SUPABASE_FETCH_RETRIES,
    clientCreationError: supabaseClientCreationError,
  }
}

export function serializeErrorForLogging(error: unknown, depth = 0): Record<string, unknown> | null {
  if (error == null) return null

  if (depth >= 4) {
    return { message: 'Max error cause depth reached.' }
  }

  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    }

    const code = getOptionalObjectString(error, 'code')
    const details = getOptionalObjectString(error, 'details')
    const hint = getOptionalObjectString(error, 'hint')
    if (code) serialized.code = code
    if (details) serialized.details = details
    if (hint) serialized.hint = hint

    if ('cause' in error) {
      serialized.cause = serializeErrorForLogging(error.cause, depth + 1)
    }

    return serialized
  }

  if (typeof error === 'object') {
    const serialized: Record<string, unknown> = {
      name: getOptionalObjectString(error, 'name'),
      message: getOptionalObjectString(error, 'message') ?? String(error),
      stack: getOptionalObjectString(error, 'stack'),
    }

    const code = getOptionalObjectString(error, 'code')
    const details = getOptionalObjectString(error, 'details')
    const hint = getOptionalObjectString(error, 'hint')
    if (code) serialized.code = code
    if (details) serialized.details = details
    if (hint) serialized.hint = hint

    if ('cause' in error) {
      serialized.cause = serializeErrorForLogging((error as { cause?: unknown }).cause, depth + 1)
    }

    return serialized
  }

  return { message: String(error) }
}

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

function getSupabaseHost(value: string | undefined) {
  if (!value) return null

  try {
    return new URL(value).host
  } catch {
    return 'invalid-supabase-url'
  }
}

function getOptionalObjectString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || !(key in value)) return null
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' && field ? field : null
}

function logSupabaseClientEvent(step: string, context: Record<string, unknown>) {
  console.info('[Supabase client]', {
    step,
    ...context,
  })
}
