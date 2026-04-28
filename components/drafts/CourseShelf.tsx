'use client'

import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { DraftCard } from '@/components/drafts/DraftCard'
import { LibraryDeleteButton } from '@/components/drafts/LibraryDeleteButton'
import type { StudyLibraryItem } from '@/lib/types'

interface CourseShelfProps {
  courseName: string
  courseCode: string
  items: StudyLibraryItem[]
  latestItemHref: string
  totalCount: number
  lastUpdated: string
}

export function CourseShelf({
  courseName,
  courseCode,
  items,
  latestItemHref,
  totalCount,
  lastUpdated,
}: CourseShelfProps) {
  const contentId = useId()
  const [isExpanded, setIsExpanded] = useState(items.length === 0)

  return (
    <div
      className="section-shell"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '1rem',
        padding: '0.85rem 1rem',
        borderBottom: isExpanded
          ? '1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent)'
          : 'none',
        background: 'color-mix(in srgb, var(--surface-soft) 56%, transparent)',
        flexWrap: 'wrap',
      }}>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => setIsExpanded((current) => !current)}
          style={{
            flex: '1 1 320px',
            minWidth: 0,
            border: 0,
            background: 'transparent',
            padding: 0,
            textAlign: 'left',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '1.5rem',
              height: '1.5rem',
              borderRadius: '999px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
              background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)',
              flexShrink: 0,
              marginTop: '0.05rem',
            }}
          >
            <ChevronDown
              className="h-3.5 w-3.5"
              style={{
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.12s ease',
              }}
            />
          </span>

          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.28rem', flexWrap: 'wrap' }}>
              <span style={{ margin: 0, fontSize: '0.9rem', fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {courseName}
              </span>
              {courseCode && (
                <span style={{ flexShrink: 0, fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                  {courseCode}
                </span>
              )}
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {formatCountLabel(totalCount)}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Updated {lastUpdated}</span>
            </span>
          </span>
        </button>

        <Link
          href={latestItemHref}
          className="ui-button ui-button-ghost ui-button-xs"
          style={{ flexShrink: 0, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          Resume latest
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {isExpanded && (
        <div id={contentId} style={{ padding: '0.85rem 1rem', display: 'grid', gap: '0.6rem' }}>
          {items.map((item) => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: '0.4rem' }}>
              <DraftCard item={item} />
              <LibraryDeleteButton id={item.id} entryKind={item.entryKind} title={item.title} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatCountLabel(totalCount: number) {
  return `${totalCount} saved item${totalCount === 1 ? '' : 's'}`
}
