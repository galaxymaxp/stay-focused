'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { formatDuration, formatTime, minutesToTime, timeToMinutes } from '@/lib/scheduler/time'
import type { SchedulerBlockType, SchedulerSourceTable } from '@/lib/scheduler/types'

export type ClockScheduleBlock = {
  id: string
  title: string
  startAt: string
  endAt: string
  status: 'scheduled' | 'opened' | 'completed' | 'skipped'
  sourceTable: SchedulerSourceTable
  sourceType?: SchedulerSourceTable | string | null
  blockType?: SchedulerBlockType | null
  subtitle?: string | null
  estimateConfidence?: 'low' | 'medium' | 'high' | null
  estimateReason?: string | null
  context?: string
  urgencyNote?: string
}

type ClockSegment = {
  id: string
  block: ClockScheduleBlock
  path: string
  startLabel: string
  durationLabel: string
  sourceLabel: string
}

type DragMode = 'window' | 'start' | 'end'

type DragState = {
  mode: DragMode
  pointerMinutes: number
  startMinutes: number
  endMinutes: number
}

const CENTER = 160
const VIEWBOX_SIZE = 320
const OUTER_RADIUS = 136
const INNER_RADIUS = 96
const SNAP_MINUTES = 15
const MIN_WINDOW_MINUTES = 15
const MINUTES_PER_DAY = 24 * 60

export function InteractivePlannerClock({
  availableStart,
  availableEnd,
  currentBlock,
  scheduleBlocks,
  selectedBlockId,
  onWindowChange,
  onSelectBlock,
}: {
  availableStart: string
  availableEnd: string
  currentBlock: ClockScheduleBlock | null
  scheduleBlocks: ClockScheduleBlock[]
  selectedBlockId: string | null
  onWindowChange: (start: string, end: string) => void
  onSelectBlock: (blockId: string) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null)
  const [now, setNow] = useState<Date | null>(null)

  const startMinutes = timeToMinutes(availableStart)
  const rawEndMinutes = timeToMinutes(availableEnd)
  const endMinutes = normalizeClockEnd(startMinutes, rawEndMinutes)
  const freeArcPath = Number.isFinite(startMinutes) && Number.isFinite(endMinutes)
    ? buildArcPath(startMinutes, endMinutes, OUTER_RADIUS)
    : null
  const startHandle = Number.isFinite(startMinutes) ? polarToCartesian(CENTER, CENTER, OUTER_RADIUS, minutesToClockDegrees(startMinutes)) : null
  const endHandle = Number.isFinite(endMinutes) ? polarToCartesian(CENTER, CENTER, OUTER_RADIUS, minutesToClockDegrees(endMinutes)) : null

  const segments = useMemo(() => buildClockSegments(scheduleBlocks), [scheduleBlocks])
  const activeTooltipSegment = segments.find((segment) => segment.id === hoveredSegmentId) ?? null
  const handAngles = now ? getClockHandAngles(now) : null

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => setNow(new Date()))
    const interval = window.setInterval(() => setNow(new Date()), 1000)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearInterval(interval)
    }
  }, [])

  function beginDrag(mode: DragMode, event: PointerEvent<SVGElement>) {
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return

    const pointerMinutes = getPointerMinutes(event)
    if (!Number.isFinite(pointerMinutes)) return

    dragRef.current = { mode, pointerMinutes, startMinutes, endMinutes }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function updateDrag(event: PointerEvent<SVGElement>) {
    const drag = dragRef.current
    if (!drag) return

    const pointerMinutes = getPointerMinutes(event)
    if (!Number.isFinite(pointerMinutes)) return

    if (drag.mode === 'start') {
      const nextStart = snapToInterval(minutesFromClockHalf(pointerMinutes, drag.startMinutes), SNAP_MINUTES)
      commitWindow(Math.min(nextStart, drag.endMinutes - MIN_WINDOW_MINUTES), drag.endMinutes)
      return
    }

    if (drag.mode === 'end') {
      const nextEnd = snapToInterval(minutesFromClockHalf(pointerMinutes, drag.endMinutes), SNAP_MINUTES)
      commitWindow(drag.startMinutes, Math.max(nextEnd, drag.startMinutes + MIN_WINDOW_MINUTES))
      return
    }

    const delta = shortestClockDelta(pointerMinutes - drag.pointerMinutes)
    const snappedDelta = snapToInterval(delta, SNAP_MINUTES)
    const duration = drag.endMinutes - drag.startMinutes
    const nextStart = normalizeMinutes(drag.startMinutes + snappedDelta)
    commitWindow(nextStart, nextStart + duration)
  }

  function endDrag(event: PointerEvent<SVGElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function getPointerMinutes(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current
    if (!svg) return Number.NaN

    const rect = svg.getBoundingClientRect()
    const scale = VIEWBOX_SIZE / rect.width
    const x = (event.clientX - rect.left) * scale
    const y = (event.clientY - rect.top) * scale
    const angle = Math.atan2(y - CENTER, x - CENTER) * 180 / Math.PI + 90
    const normalized = (angle + 360) % 360

    return (normalized / 360) * 720
  }

  function commitWindow(start: number, end: number) {
    const nextStart = normalizeMinutes(clamp(snapToInterval(start, SNAP_MINUTES), 0, MINUTES_PER_DAY - SNAP_MINUTES))
    const snappedEnd = snapToInterval(end, SNAP_MINUTES)
    const nextEnd = Math.max(snappedEnd, start + MIN_WINDOW_MINUTES)
    const duration = Math.min(MINUTES_PER_DAY, nextEnd - start)
    onWindowChange(minutesToTime(nextStart), minutesToTime(nextStart + duration))
  }

  function nudgeWindow(mode: DragMode, event: KeyboardEvent<SVGElement>) {
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) return
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return

    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1
    const delta = direction * SNAP_MINUTES

    if (mode === 'start') {
      commitWindow(Math.min(startMinutes + delta, endMinutes - MIN_WINDOW_MINUTES), endMinutes)
      return
    }

    if (mode === 'end') {
      commitWindow(startMinutes, Math.max(endMinutes + delta, startMinutes + MIN_WINDOW_MINUTES))
      return
    }

    const duration = endMinutes - startMinutes
    const nextStart = normalizeMinutes(startMinutes + delta)
    commitWindow(nextStart, nextStart + duration)
  }

  return (
    <div className="planner-clock-face">
      <svg
        ref={svgRef}
        className="planner-clock-svg"
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        role="img"
        aria-label="Analog clock. Outer ring adjusts free time. Inner segments show scheduled study blocks."
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <circle className="clock-ring-track outer" cx={CENTER} cy={CENTER} r={OUTER_RADIUS} />
        <circle className="clock-ring-track inner" cx={CENTER} cy={CENTER} r={INNER_RADIUS} />

        {Array.from({ length: 60 }, (_, index) => {
          const major = index % 5 === 0
          const outer = polarToCartesian(CENTER, CENTER, major ? 120 : 126, index * 6)
          const inner = polarToCartesian(CENTER, CENTER, major ? 112 : 121, index * 6)
          return (
            <line
              key={index}
              className={major ? 'clock-tick major' : 'clock-tick'}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
            />
          )
        })}

        {Array.from({ length: 12 }, (_, index) => {
          const number = index + 1
          const point = polarToCartesian(CENTER, CENTER, 74, number * 30)
          return (
            <text key={number} className="clock-number" x={point.x} y={point.y}>
              {number}
            </text>
          )
        })}

        {freeArcPath ? (
          <path
            className="clock-ring-arc free interactive"
            d={freeArcPath}
            role="slider"
            tabIndex={0}
            aria-label={`Free time window ${formatTime(availableStart)} to ${formatTime(availableEnd)}. Drag to move the window.`}
            aria-valuetext={`${formatTime(availableStart)} to ${formatTime(availableEnd)}`}
            onPointerDown={(event) => beginDrag('window', event)}
            onKeyDown={(event) => nudgeWindow('window', event)}
          />
        ) : null}

        {segments.map((segment) => {
          const isSelected = selectedBlockId === segment.id
          const isCurrent = currentBlock?.id === segment.id

          return (
            <path
              key={segment.id}
              className={`clock-ring-arc plan interactive${isSelected ? ' is-selected' : ''}${isCurrent ? ' is-current' : ''}`}
              d={segment.path}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${segment.block.title}. ${segment.sourceLabel}. ${segment.startLabel}. ${segment.durationLabel}.`}
              onClick={() => onSelectBlock(segment.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectBlock(segment.id)
                }
              }}
              onFocus={() => setHoveredSegmentId(segment.id)}
              onBlur={() => setHoveredSegmentId(null)}
              onMouseEnter={() => setHoveredSegmentId(segment.id)}
              onMouseLeave={() => setHoveredSegmentId(null)}
            />
          )
        })}

        {startHandle ? (
          <circle
            className="clock-window-handle"
            cx={startHandle.x}
            cy={startHandle.y}
            r="8"
            role="slider"
            tabIndex={0}
            aria-label={`Free time start ${formatTime(availableStart)}. Drag to adjust.`}
            aria-valuetext={formatTime(availableStart)}
            onPointerDown={(event) => beginDrag('start', event)}
            onKeyDown={(event) => nudgeWindow('start', event)}
          />
        ) : null}
        {endHandle ? (
          <circle
            className="clock-window-handle"
            cx={endHandle.x}
            cy={endHandle.y}
            r="8"
            role="slider"
            tabIndex={0}
            aria-label={`Free time end ${formatTime(availableEnd)}. Drag to adjust.`}
            aria-valuetext={formatTime(availableEnd)}
            onPointerDown={(event) => beginDrag('end', event)}
            onKeyDown={(event) => nudgeWindow('end', event)}
          />
        ) : null}

        {handAngles ? (
          <>
            <line className="clock-hand hour" x1={CENTER} y1={CENTER} x2={handAngles.hour.x} y2={handAngles.hour.y} />
            <line className="clock-hand minute" x1={CENTER} y1={CENTER} x2={handAngles.minute.x} y2={handAngles.minute.y} />
            <line className="clock-hand second" x1={CENTER} y1={CENTER + 12} x2={handAngles.second.x} y2={handAngles.second.y} />
            <circle className="clock-center-dot" cx={CENTER} cy={CENTER} r="6" />
          </>
        ) : null}
      </svg>

      <div className="clock-status-stack">
        <div className="clock-free-window">Free: {formatTime(availableStart)} - {formatTime(availableEnd)}</div>
        {currentBlock ? <div className="clock-now-chip">NOW - {formatTimeRange(currentBlock.startAt, currentBlock.endAt)}</div> : null}
      </div>
      {activeTooltipSegment ? (
        <div className="clock-segment-tooltip" role="status">
          <strong>{activeTooltipSegment.block.title}</strong>
          <span>{activeTooltipSegment.sourceLabel} - {activeTooltipSegment.startLabel} - {activeTooltipSegment.durationLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

function buildClockSegments(blocks: ClockScheduleBlock[]): ClockSegment[] {
  return blocks
    .map((block) => {
      const start = new Date(block.startAt)
      const end = new Date(block.endAt)
      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const rawEndMinutes = end.getHours() * 60 + end.getMinutes()
      const endMinutes = normalizeClockEnd(startMinutes, rawEndMinutes)
      const path = buildArcPath(startMinutes + 1, Math.max(startMinutes + 2, endMinutes - 1), INNER_RADIUS)

      return path ? {
        id: block.id,
        block,
        path,
        startLabel: formatTimeRange(block.startAt, block.endAt),
        durationLabel: formatBlockDuration(block),
        sourceLabel: getSourceTypeLabel(block.sourceTable),
      } : null
    })
    .filter((segment): segment is ClockSegment => Boolean(segment))
}

function buildArcPath(startMinutes: number, endMinutes: number, radius: number) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) return null

  const start = polarToCartesian(CENTER, CENTER, radius, minutesToClockDegrees(startMinutes))
  const end = polarToCartesian(CENTER, CENTER, radius, minutesToClockDegrees(endMinutes))
  const largeArcFlag = endMinutes - startMinutes > 360 ? 1 : 0

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleDegrees: number) {
  const angleRadians = (angleDegrees - 90) * Math.PI / 180

  return {
    x: centerX + radius * Math.cos(angleRadians),
    y: centerY + radius * Math.sin(angleRadians),
  }
}

function minutesToClockDegrees(minutes: number) {
  return ((minutes % 720) / 720) * 360
}

function minutesFromClockHalf(clockMinutes: number, anchorMinutes: number) {
  const anchorHalf = Math.floor(anchorMinutes / 720) * 720
  const candidates = [clockMinutes + anchorHalf - 720, clockMinutes + anchorHalf, clockMinutes + anchorHalf + 720]

  return candidates.reduce((closest, candidate) => (
    Math.abs(candidate - anchorMinutes) < Math.abs(closest - anchorMinutes) ? candidate : closest
  ), candidates[0])
}

function shortestClockDelta(delta: number) {
  if (delta > 360) return delta - 720
  if (delta < -360) return delta + 720
  return delta
}

function snapToInterval(minutes: number, interval: number) {
  return Math.round(minutes / interval) * interval
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeClockEnd(startMinutes: number, endMinutes: number) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return Number.NaN
  return endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes
}

function normalizeMinutes(minutes: number) {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

function getClockHandAngles(date: Date) {
  const hours = date.getHours() % 12
  const minutes = date.getMinutes()
  const seconds = date.getSeconds()
  const secondAngle = seconds * 6
  const minuteAngle = minutes * 6 + seconds * 0.1
  const hourAngle = hours * 30 + minutes * 0.5

  return {
    hour: polarToCartesian(CENTER, CENTER, 42, hourAngle),
    minute: polarToCartesian(CENTER, CENTER, 66, minuteAngle),
    second: polarToCartesian(CENTER, CENTER, 76, secondAngle),
  }
}

function getSourceTypeLabel(source: ClockScheduleBlock['sourceTable']) {
  if (source === 'deadlines' || source === 'tasks') return 'Assignment'
  if (source === 'learning_items') return 'Quiz practice'
  if (source === 'module_resources') return 'Resource'
  if (source === 'modules') return 'Module'
  return 'Task'
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function formatBlockDuration(block: ClockScheduleBlock) {
  const minutes = Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000))
  return formatDuration(minutes)
}
