'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { DoNowPanel } from '@/components/DoNowPanel'
import type { DoNowContext } from '@/lib/do-now'

/**
 * Self-contained trigger button + panel for use inside server-rendered task cards.
 * Manages its own open/closed state so the parent (Do page) stays a server component.
 *
 * The panel is rendered via a portal to document.body so it escapes any ancestor
 * stacking context created by backdrop-filter or isolation:isolate on .glass-panel
 * parents — without a portal, position:fixed would be contained to the nearest
 * backdrop-filter ancestor instead of the viewport.
 */
export function DoNowButton({ context }: { context: DoNowContext }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
        className="ui-button ui-button-secondary ui-button-xs"
        style={{ textDecoration: 'none' }}
      >
        Do Now
      </button>

      {open && createPortal(
        <DoNowPanel context={context} onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  )
}
