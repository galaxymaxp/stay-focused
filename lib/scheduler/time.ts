type WindowedBlock = {
  startAt: string
  endAt: string
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/
const MINUTES_PER_DAY = 24 * 60

export function timeToMinutes(time: string) {
  const match = TIME_PATTERN.exec(time)
  if (!match) return Number.NaN

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN

  return hours * 60 + minutes
}

export function minutesToTime(minutes: number) {
  if (!Number.isFinite(minutes)) return '00:00'

  const normalized = ((Math.floor(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalized / 60)
  const remainder = normalized % 60

  return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function formatTime(time: string) {
  const minutes = timeToMinutes(time)
  if (!Number.isFinite(minutes)) return time

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  const hour12 = hours % 12 || 12
  const period = hours >= 12 ? 'PM' : 'AM'

  return `${hour12}:${String(remainder).padStart(2, '0')} ${period}`
}

export function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  if (!hours) return `${remainder}m`
  if (!remainder) return `${hours}h`
  return `${hours}h ${remainder}m`
}

export function getWindowDurationMinutes(startTime: string, endTime: string) {
  const windowStart = timeToMinutes(startTime)
  const windowEnd = timeToMinutes(endTime)

  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return Number.NaN
  return normalizeEndMinutes(windowStart, windowEnd) - windowStart
}

export function isBlockInsideWindow(block: WindowedBlock, startTime: string, endTime: string) {
  const windowStart = timeToMinutes(startTime)
  const rawWindowEnd = timeToMinutes(endTime)
  const windowEnd = normalizeEndMinutes(windowStart, rawWindowEnd)
  const rawBlockStart = dateToLocalMinutes(block.startAt)
  const rawBlockEnd = dateToLocalMinutes(block.endAt)

  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(rawWindowEnd) ||
    !Number.isFinite(rawBlockStart) ||
    !Number.isFinite(rawBlockEnd)
  ) {
    return false
  }

  const windowCrossesMidnight = rawWindowEnd <= windowStart
  const blockStart = windowCrossesMidnight && rawBlockStart < windowStart
    ? rawBlockStart + MINUTES_PER_DAY
    : rawBlockStart
  const blockEndBase = normalizeEndMinutes(rawBlockStart, rawBlockEnd)
  const blockEnd = windowCrossesMidnight && blockEndBase <= windowStart
    ? blockEndBase + MINUTES_PER_DAY
    : blockEndBase

  return blockStart >= windowStart && blockEnd <= windowEnd
}

export function timeInputToTodayIso(time: string, now = new Date()) {
  const minutes = timeToMinutes(time)
  if (!Number.isFinite(minutes)) return time

  const date = new Date(now)
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

  return date.toISOString()
}

export function timeWindowToIsoRange(startTime: string, endTime: string, now = new Date()) {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return { start: startTime, end: endTime }
  }

  const start = new Date(now)
  start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

  const end = new Date(now)
  end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)
  if (endMinutes <= startMinutes) {
    end.setDate(end.getDate() + 1)
  }

  return { start: start.toISOString(), end: end.toISOString() }
}

function dateToLocalMinutes(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.NaN

  return date.getHours() * 60 + date.getMinutes()
}

function normalizeEndMinutes(startMinutes: number, endMinutes: number) {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return Number.NaN
  return endMinutes <= startMinutes ? endMinutes + MINUTES_PER_DAY : endMinutes
}
