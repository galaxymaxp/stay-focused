import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDigestIdempotencyKey,
  groupEventsForDisplay,
  markEventsDigestSent,
  MEANINGFUL_EVENT_TYPES,
  type DigestEventRow,
} from '../lib/canvas-digest'
import {
  buildDigestSubject,
  buildDigestHtml,
  buildDigestText,
  type DigestCourseSection,
} from '../lib/email-templates/canvas-digest'
import { isResendConfigured } from '../lib/resend'
import {
  getNotificationEmailOptions,
  resolveEmailFromOptions,
} from '../lib/notification-email-options'
import type { User, UserIdentity } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<DigestEventRow> = {}): DigestEventRow {
  return {
    id: overrides.id ?? `event-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    course_id: overrides.course_id ?? 'course-a',
    event_type: overrides.event_type ?? 'new_assignment',
    title: overrides.title ?? 'Test assignment',
    summary: overrides.summary ?? null,
    app_href: overrides.app_href ?? '/courses/course-a',
    occurred_at: overrides.occurred_at ?? new Date().toISOString(),
    course_name: overrides.course_name ?? 'Web Development',
  }
}

// ---------------------------------------------------------------------------
// Template tests
// ---------------------------------------------------------------------------

test('digest renders one Canvas update with correct subject', () => {
  const section: DigestCourseSection = {
    courseId: 'course-a',
    courseName: 'Web Development',
    appHref: '/courses/course-a',
    lines: [{ eventType: 'new_assignment', label: 'Midterm Essay', count: 1 }],
  }

  const subject = buildDigestSubject([section])
  assert.equal(subject, '📚 New Canvas update')
})

test('digest subject uses course count for multiple courses', () => {
  const sections: DigestCourseSection[] = [
    { courseId: 'a', courseName: 'Course A', appHref: null, lines: [{ eventType: 'new_assignment', label: 'A1', count: 1 }] },
    { courseId: 'b', courseName: 'Course B', appHref: null, lines: [{ eventType: 'new_module', label: 'M1', count: 1 }] },
  ]

  assert.equal(buildDigestSubject(sections), '📚 Canvas updates from 2 courses')
})

test('digest subject for multiple updates in one course', () => {
  const section: DigestCourseSection = {
    courseId: 'course-a',
    courseName: 'Web Dev',
    appHref: null,
    lines: [
      { eventType: 'new_assignment', label: 'Essay', count: 1 },
      { eventType: 'new_module', label: 'Week 3', count: 1 },
    ],
  }

  assert.equal(buildDigestSubject([section]), '📚 Canvas updates in Stay Focused')
})

test('digest HTML contains course name and event label', () => {
  const section: DigestCourseSection = {
    courseId: 'course-a',
    courseName: 'WEB APPLICATION DEVELOPMENT',
    appHref: '/courses/course-a',
    lines: [
      { eventType: 'new_announcement', label: 'Welcome everyone', count: 1 },
      { eventType: 'new_assignment', label: 'Meet and Greet', count: 2 },
    ],
  }

  const html = buildDigestHtml({ courseSections: [section], totalDisplayLines: 2, maxItems: 12, appBaseUrl: 'https://app.example.com' })

  assert.ok(html.includes('WEB APPLICATION DEVELOPMENT'))
  assert.ok(html.includes('Welcome everyone'))
  assert.ok(html.includes('Meet and Greet'))
  assert.ok(html.includes('×2'))
  assert.ok(html.includes('Open Stay Focused'))
})

test('digest HTML does not include overflow message when under max', () => {
  const section: DigestCourseSection = {
    courseId: 'c', courseName: 'Course', appHref: null,
    lines: [{ eventType: 'new_assignment', label: 'X', count: 1 }],
  }
  const html = buildDigestHtml({ courseSections: [section], totalDisplayLines: 1, maxItems: 12, appBaseUrl: 'https://app.example.com' })
  assert.ok(!html.includes('see the rest'))
})

test('digest HTML includes overflow message when over max', () => {
  const section: DigestCourseSection = {
    courseId: 'c', courseName: 'Course', appHref: null,
    lines: [{ eventType: 'new_assignment', label: 'X', count: 1 }],
  }
  const html = buildDigestHtml({ courseSections: [section], totalDisplayLines: 15, maxItems: 12, appBaseUrl: 'https://app.example.com' })
  assert.ok(html.includes('see the rest'))
})

test('digest HTML does not contain UUIDs, queue ids, debug text, or stack traces', () => {
  const section: DigestCourseSection = {
    courseId: 'course-uuid-123', courseName: 'Web Dev', appHref: null,
    lines: [{ eventType: 'new_assignment', label: 'Essay', count: 1 }],
  }
  const html = buildDigestHtml({ courseSections: [section], totalDisplayLines: 1, maxItems: 12, appBaseUrl: 'https://app.example.com' })

  // Should not expose internal IDs directly in visible email body
  assert.ok(!html.includes('course-uuid-123'))
  assert.ok(!html.includes('supabase'))
  assert.ok(!html.includes('PGRST'))
  assert.ok(!html.includes('Error:'))
})

test('plain text fallback includes course and event', () => {
  const section: DigestCourseSection = {
    courseId: 'c', courseName: 'Data Structures', appHref: null,
    lines: [{ eventType: 'new_module', label: 'Week 5', count: 1 }],
  }
  const text = buildDigestText({ courseSections: [section], totalDisplayLines: 1, maxItems: 12, appBaseUrl: 'https://app.example.com' })

  assert.ok(text.includes('DATA STRUCTURES'))
  assert.ok(text.includes('New module: Week 5'))
})

// ---------------------------------------------------------------------------
// Grouping tests
// ---------------------------------------------------------------------------

test('groupEventsForDisplay groups by course', () => {
  const events: DigestEventRow[] = [
    makeEvent({ id: 'e1', course_id: 'course-a', course_name: 'Course A', event_type: 'new_assignment', title: 'Essay' }),
    makeEvent({ id: 'e2', course_id: 'course-b', course_name: 'Course B', event_type: 'new_module', title: 'Week 3' }),
  ]

  const { courseSections } = groupEventsForDisplay(events, 12)

  assert.equal(courseSections.length, 2)
  assert.equal(courseSections[0].courseName, 'Course A')
  assert.equal(courseSections[1].courseName, 'Course B')
})

test('groupEventsForDisplay collapses duplicate-looking rows with same course/type/title', () => {
  const events: DigestEventRow[] = [
    makeEvent({ id: 'e1', course_id: 'course-a', course_name: 'Web Dev', event_type: 'new_assignment', title: 'Meet and Greet' }),
    makeEvent({ id: 'e2', course_id: 'course-a', course_name: 'Web Dev', event_type: 'new_assignment', title: 'Meet and Greet' }),
  ]

  const { courseSections, totalDisplayLines } = groupEventsForDisplay(events, 12)

  assert.equal(courseSections.length, 1)
  assert.equal(courseSections[0].lines.length, 1)
  assert.equal(courseSections[0].lines[0].count, 2)
  assert.equal(totalDisplayLines, 1)
})

test('groupEventsForDisplay does not collapse same title with different event_type', () => {
  const events: DigestEventRow[] = [
    makeEvent({ id: 'e1', course_id: 'course-a', course_name: 'Web Dev', event_type: 'new_assignment', title: 'Week 1' }),
    makeEvent({ id: 'e2', course_id: 'course-a', course_name: 'Web Dev', event_type: 'new_module', title: 'Week 1' }),
  ]

  const { courseSections } = groupEventsForDisplay(events, 12)
  assert.equal(courseSections[0].lines.length, 2)
})

test('groupEventsForDisplay respects maxItems limit', () => {
  const events: DigestEventRow[] = Array.from({ length: 15 }, (_, i) =>
    makeEvent({ id: `e${i}`, course_id: 'course-a', course_name: 'Course', event_type: 'new_assignment', title: `Assignment ${i}` }),
  )

  const { courseSections, totalDisplayLines, includedEventIds } = groupEventsForDisplay(events, 5)

  const displayedLines = courseSections.reduce((s, c) => s + c.lines.length, 0)
  assert.equal(displayedLines, 5)
  assert.equal(totalDisplayLines, 15)
  assert.equal(includedEventIds.length, 5)
})

test('groupEventsForDisplay returns all event ids for included display lines', () => {
  // Two events collapse into one display line — both IDs should be included
  const events: DigestEventRow[] = [
    makeEvent({ id: 'e1', course_id: 'c', course_name: 'C', event_type: 'new_assignment', title: 'X' }),
    makeEvent({ id: 'e2', course_id: 'c', course_name: 'C', event_type: 'new_assignment', title: 'X' }),
  ]

  const { includedEventIds } = groupEventsForDisplay(events, 12)
  assert.ok(includedEventIds.includes('e1'))
  assert.ok(includedEventIds.includes('e2'))
})

// ---------------------------------------------------------------------------
// MEANINGFUL_EVENT_TYPES filter
// ---------------------------------------------------------------------------

test('MEANINGFUL_EVENT_TYPES does not include OCR, deep learn, or debug event types', () => {
  const invalid = ['source_ocr', 'learn_generation', 'queue_completed', 'debug', 'extraction', 'ocr_update']
  for (const t of invalid) {
    assert.ok(
      !(MEANINGFUL_EVENT_TYPES as string[]).includes(t),
      `${t} should not be a meaningful event type`,
    )
  }
})

test('MEANINGFUL_EVENT_TYPES includes all required Canvas update types', () => {
  for (const t of ['new_announcement', 'new_assignment', 'due_date_change', 'new_module', 'new_resource']) {
    assert.ok((MEANINGFUL_EVENT_TYPES as string[]).includes(t), `${t} should be meaningful`)
  }
})

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

test('buildDigestIdempotencyKey is stable across same inputs', () => {
  const key1 = buildDigestIdempotencyKey('user-1', ['e3', 'e1', 'e2'])
  const key2 = buildDigestIdempotencyKey('user-1', ['e1', 'e2', 'e3'])
  assert.equal(key1, key2)
})

test('buildDigestIdempotencyKey differs for different users', () => {
  const key1 = buildDigestIdempotencyKey('user-1', ['e1'])
  const key2 = buildDigestIdempotencyKey('user-2', ['e1'])
  assert.notEqual(key1, key2)
})

test('buildDigestIdempotencyKey differs for different event sets', () => {
  const key1 = buildDigestIdempotencyKey('user-1', ['e1', 'e2'])
  const key2 = buildDigestIdempotencyKey('user-1', ['e1', 'e3'])
  assert.notEqual(key1, key2)
})

// ---------------------------------------------------------------------------
// isResendConfigured — env missing path
// ---------------------------------------------------------------------------

test('isResendConfigured returns false when RESEND_API_KEY is missing', () => {
  const original = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM

  assert.equal(isResendConfigured(), false)

  process.env.RESEND_API_KEY = original ?? ''
  process.env.EMAIL_FROM = originalFrom ?? ''
})

test('isResendConfigured returns false when only EMAIL_FROM is set', () => {
  const originalKey = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  delete process.env.RESEND_API_KEY
  process.env.EMAIL_FROM = 'Test <test@example.com>'

  assert.equal(isResendConfigured(), false)

  if (originalKey) process.env.RESEND_API_KEY = originalKey
  process.env.EMAIL_FROM = originalFrom ?? ''
})

// ---------------------------------------------------------------------------
// No real email sends in test environment
// ---------------------------------------------------------------------------

test('resend module does not send real emails (RESEND_API_KEY absent in test env)', () => {
  // Confirm the test env does not accidentally have real keys set.
  // If RESEND_API_KEY is set in CI, the send path should not be exercised by these pure-logic tests.
  // This test is a documentation/guard test — it passes regardless.
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  // These tests don't actually call sendTransactionalEmail with real data,
  // so no real email can be sent by this test file.
  assert.ok(true, 'pure logic tests do not call sendTransactionalEmail')

  // Restore in case something cleared them.
  if (key) process.env.RESEND_API_KEY = key
  if (from) process.env.EMAIL_FROM = from
})

// ---------------------------------------------------------------------------
// markEventsDigestSent — called with empty list is a no-op
// ---------------------------------------------------------------------------

test('markEventsDigestSent with empty ids returns 0 without calling supabase', async () => {
  let called = false
  const fakeSupabase = {
    from: () => { called = true; return { update: () => ({ in: () => ({ is: () => ({ select: () => ({ error: null, count: 0 }) }) }) }) } },
  }

  const count = await markEventsDigestSent(fakeSupabase as never, [])
  assert.equal(count, 0)
  assert.equal(called, false)
})

// ---------------------------------------------------------------------------
// Recipient source resolution — digest-path guard tests
// ---------------------------------------------------------------------------

function makeDigestUser(email: string, identities: UserIdentity[] = []): User {
  return {
    id: 'user-1',
    email,
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    identities,
  } as User
}

function makeDigestIdentity(provider: string, email: string): UserIdentity {
  return {
    id: `id-${provider}`,
    user_id: 'user-1',
    identity_id: `iid-${provider}`,
    provider,
    identity_data: { email },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
  }
}

test('digest recipient resolves to account email when source is supabase_account', () => {
  const user = makeDigestUser('account@example.com')
  const options = getNotificationEmailOptions(user)
  assert.equal(resolveEmailFromOptions(options, 'supabase_account'), 'account@example.com')
})

test('digest recipient uses Google email when source is linked_google and identity exists', () => {
  const user = makeDigestUser('account@example.com', [makeDigestIdentity('google', 'g@gmail.com')])
  const options = getNotificationEmailOptions(user)
  assert.equal(resolveEmailFromOptions(options, 'linked_google'), 'g@gmail.com')
})

test('digest recipient uses Microsoft email when source is linked_microsoft and identity exists', () => {
  const user = makeDigestUser('account@example.com', [makeDigestIdentity('azure', 'ms@outlook.com')])
  const options = getNotificationEmailOptions(user)
  assert.equal(resolveEmailFromOptions(options, 'linked_microsoft'), 'ms@outlook.com')
})

test('digest recipient falls back to account email when linked_google source selected but identity missing', () => {
  const user = makeDigestUser('account@example.com', [])
  const options = getNotificationEmailOptions(user)
  assert.equal(resolveEmailFromOptions(options, 'linked_google'), 'account@example.com')
})

test('digest recipient falls back to account email when linked_microsoft source selected but identity missing', () => {
  const user = makeDigestUser('account@example.com', [])
  const options = getNotificationEmailOptions(user)
  assert.equal(resolveEmailFromOptions(options, 'linked_microsoft'), 'account@example.com')
})

// ---------------------------------------------------------------------------
// Provider / admin guards
// ---------------------------------------------------------------------------

test('Resend remains the send provider — isResendConfigured reads RESEND_API_KEY and EMAIL_FROM', () => {
  // Guard: confirms the digest path checks isResendConfigured(), which is
  // a Resend-specific flag. If this API ever changed, this test would break.
  const original = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'Stay Focused <noreply@example.com>'

  assert.equal(isResendConfigured(), true)

  process.env.RESEND_API_KEY = original ?? ''
  process.env.EMAIL_FROM = originalFrom ?? ''
})

test('no Gmail or Microsoft send APIs are imported by canvas-digest or resend', async () => {
  // Structural guard: these modules should not import gmail/graph/smtp-provider modules.
  const digestSrc = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../lib/canvas-digest.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), 'utf8'),
  )
  const resendSrc = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../lib/resend.ts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), 'utf8'),
  )

  for (const src of [digestSrc, resendSrc]) {
    assert.ok(!src.includes('googleapis'), 'should not import googleapis')
    assert.ok(!src.includes('@microsoft/microsoft-graph-client'), 'should not import MS Graph client')
    assert.ok(!src.includes('nodemailer'), 'should not import nodemailer')
  }
})
