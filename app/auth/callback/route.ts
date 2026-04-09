import { NextRequest, NextResponse } from 'next/server'
import { getSafeRedirectPath } from '@/lib/auth'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import { createSupabaseRouteClient } from '@/lib/supabase-auth-server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const nextPath = getSafeRedirectPath(requestUrl.searchParams.get('next'), '/settings')
  const redirectUrl = new URL(nextPath, requestUrl.origin)
  const code = requestUrl.searchParams.get('code')

  if (!isSupabaseAuthConfigured) {
    const signInUrl = new URL('/sign-in', requestUrl.origin)
    signInUrl.searchParams.set('error', 'Supabase auth is not configured.')
    signInUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(signInUrl)
  }

  const response = NextResponse.redirect(redirectUrl)

  if (!code) {
    return response
  }

  const supabase = createSupabaseRouteClient(request, response)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    const signInUrl = new URL('/sign-in', requestUrl.origin)
    signInUrl.searchParams.set('error', error.message)
    signInUrl.searchParams.set('next', nextPath)
    return NextResponse.redirect(signInUrl)
  }

  return response
}
