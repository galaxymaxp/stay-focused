import { AuthForm } from '@/components/AuthForm'
import { getSafeRedirectPath } from '@/lib/auth'

interface SignInPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const nextValue = resolvedSearchParams.next
  const errorValue = resolvedSearchParams.error
  const nextPath = getSafeRedirectPath(Array.isArray(nextValue) ? nextValue[0] : nextValue, '/settings')
  const initialError = Array.isArray(errorValue) ? errorValue[0] : errorValue ?? null

  return <AuthForm mode="sign-in" nextPath={nextPath} initialError={initialError} />
}
