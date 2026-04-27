'use client'

import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAnnouncementViewedState } from '@/components/useAnnouncementViewedState'
import { buildAnnouncementKey } from '@/lib/announcements'

export function AnnouncementSupportRow({
  moduleId,
  courseId,
  supportId,
  title,
  canvasHref,
  note,
  highlighted = false,
}: {
  moduleId: string
  courseId: string | null
  supportId: string
  title: string
  canvasHref: string | null
  note: string
  highlighted?: boolean
}) {
  const router = useRouter()
  const href = canvasHref ?? `/modules/${moduleId}/learn?panel=source-support&support=${supportId}#support-${encodeURIComponent(supportId)}`
  const announcementKey = buildAnnouncementKey({
    courseId: courseId ?? '',
    title,
    href,
    targetHref: canvasHref,
  })
  const announcementItems = useMemo(() => [{
    announcementKey,
    moduleId,
    supportId,
    title,
    postedLabel: null,
    href,
  }], [announcementKey, moduleId, supportId, title, href])
  const state = useAnnouncementViewedState(announcementItems)
  const isViewed = state.isViewed(announcementKey)
  const isPending = state.isSaving && state.pendingAnnouncementKey === announcementKey

  return (
    <article
      id={`support-${encodeURIComponent(supportId)}`}
      className="ui-card-soft"
      style={{
        borderRadius: 'var(--radius-panel)',
        padding: '0.82rem 0.88rem',
        display: 'grid',
        gap: '0.55rem',
        border: highlighted
          ? '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
          : isViewed
            ? '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)'
            : '1px solid color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)',
        opacity: isViewed ? 0.84 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span className="ui-chip ui-chip-soft">Announcement</span>
        <span className="ui-chip" style={isViewed ? viewedBadgeStyle : unviewedBadgeStyle}>
          {isViewed ? 'Viewed' : 'New'}
        </span>
      </div>

      <div>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
          {title}
        </p>
        <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {note}
        </p>
      </div>

      {state.errorMessage && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--red)' }}>
          {state.errorMessage}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="ui-button ui-button-secondary ui-button-xs"
          onClick={() => {
            if (!isViewed && !isPending) {
              state.markViewed(announcementKey)
            }

            if (canvasHref) {
              window.open(canvasHref, '_blank', 'noopener,noreferrer')
              return
            }

            router.push(href)
          }}
        >
          {isPending && !isViewed ? 'Saving...' : isViewed ? 'Open again' : 'Open and mark viewed'}
        </button>
        <button
          type="button"
          className={`ui-button ${isViewed ? 'ui-button-ghost' : 'ui-button-secondary'} ui-button-xs`}
          onClick={() => {
            if (isPending) return
            if (isViewed) {
              state.markUnread(announcementKey)
              return
            }
            state.markViewed(announcementKey)
          }}
        >
          {isPending && isViewed ? 'Saving...' : isViewed ? 'Mark unread' : 'Mark viewed'}
        </button>
        {canvasHref ? (
          <Link href={`/modules/${moduleId}/learn?panel=source-support&support=${supportId}#support-${encodeURIComponent(supportId)}`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Stay in Learn
          </Link>
        ) : null}
      </div>
    </article>
  )
}

const viewedBadgeStyle: CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
}

const unviewedBadgeStyle: CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-soft) 58%)',
  color: 'var(--blue)',
  border: '1px solid color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)',
}
