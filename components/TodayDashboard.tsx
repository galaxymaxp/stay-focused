'use client'

import { useMemo, useRef, useState, useTransition, type CSSProperties } from 'react'
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

type ClockStyle = CSSProperties & {
  '--free-arc': string
  '--schedule-arc': string
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
  const currentBlockRef = useRef<HTMLDivElement | null>(null)

  const scheduleForDisplay = useMemo(() => useDemoSchedule ? buildDemoScheduleBlocks() : scheduledBlocks, [scheduledBlocks, useDemoSchedule])
  const visibleSchedule = useMemo(
    () => scheduleForDisplay.filter((block) => isBlockInsideWindow(block, availableStart, availableEnd)),
    [scheduleForDisplay, availableStart, availableEnd],
  )

  const { currentBlock, timelineBlocks, needsAttention, completedCount, totalScheduledCount, hasAnySourceData } = useMemo(() => {
    const now = new Date()
    const sorted = [...visibleSchedule].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const active = sorted.find((block) => block.status === 'opened' || (block.status === 'scheduled' && new Date(block.startAt) <= now && new Date(block.endAt) > now)) ?? null

    const missed = sorted.filter((block) => block.status === 'scheduled' && new Date(block.endAt) <= now)
    const future = sorted.filter((block) => new Date(block.endAt) > now)
    const completedOrSkipped = sorted.filter((block) => block.status === 'completed' || block.status === 'skipped')

    const timelinePool = active
      ? [active, ...future.filter((block) => block.id !== active.id)]
      : [...future]
    const timeline = [...timelinePool.slice(0, 4), ...completedOrSkipped.slice(0, 2)]

    return {
      currentBlock: active,
      timelineBlocks: timeline,
      needsAttention: missed.slice(0, 4),
      completedCount: sorted.filter((block) => block.status === 'completed').length,
      totalScheduledCount: sorted.length,
      hasAnySourceData: dueSoon.length > 0 || courseSnapshots.length > 0,
    }
  }, [visibleSchedule, dueSoon.length, courseSnapshots.length])

  const hasSchedule = totalScheduledCount > 0
  const completedAll = hasSchedule && completedCount === totalScheduledCount
  const showDemoControl = SHOW_DEMO_PREVIEW
  const availableMinutes = getAvailableMinutes(availableStart, availableEnd)
  const availableLabel = availableMinutes > 0 ? formatDuration(availableMinutes) : 'Invalid window'

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await generateUserSchedule(timeInputToTodayIso(availableStart), timeInputToTodayIso(availableEnd))
      setUseDemoSchedule(false)
      requestAnimationFrame(() => currentBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
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
          <PlannerClock availableStart={availableStart} availableEnd={availableEnd} currentBlock={currentBlock} scheduleBlocks={visibleSchedule} />

          <section className="planner-controls">
            <div className="command-time-grid">
              <label className="command-time-field"><span>Start</span><input type="time" value={availableStart} onChange={(event) => setAvailableStart(event.target.value)} /></label>
              <label className="command-time-field"><span>End</span><input type="time" value={availableEnd} onChange={(event) => setAvailableEnd(event.target.value)} /></label>
            </div>
            <p className="ui-section-copy">Available duration: {availableLabel}</p>
            <div className="schedule-actions">
              <button type="button" className="ui-button ui-button-secondary" onClick={() => currentBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Adjust time</button>
              <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending || availableMinutes <= 0}>
                {isGenerating ? 'Building your plan…' : hasSchedule ? 'Regenerate Today Plan' : 'Generate Today Plan'}
              </button>
              {showDemoControl ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => setUseDemoSchedule((v) => !v)}>{useDemoSchedule ? 'Use real schedule' : 'Preview demo schedule'}</button> : null}
            </div>
            {SHOW_DEMO_PREVIEW ? <p className="ui-section-copy">For Vercel previews, set <code>NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE=true</code> to force this demo control.</p> : null}
          </section>
        </div>

        <div className="planner-timeline-column" ref={currentBlockRef}>
          {timelineBlocks.length > 0 ? (
            <section className="planner-timeline">
              {timelineBlocks.map((block) => <TimelineRow key={block.id} block={block} nowId={currentBlock?.id ?? null} onStatus={updateStatus} onReschedule={placeholderReschedule} />)}
            </section>
          ) : (
            <section className="planner-empty-state">
              <h2>No blocks yet</h2>
              <p className="ui-section-copy">Set your time, then generate your plan.</p>
            </section>
          )}

          <section className="home-sheet planner-attention-panel">
            <p className="ui-kicker">Need Attention</p>
            {needsAttention.length > 0 ? needsAttention.map((block) => <TimelineRow key={block.id} block={block} nowId={null} onStatus={updateStatus} compact />) : <p className="ui-section-copy">Nothing needs attention right now.</p>}
          </section>
        </div>
      </section>

      {!hasAnySourceData ? <section className="home-sheet command-empty-state"><h2>No tasks found. Sync with Canvas to start planning.</h2><div className="schedule-actions"><Link href="/settings" className="ui-button ui-button-secondary">Go to Settings / Sync</Link></div></section> : null}

      {!hasSchedule ? <section className="home-sheet command-empty-state command-start-here"><p className="ui-kicker">Start here</p><h2>No plan yet — pick something to start.</h2><div className="schedule-actions"><button type="button" className="ui-button ui-button-secondary ui-button-xs">Review latest module</button><button type="button" className="ui-button ui-button-secondary ui-button-xs">Work on nearest deadline</button><button type="button" className="ui-button ui-button-secondary ui-button-xs">Continue last session</button></div></section> : null}

      {hasSchedule && completedAll ? <section className="home-sheet command-empty-state command-empty-state-success"><h2>You’ve completed all scheduled work</h2><p className="ui-section-copy">Take a break, then regenerate when you’re ready.</p></section> : null}
    </section>
  )
}

function PlannerClock({ availableStart, availableEnd, currentBlock, scheduleBlocks }: { availableStart: string, availableEnd: string, currentBlock: ScheduleBlock | null, scheduleBlocks: ScheduleBlock[] }) {
  const freeArc = buildFreeArc(availableStart, availableEnd)
  const scheduleArc = buildScheduleArc(scheduleBlocks)

  return <div className="planner-clock-face" role="img" aria-label="Planner clock visual" style={{ '--free-arc': freeArc, '--schedule-arc': scheduleArc } as ClockStyle}><div className="clock-free-arc" /><div className="clock-schedule-ring" /><span className="clock-marker m12">12</span><span className="clock-marker m3">3</span><span className="clock-marker m6">6</span><span className="clock-marker m9">9</span><div className="clock-core" /><div className="clock-free-window">Free: {formatTime(availableStart)} – {formatTime(availableEnd)}</div>{currentBlock ? <div className="clock-now-chip">NOW · {formatTimeRange(currentBlock.startAt, currentBlock.endAt)}</div> : null}</div>
}

function TimelineRow({ block, nowId, onStatus, onReschedule, compact = false }: { block: ScheduleBlock; nowId: string | null; onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void; onReschedule?: (id: string, startAt: string, endAt: string) => void; compact?: boolean }) {
  const isNow = nowId === block.id
  const stateClass = block.status === 'completed' ? ' is-completed' : block.status === 'skipped' ? ' is-skipped' : (!isNow && block.status === 'scheduled' && new Date(block.endAt) <= new Date()) ? ' is-missed' : ''
  return <article className={`planner-timeline-row${compact ? ' compact' : ''}`}><p className="planner-time-label">{formatTimeRange(block.startAt, block.endAt)}</p><div className={`planner-block-card${isNow ? ' is-now' : ''}${stateClass}`}><div className="planner-block-header"><h3>{block.title}</h3>{isNow ? <span className="now-pill">NOW</span> : null}</div>{block.context ? <p className="schedule-context">{block.context}</p> : null}{block.urgencyNote ? <p className="schedule-urgency">{block.urgencyNote}</p> : null}<p className="schedule-meta-note">{getConfidenceLabel(block.sourceTable)}</p><div className="schedule-actions"><button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start</button><button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete</button><button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>{onReschedule ? <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Later</button> : null}</div></div></article>
}

function buildDemoScheduleBlocks(): ScheduleBlock[] { const now = new Date(); const block = (o:number,d:number)=>{const s=new Date(now.getTime()+o*60000);const e=new Date(s.getTime()+d*60000);return {startAt:s.toISOString(),endAt:e.toISOString()}}; const missed=block(-180,45), completed=block(-90,35), current=block(-10,55), next=block(55,45), upcomingOne=block(110,40), upcomingTwo=block(160,50); return [{ id:'demo-missed', title:'Catch up on missed reviewer', context:'English 102', urgencyNote:'Overdue by 2h · professor follow-up tomorrow', ...missed, status:'scheduled', sourceTable:'task_items' },{ id:'demo-completed', title:'Read Canvas announcement', context:'Student Success Seminar', urgencyNote:'Done this morning', ...completed, status:'completed', sourceTable:'module_resources' },{ id:'demo-current', title:'Review Web App Development module', context:'CIS 310', urgencyNote:'Due tonight 11:59 PM', ...current, status:'opened', sourceTable:'modules' },{ id:'demo-next', title:'Draft activity answer', context:'CIS 310', urgencyNote:'Deadline basis: due in 5h', ...next, status:'scheduled', sourceTable:'task_items' },{ id:'demo-upcoming-one', title:'Quiz prep: JavaScript basics', context:'CIS 302', urgencyNote:'Prep target: quiz tomorrow', ...upcomingOne, status:'scheduled', sourceTable:'task_items' },{ id:'demo-upcoming-two', title:'Finish database assignment', context:'DBMS 201', urgencyNote:'Est. 50 min from prior workload', ...upcomingTwo, status:'skipped', sourceTable:'task_items' }] }

const getAvailableMinutes = (start: string, end: string) => timeToMinutes(end) - timeToMinutes(start)
function getConfidenceLabel(source: ScheduleBlock['sourceTable']) { if (source === 'module_resources') return 'Estimated from content length'; if (source === 'modules') return 'Based on deadline urgency'; return 'Estimated from workload and urgency' }
function formatTimeRange(startAt: string, endAt: string) { const start = new Date(startAt); const end = new Date(endAt); return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` }
function buildFreeArc(start: string, end: string) {
  const startMinutes = timeToMinutes(start)
  const endMinutes = timeToMinutes(end)
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return 'transparent 0deg 360deg'

  return `transparent 0deg ${minutesToDegrees(startMinutes)}deg, var(--amber) ${minutesToDegrees(startMinutes)}deg ${minutesToDegrees(endMinutes)}deg, transparent ${minutesToDegrees(endMinutes)}deg 360deg`
}

function buildScheduleArc(blocks: ScheduleBlock[]) {
  if (!blocks.length) return 'transparent 0deg 360deg'

  const segments = blocks
    .map((block) => {
      const start = new Date(block.startAt)
      const end = new Date(block.endAt)

      return {
        start: minutesToDegrees(start.getHours() * 60 + start.getMinutes()),
        end: minutesToDegrees(end.getHours() * 60 + end.getMinutes()),
      }
    })
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start)

  if (!segments.length) return 'transparent 0deg 360deg'

  const stops: string[] = []
  let cursor = 0

  for (const segment of segments) {
    if (segment.start > cursor) stops.push(`transparent ${cursor}deg ${segment.start}deg`)
    stops.push(`var(--accent) ${segment.start}deg ${segment.end}deg`)
    cursor = segment.end
  }

  if (cursor < 360) stops.push(`transparent ${cursor}deg 360deg`)

  return stops.join(', ')
}

function minutesToDegrees(minutes: number) {
  return (minutes / 1440) * 360
}
