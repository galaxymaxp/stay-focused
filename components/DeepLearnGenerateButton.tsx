'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { generateDeepLearnNoteAction } from '@/actions/deep-learn'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'

const PACK_PROGRESS_STAGES = [
  {
    label: 'Queue',
    detail: 'Saving a pending pack record so this resource stops feeling idle.',
    progressValue: 0.18,
  },
  {
    label: 'Read source',
    detail: 'Checking the extracted text or fallback source evidence for a usable study pass.',
    progressValue: 0.38,
  },
  {
    label: 'Build pack',
    detail: 'Turning the source into answer banks, identification cues, and quiz targets.',
    progressValue: 0.7,
  },
  {
    label: 'Save result',
    detail: 'Writing the generated pack back into Stay Focused and preparing the next screen.',
    progressValue: 0.88,
  },
] as const

export function DeepLearnGenerateButton({
  moduleId,
  resourceId,
  courseId = null,
  label = 'Create Draft',
  pendingLabel = 'Preparing...',
  className = 'ui-button ui-button-secondary ui-button-xs',
}: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  label?: string
  pendingLabel?: string
  className?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [progressValue, setProgressValue] = useState(0)

  useEffect(() => {
    if (!isPending) return

    const timers = PACK_PROGRESS_STAGES.slice(1).map((stage, index) => window.setTimeout(() => {
      setStageIndex(index + 1)
      setProgressValue(stage.progressValue)
    }, 520 + (index * 720)))

    const intervalId = window.setInterval(() => {
      setProgressValue((current) => (current >= 0.92 ? current : Math.min(current + 0.03, 0.92)))
    }, 620)

    return () => {
      window.clearInterval(intervalId)
      for (const timerId of timers) {
        window.clearTimeout(timerId)
      }
    }
  }, [isPending])

  return (
    <div style={{ display: 'grid', gap: '0.35rem' }}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setStageIndex(0)
          setProgressValue(PACK_PROGRESS_STAGES[0].progressValue)
          startTransition(async () => {
            setErrorMessage(null)

            try {
              const result = await generateDeepLearnNoteAction({
                moduleId,
                resourceId,
                courseId,
              })

              router.push(buildDeepLearnNoteHref(result.moduleId, result.resourceId))
              router.refresh()
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'Deep Learn failed to start the exam prep pack.')
            }
          })
        }}
        className={className}
      >
        {isPending ? `${pendingLabel} ${PACK_PROGRESS_STAGES[stageIndex]?.label ?? ''}`.trim() : label}
      </button>

      {isPending && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Building exam prep pack</p>
            <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
              {Math.round(progressValue * 100)}%
            </span>
          </div>

          <div style={{ position: 'relative', height: '0.42rem', borderRadius: '999px', overflow: 'hidden', background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)', border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)' }}>
            <div style={{
              width: `${Math.max(10, Math.min(100, progressValue * 100))}%`,
              height: '100%',
              borderRadius: 'inherit',
              background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 72%, var(--blue) 28%), color-mix(in srgb, var(--blue) 68%, var(--accent) 32%))',
              transition: 'width 220ms ease',
            }} />
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {PACK_PROGRESS_STAGES.map((stage, index) => (
              <span
                key={stage.label}
                className="ui-chip"
                style={{
                  padding: '0.22rem 0.52rem',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: index <= stageIndex
                    ? 'color-mix(in srgb, var(--accent-light) 44%, var(--surface-soft) 56%)'
                    : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
                  color: index <= stageIndex ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${index <= stageIndex
                    ? 'color-mix(in srgb, var(--accent-border) 28%, var(--border-subtle) 72%)'
                    : 'var(--border-subtle)'}`,
                }}
              >
                {stage.label}
              </span>
            ))}
          </div>

          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>
            {PACK_PROGRESS_STAGES[stageIndex]?.detail}
          </p>
        </div>
      )}

      {errorMessage && (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--red)' }}>
          {errorMessage}
        </span>
      )}
    </div>
  )
}
