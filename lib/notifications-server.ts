import { createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'

export type NotificationType =
  | 'queue_completed'
  | 'queue_failed'
  | 'sync_completed'
  | 'new_module'
  | 'new_resource'
  | 'new_task'
  | 'due_soon'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error'

export interface UserNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string | null
  href: string | null
  severity: NotificationSeverity
  metadata: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

function rowToNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    href: (row.href as string | null) ?? null,
    severity: (row.severity as NotificationSeverity) ?? 'info',
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
    createdAt: row.created_at as string,
  }
}

export async function createNotification(input: {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  href?: string | null
  severity?: NotificationSeverity
  metadata?: Record<string, unknown>
}): Promise<UserNotification | null> {
  const client = createSupabaseServiceRoleClient()
  if (!client) {
    // Fall back to authenticated client
    const supabase = await createAuthenticatedSupabaseServerClient()
    if (!supabase) return null

    const { data, error } = await supabase
      .from('user_notifications')
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        severity: input.severity ?? 'info',
        metadata: input.metadata ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[notifications] createNotification failed (anon fallback)', { userId: input.userId, error })
      return null
    }
    return rowToNotification(data as Record<string, unknown>)
  }

  const { data, error } = await client
    .from('user_notifications')
    .insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      severity: input.severity ?? 'info',
      metadata: input.metadata ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('[notifications] createNotification failed', { userId: input.userId, error })
    return null
  }

  return rowToNotification(data as Record<string, unknown>)
}

export async function getUserNotifications(
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
): Promise<UserNotification[]> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return []

  let query = supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 40)

  if (opts?.unreadOnly) {
    query = query.is('read_at', null)
  }

  const { data, error } = await query

  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
      return []
    }
    console.error('[notifications] getUserNotifications failed', { userId, error })
    return []
  }

  return (data as Record<string, unknown>[]).map(rowToNotification)
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)

  return !error
}

export async function markAllNotificationsRead(userId: string): Promise<boolean> {
  const supabase = await createAuthenticatedSupabaseServerClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null)

  return !error
}

export async function deduplicateNotification(opts: {
  userId: string
  type: NotificationType
  dedupeKey: string
  windowHours?: number
}): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient() ?? await createAuthenticatedSupabaseServerClient()
  if (!supabase) return false

  const windowHours = opts.windowHours ?? 24
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('user_notifications')
    .select('id')
    .eq('user_id', opts.userId)
    .eq('type', opts.type)
    .gte('created_at', since)
    .contains('metadata', { dedupeKey: opts.dedupeKey })
    .limit(1)

  return Boolean(data && data.length > 0)
}
