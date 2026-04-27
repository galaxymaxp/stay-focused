'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { OcrSourceButton } from '@/components/OcrSourceButton'
import { SourceReadinessFilters, type SourceReadinessFilter } from '@/components/SourceReadinessFilters'
import { SourceSummaryBadge, type SourceSummaryBadgeModel } from '@/components/SourceSummaryBadge'
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
  const router = useRouter()
  const [filter, setFilter] = useState<SourceReadinessFilter>('all')
  const [operationMessage, setOperationMessage] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState<'repair' | 'process' | null>(null)
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
                {group.key === 'repair' && (
                  <button
                    type="button"
                    disabled={bulkBusy !== null}
                    onClick={() => runBulkSourceOperation({
                      kind: 'repair',
                      moduleId: group.items[0]?.moduleId,
                      setBusy: setBulkBusy,
                      setMessage: setOperationMessage,
                      refresh: () => router.refresh(),
                    })}
                    className="ui-button ui-button-secondary ui-button-xs"
                  >
                    {bulkBusy === 'repair' ? 'Repairing...' : 'Repair all'}
                  </button>
                )}
                {group.key === 'action' && group.items.some((item) => item.sourceReadinessActions.includes('process_source')) && (
                  <button
                    type="button"
                    disabled={bulkBusy !== null}
                    onClick={() => runBulkSourceOperation({
                      kind: 'process',
                      moduleId: group.items[0]?.moduleId,
                      setBusy: setBulkBusy,
                      setMessage: setOperationMessage,
                      refresh: () => router.refresh(),
                    })}
                    className="ui-button ui-button-secondary ui-button-xs"
                  >
                    {bulkBusy === 'process' ? 'Processing...' : 'Process all readable sources'}
                  </button>
                )}
                <ResourcePill label={`${group.items.length}`} tone={group.bucket === 'ready' ? 'accent' : group.bucket === 'needs_action' ? 'warning' : 'muted'} />
              </div>
            </div>
            {operationMessage && group.key !== 'ready' && (
              <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)' }}>{operationMessage}</p>
            )}
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

                <ResourcePill label={expanded ? 'Open' : item.sourceReadinessBucket === 'ready' ? 'Preview' : 'Details'} tone={expanded ? 'accent' : 'muted'} />
              </button>

              {expanded && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem' }}>
                    <summary className="ui-interactive-summary" style={{ padding: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Source details
                    </summary>
                    <p style={{ margin: '0.42rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                      {item.originLabel}
                    </p>
                  </details>

                  <SourceSummaryBadge
                    resourceId={item.canonicalResourceId}
                    summary={item.sourceSummary}
                    canSummarize={item.isSummarizable}
                  />

                  {item.deepLearnNoteFailure && (
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                      <p className="ui-kicker" style={{ margin: 0 }}>Pack error</p>
                      <p style={{ margin: '0.38rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--red)' }}>
                        Couldn&apos;t generate this yet. Try again, or open the source and check that it has readable content.
                      </p>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    {shouldShowDeepLearnWorkspaceAction(item) ? (
                      <Link href={item.deepLearnNoteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open workspace
                      </Link>
                    ) : item.sourceReadinessActions.includes('start_deep_learn') && item.deepLearnStatus !== 'unavailable' ? (
                      <DeepLearnGenerateButton
                        moduleId={item.moduleId}
                        resourceId={item.canonicalResourceId ?? item.id}
                        courseId={item.courseId ?? null}
                        label="Start Deep Learn"
                      />
                    ) : item.sourceReadinessActions.includes('preview') ? (
                      <Link href={item.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                        Preview
                      </Link>
                    ) : (
                      <SourceRepairButton item={item} />
                    )}
                    {item.deepLearnStatus === 'ready' && item.deepLearnQuizReady && (
                      <Link href={item.deepLearnQuizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Quiz
                      </Link>
                    )}
                    {sourceHref && (
                      <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        {labelForSourceAction(item)}
                      </a>
                    )}
                    {item.sourceReadinessActions.includes('retry_extraction') || item.sourceReadinessActions.includes('process_source') ? (
                      <ProcessSourceButton item={item} />
                    ) : null}
                    {item.sourceReadinessActions.includes('extract_text_from_images') && (
                      <OcrSourceButton moduleId={item.moduleId} resourceId={item.canonicalResourceId ?? item.id} />
                    )}
                    {item.sourceReadinessActions.includes('add_notes') && (
                      <Link href={item.readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Add notes
                      </Link>
                    )}
                  </div>
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

async function runBulkSourceOperation({
  kind,
  moduleId,
  setBusy,
  setMessage,
  refresh,
}: {
  kind: 'repair' | 'process'
  moduleId: string | undefined
  setBusy: (value: 'repair' | 'process' | null) => void
  setMessage: (value: string | null) => void
  refresh: () => void
}) {
  if (!moduleId) return
  setBusy(kind)
  setMessage(null)
  try {
    const response = await fetch(kind === 'repair' ? '/api/sources/repair' : '/api/sources/process', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moduleId, bulk: true }),
    })
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null
    setMessage(payload?.message ?? payload?.error ?? (response.ok ? 'Done.' : 'Could not complete this action.'))
    if (response.ok) refresh()
  } finally {
    setBusy(null)
  }
}

function SourceRepairButton({ item }: { item: StudyResourceAccordionItem }) {
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
          } finally {
            setBusy(false)
          }
        }}
        className="ui-button ui-button-secondary ui-button-xs"
      >
        {busy ? 'Repairing...' : 'Repair source link'}
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
            if (response.ok) router.refresh()
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
  return item.deepLearnStatus === 'ready' || item.deepLearnStatus === 'pending'
}

function labelForSourceAction(item: StudyResourceAccordionItem) {
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
