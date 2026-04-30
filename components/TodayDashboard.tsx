'use client'

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { generateUserSchedule, rescheduleBlock, updateBlockStatus } from '@/actions/scheduler'
import type { HomeCourseSnapshot, HomeDueSoonItem } from '@/lib/home-overview'

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

const MIN_MEANINGFUL_MINUTES = 30
const IS_DEV_MODE = process.env.NODE_ENV !== 'production'

export function TodayDashboard({ scheduledBlocks, dueSoon, courseSnapshots }: {
  scheduledBlocks: ScheduleBlock[]
  dueSoon: HomeDueSoonItem[]
  courseSnapshots: HomeCourseSnapshot[]
}) {
  const [isPending, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const [useDemoSchedule, setUseDemoSchedule] = useState(false)
  const currentBlockRef = useRef<HTMLElement | null>(null)

  const scheduleForDisplay = useMemo(() => {
    if (!useDemoSchedule) return scheduledBlocks
    return buildDemoScheduleBlocks()
  }, [scheduledBlocks, useDemoSchedule])

  const {
    currentBlock,
    nextBlock,
    comingUp,
    needsAttention,
    completedCount,
    totalScheduledCount,
    hasAnySourceData,
  } = useMemo(() => {
    const now = new Date()
    const sorted = [...scheduleForDisplay].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const active = sorted.find((block) => block.status === 'opened' || (block.status === 'scheduled' && new Date(block.startAt) <= now && new Date(block.endAt) > now)) ?? null
    const upcoming = sorted.filter((block) => block.status === 'scheduled' && new Date(block.endAt) > now)
    const attention = sorted
      .filter((block) => block.status === 'scheduled' && new Date(block.endAt) <= now)
      .sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime())
    const completed = sorted.filter((block) => block.status === 'completed').length

    return {
      currentBlock: active,
      nextBlock: active ? upcoming[0] ?? null : (upcoming[0] ?? null),
      comingUp: upcoming.filter((block) => block.id !== (active?.id ?? upcoming[0]?.id)).slice(0, 3),
      needsAttention: attention.slice(0, 4),
      completedCount: completed,
      totalScheduledCount: sorted.length,
      hasAnySourceData: dueSoon.length > 0 || courseSnapshots.length > 0,
    }
  }, [scheduleForDisplay, dueSoon.length, courseSnapshots.length])

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await generateUserSchedule('08:00', '22:00')
      setUseDemoSchedule(false)
      requestAnimationFrame(() => {
        currentBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
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

  const hasSchedule = totalScheduledCount > 0
  const completedAll = hasSchedule && completedCount === totalScheduledCount
  const showDemoControl = IS_DEV_MODE && (!hasSchedule || !currentBlock)

  return (
    <section className="command-center">
      <header className="command-center-header">
        <div>
          <p className="ui-kicker">Today Plan</p>
          <h1 className="ui-page-title">Clock Command Center</h1>
        </div>
        <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending}>
          {isGenerating ? 'Building your plan…' : hasSchedule ? 'Regenerate Today Plan' : 'Generate Today Plan'}
        </button>
      </header>

      {showDemoControl ? (
        <section className="home-sheet command-subtle-demo-control">
          <p className="ui-section-copy">Need a quick visual check?</p>
          <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => setUseDemoSchedule((value) => !value)}>
            {useDemoSchedule ? 'Use real schedule' : 'Preview demo schedule'}
          </button>
        </section>
      ) : null}

      {!hasSchedule ? (
        <section className="home-sheet command-empty-state">
          <h2>Set your available time to generate your plan</h2>
          <p className="ui-section-copy">We’ll fill your time based on deadlines and workload.</p>
        </section>
      ) : null}

      {!hasSchedule && !hasAnySourceData ? (
        <section className="home-sheet command-empty-state">
          <h2>No tasks found. Sync with Canvas to start planning.</h2>
          <div className="schedule-actions">
            <Link href="/settings" className="ui-button ui-button-secondary">Go to Settings / Sync</Link>
          </div>
        </section>
      ) : null}

      {!hasSchedule ? (
        <section className="home-sheet command-empty-state command-start-here">
          <p className="ui-kicker">Start here</p>
          <h2>No plan yet — pick something to start.</h2>
          <div className="schedule-actions">
            <button type="button" className="ui-button ui-button-secondary ui-button-xs">Review latest module</button>
            <button type="button" className="ui-button ui-button-secondary ui-button-xs">Work on nearest deadline</button>
            <button type="button" className="ui-button ui-button-secondary ui-button-xs">Continue last session</button>
          </div>
        </section>
      ) : null}

      {hasSchedule && !currentBlock && !nextBlock && !comingUp.length && !needsAttention.length && completedAll ? (
        <section className="home-sheet command-empty-state command-empty-state-success">
          <h2>You’ve completed all scheduled work</h2>
          <div className="schedule-actions">
            <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending}>Regenerate Plan</button>
            <p className="ui-section-copy">Take a break.</p>
          </div>
        </section>
      ) : null}

      <div className="command-center-layout">
        <section className="clock-shell home-sheet">
          <p className="ui-kicker">Clock</p>
          <CompactClock currentBlock={currentBlock} comingUp={comingUp} />
        </section>

        <div className="command-center-details">
          <section className="home-sheet command-current-block" ref={currentBlockRef}>
            <p className="ui-kicker">Current Block</p>
            {currentBlock ? <BlockCard block={currentBlock} onStatus={updateStatus} onReschedule={placeholderReschedule} isUrgent /> : null}
            {!currentBlock && nextBlock ? (
              <>
                <p className="ui-section-copy">Next up</p>
                <BlockCard block={nextBlock} onStatus={updateStatus} onReschedule={placeholderReschedule} />
              </>
            ) : null}
            {!currentBlock && !nextBlock && hasSchedule ? (
              <p className="ui-section-copy">Not enough time to create a meaningful plan. Try at least 30–45 minutes.</p>
            ) : null}
          </section>

          {needsAttention.length > 0 ? (
            <section className="home-sheet">
              <p className="ui-kicker">Need Attention</p>
              <p className="ui-section-copy">These were missed and need your decision.</p>
              {needsAttention.map((block) => <BlockRow key={block.id} block={block} onStatus={updateStatus} />)}
            </section>
          ) : (
            <section className="home-sheet">
              <p className="ui-kicker">Need Attention</p>
              <p className="ui-section-copy">Nothing needs attention right now.</p>
            </section>
          )}

          {comingUp.length > 0 ? (
            <section className="home-sheet">
              <p className="ui-kicker">Coming Up</p>
              {comingUp.map((block) => <BlockRow key={block.id} block={block} onStatus={updateStatus} compact />)}
            </section>
          ) : (
            <section className="home-sheet">
              <p className="ui-kicker">Coming Up</p>
              <p className="ui-section-copy">Generate your plan to see upcoming blocks.</p>
            </section>
          )}

          <section className="home-sheet">
            <p className="ui-kicker">Supporting links</p>
            <div className="supporting-links">
              <Link href="/tasks">Tasks</Link>
              <Link href="/calendar">Calendar</Link>
              <Link href="/courses">Courses</Link>
              {dueSoon[0] ? <Link href={dueSoon[0].href}>Most urgent due item</Link> : null}
              {courseSnapshots[0] ? <Link href={courseSnapshots[0].href}>Top course workspace</Link> : null}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function buildDemoScheduleBlocks(): ScheduleBlock[] {
  const now = new Date()
  const block = (offsetMinutes: number, durationMinutes: number) => {
    const start = new Date(now.getTime() + offsetMinutes * 60000)
    const end = new Date(start.getTime() + durationMinutes * 60000)
    return { startAt: start.toISOString(), endAt: end.toISOString() }
  }

  const missed = block(-180, 45)
  const completed = block(-90, 35)
  const current = block(-10, 55)
  const next = block(55, 45)
  const upcomingOne = block(110, 40)
  const upcomingTwo = block(160, 50)

  return [
    { id: 'demo-missed', title: 'Catch up on missed reviewer', context: 'English 102', urgencyNote: 'Overdue by 2h · professor follow-up tomorrow', ...missed, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-completed', title: 'Read Canvas announcement', context: 'Student Success Seminar', urgencyNote: 'Done this morning', ...completed, status: 'completed', sourceTable: 'module_resources' },
    { id: 'demo-current', title: 'Review Web App Development module', context: 'CIS 310', urgencyNote: 'Due tonight 11:59 PM', ...current, status: 'opened', sourceTable: 'modules' },
    { id: 'demo-next', title: 'Draft activity answer', context: 'CIS 310', urgencyNote: 'Deadline basis: due in 5h', ...next, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-upcoming-one', title: 'Quiz prep: JavaScript basics', context: 'CIS 302', urgencyNote: 'Prep target: quiz tomorrow', ...upcomingOne, status: 'scheduled', sourceTable: 'task_items' },
    { id: 'demo-upcoming-two', title: 'Finish database assignment', context: 'DBMS 201', urgencyNote: 'Est. 50 min from prior workload', ...upcomingTwo, status: 'skipped', sourceTable: 'task_items' },
  ]
}

function CompactClock({ currentBlock, comingUp }: { currentBlock: ScheduleBlock | null; comingUp: ScheduleBlock[] }) {
  const arcItems = [currentBlock, ...comingUp].filter(Boolean).slice(0, 4) as ScheduleBlock[]
  if (!arcItems.length) {
    return <p className="ui-section-copy compact-clock-empty">Your upcoming schedule will appear here.</p>
  }

  return (
    <div className="compact-clock-ring" role="img" aria-label="Schedule ring preview">
      {arcItems.map((block, index) => (
        <div key={block.id} className="compact-clock-segment" style={{ '--segment-order': index } as CSSProperties}>
          <span>{formatTimeRange(block.startAt, block.endAt)}</span>
          <strong>{block.title}</strong>
        </div>
      ))}
    </div>
  )
}

function BlockCard({ block, onStatus, onReschedule, isUrgent = false }: { block: ScheduleBlock; onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void; onReschedule: (id: string, startAt: string, endAt: string) => void; isUrgent?: boolean }) {
  return (
    <article className={`schedule-row${isUrgent ? ' schedule-row-urgent' : ''}`}>
      <p className="schedule-time">{formatTimeRange(block.startAt, block.endAt)} · {getRemainingLabel(block.endAt)}</p>
      <h3>{block.title}</h3>
      {block.context ? <p className="schedule-context">{block.context}</p> : null}
      {block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}
      <p className="schedule-meta-note">{getConfidenceLabel(block.sourceTable)}</p>
      <div className="schedule-actions">
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start block</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete block</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip block</button>
        <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Reschedule</button>
      </div>
    </article>
  )
}

function BlockRow({ block, onStatus, compact = false }: { block: ScheduleBlock; onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void; compact?: boolean }) {
  return (
    <article className={`schedule-row schedule-row-compact${compact ? ' schedule-row-toned' : ''}`}>
      <p className="schedule-time">{formatTimeRange(block.startAt, block.endAt)}</p>
      <p className="schedule-title-inline"><span className="priority-dot" aria-hidden="true" />{block.title}</p>
      {block.context ? <p className="schedule-context">{block.context}</p> : null}
      {block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}
      <p className="schedule-meta-note">{getConfidenceLabel(block.sourceTable)}</p>
      <div className="schedule-actions">
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>
      </div>
    </article>
  )
}

function getConfidenceLabel(source: ScheduleBlock['sourceTable']) {
  if (source === 'module_resources') return 'Estimated from content length'
  if (source === 'modules') return 'Based on deadline urgency'
  return 'Estimated from workload and urgency'
}

function getRemainingLabel(endAt: string) {
  const end = new Date(endAt)
  const now = new Date()
  const remainingMinutes = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60000))
  if (remainingMinutes <= 0) return 'Ends now'
  if (remainingMinutes < MIN_MEANINGFUL_MINUTES) return `${remainingMinutes} min left`
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (!hours) return `${minutes} min left`
  return `${hours}h ${minutes}m left`
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
