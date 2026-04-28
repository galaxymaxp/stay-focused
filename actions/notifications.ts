'use server'

import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { createNotification } from '@/lib/notifications-server'
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
  return Boolean(
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_HOST ||
    process.env.EMAIL_PROVIDER,
  )
}

export async function sendTestEmailAction(): Promise<{ ok: boolean; error?: string }> {
  const configured = await isEmailProviderConfigured()
  if (!configured) {
    return { ok: false, error: 'Email provider not configured in environment variables.' }
  }

  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  // Email sending is provider-specific; configure RESEND_API_KEY, SENDGRID_API_KEY,
  // SMTP_HOST, or EMAIL_PROVIDER in Vercel environment variables to enable this.
  return { ok: false, error: 'Email provider detected but sending is not yet implemented for this provider.' }
}
