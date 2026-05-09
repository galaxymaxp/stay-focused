import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildProtectedRedirectDestination,
  getAuthProxyRedirect,
  getSafeRedirectPath,
  isProtectedAppPath,
  shouldRenderAppShell,
} from '@/lib/auth-routing'

test('unauthenticated /courses redirects to /sign-in with original next path', () => {
  assert.equal(
    getAuthProxyRedirect('/courses', '', null),
    '/sign-in?next=%2Fcourses',
  )
})

test('unauthenticated /sign-in stays public and does not redirect to itself', () => {
  assert.equal(getAuthProxyRedirect('/sign-in', '', null), null)
  assert.equal(isProtectedAppPath('/sign-in'), false)
})

test('/sign-in next param normalizes auth routes back to root', () => {
  assert.equal(getSafeRedirectPath('/sign-in', '/'), '/')
  assert.equal(getSafeRedirectPath('/sign-in?next=%2Fcourses', '/'), '/')
  assert.equal(getSafeRedirectPath('/auth/callback?next=%2Fcourses', '/'), '/')
  assert.equal(getSafeRedirectPath('/courses?next=%2Fsign-in', '/'), '/courses')
})

test('authenticated user visiting /sign-in redirects to normalized destination', () => {
  assert.equal(getAuthProxyRedirect('/sign-in', '', 'user-1'), '/')
  assert.equal(getAuthProxyRedirect('/sign-in', '?next=%2Fcourses', 'user-1'), '/courses')
})

test('app shell is not rendered on sign-in and still renders on protected app routes', () => {
  assert.equal(shouldRenderAppShell('/sign-in'), false)
  assert.equal(shouldRenderAppShell('/sign-up'), false)
  assert.equal(shouldRenderAppShell('/courses'), true)
  assert.equal(shouldRenderAppShell('/settings'), true)
})

test('protected redirect builder preserves real protected paths only', () => {
  assert.equal(
    buildProtectedRedirectDestination('/courses', '?view=week'),
    '/sign-in?next=%2Fcourses%3Fview%3Dweek',
  )
})

test('root layout and shell source keep auth routes outside app chrome', () => {
  const layoutSource = readFileSync('app/layout.tsx', 'utf8')
  const shellSource = readFileSync('components/AppShell.tsx', 'utf8')

  assert.match(layoutSource, /APP_SHELL_PUBLIC_HEADER/, 'root layout reads the public route header')
  assert.match(layoutSource, /shouldRenderAppShell/, 'root layout gates shell rendering with auth-route helper')
  assert.doesNotMatch(shellSource, /pathname\.startsWith\('\/sign-in'\)/, 'AppShell no longer marks /sign-in as a Settings route')
  assert.doesNotMatch(shellSource, /pathname\.startsWith\('\/sign-up'\)/, 'AppShell no longer marks /sign-up as a Settings route')
})
