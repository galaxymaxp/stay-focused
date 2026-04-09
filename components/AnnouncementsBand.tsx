'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { loadAnnouncementReadStates, markAnnouncementRead } from '@/actions/announcements'
import type { ParsedAnnouncement } from '@/lib/announcements'

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
  const announcementKeys = useMemo(
    () => announcements.map((announcement) => announcement.announcementKey),
    [announcements],
  )
  const [readAnnouncementKeys, setReadAnnouncementKeys] = useState<string[]>([])
  const [pendingAnnouncementKey, setPendingAnnouncementKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true

    async function hydrateReadState() {
      try {
        const loadedKeys = await loadAnnouncementReadStates(announcementKeys)
        if (!active) return
        setReadAnnouncementKeys(loadedKeys)
      } catch (error) {
        if (!active) return
        console.error('Announcement read-state load failed:', error)
        setErrorMessage('Announcement read state could not be loaded right now.')
      }
    }

    setErrorMessage(null)
    setReadAnnouncementKeys([])

    if (announcementKeys.length > 0) {
      void hydrateReadState()
    }

    return () => {
      active = false
    }
  }, [announcementKeys])

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

      {errorMessage && (
        <div className="ui-empty" style={errorStyle}>
          {errorMessage}
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
              isRead={readAnnouncementKeys.includes(announcement.announcementKey)}
              isPending={isPending && pendingAnnouncementKey === announcement.announcementKey}
              onMarkAsRead={() => {
                setErrorMessage(null)
                setPendingAnnouncementKey(announcement.announcementKey)

                startTransition(async () => {
                  try {
                    await markAnnouncementRead({
                      announcementKey: announcement.announcementKey,
                      moduleId: announcement.moduleId,
                      supportId: announcement.supportId,
                      title: announcement.title,
                      postedLabel: announcement.postedLabel,
                      href: announcement.href,
                    })

                    setReadAnnouncementKeys((current) => current.includes(announcement.announcementKey)
                      ? current
                      : [...current, announcement.announcementKey])
                  } catch (error) {
                    console.error('Announcement read-state save failed:', error)
                    setErrorMessage('Mark as read could not be saved right now.')
                  } finally {
                    setPendingAnnouncementKey(null)
                  }
                })
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function AnnouncementCard({
  announcement,
  isRead,
  isPending,
  onMarkAsRead,
}: {
  announcement: ParsedAnnouncement
  isRead: boolean
  isPending: boolean
  onMarkAsRead: () => void
}) {
  const body = announcement.body
    ? announcement.body.length > 220
      ? `${announcement.body.slice(0, 220).trimEnd()}...`
      : announcement.body
    : null

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.42rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
        <span className="ui-chip" style={announceBadgeStyle}>Announcement</span>
        {isRead && <span className="ui-chip" style={readBadgeStyle}>Read</span>}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{announcement.courseName}</span>
        {announcement.postedLabel && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{announcement.postedLabel}</span>}
      </div>
      <p style={titleStyle}>{announcement.title}</p>
      {body && <p style={bodyStyle}>{body}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginTop: '0.38rem', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
          {announcement.external ? 'Open announcement target' : 'Open module support view'}
        </p>
        <button
          type="button"
          className={`ui-button ${isRead ? 'ui-button-ghost' : 'ui-button-secondary'} ui-button-xs`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (!isRead && !isPending) {
              onMarkAsRead()
            }
          }}
          disabled={isRead || isPending}
          style={{ minHeight: '1.95rem' }}
        >
          {isRead ? 'Read' : isPending ? 'Saving...' : 'Mark as Read'}
        </button>
      </div>
    </>
  )

  if (announcement.external) {
    return (
      <a href={announcement.href} target="_blank" rel="noreferrer" className="glass-panel glass-hover" style={cardStyle(isRead)}>
        {content}
      </a>
    )
  }

  return (
    <Link href={announcement.href} className="glass-panel glass-hover" style={cardStyle(isRead)}>
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

function cardStyle(isRead: boolean): CSSProperties {
  return {
    borderRadius: 'var(--radius-panel)',
    padding: '0.78rem 0.88rem',
    textDecoration: 'none',
    display: 'block',
    opacity: isRead ? 0.78 : 1,
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

const readBadgeStyle: CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
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
