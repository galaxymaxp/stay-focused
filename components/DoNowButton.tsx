'use client'

import { useState } from 'react'
import { DoNowPanel } from '@/components/DoNowPanel'
import type { DoNowContext } from '@/lib/do-now'

/**
 * Self-contained trigger button + panel for use inside server-rendered task cards.
 * Manages its own open/closed state so the parent (Do page) stays a server component.
 */
export function DoNowButton({ context }: { context: DoNowContext }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ui-button ui-button-secondary ui-button-xs"
        style={{ textDecoration: 'none' }}
      >
        Do Now
      </button>

      {open && (
        <DoNowPanel context={context} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
