'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { getRequiredSupabaseAuthEnv, isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { getAuthenticatedUserServer } from '@/lib/auth-server'

async function createCoursesClient() {
  const cookieStore = await cookies()
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value })) },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })
}

export async function removeCourseAction(courseId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseAuthConfigured) return { ok: false, error: 'Supabase not configured.' }

  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const client = await createCoursesClient()
  const { error } = await client
    .from('courses')
    .delete()
    .eq('id', courseId)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/courses')
  revalidatePath('/')
  return { ok: true }
}
