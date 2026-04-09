'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ParsedAnnouncement } from '@/lib/announcements'
import { useAnnouncementViewedState } from '@/components/useAnnouncementViewedState'

/**
 * Displays recent Canvas announcements on the Home page.
 * Announcements are currently parsed from modules' raw_content at sync time -
 * there is no dedicated announcements table yet.
 * If no announcements exist, shows an honest placeholder.
 */
export function AnnouncementsBand({
  announcements,
}: {
  announcements: ParsedAnnouncement[]
}) {
  const state = useAnnouncementViewedState(announcements)

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <p className="ui-kicker" style={{ margin: 0 }}>Announcements</p>
          <h2 className="ui-section-title" style={{ marginTop: '0.38rem', fontSize: '1.02rem' }}>Recent course updates</h2>
          <p className="ui-section-copy" style={{ marginTop: '0.32rem' }}>
            Newest synced announcements, with direct Canvas targets when that target was captured.
          </p>
        </div>
        <span className="ui-chip ui-chip-soft">{announcements.length} recent</span>
      </div>

      {state.errorMessage && (
        <div className="ui-empty" style={errorStyle}>
          {state.errorMessage}
        </div>
      )}

      {announcements.length === 0 ? (
        <div className="ui-empty" style={emptyStyle}>
          Canvas announcements will appear here after syncing a course. Up to 5 recent announcements
          per course are captured during sync.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '18.5rem', overflowY: 'auto', paddingRight: '0.18rem' }}>
          {announcements.map((announcement) => (
            <AnnouncementCard
              key={announcement.announcementKey}
              announcement={announcement}
              isViewed={state.isViewed(announcement.announcementKey)}
              isPending={state.isSaving && state.pendingAnnouncementKey === announcement.announcementKey}
              onMarkViewed={() => state.markViewed(announcement.announcementKey)}
              onMarkUnread={() => state.markUnread(announcement.announcementKey)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AnnouncementCard({
  announcement,
  isViewed,
  isPending,
  onMarkViewed,
  onMarkUnread,
}: {
  announcement: ParsedAnnouncement
  isViewed: boolean
  isPending: boolean
  onMarkViewed: () => void
  onMarkUnread: () => void
}) {
  const router = useRouter()
  const body = announcement.body
    ? announcement.body.length > 220
      ? `${announcement.body.slice(0, 220).trimEnd()}...`
      : announcement.body
    : null

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.42rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
        <span className="ui-chip" style={announceBadgeStyle}>Announcement</span>
        <span className="ui-chip" style={isViewed ? viewedBadgeStyle : unviewedBadgeStyle}>
          {isViewed ? 'Viewed' : 'New'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{announcement.courseName}</span>
        {announcement.postedLabel && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{announcement.postedLabel}</span>}
      </div>
      <p style={titleStyle}>{announcement.title}</p>
      {body && <p style={bodyStyle}>{body}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginTop: '0.38rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
          {announcement.external ? 'Open announcement target' : 'Open module support view'}
        </p>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="ui-button ui-button-secondary ui-button-xs"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()

              if (!isViewed && !isPending) {
                onMarkViewed()
              }

              if (announcement.external) {
                window.open(announcement.href, '_blank', 'noopener,noreferrer')
                return
              }

              router.push(announcement.href)
            }}
            style={{ minHeight: '1.95rem' }}
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
            style={{ minHeight: '1.95rem' }}
          >
            {isPending && isViewed ? 'Saving...' : isViewed ? 'Mark unread' : 'Mark viewed'}
          </button>
        </div>
      </div>
    </>
  )

  if (announcement.external) {
    return (
      <a
        href={announcement.href}
        target="_blank"
        rel="noreferrer"
        className="glass-panel glass-hover"
        style={cardStyle(isViewed)}
        onClick={() => {
          if (!isViewed && !isPending) {
            onMarkViewed()
          }
        }}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={announcement.href}
      className="glass-panel glass-hover"
      style={cardStyle(isViewed)}
      onClick={() => {
        if (!isViewed && !isPending) {
          onMarkViewed()
        }
      }}
    >
      {content}
    </Link>
  )
}

const emptyStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.9rem 1rem',
  fontSize: '14px',
  lineHeight: 1.6,
}

const errorStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.8rem 0.95rem',
  fontSize: '13px',
  lineHeight: 1.55,
}

function cardStyle(isViewed: boolean): CSSProperties {
  return {
    borderRadius: 'var(--radius-panel)',
    padding: '0.78rem 0.88rem',
    textDecoration: 'none',
    display: 'block',
    opacity: isViewed ? 0.8 : 1,
    border: isViewed
      ? '1px solid color-mix(in srgb, var(--border-subtle) 85%, transparent)'
      : '1px solid color-mix(in srgb, var(--blue) 20%, var(--border-subtle) 80%)',
  }
}

const announceBadgeStyle: CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--blue-light) 55%, var(--surface-soft) 45%)',
  color: 'var(--blue)',
  border: '1px solid color-mix(in srgb, var(--blue) 22%, var(--border-subtle) 78%)',
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: 1.3,
  color: 'var(--text-primary)',
}

const bodyStyle: CSSProperties = {
  margin: '0.35rem 0 0',
  fontSize: '13px',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
}
