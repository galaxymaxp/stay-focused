'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth-browser'

type AuthMode = 'sign-in' | 'sign-up'

const EMAIL_PLACEHOLDERS = [
  'you@school.edu',
  'you@gmail.com',
  'you@outlook.com',
  'you@icloud.com',
]

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

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)
  const [emailFocused, setEmailFocused] = useState(false)

  useEffect(() => {
    if (emailFocused || email.length > 0) return

    const cycle = setInterval(() => {
      setPlaceholderVisible(false)
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % EMAIL_PLACEHOLDERS.length)
        setPlaceholderVisible(true)
      }, 220)
    }, 2500)

    return () => clearInterval(cycle)
  }, [emailFocused, email])

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
            <div style={{ position: 'relative' }}>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                required
                autoComplete="email"
                className="ui-input"
                style={inputStyle}
              />
              {email.length === 0 && !emailFocused ? (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    pointerEvents: 'none',
                    opacity: placeholderVisible ? 1 : 0,
                    transition: 'opacity 0.22s ease',
                  }}
                >
                  {EMAIL_PLACEHOLDERS[placeholderIndex]}
                </span>
              ) : null}
            </div>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Password</span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                className="ui-input"
                style={{ ...inputStyle, paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={passwordToggleStyle}
              >
                {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
              </button>
            </div>
          </label>

          {mode === 'sign-up' ? (
            <label style={fieldStyle}>
              <span style={labelStyle}>Confirm password</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="ui-input"
                  style={{ ...inputStyle, paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  style={passwordToggleStyle}
                >
                  {showConfirmPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>
            </label>
          ) : null}

          {mode === 'sign-in' ? (
            <Link
              href="/forgot-password"
              style={{
                justifySelf: 'end',
                fontSize: '12px',
                color: 'var(--accent)',
                fontWeight: 500,
                marginTop: '-0.2rem',
              }}
            >
              Forgot password?
            </Link>
          ) : null}

          <button type="submit" className="ui-button ui-button-primary" style={{ minHeight: '2.7rem' }} disabled={isPending}>
            {isPending ? 'Working...' : title}
          </button>
        </form>

        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
          {mode === 'sign-in' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <Link
            href={`${mode === 'sign-in' ? '/sign-up' : '/sign-in'}?next=${encodeURIComponent(nextPath)}`}
            style={{ color: 'var(--accent)', fontWeight: 600 }}
          >
            {mode === 'sign-in' ? 'Create one' : 'Sign in'}
          </Link>
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={dividerStyle} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Or
          </span>
          <div style={dividerStyle} />
        </div>

        <button
          type="button"
          style={oauthButtonStyle}
          disabled={isPending}
          onClick={() => {
            setMessage(null)
            setErrorMessage(null)

            startTransition(async () => {
              try {
                const supabase = createSupabaseBrowserClient()
                const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: 'azure',
                  options: { redirectTo, scopes: 'email' },
                })
                if (error) throw error
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Could not start Microsoft sign-in.')
              }
            })
          }}
        >
          <MicrosoftLogo />
          <span>Continue with Microsoft</span>
        </button>

        <button
          type="button"
          style={oauthButtonStyle}
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
                  options: { redirectTo },
                })
                if (error) throw error
              } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : 'Could not start Google sign-in.')
              }
            })
          }}
        >
          <GoogleLogo />
          <span>Continue with Google</span>
        </button>

        {message ? <p style={{ margin: 0, fontSize: '13px', color: 'var(--blue)' }}>{message}</p> : null}
        {errorMessage ? <p style={{ margin: 0, fontSize: '13px', color: 'var(--red)' }}>{errorMessage}</p> : null}
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

const passwordToggleStyle: React.CSSProperties = {
  position: 'absolute',
  right: '0.5rem',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  padding: '0.4rem',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-control)',
}

const oauthButtonStyle: React.CSSProperties = {
  minHeight: '2.7rem',
  borderRadius: 'var(--radius-control)',
  border: '1px solid var(--border-subtle)',
  background: 'color-mix(in srgb, var(--surface-base) 60%, transparent)',
  color: 'var(--text-primary)',
  padding: '0.6rem 0.9rem',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.6rem',
  transition: 'background 0.15s ease, border-color 0.15s ease',
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function EyeOpenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeClosedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
