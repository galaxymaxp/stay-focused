'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { TaskDraftPanel } from '@/components/DoNowPanel'
import type { TaskDraftContext } from '@/lib/do-now'
import type { ManualCopyBundleResult } from '@/lib/manual-copy-bundle'

/**
 * Self-contained trigger button + panel for use inside server-rendered task cards.
 * Manages its own open/closed state so the parent surface stays a server component.
 *
 * The panel is rendered via a portal to document.body so it escapes any ancestor
 * stacking context created by backdrop-filter or isolation:isolate on .glass-panel
 * parents. Without a portal, position:fixed would be contained to the nearest
 * backdrop-filter ancestor instead of the viewport.
 */
export function TaskDraftButton({
  context,
  defaultOpen = false,
  copyBundle,
}: {
  context: TaskDraftContext
  defaultOpen?: boolean
  copyBundle?: Pick<ManualCopyBundleResult, 'bundleText' | 'promptText'>
}) {
  const [open, setOpen] = useState(false)
  const openFromDefault = useEffectEvent(() => {
    setOpen(true)
  })

  useEffect(() => {
    if (defaultOpen) {
      openFromDefault()
    }
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
        Auto Prompt
      </button>

      {open && createPortal(
        <TaskDraftPanel context={context} copyBundle={copyBundle} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  )
}
