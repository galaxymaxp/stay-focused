export type MovableBlock = {
  id: string
  startAt: string
  endAt: string
  status: string
}

export type SlotResult =
  | { moved: true; newStartAt: string; newEndAt: string }
  | { moved: false; reason: string }

/**
 * Find the next available time slot after the given block's current position.
 *
 * - Shifts by at least one block duration or 30 minutes, whichever is larger.
 * - Preserves the block's duration exactly.
 * - Skips past any overlapping active blocks.
 * - Returns { moved: false } if no gap exists before the day boundary.
 */
export function findLaterSlot(
  block: MovableBlock,
  otherBlocks: MovableBlock[],
  options?: { dayEndIso?: string },
): SlotResult {
  if (
    block.status === 'completed' ||
    block.status === 'skipped' ||
    block.status === 'missed'
  ) {
    return { moved: false, reason: 'This block is already finished.' }
  }

  const startMs = new Date(block.startAt).getTime()
  const endMs = new Date(block.endAt).getTime()
  const durationMs = endMs - startMs

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { moved: false, reason: 'Invalid block duration.' }
  }

  // Minimum shift: one block duration or 30 min, whichever is larger
  const minShiftMs = Math.max(durationMs, 30 * 60_000)
  const earliestNewStart = startMs + minShiftMs

  // Day boundary: end of the calendar day containing block.startAt, or caller override
  let dayEndMs: number
  if (options?.dayEndIso) {
    dayEndMs = new Date(options.dayEndIso).getTime()
  } else {
    const dayEnd = new Date(block.startAt)
    dayEnd.setHours(23, 59, 0, 0)
    dayEndMs = dayEnd.getTime()
  }

  // Active competing blocks sorted by start
  const activeOthers = otherBlocks
    .filter(
      (b) =>
        b.id !== block.id &&
        b.status !== 'completed' &&
        b.status !== 'skipped' &&
        b.status !== 'missed',
    )
    .map((b) => ({
      start: new Date(b.startAt).getTime(),
      end: new Date(b.endAt).getTime(),
    }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end) && b.end > b.start)
    .sort((a, b) => a.start - b.start)

  let tryStart = earliestNewStart

  // Up to 48 slides — enough to navigate a fully-packed day
  for (let attempt = 0; attempt < 48; attempt++) {
    const tryEnd = tryStart + durationMs
    if (tryEnd > dayEndMs) break

    const overlap = activeOthers.find(
      (other) => tryStart < other.end && tryEnd > other.start,
    )

    if (!overlap) {
      return {
        moved: true,
        newStartAt: new Date(tryStart).toISOString(),
        newEndAt: new Date(tryEnd).toISOString(),
      }
    }

    // Slide past this block and try again
    tryStart = overlap.end
  }

  return { moved: false, reason: 'No later slot is available in this plan.' }
}
