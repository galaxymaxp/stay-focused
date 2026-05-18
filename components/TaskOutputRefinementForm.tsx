'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { RefreshCw } from 'lucide-react'
import { refineTaskOutputStudyOutputAction } from '@/actions/study-outputs'

export function TaskOutputRefinementForm({ outputId }: { outputId: string }) {
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextInstruction = instruction.trim()
    if (!nextInstruction || isPending) return

    setMessage(null)
    startTransition(async () => {
      const result = await refineTaskOutputStudyOutputAction({
        outputId,
        instruction: nextInstruction,
      })
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      setInstruction('')
      setMessage('Refinement saved.')
      window.location.reload()
    })
  }

  return (
    <form onSubmit={submit} className="reviewer-panel reviewer-print-hide study-output-keep-together" style={{ display: 'grid', gap: '0.65rem' }}>
      <div>
        <p className="reviewer-section-label">Refine this output</p>
        <p className="reviewer-muted" style={{ marginTop: '0.25rem' }}>
          Ask for format or wording changes. Refinement cannot create missing facts, sources, or citations.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="Make it more formal, add stronger explanations, or use simpler student wording..."
          className="ui-input"
          maxLength={500}
          style={{ minWidth: 'min(100%, 24rem)', flex: '1 1 24rem' }}
        />
        <button type="submit" disabled={!instruction.trim() || isPending} className="ui-button ui-button-secondary ui-button-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          {isPending ? 'Refining' : 'Refine'}
        </button>
      </div>
      {message ? (
        <p className="reviewer-muted" role="status">{message}</p>
      ) : null}
    </form>
  )
}
