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
      className="ui-button ui-button-ghost ui-button-danger"
      style={{
        flexShrink: 0,
        fontSize: '12px',
        borderRadius: 'var(--radius-control)',
        padding: '0.5rem 0.8rem',
        minHeight: '36px',
        whiteSpace: 'nowrap',
      }}
    >
      {isPending ? 'Removing...' : 'Unsync'}
    </button>
  )
}
