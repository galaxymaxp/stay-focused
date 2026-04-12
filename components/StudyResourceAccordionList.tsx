'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getResourceElementId } from '@/lib/stay-focused-links'
import { StudyOutlineView } from '@/components/StudyOutlineView'
import type { StudyFileOutlineSection, StudyFileReaderState } from '@/lib/study-file-reader'
import type { LearnResourceActionPriority, LearnResourceStatusKey } from '@/lib/learn-resource-ui'

export interface StudyResourceAccordionItem {
  id: string
  title: string
  note: string
  detailNote: string
  fileTypeLabel: string
  readinessLabel: string
  readinessTone: 'accent' | 'warning' | 'muted'
  statusKey: LearnResourceStatusKey
  readerState: StudyFileReaderState
  primaryAction: LearnResourceActionPriority
  sourceActionLabel: string
  required: boolean
  outlineSections: StudyFileOutlineSection[]
  outlineHint: string | null
  previewState?: 'full_text_available' | 'preview_only' | 'no_text_available' | null
  fallbackReason?: string | null
  readerHref: string
  canvasHref: string | null
  originalFileHref?: string | null
  extraActionHref?: string | null
  extraActionLabel?: string | null
}

export function StudyResourceAccordionList({
  items,
  emptyMessage,
  initialOpenResourceId = null,
}: {
  items: StudyResourceAccordionItem[]
  emptyMessage: string
  initialOpenResourceId?: string | null
}) {
  const lastScrolledResourceId = useRef<string | null>(null)
  const itemIdKey = items.map((item) => item.id).join('|')
  const hasInitialOpenResource = Boolean(initialOpenResourceId && items.some((item) => item.id === initialOpenResourceId))
  const routeKey = `${itemIdKey}:${initialOpenResourceId ?? ''}`
  const [state, setState] = useState<{ routeKey: string; openResourceId: string | null }>({
    routeKey,
    openResourceId: hasInitialOpenResource ? initialOpenResourceId : null,
  })
  const openResourceId = state.routeKey === routeKey
    ? state.openResourceId
    : hasInitialOpenResource
      ? initialOpenResourceId
      : null
  const resolvedOpenResourceId = openResourceId && items.some((item) => item.id === openResourceId)
    ? openResourceId
    : null

  useEffect(() => {
    if (!initialOpenResourceId || resolvedOpenResourceId !== initialOpenResourceId || lastScrolledResourceId.current === initialOpenResourceId) {
      return
    }

    const element = document.getElementById(getResourceElementId(initialOpenResourceId))
    if (!element) return

    lastScrolledResourceId.current = initialOpenResourceId
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }, [initialOpenResourceId, resolvedOpenResourceId])

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
        const sourceHref = item.originalFileHref ?? item.canvasHref
        const showSourceAsPrimary = item.primaryAction === 'source' && Boolean(sourceHref)
        const presentationMode: StudyResourcePresentationMode = item.statusKey === 'ready'
          ? 'notes_first'
          : showSourceAsPrimary
            ? 'source_first'
            : 'reader_fallback'

        return (
          <article
            key={item.id}
            id={getResourceElementId(item.id)}
            className="glass-panel glass-soft ui-interactive-card"
            data-open={expanded ? 'true' : 'false'}
            style={{
              ['--glass-panel-border' as string]: initialOpenResourceId === item.id
                ? 'color-mix(in srgb, var(--accent-border) 36%, var(--border-subtle) 64%)'
                : undefined,
              borderRadius: 'var(--radius-panel)',
              padding: '0.82rem 0.88rem',
              display: 'grid',
              gap: expanded ? '0.72rem' : '0.48rem',
            }}
          >
            <button
              type="button"
              onClick={() => setState((current) => {
                const nextOpenResourceId = openResourceId === item.id ? null : item.id
                if (current.routeKey === routeKey && current.openResourceId === nextOpenResourceId) {
                  return current
                }

                return {
                  routeKey,
                  openResourceId: nextOpenResourceId,
                }
              })}
              aria-expanded={expanded}
              className="ui-interactive-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                alignItems: 'flex-start',
                textAlign: 'left',
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
                {presentationMode === 'notes_first' && item.outlineSections.length > 0 ? (
                  <StudyOutlineView sections={item.outlineSections} />
                ) : presentationMode === 'notes_first' ? (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.outlineHint ?? item.detailNote}
                    </p>
                  </div>
                ) : (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.4rem' }}>
                    <p className="ui-kicker" style={{ margin: 0 }}>
                      {presentationMode === 'reader_fallback' ? 'Reader guidance' : item.readinessLabel}
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.detailNote}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {showSourceAsPrimary ? (
                    <>
                      <a href={sourceHref!} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        {item.sourceActionLabel}
                      </a>
                      <Link href={item.readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open reader
                      </Link>
                    </>
                  ) : (
                    <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open reader
                    </Link>
                  )}
                  {!showSourceAsPrimary && sourceHref && (
                    <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      {item.sourceActionLabel}
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

type StudyResourcePresentationMode = 'notes_first' | 'reader_fallback' | 'source_first'

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
  const clipped = value.slice(0, maxLength)
  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}
