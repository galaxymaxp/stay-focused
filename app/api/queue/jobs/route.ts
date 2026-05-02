import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { dismissCompletedQueuedJobs, dismissQueuedJob, getUserQueuedJobs } from '@/lib/queue'
import { processNextPendingSourceOcrJobForUser, recoverStaleSourceOcrJobs } from '@/actions/queue-jobs'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return NextResponse.json({ jobs: [] }, { status: 200 })
  }

  await recoverStaleSourceOcrJobs(user.id)
  after(async () => {
    await processNextPendingSourceOcrJobForUser(user.id)
  })

  const jobs = await getUserQueuedJobs(user.id, { limit: 50 })
  return NextResponse.json({ jobs })
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as {
    action?: 'dismiss' | 'clear_completed'
    jobId?: string
  } | null

  if (body?.action === 'clear_completed') {
    const ok = await dismissCompletedQueuedJobs(user.id)
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 })
  }

  if (body?.action === 'dismiss' && body.jobId) {
    const ok = await dismissQueuedJob(user.id, body.jobId)
    return NextResponse.json({ ok }, { status: ok ? 200 : 500 })
  }

  return NextResponse.json({ ok: false, error: 'Unsupported queue action.' }, { status: 400 })
}
