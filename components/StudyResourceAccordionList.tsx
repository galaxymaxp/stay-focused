'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { getResourceElementId } from '@/lib/stay-focused-links'
import { StudyOutlineView } from '@/components/StudyOutlineView'
import type { StudyFileOutlineSection, StudyFileReaderState } from '@/lib/study-file-reader'

export interface StudyResourceAccordionItem {
  id: string
  title: string
  note: string
  fileTypeLabel: string
  readinessLabel: string
  readinessTone: 'accent' | 'warning' | 'muted'
  readerState: StudyFileReaderState
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
        const presentation = resolvePresentation(item)

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
                  {truncateText(presentation.summary, expanded ? 240 : 170)}
                </p>
              </div>

              <span className={expanded ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
                {expanded ? 'Collapse' : 'Expand'}
              </span>
            </button>

            {expanded && (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {presentation.mode === 'notes_first' && item.outlineSections.length > 0 ? (
                  <StudyOutlineView sections={item.outlineSections} />
                ) : presentation.mode === 'notes_first' ? (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {item.outlineHint ?? 'Readable study notes are not available for this resource yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.4rem' }}>
                    <p className="ui-kicker" style={{ margin: 0 }}>
                      {presentation.mode === 'reader_fallback' ? 'Use the original source first' : 'Source-first fallback'}
                    </p>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {presentation.detail}
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {presentation.mode === 'source_first' ? (
                    <>
                      {item.originalFileHref ? (
                        <a href={item.originalFileHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                          Open original file
                        </a>
                      ) : item.canvasHref ? (
                        <a href={item.canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                          Open in Canvas
                        </a>
                      ) : null}
                      <Link href={item.readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open reader
                      </Link>
                    </>
                  ) : (
                    <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open reader
                    </Link>
                  )}
                  {presentation.mode !== 'source_first' && item.originalFileHref && (
                    <a href={item.originalFileHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open original file
                    </a>
                  )}
                  {item.canvasHref && (presentation.mode !== 'source_first' || item.originalFileHref) && (
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

type StudyResourcePresentationMode = 'notes_first' | 'reader_fallback' | 'source_first'

function resolvePresentation(item: StudyResourceAccordionItem) {
  const mode: StudyResourcePresentationMode = item.readinessLabel === 'Ready to study' && item.readerState === 'extracted'
    ? 'notes_first'
    : item.readinessLabel === 'Limited' || item.readerState === 'weak'
      ? 'reader_fallback'
      : 'source_first'
  const sourceLabel = item.originalFileHref ? 'file' : 'source'

  if (mode === 'notes_first') {
    return {
      mode,
      summary: item.note,
      detail: item.outlineHint ?? item.note,
    }
  }

  if (mode === 'reader_fallback') {
    if (item.previewState === 'full_text_available') {
      return {
        mode,
        summary: `Full extracted text exists here, but Learn still treats it as limited because the signal is noisy or repetitive enough that it should not act overly confident.`,
        detail: `Stay Focused has the full extracted text for this resource, but the study layer still scores it as limited evidence rather than clean grounding. Use the reader for the recovered text, then open the original ${sourceLabel} when you need the cleanest read.`,
      }
    }

    if (item.previewState === 'preview_only') {
      return {
        mode,
        summary: `Extraction is weak here, and only a stored preview is available in the reader.`,
        detail: `The extracted text is too thin or noisy to trust as solid study notes, and the stored reader state is preview-only. Open the original ${sourceLabel} for the full read, then use the reader only as a secondary preview.`,
      }
    }

    return {
      mode,
      summary: `Extraction is weak here. Use the original ${sourceLabel} for the full read, and treat the in-app reader as limited evidence only.`,
      detail: `The extracted text is too thin or noisy to trust as solid study notes. Open the original ${sourceLabel} for the full read, then use the reader only as a secondary aid.`,
    }
  }

  if (item.fallbackReason === 'canvas_resolution_required') {
    return {
      mode,
      summary: 'This item still needs authenticated Canvas resolution before Learn can fetch the real target content.',
      detail: `The stored module item points at an internal Canvas redirect or launch path, but the readable target still has to be resolved before extraction can happen. Open the original ${sourceLabel} in Canvas or reprocess with Canvas credentials.`,
    }
  }

  if (item.fallbackReason === 'canvas_fetch_failed') {
    return {
      mode,
      summary: 'Canvas target resolution failed before readable content could be fetched here.',
      detail: `Stay Focused reached a Canvas-dependent path for this item, but the final fetch failed before a readable body could be stored. Open the original ${sourceLabel} and inspect the stored resolution note if you need the exact failure.`,
    }
  }

  if (item.fallbackReason === 'external_link_only') {
    return {
      mode,
      summary: 'This resource stays link-only because it resolves outside Canvas-readable content.',
      detail: `Learn did not fake extraction for this item because the target is an external link. Open the original ${sourceLabel} instead of relying on the in-app reader.`,
    }
  }

  return {
    mode,
    summary: `No usable extract surfaced here. Open the original ${sourceLabel} instead of relying on this reader.`,
    detail: `Learn did not recover enough readable text to build a useful note card for this item. The original ${sourceLabel} is the main path here, and the reader stays as a status view only.`,
  }
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
  const clipped = value.slice(0, maxLength)
  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}
