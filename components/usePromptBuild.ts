'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import {
  buildTaskPromptBuildPreview,
  isTaskDraftApiResponse,
  type TaskDraftApiRequest,
  type TaskDraftResponse,
} from '@/lib/do-now'

type DraftSource = 'saved' | 'generated'
type ReopenSource = 'session' | null

export type PromptBuildPhase =
  | 'idle'
  | 'preparing'
  | 'reading'
  | 'structuring'
  | 'streaming'
  | 'done'
  | 'error'

export interface PromptBuildSnapshot {
  draft: TaskDraftResponse
  draftSource: DraftSource
  requestBody: string
}

interface UsePromptBuildOptions {
  initialSnapshot?: PromptBuildSnapshot | null
  onSnapshotChange?: (snapshot: PromptBuildSnapshot) => void
  requestBody: string
  requestPayload: TaskDraftApiRequest
}

interface PromptBuildState {
  draftSource: DraftSource
  errorMessage: string | null
  generatedDraft: TaskDraftResponse | null
  phase: PromptBuildPhase
  progressValue: number
  promptText: string
  reopenSource: ReopenSource
}

const PREPARATION_STEPS: Array<{ delay: number; phase: Extract<PromptBuildPhase, 'reading' | 'structuring'>; progressValue: number }> = [
  { delay: 360, phase: 'reading', progressValue: 0.26 },
  { delay: 1080, phase: 'structuring', progressValue: 0.56 },
]
const PREPARATION_TIMELINE_MS = 1160

export function usePromptBuild({
  initialSnapshot,
  onSnapshotChange,
  requestBody,
  requestPayload,
}: UsePromptBuildOptions) {
  const onSnapshotChangeEvent = useEffectEvent((snapshot: PromptBuildSnapshot) => {
    onSnapshotChange?.(snapshot)
  })
  const hasReusableSnapshot = initialSnapshot?.requestBody === requestBody
  const reusablePromptText = hasReusableSnapshot && initialSnapshot
    ? buildTaskPromptBuildPreview(requestPayload, initialSnapshot.draft)
    : ''
  const [state, setState] = useState<PromptBuildState>(() => ({
    generatedDraft: hasReusableSnapshot ? initialSnapshot.draft : null,
    phase: hasReusableSnapshot ? 'done' : 'idle',
    progressValue: hasReusableSnapshot ? 1 : 0,
    promptText: reusablePromptText,
    draftSource: hasReusableSnapshot ? initialSnapshot.draftSource : 'generated',
    reopenSource: hasReusableSnapshot ? 'session' : null,
    errorMessage: null,
  }))

  useEffect(() => {
    if (hasReusableSnapshot && initialSnapshot) {
      setState({
        generatedDraft: initialSnapshot.draft,
        phase: 'done',
        progressValue: 1,
        promptText: buildTaskPromptBuildPreview(requestPayload, initialSnapshot.draft),
        draftSource: initialSnapshot.draftSource,
        reopenSource: 'session',
        errorMessage: null,
      })
      return
    }

    const controller = new AbortController()
    const pendingTimeouts: number[] = []
    let longWaitIntervalId: number | null = null

    const queuePhaseStep = (
      delay: number,
      phase: Extract<PromptBuildPhase, 'reading' | 'structuring'>,
      progressValue: number,
    ) => {
      const timeoutId = window.setTimeout(() => {
        if (controller.signal.aborted) return

        setState((current) => {
          if (current.phase === 'streaming' || current.phase === 'done' || current.phase === 'error') {
            return current
          }

          return {
            ...current,
            phase,
            progressValue: Math.max(current.progressValue, progressValue),
          }
        })
      }, delay)

      pendingTimeouts.push(timeoutId)
    }

    const clearPendingTimers = () => {
      for (const timeoutId of pendingTimeouts) {
        window.clearTimeout(timeoutId)
      }

      pendingTimeouts.length = 0

      if (longWaitIntervalId !== null) {
        window.clearInterval(longWaitIntervalId)
        longWaitIntervalId = null
      }
    }

    async function loadTaskDraft() {
      const preparationTimeline = waitForDelay(PREPARATION_TIMELINE_MS, controller.signal)

      setState({
        generatedDraft: null,
        phase: 'preparing',
        progressValue: 0.12,
        promptText: '',
        draftSource: 'generated',
        reopenSource: null,
        errorMessage: null,
      })

      for (const step of PREPARATION_STEPS) {
        queuePhaseStep(step.delay, step.phase, step.progressValue)
      }

      longWaitIntervalId = window.setInterval(() => {
        setState((current) => {
          if (current.phase === 'streaming' || current.phase === 'done' || current.phase === 'error') {
            return current
          }

          return {
            ...current,
            progressValue: current.progressValue >= 0.64
              ? current.progressValue
              : Math.min(current.progressValue + 0.03, 0.64),
          }
        })
      }, 480)

      try {
        const response = await fetch('/api/do-now', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBody,
          signal: controller.signal,
        })

        const data = (await response.json().catch(() => null)) as unknown

        if (!response.ok) {
          throw new Error(extractErrorMessage(data))
        }

        if (!isTaskDraftApiResponse(data)) {
          throw new Error('Received an invalid starter draft response.')
        }

        await preparationTimeline

        if (controller.signal.aborted) return

        clearPendingTimers()

        const nextDraftSource = data.cacheStatus === 'hit' ? 'saved' : 'generated'
        const promptPreview = buildTaskPromptBuildPreview(requestPayload, data.draft)

        setState((current) => ({
          ...current,
          generatedDraft: data.draft,
          draftSource: nextDraftSource,
          phase: 'streaming',
          progressValue: Math.max(current.progressValue, 0.68),
          promptText: '',
          errorMessage: null,
        }))

        onSnapshotChangeEvent({
          draft: data.draft,
          draftSource: nextDraftSource,
          requestBody,
        })

        await streamPromptPreview({
          promptPreview,
          signal: controller.signal,
          onChunk(nextPromptText, chunkProgress) {
            setState((current) => ({
              ...current,
              phase: 'streaming',
              progressValue: 0.68 + (chunkProgress * 0.29),
              promptText: nextPromptText,
            }))
          },
        })

        if (controller.signal.aborted) return

        setState((current) => ({
          ...current,
          phase: 'done',
          progressValue: 1,
          promptText: promptPreview,
        }))
      } catch (error) {
        if (controller.signal.aborted) return

        clearPendingTimers()
        console.error('Task draft request failed:', error)
        setState({
          generatedDraft: null,
          phase: 'error',
          progressValue: 1,
          promptText: '',
          draftSource: 'generated',
          reopenSource: null,
          errorMessage: error instanceof Error
            ? error.message
            : 'Could not generate draft help right now.',
        })
      }
    }

    void loadTaskDraft()

    return () => {
      controller.abort()
      clearPendingTimers()
    }
  }, [hasReusableSnapshot, initialSnapshot, requestBody, requestPayload])

  return {
    draftSource: state.draftSource,
    errorMessage: state.errorMessage,
    generatedDraft: state.generatedDraft,
    isBuilding: state.phase !== 'done' && state.phase !== 'error',
    phase: state.phase,
    progressValue: state.progressValue,
    promptText: state.promptText,
    reopenSource: state.reopenSource,
  }
}

async function streamPromptPreview({
  promptPreview,
  signal,
  onChunk,
}: {
  onChunk: (nextPromptText: string, chunkProgress: number) => void
  promptPreview: string
  signal: AbortSignal
}) {
  const chunks = chunkPromptPreview(promptPreview)
  if (chunks.length === 0) {
    onChunk('', 1)
    return
  }

  let visiblePromptText = ''

  for (let index = 0; index < chunks.length; index += 1) {
    if (signal.aborted) return

    visiblePromptText += chunks[index]
    onChunk(visiblePromptText, (index + 1) / chunks.length)
    await waitForDelay(getChunkDelay(index), signal)
  }
}

function chunkPromptPreview(value: string) {
  const tokens = value.match(/\S+\s*/g) ?? []
  if (tokens.length === 0) return value ? [value] : []

  const chunks: string[] = []

  for (let index = 0; index < tokens.length;) {
    const chunkSize = index < 18 ? 3 : index < 54 ? 4 : 6
    chunks.push(tokens.slice(index, index + chunkSize).join(''))
    index += chunkSize
  }

  return chunks
}

function getChunkDelay(index: number) {
  if (index < 4) return 60
  if (index < 12) return 48
  if (index < 24) return 38
  return 30
}

function waitForDelay(delay: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, delay)

    function handleAbort() {
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }

    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function extractErrorMessage(value: unknown) {
  if (isPlainRecord(value) && typeof value.error === 'string' && value.error.trim()) {
    return value.error
  }

  return 'Could not generate draft help right now.'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
