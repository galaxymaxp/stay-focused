import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { getRequiredSupabaseAuthEnv } from '@/lib/supabase-auth-config'

export function createSupabaseRouteClient(request: NextRequest, response?: NextResponse) {
  const { supabaseUrl, supabaseAnonKey } = getRequiredSupabaseAuthEnv()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }))
      },
      setAll(cookiesToSet, headers) {
        if (!response) return

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })

        Object.entries(headers).forEach(([name, value]) => {
          response.headers.set(name, value)
        })
      },
    },
  })
}
