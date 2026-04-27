'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { generateDeepLearnNoteAction } from '@/actions/deep-learn'
import { notifyCompletion } from '@/lib/notifications'
import { buildDeepLearnNoteHref } from '@/lib/stay-focused-links'

const PACK_PROGRESS_STAGES = [
  {
    label: 'Analyzing source',
    detail: 'Reading the source text and available evidence before building your review pack.',
    progressValue: 0.08,
    durationHint: null,
  },
  {
    label: 'Generating with AI',
    detail: 'Building answer banks, quiz targets, and review prompts. This usually takes around 30 to 45 seconds.',
    progressValue: 0.2,
    durationHint: '~40 sec',
  },
  {
    label: 'Structuring draft',
    detail: 'Organizing the pack into sections you can reopen and study later.',
    progressValue: 0.85,
    durationHint: null,
  },
  {
    label: 'Saving to workspace',
    detail: 'Saving the pack into Stay Focused and opening the study surface.',
    progressValue: 0.95,
    durationHint: null,
  },
] as const

export function DeepLearnGenerateButton({
  moduleId,
  resourceId,
  courseId = null,
  label = 'Generate pack',
  pendingLabel = 'Generating...',
  className = 'ui-button ui-button-secondary ui-button-xs',
  disabledReason = null,
}: {
  moduleId: string
  resourceId: string
  courseId?: string | null
  label?: string
  pendingLabel?: string
  className?: string
  disabledReason?: string | null
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [progressValue, setProgressValue] = useState(0)

  useEffect(() => {
    if (!isPending) return

    const stageTimes = [1500, 35000, 42000]
    const timers = PACK_PROGRESS_STAGES.slice(1).map((stage, index) => window.setTimeout(() => {
      setStageIndex(index + 1)
      setProgressValue(stage.progressValue)
    }, stageTimes[index] ?? 1500 + index * 10000))

    const intervalId = window.setInterval(() => {
      setProgressValue((current) => (current >= 0.94 ? current : Math.min(current + 0.008, 0.94)))
    }, 600)

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
        disabled={isPending || Boolean(disabledReason)}
        onClick={() => {
          if (disabledReason) return
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

              if (result.status === 'failed') {
                console.error('Deep Learn generation failed:', result.error)
                notifyCompletion(
                  'Pack generation failed',
                  result.error ?? 'Deep Learn could not build the exam prep pack from this source.',
                  { tag: 'exam-pack-generated', soundType: 'error', showBrowser: true, playSound: true },
                )
              } else {
                notifyCompletion(
                  'Pack ready!',
                  'Your exam prep pack is ready to study.',
                  { tag: 'exam-pack-generated', soundType: 'success', showBrowser: true, playSound: true },
                )
              }

              router.push(buildDeepLearnNoteHref(result.moduleId, result.resourceId))
              router.refresh()
            } catch (error) {
              console.error('Deep Learn generation failed to start:', error)
              const message = error instanceof Error && error.message.trim()
                ? error.message
                : 'Deep Learn failed to start the exam prep pack.'
              notifyCompletion(
                'Pack generation failed',
                message,
                { tag: 'exam-pack-generated', soundType: 'error', showBrowser: true, playSound: true },
              )
              setErrorMessage(message)
            }
          })
        }}
        className={className}
      >
        {isPending ? `${pendingLabel} ${PACK_PROGRESS_STAGES[stageIndex]?.label ?? ''}`.trim() : label}
      </button>

      {disabledReason && (
        <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {disabledReason}
        </span>
      )}

      {isPending && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Generating exam prep pack</p>
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              {PACK_PROGRESS_STAGES[stageIndex]?.durationHint && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {PACK_PROGRESS_STAGES[stageIndex].durationHint}
                </span>
              )}
              <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
                {Math.round(progressValue * 100)}%
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', height: '0.42rem', borderRadius: '999px', overflow: 'hidden', background: 'color-mix(in srgb, var(--surface-soft) 90%, transparent)', border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)' }}>
            <div style={{
              width: `${Math.max(10, Math.min(100, progressValue * 100))}%`,
              height: '100%',
              borderRadius: 'inherit',
              background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 72%, var(--blue) 28%), color-mix(in srgb, var(--blue) 68%, var(--accent) 32%))',
              transition: 'width 500ms ease',
            }} />
          </div>

          <div style={{ display: 'grid', gap: '0.28rem' }}>
            {PACK_PROGRESS_STAGES.map((stage, index) => {
              const status = index < stageIndex ? 'done' : index === stageIndex ? 'active' : 'pending'
              return (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    flexShrink: 0,
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    background: status === 'done'
                      ? 'color-mix(in srgb, var(--green-light) 70%, var(--surface-base) 30%)'
                      : status === 'active'
                        ? 'color-mix(in srgb, var(--accent-light) 70%, var(--surface-base) 30%)'
                        : 'color-mix(in srgb, var(--surface-soft) 80%, transparent)',
                    border: `1px solid ${status === 'done'
                      ? 'color-mix(in srgb, var(--green) 22%, var(--border-subtle) 78%)'
                      : status === 'active'
                        ? 'color-mix(in srgb, var(--accent-border) 22%, var(--border-subtle) 78%)'
                        : 'color-mix(in srgb, var(--border-subtle) 80%, transparent)'}`,
                    color: status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--accent-foreground)' : 'var(--text-muted)',
                  }}>
                    {status === 'done' ? '✓' : status === 'active' ? '●' : ''}
                  </span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: status === 'active' ? 600 : status === 'done' ? 500 : 400,
                    color: status === 'active' ? 'var(--text-primary)' : status === 'done' ? 'var(--text-secondary)' : 'var(--text-muted)',
                  }}>
                    {stage.label}
                  </span>
                </div>
              )
            })}
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
