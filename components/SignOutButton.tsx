'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth-browser'

export function SignOutButton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <div style={{ display: 'grid', gap: '0.4rem' }}>
      <button
        type="button"
        className={className ?? 'ui-button ui-button-ghost'}
        style={style}
        disabled={isPending}
        onClick={() => {
          setErrorMessage(null)

          startTransition(async () => {
            try {
              const supabase = createSupabaseBrowserClient()
              const { error } = await supabase.auth.signOut()
              if (error) throw error

              router.push(pathname === '/settings' ? '/sign-in' : pathname)
              router.refresh()
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'Could not sign out right now.')
            }
          })
        }}
      >
        {isPending ? 'Signing out...' : 'Sign out'}
      </button>
      {errorMessage ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--red)' }}>{errorMessage}</p>
      ) : null}
    </div>
  )
}
