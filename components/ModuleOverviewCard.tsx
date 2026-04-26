'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ModuleSummaryRow } from '@/lib/source-summaries'

export function ModuleOverviewCard({
  moduleId,
  fallbackSummary,
  readyCount,
  needsActionCount,
  unsupportedCount,
  summary,
}: {
  moduleId: string
  fallbackSummary: string
  readyCount: number
  needsActionCount: number
  unsupportedCount: number
  summary: ModuleSummaryRow | null
}) {
  const router = useRouter()
  const [moduleSummary, setModuleSummary] = useState(summary)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(summary?.status === 'failed' ? summary.error : null)
  const overviewState = getOverviewState(moduleSummary, readyCount, needsActionCount)
  const hasReadyOverview = moduleSummary?.status === 'ready' && Boolean(moduleSummary.summary)
  const canRefresh = readyCount > 0 || hasReadyOverview || moduleSummary?.status === 'failed'

  async function refreshSummary() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/modules/${encodeURIComponent(moduleId)}/summary`, { method: 'POST' })
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; summary?: ModuleSummaryRow } | null
      if (!response.ok || !payload?.ok || !payload.summary) throw new Error(payload?.error ?? 'Could not refresh this overview.')
      setModuleSummary(payload.summary)
      setError(payload.summary.status === 'failed' ? payload.summary.error : null)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh this overview.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.62rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <p className="ui-kicker" style={{ margin: 0 }}>Module overview</p>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.42rem' }}>
            <MetricPill label={overviewState.label} tone={overviewState.tone} />
          </div>
          <p style={{ margin: '0.5rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {hasReadyOverview ? moduleSummary?.summary : fallbackSummary}
          </p>
        </div>
        <button
          type="button"
          onClick={refreshSummary}
          disabled={busy || !canRefresh}
          className="ui-button ui-button-secondary ui-button-xs"
        >
          {busy ? 'Generating overview...' : getButtonLabel(moduleSummary, readyCount)}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <MetricPill label={`${readyCount} ready`} tone="accent" />
        <MetricPill label={`${needsActionCount} need action`} tone={needsActionCount > 0 ? 'warning' : 'muted'} />
        <MetricPill label={`${unsupportedCount} reference`} tone="muted" />
      </div>

      {hasReadyOverview && moduleSummary?.topics && moduleSummary.topics.length > 0 && (
        <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {moduleSummary.topics.slice(0, 7).join(' · ')}
        </p>
      )}
      {hasReadyOverview && moduleSummary?.suggestedOrder && moduleSummary.suggestedOrder.length > 0 && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Suggested order: {moduleSummary.suggestedOrder.slice(0, 4).join(' -> ')}
        </p>
      )}
      {(moduleSummary?.warnings?.length ?? 0) > 0 && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Needs attention: {moduleSummary?.warnings.slice(0, 3).join(' ')}
        </p>
      )}
      {error && moduleSummary?.status !== 'failed' && <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

function getOverviewState(summary: ModuleSummaryRow | null, readyCount: number, needsActionCount: number) {
  if (summary?.status === 'ready' && summary.summary) {
    const lowConfidence = summary.warnings.some((warning) => /need attention|not enough|only task/i.test(warning))
    return {
      label: lowConfidence ? 'Low confidence overview' : 'Ready overview',
      tone: lowConfidence ? 'warning' as const : 'accent' as const,
    }
  }

  if (summary?.status === 'pending') return { label: 'Generating overview', tone: 'muted' as const }
  if (summary?.status === 'failed') {
    return /not enough|processed|readable/i.test(summary.error ?? '')
      ? { label: 'Needs source processing', tone: 'warning' as const }
      : { label: 'Overview failed', tone: 'warning' as const }
  }
  if (readyCount > 0) return { label: 'Generating overview', tone: 'muted' as const }
  if (needsActionCount > 0) return { label: 'Needs source processing', tone: 'warning' as const }
  return { label: 'Needs source processing', tone: 'muted' as const }
}

function getButtonLabel(summary: ModuleSummaryRow | null, readyCount: number) {
  if (summary?.status === 'ready' && summary.summary) return 'Refresh overview'
  if (summary?.status === 'failed') return 'Retry overview'
  if (readyCount <= 0) return 'Process sources first'
  return 'Refresh overview'
}

function MetricPill({ label, tone }: { label: string; tone: 'accent' | 'warning' | 'muted' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 45%, var(--surface-soft) 55%)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'

  return (
    <span style={{
      display: 'inline-flex',
      padding: '0.24rem 0.55rem',
      borderRadius: '999px',
      border: '1px solid var(--border-subtle)',
      background,
      fontSize: '11px',
      fontWeight: 700,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}
