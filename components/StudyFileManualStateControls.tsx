'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setStudyFileProgress, setStudyFileWorkflowOverride } from '@/actions/module-resource-study-state'
import {
  getStudyFileProgressLabel,
  getWorkflowOverrideActionLabel,
  getWorkflowOverrideLabel,
  STUDY_FILE_PROGRESS_OPTIONS,
} from '@/lib/study-file-manual-state'
import type { ModuleResourceWorkflowOverride, StudyFileProgressStatus } from '@/lib/types'

export function StudyFileManualStateControls({
  moduleId,
  resourceId,
  progressStatus,
  workflowOverride,
  compact = false,
}: {
  moduleId: string
  resourceId: string
  progressStatus: StudyFileProgressStatus
  workflowOverride: ModuleResourceWorkflowOverride
  compact?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [progress, setProgress] = useState(progressStatus)
  const [override, setOverride] = useState(workflowOverride)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setProgress(progressStatus)
  }, [progressStatus])

  useEffect(() => {
    setOverride(workflowOverride)
  }, [workflowOverride])

  function updateProgress(nextStatus: StudyFileProgressStatus) {
    if (nextStatus === progress) return

    const previousStatus = progress
    setProgress(nextStatus)
    setErrorMessage(null)

    startTransition(async () => {
      try {
        await setStudyFileProgress({
          moduleId,
          resourceId,
          progressStatus: nextStatus,
        })
        router.refresh()
      } catch (error) {
        setProgress(previousStatus)
        setErrorMessage(error instanceof Error ? error.message : 'Study progress could not be saved.')
      }
    })
  }

  function updateWorkflowOverride(nextOverride: ModuleResourceWorkflowOverride) {
    if (nextOverride === override) return

    const previousOverride = override
    setOverride(nextOverride)
    setErrorMessage(null)

    startTransition(async () => {
      try {
        await setStudyFileWorkflowOverride({
          moduleId,
          resourceId,
          workflowOverride: nextOverride,
        })
        router.refresh()
      } catch (error) {
        setOverride(previousOverride)
        setErrorMessage(error instanceof Error ? error.message : 'Workflow override could not be saved.')
      }
    })
  }

  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: compact ? '0.8rem 0.85rem' : '0.95rem 1rem', display: 'grid', gap: compact ? '0.7rem' : '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p className="ui-kicker">{compact ? 'Progress' : 'Study progress'}</p>
          <p style={{ margin: '0.42rem 0 0', fontSize: compact ? '13px' : '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            Manual only. Learn will not infer this from scrolling or time.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <StateChip label={getStudyFileProgressLabel(progress)} selected />
          {override === 'activity' && (
            <StateChip label={getWorkflowOverrideLabel(override)} />
          )}
        </div>
      </div>

      <div className="ui-tab-group" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {STUDY_FILE_PROGRESS_OPTIONS.map((status) => {
          const active = progress === status
          return (
            <button
              key={status}
              type="button"
              onClick={() => updateProgress(status)}
              disabled={isPending}
              className={active ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
            >
              {getStudyFileProgressLabel(status)}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {progress !== 'reviewed' && (
          <button
            type="button"
            onClick={() => updateProgress('reviewed')}
            disabled={isPending}
            className="ui-button ui-button-ghost ui-button-xs"
          >
            {isPending ? 'Saving...' : 'Already studied'}
          </button>
        )}
        <button
          type="button"
          onClick={() => updateWorkflowOverride(override === 'activity' ? 'study' : 'activity')}
          disabled={isPending}
          className={override === 'activity' ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
        >
          {isPending ? 'Saving...' : getWorkflowOverrideActionLabel(override)}
        </button>
      </div>

      {errorMessage && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--red)' }}>
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function StateChip({ label, selected = false }: { label: string; selected?: boolean }) {
  return (
    <span className={`ui-chip ui-chip-soft${selected ? ' ui-chip-selected' : ''}`} style={{ padding: '0.32rem 0.68rem', fontSize: '11px', fontWeight: 700 }}>
      {label}
    </span>
  )
}
