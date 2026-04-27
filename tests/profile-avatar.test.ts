import assert from 'node:assert/strict'
import test from 'node:test'
import type { User, UserIdentity } from '@supabase/supabase-js'
import { extractGoogleAvatarUrlFromUser, resolveUserAvatar } from '../lib/profile-avatar'

test('resolveUserAvatar prioritizes the selected custom upload over the Google avatar', () => {
  const resolved = resolveUserAvatar({
    avatar_source: 'upload',
    avatar_url: 'https://cdn.example.com/custom-avatar.png',
    google_avatar_url: 'https://lh3.googleusercontent.com/google-avatar',
  }, 'person@example.com')

  assert.equal(resolved.source, 'upload')
  assert.equal(resolved.url, 'https://cdn.example.com/custom-avatar.png')
  assert.equal(resolved.initials, 'P')
})

test('resolveUserAvatar falls back to Google when no custom upload is active', () => {
  const resolved = resolveUserAvatar({
    avatar_source: 'none',
    avatar_url: 'https://cdn.example.com/unused-custom-avatar.png',
    google_avatar_url: 'https://lh3.googleusercontent.com/google-avatar',
  }, 'person@example.com')

  assert.equal(resolved.source, 'google')
  assert.equal(resolved.url, 'https://lh3.googleusercontent.com/google-avatar')
})

test('resolveUserAvatar falls back to initials when neither upload nor Google avatar exists', () => {
  const resolved = resolveUserAvatar({
    avatar_source: 'none',
    avatar_url: null,
    google_avatar_url: null,
  }, 'person@example.com')

  assert.equal(resolved.source, 'none')
  assert.equal(resolved.url, null)
  assert.equal(resolved.initials, 'P')
})

test('extractGoogleAvatarUrlFromUser reads the Supabase user metadata when Google is linked', () => {
  const user = createUser({
    user_metadata: {
      picture: 'https://lh3.googleusercontent.com/google-from-metadata',
    },
  })

  assert.equal(
    extractGoogleAvatarUrlFromUser(user),
    'https://lh3.googleusercontent.com/google-from-metadata',
  )
})

test('extractGoogleAvatarUrlFromUser falls back to Google identity data when user metadata is missing the image', () => {
  const user = createUser({
    user_metadata: {},
    identities: [
      createIdentity({
        provider: 'google',
        identity_data: {
          avatar_url: 'https://lh3.googleusercontent.com/google-from-identity',
        },
      }),
    ],
  })

  assert.equal(
    extractGoogleAvatarUrlFromUser(user),
    'https://lh3.googleusercontent.com/google-from-identity',
  )
})

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    app_metadata: {
      provider: 'google',
      providers: ['google'],
    },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-04-10T00:00:00.000Z',
    email: 'person@example.com',
    phone: '',
    role: 'authenticated',
    updated_at: '2026-04-10T00:00:00.000Z',
    identities: [],
    is_anonymous: false,
    ...overrides,
  } as User
}

function createIdentity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    id: 'identity-1',
    user_id: 'user-1',
    identity_id: 'google-identity-1',
    identity_data: {},
    provider: 'google',
    created_at: '2026-04-10T00:00:00.000Z',
    last_sign_in_at: '2026-04-10T00:00:00.000Z',
    updated_at: '2026-04-10T00:00:00.000Z',
    ...overrides,
  } as UserIdentity
}
