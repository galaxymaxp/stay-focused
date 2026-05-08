import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import type { User } from '@supabase/supabase-js'
import { isAdminEmail, isAdminUser } from '../lib/admin'

function withAdminEmails(value: string | undefined, fn: () => void) {
  const original = process.env.ADMIN_EMAILS
  if (value === undefined) {
    delete process.env.ADMIN_EMAILS
  } else {
    process.env.ADMIN_EMAILS = value
  }
  try {
    fn()
  } finally {
    if (original === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = original
  }
}

function makeUser(overrides: Partial<Pick<User, 'email' | 'identities'>> = {}): Pick<User, 'email' | 'identities'> {
  return {
    email: undefined,
    identities: [],
    ...overrides,
  }
}

function makeIdentity(provider: string, email: string) {
  return {
    provider,
    identity_data: { email },
  } as unknown as NonNullable<User['identities']>[number]
}

// ---------------------------------------------------------------------------
// isAdminEmail
// ---------------------------------------------------------------------------

test('isAdminEmail returns true for a matching admin email', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(isAdminEmail('admin@example.com'), true)
  })
})

test('isAdminEmail returns false for a non-admin email', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(isAdminEmail('user@example.com'), false)
  })
})

test('isAdminEmail returns false when ADMIN_EMAILS is not set', () => {
  withAdminEmails(undefined, () => {
    assert.equal(isAdminEmail('admin@example.com'), false)
  })
})

test('isAdminEmail returns false when ADMIN_EMAILS is empty string', () => {
  withAdminEmails('', () => {
    assert.equal(isAdminEmail('admin@example.com'), false)
  })
})

test('isAdminEmail works with comma-separated list of admin emails', () => {
  withAdminEmails('first@example.com, second@example.com , third@example.com', () => {
    assert.equal(isAdminEmail('first@example.com'), true)
    assert.equal(isAdminEmail('second@example.com'), true)
    assert.equal(isAdminEmail('third@example.com'), true)
    assert.equal(isAdminEmail('fourth@example.com'), false)
  })
})

test('isAdminEmail normalizes email to lowercase for comparison', () => {
  withAdminEmails('Admin@Example.COM', () => {
    assert.equal(isAdminEmail('admin@example.com'), true)
    assert.equal(isAdminEmail('ADMIN@EXAMPLE.COM'), true)
  })
})

test('isAdminEmail returns false for null or undefined input', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(isAdminEmail(null), false)
    assert.equal(isAdminEmail(undefined), false)
  })
})

test('isAdminUser grants access when the primary email matches ADMIN_EMAILS', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(isAdminUser(makeUser({ email: 'admin@example.com' })), true)
  })
})

test('isAdminUser grants access when a linked Google identity matches ADMIN_EMAILS', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(
      isAdminUser(makeUser({
        email: 'student@example.edu',
        identities: [makeIdentity('google', 'admin@example.com')],
      })),
      true,
    )
  })
})

test('isAdminUser grants access when a linked Azure identity matches ADMIN_EMAILS', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(
      isAdminUser(makeUser({
        email: 'student@example.edu',
        identities: [makeIdentity('azure', 'admin@example.com')],
      })),
      true,
    )
  })
})

test('isAdminUser denies access when no account identity matches ADMIN_EMAILS', () => {
  withAdminEmails('admin@example.com', () => {
    assert.equal(
      isAdminUser(makeUser({
        email: 'student@example.edu',
        identities: [
          makeIdentity('google', 'linked@example.edu'),
          makeIdentity('azure', 'azure@example.edu'),
        ],
      })),
      false,
    )
  })
})

test('admin notification lab page exists and gates non-admins with notFound', () => {
  const path = 'app/admin/notification-lab/page.tsx'
  assert.equal(existsSync(path), true)
  const source = readFileSync(path, 'utf8')
  assert.match(source, /notFound\(/)
  assert.match(source, /getAuthenticatedUserWithIdentities\(/)
  assert.match(source, /isAdminUser\(/)
})

test('admin notification lab action checks ADMIN_EMAILS before sending', () => {
  const source = readFileSync('actions/admin-notification-lab.ts', 'utf8')
  assert.match(source, /isAdminUser\(/)
  assert.match(source, /Not authorized\./)
  assert.match(source, /attemptCanvasDigestForUser/)
})
