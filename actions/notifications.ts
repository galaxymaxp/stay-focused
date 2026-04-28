'use server'

import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { createNotification, type NotificationType } from '@/lib/notifications-server'

const TEST_NOTIFICATION_TEMPLATES: Record<string, { type: NotificationType; title: string; body: string; href?: string }> = {
  queue_completed: {
    type: 'queue_completed',
    title: 'Deep Learn pack ready',
    body: 'Your exam prep pack for "Test Resource" is ready to study.',
    href: '/library',
  },
  due_soon: {
    type: 'due_soon',
    title: 'Task due soon',
    body: 'Assignment: "Week 4 Reading Response" is due in 48 hours.',
  },
  new_upload: {
    type: 'new_resource',
    title: 'New resource uploaded',
    body: 'Your instructor added "Module 5 Lecture Slides" to Biology 101.',
  },
  announcement: {
    type: 'new_task',
    title: 'New announcement',
    body: 'Your instructor posted a new announcement in Chemistry 202.',
  },
  sync_completed: {
    type: 'sync_completed',
    title: 'Canvas sync complete',
    body: 'Stay Focused synced 3 courses and found 12 new items.',
  },
}

export async function createTestNotificationAction(
  templateKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getAuthenticatedUserServer()
  if (!user) return { ok: false, error: 'Not authenticated.' }

  const template = TEST_NOTIFICATION_TEMPLATES[templateKey]
  if (!template) return { ok: false, error: `Unknown test type: ${templateKey}` }

  const result = await createNotification({
    userId: user.id,
    type: template.type,
    title: template.title,
    body: template.body,
    href: template.href ?? null,
    severity: template.type === 'due_soon' ? 'warning' : template.type === 'queue_completed' || template.type === 'sync_completed' ? 'success' : 'info',
    metadata: { test: true },
  })

  if (!result) return { ok: false, error: 'Failed to create notification.' }
  return { ok: true }
}

export async function isEmailProviderConfigured(): Promise<boolean> {
  return Boolean(
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_HOST ||
    process.env.EMAIL_PROVIDER,
  )
}
