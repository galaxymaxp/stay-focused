'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteLibraryItemAction } from '@/actions/drafts'
import { dispatchInAppToast } from '@/lib/notifications'

interface Props {
  id: string
  entryKind: 'draft' | 'deep_learn_note'
  title: string
  size?: 'icon' | 'text'
  redirectHref?: string
}

export function LibraryDeleteButton({ id, entryKind, title, size = 'icon', redirectHref }: Props) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const noun = entryKind === 'deep_learn_note' ? 'saved study pack' : 'draft'
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()

    if (!confirm) {
      setConfirm(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setConfirm(false), 4000)
      return
    }

    setDeleting(true)
    setConfirm(false)
    const result = await deleteLibraryItemAction(id, entryKind)

    if (result.ok) {
      dispatchInAppToast({ title: 'Deleted', description: `"${title}" was removed from your Study Library.`, tone: 'info' })
      if (redirectHref) router.push(redirectHref)
      else router.refresh()
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
      aria-label={confirm ? `Delete this ${noun}?` : `Delete this ${noun}`}
      title={confirm ? `Delete this ${noun}? Click again to confirm.` : `Delete this ${noun}`}
      className="ui-button ui-button-ghost ui-button-xs"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        width: size === 'icon' && !confirm ? '1.8rem' : undefined,
        height: size === 'icon' ? '1.8rem' : undefined,
        padding: size === 'icon' && !confirm ? 0 : undefined,
        flexShrink: 0,
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
      {(size === 'text' || confirm) && (confirm ? 'Delete?' : 'Delete')}
    </button>
  )
}
