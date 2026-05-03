'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { generateUserSchedule, rescheduleBlock, updateBlockStatus } from '@/actions/scheduler'
import { InteractivePlannerClock, type ClockScheduleBlock } from '@/components/InteractivePlannerClock'
import type { HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import { formatDuration, formatTime, getWindowDurationMinutes, isBlockInsideWindow, timeWindowToIsoRange } from '@/lib/scheduler/time'

type ScheduleBlock = ClockScheduleBlock

const SHOW_DEMO_PREVIEW = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'

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
  const schedulePanelRef = useRef<HTMLDivElement | null>(null)

  const scheduleForDisplay = useMemo(() => useDemoSchedule ? buildDemoScheduleBlocks() : scheduledBlocks, [scheduledBlocks, useDemoSchedule])
  const visibleSchedule = useMemo(
    () => scheduleForDisplay.filter((block) => isBlockInsideWindow(block, availableStart, availableEnd)),
    [scheduleForDisplay, availableStart, availableEnd],
  )

  const { currentBlock, needsAttention, completedCount, totalScheduledCount, hasAnySourceData } = useMemo(() => {
    const now = new Date()
    const sorted = [...visibleSchedule].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const active = sorted.find((block) => block.status === 'opened' || (block.status === 'scheduled' && new Date(block.startAt) <= now && new Date(block.endAt) > now)) ?? null

    return {
      currentBlock: active,
      needsAttention: sorted.filter((block) => block.status === 'scheduled' && new Date(block.endAt) <= now).slice(0, 4),
      completedCount: sorted.filter((block) => block.status === 'completed').length,
      totalScheduledCount: sorted.length,
      hasAnySourceData: dueSoon.length > 0 || courseSnapshots.length > 0,
    }
  }, [visibleSchedule, dueSoon.length, courseSnapshots.length])

  const hasSchedule = totalScheduledCount > 0
  const completedAll = hasSchedule && completedCount === totalScheduledCount
  const selectedBlock = useMemo(() => {
    if (selectedBlockId) {
      const selected = visibleSchedule.find((block) => block.id === selectedBlockId)
      if (selected) return selected
    }

    return currentBlock ?? visibleSchedule.find((block) => block.status !== 'completed' && block.status !== 'skipped') ?? visibleSchedule[0] ?? null
  }, [currentBlock, selectedBlockId, visibleSchedule])
  const availableMinutes = getWindowDurationMinutes(availableStart, availableEnd)
  const availableLabel = availableMinutes > 0 ? formatDuration(availableMinutes) : 'Invalid window'
  const windowLabel = `${formatTime(availableStart)} - ${formatTime(availableEnd)}`

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
              selectedBlockId={selectedBlock?.id ?? null}
              onWindowChange={changeWindow}
              onSelectBlock={setSelectedBlockId}
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
                {visibleSchedule.map((block) => (
                  <ScheduleCard
                    key={block.id}
                    block={block}
                    nowId={currentBlock?.id ?? null}
                    selected={selectedBlock?.id === block.id}
                    onSelect={setSelectedBlockId}
                  />
                ))}
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
                {needsAttention.map((block) => (
                  <ScheduleCard
                    key={block.id}
                    block={block}
                    nowId={null}
                    selected={selectedBlock?.id === block.id}
                    onSelect={setSelectedBlockId}
                    compact
                  />
                ))}
              </div>
            ) : (
              <p className="ui-section-copy">Nothing needs attention right now.</p>
            )}
          </section>

          <SelectedBlockPanel
            block={selectedBlock}
            onStatus={updateStatus}
            onReschedule={useDemoSchedule ? undefined : placeholderReschedule}
          />

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

function ScheduleCard({ block, nowId, selected, onSelect, compact = false }: {
  block: ScheduleBlock
  nowId: string | null
  selected: boolean
  onSelect: (id: string) => void
  compact?: boolean
}) {
  const isNow = nowId === block.id
  const isMissed = !isNow && block.status === 'scheduled' && new Date(block.endAt) <= new Date()
  const stateClass = block.status === 'completed' ? ' is-completed' : block.status === 'skipped' ? ' is-skipped' : isMissed ? ' is-missed' : ''

  return (
    <button
      type="button"
      className={`planner-block-card${isNow ? ' is-now' : ''}${stateClass}${selected ? ' is-selected' : ''}${compact ? ' compact' : ''}`}
      onClick={() => onSelect(block.id)}
      aria-pressed={selected}
    >
      <div className="planner-block-header">
        <span className="planner-status-dot" aria-hidden="true" />
        <div>
          <h3>{block.title}</h3>
          <p className="planner-block-time">{formatTimeRange(block.startAt, block.endAt)} <span>{formatBlockDuration(block)}</span></p>
        </div>
        {isNow ? <span className="now-pill">NOW</span> : null}
      </div>
      <p className="schedule-context">{block.subtitle ?? block.context ?? getSourceTypeLabel(block.sourceTable)}</p>
      {block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}
      <p className="schedule-meta-note">{getEstimateLabel(block)}</p>
    </button>
  )
}

function SelectedBlockPanel({ block, onStatus, onReschedule }: {
  block: ScheduleBlock | null
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
}) {
  if (!block) {
    return (
      <section className="planner-selected-panel">
        <p className="ui-kicker">Selected Block</p>
        <h2>No block selected</h2>
        <p className="ui-section-copy">Tap a clock segment or schedule row to see actions here.</p>
      </section>
    )
  }

  return (
    <section className="planner-selected-panel" aria-label="Selected scheduled block">
      <div className="planner-panel-heading">
        <div>
          <p className="ui-kicker">Selected Block</p>
          <h2>{block.title}</h2>
        </div>
        <span className="planner-window-chip">{getSourceTypeLabel(block.sourceTable)}</span>
      </div>
      <dl className="selected-block-details">
        <div>
          <dt>Time</dt>
          <dd>{formatTimeRange(block.startAt, block.endAt)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatBlockDuration(block)}</dd>
        </div>
        <div>
          <dt>Estimate</dt>
          <dd>{getEstimateLabel(block)}</dd>
        </div>
      </dl>
      <div className="schedule-actions selected-block-actions">
        <button type="button" className="ui-button ui-button-primary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Open / Start</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>{getDoneLabel(block.sourceTable)}</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>
        {onReschedule ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Move later</button> : null}
      </div>
    </section>
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
    { id: 'demo-upcoming-two', title: 'Finish database assignment', context: 'DBMS 201', subtitle: 'Assignment', estimateConfidence: 'low', estimateReason: 'Estimated default task block', ...upcomingTwo, status: 'skipped', sourceTable: 'task_items' },
  ]
}

function getConfidenceLabel(source: ScheduleBlock['sourceTable']) {
  if (source === 'module_resources') return 'Estimated from content length'
  if (source === 'modules') return 'Based on deadline urgency'
  return 'Estimated from workload and urgency'
}

function getSourceTypeLabel(source: ScheduleBlock['sourceTable']) {
  if (source === 'deadlines' || source === 'tasks') return 'Assignment'
  if (source === 'learning_items') return 'Quiz practice'
  if (source === 'module_resources') return 'Resource'
  if (source === 'modules') return 'Module'
  return 'Task'
}

function getDoneLabel(source: ScheduleBlock['sourceTable']) {
  if (source === 'learning_items') return 'Mark reviewed'
  if (source === 'module_resources') return 'Mark studied'
  if (source === 'modules') return 'Mark reviewed'
  return 'Mark done'
}

function getEstimateLabel(block: ScheduleBlock) {
  if (block.estimateReason) {
    const confidence = block.estimateConfidence ? ` · ${block.estimateConfidence} confidence` : ''
    return `${block.estimateReason}${confidence}`
  }

  return `Estimated · low confidence (${getConfidenceLabel(block.sourceTable)})`
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
