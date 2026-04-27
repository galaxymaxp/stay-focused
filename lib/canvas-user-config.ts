import { getCanvasCredentials } from '@/actions/user-settings'
import type { CanvasConfig } from '@/lib/canvas'
import { normalizeCanvasUrl } from '@/lib/canvas'

export async function resolveCanvasConfigFromUser(override?: Partial<CanvasConfig>): Promise<CanvasConfig> {
  if (override?.url && override?.token) {
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

  if (!credentials || !credentials.canvasApiUrl || !credentials.canvasAccessToken) {
    throw new Error('Canvas not configured. Please add your Canvas URL and access token in Settings.')
  }

  try {
    return {
      url: normalizeCanvasUrl(credentials.canvasApiUrl.trim()),
      token: credentials.canvasAccessToken.trim(),
    }
  } catch {
    throw new Error('Invalid Canvas URL in settings. Please update your Canvas URL in Settings.')
  }
}

export async function hasCanvasConfigured(): Promise<boolean> {
  const credentials = await getCanvasCredentials()
  return Boolean(credentials?.canvasApiUrl && credentials?.canvasAccessToken)
}
