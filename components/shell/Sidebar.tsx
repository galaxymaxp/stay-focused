'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Calendar, Settings, X, GraduationCap, Library } from 'lucide-react'
import { cn } from '@/lib/cn'

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/courses', label: 'Courses', icon: BookOpen },
  { href: '/library', label: 'Study Library', icon: Library },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/settings', label: 'Settings', icon: Settings },
]

type Props = {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 flex h-full w-[220px] flex-col bg-sf-sidebar border-r border-sf-sidebar-border',
          'transition-transform duration-200',
          'lg:relative lg:translate-x-0 lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-sf-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sf-accent">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold text-white tracking-tight">Stay Focused</span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-sf-sidebar-muted hover:text-sf-sidebar-text transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive(href)
                  ? 'bg-sf-sidebar-active text-white'
                  : 'text-sf-sidebar-text hover:bg-sf-sidebar-hover hover:text-white',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="font-medium">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer hint */}
        <div className="px-5 py-4 border-t border-sf-sidebar-border">
          <p className="text-xs text-sf-sidebar-muted">Spring 2026</p>
        </div>
      </aside>
    </>
  )
}
