import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseAuthConfigured, supabaseAuthAnonKey, supabaseAuthUrl } from '@/lib/supabase-auth-config'

export interface SupabaseAuthSessionResult {
  response: NextResponse
  userId: string | null
}

export async function syncSupabaseAuthSession(
  request: NextRequest,
  requestHeaders: Headers = request.headers,
): Promise<SupabaseAuthSessionResult> {
  if (!isSupabaseAuthConfigured || !supabaseAuthUrl || !supabaseAuthAnonKey) {
    return {
      response: NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }),
      userId: null,
    }
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  const supabase = createServerClient(supabaseAuthUrl, supabaseAuthAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }))
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })

        response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        })

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })

        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    response,
    userId: user?.id ?? null,
  }
}

export async function updateSupabaseAuthSession(request: NextRequest, requestHeaders?: Headers) {
  const { response } = await syncSupabaseAuthSession(request, requestHeaders)
  return response
}
