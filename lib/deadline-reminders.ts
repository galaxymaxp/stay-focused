import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getNotificationEmailOptions, resolveEmailFromOptions } from '@/lib/notification-email-options'
import { isResendConfigured, sendTransactionalEmail, type TransactionalEmailInput, type TransactionalEmailResult } from '@/lib/resend'
import {
  buildDeadlineReminderHtml,
  buildDeadlineReminderSubject,
  buildDeadlineReminderText,
} from '@/lib/email-templates/deadline-reminder'

export type DeadlineReminderWindow = 'due_tomorrow' | 'due_today'
export type DeadlineReminderSourceType = 'task' | 'deadline'

export interface DeadlineReminderCandidate {
  userId: string
  sourceType: DeadlineReminderSourceType
  sourceId: string
  title: string
  courseName: string | null
  dueAt: string
  appHref: string | null
}

interface ReminderUserSettings {
  email: string
  emailNotifications: string
  emailCategories: Record<string, unknown>
}

export interface DeadlineReminderRunResult {
  scanned: number
  sent: number
  skipped: number
  failed: number
}

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return process.env.NEXT_PUBLIC_APP_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://stayfocused.app'
}

export function getDeadlineReminderWindow(dueAt: string, now = new Date()): DeadlineReminderWindow | null {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null

  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dueStart = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
  const dayDiff = Math.floor((dueStart - todayStart) / 86_400_000)

  if (dayDiff === 0) return 'due_today'
  if (dayDiff === 1) return 'due_tomorrow'
  return null
}

export function isDeadlineReminderEmailEnabled(settings: {
  emailNotifications?: string | null
  emailCategories?: Record<string, unknown> | null
}): boolean {
  if (settings.emailNotifications === 'off') return false

  const categories = settings.emailCategories ?? {}
  for (const key of ['deadline_reminders', 'deadlines', 'tasks', 'due_soon']) {
    if (typeof categories[key] === 'boolean') return categories[key] as boolean
  }

  return true
}

async function loadReminderUserSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<ReminderUserSettings | null> {
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('email_notifications, email_categories, notification_email, notification_email_source')
    .eq('user_id', userId)
    .maybeSingle()

  const { data: userRow } = await supabase.auth.admin.getUserById(userId)
  const supabaseUser = (userRow?.user ?? null) as User | null
  const accountEmail = supabaseUser?.email ?? null
  const rawNotificationEmail = (settingsRow as Record<string, unknown> | null)?.notification_email as string | null ?? null

  const rawSource = (settingsRow as Record<string, unknown> | null)?.notification_email_source as string | null ?? 'supabase_account'
  const emailSource =
    rawSource === 'linked_google' || rawSource === 'linked_microsoft'
      ? rawSource
      : ('supabase_account' as const)

  let resolvedEmail: string | null = null
  if (supabaseUser) {
    const options = getNotificationEmailOptions(supabaseUser)
    resolvedEmail = resolveEmailFromOptions(options, emailSource)
  }

  const email = resolvedEmail ?? rawNotificationEmail ?? accountEmail
  if (!email) return null

  return {
    email,
    emailNotifications: (settingsRow as Record<string, unknown> | null)?.email_notifications as string ?? 'instant',
    emailCategories: (settingsRow as Record<string, unknown> | null)?.email_categories as Record<string, unknown> | null ?? {},
  }
}

export function candidateFromTaskRow(row: Record<string, unknown>): DeadlineReminderCandidate | null {
  const userId = row.user_id as string | null
  const sourceId = row.id as string | null
  const dueAt = row.deadline as string | null
  const title = row.title as string | null
  if (!userId || !sourceId || !dueAt || !title?.trim()) return null

  const courseJoin = row.courses as { name?: string | null } | null
  const moduleId = row.module_id as string | null
  const courseId = row.course_id as string | null
  const canvasUrl = row.canvas_url as string | null

  return {
    userId,
    sourceType: 'task',
    sourceId,
    title: title.trim(),
    courseName: courseJoin?.name ?? null,
    dueAt,
    appHref: moduleId ? `/modules/${moduleId}/tasks` : courseId ? `/courses/${courseId}` : canvasUrl,
  }
}

export function candidateFromDeadlineRow(row: Record<string, unknown>): DeadlineReminderCandidate | null {
  const userId = row.user_id as string | null
  const sourceId = row.id as string | null
  const dueAt = row.date as string | null
  const title = row.label as string | null
  if (!userId || !sourceId || !dueAt || !title?.trim()) return null

  const modulesJoin = row.modules as { course_id?: string | null; courses?: { name?: string | null } | null } | null
  const moduleId = row.module_id as string | null
  const courseId = modulesJoin?.course_id ?? null

  return {
    userId,
    sourceType: 'deadline',
    sourceId,
    title: title.trim(),
    courseName: modulesJoin?.courses?.name ?? null,
    dueAt,
    appHref: moduleId ? `/modules/${moduleId}/tasks` : courseId ? `/courses/${courseId}` : null,
  }
}

async function loadReminderCandidates(
  supabase: SupabaseClient,
  now: Date,
): Promise<DeadlineReminderCandidate[]> {
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const afterTomorrowEnd = new Date(todayStart.getTime() + 3 * 86_400_000)
  const todayIso = todayStart.toISOString()
  const afterTomorrowIso = afterTomorrowEnd.toISOString()

  const [tasksResult, deadlinesResult] = await Promise.all([
    supabase
      .from('task_items')
      .select('id, title, deadline, user_id, module_id, course_id, canvas_url, courses(name)')
      .eq('status', 'pending')
      .gte('deadline', todayIso)
      .lt('deadline', afterTomorrowIso)
      .limit(500),
    supabase
      .from('deadlines')
      .select('id, label, date, user_id, module_id, modules(course_id, courses(name))')
      .gte('date', todayIso)
      .lt('date', afterTomorrowIso)
      .limit(500),
  ])

  if (tasksResult.error) {
    console.warn('[deadline-reminders] task lookup failed', { code: (tasksResult.error as { code?: string }).code })
  }
  if (deadlinesResult.error) {
    console.warn('[deadline-reminders] deadline lookup failed', { code: (deadlinesResult.error as { code?: string }).code })
  }

  return [
    ...((tasksResult.data ?? []) as Record<string, unknown>[]).map(candidateFromTaskRow).filter((item): item is DeadlineReminderCandidate => Boolean(item)),
    ...((deadlinesResult.data ?? []) as Record<string, unknown>[]).map(candidateFromDeadlineRow).filter((item): item is DeadlineReminderCandidate => Boolean(item)),
  ]
}

async function reserveReminderLog(input: {
  supabase: SupabaseClient
  candidate: DeadlineReminderCandidate
  reminderWindow: DeadlineReminderWindow
  sentTo: string
  sentAt: Date
}): Promise<{ reserved: boolean; logId: string | null }> {
  const logId = crypto.randomUUID()
  const { error } = await input.supabase
    .from('deadline_reminder_email_logs')
    .insert({
      id: logId,
      user_id: input.candidate.userId,
      source_type: input.candidate.sourceType,
      source_id: input.candidate.sourceId,
      reminder_window: input.reminderWindow,
      sent_to: input.sentTo,
      sent_at: input.sentAt.toISOString(),
    })

  if (!error) return { reserved: true, logId }

  if ((error as { code?: string }).code === '23505') {
    return { reserved: false, logId: null }
  }

  console.warn('[deadline-reminders] reserve log failed', {
    userId: input.candidate.userId,
    sourceType: input.candidate.sourceType,
    sourceId: input.candidate.sourceId,
    code: (error as { code?: string }).code,
  })
  return { reserved: false, logId: null }
}

async function releaseReminderLog(supabase: SupabaseClient, logId: string | null): Promise<void> {
  if (!logId) return
  await supabase.from('deadline_reminder_email_logs').delete().eq('id', logId)
}

export async function sendDeadlineReminderEmails(input: {
  supabase: SupabaseClient
  now?: Date
  sendEmail?: (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>
}): Promise<DeadlineReminderRunResult> {
  const now = input.now ?? new Date()
  const sendEmail = input.sendEmail ?? sendTransactionalEmail

  if (!isResendConfigured()) {
    return { scanned: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const candidates = await loadReminderCandidates(input.supabase, now)
  const appBaseUrl = getAppBaseUrl()
  const settingsByUser = new Map<string, ReminderUserSettings | null>()
  const result: DeadlineReminderRunResult = { scanned: candidates.length, sent: 0, skipped: 0, failed: 0 }

  for (const candidate of candidates) {
    const reminderWindow = getDeadlineReminderWindow(candidate.dueAt, now)
    if (!reminderWindow) {
      result.skipped += 1
      continue
    }

    if (!settingsByUser.has(candidate.userId)) {
      settingsByUser.set(candidate.userId, await loadReminderUserSettings(input.supabase, candidate.userId))
    }

    const settings = settingsByUser.get(candidate.userId)
    if (!settings?.email || !isDeadlineReminderEmailEnabled(settings)) {
      result.skipped += 1
      continue
    }

    const reservation = await reserveReminderLog({
      supabase: input.supabase,
      candidate,
      reminderWindow,
      sentTo: settings.email,
      sentAt: now,
    })

    if (!reservation.reserved) {
      result.skipped += 1
      continue
    }

    const templateInput = {
      title: candidate.title,
      courseName: candidate.courseName,
      dueAt: candidate.dueAt,
      appHref: candidate.appHref,
      appBaseUrl,
      reminderWindow,
    }

    const sendResult = await sendEmail({
      to: settings.email,
      subject: buildDeadlineReminderSubject(templateInput),
      html: buildDeadlineReminderHtml(templateInput),
      text: buildDeadlineReminderText(templateInput),
      idempotencyKey: `sf-deadline-${candidate.userId.slice(0, 8)}-${candidate.sourceType}-${candidate.sourceId}-${reminderWindow}`,
      tags: [{ name: 'type', value: 'deadline_reminder' }],
    })

    if (!sendResult.ok) {
      await releaseReminderLog(input.supabase, reservation.logId)
      result.failed += 1
      continue
    }

    result.sent += 1
  }

  return result
}
