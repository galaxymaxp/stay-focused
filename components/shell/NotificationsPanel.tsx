'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Bell, X, Check, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UserNotification, NotificationSeverity } from '@/lib/notifications-server'

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  if (severity === 'success') return <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
  if (severity === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
  if (severity === 'error') return <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
  return <Info className="h-3.5 w-3.5 text-sf-accent flex-shrink-0" />
}

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as { notifications: UserNotification[] }
      setNotifications(data.notifications ?? [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()
    pollRef.current = setInterval(fetchNotifications, 15000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, fetchNotifications])

  // Poll every 60s even when closed to keep badge count fresh
  useEffect(() => {
    const id = setInterval(fetchNotifications, 60000)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications()
    return () => clearInterval(id)
  }, [fetchNotifications])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
    )
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAllRead: true }),
    })
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sf-accent text-white text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            className={cn(
              'absolute right-0 top-10 z-50 w-[360px] rounded-2xl border border-sf-border bg-sf-surface shadow-xl overflow-hidden',
              'max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto max-sm:rounded-2xl',
            )}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-sf-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-sf-text">Updates</p>
                {unreadCount > 0 && (
                  <p className="text-xs text-sf-muted mt-0.5">{unreadCount} unread</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="flex items-center gap-1 text-xs text-sf-accent hover:underline px-2 py-1"
                    title="Mark all read"
                  >
                    <CheckCheck className="h-3 w-3" />
                    All read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[420px] overflow-y-auto divide-y divide-sf-border-muted">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="h-8 w-8 text-sf-subtle mx-auto mb-2" />
                  <p className="text-sm text-sf-muted">No notifications yet.</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'px-4 py-3 transition-colors',
                      !n.readAt && 'bg-sf-accent-light/30 hover:bg-sf-accent-light/50',
                      n.readAt && 'hover:bg-sf-surface-2',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        <SeverityIcon severity={n.severity} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-sf-text leading-snug line-clamp-1">
                            {n.title}
                          </p>
                          <span className="text-[11px] text-sf-subtle flex-shrink-0 mt-0.5">
                            {formatRelativeTime(n.createdAt)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-sf-muted mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          {n.href && (
                            <a
                              href={n.href}
                              className="text-[11px] text-sf-accent hover:underline font-medium"
                              onClick={() => markRead(n.id)}
                            >
                              Open →
                            </a>
                          )}
                          {!n.readAt && (
                            <button
                              onClick={() => markRead(n.id)}
                              className="text-[11px] text-sf-muted hover:text-sf-text flex items-center gap-1"
                            >
                              <Check className="h-3 w-3" />
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
