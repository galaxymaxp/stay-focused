'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { generateUserSchedule, rescheduleBlock, updateBlockStatus } from '@/actions/scheduler'
import type { HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'
import { formatDuration, formatTime, isBlockInsideWindow, timeInputToTodayIso, timeToMinutes } from '@/lib/scheduler/time'

type ScheduleBlock = {
  id: string
  title: string
  startAt: string
  endAt: string
  status: 'scheduled' | 'opened' | 'completed' | 'skipped'
  sourceTable: 'task_items' | 'modules' | 'module_resources'
  context?: string
  urgencyNote?: string
}

type ClockArc = {
  id: string
  path: string
}

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
  const availableMinutes = getAvailableMinutes(availableStart, availableEnd)
  const availableLabel = availableMinutes > 0 ? formatDuration(availableMinutes) : 'Invalid window'
  const windowLabel = `${formatTime(availableStart)} - ${formatTime(availableEnd)}`

  function changeAvailableStart(value: string) {
    setAvailableStart(value)
    setIsPlanStale(true)
  }

  function changeAvailableEnd(value: string) {
    setAvailableEnd(value)
    setIsPlanStale(true)
  }

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await generateUserSchedule(timeInputToTodayIso(availableStart), timeInputToTodayIso(availableEnd))
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
            <PlannerClock availableStart={availableStart} availableEnd={availableEnd} currentBlock={currentBlock} scheduleBlocks={visibleSchedule} />
            <div className="clock-legend" aria-label="Clock legend">
              <span><i className="clock-legend-swatch free" />Outer ring: Free time</span>
              <span><i className="clock-legend-swatch plan" />Inner ring: Study plan</span>
            </div>
          </section>

          <section className="planner-controls" aria-label="Free time controls">
            <div className="command-time-grid">
              <label className="command-time-field">
                <span>Start</span>
                <input type="time" value={availableStart} onChange={(event) => changeAvailableStart(event.target.value)} />
              </label>
              <label className="command-time-field">
                <span>End</span>
                <input type="time" value={availableEnd} onChange={(event) => changeAvailableEnd(event.target.value)} />
              </label>
            </div>
            <div className="planner-duration-row">
              <span>Available duration</span>
              <strong>{availableLabel}</strong>
            </div>
            {isPlanStale ? <p className="planner-stale-note">Time window changed. Regenerate when you want a fresh plan for this window.</p> : null}
            <div className="schedule-actions">
              <button type="button" className="ui-button ui-button-secondary" onClick={() => schedulePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>View schedule</button>
              <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending || availableMinutes <= 0}>
                {isGenerating ? 'Building your plan...' : hasSchedule ? 'Regenerate Today Plan' : 'Generate Today Plan'}
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
                  <ScheduleCard key={block.id} block={block} nowId={currentBlock?.id ?? null} onStatus={updateStatus} onReschedule={placeholderReschedule} />
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
                {needsAttention.map((block) => <ScheduleCard key={block.id} block={block} nowId={null} onStatus={updateStatus} compact />)}
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

function PlannerClock({ availableStart, availableEnd, currentBlock, scheduleBlocks }: { availableStart: string, availableEnd: string, currentBlock: ScheduleBlock | null, scheduleBlocks: ScheduleBlock[] }) {
  const freeArc = buildClockArc('free-window', availableStart, availableEnd, 104)
  const scheduleArcs = buildScheduleArcs(scheduleBlocks)

  return (
    <div className="planner-clock-face">
      <svg className="planner-clock-svg" viewBox="0 0 260 260" role="img" aria-label="Outer ring shows free time. Inner ring shows planned study blocks.">
        <circle className="clock-ring-track outer" cx="130" cy="130" r="104" />
        <circle className="clock-ring-track inner" cx="130" cy="130" r="76" />
        {freeArc ? <path className="clock-ring-arc free" d={freeArc.path} /> : null}
        {scheduleArcs.map((arc) => <path key={arc.id} className="clock-ring-arc plan" d={arc.path} />)}
        <circle className="clock-center-dot" cx="130" cy="130" r="6" />
      </svg>
      <div className="clock-free-window">Free: {formatTime(availableStart)} - {formatTime(availableEnd)}</div>
      {currentBlock ? <div className="clock-now-chip">NOW - {formatTimeRange(currentBlock.startAt, currentBlock.endAt)}</div> : null}
    </div>
  )
}

function ScheduleCard({ block, nowId, onStatus, onReschedule, compact = false }: {
  block: ScheduleBlock
  nowId: string | null
  onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void
  onReschedule?: (id: string, startAt: string, endAt: string) => void
  compact?: boolean
}) {
  const isNow = nowId === block.id
  const isMissed = !isNow && block.status === 'scheduled' && new Date(block.endAt) <= new Date()
  const stateClass = block.status === 'completed' ? ' is-completed' : block.status === 'skipped' ? ' is-skipped' : isMissed ? ' is-missed' : ''

  return (
    <article className={`planner-block-card${isNow ? ' is-now' : ''}${stateClass}${compact ? ' compact' : ''}`}>
      <div className="planner-block-header">
        <span className="planner-status-dot" aria-hidden="true" />
        <div>
          <h3>{block.title}</h3>
          <p className="planner-block-time">{formatTimeRange(block.startAt, block.endAt)} <span>{formatBlockDuration(block)}</span></p>
        </div>
        {isNow ? <span className="now-pill">NOW</span> : null}
      </div>
      {block.context ? <p className="schedule-context">{block.context}</p> : null}
      {block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}
      <p className="schedule-meta-note">{getConfidenceLabel(block.sourceTable)}</p>
      <div className="schedule-actions">
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start</button>
        {block.status === 'opened' || isNow ? <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete</button> : null}
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>
        {onReschedule ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Later</button> : null}
      </div>
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
    { id: 'demo-completed', title: 'Read Canvas announcement', context: 'Student Success Seminar', urgencyNote: 'Done this morning', ...completed, status: 'completed', sourceTable: 'module_resources' },
    { id: 'demo-current', title: 'Review Web App Development module', context: 'CIS 310', urgencyNote: 'Due tonight 11:59 PM', ...current, status: 'opened', sourceTable: 'modules' },
    { id: 'demo-next', title: 'Draft activity answer', context: 'CIS 310', urgencyNote: 'Deadline basis: due in 5h', ...next, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-upcoming-one', title: 'Quiz prep: JavaScript basics', context: 'CIS 302', urgencyNote: 'Prep target: quiz tomorrow', ...upcomingOne, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-upcoming-two', title: 'Finish database assignment', context: 'DBMS 201', urgencyNote: 'Est. 50 min from prior workload', ...upcomingTwo, status: 'skipped', sourceTable: 'task_items' },
  ]
}

const getAvailableMinutes = (start: string, end: string) => timeToMinutes(end) - timeToMinutes(start)

function getConfidenceLabel(source: ScheduleBlock['sourceTable']) {
  if (source === 'module_resources') return 'Estimated from content length'
  if (source === 'modules') return 'Based on deadline urgency'
  return 'Estimated from workload and urgency'
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

function buildScheduleArcs(blocks: ScheduleBlock[]): ClockArc[] {
  return blocks
    .map((block) => {
      const start = new Date(block.startAt)
      const end = new Date(block.endAt)
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const endMinutes = end.getHours() * 60 + end.getMinutes()
      const path = buildArcPath(startMinutes, endMinutes, 76)

      return path ? { id: block.id, path } : null
    })
    .filter((arc): arc is ClockArc => Boolean(arc))
}

function buildClockArc(id: string, start: string, end: string, radius: number): ClockArc | null {
  const path = buildArcPath(timeToMinutes(start), timeToMinutes(end), radius)
  return path ? { id, path } : null
}

function buildArcPath(startMinutes: number, endMinutes: number, radius: number) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null

  const start = polarToCartesian(130, 130, radius, minutesToDegrees(startMinutes))
  const end = polarToCartesian(130, 130, radius, minutesToDegrees(endMinutes))
  const largeArcFlag = endMinutes - startMinutes > 720 ? 1 : 0

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180

  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  }
}

function minutesToDegrees(minutes: number) {
  return (minutes / 1440) * 360
}
