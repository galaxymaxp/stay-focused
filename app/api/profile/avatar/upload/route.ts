import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'
import {
  getAvatarFileExtension,
  getStorageObjectPathFromPublicUrl,
  MAX_PROFILE_AVATAR_BYTES,
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MIME_TYPES,
  resolveAvatarSource,
  resolveUserAvatar,
  type AvatarSource,
} from '@/lib/profile-avatar'
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

export async function POST(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const fileField = formData?.get('avatar')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'Avatar file is required.' }, { status: 400 })
  }

  if (!PROFILE_AVATAR_MIME_TYPES.has(fileField.type)) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 })
  }

  if (fileField.size > MAX_PROFILE_AVATAR_BYTES) {
    return NextResponse.json({ error: 'File is too large. Maximum size is 5 MB.' }, { status: 400 })
  }

  const extension = getAvatarFileExtension(fileField.type)
  if (!extension) {
    return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 })
  }

  const profile = await getOrCreateUserProfileForUser(supabase, user)
  const oldPath = getStorageObjectPathFromPublicUrl(profile.avatar_url, PROFILE_AVATAR_BUCKET)
  const objectPath = `${user.id}/avatar-${Date.now()}.${extension}`

  const uploadArrayBuffer = await fileField.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(objectPath, uploadArrayBuffer, {
      contentType: fileField.type,
      upsert: false,
      cacheControl: '3600',
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(objectPath)
  const nextAvatarUrl = publicUrlData.publicUrl

  const { data: updatedProfile, error: updateError } = await supabase
    .from('user_profiles')
    .update({
      avatar_source: 'upload',
      avatar_url: nextAvatarUrl,
    })
    .eq('user_id', user.id)
    .select('user_id, avatar_source, avatar_url, google_avatar_url')
    .single()

  if (updateError || !updatedProfile) {
    await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([objectPath])
    return NextResponse.json({ error: updateError?.message ?? 'Could not save uploaded avatar.' }, { status: 500 })
  }

  if (oldPath && oldPath !== objectPath) {
    const { error: oldAvatarRemoveError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([oldPath])
    if (oldAvatarRemoveError) {
      console.error('[avatar] Could not remove previous uploaded avatar.', oldAvatarRemoveError)
    }
  }

  return NextResponse.json(toPayload({
    avatar_source: resolveAvatarSource(updatedProfile.avatar_source),
    avatar_url: typeof updatedProfile.avatar_url === 'string' ? updatedProfile.avatar_url : null,
    google_avatar_url: typeof updatedProfile.google_avatar_url === 'string' ? updatedProfile.google_avatar_url : null,
  }, user.email ?? null))
}

export async function DELETE(request: NextRequest) {
  const supabase = createSupabaseRouteClient(request)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getOrCreateUserProfileForUser(supabase, user)
  const oldPath = getStorageObjectPathFromPublicUrl(profile.avatar_url, PROFILE_AVATAR_BUCKET)

  const nextSource: AvatarSource = profile.google_avatar_url ? 'google' : 'none'
  const { data: updatedProfile, error: updateError } = await supabase
    .from('user_profiles')
    .update({
      avatar_source: nextSource,
      avatar_url: null,
    })
    .eq('user_id', user.id)
    .select('user_id, avatar_source, avatar_url, google_avatar_url')
    .single()

  if (updateError || !updatedProfile) {
    return NextResponse.json({ error: updateError?.message ?? 'Could not remove uploaded avatar.' }, { status: 500 })
  }

  if (oldPath) {
    const { error: oldAvatarRemoveError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([oldPath])
    if (oldAvatarRemoveError) {
      console.error('[avatar] Could not remove uploaded avatar file.', oldAvatarRemoveError)
    }
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
