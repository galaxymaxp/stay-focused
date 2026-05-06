'use server'

import { getAuthenticatedUserServer, getAuthenticatedUserWithIdentities, createAuthenticatedSupabaseServerClient } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications-server'
import { isResendConfigured, resolveTestEmailRecipient, classifyTestEmailError, sendTransactionalEmail } from '@/lib/resend'
import { isAdminEmail } from '@/lib/admin'
import { getNotificationEmailOptions, resolveEmailFromOptions } from '@/lib/notification-email-options'
import { buildDigestHtml, buildDigestText } from '@/lib/email-templates/canvas-digest'
import type { NotificationType, NotificationSeverity } from '@/lib/notifications-server'

const TEST_TEMPLATES: Record<string, { type: NotificationType; title: string; body: string; severity: NotificationSeverity }> = {
  queue_completed: { type: 'queue_completed', title: 'Queue completed', body: 'Your study pack is ready.', severity: 'success' },
  due_soon: { type: 'due_soon', title: 'Due soon', body: 'You have a task due within 48 hours.', severity: 'warning' },
  new_upload: { type: 'new_resource', title: 'New upload', body: 'A new resource was added to your course.', severity: 'info' },
  announcement: { type: 'new_task', title: 'Announcement', body: 'Your instructor posted a new announcement.', severity: 'info' },
  sync_completed: { type: 'sync_completed', title: 'Sync completed', body: 'Canvas sync finished successfully.', severity: 'success' },
}

export async function createTestNotificationAction(templateKey: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const template = TEST_TEMPLATES[templateKey]
  if (!template) return { ok: false, error: `Unknown template: ${templateKey}` }

  try {
    await createNotification({
      userId: user.id,
      type: template.type,
      title: template.title,
      body: template.body,
      severity: template.severity,
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error.' }
  }
}

export async function isEmailProviderConfigured(): Promise<boolean> {
  return isResendConfigured()
}

async function loadNotificationEmailSource(userId: string) {
  try {
    const client = await createAuthenticatedSupabaseServerClient()
    if (!client) return 'supabase_account'

    const { data } = await client
      .from('user_settings')
      .select('notification_email_source')
      .eq('user_id', userId)
      .maybeSingle()

    const raw = (data as Record<string, unknown> | null)?.notification_email_source as string | null
    if (raw === 'linked_google' || raw === 'linked_microsoft') return raw
    return 'supabase_account'
  } catch {
    return 'supabase_account'
  }
}

export async function sendTestEmailAction(): Promise<{ ok: boolean; error?: string }> {
  if (!isResendConfigured()) {
    return { ok: false, error: 'Email provider not configured in environment variables.' }
  }

  const fullUser = await getAuthenticatedUserWithIdentities()
  if (!fullUser) return { ok: false, error: 'Not authenticated.' }
  if (!fullUser.email) return { ok: false, error: 'No email address on this account.' }
  if (!isAdminEmail(fullUser.email)) return { ok: false, error: 'Not authorized.' }

  // Resolve recipient using the admin's selected notification email source.
  const source = await loadNotificationEmailSource(fullUser.id)
  const options = getNotificationEmailOptions(fullUser)
  const resolvedEmail = resolveEmailFromOptions(options, source) ?? fullUser.email

  const isProduction = process.env.NODE_ENV === 'production'
  const recipient = resolveTestEmailRecipient(resolvedEmail, isProduction)

  console.info('[test-email] sending', {
    to: recipient,
    isProduction,
    usingTestOverride: recipient !== resolvedEmail,
    source,
  })

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://stayfocused.app')

  const testSection = {
    courseId: null,
    courseName: 'Test course',
    appHref: null,
    lines: [{ eventType: 'new_announcement', label: 'This is a test notification', count: 1 }],
  }

  const html = buildDigestHtml({
    courseSections: [testSection],
    totalDisplayLines: 1,
    maxItems: 12,
    appBaseUrl,
  })

  const text = buildDigestText({
    courseSections: [testSection],
    totalDisplayLines: 1,
    maxItems: 12,
    appBaseUrl,
  })

  const result = await sendTransactionalEmail({
    to: recipient,
    subject: '✅ Stay Focused test email',
    html,
    text,
  })

  if (!result.ok) {
    const emailFrom = process.env.EMAIL_FROM ?? ''
    const friendlyError = classifyTestEmailError(emailFrom)
    console.warn('[test-email] send failed', { to: recipient, emailFrom })
    return { ok: false, error: friendlyError }
  }

  return { ok: true }
}
