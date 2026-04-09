'use server'

import { randomUUID } from 'node:crypto'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { serializeErrorForLogging, supabase } from '@/lib/supabase'

const ANNOUNCEMENT_READ_STATE_TABLE = 'announcement_read_state'
const SHARED_VIEWER_COOKIE = 'stay-focused-user-key'
const AUTHENTICATED_VIEWER_KEY_PREFIX = 'auth:'

type AnnouncementReadStateIdentity = {
  userId: string | null
  userKey: string
}

export async function loadAnnouncementReadStates(announcementKeys: string[]) {
  if (!supabase || announcementKeys.length === 0) return []

  const identity = await resolveAnnouncementReadStateIdentity()

  const { data, error } = await supabase
    .from(ANNOUNCEMENT_READ_STATE_TABLE)
    .select('announcement_key')
    .eq('user_key', identity.userKey)
    .in('announcement_key', announcementKeys)

  if (error) {
    console.error('[announcement-read-state] load_failed', {
      userId: identity.userId,
      userKey: identity.userKey,
      announcementKeys,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not load announcement read state.')
  }

  return (data ?? [])
    .map((row) => row.announcement_key)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
}

export async function loadAnnouncementViewedStates(announcementKeys: string[]) {
  return loadAnnouncementReadStates(announcementKeys)
}

export async function markAnnouncementRead(input: {
  announcementKey: string
  moduleId: string
  supportId: string
  title: string
  postedLabel: string | null
  href: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const identity = await resolveAnnouncementReadStateIdentity()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from(ANNOUNCEMENT_READ_STATE_TABLE)
    .upsert({
      announcement_key: input.announcementKey,
      module_id: input.moduleId,
      support_id: input.supportId,
      title: input.title,
      posted_label: input.postedLabel,
      href: input.href,
      user_id: identity.userId,
      user_key: identity.userKey,
      read_at: now,
      updated_at: now,
    }, {
      onConflict: 'user_key,announcement_key',
    })

  if (error) {
    console.error('[announcement-read-state] save_failed', {
      userId: identity.userId,
      userKey: identity.userKey,
      input,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not save announcement read state.')
  }

  revalidatePath('/')
}

export async function markAnnouncementViewed(input: {
  announcementKey: string
  moduleId: string
  supportId: string
  title: string
  postedLabel: string | null
  href: string
}) {
  return markAnnouncementRead(input)
}

export async function markAnnouncementUnread(input: {
  announcementKey: string
}) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const identity = await resolveAnnouncementReadStateIdentity()

  const { error } = await supabase
    .from(ANNOUNCEMENT_READ_STATE_TABLE)
    .delete()
    .eq('user_key', identity.userKey)
    .eq('announcement_key', input.announcementKey)

  if (error) {
    console.error('[announcement-read-state] delete_failed', {
      userId: identity.userId,
      userKey: identity.userKey,
      input,
      error: serializeErrorForLogging(error),
    })
    throw new Error('Could not clear announcement viewed state.')
  }

  revalidatePath('/')
}

async function resolveAnnouncementReadStateIdentity(): Promise<AnnouncementReadStateIdentity> {
  const cookieStore = await cookies()
  const anonymousUserKey = cookieStore.get(SHARED_VIEWER_COOKIE)?.value?.trim() || randomUUID()

  if (!cookieStore.get(SHARED_VIEWER_COOKIE)?.value?.trim()) {
    cookieStore.set(SHARED_VIEWER_COOKIE, anonymousUserKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
  }

  if (!isSupabaseAuthConfigured) {
    return {
      userId: null,
      userKey: anonymousUserKey,
    }
  }

  try {
    const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()
    const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    })

    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (user?.id) {
      return {
        userId: user.id,
        userKey: `${AUTHENTICATED_VIEWER_KEY_PREFIX}${user.id}`,
      }
    }
  } catch (error) {
    console.error('[announcement-read-state] identity_failed', serializeErrorForLogging(error))
  }

  return {
    userId: null,
    userKey: anonymousUserKey,
  }
}
