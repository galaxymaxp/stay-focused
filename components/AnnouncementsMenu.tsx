'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { ParsedAnnouncement } from '@/lib/announcements'
import { useAnnouncementViewedState } from '@/components/useAnnouncementViewedState'

export function AnnouncementsMenu({
  announcements,
}: {
  announcements: ParsedAnnouncement[]
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const state = useAnnouncementViewedState(announcements)
  const unviewedCount = announcements.filter((announcement) => !state.isViewed(announcement.announcementKey)).length

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="ui-button ui-button-secondary"
        style={triggerStyle}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--text-secondary)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6.25 8.25h11.5M6.25 12h11.5M6.25 15.75h7.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </span>
        <span style={{ fontSize: '12px', fontWeight: 650, color: 'var(--text-primary)' }}>Updates</span>
        {unviewedCount > 0 && (
          <span className="ui-chip" style={unviewedCountStyle}>
            {unviewedCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent announcements"
          className="ui-floating"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            width: 'min(26rem, calc(100vw - 2rem))',
            borderRadius: 'var(--radius-panel)',
            padding: '0.8rem',
            display: 'grid',
            gap: '0.7rem',
            zIndex: 40,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
            <div>
              <p className="ui-kicker">Updates</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                Recent course updates, with a fallback to the related module when a direct announcement link is missing.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ui-button ui-button-ghost ui-button-xs">
              Close
            </button>
          </div>

          {state.errorMessage && (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem', fontSize: '13px', lineHeight: 1.55 }}>
              {state.errorMessage}
            </div>
          )}

          {announcements.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', fontSize: '13px', lineHeight: 1.6 }}>
              Nothing has been captured yet. Sync a course to populate recent announcements here.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.55rem', maxHeight: '19rem', overflowY: 'auto', paddingRight: '0.18rem' }}>
              {announcements.map((announcement) => (
                <AnnouncementMenuItem
                  key={announcement.announcementKey}
                  announcement={announcement}
                  isViewed={state.isViewed(announcement.announcementKey)}
                  isPending={state.isSaving && state.pendingAnnouncementKey === announcement.announcementKey}
                  onMarkViewed={() => state.markViewed(announcement.announcementKey)}
                  onMarkUnread={() => state.markUnread(announcement.announcementKey)}
                  onSelect={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AnnouncementMenuItem({
  announcement,
  isViewed,
  isPending,
  onMarkViewed,
  onMarkUnread,
  onSelect,
}: {
  announcement: ParsedAnnouncement
  isViewed: boolean
  isPending: boolean
  onMarkViewed: () => void
  onMarkUnread: () => void
  onSelect: () => void
}) {
  const router = useRouter()
  const body = announcement.body
    ? announcement.body.length > 150
      ? `${announcement.body.slice(0, 150).trimEnd()}...`
      : announcement.body
    : null

  const content = (
    <>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="ui-chip ui-chip-soft">Announcement</span>
        <span className="ui-chip" style={isViewed ? viewedBadgeStyle : unviewedBadgeStyle}>
          {isViewed ? 'Viewed' : 'New'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{announcement.courseName}</span>
        {announcement.postedLabel && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{announcement.postedLabel}</span>}
      </div>
      <p style={{ margin: '0.35rem 0 0', fontSize: '14px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
        {announcement.title}
      </p>
      {body && (
        <p style={{ margin: '0.3rem 0 0', fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
          {body}
        </p>
      )}
      <p style={{ margin: '0.38rem 0 0', fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
        {announcement.external ? 'Open announcement target' : 'Open module support view'}
      </p>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
        <button
          type="button"
          className="ui-button ui-button-secondary ui-button-xs"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()

            if (!isViewed && !isPending) {
              onMarkViewed()
            }

            onSelect()

            if (announcement.external) {
              window.open(announcement.href, '_blank', 'noopener,noreferrer')
              return
            }

            router.push(announcement.href)
          }}
        >
          {isPending && !isViewed ? 'Saving...' : isViewed ? 'Open again' : 'Open and mark viewed'}
        </button>
        <button
          type="button"
          className={`ui-button ${isViewed ? 'ui-button-ghost' : 'ui-button-secondary'} ui-button-xs`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (isPending) return
            if (isViewed) {
              onMarkUnread()
              return
            }
            onMarkViewed()
          }}
        >
          {isPending && isViewed ? 'Saving...' : isViewed ? 'Mark unread' : 'Mark viewed'}
        </button>
      </div>
    </>
  )

  if (announcement.external) {
    return (
      <a
        href={announcement.href}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          if (!isViewed && !isPending) {
            onMarkViewed()
          }
          onSelect()
        }}
        className="ui-card-soft"
        style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', textDecoration: 'none', display: 'block', opacity: isViewed ? 0.82 : 1 }}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={announcement.href}
      onClick={() => {
        if (!isViewed && !isPending) {
          onMarkViewed()
        }
        onSelect()
      }}
      className="ui-card-soft"
      style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', textDecoration: 'none', display: 'block', opacity: isViewed ? 0.82 : 1 }}
    >
      {content}
    </Link>
  )
}

const unviewedCountStyle: CSSProperties = {
  padding: '0.22rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--blue-light) 42%, var(--surface-soft) 58%)',
  color: 'var(--blue)',
  border: '1px solid color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)',
}

const triggerStyle: CSSProperties = {
  minHeight: '2.6rem',
  padding: '0.45rem 0.62rem',
  gap: '0.42rem',
  borderRadius: 'var(--radius-control)',
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
