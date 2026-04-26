'use client'

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
  const [moduleSummary, setModuleSummary] = useState(summary)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(summary?.status === 'failed' ? summary.error : null)

  async function generateSummary() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/modules/${encodeURIComponent(moduleId)}/summary`, { method: 'POST' })
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; summary?: ModuleSummaryRow } | null
      if (!response.ok || !payload?.ok || !payload.summary) throw new Error(payload?.error ?? 'Could not summarize this module.')
      setModuleSummary(payload.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not summarize this module.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.62rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <p className="ui-kicker" style={{ margin: 0 }}>Module overview</p>
          <p style={{ margin: '0.42rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {moduleSummary?.summary ?? fallbackSummary}
          </p>
        </div>
        {!moduleSummary?.summary && moduleSummary?.status !== 'failed' && (
          <button type="button" onClick={generateSummary} disabled={busy} className="ui-button ui-button-secondary ui-button-xs">
            {busy ? 'Summarizing...' : 'Summarize module'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <MetricPill label={`${readyCount} ready`} tone="accent" />
        <MetricPill label={`${needsActionCount} need action`} tone={needsActionCount > 0 ? 'warning' : 'muted'} />
        <MetricPill label={`${unsupportedCount} reference`} tone="muted" />
      </div>

      {moduleSummary?.topics && moduleSummary.topics.length > 0 && (
        <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
          {moduleSummary.topics.slice(0, 7).join(' · ')}
        </p>
      )}
      {moduleSummary?.suggestedOrder && moduleSummary.suggestedOrder.length > 0 && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Suggested order: {moduleSummary.suggestedOrder.slice(0, 4).join(' → ')}
        </p>
      )}
      {(moduleSummary?.warnings?.length ?? 0) > 0 && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
          Needs attention: {moduleSummary?.warnings.slice(0, 3).join(' ')}
        </p>
      )}
      {error && <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.45, color: 'var(--red)' }}>{error}</p>}
    </div>
  )
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
