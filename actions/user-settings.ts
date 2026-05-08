'use server'

import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer, getAuthenticatedUserWithIdentities } from '@/lib/auth-server'
import { isResendConfigured, isResendDevSender } from '@/lib/resend'
import { isAdminUser } from '@/lib/admin'
import { getNotificationEmailOptions, NOTIFICATION_EMAIL_SOURCES, type NotificationEmailOption, type NotificationEmailSource } from '@/lib/notification-email-options'
import { revalidatePath } from 'next/cache'

export interface EmailCategories {
  due_soon: boolean
  new_uploads: boolean
  announcements: boolean
  queue_completed: boolean
  canvas_updates: boolean
}

const DEFAULT_EMAIL_CATEGORIES: EmailCategories = {
  due_soon: true,
  new_uploads: true,
  announcements: false,
  queue_completed: true,
  canvas_updates: false,
}


export interface UserSettings {
  userId: string
  settingsRowExists: boolean
  canvasApiUrl: string | null
  canvasAccessToken: string | null
  notificationEmail: string | null
  notificationEmailSource: NotificationEmailSource
  notificationEmailOptions: NotificationEmailOption[]
  aiProvider: 'openai' | 'gemini' | 'nemotron'
  emailNotifications: 'off' | 'instant' | 'daily_digest'
  emailCategories: EmailCategories
  emailProviderConfigured: boolean
  isResendDevSender: boolean
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

function toEmailSource(raw: unknown): NotificationEmailSource {
  if (typeof raw === 'string' && (NOTIFICATION_EMAIL_SOURCES as readonly string[]).includes(raw)) {
    return raw as NotificationEmailSource
  }
  return 'supabase_account'
}

export async function getUserSettings() {
  // Fetch the full user object (with identities) so we can build notification email options.
  const fullUser = await getAuthenticatedUserWithIdentities()
  if (!fullUser) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  const emailProviderConfigured = isResendConfigured()
  const isAdmin = isAdminUser(fullUser)
  const resendDevSender = isResendDevSender()
  const notificationEmailOptions = getNotificationEmailOptions(fullUser)

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { data, error } = await client
      .from('user_settings')
      .select('*')
      .eq('user_id', fullUser.id)
      .maybeSingle()

    if (error) {
      console.error('[getUserSettings] Supabase error:', error)
      return { ok: false as const, error: 'Could not load settings' }
    }

    if (!data) {
      return {
        ok: true as const,
        settings: {
          userId: fullUser.id,
          settingsRowExists: false,
          canvasApiUrl: null,
          canvasAccessToken: null,
          notificationEmail: fullUser.email ?? null,
          notificationEmailSource: 'supabase_account' as NotificationEmailSource,
          notificationEmailOptions,
          aiProvider: 'openai' as const,
          emailNotifications: 'off' as const,
          emailCategories: DEFAULT_EMAIL_CATEGORIES,
          emailProviderConfigured,
          isResendDevSender: resendDevSender,
          isAdmin,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    }

    return {
      ok: true as const,
      settings: {
        userId: data.user_id,
        settingsRowExists: true,
        canvasApiUrl: data.canvas_api_url,
        canvasAccessToken: data.canvas_access_token,
        notificationEmail: data.notification_email,
        notificationEmailSource: toEmailSource((data as Record<string, unknown>).notification_email_source),
        notificationEmailOptions,
        aiProvider: (data.ai_provider ?? 'openai') as 'openai' | 'gemini' | 'nemotron',
        emailNotifications: (data.email_notifications ?? 'off') as 'off' | 'instant' | 'daily_digest',
        emailCategories: { ...DEFAULT_EMAIL_CATEGORIES, ...(data.email_categories as Partial<EmailCategories> ?? {}) },
        emailProviderConfigured,
        isResendDevSender: resendDevSender,
        isAdmin,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }
  } catch (err) {
    console.error('[getUserSettings] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error loading settings' }
  }
}

export async function updateEmailPreferences(input: {
  emailNotifications: 'off' | 'instant' | 'daily_digest'
  emailCategories: EmailCategories
}) {
  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false as const, error: 'Not authenticated' }

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { error } = await client
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          email_notifications: input.emailNotifications,
          email_categories: input.emailCategories,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      console.error('[updateEmailPreferences] Supabase error:', error)
      return { ok: false as const, error: 'Could not save notification preferences' }
    }

    revalidatePath('/settings')
    return { ok: true as const }
  } catch (err) {
    console.error('[updateEmailPreferences] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error' }
  }
}

export async function updateCanvasSettings(input: { canvasApiUrl: string; canvasAccessToken: string }) {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  const { canvasApiUrl, canvasAccessToken } = input

  if (!canvasApiUrl || !canvasAccessToken) {
    return { ok: false as const, error: 'Canvas URL and access token are required' }
  }

  try {
    new URL(canvasApiUrl)
  } catch {
    return { ok: false as const, error: 'Canvas URL must be a valid URL' }
  }

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { data, error } = await client
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          canvas_api_url: canvasApiUrl,
          canvas_access_token: canvasAccessToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      )
      .select()
      .single()

    if (error) {
      console.error('[updateCanvasSettings] Supabase error:', error)
      return { ok: false as const, error: 'Could not save Canvas settings' }
    }

    revalidatePath('/settings')
    return { ok: true as const, settings: data }
  } catch (err) {
    console.error('[updateCanvasSettings] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error saving Canvas settings' }
  }
}

export async function forgetCanvasSettings() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { error } = await client
      .from('user_settings')
      .delete()
      .eq('user_id', user.id)

    if (error) {
      console.error('[forgetCanvasSettings] Supabase error:', error)
      return { ok: false as const, error: 'Could not forget Canvas settings' }
    }

    revalidatePath('/settings')
    revalidatePath('/canvas')
    return { ok: true as const }
  } catch (err) {
    console.error('[forgetCanvasSettings] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error forgetting Canvas settings' }
  }
}

export async function getCanvasCredentials() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return null
  }

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return null

    const { data, error } = await client
      .from('user_settings')
      .select('canvas_api_url, canvas_access_token')
      .eq('user_id', user.id)
      .maybeSingle()

    console.info('[getCanvasCredentials] current-user settings lookup', {
      userId: user.id,
      rowExists: Boolean(data),
      canvasApiUrlPresent: Boolean(data?.canvas_api_url),
      canvasAccessTokenPresent: Boolean(data?.canvas_access_token),
    })

    if (error || !data || !data.canvas_api_url || !data.canvas_access_token) {
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

export async function updateNotificationEmailSource(input: { source: NotificationEmailSource }) {
  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false as const, error: 'Not authenticated' }

  if (!(NOTIFICATION_EMAIL_SOURCES as readonly string[]).includes(input.source)) {
    return { ok: false as const, error: 'Invalid source' }
  }

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { error } = await client
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          notification_email_source: input.source,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )

    if (error) {
      console.error('[updateNotificationEmailSource] Supabase error:', error)
      return { ok: false as const, error: 'Could not save notification email source' }
    }

    revalidatePath('/settings')
    return { ok: true as const }
  } catch (err) {
    console.error('[updateNotificationEmailSource] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error' }
  }
}
