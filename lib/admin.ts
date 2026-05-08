import type { User } from '@supabase/supabase-js'

/**
 * Returns true if the given email is in the ADMIN_EMAILS env var (comma-separated).
 * Safe default: returns false when env is missing or empty, or email is null/undefined.
 * Comparison is case-insensitive and trims whitespace.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const admins = getAdminEmails()
  return admins.includes(normalizeAdminEmail(email))
}

export function isAdminUser(user: Pick<User, 'email' | 'identities'> | null | undefined): boolean {
  if (!user) return false
  const admins = getAdminEmails()
  if (admins.length === 0) return false

  const candidates = [normalizeAdminEmail(user.email)]
  for (const identity of user.identities ?? []) {
    candidates.push(normalizeAdminEmail(extractIdentityEmail(identity)))
  }

  return candidates.some((candidate) => admins.includes(candidate))
}

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((email) => normalizeAdminEmail(email))
    .filter(Boolean)
}

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

function extractIdentityEmail(identity: NonNullable<User['identities']>[number]): string | null {
  if (!identity.identity_data || typeof identity.identity_data !== 'object') return null

  const rawEmail = (identity.identity_data as Record<string, unknown>).email
  if (typeof rawEmail !== 'string' || !rawEmail.trim()) return null

  return normalizeAdminEmail(rawEmail)
}
