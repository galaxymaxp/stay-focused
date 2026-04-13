'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { getResourceElementId } from '@/lib/stay-focused-links'
import type { StudyFileOutlineSection, StudyFileReaderState } from '@/lib/study-file-reader'
import type { LearnResourceActionPriority, LearnResourceStatusKey } from '@/lib/learn-resource-ui'
import type { DeepLearnNoteLoadAvailability } from '@/lib/types'

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
  moduleId: string
  courseId?: string | null
  deepLearnStatus: 'not_started' | 'pending' | 'ready' | 'failed' | 'blocked' | 'unavailable'
  deepLearnStatusLabel: 'No note yet' | 'Generating' | 'Ready' | 'Failed' | 'Blocked' | 'Unavailable'
  deepLearnTone: 'accent' | 'warning' | 'muted'
  deepLearnSummary: string
  deepLearnDetail: string
  deepLearnPrimaryLabel: 'Deep Learn this' | 'Open Deep Learn note' | 'Retry Deep Learn' | 'View reader fallback'
  deepLearnNoteHref: string
  deepLearnQuizHref: string
  deepLearnQuizReady: boolean
  deepLearnTermCount: number
  deepLearnFactCount: number
  deepLearnNoteFailure?: string | null
  deepLearnAvailability: DeepLearnNoteLoadAvailability
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
        const presentationMode: StudyResourcePresentationMode = item.deepLearnStatus === 'ready'
          ? 'deep_learn_first'
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
                  <ResourcePill label={`Deep Learn: ${item.deepLearnStatusLabel}`} tone={item.deepLearnTone} />
                  <ResourcePill label={item.readinessLabel} tone={item.readinessTone} />
                  {item.deepLearnStatus === 'ready' ? (
                    <>
                      <ResourcePill label={`${item.deepLearnTermCount} term${item.deepLearnTermCount === 1 ? '' : 's'}`} />
                      <ResourcePill label={`${item.deepLearnFactCount} key fact${item.deepLearnFactCount === 1 ? '' : 's'}`} />
                      {item.deepLearnQuizReady && <ResourcePill label="Quiz ready" tone="accent" />}
                    </>
                  ) : (
                    <ResourcePill label={`${item.outlineSections.length} reader note${item.outlineSections.length === 1 ? '' : 's'}`} />
                  )}
                  {item.required && <ResourcePill label="Required" tone="warning" />}
                </div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.38, color: 'var(--text-primary)' }}>
                  {item.title}
                </h4>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                  {truncateText(item.deepLearnSummary || item.note, expanded ? 260 : 180)}
                </p>
              </div>

              <span className={expanded ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
                {expanded ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {expanded && (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {presentationMode === 'deep_learn_first' ? (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.45rem' }}>
                    <p className="ui-kicker" style={{ margin: 0 }}>Saved Deep Learn note</p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.deepLearnDetail}
                    </p>
                    {item.deepLearnNoteFailure && (
                      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--red)' }}>
                        {item.deepLearnNoteFailure}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.4rem' }}>
                    <p className="ui-kicker" style={{ margin: 0 }}>{item.deepLearnStatusLabel}</p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.deepLearnDetail}
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                      {presentationMode === 'source_first'
                        ? 'The original source still matters most here. The reader stays available as fallback, but Deep Learn is the main study destination once you generate a note.'
                        : 'The reader stays available as a fallback/debug surface, but Deep Learn is the primary study path for this resource.'}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {item.deepLearnStatus === 'ready' || item.deepLearnStatus === 'pending' ? (
                    <Link href={item.deepLearnNoteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                      {item.deepLearnPrimaryLabel}
                    </Link>
                  ) : item.deepLearnStatus === 'unavailable' || item.deepLearnStatus === 'blocked' ? (
                    <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                      {item.deepLearnPrimaryLabel}
                    </Link>
                  ) : (
                    <DeepLearnGenerateButton
                      moduleId={item.moduleId}
                      resourceId={item.id}
                      courseId={item.courseId ?? null}
                      label={item.deepLearnPrimaryLabel}
                    />
                  )}
                  {item.deepLearnStatus === 'ready' && item.deepLearnQuizReady && (
                    <Link href={item.deepLearnQuizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Quiz this
                    </Link>
                  )}
                  {showSourceAsPrimary && sourceHref ? (
                    <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      {item.sourceActionLabel}
                    </a>
                  ) : (
                    !showSourceAsPrimary && sourceHref ? (
                      <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        {item.sourceActionLabel}
                      </a>
                    ) : null
                  )}
                  <Link href={item.readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                    Open reader
                  </Link>
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

type StudyResourcePresentationMode = 'deep_learn_first' | 'reader_fallback' | 'source_first'

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
