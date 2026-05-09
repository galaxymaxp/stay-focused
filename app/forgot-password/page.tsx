import Link from 'next/link'
import { AuthPageFrame, AuthStatusNotice } from '@/components/AuthPageFrame'

export default function ForgotPasswordPage() {
  return (
    <AuthPageFrame
      title="Reset your password"
      description="Password reset is not wired into Stay Focused yet, but this route now stays visible and student-friendly instead of failing into a blank or missing page."
      diagnosticLabel="Auth page loaded"
    >
      <AuthStatusNotice
        title="Password reset is coming soon"
        description="Use your existing sign-in method for now. If you cannot access your account, contact support for help resetting it."
        tone="warning"
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        <Link href="/sign-in" className="ui-button ui-button-primary" style={{ textDecoration: 'none' }}>
          Back to sign in
        </Link>
        <Link href="/sign-up" className="ui-button ui-button-secondary" style={{ textDecoration: 'none' }}>
          Create account
        </Link>
      </div>
    </AuthPageFrame>
  )
}
