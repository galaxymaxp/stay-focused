'use server'

import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import { revalidatePath } from 'next/cache'

export interface EmailCategories {
  due_soon: boolean
  new_uploads: boolean
  announcements: boolean
  queue_completed: boolean
}

const DEFAULT_EMAIL_CATEGORIES: EmailCategories = {
  due_soon: true,
  new_uploads: true,
  announcements: false,
  queue_completed: true,
}

export interface UserSettings {
  userId: string
  canvasApiUrl: string | null
  canvasAccessToken: string | null
  notificationEmail: string | null
  aiProvider: 'openai' | 'gemini' | 'nemotron'
  emailNotifications: 'off' | 'instant' | 'daily_digest'
  emailCategories: EmailCategories
  emailProviderConfigured: boolean
  createdAt: string
  updatedAt: string
}

export async function getUserSettings() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return { ok: false as const, error: 'Not authenticated' }
  }

  const emailProviderConfigured = Boolean(
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_HOST ||
    process.env.EMAIL_PROVIDER,
  )

  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return { ok: false as const, error: 'Supabase is not configured' }

    const { data, error } = await client
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      console.error('[getUserSettings] Supabase error:', error)
      return { ok: false as const, error: 'Could not load settings' }
    }

    if (!data) {
      return {
        ok: true as const,
        settings: {
          userId: user.id,
          canvasApiUrl: null,
          canvasAccessToken: null,
          notificationEmail: user.email ?? null,
          aiProvider: 'openai' as const,
          emailNotifications: 'off' as const,
          emailCategories: DEFAULT_EMAIL_CATEGORIES,
          emailProviderConfigured,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    }

    return {
      ok: true as const,
      settings: {
        userId: data.user_id,
        canvasApiUrl: data.canvas_api_url,
        canvasAccessToken: data.canvas_access_token,
        notificationEmail: data.notification_email,
        aiProvider: (data.ai_provider ?? 'openai') as 'openai' | 'gemini' | 'nemotron',
        emailNotifications: (data.email_notifications ?? 'off') as 'off' | 'instant' | 'daily_digest',
        emailCategories: { ...DEFAULT_EMAIL_CATEGORIES, ...(data.email_categories as Partial<EmailCategories> ?? {}) },
        emailProviderConfigured,
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
