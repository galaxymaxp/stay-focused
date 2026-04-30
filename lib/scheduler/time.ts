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

export function isBlockInsideWindow(block: WindowedBlock, startTime: string, endTime: string) {
  const windowStart = timeToMinutes(startTime)
  const windowEnd = timeToMinutes(endTime)
  const blockStart = dateToLocalMinutes(block.startAt)
  const blockEnd = dateToLocalMinutes(block.endAt)

  if (
    !Number.isFinite(windowStart) ||
    !Number.isFinite(windowEnd) ||
    !Number.isFinite(blockStart) ||
    !Number.isFinite(blockEnd) ||
    windowEnd <= windowStart ||
    blockEnd <= blockStart
  ) {
    return false
  }

  return blockStart >= windowStart && blockEnd <= windowEnd
}

export function timeInputToTodayIso(time: string, now = new Date()) {
  const minutes = timeToMinutes(time)
  if (!Number.isFinite(minutes)) return time

  const date = new Date(now)
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)

  return date.toISOString()
}

function dateToLocalMinutes(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.NaN

  return date.getHours() * 60 + date.getMinutes()
}
