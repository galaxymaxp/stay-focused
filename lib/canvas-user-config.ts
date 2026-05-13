import { getCanvasCredentials } from '@/actions/user-settings'
import type { CanvasConfig } from '@/lib/canvas'
import { normalizeCanvasUrl } from '@/lib/canvas'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export const CANVAS_RECONNECT_MESSAGE = 'Canvas connection is missing or expired. Reconnect Canvas in Settings, then retry.'

interface CanvasCredentialPair {
  canvasApiUrl: string
  canvasAccessToken: string
}

export async function resolveCanvasConfigFromUser(override?: Partial<CanvasConfig>): Promise<CanvasConfig> {
  if (override?.url && override?.token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Canvas must be connected for this account before syncing.')
    }

    try {
      return {
        url: normalizeCanvasUrl(override.url.trim()),
        token: override.token.trim(),
      }
    } catch {
      throw new Error('Invalid Canvas URL provided in override.')
    }
  }

  const credentials = await getCanvasCredentials()
  if (!credentials) {
    throw new Error('Canvas not configured. Please add your Canvas URL and access token in Settings.')
  }

  return resolveCanvasConfigFromCredentials(credentials, override, {
    missingMessage: 'Canvas not configured. Please add your Canvas URL and access token in Settings.',
    invalidUrlMessage: 'Invalid Canvas URL in settings. Please update your Canvas URL in Settings.',
  })
}

export async function resolveCanvasConfigForUserId(
  userId: string,
  override?: Partial<CanvasConfig>,
  options?: {
    loadCredentials?: (requestedUserId: string) => Promise<CanvasCredentialPair | null>
  },
): Promise<CanvasConfig> {
  const credentials = await getCanvasCredentialsForUserId(userId, options)
  if (!credentials) {
    throw new Error(CANVAS_RECONNECT_MESSAGE)
  }

  return resolveCanvasConfigFromCredentials(credentials, override, {
    missingMessage: CANVAS_RECONNECT_MESSAGE,
    invalidUrlMessage: CANVAS_RECONNECT_MESSAGE,
  })
}

export async function getCanvasCredentialsForUserId(
  userId: string,
  options?: {
    loadCredentials?: (requestedUserId: string) => Promise<CanvasCredentialPair | null>
  },
): Promise<CanvasCredentialPair | null> {
  if (options?.loadCredentials) {
    return options.loadCredentials(userId)
  }

  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('canvas_api_url, canvas_access_token')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data?.canvas_api_url || !data?.canvas_access_token) {
      return null
    }

    return {
      canvasApiUrl: data.canvas_api_url,
      canvasAccessToken: data.canvas_access_token,
    }
  } catch {
    return null
  }
}

function resolveCanvasConfigFromCredentials(
  credentials: CanvasCredentialPair,
  override: Partial<CanvasConfig> | undefined,
  messages: {
    missingMessage: string
    invalidUrlMessage: string
  },
) {
  const canvasApiUrl = override?.url?.trim() || credentials.canvasApiUrl?.trim()
  const canvasAccessToken = override?.token?.trim() || credentials.canvasAccessToken?.trim()

  if (!canvasApiUrl || !canvasAccessToken) {
    throw new Error(messages.missingMessage)
  }

  try {
    return {
      url: normalizeCanvasUrl(canvasApiUrl),
      token: canvasAccessToken,
    }
  } catch {
    throw new Error(messages.invalidUrlMessage)
  }
}

export async function hasCanvasConfigured(): Promise<boolean> {
  const credentials = await getCanvasCredentials()
  return Boolean(credentials?.canvasApiUrl && credentials?.canvasAccessToken)
}
