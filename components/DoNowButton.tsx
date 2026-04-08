'use client'

import { useState, useEffect } from 'react'
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
export function DoNowButton({ context, defaultOpen = false }: { context: DoNowContext; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(false)

  // Do not initialize from defaultOpen in useState — the component is a 'use client' component
  // that also runs on the server, and createPortal(content, document.body) must not execute
  // during SSR. Starting with false is safe. This effect handles two cases:
  //   1. Fresh mount (cross-route navigation): defaultOpen=true → opens after hydration
  //   2. Same-route navigation (Suggested Order re-render): defaultOpen prop changes
  //      false→true on an existing instance that was never remounted; useState alone
  //      would miss this since it only captures the initial value.
  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

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
