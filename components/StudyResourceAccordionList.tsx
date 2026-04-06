'use client'

import Link from 'next/link'
import { useState } from 'react'
import { StudyOutlineView } from '@/components/StudyOutlineView'
import type { StudyFileOutlineSection } from '@/lib/study-file-reader'

export interface StudyResourceAccordionItem {
  id: string
  title: string
  note: string
  fileTypeLabel: string
  readinessLabel: string
  readinessTone: 'accent' | 'warning' | 'muted'
  required: boolean
  outlineSections: StudyFileOutlineSection[]
  outlineHint: string | null
  readerHref: string
  canvasHref: string | null
  extraActionHref?: string | null
  extraActionLabel?: string | null
}

export function StudyResourceAccordionList({
  items,
  emptyMessage,
}: {
  items: StudyResourceAccordionItem[]
  emptyMessage: string
}) {
  const [openResourceId, setOpenResourceId] = useState<string | null>(null)
  const resolvedOpenResourceId = openResourceId && items.some((item) => item.id === openResourceId)
    ? openResourceId
    : null

  if (items.length === 0) {
    return (
      <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      {items.map((item, index) => {
        const expanded = resolvedOpenResourceId === item.id

        return (
          <article
            key={item.id}
            className="glass-panel glass-soft"
            style={{
              borderRadius: 'var(--radius-panel)',
              padding: '0.9rem 0.95rem',
              display: 'grid',
              gap: expanded ? '0.8rem' : '0.55rem',
            }}
          >
            <button
              type="button"
              onClick={() => setOpenResourceId((current) => current === item.id ? null : item.id)}
              aria-expanded={expanded}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                alignItems: 'flex-start',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0, flex: '1 1 320px', display: 'grid', gap: '0.38rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <ResourcePill label={`Resource ${index + 1}`} />
                  <ResourcePill label={item.fileTypeLabel} />
                  <ResourcePill label={item.readinessLabel} tone={item.readinessTone} />
                  <ResourcePill label={`${item.outlineSections.length} note${item.outlineSections.length === 1 ? '' : 's'}`} />
                  {item.required && <ResourcePill label="Required" tone="warning" />}
                </div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.38, color: 'var(--text-primary)' }}>
                  {item.title}
                </h4>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                  {truncateText(item.note, expanded ? 240 : 170)}
                </p>
              </div>

              <span className={expanded ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
                {expanded ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {expanded && (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {item.outlineSections.length > 0 ? (
                  <StudyOutlineView sections={item.outlineSections} />
                ) : (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.outlineHint ?? 'Readable study notes are not available for this resource yet.'}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                    Open reader
                  </Link>
                  {item.canvasHref && (
                    <a href={item.canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open in Canvas
                    </a>
                  )}
                  {item.extraActionHref && item.extraActionLabel && (
                    <Link href={item.extraActionHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      {item.extraActionLabel}
                    </Link>
                  )}
                </div>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function ResourcePill({
  label,
  tone = 'muted',
}: {
  label: string
  tone?: 'accent' | 'warning' | 'muted'
}) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 40%, var(--surface-soft) 60%)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.24rem 0.55rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      color: 'var(--text-primary)',
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trim()}...`
}
