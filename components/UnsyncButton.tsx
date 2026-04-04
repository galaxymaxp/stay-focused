'use client'

import { useTransition } from 'react'
import { deleteModule } from '@/actions/modules'

export function UnsyncButton({ moduleId }: { moduleId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleUnsync(e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm('Remove this module and all its tasks?')) return
    startTransition(() => deleteModule(moduleId))
  }

  return (
    <button
      onClick={handleUnsync}
      disabled={isPending}
      style={{
        flexShrink: 0,
        fontSize: '12px',
        color: 'var(--text-muted)',
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '6px 10px',
        cursor: isPending ? 'not-allowed' : 'pointer',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--red)'
        e.currentTarget.style.borderColor = '#F5C5BC'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--text-muted)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {isPending ? 'Removing...' : 'Unsync'}
    </button>
  )
}