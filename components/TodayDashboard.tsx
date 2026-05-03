'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { generateUserSchedule, rescheduleBlock, updateBlockStatus } from '@/actions/scheduler'
import { InteractivePlannerClock, type ClockScheduleBlock } from '@/components/InteractivePlannerClock'
import type { HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import { formatDuration, formatTime, getWindowDurationMinutes, isBlockInsideWindow, timeWindowToIsoRange } from '@/lib/scheduler/time'

type ScheduleBlock = ClockScheduleBlock

const SHOW_DEMO_PREVIEW = process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'

export function TodayDashboard({ scheduledBlocks, dueSoon, courseSnapshots }: {
  scheduledBlocks: ScheduleBlock[]
  dueSoon: HomeDueSoonItem[]
  courseSnapshots: HomeCourseSnapshot[]
}) {
  const [isPending, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const [useDemoSchedule, setUseDemoSchedule] = useState(false)
  const [availableStart, setAvailableStart] = useState('18:30')
  const [availableEnd, setAvailableEnd] = useState('21:30')
  const [isPlanStale, setIsPlanStale] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [showAllSchedule, setShowAllSchedule] = useState(false)
  const [showAllAttention, setShowAllAttention] = useState(false)
  const schedulePanelRef = useRef<HTMLDivElement | null>(null)

  const scheduleForDisplay = useMemo(() => useDemoSchedule ? buildDemoScheduleBlocks() : scheduledBlocks, [scheduledBlocks, useDemoSchedule])
  const visibleSchedule = useMemo(
    () => scheduleForDisplay.filter((block) => isBlockInsideWindow(block, availableStart, availableEnd)),
    [scheduleForDisplay, availableStart, availableEnd],
  )

  const { currentBlock, needsAttention, completedCount, totalScheduledCount, hasAnySourceData } = useMemo(() => {
    const now = new Date()
    const nowMs = now.getTime()
    const urgentCutoff = nowMs + 30 * 60_000
    const sorted = [...visibleSchedule].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const active = sorted.find((block) => block.status === 'opened' || (block.status === 'scheduled' && new Date(block.startAt) <= now && new Date(block.endAt) > now)) ?? null

    return {
      currentBlock: active,
      needsAttention: sorted.filter((block) => {
        const startMs = new Date(block.startAt).getTime()
        const endMs = new Date(block.endAt).getTime()
        if (block.status === 'completed') return false
        if (block.status === 'skipped') return true
        if (block.status === 'opened' && endMs <= nowMs) return true
        if (block.status === 'scheduled' && endMs <= nowMs) return true
        return block.status === 'scheduled' && startMs >= nowMs && startMs <= urgentCutoff
      }),
      completedCount: sorted.filter((block) => block.status === 'completed').length,
      totalScheduledCount: sorted.length,
      hasAnySourceData: dueSoon.length > 0 || courseSnapshots.length > 0,
    }
  }, [visibleSchedule, dueSoon.length, courseSnapshots.length])

  const hasSchedule = totalScheduledCount > 0
  const completedAll = hasSchedule && completedCount === totalScheduledCount
  const selectedBlock = useMemo(() => {
    return selectedBlockId ? visibleSchedule.find((block) => block.id === selectedBlockId) ?? null : null
  }, [selectedBlockId, visibleSchedule])
  const availableMinutes = getWindowDurationMinutes(availableStart, availableEnd)
  const availableLabel = availableMinutes > 0 ? formatDuration(availableMinutes) : 'Invalid window'
  const windowLabel = `${formatTime(availableStart)} - ${formatTime(availableEnd)}`
  const selectedScheduleIndex = selectedBlockId ? visibleSchedule.findIndex((block) => block.id === selectedBlockId) : -1
  const scheduleListExpanded = showAllSchedule || selectedScheduleIndex >= 4
  const visibleScheduleCards = scheduleListExpanded ? visibleSchedule : visibleSchedule.slice(0, 4)
  const selectedAttentionIndex = selectedBlockId ? needsAttention.findIndex((block) => block.id === selectedBlockId) : -1
  const attentionListExpanded = showAllAttention || selectedAttentionIndex >= 2
  const visibleAttentionCards = attentionListExpanded ? needsAttention : needsAttention.slice(0, 2)

  function selectBlock(blockId: string) {
    setSelectedBlockId((current) => current === blockId ? null : blockId)
  }

  function selectClockBlock(blockId: string) {
    setSelectedBlockId(blockId)
    if (visibleSchedule.findIndex((block) => block.id === blockId) >= 4) setShowAllSchedule(true)
    if (needsAttention.findIndex((block) => block.id === blockId) >= 2) setShowAllAttention(true)
    requestAnimationFrame(() => schedulePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

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
      requestAnimationFrame(() => schedulePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    } finally {
      setIsGenerating(false)
    }
  }

  function updateStatus(id: string, status: 'opened' | 'completed' | 'skipped') {
    if (useDemoSchedule) return
    startTransition(async () => {
      await updateBlockStatus(id, status)
    })
  }

  function placeholderReschedule(id: string, startAt: string, endAt: string) {
    if (useDemoSchedule) return
    startTransition(async () => {
      await rescheduleBlock(id, startAt, endAt)
    })
  }

  return (
    <section className="today-command-center">
      <header className="command-center-header">
        <div>
          <p className="ui-kicker">Today Plan</p>
          <h1 className="ui-page-title">Clock Command Center</h1>
        </div>
      </header>

      <section className="planner-shell home-sheet">
        <div className="planner-clock-column">
          <section className="planner-clock-panel" aria-label="Clock plan summary">
            <InteractivePlannerClock
              availableStart={availableStart}
              availableEnd={availableEnd}
              currentBlock={currentBlock}
              scheduleBlocks={visibleSchedule}
              selectedBlockId={selectedBlockId}
              onWindowChange={changeWindow}
              onSelectBlock={selectClockBlock}
            />
            <div className="clock-legend" aria-label="Clock legend">
              <span><i className="clock-legend-swatch free" />Outer ring: Free time</span>
              <span><i className="clock-legend-swatch plan" />Inner ring: Scheduled blocks</span>
            </div>
            <div className="planner-duration-row clock-duration-row">
              <span>Available</span>
              <strong>{availableLabel}</strong>
            </div>
            {isPlanStale ? <p className="planner-stale-note">Time window changed. Regenerate when you want a fresh plan for this window.</p> : null}
          </section>

          <section className="planner-controls" aria-label="Schedule generation">
            <div className="schedule-actions">
              <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending || availableMinutes <= 0}>
                {isGenerating ? 'Building your plan...' : hasSchedule ? 'Regenerate Today Plan' : 'Generate schedule'}
              </button>
              {SHOW_DEMO_PREVIEW ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => setUseDemoSchedule((value) => !value)}>{useDemoSchedule ? 'Use real schedule' : 'Preview demo schedule'}</button> : null}
            </div>
          </section>
        </div>

        <div className="planner-timeline-column" ref={schedulePanelRef}>
          <section className="planner-schedule-panel">
            <div className="planner-panel-heading">
              <div>
                <p className="ui-kicker">Today&apos;s Schedule</p>
                <h2>{visibleSchedule.length > 0 ? `${visibleSchedule.length} block${visibleSchedule.length === 1 ? '' : 's'} in this window` : 'No blocks fit this time window'}</h2>
              </div>
              <span className="planner-window-chip">{windowLabel}</span>
            </div>

            {visibleSchedule.length > 0 ? (
              <div className="planner-schedule-list">
                {visibleScheduleCards.map((block) => (
                  <ScheduleCard
                    key={block.id}
                    block={block}
                    nowId={currentBlock?.id ?? null}
                    selected={selectedBlock?.id === block.id}
                    onSelect={selectBlock}
                    onStatus={updateStatus}
                    onReschedule={useDemoSchedule ? undefined : placeholderReschedule}
                  />
                ))}
                {visibleSchedule.length > 4 ? (
                  <button
                    type="button"
                    className="planner-show-more"
                    onClick={() => {
                      if (scheduleListExpanded) {
                        setSelectedBlockId(null)
                        setShowAllSchedule(false)
                      } else {
                        setShowAllSchedule(true)
                      }
                    }}
                  >
                    {scheduleListExpanded ? 'Show less' : `Show ${visibleSchedule.length - 4} more`}
                  </button>
                ) : null}
              </div>
            ) : (
              <section className="planner-empty-state">
                <h3>No blocks fit this time window.</h3>
                <p className="ui-section-copy">Generate a plan to fill {windowLabel}.</p>
              </section>
            )}
          </section>

          <section className="planner-attention-panel">
            <p className="ui-kicker">Need Attention</p>
            {needsAttention.length > 0 ? (
              <div className="planner-compact-list">
                {visibleAttentionCards.map((block) => (
                  <ScheduleCard
                    key={block.id}
                    block={block}
                    nowId={null}
                    selected={selectedBlock?.id === block.id}
                    onSelect={selectBlock}
                    onStatus={updateStatus}
                    onReschedule={useDemoSchedule ? undefined : placeholderReschedule}
                    compact
                  />
                ))}
                {needsAttention.length > 2 ? (
                  <button
                    type="button"
                    className="planner-show-more"
                    onClick={() => {
                      if (attentionListExpanded) {
                        setSelectedBlockId(null)
                        setShowAllAttention(false)
                      } else {
                        setShowAllAttention(true)
                      }
                    }}
                  >
                    {attentionListExpanded ? 'Show less' : `Show ${needsAttention.length - 2} more`}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="ui-section-copy">Nothing needs attention right now.</p>
            )}
          </section>

          {!hasSchedule ? (
            <section className="planner-start-panel">
              <p className="ui-kicker">Start Here</p>
              <h2>No plan yet - pick something to start.</h2>
              <div className="schedule-actions">
                <button type="button" className="ui-button ui-button-secondary ui-button-xs">Review latest module</button>
                <button type="button" className="ui-button ui-button-secondary ui-button-xs">Work on nearest deadline</button>
                <button type="button" className="ui-button ui-button-secondary ui-button-xs">Continue last session</button>
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {!hasAnySourceData ? (
        <section className="home-sheet command-empty-state">
          <h2>No tasks found. Sync with Canvas to start planning.</h2>
          <div className="schedule-actions"><Link href="/settings" className="ui-button ui-button-secondary">Go to Settings / Sync</Link></div>
        </section>
      ) : null}

      {hasSchedule && completedAll ? (
        <section className="home-sheet command-empty-state command-empty-state-success">
          <h2>You have completed all scheduled work</h2>
          <p className="ui-section-copy">Take a break, then regenerate when you are ready.</p>
        </section>
      ) : null}
    </section>
  )
}

function ScheduleCard({ block, nowId, selected, onSelect, onStatus, onReschedule, compact = false }: {
  block: ScheduleBlock
  nowId: string | null
  selected: boolean
  onSelect: (id: string) => void
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
  compact?: boolean
}) {
  const isNow = nowId === block.id
  const isMissed = !isNow && block.status === 'scheduled' && new Date(block.endAt) <= new Date()
  const stateClass = block.status === 'completed' ? ' is-completed' : block.status === 'skipped' ? ' is-skipped' : isMissed ? ' is-missed' : ''

  return (
    <article className={`planner-block-card${isNow ? ' is-now' : ''}${stateClass}${selected ? ' is-selected' : ''}${compact ? ' compact' : ''}`}>
      <button type="button" className="planner-block-summary" onClick={() => onSelect(block.id)} aria-expanded={selected}>
        <span className="planner-status-dot" aria-hidden="true" />
        <div>
          <div className="planner-block-title-row">
            <span className="planner-type-pill">{getSourceTypeLabel(block)}</span>
            {isNow ? <span className="now-pill">NOW</span> : null}
          </div>
          <h3>{block.title}</h3>
          <p className="planner-block-time">{formatTimeRange(block.startAt, block.endAt)} <span>{formatBlockDuration(block)}</span></p>
        </div>
      </button>
      <p className="schedule-context">{block.subtitle ?? block.context ?? getSourceTypeLabel(block)}</p>
      {block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}
      <p className="schedule-meta-note">{getEstimateLabel(block)}</p>
      {selected ? (
        <div className="planner-block-details">
          <dl>
            <div>
              <dt>Type</dt>
              <dd>{getSourceTypeLabel(block)}</dd>
            </div>
            <div>
              <dt>Estimate</dt>
              <dd>{getEstimateLabel(block)}</dd>
            </div>
          </dl>
          <div className="schedule-actions selected-block-actions">
            <button type="button" className="ui-button ui-button-primary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Open / Start</button>
            <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>{getDoneLabel(block)}</button>
            <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>
            {onReschedule ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Move later</button> : null}
          </div>
        </div>
      ) : null}
    </article>
  )
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
    { id: 'demo-missed', title: 'Catch up on missed reviewer', context: 'English 102', urgencyNote: 'Overdue by 2h - professor follow-up tomorrow', ...missed, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-completed', title: 'Read Canvas announcement', context: 'Student Success Seminar', subtitle: 'Learning material', estimateConfidence: 'low', estimateReason: 'Estimated from material fallback', ...completed, status: 'completed', sourceTable: 'module_resources' },
    { id: 'demo-current', title: 'Review Web App Development module', context: 'CIS 310', subtitle: 'Module review', estimateConfidence: 'low', estimateReason: 'Estimated module review block', urgencyNote: 'Due tonight 11:59 PM', ...current, status: 'opened', sourceTable: 'modules' },
    { id: 'demo-next', title: 'Draft activity answer', context: 'CIS 310', subtitle: 'Drafting', estimateConfidence: 'medium', estimateReason: 'Estimated from task type', urgencyNote: 'Deadline basis: due in 5h', ...next, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-upcoming-one', title: 'Quiz prep: JavaScript basics', context: 'CIS 302', subtitle: 'Quiz practice', estimateConfidence: 'medium', estimateReason: 'Estimated from quiz/review type', urgencyNote: 'Prep target: quiz tomorrow', ...upcomingOne, status: 'scheduled', sourceTable: 'learning_items' },
    { id: 'demo-upcoming-two', title: 'Data Organization study pack', context: 'DBMS 201', subtitle: 'Study pack', estimateConfidence: 'medium', estimateReason: 'Estimated from saved study pack', ...upcomingTwo, status: 'skipped', sourceTable: 'deep_learn_notes' },
  ]
}

function getConfidenceLabel(block: ScheduleBlock) {
  if (block.sourceTable === 'module_resources') return 'Estimated from content length'
  if (block.sourceTable === 'deep_learn_notes') return 'Estimated from saved study pack'
  if (block.sourceTable === 'drafts') return 'Estimated from saved draft'
  if (block.sourceTable === 'modules') return 'Estimated module review block'
  return 'Estimated from workload and urgency'
}

function getSourceTypeLabel(blockOrSource: ScheduleBlock | ScheduleBlock['sourceTable']) {
  const source = typeof blockOrSource === 'string' ? blockOrSource : blockOrSource.sourceTable
  if (source === 'deadlines' || source === 'tasks') return 'Assignment'
  if (source === 'learning_items') return 'Quiz practice'
  if (source === 'deep_learn_notes') return 'Study pack'
  if (source === 'drafts') return 'Draft'
  if (source === 'module_resources') return 'Resource'
  if (source === 'modules') return 'Module'
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

function getEstimateLabel(block: ScheduleBlock) {
  if (block.estimateReason) {
    const confidence = block.estimateConfidence ? ` - ${block.estimateConfidence} confidence` : ''
    return `${block.estimateReason}${confidence}`
  }

  return `${getConfidenceLabel(block)} - low confidence`
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatBlockDuration(block: ScheduleBlock) {
  const minutes = Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000))
  return formatDuration(minutes)
}
