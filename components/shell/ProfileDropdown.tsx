'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { User, Settings, LogOut, ChevronDown } from 'lucide-react'

export function ProfileDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-sf-surface-2 transition-colors"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sf-accent text-white text-xs font-semibold">
          A
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-sf-subtle" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-2xl border border-sf-border bg-sf-surface shadow-xl overflow-hidden py-1">
          <div className="px-4 py-3 border-b border-sf-border">
            <p className="text-sm font-medium text-sf-text">Alex Student</p>
            <p className="text-xs text-sf-muted truncate">alex@university.edu</p>
          </div>

          <div className="py-1">
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-sf-text hover:bg-sf-surface-2 transition-colors">
              <User className="h-4 w-4 text-sf-muted" />
              Account
            </button>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-sf-text hover:bg-sf-surface-2 transition-colors"
            >
              <Settings className="h-4 w-4 text-sf-muted" />
              Settings
            </Link>
          </div>

          <div className="border-t border-sf-border py-1">
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-sf-error hover:bg-sf-error-bg transition-colors">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
