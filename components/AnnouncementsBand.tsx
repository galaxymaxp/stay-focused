'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import type { ParsedAnnouncement } from '@/lib/announcements'

/**
 * Displays recent Canvas announcements on the Home page.
 * Announcements are currently parsed from modules' raw_content at sync time —
 * there is no dedicated announcements table yet.
 * If no announcements exist, shows an honest placeholder.
 */
export function AnnouncementsBand({
  announcements,
}: {
  announcements: ParsedAnnouncement[]
}) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <p className="ui-kicker" style={{ margin: 0 }}>Announcements</p>
      </div>

      {announcements.length === 0 ? (
        <div className="ui-empty" style={emptyStyle}>
          Canvas announcements will appear here after syncing a course. Up to 5 recent announcements
          per course are captured during sync.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {announcements.map((ann, i) => (
            <AnnouncementCard key={i} announcement={ann} />
          ))}
        </div>
      )}
    </section>
  )
}

function AnnouncementCard({ announcement }: { announcement: ParsedAnnouncement }) {
  const body = announcement.body
    ? announcement.body.length > 220
      ? `${announcement.body.slice(0, 220).trimEnd()}…`
      : announcement.body
    : null

  return (
    <article className="glass-panel" style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <span className="ui-chip" style={announceBadgeStyle}>Announcement</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{announcement.courseName}</span>
          </div>
          <p style={titleStyle}>{announcement.title}</p>
          {body && <p style={bodyStyle}>{body}</p>}
        </div>
        <Link
          href={`/modules/${announcement.moduleId}/learn`}
          className="ui-button ui-button-ghost"
          style={viewLinkStyle}
        >
          View module
        </Link>
      </div>
    </article>
  )
}

const emptyStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.9rem 1rem',
  fontSize: '14px',
  lineHeight: 1.6,
}

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.85rem 1rem',
}

const announceBadgeStyle: CSSProperties = {
  padding: '0.2rem 0.55rem',
  fontSize: '11px',
  fontWeight: 700,
  background: 'color-mix(in srgb, var(--blue-light) 55%, var(--surface-soft) 45%)',
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

const viewLinkStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: '2.2rem',
  padding: '0.5rem 0.8rem',
  fontSize: '12px',
}
