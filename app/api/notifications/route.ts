import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { getUserNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/notifications-server'

export const runtime = 'nodejs'

export async function GET() {
  const user = await getAuthenticatedUserServer()
  if (!user) return NextResponse.json({ notifications: [] })

  const notifications = await getUserNotifications(user.id, { limit: 40 })
  return NextResponse.json({ notifications })
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUserServer()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { id?: string; markAllRead?: boolean }

  if (body.markAllRead) {
    await markAllNotificationsRead(user.id)
    return NextResponse.json({ ok: true })
  }

  if (body.id) {
    await markNotificationRead(body.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'No id or markAllRead provided.' }, { status: 400 })
}
