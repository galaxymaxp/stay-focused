import type { SupabaseClient } from '@supabase/supabase-js'
import { sendTransactionalEmail, isResendConfigured, type TransactionalEmailInput, type TransactionalEmailResult } from '@/lib/resend'
import {
  buildDigestSubject,
  buildDigestHtml,
  buildDigestText,
  type DigestCourseSection,
  type DigestDisplayLine,
} from '@/lib/email-templates/canvas-digest'
import { getNotificationEmailOptions, resolveEmailFromOptions } from '@/lib/notification-email-options'
import type { CanvasUpdateEventType } from '@/lib/canvas-update-events'

const DEFAULT_COOLDOWN_MINUTES = 30
const DEFAULT_MAX_ITEMS = 12

export const MEANINGFUL_EVENT_TYPES: CanvasUpdateEventType[] = [
  'new_announcement',
  'new_assignment',
  'due_date_change',
  'new_module',
  'new_resource',
]

export interface DigestEventRow {
  id: string
  user_id: string
  course_id: string | null
  event_type: string
  title: string
  summary: string | null
  app_href: string | null
  occurred_at: string
  course_name?: string | null
}

export interface DigestAttemptResult {
  sent: boolean
  skipped: boolean
  skipReason?: string
  eventsIncluded: number
  eventsMarked: number
}

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) return process.env.NEXT_PUBLIC_APP_URL.trim()
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://stayfocused.app'
}

function getCooldownMinutes(): number {
  const raw = process.env.CANVAS_UPDATE_EMAIL_COOLDOWN_MINUTES
  if (!raw) return DEFAULT_COOLDOWN_MINUTES
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_COOLDOWN_MINUTES : parsed
}

function getMaxItems(): number {
  const raw = process.env.CANVAS_UPDATE_EMAIL_MAX_ITEMS
  if (!raw) return DEFAULT_MAX_ITEMS
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_ITEMS : parsed
}

// Builds a deterministic idempotency key from sorted event IDs.
export function buildDigestIdempotencyKey(userId: string, eventIds: string[]): string {
  const sorted = [...eventIds].sort()
  const payload = `digest:${userId}:${sorted.join(',')}`
  // Use a simple djb2-like hash to keep the key short and header-safe.
  let hash = 5381
  for (let i = 0; i < payload.length; i++) {
    hash = ((hash << 5) + hash) ^ payload.charCodeAt(i)
    hash = hash >>> 0 // keep unsigned 32-bit
  }
  return `sf-digest-${userId.slice(0, 8)}-${hash.toString(16).padStart(8, '0')}`
}

// Groups and collapses event rows by course + (event_type, title) for display.
export function groupEventsForDisplay(
  events: DigestEventRow[],
  maxItems: number,
): { courseSections: DigestCourseSection[]; totalDisplayLines: number; includedEventIds: string[] } {
  type CourseKey = string
  type LineKey = string

  const courseOrder: CourseKey[] = []
  const courseNames = new Map<CourseKey, string>()
  const courseHrefs = new Map<CourseKey, string | null>()
  const lineOrder = new Map<CourseKey, LineKey[]>()
  const lineEvents = new Map<LineKey, string[]>() // lineKey -> eventIds
  const lineData = new Map<LineKey, { eventType: string; label: string }>()

  for (const ev of events) {
    const courseKey = ev.course_id ?? '__no_course__'
    const lineLabelKey = ev.title.trim().toLowerCase()
    const lineKey = `${courseKey}:${ev.event_type}:${lineLabelKey}`

    if (!courseNames.has(courseKey)) {
      courseOrder.push(courseKey)
      courseNames.set(courseKey, ev.course_name?.trim() || 'Your course')
      courseHrefs.set(courseKey, ev.app_href ?? null)
      lineOrder.set(courseKey, [])
    }

    if (!lineData.has(lineKey)) {
      lineOrder.get(courseKey)!.push(lineKey)
      lineData.set(lineKey, { eventType: ev.event_type, label: ev.title.trim() })
      lineEvents.set(lineKey, [])
    }

    lineEvents.get(lineKey)!.push(ev.id)
  }

  // Count total display lines before truncation.
  let totalDisplayLines = 0
  for (const courseKey of courseOrder) {
    totalDisplayLines += lineOrder.get(courseKey)!.length
  }

  // Build sections up to maxItems display lines.
  const courseSections: DigestCourseSection[] = []
  const includedEventIds: string[] = []
  let linesUsed = 0

  for (const courseKey of courseOrder) {
    if (linesUsed >= maxItems) break

    const keys = lineOrder.get(courseKey)!
    const lines: DigestDisplayLine[] = []

    for (const lineKey of keys) {
      if (linesUsed >= maxItems) break

      const data = lineData.get(lineKey)!
      const ids = lineEvents.get(lineKey)!
      lines.push({ eventType: data.eventType, label: data.label, count: ids.length })
      includedEventIds.push(...ids)
      linesUsed += 1
    }

    if (lines.length > 0) {
      courseSections.push({
        courseId: courseKey === '__no_course__' ? null : courseKey,
        courseName: courseNames.get(courseKey)!,
        appHref: courseHrefs.get(courseKey) ?? null,
        lines,
      })
    }
  }

  return { courseSections, totalDisplayLines, includedEventIds }
}

// Marks events as digest_sent_at = now(). Returns number marked.
export async function markEventsDigestSent(
  supabase: SupabaseClient,
  eventIds: string[],
  sentAt = new Date(),
): Promise<number> {
  if (eventIds.length === 0) return 0

  const now = sentAt.toISOString()
  const { error, count } = await supabase
    .from('canvas_update_events')
    .update({ digest_sent_at: now })
    .in('id', eventIds)
    .is('digest_sent_at', null)
    .select('id')

  if (error) {
    console.warn('[canvas-digest] markEventsDigestSent failed', { code: (error as { code?: string }).code })
    return 0
  }

  return count ?? eventIds.length
}

// Updates canvas_digest_last_sent_at in user_settings.
async function recordDigestSentAt(supabase: SupabaseClient, userId: string, sentAt = new Date()): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: userId, canvas_digest_last_sent_at: sentAt.toISOString() },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.warn('[canvas-digest] recordDigestSentAt failed', { userId })
  }
}

interface UserDigestSettings {
  email: string
  emailNotifications: string
  emailCategories: Record<string, unknown>
  lastSentAt: string | null
}

async function loadUserDigestSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserDigestSettings | null> {
  const { data: settingsRow } = await supabase
    .from('user_settings')
    .select('email_notifications, email_categories, canvas_digest_last_sent_at, notification_email, notification_email_source')
    .eq('user_id', userId)
    .maybeSingle()

  // Use admin API to get the full user object including linked identities.
  const { data: userRow } = await supabase.auth.admin.getUserById(userId)
  const supabaseUser = userRow?.user ?? null

  const accountEmail = supabaseUser?.email ?? null
  const rawNotificationEmail = (settingsRow as Record<string, unknown> | null)?.notification_email as string | null ?? null

  // Resolve which email to actually send to based on notification_email_source.
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

  // Final fallback chain: source-resolved → notification_email column → account email.
  const notificationEmail = resolvedEmail ?? rawNotificationEmail ?? accountEmail

  if (!notificationEmail) return null

  const emailNotifications = (settingsRow as Record<string, unknown> | null)?.email_notifications as string ?? 'off'
  const emailCategories = (settingsRow as Record<string, unknown> | null)?.email_categories as Record<string, unknown> | null ?? {}
  const lastSentAt = (settingsRow as Record<string, unknown> | null)?.canvas_digest_last_sent_at as string | null ?? null

  return {
    email: notificationEmail,
    emailNotifications,
    emailCategories,
    lastSentAt,
  }
}

function isDigestEventEnabled(eventType: string, categories: Record<string, unknown>): boolean {
  if (Boolean(categories.canvas_updates)) return true

  if (eventType === 'new_announcement') return Boolean(categories.announcements)
  if (eventType === 'new_assignment' || eventType === 'due_date_change') {
    return Boolean(categories.due_soon) || Boolean(categories.deadlines) || Boolean(categories.tasks)
  }
  if (eventType === 'new_module' || eventType === 'new_resource') {
    return Boolean(categories.new_uploads)
  }

  return false
}

// Main entry point — called from external canvas sync after event insertion.
export async function attemptCanvasDigestForUser(input: {
  supabase: SupabaseClient
  userId: string
  now?: Date
  sendEmail?: (input: TransactionalEmailInput) => Promise<TransactionalEmailResult>
}): Promise<DigestAttemptResult> {
  const { supabase, userId } = input
  const now = input.now ?? new Date()
  const sendEmail = input.sendEmail ?? sendTransactionalEmail

  if (!isResendConfigured()) {
    return { sent: false, skipped: true, skipReason: 'resend_not_configured', eventsIncluded: 0, eventsMarked: 0 }
  }

  const userSettings = await loadUserDigestSettings(supabase, userId)

  if (!userSettings) {
    return { sent: false, skipped: true, skipReason: 'no_email', eventsIncluded: 0, eventsMarked: 0 }
  }

  if (userSettings.emailNotifications === 'off') {
    return { sent: false, skipped: true, skipReason: 'email_notifications_off', eventsIncluded: 0, eventsMarked: 0 }
  }

  // Cooldown check.
  const cooldownMinutes = getCooldownMinutes()
  if (userSettings.lastSentAt) {
    const lastSent = new Date(userSettings.lastSentAt).getTime()
    const elapsed = now.getTime() - lastSent
    if (elapsed < cooldownMinutes * 60 * 1000) {
      return { sent: false, skipped: true, skipReason: 'cooldown', eventsIncluded: 0, eventsMarked: 0 }
    }
  }

  // Load unsent meaningful events.
  const { data: eventRows, error: fetchError } = await supabase
    .from('canvas_update_events')
    .select('id, user_id, course_id, event_type, title, summary, app_href, occurred_at, courses(name)')
    .eq('user_id', userId)
    .in('event_type', MEANINGFUL_EVENT_TYPES)
    .is('digest_sent_at', null)
    .order('occurred_at', { ascending: true })
    .limit(200)

  if (fetchError) {
    console.warn('[canvas-digest] event fetch failed', { userId, code: (fetchError as { code?: string }).code })
    return { sent: false, skipped: true, skipReason: 'event_fetch_failed', eventsIncluded: 0, eventsMarked: 0 }
  }

  const rawRows = (eventRows ?? []) as Array<Record<string, unknown>>

  // Normalise join: `courses` may come back as an object or null.
  const rows: DigestEventRow[] = rawRows.map((row) => {
    const courseJoin = row.courses as { name?: string } | null
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      course_id: (row.course_id as string | null) ?? null,
      event_type: row.event_type as string,
      title: row.title as string,
      summary: (row.summary as string | null) ?? null,
      app_href: (row.app_href as string | null) ?? null,
      occurred_at: row.occurred_at as string,
      course_name: courseJoin?.name ?? null,
    }
  })

  if (rows.length === 0) {
    return { sent: false, skipped: true, skipReason: 'no_unsent_events', eventsIncluded: 0, eventsMarked: 0 }
  }

  const enabledRows = rows.filter((row) => isDigestEventEnabled(row.event_type, userSettings.emailCategories))

  if (enabledRows.length === 0) {
    return { sent: false, skipped: true, skipReason: 'email_categories_disabled', eventsIncluded: 0, eventsMarked: 0 }
  }

  const maxItems = getMaxItems()
  const { courseSections, totalDisplayLines, includedEventIds } = groupEventsForDisplay(enabledRows, maxItems)

  if (courseSections.length === 0) {
    return { sent: false, skipped: true, skipReason: 'no_display_lines', eventsIncluded: 0, eventsMarked: 0 }
  }

  const appBaseUrl = getAppBaseUrl()
  const subject = buildDigestSubject(courseSections)
  const html = buildDigestHtml({ courseSections, totalDisplayLines, maxItems, appBaseUrl })
  const text = buildDigestText({ courseSections, totalDisplayLines, maxItems, appBaseUrl })

  // All event IDs (not just displayed ones) should be marked sent after a successful send,
  // because the email tells the user to "open Stay Focused to see the rest."
  // This prevents the hidden overflow from triggering a duplicate digest next run.
  const allEventIds = enabledRows.map((r) => r.id)
  const idempotencyKey = buildDigestIdempotencyKey(userId, allEventIds)

  const result = await sendEmail({
    to: userSettings.email,
    subject,
    html,
    text,
    idempotencyKey,
    tags: [{ name: 'type', value: 'canvas_digest' }],
  })

  if (!result.ok) {
    console.warn('[canvas-digest] send failed — events not marked', { userId })
    return { sent: false, skipped: false, skipReason: 'send_failed', eventsIncluded: includedEventIds.length, eventsMarked: 0 }
  }

  // Mark ALL fetched events as sent (including overflow) since the email directs them to the app.
  const marked = await markEventsDigestSent(supabase, allEventIds, now)
  await recordDigestSentAt(supabase, userId, now)

  console.info('[canvas-digest] digest sent', { userId, eventsMarked: marked, messageId: result.messageId })

  return { sent: true, skipped: false, eventsIncluded: includedEventIds.length, eventsMarked: marked }
}
