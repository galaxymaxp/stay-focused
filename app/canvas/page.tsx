import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ConnectCanvasFlowWrapper } from '@/components/ConnectCanvasFlowWrapper'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { buildCanvasCourseSyncKey } from '@/lib/canvas-sync'
import { supabase } from '@/lib/supabase'

type SyncTone = 'success' | 'neutral' | 'warning'

interface CanvasPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CanvasPage({ searchParams }: CanvasPageProps = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const actionParam = resolvedSearchParams.action
  const initialAction = Array.isArray(actionParam) ? actionParam[0] : actionParam ?? null
  const user = await getAuthenticatedUserServer()

  if (!user) {
    return (
      <main className="page-shell page-shell-narrow page-stack">
        <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
          <p className="ui-kicker">Canvas</p>
          <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Canvas sync needs an account</h1>
          <p className="ui-page-copy" style={{ maxWidth: '46rem', marginTop: 0 }}>
            Sign in before connecting Canvas. That keeps synced courses, announcements, and future account-owned data tied to you instead of a shared anonymous session.
          </p>
        </header>

        <section style={sectionStyle}>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <div style={messageCardStyle}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Signed out
              </div>
              <div style={{ marginTop: '0.26rem', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Canvas sync is available after sign-in. Signed-out sessions should not load or reuse another user&apos;s personal Canvas data.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link href="/sign-in?next=%2Fcanvas" className="ui-button ui-button-primary" style={{ textDecoration: 'none' }}>
                Sign in
              </Link>
              <Link href="/sign-up?next=%2Fcanvas" className="ui-button ui-button-secondary" style={{ textDecoration: 'none' }}>
                Sign up
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const ownedCourses = supabase
    ? (await supabase
        .from('courses')
        .select('id, canvas_instance_url, canvas_course_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })).data
    : []
  const ownedCourseIds = (ownedCourses ?? [])
    .map((course) => course.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  const syncedModules = supabase
    ? ownedCourseIds.length > 0
      ? (await supabase
        .from('modules')
        .select('id, title, summary, status, created_at')
        .in('course_id', ownedCourseIds)
        .order('created_at', { ascending: false })).data
      : []
    : []

  const latestModule = syncedModules?.[0]
  const latestCourseConnectionUrl = (ownedCourses ?? []).find((course) => typeof course.canvas_instance_url === 'string')?.canvas_instance_url ?? null
  const initialConnectionUrl = latestCourseConnectionUrl ?? extractCanvasUrl(latestModule?.summary ?? null)
  const syncedCourseKeys = Array.from(
    new Set(
      (ownedCourses ?? [])
        .map((course) => buildCanvasCourseSyncKey(course.canvas_instance_url, course.canvas_course_id))
        .filter((value): value is string => Boolean(value))
    )
  )
  const lastSync = latestModule
    ? {
        label:
          latestModule.status === 'processed'
            ? `Last sync finished on ${new Date(latestModule.created_at).toLocaleString()}`
            : latestModule.status === 'error'
              ? `Last sync ran into a problem on ${new Date(latestModule.created_at).toLocaleString()}`
              : `A sync started on ${new Date(latestModule.created_at).toLocaleString()}`,
        tone: getSyncTone(latestModule.status),
      }
    : null
  const syncedModulesForFlow = (syncedModules ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    summary: module.summary,
    createdAt: module.created_at,
  }))

  return (
    <main className="page-shell page-shell-narrow page-stack">
      <ConnectCanvasFlowWrapper
        initialConnectionUrl={initialConnectionUrl}
        lastSync={lastSync}
        syncedCourseKeys={syncedCourseKeys}
        initialAction={initialAction}
        syncedModules={syncedModulesForFlow}
      />
    </main>
  )
}

const sectionStyle: CSSProperties = {
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'color-mix(in srgb, var(--surface-elevated) 98%, transparent)',
  boxShadow: 'var(--highlight-sheen)',
  overflow: 'hidden',
  padding: '1rem 1.1rem',
}

const messageCardStyle: CSSProperties = {
  borderRadius: '12px',
  border: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)',
  background: 'var(--surface-elevated)',
  padding: '0.95rem',
}

function extractCanvasUrl(summary: string | null) {
  if (!summary) return null

  const match = summary.match(/https?:\/\/[^\s)]+/i)
  return match?.[0] ?? null
}

function getSyncTone(status: string): SyncTone {
  if (status === 'processed') return 'success'
  if (status === 'error') return 'warning'
  return 'neutral'
}
