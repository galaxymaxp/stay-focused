'use client'

import { useState } from 'react'

export interface SourceSummaryBadgeModel {
  summary: string | null
  topics: string[]
  studyValue?: 'high' | 'medium' | 'low' | null
  suggestedUse?: string | null
  status: 'ready' | 'pending' | 'failed' | 'stale' | 'missing'
}

export function SourceSummaryBadge({
  resourceId,
  summary,
  canSummarize,
}: {
  resourceId: string | null
  summary: SourceSummaryBadgeModel | null
  canSummarize: boolean
}) {
  const [state, setState] = useState<SourceSummaryBadgeModel | null>(summary)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function summarize() {
    if (!resourceId || busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/deep-learn/sources/${encodeURIComponent(resourceId)}/summarize`, { method: 'POST' })
      const payload = await response.json().catch(() => null) as {
        ok?: boolean
        error?: string
        summary?: {
          summary?: string | null
          topics?: string[]
          studyValue?: 'high' | 'medium' | 'low' | null
          suggestedUse?: string | null
          status?: SourceSummaryBadgeModel['status']
        }
      } | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? 'Could not summarize this source.')
      setState({
        summary: payload.summary?.summary ?? null,
        topics: payload.summary?.topics ?? [],
        studyValue: payload.summary?.studyValue ?? null,
        suggestedUse: payload.summary?.suggestedUse ?? null,
        status: payload.summary?.status ?? 'ready',
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize this source.')
    } finally {
      setBusy(false)
    }
  }

  if (state?.summary) {
    return (
      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem', display: 'grid', gap: '0.38rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="ui-kicker" style={{ margin: 0 }}>Source summary</span>
          {state.studyValue && <SmallPill label={`${state.studyValue} value`} />}
          {state.suggestedUse && <SmallPill label={state.suggestedUse} />}
        </div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.58, color: 'var(--text-secondary)' }}>{state.summary}</p>
        {state.topics.length > 0 && (
          <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
            {state.topics.slice(0, 5).join(' · ')}
          </p>
        )}
      </div>
    )
  }

  if (!canSummarize) return null

  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem', display: 'grid', gap: '0.45rem', justifyItems: 'start' }}>
      <div>
        <p className="ui-kicker" style={{ margin: 0 }}>Source summary</p>
        <p style={{ margin: '0.28rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Create a quick source summary before building the study pack.
        </p>
      </div>
      <button type="button" onClick={summarize} disabled={busy || !resourceId} className="ui-button ui-button-ghost ui-button-xs">
        {busy ? 'Creating source summary...' : 'Create source summary'}
      </button>
      {error && <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

function SmallPill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.18rem 0.44rem',
      borderRadius: '999px',
      border: '1px solid var(--border-subtle)',
      fontSize: '10px',
      fontWeight: 700,
      color: 'var(--text-muted)',
    }}>
      {label}
    </span>
  )
}
