import type { User } from '@supabase/supabase-js'

export type NotificationEmailSource = 'supabase_account' | 'linked_google' | 'linked_microsoft'

export interface NotificationEmailOption {
  source: NotificationEmailSource
  label: string
  email: string | null
  available: boolean
  disabledReason?: string
}

function extractIdentityEmail(user: User, provider: string): string | null {
  const identity = user.identities?.find((i) => i.provider === provider)
  if (!identity) return null
  const raw = identity.identity_data?.email
  if (typeof raw !== 'string' || !raw.trim()) return null
  return raw.trim().toLowerCase()
}

export function getNotificationEmailOptions(user: User | null): NotificationEmailOption[] {
  const accountEmail = user?.email?.trim().toLowerCase() ?? null

  const googleEmail = user ? extractIdentityEmail(user, 'google') : null

  // Microsoft can be registered as 'azure' or 'microsoft' depending on Supabase provider config.
  const microsoftEmail = user
    ? (extractIdentityEmail(user, 'azure') ?? extractIdentityEmail(user, 'microsoft'))
    : null

  return [
    {
      source: 'supabase_account',
      label: 'Account email',
      email: accountEmail,
      available: Boolean(accountEmail),
    },
    {
      source: 'linked_google',
      label: 'Google email',
      email: googleEmail,
      available: Boolean(googleEmail),
      disabledReason: googleEmail ? undefined : 'Sign in or link Google to use this email',
    },
    {
      source: 'linked_microsoft',
      label: 'Microsoft email',
      email: microsoftEmail,
      available: Boolean(microsoftEmail),
      disabledReason: microsoftEmail ? undefined : 'Sign in or link Microsoft to use this email',
    },
  ]
}

export function resolveEmailFromOptions(
  options: NotificationEmailOption[],
  source: NotificationEmailSource,
): string | null {
  const selected = options.find((o) => o.source === source)
  if (selected?.available && selected.email) return selected.email

  // Fall back to account email if the selected source is unavailable.
  const accountOption = options.find((o) => o.source === 'supabase_account')
  return accountOption?.email ?? null
}
