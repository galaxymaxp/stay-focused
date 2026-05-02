'use client'

import { queueSourceOcrAction } from '@/actions/queue-jobs'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export function OcrSourceButton({
  moduleId,
  resourceId,
  className = 'ui-button ui-button-secondary ui-button-xs',
  autoStart = false,
  statusOnly = false,
  idleLabel = 'Extract text from images',
  activeLabel = 'Scanning...',
  resourceTitle = 'Study source',
  courseId = null,
  manualRetry = false,
}: {
  moduleId: string
  resourceId: string | null
  courseId?: string | null
  resourceTitle?: string
  className?: string
  autoStart?: boolean
  statusOnly?: boolean
  idleLabel?: string
  activeLabel?: string
  manualRetry?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const autoStartedRef = useRef(false)

  const runOcr = useCallback(async () => {
    if (!resourceId || busy) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await queueSourceOcrAction({
        moduleId,
        resourceId,
        courseId,
        resourceTitle,
        manualRetry,
      })
      if (result.error) {
        setMessage(result.error)
      } else {
        setMessage('Scanned PDF is queued for text extraction.')
        window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh', { detail: { job: result.job ?? null } }))
      }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, courseId, manualRetry, moduleId, resourceId, resourceTitle, router])

  useEffect(() => {
    if (!autoStart || !resourceId || autoStartedRef.current) return
    autoStartedRef.current = true
    void runOcr()
  }, [autoStart, resourceId, runOcr])

  if (statusOnly) {
    return (
      <span style={{ fontSize: '12px', lineHeight: 1.5, color: busy ? 'var(--text-secondary)' : message ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {busy ? activeLabel : message ?? 'Scanned PDF is queued for text extraction.'}
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || !resourceId}
        onClick={runOcr}
        className={className}
      >
        {busy ? activeLabel : idleLabel}
      </button>
      {message && (
        <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {message}
        </span>
      )}
    </>
  )
}
