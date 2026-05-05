'use server'

import { revalidatePath } from 'next/cache'
import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'

export async function markSourceProgress(
  sourceTable: string,
  sourceId: string,
  status: 'completed' | 'reviewed',
) {
  const client = await createAuthenticatedSupabaseServerClient()
  if (!client) throw new Error('Supabase is not configured.')

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user?.id) throw new Error('You need to sign in before updating progress.')

  const now = new Date().toISOString()

  const { error } = await client.from('user_source_progress').upsert(
    {
      user_id: user.id,
      source_table: sourceTable,
      source_id: sourceId,
      status,
      reviewed_at: status === 'reviewed' ? now : null,
      completed_at: status === 'completed' ? now : null,
      updated_at: now,
    },
    { onConflict: 'user_id,source_table,source_id' },
  )

  if (error) {
    console.error('[source-progress] upsert failed', { sourceTable, sourceId, status, error: error.message })
    throw new Error('Failed to save progress.')
  }

  revalidatePath('/')
}
