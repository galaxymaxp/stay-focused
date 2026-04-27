import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import { resolveAvatarSource, resolveUserAvatar, type AvatarSource } from '@/lib/profile-avatar'
import { getOrCreateUserProfileForUser } from '@/lib/user-profiles'

type AvatarApiPayload = {
  profile: {
    avatarSource: AvatarSource
    avatarUrl: string | null
    googleAvatarUrl: string | null
  }
  resolved: {
    source: AvatarSource
    url: string | null
    initials: string | null
  }
  hasGoogleAvatar: boolean
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getOrCreateUserProfileForUser(supabase, user)
  return NextResponse.json(toPayload(profile, user.email ?? null))
}

export async function PATCH(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const nextSource = resolveAvatarSource(body?.avatarSource)
  const profile = await getOrCreateUserProfileForUser(supabase, user)

  if (nextSource === 'google' && !profile.google_avatar_url) {
    return NextResponse.json({ error: 'Google photo is not available.' }, { status: 400 })
  }

  if (nextSource === 'upload' && !profile.avatar_url) {
    return NextResponse.json({ error: 'No uploaded avatar is available.' }, { status: 400 })
  }

  const { data: updatedProfile, error: updateError } = await supabase
    .from('user_profiles')
    .update({ avatar_source: nextSource })
    .eq('user_id', user.id)
    .select('user_id, avatar_source, avatar_url, google_avatar_url')
    .single()

  if (updateError || !updatedProfile) {
    return NextResponse.json({ error: updateError?.message ?? 'Could not update avatar source.' }, { status: 500 })
  }

  return NextResponse.json(toPayload({
    avatar_source: resolveAvatarSource(updatedProfile.avatar_source),
    avatar_url: typeof updatedProfile.avatar_url === 'string' ? updatedProfile.avatar_url : null,
    google_avatar_url: typeof updatedProfile.google_avatar_url === 'string' ? updatedProfile.google_avatar_url : null,
  }, user.email ?? null))
}

function toPayload(
  profile: {
    avatar_source: AvatarSource
    avatar_url: string | null
    google_avatar_url: string | null
  },
  email: string | null,
): AvatarApiPayload {
  const resolved = resolveUserAvatar(profile, email)

  return {
    profile: {
      avatarSource: profile.avatar_source,
      avatarUrl: profile.avatar_url,
      googleAvatarUrl: profile.google_avatar_url,
    },
    resolved,
    hasGoogleAvatar: Boolean(profile.google_avatar_url),
  }
}
