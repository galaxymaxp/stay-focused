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
  deepLearnSummary: string
  deepLearnNoteHref: string
  deepLearnQuizHref: string
  deepLearnQuizReady: boolean
  deepLearnNoteFailure?: string | null
  deepLearnStatusLabel?: 'Pack' | 'Review' | 'Review Ready' | 'Source issue' | 'Unavailable'
  deepLearnTone?: 'accent' | 'warning' | 'muted'
  deepLearnDetail?: string
  deepLearnPrimaryLabel?: string
  deepLearnTermCount?: number
  deepLearnFactCount?: number
  deepLearnAvailability?: DeepLearnNoteLoadAvailability
}

export function StudyResourceAccordionList({
  items,
  emptyMessage,
  initialOpenResourceId = null,
  scrollable = false,
  scrollDensity = 'comfort',
}: {
  items: StudyResourceAccordionItem[]
  emptyMessage: string
  initialOpenResourceId?: string | null
  scrollable?: boolean
  scrollDensity?: 'comfort' | 'dense'
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
    <div className={scrollable ? 'contained-scroll-frame' : undefined} data-density={scrollDensity === 'dense' ? 'dense' : undefined}>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {items.map((item) => {
          const expanded = resolvedOpenResourceId === item.id
          const sourceHref = item.originalFileHref ?? item.canvasHref

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
                onClick={() => {
                  const nextOpenResourceId = openResourceId === item.id ? null : item.id
                  setState((current) => {
                    if (current.routeKey === routeKey && current.openResourceId === nextOpenResourceId) {
                      return current
                    }
                    return { routeKey, openResourceId: nextOpenResourceId }
                  })
                  if (nextOpenResourceId !== null) {
                    window.requestAnimationFrame(() => {
                      document.getElementById(getResourceElementId(item.id))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                    })
                  }
                }}
                aria-expanded={expanded}
                className="ui-interactive-row"
                data-hover="flat"
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
                    <ResourcePill label={item.fileTypeLabel} />
                    <ResourcePill
                      label={item.deepLearnStatusLabel ?? fallbackStageLabel(item.deepLearnStatus, item.deepLearnQuizReady)}
                      tone={item.deepLearnStatus === 'ready' ? 'accent' : item.deepLearnStatus === 'failed' || item.deepLearnStatus === 'blocked' ? 'warning' : 'muted'}
                    />
                    {item.required && <ResourcePill label="Required" tone="warning" />}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.38, color: 'var(--text-primary)' }}>
                    {item.title}
                  </h4>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                    {truncateText(item.deepLearnSummary || item.note, expanded ? 260 : 180)}
                  </p>
                </div>

                <ResourcePill label={expanded ? 'Open' : 'Preview'} tone={expanded ? 'accent' : 'muted'} />
              </button>

              {expanded && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {item.deepLearnNoteFailure && (
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                      <p className="ui-kicker" style={{ margin: 0 }}>Pack error</p>
                      <p style={{ margin: '0.38rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--red)' }}>
                        Couldn&apos;t generate this yet. Try again, or open the source and check that it has readable content.
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {item.deepLearnStatus === 'ready' || item.deepLearnStatus === 'pending' ? (
                      <Link href={item.deepLearnNoteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open workspace
                      </Link>
                    ) : item.deepLearnStatus === 'unavailable' || item.deepLearnStatus === 'blocked' ? (
                      <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open Source
                      </Link>
                    ) : (
                      <DeepLearnGenerateButton
                        moduleId={item.moduleId}
                        resourceId={item.id}
                        courseId={item.courseId ?? null}
                        label="Generate pack"
                      />
                    )}
                    {item.deepLearnStatus === 'ready' && item.deepLearnQuizReady && (
                      <Link href={item.deepLearnQuizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Quiz
                      </Link>
                    )}
                    {sourceHref && (
                      <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        {item.sourceActionLabel}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function fallbackStageLabel(
  status: StudyResourceAccordionItem['deepLearnStatus'],
  quizReady: boolean,
) {
  if (status === 'ready') return quizReady ? 'Review Ready' : 'Review'
  if (status === 'blocked') return 'Source issue'
  if (status === 'unavailable') return 'Unavailable'
  return 'Pack'
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
