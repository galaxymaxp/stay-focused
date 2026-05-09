'use client'

import { AuthPageFrame, AuthStatusNotice } from '@/components/AuthPageFrame'

export default function SignInError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <AuthPageFrame
      title="Sign-in could not load"
      description="Stay Focused could not prepare the sign-in page right now. Try again in a moment."
      diagnosticLabel="Auth page loaded"
    >
      <AuthStatusNotice
        title="Auth page is available"
        description="The sign-in route loaded a visible fallback instead of leaving the page blank."
        tone="error"
        detail={`Internal error: ${error.message || 'Unknown sign-in route failure.'}`}
      />
      <button type="button" className="ui-button ui-button-primary" onClick={reset} style={{ minHeight: '2.7rem' }}>
        Retry sign-in
      </button>
    </AuthPageFrame>
  )
}
