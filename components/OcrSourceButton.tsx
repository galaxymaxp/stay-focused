'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

export function OcrSourceButton({
  moduleId,
  resourceId,
  className = 'ui-button ui-button-secondary ui-button-xs',
  autoStart = false,
  statusOnly = false,
  idleLabel = 'Extract text from images',
}: {
  moduleId: string
  resourceId: string | null
  className?: string
  autoStart?: boolean
  statusOnly?: boolean
  idleLabel?: string
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
      const response = await fetch('/api/sources/ocr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resourceId, moduleId }),
      })
      const payload = await response.json().catch(() => null) as { message?: string; error?: string; status?: string } | null
      const nextMessage = payload?.message
        ?? payload?.error
        ?? (response.ok ? 'Text is ready. Generate Deep Learn pack.' : 'OCR failed. Open the original file or retry.')
      setMessage(nextMessage)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }, [busy, moduleId, resourceId, router])

  useEffect(() => {
    if (!autoStart || !resourceId || autoStartedRef.current) return
    autoStartedRef.current = true
    void runOcr()
  }, [autoStart, resourceId, runOcr])

  if (statusOnly) {
    return (
      <span style={{ fontSize: '12px', lineHeight: 1.5, color: busy ? 'var(--text-secondary)' : message ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
        {busy ? 'Reading scanned pages...' : message ?? 'Preparing scanned PDF...'}
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
        {busy ? 'Reading...' : idleLabel}
      </button>
      {message && (
        <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {message}
        </span>
      )}
    </>
  )
}
