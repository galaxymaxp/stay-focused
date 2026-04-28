import { NextResponse } from 'next/server'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { getUserQueuedJobs } from '@/lib/queue'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getAuthenticatedUserServer()
  if (!user) {
    return NextResponse.json({ jobs: [] }, { status: 200 })
  }

  const jobs = await getUserQueuedJobs(user.id, { limit: 50 })
  return NextResponse.json({ jobs })
}
