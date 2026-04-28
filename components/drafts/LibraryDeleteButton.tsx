'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteLibraryItemAction } from '@/actions/drafts'
import { dispatchInAppToast } from '@/lib/notifications'

interface Props {
  id: string
  entryKind: 'draft' | 'deep_learn_note'
  title: string
}

export function LibraryDeleteButton({ id, entryKind, title }: Props) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 4000)
      return
    }

    setDeleting(true)
    setConfirm(false)
    const result = await deleteLibraryItemAction(id, entryKind)

    if (result.ok) {
      dispatchInAppToast({ title: 'Deleted', description: `"${title}" was removed.`, tone: 'info' })
      router.refresh()
    } else {
      dispatchInAppToast({ title: 'Could not delete', description: result.error ?? 'Try again.', tone: 'error' })
      setDeleting(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={deleting}
      title={confirm ? 'Click again to confirm' : 'Delete this item'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1.6rem',
        height: '1.6rem',
        flexShrink: 0,
        borderRadius: 'var(--radius-control)',
        border: confirm
          ? '1px solid color-mix(in srgb, var(--red) 50%, var(--border-subtle) 50%)'
          : '1px solid transparent',
        background: confirm
          ? 'color-mix(in srgb, var(--red) 10%, var(--surface-base) 90%)'
          : 'transparent',
        color: confirm ? 'var(--red)' : 'var(--text-muted)',
        cursor: deleting ? 'default' : 'pointer',
        opacity: deleting ? 0.5 : 1,
        transition: 'background 0.1s, color 0.1s, border-color 0.1s',
      }}
    >
      <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} />
    </button>
  )
}
