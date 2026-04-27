'use server'

import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import { revalidatePath } from 'next/cache'

export interface UserSettings {
  userId: string
  canvasApiUrl: string | null
  canvasAccessToken: string | null
  notificationEmail: string | null
  aiProvider: 'openai' | 'gemini' | 'nemotron'
  createdAt: string
  updatedAt: string
}

export async function getUserSettings() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return { ok: false as const, error: 'Not authenticated' }
  }

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
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }
  } catch (err) {
    console.error('[getUserSettings] Unexpected error:', err)
    return { ok: false as const, error: 'Unexpected error loading settings' }
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
