'use client'

import { useEffect, useState } from 'react'

type CopyState = 'idle' | 'success' | 'error'

export function CopyTaskBundleActions({
  bundleText,
  promptText,
  fullLabel = 'Copy for external AI',
  fullTone = 'secondary',
}: {
  bundleText: string
  promptText: string
  fullLabel?: string
  fullTone?: 'primary' | 'secondary' | 'ghost'
}) {
  const [copyState, setCopyState] = useState<CopyState>('idle')

  useEffect(() => {
    if (copyState === 'idle') return

    const timeout = window.setTimeout(() => {
      setCopyState('idle')
    }, 2200)

    return () => window.clearTimeout(timeout)
  }, [copyState])

  async function handleCopy(text: string) {
    try {
      await copyText(text)
      setCopyState('success')
    } catch (error) {
      console.error('Copy failed:', error)
      setCopyState('error')
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => void handleCopy(bundleText || promptText)}
        className={`ui-button ${toneToClassName(fullTone)} ui-button-xs`}
      >
        {fullLabel}
      </button>

      <p aria-live="polite" style={{
        margin: 0,
        minHeight: '1.2rem',
        fontSize: '12px',
        lineHeight: 1.45,
        color: copyState === 'error' ? 'var(--red)' : 'var(--text-secondary)',
      }}>
        {copyState === 'success'
          ? 'Copied'
          : copyState === 'error'
            ? 'Copy failed. Try again.'
            : ''}
      </p>
    </div>
  )
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const succeeded = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!succeeded) {
    throw new Error('Copy command failed')
  }
}

function toneToClassName(tone: 'primary' | 'secondary' | 'ghost') {
  if (tone === 'primary') return 'ui-button-primary'
  if (tone === 'secondary') return 'ui-button-secondary'
  return 'ui-button-ghost'
}
