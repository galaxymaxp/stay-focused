'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { OcrSourceButton } from '@/components/OcrSourceButton'
import { SourceReadinessFilters, type SourceReadinessFilter } from '@/components/SourceReadinessFilters'
import { SourceSummaryBadge, type SourceSummaryBadgeModel } from '@/components/SourceSummaryBadge'
import { shouldShowGenerateStudyPackAction, shouldShowSourceOcrRetryAction } from '@/lib/learn-resource-action-ui'
import { getResourceElementId } from '@/lib/stay-focused-links'
import type { StudyFileOutlineSection, StudyFileReaderState } from '@/lib/study-file-reader'
import type { LearnResourceActionPriority, LearnResourceStatusKey } from '@/lib/learn-resource-ui'
import type { DeepLearnNoteLoadAvailability } from '@/lib/types'
import type { SourceReadinessAction, SourceReadinessState } from '@/lib/source-readiness'

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
  deepLearnStatusLabel?: 'Pack' | 'Review' | 'Review Ready' | 'Needs action' | 'Unavailable'
  deepLearnTone?: 'accent' | 'warning' | 'muted'
  deepLearnDetail?: string
  deepLearnPrimaryLabel?: string
  deepLearnTermCount?: number
  deepLearnFactCount?: number
  deepLearnAvailability?: DeepLearnNoteLoadAvailability
  deepLearnCanGenerate?: boolean
  deepLearnDisabledReason?: string | null
  sourceReadinessState: SourceReadinessState
  sourceReadinessStatusLabel: string
  sourceReadinessMessage: string
  sourceReadinessActions: SourceReadinessAction[]
  sourceReadinessBucket: 'ready' | 'needs_action' | 'unsupported'
  pageCount?: number | null
  sourceTypeLabel: string
  originLabel: string
  canonicalResourceId: string | null
  isSummarizable: boolean
  sourceSummary: SourceSummaryBadgeModel | null
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
  const [filter, setFilter] = useState<SourceReadinessFilter>('all')
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

  const counts = buildFilterCounts(items)
  const repeatedTitleCounts = buildRepeatedTitleCounts(items)
  const visibleItems = items
    .filter((item) => filter === 'all' || item.sourceReadinessBucket === filter)
    .sort(compareSourceReadinessItems)
  const groupedItems = buildSourceGroups(visibleItems)

  return (
    <div className={scrollable ? 'contained-scroll-frame' : undefined} data-density={scrollDensity === 'dense' ? 'dense' : undefined}>
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <SourceReadinessFilters value={filter} counts={counts} onChange={setFilter} />
        {groupedItems.map((group) => (
          <section key={group.key} style={{ display: 'grid', gap: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
              <p className="ui-kicker" style={{ margin: 0 }}>{group.title}</p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <ResourcePill label={`${group.items.length}`} tone={group.bucket === 'ready' ? 'accent' : group.bucket === 'needs_action' ? 'warning' : 'muted'} />
              </div>
            </div>
            {group.items.map((item) => {
          const expanded = resolvedOpenResourceId === item.id
          const sourceHref = item.originalFileHref ?? item.canvasHref
          const titleCount = repeatedTitleCounts.get(normalizeTitle(item.title)) ?? 0
          const shouldShowModuleContext = titleCount > 1 || normalizeTitle(item.title) === 'learning targets'

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
                    <ResourcePill label={item.sourceTypeLabel || item.fileTypeLabel} />
                    <ResourcePill
                      label={item.sourceReadinessStatusLabel}
                      tone={item.sourceReadinessBucket === 'ready' ? 'accent' : item.sourceReadinessBucket === 'needs_action' ? 'warning' : 'muted'}
                    />
                    {item.required && <ResourcePill label="Required" tone="warning" />}
                  </div>
                  <h4 style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.38, color: 'var(--text-primary)' }}>
                    {item.title}
                  </h4>
                  {shouldShowModuleContext && (
                    <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
                      {item.title.toLowerCase() === 'learning targets'
                        ? 'Learning Targets list what this module expects you to understand.'
                        : item.originLabel}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                    {truncateText(item.sourceReadinessMessage || item.deepLearnSummary || item.note, expanded ? 260 : 180)}
                  </p>
                  {item.sourceReadinessActions.includes('extract_text_from_images') && typeof item.pageCount === 'number' && item.pageCount > 0 && (
                    <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                      {item.pageCount} pages detected
                    </p>
                  )}
                </div>
                <span className="ui-button ui-button-ghost ui-button-xs" style={{ pointerEvents: 'none' }}>
                  {expanded ? 'Open' : item.sourceReadinessBucket === 'ready' ? 'Preview' : 'Open'}
                </span>
              </button>

              {expanded && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {/* OCR status — inline, no technical controls needed */}
                  {(item.sourceReadinessState === 'visual_ocr_available' || item.sourceReadinessState === 'empty_or_metadata_only' || item.sourceReadinessState === 'visual_ocr_queued' || item.sourceReadinessState === 'visual_ocr_running') && (
                    <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                      {item.sourceReadinessMessage}
                    </span>
                  )}

                  <SourceSummaryBadge
                    resourceId={item.canonicalResourceId}
                    summary={item.sourceSummary}
                    canSummarize={item.isSummarizable}
                  />

                  {item.sourceReadinessBucket === 'ready' && item.deepLearnStatus !== 'ready' && item.deepLearnStatus !== 'pending' && (
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.35rem' }}>
                      <p className="ui-kicker" style={{ margin: 0 }}>Ready for Deep Learn</p>
                      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
                        Creates structured notes, key terms, review questions, and quiz-ready study material from this source.
                      </p>
                    </div>
                  )}

                  {item.deepLearnStatus === 'pending' && (
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.35rem' }}>
                      <p className="ui-kicker" style={{ margin: 0 }}>Generating study pack...</p>
                      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
                        {item.deepLearnSummary || 'Added to queue.'}
                      </p>
                    </div>
                  )}

                  {item.deepLearnNoteFailure && (
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                      <p className="ui-kicker" style={{ margin: 0 }}>Study pack failed</p>
                      <p style={{ margin: '0.38rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--red)' }}>
                        {item.deepLearnNoteFailure}
                      </p>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                        Add more readable source text, prepare OCR if it is scanned, or retry after checking the source.
                      </p>
                    </div>
                  )}

                  {/* Primary actions */}
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {item.deepLearnStatus === 'pending' ? (
                      <button type="button" disabled className="ui-button ui-button-secondary ui-button-xs" style={{ opacity: 0.7 }}>
                        {item.deepLearnPrimaryLabel ?? 'Generating study pack...'}
                      </button>
                    ) : shouldShowDeepLearnWorkspaceAction(item) ? (
                      <Link href={item.deepLearnNoteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        {item.deepLearnStatus === 'ready' ? 'Open study pack' : 'Open workspace'}
                      </Link>
                    ) : shouldShowPrepareScannedPdfAction(item) ? (
                      <OcrSourceButton
                        moduleId={item.moduleId}
                        resourceId={item.canonicalResourceId ?? item.id}
                        courseId={item.courseId ?? null}
                        resourceTitle={item.title}
                        className="ui-button ui-button-secondary ui-button-xs"
                        idleLabel={getOcrActionLabel(item)}
                        manualRetry={item.sourceReadinessState === 'visual_ocr_failed' || item.sourceReadinessState === 'visual_ocr_completed_empty'}
                      />
                    ) : shouldShowGenerateStudyPackAction(item) ? (
                      <DeepLearnGenerateButton
                        moduleId={item.moduleId}
                        resourceId={item.canonicalResourceId ?? item.id}
                        courseId={item.courseId ?? null}
                        label="Generate study pack"
                        disabledReason={item.deepLearnDisabledReason}
                        resourceTitle={item.title}
                      />
                    ) : null}
                    {/* OCR retry - shown when scanned-PDF preparation is not active. */}
                    {item.sourceReadinessState === 'unsupported_file_type' && item.sourceReadinessMessage.toLowerCase().includes('convert .ppt') && (
                      <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        Convert .ppt to .pptx or PDF for extraction.
                      </span>
                    )}
                    {shouldShowSourceOcrRetryAction(item) && (
                      <OcrSourceButton
                        moduleId={item.moduleId}
                        resourceId={item.canonicalResourceId ?? item.id}
                        courseId={item.courseId ?? null}
                        resourceTitle={item.title}
                        className="ui-button ui-button-ghost ui-button-xs"
                        idleLabel={getOcrActionLabel(item)}
                        manualRetry={item.sourceReadinessState !== 'visual_ocr_available'}
                      />
                    )}
                    {item.deepLearnStatus === 'ready' && item.deepLearnQuizReady && (
                      <Link href={item.deepLearnQuizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Quiz
                      </Link>
                    )}
                    {item.sourceReadinessActions.includes('add_notes') && (
                      <Link href={item.readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Add notes
                      </Link>
                    )}
                    {sourceHref && (
                      <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        {labelForSourceAction(item)}
                      </a>
                    )}
                  </div>

                  {/* Source details — only for repair/re-extraction, never shown by default */}
                  {(item.sourceReadinessActions.includes('repair_source_link') ||
                    item.sourceReadinessActions.includes('retry_extraction') ||
                    item.sourceReadinessActions.includes('process_source')) && (
                    <details>
                      <summary style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', userSelect: 'none' }}>
                        More source details
                      </summary>
                      <div style={{ marginTop: '0.55rem', padding: '0.65rem 0.72rem', borderRadius: 'var(--radius-tight)', background: 'var(--surface-soft)', border: '1px solid var(--border-subtle)' }}>
                        <p style={{ margin: '0 0 0.5rem', fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                          {item.originLabel}
                        </p>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {item.sourceReadinessActions.includes('repair_source_link') && (
                            <SourceRepairButton item={item} />
                          )}
                          {(item.sourceReadinessActions.includes('retry_extraction') || item.sourceReadinessActions.includes('process_source')) && (
                            <ProcessSourceButton item={item} />
                          )}
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              )}
            </article>
          )
            })}
          </section>
        ))}
      </div>
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

function SourceRepairButton({ item }: { item: StudyResourceAccordionItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!item.sourceReadinessActions.includes('repair_source_link')) {
    return (
      <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
        Details
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMessage(null)
          try {
            const response = await fetch('/api/sources/repair', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                moduleId: item.moduleId,
                title: item.title,
                sourceUrl: item.originalFileHref ?? item.canvasHref,
              }),
            })
            const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
            setMessage(payload?.message ?? payload?.error ?? (response.ok ? 'Repair attempted.' : 'Could not repair this source.'))
            if (response.ok) {
              window.dispatchEvent(new CustomEvent('stay-focused:canvas-sync-complete', { detail: { moduleId: item.moduleId, courseId: item.courseId ?? null } }))
              window.dispatchEvent(new CustomEvent('stay-focused:notifications-refresh'))
              window.dispatchEvent(new CustomEvent('stay-focused:queue-refresh'))
              router.refresh()
            }
          } finally {
            setBusy(false)
          }
        }}
        className="ui-button ui-button-secondary ui-button-xs"
      >
        {busy ? 'Repairing from Canvas...' : 'Reconnect source'}
      </button>
      {message && <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)', alignSelf: 'center' }}>{message}</span>}
    </>
  )
}

function ProcessSourceButton({ item }: { item: StudyResourceAccordionItem }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={busy || !item.canonicalResourceId}
        onClick={async () => {
          setBusy(true)
          setMessage(null)
          try {
            const response = await fetch('/api/sources/process', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ resourceId: item.canonicalResourceId, moduleId: item.moduleId }),
            })
            const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
            setMessage(payload?.message ?? payload?.error ?? (response.ok ? 'Processed.' : 'Could not process this source.'))
            if (response.ok) {
              window.dispatchEvent(new CustomEvent('stay-focused:canvas-sync-complete', { detail: { moduleId: item.moduleId, courseId: item.courseId ?? null } }))
              window.dispatchEvent(new CustomEvent('stay-focused:notifications-refresh'))
              router.refresh()
            }
          } finally {
            setBusy(false)
          }
        }}
        className="ui-button ui-button-ghost ui-button-xs"
      >
        {busy ? 'Processing...' : item.sourceReadinessActions.includes('retry_extraction') ? 'Retry extraction' : 'Process source'}
      </button>
      {message && <span style={{ fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)', alignSelf: 'center' }}>{message}</span>}
    </>
  )
}

function shouldShowDeepLearnWorkspaceAction(item: StudyResourceAccordionItem) {
  return item.deepLearnStatus === 'ready'
}

function shouldShowPrepareScannedPdfAction(item: StudyResourceAccordionItem) {
  return item.sourceReadinessActions.includes('extract_text_from_images')
    && item.sourceReadinessState === 'visual_ocr_partial'
}

function getOcrActionLabel(item: StudyResourceAccordionItem) {
  if (item.sourceReadinessState === 'visual_ocr_available') return 'Retry extraction'
  if (item.sourceReadinessState === 'visual_ocr_partial') return 'Continue OCR'
  if (item.sourceReadinessState === 'visual_ocr_failed' || item.sourceReadinessState === 'visual_ocr_completed_empty') return 'Retry OCR'
  return 'Retry extraction'
}

function labelForSourceAction(item: StudyResourceAccordionItem) {
  if (item.originalFileHref) return 'Open original file'
  if (item.sourceReadinessActions.includes('open_link')) return 'Open link'
  if (item.sourceReadinessActions.includes('open_lesson')) return 'Open lesson'
  if (item.sourceReadinessActions.includes('open_canvas')) return 'Open in Canvas'
  return item.sourceActionLabel || 'Open source'
}

function buildFilterCounts(items: StudyResourceAccordionItem[]): Record<SourceReadinessFilter, number> {
  return {
    all: items.length,
    ready: items.filter((item) => item.sourceReadinessBucket === 'ready').length,
    needs_action: items.filter((item) => item.sourceReadinessBucket === 'needs_action').length,
    unsupported: items.filter((item) => item.sourceReadinessBucket === 'unsupported').length,
  }
}

function buildSourceGroups(items: StudyResourceAccordionItem[]) {
  const groups = [
    { key: 'ready', title: 'Ready for Deep Learn', bucket: 'ready' as const, items: [] as StudyResourceAccordionItem[] },
    { key: 'repair', title: 'Needs source repair', bucket: 'needs_action' as const, items: [] as StudyResourceAccordionItem[] },
    { key: 'action', title: 'Needs action', bucket: 'needs_action' as const, items: [] as StudyResourceAccordionItem[] },
    { key: 'reference', title: 'Labs and reference-only sources', bucket: 'unsupported' as const, items: [] as StudyResourceAccordionItem[] },
  ]

  for (const item of items) {
    if (item.sourceReadinessBucket === 'ready') groups[0].items.push(item)
    else if (item.sourceReadinessState === 'missing_resource_link') groups[1].items.push(item)
    else if (item.sourceReadinessBucket === 'unsupported') groups[3].items.push(item)
    else groups[2].items.push(item)
  }

  return groups.filter((group) => group.items.length > 0)
}

function compareSourceReadinessItems(left: StudyResourceAccordionItem, right: StudyResourceAccordionItem) {
  return bucketWeight(left.sourceReadinessBucket) - bucketWeight(right.sourceReadinessBucket)
    || Number(right.required) - Number(left.required)
    || left.title.localeCompare(right.title)
}

function bucketWeight(bucket: StudyResourceAccordionItem['sourceReadinessBucket']) {
  if (bucket === 'ready') return 0
  if (bucket === 'needs_action') return 1
  return 2
}

function buildRepeatedTitleCounts(items: StudyResourceAccordionItem[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const key = normalizeTitle(item.title)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const clipped = value.slice(0, maxLength)
  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}
