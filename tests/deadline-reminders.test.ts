import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDeadlineReminderWindow,
  isDeadlineReminderEmailEnabled,
  sendDeadlineReminderEmails,
} from '../lib/deadline-reminders'

test('deadline reminder window selects due today and due tomorrow only', () => {
  const now = new Date('2026-05-07T10:00:00.000Z')

  assert.equal(getDeadlineReminderWindow('2026-05-07T23:59:00.000Z', now), 'due_today')
  assert.equal(getDeadlineReminderWindow('2026-05-08T08:00:00.000Z', now), 'due_tomorrow')
  assert.equal(getDeadlineReminderWindow('2026-05-09T08:00:00.000Z', now), null)
  assert.equal(getDeadlineReminderWindow('2026-05-06T23:59:00.000Z', now), null)
})

test('deadline reminder preference defaults enabled when no exact category exists', () => {
  assert.equal(isDeadlineReminderEmailEnabled({ emailNotifications: 'instant', emailCategories: {} }), true)
  assert.equal(isDeadlineReminderEmailEnabled({ emailNotifications: 'daily_digest', emailCategories: { queue_completed: true } }), true)
})

test('deadline reminder preference respects due_soon and email off settings', () => {
  assert.equal(isDeadlineReminderEmailEnabled({ emailNotifications: 'off', emailCategories: { due_soon: true } }), false)
  assert.equal(isDeadlineReminderEmailEnabled({ emailNotifications: 'instant', emailCategories: { due_soon: false } }), false)
  assert.equal(isDeadlineReminderEmailEnabled({ emailNotifications: 'instant', emailCategories: { deadline_reminders: true, due_soon: false } }), true)
})

test('deadline reminders send due today and tomorrow once per source window', async () => {
  const restore = configureResendForReminderTest()
  const supabase = createReminderSupabase({
    tasks: [
      makeTask({ id: 'task-today', title: 'Lab report', deadline: '2026-05-07T23:59:00.000Z' }),
      makeTask({ id: 'task-tomorrow', title: 'Essay draft', deadline: '2026-05-08T09:00:00.000Z' }),
      makeTask({ id: 'task-later', title: 'Later task', deadline: '2026-05-09T09:00:00.000Z' }),
    ],
  })
  const emails: string[] = []

  const first = await sendDeadlineReminderEmails({
    supabase: supabase as never,
    now: new Date('2026-05-07T10:00:00.000Z'),
    sendEmail: async (email) => {
      emails.push(email.subject)
      return { ok: true, messageId: `msg-${emails.length}` }
    },
  })

  const second = await sendDeadlineReminderEmails({
    supabase: supabase as never,
    now: new Date('2026-05-07T10:00:00.000Z'),
    sendEmail: async (email) => {
      emails.push(email.subject)
      return { ok: true, messageId: `msg-${emails.length}` }
    },
  })

  assert.equal(first.scanned, 3)
  assert.equal(first.sent, 2)
  assert.equal(first.skipped, 1)
  assert.equal(second.sent, 0)
  assert.equal(second.skipped, 3)
  assert.deepEqual(emails, ['Due today: Lab report', 'Due tomorrow: Essay draft'])
  assert.equal(supabase.logs.length, 2)
  restore()
})

test('deadline reminders release dedupe log when Resend send fails', async () => {
  const restore = configureResendForReminderTest()
  const supabase = createReminderSupabase({
    tasks: [makeTask({ id: 'task-fail', title: 'Problem set', deadline: '2026-05-08T09:00:00.000Z' })],
  })

  const first = await sendDeadlineReminderEmails({
    supabase: supabase as never,
    now: new Date('2026-05-07T10:00:00.000Z'),
    sendEmail: async () => ({ ok: false }),
  })
  assert.equal(first.failed, 1)
  assert.equal(supabase.logs.length, 0)

  const second = await sendDeadlineReminderEmails({
    supabase: supabase as never,
    now: new Date('2026-05-07T10:00:00.000Z'),
    sendEmail: async () => ({ ok: true }),
  })

  assert.equal(second.sent, 1)
  assert.equal(supabase.logs.length, 1)
  restore()
})

function configureResendForReminderTest() {
  const originalKey = process.env.RESEND_API_KEY
  const originalFrom = process.env.EMAIL_FROM
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'Stay Focused <noreply@example.com>'
  return () => {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = originalKey
    if (originalFrom === undefined) delete process.env.EMAIL_FROM
    else process.env.EMAIL_FROM = originalFrom
  }
}

function makeTask(input: { id: string; title: string; deadline: string }) {
  return {
    id: input.id,
    title: input.title,
    deadline: input.deadline,
    user_id: 'user-1',
    module_id: 'module-1',
    course_id: 'course-1',
    canvas_url: null,
    courses: { name: 'Data Organization' },
  }
}

function createReminderSupabase(input: { tasks: Record<string, unknown>[] }) {
  const state = {
    tasks: input.tasks,
    deadlines: [] as Record<string, unknown>[],
    logs: [] as Record<string, unknown>[],
    settings: {
      email_notifications: 'instant',
      email_categories: {},
      notification_email: null,
      notification_email_source: 'supabase_account',
    },
  }

  return {
    ...state,
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              id: 'user-1',
              email: 'student@example.com',
              app_metadata: {},
              user_metadata: {},
              aud: 'authenticated',
              created_at: '2026-05-07T00:00:00.000Z',
              identities: [],
            },
          },
        }),
      },
    },
    from(table: string) {
      if (table === 'task_items') {
        return selectList(state.tasks)
      }
      if (table === 'deadlines') {
        return selectList(state.deadlines)
      }
      if (table === 'user_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: state.settings, error: null }),
            }),
          }),
        }
      }
      if (table === 'deadline_reminder_email_logs') {
        return {
          insert: async (row: Record<string, unknown>) => {
            const dupe = state.logs.some((log) =>
              log.user_id === row.user_id
              && log.source_type === row.source_type
              && log.source_id === row.source_id
              && log.reminder_window === row.reminder_window,
            )
            if (dupe) return { error: { code: '23505', message: 'duplicate key value' } }
            state.logs.push({ ...row })
            return { error: null }
          },
          delete: () => ({
            eq: (_column: string, id: string) => {
              const index = state.logs.findIndex((log) => log.id === id)
              if (index >= 0) state.logs.splice(index, 1)
              return Promise.resolve({ error: null })
            },
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

function selectList(rows: Record<string, unknown>[]) {
  return {
    select: () => ({
      eq: () => ({
        gte: () => ({
          lt: () => ({
            limit: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
      gte: () => ({
        lt: () => ({
          limit: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  }
}
