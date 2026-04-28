'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'

export async function removeCourseAction(
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return { ok: false, error: 'Database not configured.' }

  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId)
    .eq('user_id', user.id)

  if (error) {
    console.error('[removeCourseAction] error', { courseId, error })
    return { ok: false, error: 'Could not remove the course. Try again.' }
  }

  revalidatePath('/courses')
  revalidatePath('/')
  return { ok: true }
}
