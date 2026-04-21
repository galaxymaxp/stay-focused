import { CalendarView } from '@/components/calendar/CalendarView'

export default function CalendarPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 lg:px-10 lg:py-12">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-sf-text">Calendar</h1>
        <p className="text-sm text-sf-muted mt-1">Deadlines, tasks, and schedule — all in one place</p>
      </div>

      <CalendarView />
    </div>
  )
}
