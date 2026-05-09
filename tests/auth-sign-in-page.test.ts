import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ForgotPasswordPage from '@/app/forgot-password/page'
import { AuthPageFrame, AuthStatusNotice } from '@/components/AuthPageFrame'
import { resolveAuthEntryParams } from '@/lib/auth-routing'

function renderSignInFrame(searchParams?: Record<string, string | string[] | undefined>) {
  const { nextPath } = resolveAuthEntryParams(searchParams, '/')

  return renderToStaticMarkup(
    createElement(
      AuthPageFrame,
      {
        title: 'Sign in',
        description: 'Welcome back. Sign in to pick up where you left off and keep your progress saved across devices.',
        diagnosticLabel: 'Auth page loaded',
        children: createElement(AuthStatusNotice, {
          title: 'Auth card ready',
          description: `Resolved next path: ${nextPath}`,
        }),
      },
    ),
  )
}

test('/sign-in renders a visible auth card frame', () => {
  const markup = renderSignInFrame()

  assert.match(markup, /Sign in/)
  assert.match(markup, /Auth page loaded/)
  assert.match(markup, /Auth card ready/)
  assert.match(markup, /Resolved next path: \//)
  assert.doesNotMatch(markup, /app-sidebar|app-topbar|app-frame/)
})

test('/sign-in\\?next=%2F renders the auth card with normalized root redirect', () => {
  const params = resolveAuthEntryParams({ next: '/' }, '/')
  const markup = renderSignInFrame({ next: '/' })

  assert.equal(params.nextPath, '/')
  assert.match(markup, /Resolved next path: \//)
  assert.match(markup, /data-auth-diagnostic="loaded"/)
})

test('missing Supabase public auth config has a visible fallback in AuthForm source', () => {
  const source = readFileSync('components/AuthForm.tsx', 'utf8')

  assert.match(source, /Auth configuration required/)
  assert.match(source, /Internal auth config error:/)
  assert.match(source, /studentFacingConfigMessage/)
})

test('AuthForm bad config or runtime failure does not blank the page', () => {
  const source = readFileSync('components/AuthForm.tsx', 'utf8')

  assert.match(source, /class AuthFormErrorBoundary/)
  assert.match(source, /Auth page is available/)
  assert.match(source, /Internal auth runtime error:/)
  assert.match(source, /Preparing provider sign-in/)
})

test('forgot-password route renders a visible auth-state page instead of 404', () => {
  const markup = renderToStaticMarkup(createElement(ForgotPasswordPage))

  assert.match(markup, /Reset your password/)
  assert.match(markup, /Password reset is coming soon/)
  assert.match(markup, /Back to sign in/)
  assert.match(markup, /Auth page loaded/)
})
