'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { generateUserSchedule, rescheduleBlock, updateBlockStatus } from '@/actions/scheduler'
import { TaskDraftButton } from '@/components/DoNowButton'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { InteractivePlannerClock, type ClockScheduleBlock } from '@/components/InteractivePlannerClock'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
import type { HomeActivityItem, HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import type { TodayItem } from '@/lib/types'
import { formatDuration, formatTime, getWindowDurationMinutes, isBlockInsideWindow, timeWindowToIsoRange } from '@/lib/scheduler/time'

type ScheduleBlock = ClockScheduleBlock

type StudyPackRef = { id: string; title: string; quizReady: boolean }

const SHOW_DEMO_PREVIEW = process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'

export function TodayDashboard({
  primaryAction,
  upNext,
  dueSoon,
  recentActivity,
  courseSnapshots,
  undatedTaskCount,
  scheduledBlocks,
  studyPacksByModuleId = {},
  studyPacksByResourceId = {},
}: {
  primaryAction: TodayItem | null
  upNext: TodayItem[]
  dueSoon: HomeDueSoonItem[]
  recentActivity: HomeActivityItem[]
  courseSnapshots: HomeCourseSnapshot[]
  undatedTaskCount: number
  scheduledBlocks: ScheduleBlock[]
  studyPacksByModuleId?: Record<string, StudyPackRef[]>
  studyPacksByResourceId?: Record<string, StudyPackRef[]>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const [useDemoSchedule, setUseDemoSchedule] = useState(false)
  const [availableStart, setAvailableStart] = useState('18:30')
  const [availableEnd, setAvailableEnd] = useState('21:30')
  const [isPlanStale, setIsPlanStale] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [completedExpanded, setCompletedExpanded] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'tasks' | 'study'>('all')
  const planPanelRef = useRef<HTMLDivElement | null>(null)

  const scheduleForDisplay = useMemo(
    () => (useDemoSchedule ? buildDemoScheduleBlocks() : scheduledBlocks),
    [scheduledBlocks, useDemoSchedule],
  )

  const visibleSchedule = useMemo(
    () => scheduleForDisplay.filter((block) => isBlockInsideWindow(block, availableStart, availableEnd)),
    [scheduleForDisplay, availableStart, availableEnd],
  )

  const { currentBlock, completedBlocks, activeBlocks, totalScheduledCount } = useMemo(() => {
    const now = new Date()
    const sorted = [...visibleSchedule].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    )
    const active =
      sorted.find(
        (block) =>
          block.status === 'opened' ||
          (block.status === 'scheduled' &&
            new Date(block.startAt) <= now &&
            new Date(block.endAt) > now),
      ) ?? null

    return {
      currentBlock: active,
      completedBlocks: sorted.filter((block) => block.status === 'completed'),
      activeBlocks: sorted.filter((block) => block.status !== 'completed'),
      totalScheduledCount: sorted.length,
    }
  }, [visibleSchedule])

  const hasSchedule = totalScheduledCount > 0
  const completedAll = hasSchedule && completedBlocks.length === totalScheduledCount

  const availableMinutes = getWindowDurationMinutes(availableStart, availableEnd)
  const availableLabel = availableMinutes > 0 ? formatDuration(availableMinutes) : 'Invalid window'
  const windowLabel = `${formatTime(availableStart)} – ${formatTime(availableEnd)}`

  const { nowBlocks, nextBlocks, laterBlocks } = useMemo(() => {
    const now = new Date()
    const nowMs = now.getTime()
    const twoHoursMs = 2 * 60 * 60_000
    const active = activeBlocks.filter((b) => b.status !== 'skipped')

    const nowGroup = active.filter(
      (b) =>
        b.status === 'opened' ||
        (b.status === 'scheduled' && new Date(b.startAt) <= now && new Date(b.endAt) > now),
    )
    const nowIds = new Set(nowGroup.map((b) => b.id))

    const upcoming = active
      .filter((b) => !nowIds.has(b.id) && new Date(b.startAt) >= now)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())

    const nextGroup = upcoming
      .filter((b) => new Date(b.startAt).getTime() - nowMs <= twoHoursMs)
      .slice(0, 3)
    const nextIds = new Set(nextGroup.map((b) => b.id))

    const laterGroup = upcoming.filter((b) => !nextIds.has(b.id)).slice(0, 6)

    return { nowBlocks: nowGroup, nextBlocks: nextGroup, laterBlocks: laterGroup }
  }, [activeBlocks])

  const allStudyPacks = useMemo(() => {
    const seen = new Set<string>()
    const packs: Array<StudyPackRef> = []
    for (const list of Object.values(studyPacksByModuleId)) {
      for (const pack of list) {
        if (!seen.has(pack.id)) {
          seen.add(pack.id)
          packs.push(pack)
        }
      }
    }
    for (const list of Object.values(studyPacksByResourceId)) {
      for (const pack of list) {
        if (!seen.has(pack.id)) {
          seen.add(pack.id)
          packs.push(pack)
        }
      }
    }
    return packs
  }, [studyPacksByModuleId, studyPacksByResourceId])

  const studyPacksByBlockId = useMemo(() => {
    const map: Record<string, StudyPackRef[]> = {}
    for (const block of visibleSchedule) {
      const packs = getBlockStudyPacks(block, studyPacksByModuleId, studyPacksByResourceId)
      if (packs.length > 0) map[block.id] = packs
    }
    return map
  }, [visibleSchedule, studyPacksByModuleId, studyPacksByResourceId])

  // The primary scheduled block: current if one is live, otherwise soonest upcoming
  const primaryScheduleBlock =
    currentBlock ??
    activeBlocks
      .filter((b) => b.status === 'scheduled' && new Date(b.startAt) >= new Date())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0] ??
    null

  const { filteredNow, filteredNext, filteredLater } = useMemo(() => {
    const heroId = primaryScheduleBlock?.id ?? null
    const keep = (block: ScheduleBlock) => {
      if (block.id === heroId) return false
      if (filterMode === 'tasks') return isTaskBlock(block)
      if (filterMode === 'study') return !isTaskBlock(block)
      return true
    }
    return {
      filteredNow: nowBlocks.filter(keep),
      filteredNext: nextBlocks.filter(keep),
      filteredLater: laterBlocks.filter(keep),
    }
  }, [nowBlocks, nextBlocks, laterBlocks, filterMode, primaryScheduleBlock])

  function changeWindow(start: string, end: string) {
    setAvailableStart(start)
    setAvailableEnd(end)
    setIsPlanStale(true)
  }

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      const windowRange = timeWindowToIsoRange(availableStart, availableEnd)
      await generateUserSchedule(windowRange.start, windowRange.end)
      setUseDemoSchedule(false)
      setIsPlanStale(false)
      requestAnimationFrame(() =>
        planPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function handleUpdateStatus(id: string, status: 'opened' | 'completed' | 'skipped') {
    if (useDemoSchedule) return
    startTransition(async () => {
      await updateBlockStatus(id, status)
    })
  }

  function handleOpenBlock(id: string) {
    const block = visibleSchedule.find((b) => b.id === id)
    handleUpdateStatus(id, 'opened')
    if (!block) return
    const href = getBlockHref(block)
    if (href) router.push(href)
  }

  function handleRescheduleBlock(id: string, startAt: string, endAt: string) {
    if (useDemoSchedule) return
    startTransition(async () => {
      await rescheduleBlock(id, startAt, endAt)
    })
  }

  function selectClockBlock(blockId: string) {
    setSelectedBlockId((current) => (current === blockId ? null : blockId))
    requestAnimationFrame(() =>
      planPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  return (
    <section className="home-page">
      <header className="home-page-header">
        <div className="home-page-copy">
          <p className="ui-kicker">Home</p>
          <h1 className="ui-page-title">What should I do right now?</h1>
          <p className="ui-page-copy" style={{ maxWidth: '38rem' }}>
            One place to start, what is due next, and what changed since you last checked.
          </p>
        </div>

        {undatedTaskCount > 0 ? (
          <p className="home-page-note">
            {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'} still need{undatedTaskCount === 1 ? 's' : ''} a due date and
            stay out of today&apos;s first recommendation.
          </p>
        ) : null}
      </header>

      <div className="home-layout">
        <div className="home-main-column">
          {/* ── PRIMARY CARD: Start here ─────────────────────────────── */}
          <section className="home-focus-card">
            <SectionHeading
              eyebrow="Start here"
              title={
                primaryScheduleBlock || primaryAction
                  ? 'One clear next move'
                  : 'Nothing urgent right now'
              }
              description={
                primaryScheduleBlock
                  ? 'Your scheduled block is ready — open it when you start.'
                  : primaryAction
                    ? 'Keep the first move obvious, then leave the rest in the background.'
                    : 'The queue is calm. Review a course or check the calendar at your own pace.'
              }
              actionHref="/do"
              actionLabel="Open Do Now"
            />

            {primaryScheduleBlock ? (
              <ScheduledBlockHero
                block={primaryScheduleBlock}
                isNow={!!currentBlock && currentBlock.id === primaryScheduleBlock.id}
                studyPacks={getBlockStudyPacks(
                  primaryScheduleBlock,
                  studyPacksByModuleId,
                  studyPacksByResourceId,
                )}
                onOpen={handleOpenBlock}
                onStatus={handleUpdateStatus}
                onReschedule={useDemoSchedule ? undefined : handleRescheduleBlock}
              />
            ) : primaryAction ? (
              <PrimaryActionHero item={primaryAction} upNext={upNext} hasSchedule={hasSchedule} />
            ) : (
              <div
                className="ui-empty"
                style={{
                  borderRadius: 'var(--radius-panel)',
                  padding: '1rem 1.05rem',
                  fontSize: '14px',
                  lineHeight: 1.65,
                }}
              >
                Nothing urgent is competing for attention right now.
              </div>
            )}

            {!hasSchedule ? (
              <div className="home-generate-prompt">
                <p className="home-generate-copy">
                  No plan yet. Set your free time window in the clock and generate a schedule.
                </p>
                <div className="home-focus-actions">
                  <button
                    type="button"
                    className="ui-button ui-button-primary"
                    onClick={handleGenerate}
                    disabled={isGenerating || isPending || availableMinutes <= 0}
                  >
                    {isGenerating ? 'Building your plan…' : "Generate today’s plan"}
                  </button>
                  {SHOW_DEMO_PREVIEW ? (
                    <button
                      type="button"
                      className="ui-button ui-button-ghost ui-button-xs"
                      onClick={() => setUseDemoSchedule((v) => !v)}
                    >
                      {useDemoSchedule ? 'Use real schedule' : 'Preview demo'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          {/* ── TODAY PLAN: Now / Next / Later ───────────────────────── */}
          {hasSchedule ? (
            <section className="home-sheet" ref={planPanelRef}>
              <SectionHeading
                eyebrow="Today's Schedule"
                title="Today's Schedule"
                description="Your blocks for this window, grouped by how soon they start."
              />

              <div className="home-plan-filter" role="group" aria-label="Filter schedule">
                {(['all', 'tasks', 'study'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`home-plan-filter-chip${filterMode === mode ? ' active' : ''}`}
                    onClick={() => setFilterMode(mode)}
                  >
                    {mode === 'all' ? 'All' : mode === 'tasks' ? 'Tasks' : 'Study Materials'}
                  </button>
                ))}
              </div>

              <div className="home-plan-list">
                <PlanGroup
                  label="Now"
                  blocks={filteredNow}
                  selectedBlockId={selectedBlockId}
                  studyPacksByBlockId={studyPacksByBlockId}
                  onOpen={handleOpenBlock}
                  onStatus={handleUpdateStatus}
                  onSelect={setSelectedBlockId}
                  onReschedule={useDemoSchedule ? undefined : handleRescheduleBlock}
                />
                <PlanGroup
                  label="Next"
                  blocks={filteredNext}
                  selectedBlockId={selectedBlockId}
                  studyPacksByBlockId={studyPacksByBlockId}
                  onOpen={handleOpenBlock}
                  onStatus={handleUpdateStatus}
                  onSelect={setSelectedBlockId}
                  onReschedule={useDemoSchedule ? undefined : handleRescheduleBlock}
                />
                <PlanGroup
                  label="Later"
                  blocks={filteredLater}
                  selectedBlockId={selectedBlockId}
                  studyPacksByBlockId={studyPacksByBlockId}
                  onOpen={handleOpenBlock}
                  onStatus={handleUpdateStatus}
                  onSelect={setSelectedBlockId}
                  onReschedule={useDemoSchedule ? undefined : handleRescheduleBlock}
                />

                {filteredNow.length === 0 &&
                filteredNext.length === 0 &&
                filteredLater.length === 0 ? (
                  <p
                    className="ui-section-copy"
                    style={{ padding: '0.5rem 0', color: 'var(--text-muted)' }}
                  >
                    All active blocks are complete or skipped.
                  </p>
                ) : null}
              </div>

              {completedBlocks.length > 0 ? (
                <CompletedSection
                  blocks={completedBlocks}
                  isOpen={completedExpanded}
                  onToggle={() => setCompletedExpanded((v) => !v)}
                />
              ) : null}

              <div
                className="home-focus-actions"
                style={{
                  paddingTop: '0.6rem',
                  borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)',
                }}
              >
                <button
                  type="button"
                  className="ui-button ui-button-secondary ui-button-xs"
                  onClick={handleGenerate}
                  disabled={isGenerating || isPending || availableMinutes <= 0}
                >
                  {isGenerating ? 'Rebuilding…' : 'Regenerate plan'}
                </button>
                {SHOW_DEMO_PREVIEW ? (
                  <button
                    type="button"
                    className="ui-button ui-button-ghost ui-button-xs"
                    onClick={() => setUseDemoSchedule((v) => !v)}
                  >
                    {useDemoSchedule ? 'Use real schedule' : 'Preview demo'}
                  </button>
                ) : null}
                {isPlanStale ? (
                  <span className="home-plan-stale-note">
                    Window changed — regenerate for a fresh plan.
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* ── DUE SOON ─────────────────────────────────────────────── */}
          <section className="home-sheet">
            <SectionHeading
              eyebrow="Due Soon"
              title="Due Soon"
              description="A short list of work with dates close enough to affect today."
              actionHref="/tasks"
              actionLabel="Open Tasks"
            />

            {dueSoon.length > 0 ? (
              <div className="home-sheet-list">
                {dueSoon.map((item) => (
                  <DueSoonRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div
                className="ui-empty"
                style={{
                  borderRadius: 'var(--radius-panel)',
                  padding: '0.95rem 1rem',
                  fontSize: '14px',
                  lineHeight: 1.6,
                }}
              >
                Nothing with a due date is crowding the next few days.
              </div>
            )}
          </section>
        </div>

        {/* ── RAIL ─────────────────────────────────────────────────────── */}
        <aside className="home-rail">
          {/* Clock planner */}
          <section className="home-sheet home-clock-rail">
            <SectionHeading
              eyebrow="Free time"
              title={windowLabel}
              description={`${availableLabel} available · drag ring to adjust`}
            />

            <InteractivePlannerClock
              availableStart={availableStart}
              availableEnd={availableEnd}
              currentBlock={currentBlock}
              scheduleBlocks={visibleSchedule.filter((b) => b.status !== 'completed')}
              selectedBlockId={selectedBlockId}
              onWindowChange={changeWindow}
              onSelectBlock={selectClockBlock}
            />

            <div className="clock-legend" aria-label="Clock legend">
              <span>
                <i className="clock-legend-swatch free" />
                Free time
              </span>
              <span>
                <i className="clock-legend-swatch plan" />
                Scheduled
              </span>
            </div>

            {!hasSchedule ? (
              <button
                type="button"
                className="ui-button ui-button-primary"
                style={{ width: '100%' }}
                onClick={handleGenerate}
                disabled={isGenerating || isPending || availableMinutes <= 0}
              >
                {isGenerating ? 'Building…' : 'Generate plan'}
              </button>
            ) : isPlanStale ? (
              <p className="home-plan-stale-note" style={{ textAlign: 'center' }}>
                Window changed — regenerate in Today plan.
              </p>
            ) : null}

            {completedAll ? (
              <p
                className="ui-section-copy"
                style={{ color: 'var(--green)', fontWeight: 600, fontSize: '13px' }}
              >
                All scheduled work completed.
              </p>
            ) : null}
          </section>

          {/* Study packs */}
          {allStudyPacks.length > 0 ? (
            <section className="home-sheet">
              <SectionHeading
                eyebrow="Study materials"
                title="Study packs ready"
                description="Generated packs available for review or quiz."
                actionHref="/library"
                actionLabel="Open Library"
              />

              <div className="home-sheet-list">
                {allStudyPacks.slice(0, 5).map((pack) => (
                  <article key={pack.id} className="home-sheet-row">
                    <div style={{ minWidth: 0 }}>
                      <div className="home-row-meta">
                        <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
                          Study pack
                        </span>
                        {pack.quizReady ? (
                          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
                            Quiz ready
                          </span>
                        ) : null}
                      </div>
                      <p className="home-row-title">{pack.title}</p>
                    </div>
                    <Link
                      href={`/library/${encodeURIComponent(pack.id)}`}
                      className="home-row-open"
                    >
                      Open
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {/* What changed */}
          <section className="home-sheet">
            <SectionHeading
              eyebrow="What changed"
              title="What's new"
              description="Recent updates without the full course feed."
            />

            {recentActivity.length > 0 ? (
              <div className="home-sheet-list">
                {recentActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <div
                className="ui-empty"
                style={{
                  borderRadius: 'var(--radius-panel)',
                  padding: '0.95rem 1rem',
                  fontSize: '14px',
                  lineHeight: 1.6,
                }}
              >
                No recent changes have been captured yet.
              </div>
            )}
          </section>

          {/* Course snapshot */}
          <section className="home-sheet">
            <SectionHeading
              eyebrow="Courses"
              title="Course Snapshot"
              description="Each class reduced to what matters now."
              actionHref="/courses"
              actionLabel="Open Courses"
            />

            <div className="home-sheet-list">
              {courseSnapshots.map((course) => (
                <CourseSnapshotRow key={course.id} course={course} />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeading({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  eyebrow: string
  title: string
  description: string
  actionHref?: string
  actionLabel?: string
}) {
  return (
    <div className="home-section-heading">
      <div style={{ minWidth: 0 }}>
        <p className="ui-kicker">{eyebrow}</p>
        <h2 className="ui-section-title" style={{ marginTop: '0.36rem' }}>
          {title}
        </h2>
        <p className="ui-section-copy" style={{ marginTop: '0.32rem', maxWidth: '30rem' }}>
          {description}
        </p>
      </div>

      {actionHref && actionLabel ? (
        <Link href={actionHref} className="home-subtle-link">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function ScheduledBlockHero({
  block,
  isNow,
  studyPacks,
  onOpen,
  onStatus,
  onReschedule,
}: {
  block: ScheduleBlock
  isNow: boolean
  studyPacks: StudyPackRef[]
  onOpen: (id: string) => void
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
}) {
  const typeLabel = getStudentTypeLabel(block)
  const href = getBlockHref(block)

  return (
    <div className="home-focus-layout">
      <div className="home-focus-main">
        <div className="home-focus-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {typeLabel}
          </span>
          {isNow ? (
            <span
              className="ui-chip ui-chip-soft"
              style={{
                fontWeight: 700,
                background: 'color-mix(in srgb, var(--accent-light) 60%, var(--surface-soft) 40%)',
                color: 'var(--accent-foreground)',
                border: '1px solid color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)',
              }}
            >
              Now
            </span>
          ) : null}
          <span className="ui-chip ui-chip-soft" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
            {formatTimeRange(block.startAt, block.endAt)}
          </span>
        </div>

        <h2 className="home-focus-title">{block.title}</h2>

        {block.subtitle ? (
          <p className="home-focus-copy">{block.subtitle}</p>
        ) : null}

        <div className="home-focus-actions">
          <button
            type="button"
            className="ui-button ui-button-primary"
            onClick={() => onOpen(block.id)}
            disabled={!href}
            title={!href ? 'Workspace not available for this item' : undefined}
          >
            {isNow ? 'Continue' : 'Open / Start'}
          </button>
          <button
            type="button"
            className="ui-button ui-button-secondary"
            onClick={() => onStatus(block.id, 'completed')}
          >
            {getDoneLabel(block)}
          </button>
          <button
            type="button"
            className="ui-button ui-button-ghost ui-button-xs"
            onClick={() => onStatus(block.id, 'skipped')}
          >
            Skip
          </button>
          {onReschedule ? (
            <button
              type="button"
              className="ui-button ui-button-ghost ui-button-xs"
              onClick={() => onReschedule(block.id, block.startAt, block.endAt)}
            >
              Move later
            </button>
          ) : null}
        </div>

        {studyPacks.length > 0 ? (
          <div className="study-pack-sublist">
            {studyPacks.map((pack) => (
              <Link
                key={pack.id}
                href={`/library/${encodeURIComponent(pack.id)}`}
                className="study-pack-chip"
              >
                <span className="study-pack-chip-icon">✦</span>
                {pack.title}
                {pack.quizReady ? (
                  <span className="study-pack-chip-badge">Quiz</span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <aside className="home-focus-aside">
        <dl className="home-focus-facts">
          <FactItem label="Time" value={formatTimeRange(block.startAt, block.endAt)} />
          <FactItem label="Duration" value={formatBlockDuration(block)} />
          <FactItem label="Type" value={typeLabel} />
        </dl>
      </aside>
    </div>
  )
}

function PrimaryActionHero({
  item,
  upNext,
  hasSchedule,
}: {
  item: TodayItem
  upNext: TodayItem[]
  hasSchedule: boolean
}) {
  const href = resolveItemHref(item)

  return (
    <>
      <div className="home-focus-layout">
        <div className="home-focus-main">
          <div className="home-focus-meta">
            <ToneBadge item={item} />
            {item.effortLabel ? <MetaBadge>{item.effortLabel}</MetaBadge> : null}
          </div>

          <h2 className="home-focus-title">{item.title}</h2>
          <p className="home-focus-copy">{item.whyNow}</p>

          {item.supportingText ? (
            <p className="home-focus-support">{item.supportingText}</p>
          ) : null}

          <div className="home-focus-actions">
            {href ? (
              <Link href={href} className="ui-button ui-button-primary">
                {primaryButtonLabel(item)}
              </Link>
            ) : null}

            {item.kind === 'task' ? (
              <TaskDraftButton
                copyBundle={buildManualCopyBundle({
                  taskTitle: item.title,
                  courseName: item.courseName,
                  moduleName: item.moduleTitle,
                  dueDate: item.dateTime,
                  taskDetails: item.supportingText,
                })}
                entryOrigin="today"
                doPageHref={item.href ?? undefined}
                context={{
                  taskTitle: item.title,
                  taskDetails: item.supportingText,
                  deadline: item.dateTime,
                  priority: item.priority,
                  courseName: item.courseName,
                  moduleTitle: item.moduleTitle,
                  canvasUrl: item.canvasUrl,
                  learnHref: item.learnHref ?? item.href,
                }}
              />
            ) : (
              <Link href="/tasks" className="ui-button ui-button-secondary">
                Open task list
              </Link>
            )}
          </div>
        </div>

        <aside className="home-focus-aside">
          {item.kind === 'task' && item.taskItemId ? (
            <TaskStatusToggle
              status={item.completionStatus ?? 'pending'}
              moduleId={item.moduleId}
              title={item.title}
              taskItemId={item.taskItemId}
              align="end"
            />
          ) : null}

          <dl className="home-focus-facts">
            <FactItem
              label="Due"
              value={item.dateTime ? formatDateTime(item.dateTime) : 'No due date'}
            />
            <FactItem label="Course" value={item.courseName} />
            <FactItem label="Where" value={item.moduleTitle || fallbackAreaLabel(item)} />
          </dl>
        </aside>
      </div>

      {!hasSchedule && upNext.length > 0 ? (
        <div className="home-inline-list">
          <div className="home-inline-list-header">
            <p className="ui-kicker">Also coming up</p>
            <Link href="/tasks" className="home-subtle-link">
              See all
            </Link>
          </div>

          <div className="home-sheet-list">
            {upNext.map((next) => (
              <CompactActionRow key={next.id} item={next} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

function PlanGroup({
  label,
  blocks,
  selectedBlockId,
  studyPacksByBlockId,
  onOpen,
  onStatus,
  onSelect,
  onReschedule,
}: {
  label: string
  blocks: ScheduleBlock[]
  selectedBlockId: string | null
  studyPacksByBlockId: Record<string, StudyPackRef[]>
  onOpen: (id: string) => void
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onSelect: (id: string | null) => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
}) {
  if (blocks.length === 0) return null

  return (
    <div className="home-plan-group">
      <p className="home-plan-group-label">{label}</p>
      <div className="home-compact-list">
        {blocks.map((block) => (
          <PlanRow
            key={block.id}
            block={block}
            selected={selectedBlockId === block.id}
            studyPacks={studyPacksByBlockId[block.id] ?? []}
            onOpen={onOpen}
            onStatus={onStatus}
            onSelect={onSelect}
            onReschedule={onReschedule}
          />
        ))}
      </div>
    </div>
  )
}

function PlanRow({
  block,
  selected,
  studyPacks,
  onOpen,
  onStatus,
  onSelect,
  onReschedule,
}: {
  block: ScheduleBlock
  selected: boolean
  studyPacks: StudyPackRef[]
  onOpen: (id: string) => void
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onSelect: (id: string | null) => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
}) {
  const typeLabel = getStudentTypeLabel(block)
  const href = getBlockHref(block)
  const now = new Date()
  const isNow =
    block.status === 'opened' ||
    (block.status === 'scheduled' &&
      new Date(block.startAt) <= now &&
      new Date(block.endAt) > now)
  const hasQuizReady = studyPacks.some((p) => p.quizReady)

  return (
    <article className={`home-list-row home-plan-row${selected ? ' home-plan-row-selected' : ''}`}>
      <button
        type="button"
        className="home-plan-row-main"
        onClick={() => onSelect(selected ? null : block.id)}
        aria-expanded={selected}
      >
        <div className="home-row-meta">
          <span className="planner-type-pill">{typeLabel}</span>
          {isNow ? <span className="now-pill">Now</span> : null}
          {studyPacks.length > 0 ? (
            <span className="home-study-ready-chip">Study pack ready</span>
          ) : null}
          {hasQuizReady ? (
            <span className="home-study-ready-chip">Quiz ready</span>
          ) : null}
          <span>{formatTimeRange(block.startAt, block.endAt)}</span>
        </div>
        <p className="home-row-title">{block.title}</p>
      </button>

      {selected ? (
        <div className="home-plan-row-actions">
          <button
            type="button"
            className="ui-button ui-button-primary ui-button-xs"
            onClick={() => onOpen(block.id)}
            disabled={!href}
          >
            Open
          </button>
          <button
            type="button"
            className="ui-button ui-button-secondary ui-button-xs"
            onClick={() => onStatus(block.id, 'completed')}
          >
            {getDoneLabel(block)}
          </button>
          <button
            type="button"
            className="ui-button ui-button-ghost ui-button-xs"
            onClick={() => onStatus(block.id, 'skipped')}
          >
            Skip
          </button>
          {onReschedule ? (
            <button
              type="button"
              className="ui-button ui-button-ghost ui-button-xs"
              onClick={() => onReschedule(block.id, block.startAt, block.endAt)}
            >
              Move later
            </button>
          ) : null}
        </div>
      ) : href ? (
        <Link href={href} className="home-row-open">
          Open
        </Link>
      ) : null}
    </article>
  )
}

function CompletedSection({
  blocks,
  isOpen,
  onToggle,
}: {
  blocks: ScheduleBlock[]
  isOpen: boolean
  onToggle: () => void
}) {
  const sorted = [...blocks].sort(
    (a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime(),
  )

  return (
    <div className="home-plan-completed">
      <button
        type="button"
        className="home-plan-completed-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span>Completed</span>
        <span className="home-plan-count">{blocks.length}</span>
        <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
      </button>

      {isOpen ? (
        <div className="home-compact-list">
          {sorted.map((block) => (
            <div key={block.id} className="home-list-row home-plan-completed-row">
              <div className="home-row-meta">
                <span className="planner-type-pill">{getStudentTypeLabel(block)}</span>
                <span>{block.title}</span>
              </div>
              <span className="home-row-note">{formatTimeRange(block.startAt, block.endAt)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CompactActionRow({ item }: { item: TodayItem }) {
  const href = resolveItemHref(item)

  return (
    <article className="home-sheet-row">
      <div style={{ minWidth: 0 }}>
        <div className="home-row-meta">
          <ToneBadge item={item} subtle />
          <span>{item.courseName}</span>
        </div>
        <p className="home-row-title">{item.title}</p>
        <p className="home-row-copy">{item.whyNow}</p>
      </div>

      {href ? (
        <Link href={href} className="home-row-open">
          Open
        </Link>
      ) : null}
    </article>
  )
}

function DueSoonRow({ item }: { item: HomeDueSoonItem }) {
  return (
    <article className="home-sheet-row">
      <div style={{ minWidth: 0 }}>
        <div className="home-row-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {item.urgencyLabel}
          </span>
          <span>{item.courseName}</span>
        </div>
        <p className="home-row-title">{item.title}</p>
        <p className="home-row-copy">
          {item.moduleTitle}. {item.timingLabel}
        </p>
      </div>

      <Link href={item.href} className="home-row-open">
        Open
      </Link>
    </article>
  )
}

function ActivityRow({ item }: { item: HomeActivityItem }) {
  const content = (
    <article className="home-sheet-row home-sheet-row-link">
      <div style={{ minWidth: 0 }}>
        <div className="home-row-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {item.label}
          </span>
          <span>{item.meta}</span>
        </div>
        <p className="home-row-title">{item.title}</p>
        <p className="home-row-copy">{item.detail}</p>
      </div>
      <span className="home-row-open">Open</span>
    </article>
  )

  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
        {content}
      </a>
    )
  }

  return (
    <Link href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
      {content}
    </Link>
  )
}

function CourseSnapshotRow({ course }: { course: HomeCourseSnapshot }) {
  return (
    <article className="home-sheet-row">
      <div style={{ minWidth: 0 }}>
        <div className="home-row-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {course.code}
          </span>
          {course.urgentCount > 0 ? (
            <span
              className="ui-chip ui-status-warning"
              style={{ padding: '0.24rem 0.55rem', fontSize: '11px', fontWeight: 700 }}
            >
              {course.urgentCount} urgent
            </span>
          ) : null}
        </div>
        <Link href={course.href} style={{ textDecoration: 'none' }}>
          <p className="home-row-title">{course.name}</p>
        </Link>
        <p className="home-row-copy">{course.statusSummary}</p>
        {course.latestChange ? (
          <p className="home-row-note">{course.latestChange}</p>
        ) : null}
      </div>

      <Link href={course.nextActionHref} className="home-row-open">
        {course.nextActionLabel}
      </Link>
    </article>
  )
}

function ToneBadge({ item, subtle = false }: { item: TodayItem; subtle?: boolean }) {
  const toneStyle =
    item.tone === 'attention'
      ? {
          background:
            'color-mix(in srgb, var(--accent-light) 46%, var(--surface-soft) 54%)',
          color: 'var(--accent-foreground)',
          border:
            '1px solid color-mix(in srgb, var(--accent-border) 28%, var(--border-subtle) 72%)',
        }
      : item.tone === 'review'
        ? {
            background:
              'color-mix(in srgb, var(--blue-light) 38%, var(--surface-soft) 62%)',
            color: 'var(--blue)',
            border:
              '1px solid color-mix(in srgb, var(--blue) 18%, var(--border-subtle) 82%)',
          }
        : {
            background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)',
          }

  return (
    <span
      className="ui-chip"
      style={{
        padding: subtle ? '0.16rem 0.48rem' : '0.24rem 0.58rem',
        fontSize: subtle ? '11px' : '12px',
        fontWeight: 700,
        ...toneStyle,
      }}
    >
      {item.toneLabel}
    </span>
  )
}

function MetaBadge({ children }: { children: string }) {
  return (
    <span className="ui-chip ui-chip-soft" style={{ fontWeight: 600 }}>
      {children}
    </span>
  )
}

function FactItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="home-focus-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// ── Utilities ───────────────────────────────────────────────────────────────

function isTaskBlock(block: ScheduleBlock): boolean {
  return (
    block.sourceTable === 'task_items' ||
    block.sourceTable === 'tasks' ||
    block.sourceTable === 'deadlines' ||
    (block.sourceTable === 'drafts' && block.subtitle === 'Draft')
  )
}

function resolveItemHref(item: TodayItem) {
  if (item.kind === 'task') return item.href
  return item.learnHref ?? item.href
}

function primaryButtonLabel(item: TodayItem) {
  if (item.kind === 'task') return 'Open task'
  if (item.kind === 'module') return 'Review module'
  return 'Open study view'
}

function fallbackAreaLabel(item: TodayItem) {
  if (item.kind === 'task') return 'Task'
  if (item.kind === 'module') return 'Module'
  return 'Study item'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const includesTime = /T\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat(undefined, includesTime
    ? { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { weekday: 'short', month: 'short', day: 'numeric' }
  ).format(date)
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatBlockDuration(block: ScheduleBlock) {
  const minutes = Math.max(
    0,
    Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000),
  )
  return formatDuration(minutes)
}

function getBlockHref(block: ScheduleBlock): string | null {
  const { sourceTable, sourceId, courseId } = block
  if (!sourceId) return null

  switch (sourceTable) {
    case 'task_items':
      return `/tasks?taskTitle=${encodeURIComponent(block.title)}`
    case 'tasks':
      return `/tasks?task=${encodeURIComponent(sourceId)}`
    case 'deadlines':
      return '/tasks'
    case 'modules':
      return `/modules/${encodeURIComponent(sourceId)}/learn`
    case 'module_resources':
      if (courseId)
        return `/courses/${encodeURIComponent(courseId)}?resource=${encodeURIComponent(sourceId)}#resource-${encodeURIComponent(sourceId)}`
      return null
    case 'learning_items':
      return courseId ? `/courses/${encodeURIComponent(courseId)}` : '/tasks'
    case 'deep_learn_notes':
      return `/library/${encodeURIComponent(sourceId)}`
    case 'drafts':
      return `/library/${encodeURIComponent(sourceId)}`
    default:
      return null
  }
}

function getStudentTypeLabel(block: ScheduleBlock): string {
  const { sourceTable } = block
  if (sourceTable === 'task_items' || sourceTable === 'tasks' || sourceTable === 'deadlines')
    return 'Task'
  if (sourceTable === 'modules') return 'Module review'
  if (sourceTable === 'module_resources') return 'Study material'
  if (sourceTable === 'learning_items')
    return block.subtitle === 'Quiz practice' ? 'Quiz practice' : 'Module review'
  if (sourceTable === 'deep_learn_notes') return 'Study pack'
  if (sourceTable === 'drafts') return block.subtitle === 'Draft' ? 'Task' : 'Study material'
  return 'Task'
}

function getDoneLabel(block: ScheduleBlock) {
  const source = block.sourceTable
  if (source === 'deep_learn_notes' || source === 'drafts') return 'Mark studied'
  if (source === 'learning_items') return 'Mark reviewed'
  if (source === 'module_resources') return 'Mark studied'
  if (source === 'modules') return 'Mark reviewed'
  return 'Mark done'
}

function getBlockStudyPacks(
  block: ScheduleBlock,
  byModuleId: Record<string, StudyPackRef[]>,
  byResourceId: Record<string, StudyPackRef[]>,
): StudyPackRef[] {
  if (!block.sourceId) return []
  if (block.sourceTable === 'modules') return byModuleId[block.sourceId] ?? []
  if (block.sourceTable === 'module_resources') return byResourceId[block.sourceId] ?? []
  return []
}

function buildDemoScheduleBlocks(): ScheduleBlock[] {
  const now = new Date()
  const block = (offsetMinutes: number, durationMinutes: number) => {
    const start = new Date(now.getTime() + offsetMinutes * 60_000)
    const end = new Date(start.getTime() + durationMinutes * 60_000)
    return { startAt: start.toISOString(), endAt: end.toISOString() }
  }
  const missed = block(-180, 45)
  const completed = block(-90, 35)
  const current = block(-10, 55)
  const next = block(55, 45)
  const upcomingOne = block(110, 40)
  const upcomingTwo = block(160, 50)

  return [
    {
      id: 'demo-missed',
      title: 'Catch up on missed reviewer',
      context: 'English 102',
      urgencyNote: 'Overdue by 2h',
      ...missed,
      status: 'scheduled',
      sourceTable: 'task_items',
    },
    {
      id: 'demo-completed',
      title: 'Read Canvas announcement',
      context: 'Student Success Seminar',
      subtitle: 'Learning material',
      estimateConfidence: 'low',
      estimateReason: 'Estimated from material fallback',
      ...completed,
      status: 'completed',
      sourceTable: 'module_resources',
    },
    {
      id: 'demo-current',
      title: 'Review Web App Development module',
      context: 'CIS 310',
      subtitle: 'Module review',
      estimateConfidence: 'low',
      estimateReason: 'Estimated module review block',
      urgencyNote: 'Due tonight 11:59 PM',
      ...current,
      status: 'opened',
      sourceTable: 'modules',
    },
    {
      id: 'demo-next',
      title: 'Draft activity answer',
      context: 'CIS 310',
      subtitle: 'Drafting',
      estimateConfidence: 'medium',
      estimateReason: 'Estimated from task type',
      urgencyNote: 'Deadline basis: due in 5h',
      ...next,
      status: 'scheduled',
      sourceTable: 'task_items',
    },
    {
      id: 'demo-upcoming-one',
      title: 'Quiz prep: JavaScript basics',
      context: 'CIS 302',
      subtitle: 'Quiz practice',
      estimateConfidence: 'medium',
      estimateReason: 'Estimated from quiz/review type',
      urgencyNote: 'Prep target: quiz tomorrow',
      ...upcomingOne,
      status: 'scheduled',
      sourceTable: 'learning_items',
    },
    {
      id: 'demo-upcoming-two',
      title: '1-Data Organization.pdf',
      context: 'DBMS 201',
      subtitle: 'Learning material',
      estimateConfidence: 'medium',
      estimateReason: 'Estimated from content length',
      ...upcomingTwo,
      status: 'skipped',
      sourceTable: 'module_resources',
    },
  ]
}
