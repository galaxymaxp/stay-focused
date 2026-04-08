'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { useState } from 'react'
import { TaskPlanningAnnotationControl, TaskPlanningAnnotationPill } from '@/components/TaskPlanningAnnotationControl'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import type { CalendarItem } from '@/lib/types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_ORDER: CalendarItem['status'][] = ['urgent', 'dueSoon', 'upcoming', 'completed']
const STATUS_STYLES: Record<CalendarItem['status'], { label: string; dot: string; chipBg: string; chipBorder: string; chipText: string }> = {
  urgent: {
    label: 'Urgent',
    dot: 'var(--red)',
    chipBg: 'var(--red-light)',
    chipBorder: 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)',
    chipText: 'var(--red)',
  },
  dueSoon: {
    label: 'Due soon',
    dot: 'var(--amber)',
    chipBg: 'var(--amber-light)',
    chipBorder: 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)',
    chipText: 'var(--amber)',
  },
  upcoming: {
    label: 'Upcoming',
    dot: 'var(--text-muted)',
    chipBg: 'var(--bg-hover)',
    chipBorder: 'var(--border)',
    chipText: 'var(--text-secondary)',
  },
  completed: {
    label: 'Completed',
    dot: 'var(--green)',
    chipBg: 'var(--green-light)',
    chipBorder: '#CBE3D4',
    chipText: 'var(--green)',
  },
}

export function CalendarDashboard({ items, undatedTaskCount }: { items: CalendarItem[]; undatedTaskCount: number }) {
  const today = getLocalDateKey(new Date())
  const initialMonth = startOfMonth(items.find((item) => item.dateKey >= today)?.dateKey ?? today)
  const [visibleMonth, setVisibleMonth] = useState(initialMonth)
  const [selectedDateKey, setSelectedDateKey] = useState(today)

  const itemsByDate = new Map<string, CalendarItem[]>()

  for (const item of items) {
    const existing = itemsByDate.get(item.dateKey) ?? []
    existing.push(item)
    itemsByDate.set(item.dateKey, existing)
  }

  for (const entry of itemsByDate.values()) {
    entry.sort(compareCalendarItems)
  }

  const days = buildMonthGrid(visibleMonth)
  const selectedItems = itemsByDate.get(selectedDateKey) ?? []

  return (
    <section className="page-stack" style={{ gap: '1rem' }}>
      <header className="motion-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Calendar
          </p>
          <h1 style={{ margin: '0.45rem 0 0', fontSize: '32px', lineHeight: 1.08, fontWeight: 650, letterSpacing: '-0.04em', color: 'var(--text-primary)' }}>Your workload, made quieter</h1>
          <p style={{ margin: '0.7rem 0 0', fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '46rem' }}>
            A calm calendar view of synced tasks and deadlines. Pick a day to see what needs your attention without opening the full Canvas clutter.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUS_ORDER.map((status) => (
            <LegendChip key={status} status={status} />
          ))}
        </div>
      </header>

      {undatedTaskCount > 0 && (
        <div className="motion-card motion-delay-1 glass-panel glass-soft ui-empty" style={{
          borderRadius: 'var(--radius-panel)',
          padding: '0.75rem 0.9rem',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}>
          {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'} without a due date remain off the calendar until a date is available.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        <section className="motion-card motion-delay-1 glass-panel glass-strong ui-data-panel" style={{ borderRadius: 'var(--radius-page)', overflow: 'hidden', flex: '2 1 640px', minWidth: '0' }}>
          <div className="ui-data-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.05rem 1rem 0.95rem',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', lineHeight: 1.2, fontWeight: 650, letterSpacing: '-0.02em' }}>{formatMonthLabel(visibleMonth)}</h2>
              <p style={{ margin: '0.3rem 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                {items.length} scheduled item{items.length === 1 ? '' : 's'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <MonthButton onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}>Prev</MonthButton>
              <MonthButton onClick={() => {
                setVisibleMonth(startOfMonth(today))
                setSelectedDateKey(today)
              }}>
                Today
              </MonthButton>
              <MonthButton onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}>Next</MonthButton>
            </div>
          </div>

          <div style={{ padding: '0.85rem', overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(72px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem', minWidth: '560px' }}>
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} style={{ padding: '0.25rem 0.35rem', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  {label}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(72px, 1fr))', gap: '0.5rem', minWidth: '560px' }}>
              {days.map((day) => {
                const dayItems = itemsByDate.get(day.dateKey) ?? []
                const isSelected = day.dateKey === selectedDateKey
                const isToday = day.dateKey === today

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(day.dateKey)
                      if (!day.inCurrentMonth) {
                        setVisibleMonth(startOfMonth(day.dateKey))
                      }
                    }}
                    className="glass-panel ui-interactive-card"
                    aria-pressed={isSelected}
                    data-open={isSelected ? 'true' : 'false'}
                    style={{
                      '--glass-panel-bg': isSelected
                        ? 'color-mix(in srgb, var(--glass-surface-accent) 76%, var(--glass-surface-strong) 24%)'
                        : dayItems.length > 0
                          ? 'var(--glass-surface-strong)'
                          : 'var(--glass-surface)',
                      '--glass-panel-border': isSelected ? 'var(--accent-border)' : 'var(--glass-border)',
                      '--glass-panel-shadow': isSelected ? 'var(--glass-shadow-strong)' : dayItems.length > 0 ? 'var(--glass-shadow)' : 'inset 0 1px 0 rgba(255,255,255,0.02)',
                      '--glass-panel-glow': 'none',
                      minHeight: '108px',
                      borderRadius: 'var(--radius-panel)',
                      padding: '0.55rem',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      opacity: day.inCurrentMonth ? 1 : 0.55,
                    } as CSSProperties}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{
                        width: '1.7rem',
                        height: '1.7rem',
                        borderRadius: '999px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: isToday || isSelected ? 650 : 500,
                        color: isToday ? 'var(--accent-foreground)' : 'var(--text-primary)',
                        background: isToday
                          ? 'color-mix(in srgb, var(--accent) 92%, #ffffff 8%)'
                          : isSelected
                            ? 'color-mix(in srgb, var(--surface-selected) 86%, var(--accent) 14%)'
                            : 'transparent',
                        boxShadow: isToday ? 'var(--highlight-sheen)' : 'none',
                      }}>
                        {day.dayNumber}
                      </span>
                      {dayItems.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dayItems.length}</span>
                      )}
                    </div>

                    <DayMarkerStack items={dayItems} />
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="motion-card motion-delay-2 glass-panel glass-strong ui-data-panel" style={{ borderRadius: 'var(--radius-page)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', flex: '1 1 320px', minWidth: '280px' }}>
          <div style={{ paddingBottom: '0.85rem', borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 88%, transparent)' }}>
            <h2 style={{ margin: 0, fontSize: '20px', lineHeight: 1.2, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {formatSelectedDayLabel(selectedDateKey)}
            </h2>
            <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              {selectedItems.length === 0 ? 'No synced items on this date.' : `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} scheduled`}
            </p>
          </div>

          {selectedItems.length === 0 ? (
            <div className="glass-panel glass-soft ui-empty" style={{
              borderRadius: 'var(--radius-panel)',
              padding: '1rem',
              fontSize: '14px',
            }}>
              This day is clear right now. Pick another date in the month grid to review your workload.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {selectedItems.map((item) => (
                <SelectedItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}

function LegendChip({ status }: { status: CalendarItem['status'] }) {
  const style = STATUS_STYLES[status]

  return (
    <span className="ui-chip" style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.35rem 0.6rem',
      borderRadius: '999px',
      fontSize: '12px',
      border: `1px solid ${style.chipBorder}`,
      background: style.chipBg,
      color: style.chipText,
      fontWeight: 600,
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: style.dot }} />
      {style.label}
    </span>
  )
}

function DayMarkerStack({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) {
    return <div style={{ flex: 1, borderRadius: '10px', background: 'linear-gradient(180deg, color-mix(in srgb, var(--bg) 86%, transparent) 0%, color-mix(in srgb, var(--bg-hover) 60%, transparent) 100%)' }} />
  }

  const counts = STATUS_ORDER
    .map((status) => ({ status, count: items.filter((item) => item.status === status).length }))
    .filter((entry) => entry.count > 0)

  const visible = counts.slice(0, 3)
  const hiddenCount = counts.length - visible.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      {visible.map(({ status, count }) => {
        const style = STATUS_STYLES[status]

        return (
          <span
            key={status}
            className="ui-chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              width: 'fit-content',
              maxWidth: '100%',
              padding: '0.18rem 0.4rem',
              borderRadius: '999px',
              fontSize: '11px',
              border: `1px solid ${style.chipBorder}`,
              background: style.chipBg,
              color: style.chipText,
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: style.dot, flexShrink: 0 }} />
            {count} {style.label.toLowerCase()}
          </span>
        )
      })}
      {hiddenCount > 0 && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+{hiddenCount} more</span>
      )}
    </div>
  )
}

function SelectedItemCard({ item }: { item: CalendarItem }) {
  const isCompleted = item.completionStatus === 'completed'
  const statusStyle = STATUS_STYLES[item.status]

  return (
    <article className="glass-panel" style={{
      '--glass-panel-bg': 'var(--glass-surface-strong)',
      '--glass-panel-border': 'var(--glass-border)',
      '--glass-panel-shadow': item.status === 'urgent' || item.status === 'dueSoon' ? 'var(--glass-shadow-strong)' : 'var(--glass-shadow)',
      '--glass-panel-glow': 'none',
      borderRadius: 'var(--radius-panel)',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    } as CSSProperties}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              fontWeight: 700,
            }}>
              {item.kind}
            </span>
            <span className="ui-chip" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '11px',
              padding: '0.18rem 0.45rem',
              borderRadius: '999px',
              background: statusStyle.chipBg,
              color: statusStyle.chipText,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: statusStyle.dot }} />
              {statusStyle.label}
            </span>
            {item.planningAnnotation !== 'none' && (
              <TaskPlanningAnnotationPill annotation={item.planningAnnotation} />
            )}
          </div>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            lineHeight: 1.35,
            fontWeight: 650,
            color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}>
            {item.title}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start', flexShrink: 0 }}>
          {item.taskItemId && item.moduleId && (
            <TaskStatusToggle
              status={item.completionStatus}
              moduleId={item.moduleId}
              title={item.title}
              taskItemId={item.taskItemId}
            />
          )}
          {item.href && (
            <Link
              href={item.href}
              className={`ui-button ${isCompleted ? 'ui-status-success' : 'ui-button-secondary'}`}
              style={{
                borderRadius: 'var(--radius-tight)',
                padding: '0.4rem 0.6rem',
                fontSize: '12px',
                flexShrink: 0,
                minHeight: '32px',
              }}
            >
              {isCompleted ? 'Reviewed' : 'Open task'}
            </Link>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem', fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Course:</span> {item.courseName}
        </div>
        {item.moduleTitle && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Module:</span> {item.moduleTitle}
          </div>
        )}
        {item.relatedText && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Related:</span> <span style={{ overflowWrap: 'anywhere' }}>{item.relatedText}</span>
          </div>
        )}
        {item.dateTime && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Due:</span> {formatDateTime(item.dateTime)}
          </div>
        )}
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Status:</span> {item.completionStatus}
        </div>
        {item.completionOrigin && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Completion source:</span> {item.completionOrigin === 'canvas' ? 'Canvas' : 'Manual'}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {item.taskItemId && item.moduleId && (
          <TaskPlanningAnnotationControl
            annotation={item.planningAnnotation}
            status={item.completionStatus}
            moduleId={item.moduleId}
            title={item.title}
            taskItemId={item.taskItemId}
          />
        )}
        {item.canvasUrl && (
          <a href={item.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open in Canvas
          </a>
        )}
      </div>
    </article>
  )
}

function MonthButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-panel ui-interactive-card"
      style={{
        '--glass-panel-bg': 'var(--glass-surface-soft)',
        '--glass-panel-border': 'var(--glass-border)',
        '--glass-panel-shadow': 'var(--glass-shadow)',
        color: 'var(--text-primary)',
        borderRadius: 'var(--radius-control)',
        padding: '0.45rem 0.75rem',
        fontSize: '13px',
        cursor: 'pointer',
      } as CSSProperties}
    >
      {children}
    </button>
  )
}

function compareCalendarItems(a: CalendarItem, b: CalendarItem) {
  const statusDiff = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  if (statusDiff !== 0) return statusDiff

  if (a.kind !== b.kind) {
    return a.kind === 'task' ? -1 : 1
  }

  const scoreDiff = b.recommendationScore - a.recommendationScore
  if (scoreDiff !== 0) return scoreDiff

  if (a.dateTime && b.dateTime) {
    return new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime()
  }

  return a.title.localeCompare(b.title)
}

function buildMonthGrid(monthKey: string) {
  const start = new Date(`${monthKey}T00:00:00`)
  const first = new Date(start.getFullYear(), start.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - first.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart)
    current.setDate(gridStart.getDate() + index)

    return {
      dateKey: getLocalDateKey(current),
      dayNumber: current.getDate(),
      inCurrentMonth: current.getMonth() === first.getMonth(),
    }
  })
}

function shiftMonth(monthKey: string, amount: number) {
  const date = new Date(`${monthKey}T00:00:00`)
  return getLocalDateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1))
}

function startOfMonth(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  return getLocalDateKey(new Date(date.getFullYear(), date.getMonth(), 1))
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthLabel(monthKey: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}T00:00:00`))
}

function formatSelectedDayLabel(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateKey}T00:00:00`))
}

function formatDateTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  const includesTime = /T\d{2}:\d{2}/.test(value)

  return new Intl.DateTimeFormat(undefined, includesTime
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric' }
  ).format(date)
}
