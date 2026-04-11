'use client'

import type { CSSProperties } from 'react'
import { useEffect, useEffectEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import { getTaskDraftSessionKey, TaskDraftPanel } from '@/components/DoNowPanel'
import type { PromptBuildSnapshot } from '@/components/usePromptBuild'
import type { TaskDraftContext } from '@/lib/do-now'
import type { ManualCopyBundleResult } from '@/lib/manual-copy-bundle'

const draftSessionCache = new Map<string, PromptBuildSnapshot>()

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
  buttonStyle,
  entryOrigin = 'do',
  doPageHref,
}: {
  context: TaskDraftContext
  defaultOpen?: boolean
  copyBundle?: Pick<ManualCopyBundleResult, 'bundleText' | 'promptText'>
  buttonStyle?: CSSProperties
  entryOrigin?: 'today' | 'do'
  doPageHref?: string
}) {
  const [open, setOpen] = useState(false)
  const [, setCacheVersion] = useState(0)
  const sessionKey = getTaskDraftSessionKey(context)
  const initialSnapshot = draftSessionCache.get(sessionKey) ?? null

  const openFromDefault = useEffectEvent(() => {
    setOpen(true)
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    if (url.searchParams.get('donow') !== '1') return

    url.searchParams.delete('donow')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
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
        style={{ textDecoration: 'none', ...buttonStyle }}
      >
        Start with help
      </button>

      {initialSnapshot && (
        <span
          className="ui-chip"
          style={{
            padding: '0.22rem 0.55rem',
            fontSize: '11px',
            fontWeight: 700,
            background: 'color-mix(in srgb, var(--blue-light) 34%, var(--surface-soft) 66%)',
            color: 'var(--blue)',
            border: '1px solid color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)',
          }}
        >
          {initialSnapshot.draftSource === 'saved' ? 'Saved draft ready' : 'Draft ready'}
        </span>
      )}

      {open && createPortal(
        <TaskDraftPanel
          context={context}
          copyBundle={copyBundle}
          initialSnapshot={initialSnapshot}
          entryOrigin={entryOrigin}
          doPageHref={doPageHref}
          onSnapshotChange={(snapshot) => {
            draftSessionCache.set(sessionKey, snapshot)
            setCacheVersion((version) => version + 1)
          }}
          onClose={() => setOpen(false)}
        />,
        document.body,
      )}
    </>
  )
}
