'use client'

import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import { updateTaskStatus } from '@/actions/tasks'

export interface CalendarItem {
  id: string
  sourceId: string
  kind: 'task' | 'deadline'
  title: string
  courseName: string
  moduleTitle: string | null
  relatedText: string | null
  dateKey: string
  dateTime: string | null
  status: 'urgent' | 'dueSoon' | 'upcoming' | 'completed'
  completionStatus: 'pending' | 'completed'
  priority: 'high' | 'medium' | 'low' | null
  recommendationScore: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_ORDER: CalendarItem['status'][] = ['urgent', 'dueSoon', 'upcoming', 'completed']
const STATUS_STYLES: Record<CalendarItem['status'], { label: string; dot: string; chipBg: string; chipBorder: string; chipText: string }> = {
  urgent: {
    label: 'Urgent',
    dot: 'var(--red)',
    chipBg: 'var(--red-light)',
    chipBorder: '#F5C5BC',
    chipText: 'var(--red)',
  },
  dueSoon: {
    label: 'Due soon',
    dot: 'var(--amber)',
    chipBg: 'var(--amber-light)',
    chipBorder: '#F0DCBF',
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
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ margin: '0.4rem 0 0', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Calendar-first view of synced tasks and deadlines. Select a day to inspect the full workload.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {STATUS_ORDER.map((status) => (
            <LegendChip key={status} status={status} />
          ))}
        </div>
      </header>

      {undatedTaskCount > 0 && (
        <div style={{
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          borderRadius: '10px',
          padding: '0.75rem 0.9rem',
          fontSize: '13px',
          color: 'var(--text-secondary)',
        }}>
          {undatedTaskCount} task{undatedTaskCount === 1 ? '' : 's'} without a due date remain off the calendar until a date is available.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--bg-card)', overflow: 'hidden', flex: '2 1 640px', minWidth: '0' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderBottom: '1px solid var(--border)',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>{formatMonthLabel(visibleMonth)}</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
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

          <div style={{ padding: '0.75rem', overflowX: 'auto' }}>
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
                    onClick={() => {
                      setSelectedDateKey(day.dateKey)
                      if (!day.inCurrentMonth) {
                        setVisibleMonth(startOfMonth(day.dateKey))
                      }
                    }}
                    style={{
                      minHeight: '108px',
                      borderRadius: '12px',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                      padding: '0.55rem',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      cursor: 'pointer',
                      opacity: day.inCurrentMonth ? 1 : 0.55,
                      boxShadow: isSelected ? '0 0 0 1px var(--accent-shadow)' : 'none',
                    }}
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
                        fontWeight: isToday || isSelected ? 600 : 500,
                        color: isToday ? 'var(--accent-foreground)' : 'var(--text-primary)',
                        background: isToday ? 'var(--accent)' : 'transparent',
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

        <aside style={{ border: '1px solid var(--border)', borderRadius: '16px', background: 'var(--bg-card)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem', flex: '1 1 320px', minWidth: '280px' }}>
          <div style={{ paddingBottom: '0.85rem', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatSelectedDayLabel(selectedDateKey)}
            </h2>
            <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              {selectedItems.length === 0 ? 'No synced items on this date.' : `${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'} scheduled`}
            </p>
          </div>

          {selectedItems.length === 0 ? (
            <div style={{
              borderRadius: '12px',
              border: '1px dashed var(--border-hover)',
              padding: '1rem',
              fontSize: '14px',
              color: 'var(--text-secondary)',
              background: 'var(--bg)',
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
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.4rem',
      padding: '0.35rem 0.6rem',
      borderRadius: '999px',
      fontSize: '12px',
      border: `1px solid ${style.chipBorder}`,
      background: style.chipBg,
      color: style.chipText,
      fontWeight: 500,
    }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: style.dot }} />
      {style.label}
    </span>
  )
}

function DayMarkerStack({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) {
    return <div style={{ flex: 1, borderRadius: '8px', background: 'var(--bg)' }} />
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
  const [isPending, startTransition] = useTransition()
  const isTask = item.kind === 'task'
  const isCompleted = item.completionStatus === 'completed'
  const statusStyle = STATUS_STYLES[item.status]

  function handleToggle() {
    if (!isTask) return

    startTransition(() => updateTaskStatus(item.sourceId, isCompleted ? 'pending' : 'completed'))
  }

  return (
    <article style={{
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '0.9rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.65rem',
      opacity: isPending ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <span style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
              fontWeight: 600,
            }}>
              {item.kind}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '11px',
              padding: '0.18rem 0.45rem',
              borderRadius: '999px',
              border: `1px solid ${statusStyle.chipBorder}`,
              background: statusStyle.chipBg,
              color: statusStyle.chipText,
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: statusStyle.dot }} />
              {statusStyle.label}
            </span>
          </div>
          <h3 style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
            textDecoration: isCompleted ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}>
            {item.title}
          </h3>
        </div>
        {isTask && (
          <button
            onClick={handleToggle}
            disabled={isPending}
            style={{
              borderRadius: '8px',
              border: isCompleted ? '1px solid #CBE3D4' : '1px solid var(--border)',
              background: isCompleted ? 'var(--green-light)' : 'var(--bg)',
              color: isCompleted ? 'var(--green)' : 'var(--text-secondary)',
              padding: '0.4rem 0.6rem',
              fontSize: '12px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {isCompleted ? 'Completed' : 'Mark done'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
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
          <span style={{ color: 'var(--text-muted)' }}>Status:</span> {isTask ? item.completionStatus : 'scheduled'}
        </div>
      </div>
    </article>
  )
}

function MonthButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderRadius: '10px',
        padding: '0.45rem 0.75rem',
        fontSize: '13px',
        cursor: 'pointer',
      }}
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
