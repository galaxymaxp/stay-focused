'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type { ParsedAnnouncement } from '@/lib/announcements'

export function AnnouncementsMenu({
  announcements,
}: {
  announcements: ParsedAnnouncement[]
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const latest = announcements[0] ?? null

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
        className="ui-button ui-button-ghost"
        style={{
          minHeight: '40px',
          padding: '0.45rem 0.75rem',
          display: 'grid',
          gap: '0.08rem',
          justifyItems: 'start',
          textAlign: 'left',
          minWidth: 'min(18rem, calc(100vw - 8rem))',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Announcements
        </span>
        <span style={{ fontSize: '12px', lineHeight: 1.35, color: 'var(--text-primary)', maxWidth: '16rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {latest ? `${latest.title} · ${latest.courseName}` : 'No recent items'}
        </span>
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
              <p className="ui-kicker">Announcements</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: '13px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                Latest synced course announcements, with module fallback when no direct target is stored.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="ui-button ui-button-ghost ui-button-xs">
              Close
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', fontSize: '13px', lineHeight: 1.6 }}>
              Nothing has been captured yet. Sync a course to populate recent announcements here.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.55rem', maxHeight: '19rem', overflowY: 'auto', paddingRight: '0.18rem' }}>
              {announcements.map((announcement) => (
                <AnnouncementMenuItem key={`${announcement.moduleId}-${announcement.supportId}`} announcement={announcement} onSelect={() => setOpen(false)} />
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
  onSelect,
}: {
  announcement: ParsedAnnouncement
  onSelect: () => void
}) {
  const body = announcement.body
    ? announcement.body.length > 150
      ? `${announcement.body.slice(0, 150).trimEnd()}...`
      : announcement.body
    : null

  const content = (
    <>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="ui-chip ui-chip-soft">Announcement</span>
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
    </>
  )

  if (announcement.external) {
    return (
      <a
        href={announcement.href}
        target="_blank"
        rel="noreferrer"
        onClick={onSelect}
        className="ui-card-soft"
        style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', textDecoration: 'none', display: 'block' }}
      >
        {content}
      </a>
    )
  }

  return (
    <Link
      href={announcement.href}
      onClick={onSelect}
      className="ui-card-soft"
      style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', textDecoration: 'none', display: 'block' }}
    >
      {content}
    </Link>
  )
}
