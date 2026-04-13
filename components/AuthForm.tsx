'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth-browser'

type AuthMode = 'sign-in' | 'sign-up'

export function AuthForm({
  mode,
  nextPath,
  initialError,
}: {
  mode: AuthMode
  nextPath: string
  initialError?: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError ?? null)
  const [isPending, startTransition] = useTransition()

  const title = mode === 'sign-in' ? 'Sign in' : 'Create account'
  const subtitle = mode === 'sign-in'
    ? 'Welcome back. Sign in to pick up where you left off and keep your progress saved across devices.'
    : 'Create a free account to save your progress and access Stay Focused from any device.'

  return (
    <main className="page-shell page-shell-narrow page-stack" style={{ gap: '1rem' }}>
      <section className="glass-panel glass-strong motion-card" style={{ padding: '1.35rem', display: 'grid', gap: '1rem' }}>
        <header style={{ display: 'grid', gap: '0.45rem' }}>
          <p className="ui-kicker">Account</p>
          <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>{title}</h1>
          <p className="ui-page-copy" style={{ maxWidth: '42rem', marginTop: 0 }}>{subtitle}</p>
        </header>

        <button
          type="button"
          className="ui-button ui-button-primary"
          style={{ minHeight: '2.7rem' }}
          disabled={isPending}
          onClick={() => {
            setMessage(null)
            setErrorMessage(null)

            startTransition(async () => {
              try {
                const supabase = createSupabaseBrowserClient()
                const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: {
                    redirectTo,
                  },
                })

                if (error) throw error
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Could not start Google sign-in.')
              }
            })
          }}
        >
          {isPending ? 'Working...' : 'Continue with Google'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={dividerStyle} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Or with email
          </span>
          <div style={dividerStyle} />
        </div>

        <form
          style={{ display: 'grid', gap: '0.8rem' }}
          onSubmit={(event) => {
            event.preventDefault()
            setMessage(null)
            setErrorMessage(null)

            if (mode === 'sign-up' && password !== confirmPassword) {
              setErrorMessage('Passwords do not match.')
              return
            }

            startTransition(async () => {
              try {
                const supabase = createSupabaseBrowserClient()

                if (mode === 'sign-in') {
                  const { error } = await supabase.auth.signInWithPassword({ email, password })
                  if (error) throw error

                  router.push(nextPath)
                  router.refresh()
                  return
                }

                const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
                const { data, error } = await supabase.auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo,
                  },
                })

                if (error) throw error

                if (data.session) {
                  router.push(nextPath)
                  router.refresh()
                  return
                }

                setMessage('Account created. Check your email if confirmation is enabled for this Supabase project.')
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.')
              }
            })
          }}
        >
          <label style={fieldStyle}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="ui-input"
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              className="ui-input"
              style={inputStyle}
            />
          </label>

          {mode === 'sign-up' ? (
            <label style={fieldStyle}>
              <span style={labelStyle}>Confirm password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
                className="ui-input"
                style={inputStyle}
              />
            </label>
          ) : null}

          <button type="submit" className="ui-button ui-button-primary" style={{ minHeight: '2.7rem' }} disabled={isPending}>
            {isPending ? 'Working...' : title}
          </button>
        </form>

        {message ? <p style={{ margin: 0, fontSize: '13px', color: 'var(--blue)' }}>{message}</p> : null}
        {errorMessage ? <p style={{ margin: 0, fontSize: '13px', color: 'var(--red)' }}>{errorMessage}</p> : null}

        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
          {mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'}{' '}
          <Link href={`${mode === 'sign-in' ? '/sign-up' : '/sign-in'}?next=${encodeURIComponent(nextPath)}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
            {mode === 'sign-in' ? 'Create one' : 'Sign in'}
          </Link>
        </p>
      </section>
    </main>
  )
}

const dividerStyle: React.CSSProperties = {
  height: '1px',
  flex: 1,
  background: 'color-mix(in srgb, var(--border-subtle) 90%, transparent)',
}

const fieldStyle: React.CSSProperties = {
  display: 'grid',
  gap: '0.4rem',
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '2.7rem',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
  padding: '0.7rem 0.85rem',
  color: 'var(--text-primary)',
}
