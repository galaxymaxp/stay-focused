'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function OcrSourceButton({
  moduleId,
  resourceId,
  className = 'ui-button ui-button-secondary ui-button-xs',
}: {
  moduleId: string
  resourceId: string | null
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={busy || !resourceId}
        onClick={async () => {
          if (!resourceId) return
          setBusy(true)
          setMessage(null)
          try {
            const response = await fetch('/api/sources/ocr', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ resourceId, moduleId }),
            })
            const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
            setMessage(payload?.message ?? payload?.error ?? (response.ok ? 'OCR complete.' : 'OCR failed. Open the original file.'))
            router.refresh()
          } finally {
            setBusy(false)
          }
        }}
        className={className}
      >
        {busy ? 'Extracting...' : 'Extract text from images'}
      </button>
      {message && (
        <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {message}
        </span>
      )}
    </>
  )
}
