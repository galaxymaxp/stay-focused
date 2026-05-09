import { AuthForm } from '@/components/AuthForm'
import { resolveAuthEntryParams } from '@/lib/auth-routing'
import { isSupabaseAuthConfigured, supabaseAuthConfigError } from '@/lib/supabase-auth-config'

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const { nextPath, initialError } = resolveAuthEntryParams(resolvedSearchParams, '/')

  return (
    <AuthForm
      mode="sign-in"
      nextPath={nextPath}
      initialError={initialError}
      authAvailable={isSupabaseAuthConfigured}
      authConfigError={supabaseAuthConfigError}
    />
  )
}
