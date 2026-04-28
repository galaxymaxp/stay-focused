import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequiredSupabaseAuthEnv } from '@/lib/supabase-auth-config'
import { createNotification, deduplicateNotification } from '@/lib/notifications-server'

export const runtime = 'nodejs'
export const maxDuration = 55

function validateCronSecret(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return false

  const authHeader = req.headers.get('authorization')
  if (authHeader) {
    return authHeader === `Bearer ${cronSecret}`
  }

  const querySecret = req.nextUrl.searchParams.get('secret')
  return querySecret === cronSecret
}

function getServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceKey) return null
  const { supabaseUrl } = getRequiredSupabaseAuthEnv()
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ---------------------------------------------------------------------------
// Due-soon detection (tasks with deadline within 48h)
// ---------------------------------------------------------------------------

async function scanDueSoon(): Promise<number> {
  const client = getServiceClient()
  if (!client) return 0

  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const nowIso = now.toISOString()

  const { data: tasks } = await client
    .from('task_items')
    .select('id, title, deadline, user_id, module_id, course_id')
    .eq('status', 'pending')
    .gte('deadline', nowIso)
    .lte('deadline', in48h)
    .limit(200)

  if (!tasks) return 0

  let created = 0

  for (const task of tasks as Record<string, unknown>[]) {
    const userId = task.user_id as string
    if (!userId) continue

    const isDupe = await deduplicateNotification({
      userId,
      type: 'due_soon',
      dedupeKey: `due-soon:${task.id as string}`,
      windowHours: 12,
    })
    if (isDupe) continue

    const deadline = task.deadline as string
    const date = new Date(deadline)
    const diffHours = Math.round((date.getTime() - now.getTime()) / 3600000)
    const timeLabel = diffHours <= 1 ? 'less than 1 hour' : `${diffHours} hours`

    await createNotification({
      userId,
      type: 'due_soon',
      title: `Due in ${timeLabel}: ${task.title as string}`,
      body: `This task is due soon. Open it in Do Now to get a head start.`,
      href: task.module_id ? `/modules/${task.module_id as string}/do` : null,
      severity: 'warning',
      metadata: { taskId: task.id as string, dedupeKey: `due-soon:${task.id as string}` },
    })
    created++
  }

  return created
}

// ---------------------------------------------------------------------------
// New announcements scan
// ---------------------------------------------------------------------------

async function scanNewAnnouncements(): Promise<number> {
  const client = getServiceClient()
  if (!client) return 0

  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  const { data: announcements } = await client
    .from('announcements')
    .select('id, title, body, user_id, module_id, created_at')
    .gte('created_at', since)
    .limit(100)

  if (!announcements) return 0

  let created = 0

  for (const ann of announcements as Record<string, unknown>[]) {
    const userId = ann.user_id as string
    if (!userId) continue

    const isDupe = await deduplicateNotification({
      userId,
      type: 'new_task',
      dedupeKey: `ann:${ann.id as string}`,
      windowHours: 24,
    })
    if (isDupe) continue

    await createNotification({
      userId,
      type: 'new_module',
      title: `New announcement: ${ann.title as string}`,
      body: ann.body ? String(ann.body).slice(0, 120) : null,
      severity: 'info',
      metadata: { announcementId: ann.id as string, dedupeKey: `ann:${ann.id as string}` },
    })
    created++
  }

  return created
}

// ---------------------------------------------------------------------------
// Stuck job cleanup (running jobs older than 10 min)
// ---------------------------------------------------------------------------

async function cleanStuckJobs(): Promise<number> {
  const client = getServiceClient()
  if (!client) return 0

  const stuckSince = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: stuckJobs } = await client
    .from('queued_jobs')
    .select('id, user_id, title, type, attempts, max_attempts')
    .eq('status', 'running')
    .lte('started_at', stuckSince)
    .limit(50)

  if (!stuckJobs) return 0

  let resolved = 0

  for (const job of stuckJobs as Record<string, unknown>[]) {
    const attempts = (job.attempts as number) ?? 0
    const maxAttempts = (job.max_attempts as number) ?? 3
    const jobId = job.id as string

    if (attempts >= maxAttempts) {
      await client
        .from('queued_jobs')
        .update({ status: 'failed', error: 'Job timed out after 10 minutes.', completed_at: new Date().toISOString() } as never)
        .eq('id', jobId)

      await createNotification({
        userId: job.user_id as string,
        type: 'queue_failed',
        title: `Job timed out: ${job.title as string}`,
        body: 'This job ran too long and was automatically cancelled.',
        severity: 'error',
        metadata: { jobId, dedupeKey: `timeout:${jobId}` },
      })
    } else {
      await client
        .from('queued_jobs')
        .update({ status: 'pending', started_at: null, attempts: attempts + 1 } as never)
        .eq('id', jobId)
    }

    resolved++
  }

  return resolved
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  if (!validateCronSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await Promise.allSettled([
    scanDueSoon(),
    scanNewAnnouncements(),
    cleanStuckJobs(),
  ])

  const [dueSoon, announcements, stuckJobs] = results.map((r) =>
    r.status === 'fulfilled' ? r.value : 0,
  )

  console.info('[cron/hourly] scan complete', { dueSoon, announcements, stuckJobs })

  return NextResponse.json({
    ok: true,
    scanned: { dueSoon, announcements, stuckJobs },
  })
}
