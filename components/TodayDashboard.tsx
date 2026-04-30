'use client'

import { useMemo, useState, useTransition, type CSSProperties } from 'react'
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
}

export function TodayDashboard({ scheduledBlocks, dueSoon, courseSnapshots }: {
  scheduledBlocks: ScheduleBlock[]
  dueSoon: HomeDueSoonItem[]
  courseSnapshots: HomeCourseSnapshot[]
}) {
  const [isPending, startTransition] = useTransition()
  const [isGenerating, setIsGenerating] = useState(false)
  const { currentBlock, comingUp, needsAttention } = useMemo(() => {
    const now = new Date()
    const sorted = [...scheduledBlocks].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    const active = sorted.find((block) => block.status === 'opened' || (block.status === 'scheduled' && new Date(block.startAt) <= now && new Date(block.endAt) > now)) ?? null
    const attention = sorted.filter((block) => block.status === 'scheduled' && new Date(block.endAt) <= now)
    const upcoming = sorted.filter((block) => block.status === 'scheduled' && new Date(block.endAt) > now && block.id !== active?.id)
    return { currentBlock: active, comingUp: upcoming.slice(0, 6), needsAttention: attention.slice(0, 4) }
  }, [scheduledBlocks])

  async function handleGenerate() {
    setIsGenerating(true)
    try {
      await generateUserSchedule('08:00', '22:00')
    } finally {
      setIsGenerating(false)
    }
  }

  function updateStatus(id: string, status: 'opened' | 'completed' | 'skipped') {
    startTransition(async () => {
      await updateBlockStatus(id, status)
    })
  }

  function placeholderReschedule(id: string, startAt: string, endAt: string) {
    startTransition(async () => {
      await rescheduleBlock(id, startAt, endAt)
    })
  }

  return (
    <section className="command-center">
      <header className="command-center-header">
        <div>
          <p className="ui-kicker">Today Plan</p>
          <h1 className="ui-page-title">Clock Command Center</h1>
        </div>
        <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={isGenerating || isPending}>
          {isGenerating ? 'Generating…' : 'Generate / Regenerate schedule'}
        </button>
      </header>

      <div className="command-center-layout">
        <section className="clock-shell home-sheet">
          <p className="ui-kicker">Clock</p>
          <CompactClock currentBlock={currentBlock} comingUp={comingUp} />
        </section>

        <div className="command-center-details">
          <section className="home-sheet">
            <p className="ui-kicker">Current / Next Block</p>
            {currentBlock ? <BlockCard block={currentBlock} onStatus={updateStatus} onReschedule={placeholderReschedule} /> : <p className="ui-section-copy">No active block right now. Start your next scheduled block below.</p>}
          </section>

          <section className="home-sheet">
            <p className="ui-kicker">Need Attention</p>
            {needsAttention.length === 0 ? <p className="ui-section-copy">No missed blocks detected.</p> : needsAttention.map((block) => <BlockRow key={block.id} block={block} onStatus={updateStatus} />)}
          </section>

          <section className="home-sheet">
            <p className="ui-kicker">Coming Up</p>
            {comingUp.length === 0 ? <p className="ui-section-copy">Nothing else is queued yet.</p> : comingUp.map((block) => <BlockRow key={block.id} block={block} onStatus={updateStatus} />)}
          </section>

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

function CompactClock({ currentBlock, comingUp }: { currentBlock: ScheduleBlock | null; comingUp: ScheduleBlock[] }) {
  const arcItems = [currentBlock, ...comingUp].filter(Boolean).slice(0, 5) as ScheduleBlock[]
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

function BlockCard({ block, onStatus, onReschedule }: { block: ScheduleBlock; onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void; onReschedule: (id: string, startAt: string, endAt: string) => void }) {
  return (
    <article className="schedule-row">
      <p className="schedule-time">{formatTimeRange(block.startAt, block.endAt)}</p>
      <h3>{block.title}</h3>
      <div className="schedule-actions">
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start block</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete block</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip block</button>
        <button type="button" className="ui-button ui-button-ghost ui-button-xs" onClick={() => onReschedule(block.id, block.startAt, block.endAt)}>Reschedule</button>
      </div>
    </article>
  )
}

function BlockRow({ block, onStatus }: { block: ScheduleBlock; onStatus: (id: string, status: 'opened' | 'completed' | 'skipped') => void }) {
  return (
    <article className="schedule-row schedule-row-compact">
      <p className="schedule-time">{formatTimeRange(block.startAt, block.endAt)}</p>
      <p>{block.title}</p>
      <div className="schedule-actions">
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'opened')}>Start</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'completed')}>Complete</button>
        <button type="button" className="ui-button ui-button-secondary ui-button-xs" onClick={() => onStatus(block.id, 'skipped')}>Skip</button>
      </div>
    </article>
  )
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
