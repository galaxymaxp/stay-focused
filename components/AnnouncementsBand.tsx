'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
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

      {announcements.length === 0 ? (
        <div className="ui-empty" style={emptyStyle}>
          Canvas announcements will appear here after syncing a course. Up to 5 recent announcements
          per course are captured during sync.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxHeight: '18.5rem', overflowY: 'auto', paddingRight: '0.18rem' }}>
          {announcements.map((announcement) => (
            <AnnouncementCard key={`${announcement.moduleId}-${announcement.supportId}`} announcement={announcement} />
          ))}
        </div>
      )}
    </section>
  )
}

function AnnouncementCard({ announcement }: { announcement: ParsedAnnouncement }) {
  const body = announcement.body
    ? announcement.body.length > 220
      ? `${announcement.body.slice(0, 220).trimEnd()}...`
      : announcement.body
    : null

  const content = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.42rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
        <span className="ui-chip" style={announceBadgeStyle}>Announcement</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{announcement.courseName}</span>
        {announcement.postedLabel && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{announcement.postedLabel}</span>}
      </div>
      <p style={titleStyle}>{announcement.title}</p>
      {body && <p style={bodyStyle}>{body}</p>}
      <p style={{ margin: '0.38rem 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
        {announcement.external ? 'Open announcement target' : 'Open module support view'}
      </p>
    </>
  )

  if (announcement.external) {
    return (
      <a href={announcement.href} target="_blank" rel="noreferrer" className="glass-panel glass-hover" style={cardStyle}>
        {content}
      </a>
    )
  }

  return (
    <Link href={announcement.href} className="glass-panel glass-hover" style={cardStyle}>
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

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-panel)',
  padding: '0.78rem 0.88rem',
  textDecoration: 'none',
  display: 'block',
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
