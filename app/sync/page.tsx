import type { CSSProperties } from 'react'
import Link from 'next/link'
import { SyncCoursesPageClient } from '@/components/SyncCoursesPageClient'
import { createAuthenticatedSupabaseServerClient, getAuthenticatedUserServer } from '@/lib/auth-server'
import { buildCanvasCourseSyncKey } from '@/lib/canvas-sync'
import { createSupabaseServiceRoleClient } from '@/lib/supabase-service'
import { buildSyncActivitySummary, type QueueActivityRow, type ResourceRefreshActivityRow } from '@/lib/sync-activity'

export default async function SyncCoursesPage() {
  const user = await getAuthenticatedUserServer()

  if (!user) {
    return (
      <main className="page-shell page-stack">
        <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
          <p className="ui-kicker">Sync Courses</p>
          <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Sign in to sync courses</h1>
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
                Canvas sync is available after sign-in.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link href="/sign-in?next=%2Fsync" className="ui-button ui-button-primary" style={{ textDecoration: 'none' }}>
                Sign in
              </Link>
              <Link href="/sign-up?next=%2Fsync" className="ui-button ui-button-secondary" style={{ textDecoration: 'none' }}>
                Sign up
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const db = await createAuthenticatedSupabaseServerClient()

  const userSettings = db
    ? (await db
        .from('user_settings')
        .select('canvas_api_url, canvas_access_token')
        .eq('user_id', user.id)
        .maybeSingle()).data
    : null
  const hasCurrentUserCanvasSettings = Boolean(userSettings?.canvas_api_url && userSettings?.canvas_access_token)

  if (!hasCurrentUserCanvasSettings) {
    return (
      <main className="page-shell page-stack">
        <header className="motion-card" style={{ display: 'grid', gap: '0.5rem' }}>
          <p className="ui-kicker">Sync Courses</p>
          <h1 className="ui-page-title" style={{ fontSize: '2rem' }}>Sync Courses</h1>
          <p className="ui-page-copy" style={{ maxWidth: '46rem', marginTop: 0 }}>
            Keep Canvas courses up to date so Stay Focused can plan your work.
          </p>
        </header>

        <section style={sectionStyle}>
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            <div style={messageCardStyle}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Connection required
              </div>
              <div style={{ marginTop: '0.26rem', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                Go to Settings &rsaquo; Canvas to add your Canvas URL and access token, then come back here to select and sync courses.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <Link href="/settings?section=canvas" className="ui-button ui-button-primary" style={{ textDecoration: 'none' }}>
                Go to Settings &rsaquo; Canvas
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }

  const ownedCourses = db
    ? (await db
        .from('courses')
        .select('id, name, canvas_instance_url, canvas_course_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })).data
    : []
  const ownedCourseIds = (ownedCourses ?? [])
    .map((course) => course.id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  const syncedModules = db
    ? ownedCourseIds.length > 0
      ? (await db
        .from('modules')
          .select('id, course_id, title, summary, status, created_at')
          .in('course_id', ownedCourseIds)
          .order('created_at', { ascending: false })).data
      : []
    : []
  const moduleResources = db
    ? ownedCourseIds.length > 0
      ? (await db
          .from('module_resources')
          .select('id, course_id, module_id')
          .in('course_id', ownedCourseIds)).data
      : []
    : []

  const initialConnectionUrl = userSettings?.canvas_api_url ?? ''
  const processedCourseIds = new Set(
    (syncedModules ?? [])
      .filter((module) => module.status === 'processed')
      .map((module) => module.course_id)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  )
  const syncedCourseKeys = Array.from(
    new Set(
      (ownedCourses ?? [])
        .filter((course) => processedCourseIds.has(course.id))
        .map((course) => buildCanvasCourseSyncKey(course.canvas_instance_url, course.canvas_course_id))
        .filter((value): value is string => Boolean(value))
    )
  )
  const activityClient = createSupabaseServiceRoleClient() ?? db
  const [queueRowsResult, resourceRefreshRowsResult] = activityClient
    ? await Promise.all([
        activityClient
          .from('queued_jobs')
          .select('status, payload, result, error, created_at, completed_at')
          .eq('user_id', user.id)
          .eq('type', 'canvas_sync')
          .order('created_at', { ascending: false })
          .limit(100),
        activityClient
          .from('resource_refresh_activity')
          .select('status, detail, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])
    : [{ data: [] }, { data: [] }]

  const syncActivity = buildSyncActivitySummary({
    queueRows: (queueRowsResult.data ?? []) as QueueActivityRow[],
    resourceRefreshRows: (resourceRefreshRowsResult.data ?? []) as ResourceRefreshActivityRow[],
  })
  const courseNameById = new Map(
    (ownedCourses ?? [])
      .map((course) => [course.id, course.name] as const)
      .filter((entry): entry is readonly [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  )
  const resourceCountByModuleId = new Map<string, number>()
  for (const resource of moduleResources ?? []) {
    if (typeof resource.module_id !== 'string') continue
    resourceCountByModuleId.set(resource.module_id, (resourceCountByModuleId.get(resource.module_id) ?? 0) + 1)
  }
  const syncedModulesForFlow = (syncedModules ?? [])
    .filter((module) => module.status === 'processed')
    .map((module) => ({
      id: module.id,
      courseId: module.course_id,
      title: module.title,
      summary: module.summary,
      courseTitle: courseNameById.get(module.course_id) ?? null,
      contentCount: resourceCountByModuleId.get(module.id) ?? 0,
      createdAt: module.created_at,
      }))

  return (
    <main className="page-shell page-stack">
      <SyncCoursesPageClient
        initialConnectionUrl={initialConnectionUrl}
        syncActivity={syncActivity}
        syncedCourseKeys={syncedCourseKeys}
        syncedModules={syncedModulesForFlow}
        syncedCourseCount={processedCourseIds.size}
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
