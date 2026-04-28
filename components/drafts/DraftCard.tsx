'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deleteLibraryItemAction } from '@/actions/drafts'
import { dispatchInAppToast } from '@/lib/notifications'
import type { StudyLibraryItem } from '@/lib/types'

const kindLabels: Record<StudyLibraryItem['kind'], string> = {
  learning: 'Learning',
  task: 'Task',
}

export function DraftCard({ item }: { item: StudyLibraryItem }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!confirmDelete) {
      setConfirmDelete(true)
      // Auto-cancel confirm after 4 s
      setTimeout(() => setConfirmDelete(false), 4000)
      return
    }

    setDeleting(true)
    setConfirmDelete(false)
    const result = await deleteLibraryItemAction(item.id, item.entryKind)
    if (result.ok) {
      dispatchInAppToast({ title: 'Deleted', description: `"${item.title}" was removed.`, tone: 'info' })
      router.refresh()
    } else {
      dispatchInAppToast({ title: 'Could not delete', description: result.error ?? 'Try again.', tone: 'error' })
      setDeleting(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <Link
        href={item.href}
        style={{
          display: 'grid',
          gap: '0.38rem',
          borderRadius: 'var(--radius-tight)',
          border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
          background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)',
          padding: '0.8rem 2.6rem 0.8rem 0.85rem',
          textDecoration: 'none',
          boxShadow: 'var(--shadow-low)',
          transition: 'border-color 0.12s, box-shadow 0.12s',
        }}
        className="ui-interactive-card"
      >
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.24rem 0.55rem',
            borderRadius: '999px',
            border: '1px solid var(--border-subtle)',
            background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
            fontSize: '11px',
            fontWeight: 700,
            lineHeight: 1.2,
            color: 'var(--text-primary)',
          }}>
            {kindLabels[item.kind]}
          </span>
          {item.subtitle ? <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 700 }}>{item.subtitle}</span> : null}
        </div>

        <p style={{ margin: 0, fontSize: '0.93rem', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 650 }}>
          {item.title}
        </p>

        {(item.courseTitle || item.moduleTitle || item.taskTitle) && (
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {buildContextLine(item)}
          </p>
        )}

        <p style={{ margin: '0.1rem 0 0', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted)' }}>
          Updated {formatShortDate(item.updatedAt)}
        </p>
      </Link>

      {/* Delete button — overlaid top-right */}
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        title={confirmDelete ? 'Click again to confirm deletion' : 'Delete this item'}
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.6rem',
          height: '1.6rem',
          borderRadius: 'var(--radius-control)',
          border: confirmDelete
            ? '1px solid color-mix(in srgb, var(--red) 50%, var(--border-subtle) 50%)'
            : '1px solid transparent',
          background: confirmDelete
            ? 'color-mix(in srgb, var(--red) 12%, var(--surface-base) 88%)'
            : 'transparent',
          color: confirmDelete ? 'var(--red)' : 'var(--text-muted)',
          cursor: deleting ? 'default' : 'pointer',
          opacity: deleting ? 0.5 : 1,
          transition: 'background 0.1s, color 0.1s, border-color 0.1s',
        }}
        className="ui-interactive-row"
      >
        <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} />
      </button>
    </div>
  )
}

function buildContextLine(item: StudyLibraryItem) {
  const parts = [item.courseTitle, item.moduleTitle].filter(Boolean)
  if (item.kind === 'task' && item.taskTitle && item.taskTitle !== item.title) parts.push(`Task: ${item.taskTitle}`)
  return parts.join(' / ')
}

function formatShortDate(value?: string) {
  if (!value) return 'recently'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
