'use client'

import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { announcements } from '@/lib/mock-data'
import { cn } from '@/lib/cn'

export function AnnouncementsPanel() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const unreadCount = announcements.filter((a) => a.unread).length

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-sf-accent text-white text-[10px] font-bold">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-[360px] rounded-2xl border border-sf-border bg-sf-surface shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-sf-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-sf-text">Announcements</p>
              {unreadCount > 0 && (
                <p className="text-xs text-sf-muted mt-0.5">{unreadCount} unread</p>
              )}
            </div>
            <button className="text-xs text-sf-accent hover:underline">Mark all read</button>
          </div>

          <div className="max-h-[400px] overflow-y-auto divide-y divide-sf-border-muted">
            {announcements.map((a) => (
              <div
                key={a.id}
                className={cn(
                  'px-5 py-4 transition-colors hover:bg-sf-surface-2 cursor-pointer',
                  a.unread && 'bg-sf-accent-light/40',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-sf-accent">{a.course}</span>
                      {a.unread && (
                        <span className="h-1.5 w-1.5 rounded-full bg-sf-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-sf-text leading-5 line-clamp-2">{a.title}</p>
                    <p className="text-xs text-sf-muted mt-1 line-clamp-1">{a.body}</p>
                  </div>
                  <span className="text-xs text-sf-subtle flex-shrink-0 mt-0.5">{a.time}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t border-sf-border">
            <button className="text-xs text-sf-muted hover:text-sf-text transition-colors">
              View all announcements
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
