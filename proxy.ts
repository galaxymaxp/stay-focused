import { NextResponse, type NextRequest } from 'next/server'
import {
  APP_SHELL_PATHNAME_HEADER,
  APP_SHELL_PUBLIC_HEADER,
  getAuthProxyRedirect,
  isPublicAuthPath,
} from '@/lib/auth-routing'
import { syncSupabaseAuthSession } from '@/lib/supabase-auth-middleware'

export async function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(APP_SHELL_PATHNAME_HEADER, request.nextUrl.pathname)
  requestHeaders.set(APP_SHELL_PUBLIC_HEADER, isPublicAuthPath(request.nextUrl.pathname) ? '1' : '0')

  const { response, userId } = await syncSupabaseAuthSession(request, requestHeaders)
  const redirectTarget = getAuthProxyRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
    userId,
  )

  if (!redirectTarget) {
    return response
  }

  const redirectResponse = NextResponse.redirect(new URL(redirectTarget, request.url))
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie)
  }
  return redirectResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)',
  ],
}
