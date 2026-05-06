import assert from 'node:assert/strict'
import test from 'node:test'
import type { User, UserIdentity } from '@supabase/supabase-js'
import {
  getNotificationEmailOptions,
  resolveEmailFromOptions,
} from '../lib/notification-email-options'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdentity(provider: string, email: string): UserIdentity {
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

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    ...overrides,
  } as User
}

// ---------------------------------------------------------------------------
// getNotificationEmailOptions
// ---------------------------------------------------------------------------

test('default source is supabase_account', () => {
  const user = makeUser({ email: 'account@example.com' })
  const options = getNotificationEmailOptions(user)
  const account = options.find((o) => o.source === 'supabase_account')
  assert.ok(account)
  assert.equal(account.available, true)
  assert.equal(account.email, 'account@example.com')
})

test('supabase account email option always appears first', () => {
  const user = makeUser({ email: 'account@example.com' })
  const options = getNotificationEmailOptions(user)
  assert.equal(options[0].source, 'supabase_account')
})

test('Google option appears enabled when Google identity exists', () => {
  const user = makeUser({
    email: 'account@example.com',
    identities: [makeIdentity('google', 'google@gmail.com')],
  })
  const options = getNotificationEmailOptions(user)
  const google = options.find((o) => o.source === 'linked_google')
  assert.ok(google)
  assert.equal(google.available, true)
  assert.equal(google.email, 'google@gmail.com')
  assert.equal(google.disabledReason, undefined)
})

test('Google option appears disabled when no Google identity', () => {
  const user = makeUser({ email: 'account@example.com', identities: [] })
  const options = getNotificationEmailOptions(user)
  const google = options.find((o) => o.source === 'linked_google')
  assert.ok(google)
  assert.equal(google.available, false)
  assert.equal(google.email, null)
  assert.ok(typeof google.disabledReason === 'string' && google.disabledReason.length > 0)
})

test('Microsoft option appears enabled when azure identity exists', () => {
  const user = makeUser({
    email: 'account@example.com',
    identities: [makeIdentity('azure', 'ms@outlook.com')],
  })
  const options = getNotificationEmailOptions(user)
  const ms = options.find((o) => o.source === 'linked_microsoft')
  assert.ok(ms)
  assert.equal(ms.available, true)
  assert.equal(ms.email, 'ms@outlook.com')
})

test('Microsoft option appears enabled when microsoft provider identity exists', () => {
  const user = makeUser({
    email: 'account@example.com',
    identities: [makeIdentity('microsoft', 'ms@outlook.com')],
  })
  const options = getNotificationEmailOptions(user)
  const ms = options.find((o) => o.source === 'linked_microsoft')
  assert.ok(ms)
  assert.equal(ms.available, true)
})

test('Microsoft option appears disabled when no azure/microsoft identity', () => {
  const user = makeUser({ email: 'account@example.com', identities: [] })
  const options = getNotificationEmailOptions(user)
  const ms = options.find((o) => o.source === 'linked_microsoft')
  assert.ok(ms)
  assert.equal(ms.available, false)
  assert.ok(typeof ms.disabledReason === 'string' && ms.disabledReason.length > 0)
})

test('emails are normalized to lowercase', () => {
  const user = makeUser({
    email: 'Account@Example.COM',
    identities: [makeIdentity('google', 'Google@Gmail.COM')],
  })
  const options = getNotificationEmailOptions(user)
  assert.equal(options.find((o) => o.source === 'supabase_account')?.email, 'account@example.com')
  assert.equal(options.find((o) => o.source === 'linked_google')?.email, 'google@gmail.com')
})

test('getNotificationEmailOptions returns empty options when user is null', () => {
  const options = getNotificationEmailOptions(null)
  assert.equal(options.length, 3)
  for (const opt of options) {
    assert.equal(opt.available, false)
    assert.equal(opt.email, null)
  }
})

// ---------------------------------------------------------------------------
// resolveEmailFromOptions
// ---------------------------------------------------------------------------

test('selected linked_google recipient is used when available', () => {
  const user = makeUser({
    email: 'account@example.com',
    identities: [makeIdentity('google', 'google@gmail.com')],
  })
  const options = getNotificationEmailOptions(user)
  const resolved = resolveEmailFromOptions(options, 'linked_google')
  assert.equal(resolved, 'google@gmail.com')
})

test('selected linked_microsoft recipient is used when available', () => {
  const user = makeUser({
    email: 'account@example.com',
    identities: [makeIdentity('azure', 'ms@outlook.com')],
  })
  const options = getNotificationEmailOptions(user)
  const resolved = resolveEmailFromOptions(options, 'linked_microsoft')
  assert.equal(resolved, 'ms@outlook.com')
})

test('unavailable selected source falls back to account email', () => {
  const user = makeUser({ email: 'account@example.com', identities: [] })
  const options = getNotificationEmailOptions(user)
  const resolved = resolveEmailFromOptions(options, 'linked_google')
  assert.equal(resolved, 'account@example.com')
})

test('unavailable microsoft source falls back to account email', () => {
  const user = makeUser({ email: 'account@example.com', identities: [] })
  const options = getNotificationEmailOptions(user)
  const resolved = resolveEmailFromOptions(options, 'linked_microsoft')
  assert.equal(resolved, 'account@example.com')
})

test('supabase_account source returns account email directly', () => {
  const user = makeUser({ email: 'me@example.com' })
  const options = getNotificationEmailOptions(user)
  const resolved = resolveEmailFromOptions(options, 'supabase_account')
  assert.equal(resolved, 'me@example.com')
})
