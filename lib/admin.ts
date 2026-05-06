/**
 * Returns true if the given email is in the ADMIN_EMAILS env var (comma-separated).
 * Safe default: returns false when env is missing or empty, or email is null/undefined.
 * Comparison is case-insensitive and trims whitespace.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const raw = process.env.ADMIN_EMAILS?.trim()
  if (!raw) return false
  const admins = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return admins.includes((email ?? '').toLowerCase().trim())
}
