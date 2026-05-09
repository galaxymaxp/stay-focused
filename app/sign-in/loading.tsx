import { AuthPageFrame, AuthStatusNotice } from '@/components/AuthPageFrame'

export default function SignInLoading() {
  return (
    <AuthPageFrame
      title="Loading sign-in"
      description="Preparing the sign-in page now."
      diagnosticLabel="Auth page loaded"
    >
      <AuthStatusNotice
        title="Preparing account access"
        description="Stay Focused is loading the sign-in card and auth controls now."
      />
    </AuthPageFrame>
  )
}
