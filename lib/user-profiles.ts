import type { SupabaseClient, User } from '@supabase/supabase-js'
import { extractGoogleAvatarUrlFromUser, resolveAvatarSource, type AvatarSource, type UserAvatarProfile } from '@/lib/profile-avatar'

export interface UserProfileRow extends UserAvatarProfile {
  user_id: string
}

export async function getOrCreateUserProfileForUser(supabase: SupabaseClient, user: User): Promise<UserProfileRow> {
  const { data: existingProfile, error: profileReadError } = await supabase
    .from('user_profiles')
    .select('user_id, avatar_source, avatar_url, google_avatar_url')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profileReadError) {
    throw profileReadError
  }

  const googleAvatarUrl = extractGoogleAvatarUrlFromUser(user)
  const currentProfile = mapProfileRow(existingProfile)

  if (!currentProfile) {
    const initialSource: AvatarSource = googleAvatarUrl ? 'google' : 'none'
    const { data: insertedProfile, error: insertError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: user.id,
        avatar_source: initialSource,
        avatar_url: null,
        google_avatar_url: googleAvatarUrl,
      })
      .select('user_id, avatar_source, avatar_url, google_avatar_url')
      .single()

    if (insertError || !insertedProfile) {
      throw insertError ?? new Error('Could not create user profile.')
    }

    return mapProfileRow(insertedProfile)!
  }

  const updates: Partial<UserProfileRow> = {}

  if (googleAvatarUrl && googleAvatarUrl !== currentProfile.google_avatar_url) {
    updates.google_avatar_url = googleAvatarUrl
  }

  if (googleAvatarUrl && currentProfile.avatar_source === 'none') {
    updates.avatar_source = 'google'
  }

  if (Object.keys(updates).length === 0) {
    return currentProfile
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('user_id', user.id)
    .select('user_id, avatar_source, avatar_url, google_avatar_url')
    .single()

  if (updateError || !updatedProfile) {
    throw updateError ?? new Error('Could not update user profile.')
  }

  return mapProfileRow(updatedProfile)!
}

function mapProfileRow(row: Record<string, unknown> | null): UserProfileRow | null {
  if (!row?.user_id || typeof row.user_id !== 'string') return null

  return {
    user_id: row.user_id,
    avatar_source: resolveAvatarSource(row.avatar_source),
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    google_avatar_url: typeof row.google_avatar_url === 'string' ? row.google_avatar_url : null,
  }
}
