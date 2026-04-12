'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type CanvasSyncPhase =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'fetchingCourses'
  | 'fetchingModules'
  | 'merging'
  | 'saving'
  | 'done'
  | 'error'

export interface SyncActivitySnapshot {
  label: string
  tone: 'success' | 'neutral' | 'warning'
}

interface SyncRunHandle {
  minimumTimeline: Promise<void>
  runId: number
}

const PHASE_SEQUENCE: Array<{ delay: number; phase: Extract<CanvasSyncPhase, 'connecting' | 'fetchingCourses' | 'fetchingModules' | 'merging' | 'saving'>; progressValue: number }> = [
  { delay: 150, phase: 'connecting', progressValue: 0.18 },
  { delay: 380, phase: 'fetchingCourses', progressValue: 0.34 },
  { delay: 680, phase: 'fetchingModules', progressValue: 0.56 },
  { delay: 980, phase: 'merging', progressValue: 0.74 },
  { delay: 1320, phase: 'saving', progressValue: 0.88 },
]

const MINIMUM_SUCCESS_TIMELINE_MS = 1320

export function useCanvasSyncStatus(initialLastSync: SyncActivitySnapshot | null) {
  const [phase, setPhase] = useState<CanvasSyncPhase>('idle')
  const [selectedCourseCount, setSelectedCourseCount] = useState(0)
  const [progressValue, setProgressValue] = useState(0)
  const [lastSyncOverride, setLastSyncOverride] = useState<SyncActivitySnapshot | null>(null)
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const runIdRef = useRef(0)
  const pendingTimeoutsRef = useRef<number[]>([])
  const pendingIntervalRef = useRef<number | null>(null)

  const clearPhaseTimers = useCallback(() => {
    for (const timeoutId of pendingTimeoutsRef.current) {
      window.clearTimeout(timeoutId)
    }
    pendingTimeoutsRef.current = []

    if (pendingIntervalRef.current !== null) {
      window.clearInterval(pendingIntervalRef.current)
      pendingIntervalRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPhaseTimers()
    }
  }, [clearPhaseTimers])

  const beginSync = useCallback((courseCount: number): SyncRunHandle => {
    clearPhaseTimers()
    const runId = runIdRef.current + 1
    runIdRef.current = runId

    setSelectedCourseCount(courseCount)
    setOutcomeMessage(null)
    setErrorMessage(null)
    setPhase('starting')
    setProgressValue(0.08)

    for (const step of PHASE_SEQUENCE) {
      const timeoutId = window.setTimeout(() => {
        if (runIdRef.current !== runId) return

        setPhase(step.phase)
        setProgressValue((current) => Math.max(current, step.progressValue))
      }, step.delay)

      pendingTimeoutsRef.current.push(timeoutId)
    }

    pendingIntervalRef.current = window.setInterval(() => {
      if (runIdRef.current !== runId) return

      setProgressValue((current) => current >= 0.92 ? current : Math.min(current + 0.018, 0.92))
    }, 420)

    return {
      runId,
      minimumTimeline: waitForDelay(MINIMUM_SUCCESS_TIMELINE_MS),
    }
  }, [clearPhaseTimers])

  const finishSync = useCallback(async (handle: SyncRunHandle, message: string) => {
    await handle.minimumTimeline
    if (runIdRef.current !== handle.runId) return

    clearPhaseTimers()
    const completedAt = new Date().toLocaleString()
    setPhase('done')
    setProgressValue(1)
    setOutcomeMessage(message)
    setErrorMessage(null)
    setLastSyncOverride({
      label: `Last sync finished on ${completedAt}`,
      tone: 'success',
    })
  }, [clearPhaseTimers])

  const failSync = useCallback((handle: SyncRunHandle, message: string) => {
    if (runIdRef.current !== handle.runId) return

    clearPhaseTimers()
    setPhase('error')
    setProgressValue(1)
    setOutcomeMessage(null)
    setErrorMessage(message)
  }, [clearPhaseTimers])

  const resetSyncFeedback = useCallback(() => {
    clearPhaseTimers()
    setPhase('idle')
    setProgressValue(0)
    setOutcomeMessage(null)
    setErrorMessage(null)
  }, [clearPhaseTimers])

  return {
    detail: getSyncPhaseDetail(phase, selectedCourseCount, outcomeMessage, errorMessage),
    errorMessage,
    finishSync,
    isSyncing: phase !== 'idle' && phase !== 'done' && phase !== 'error',
    lastSync: lastSyncOverride ?? initialLastSync,
    phase,
    progressValue,
    resetSyncFeedback,
    selectedCourseCount,
    title: getSyncPhaseTitle(phase),
    beginSync,
    failSync,
  }
}

function getSyncPhaseTitle(phase: CanvasSyncPhase) {
  if (phase === 'starting') return 'Starting sync'
  if (phase === 'connecting') return 'Connecting to Canvas'
  if (phase === 'fetchingCourses') return 'Fetching course data'
  if (phase === 'fetchingModules') return 'Fetching module content'
  if (phase === 'merging') return 'Merging data'
  if (phase === 'saving') return 'Saving synced content'
  if (phase === 'done') return 'Sync complete'
  if (phase === 'error') return 'Sync failed'
  return 'Ready to sync'
}

function getSyncPhaseDetail(
  phase: CanvasSyncPhase,
  selectedCourseCount: number,
  outcomeMessage: string | null,
  errorMessage: string | null,
) {
  const courseLabel = selectedCourseCount === 1 ? '1 selected course' : `${selectedCourseCount} selected courses`

  if (phase === 'starting') {
    return `Preparing ${courseLabel} for a new Canvas refresh.`
  }

  if (phase === 'connecting') {
    return 'Opening the current Canvas connection and starting the sync request.'
  }

  if (phase === 'fetchingCourses') {
    return 'Pulling assignments, announcements, and course-level payloads for the selected courses.'
  }

  if (phase === 'fetchingModules') {
    return 'Loading module items, attached resources, and module-linked study content.'
  }

  if (phase === 'merging') {
    return 'Combining the incoming Canvas data with the Stay Focused workspace shape.'
  }

  if (phase === 'saving') {
    return 'Writing synced modules, tasks, and study items into the app.'
  }

  if (phase === 'done') {
    return outcomeMessage ?? 'The selected Canvas content finished syncing successfully.'
  }

  if (phase === 'error') {
    return errorMessage ?? 'The sync could not be completed.'
  }

  return 'Select courses, then run sync when you are ready.'
}

function waitForDelay(delay: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delay)
  })
}
