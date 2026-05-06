import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export async function tryAcquireExternalSyncLock(input: {
  lockKey: string
  owner: string
  ttlMs: number
}) {
  const supabase = createSupabaseServiceRoleClient()
  if (!supabase) return false

  const expiresAt = new Date(Date.now() + input.ttlMs).toISOString()
  const { data, error } = await supabase.rpc('try_acquire_external_sync_lock', {
    p_lock_key: input.lockKey,
    p_owner: input.owner,
    p_expires_at: expiresAt,
  })

  if (error) {
    console.error('[external-sync] lock acquisition failed', {
      lockKey: input.lockKey,
      owner: input.owner,
      code: error.code,
      message: error.message,
    })
    return false
  }

  return data === true
}
