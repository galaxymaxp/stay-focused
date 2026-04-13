import { NextRequest, NextResponse } from 'next/server'
import { getSafeRedirectPath } from '@/lib/auth'
import { getOrCreateUserProfileForUser } from '@/lib/user-profiles'
import { isSupabaseAuthConfigured, supabaseAuthConfigError } from '@/lib/supabase-auth-config'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get('next'), '/settings')
  const redirectUrl = new URL(nextPath, requestUrl.origin)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  if (!isSupabaseAuthConfigured) {
    return redirectToSignIn(requestUrl, nextPath, supabaseAuthConfigError ?? 'Supabase auth is not configured.')
  }

  if (error || errorDescription) {
    const message = errorDescription ?? error ?? 'Google sign-in did not complete.'
    return redirectToSignIn(requestUrl, nextPath, message)
  }

  const response = NextResponse.redirect(redirectUrl)

  if (!code) {
    return redirectToSignIn(requestUrl, nextPath, 'Google sign-in did not complete.')
  }

  const supabase = createSupabaseRouteClient(request, response)
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return redirectToSignIn(requestUrl, nextPath, exchangeError.message)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    try {
      await getOrCreateUserProfileForUser(supabase, user)
    } catch (error) {
      console.error('[avatar] Could not sync user profile during auth callback.', error)
    }
  }

  return response
}

function redirectToSignIn(requestUrl: URL, nextPath: string, errorMessage: string) {
  const signInUrl = new URL('/sign-in', requestUrl.origin)
  signInUrl.searchParams.set('error', errorMessage)
  signInUrl.searchParams.set('next', nextPath)
  return NextResponse.redirect(signInUrl)
}
