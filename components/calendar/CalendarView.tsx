'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarEvents } from '@/lib/mock-data'
import { cn } from '@/lib/cn'

type View = 'month' | 'week'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function getWeekDates(year: number, month: number, startDay: number) {
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(year, month, startDay + i)
    dates.push(d)
  }
  return dates
}

function eventsForDate(year: number, month: number, day: number) {
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return calendarEvents.filter((e) => e.date === dateStr)
}

function MonthView({ year, month }: { year: number; month: number }) {
  const grid = getMonthGrid(year, month)
  const today = '2026-04-21'
  const todayDay = 21

  return (
    <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-sf-border">
        {DAYS.map((d) => (
          <div key={d} className="py-3 text-center text-xs font-semibold text-sf-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const events = day ? eventsForDate(year, month, day) : []
          const isToday = day === todayDay && month === 3 && year === 2026

          return (
            <div
              key={i}
              className={cn(
                'min-h-[100px] p-2 border-b border-r border-sf-border-muted last:border-r-0',
                (i + 1) % 7 === 0 && 'border-r-0',
                !day && 'bg-sf-surface-2',
              )}
            >
              {day && (
                <>
                  <div className="flex justify-end mb-1">
                    <span
                      className={cn(
                        'h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium',
                        isToday ? 'bg-sf-accent text-white' : 'text-sf-text',
                      )}
                    >
                      {day}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {events.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium truncate text-white"
                        style={{ backgroundColor: event.color }}
                        title={`${event.title} – ${event.course}`}
                      >
                        {event.title}
                      </div>
                    ))}
                    {events.length > 3 && (
                      <p className="text-[10px] text-sf-muted pl-1">+{events.length - 3} more</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ year, month }: { year: number; month: number }) {
  const weekStart = 21
  const dates = getWeekDates(year, month, weekStart)

  return (
    <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
      <div className="grid grid-cols-7 border-b border-sf-border">
        {dates.map((d, i) => {
          const isToday = d.getDate() === 21 && d.getMonth() === 3
          return (
            <div key={i} className={cn('py-4 px-3 border-r border-sf-border-muted last:border-r-0', isToday && 'bg-sf-accent-light')}>
              <p className="text-xs text-sf-muted">{DAYS[d.getDay()]}</p>
              <p className={cn('text-lg font-semibold mt-0.5', isToday ? 'text-sf-accent' : 'text-sf-text')}>
                {d.getDate()}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-7 min-h-[320px]">
        {dates.map((d, i) => {
          const events = eventsForDate(d.getFullYear(), d.getMonth(), d.getDate())
          const isToday = d.getDate() === 21 && d.getMonth() === 3

          return (
            <div
              key={i}
              className={cn(
                'p-3 border-r border-sf-border-muted last:border-r-0 space-y-2',
                isToday && 'bg-sf-accent-light/30',
              )}
            >
              {events.map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg px-2 py-2 text-xs font-medium text-white"
                  style={{ backgroundColor: event.color }}
                >
                  <p className="truncate">{event.title}</p>
                  <p className="text-[10px] opacity-80 truncate mt-0.5">{event.course}</p>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function CalendarView() {
  const [view, setView] = useState<View>('month')
  const [year] = useState(2026)
  const [month] = useState(3) // April (0-indexed)

  const upcomingEvents = calendarEvents
    .filter((e) => e.date >= '2026-04-21')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <div className="flex gap-6 items-start">
      {/* Main calendar */}
      <div className="flex-1 min-w-0">
        {/* Controls */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-sf-border text-sf-muted hover:bg-sf-surface hover:text-sf-text transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="text-base font-semibold text-sf-text">
              {MONTHS[month]} {year}
            </h2>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg border border-sf-border text-sf-muted hover:bg-sf-surface hover:text-sf-text transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex rounded-xl border border-sf-border overflow-hidden">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium capitalize transition-colors',
                  view === v ? 'bg-sf-accent text-white' : 'bg-sf-surface text-sf-muted hover:bg-sf-surface-2',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {view === 'month' ? (
          <MonthView year={year} month={month} />
        ) : (
          <WeekView year={year} month={month} />
        )}
      </div>

      {/* Sidebar: upcoming */}
      <div className="w-64 flex-shrink-0 hidden lg:block">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-3">Upcoming</h3>
        <div className="space-y-2">
          {upcomingEvents.map((event) => (
            <div key={event.id} className="flex items-start gap-3 rounded-xl border border-sf-border bg-sf-surface p-3">
              <div className="h-2 w-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: event.color }} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-sf-text truncate">{event.title}</p>
                <p className="text-[10px] text-sf-muted mt-0.5">{event.course}</p>
                <p className="text-[10px] text-sf-subtle mt-0.5">
                  {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
