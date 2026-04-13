import Link from 'next/link'
import { StudyModeSwitcher } from '@/components/StudyModeSwitcher'
import { getLearnResourceUiState } from '@/lib/learn-resource-ui'
import { getModuleResourceCapabilityInfo } from '@/lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { getLearnResourceKindLabel } from '@/lib/study-resource'
import { getLearnResourceHref, getResourceCanvasHref, type LearnResourceUnit } from '@/lib/module-workspace'
import { buildModuleInspectHref } from '@/lib/stay-focused-links'

export function LearnResourceCard({
  moduleId,
  unit,
  compact = false,
}: {
  moduleId: string
  unit: LearnResourceUnit
  compact?: boolean
}) {
  const canvasHref = getResourceCanvasHref(unit.resource)
  const deepHref = getLearnResourceHref(moduleId, unit.resource.id)
  const inspectHref = buildModuleInspectHref(moduleId, { resourceId: unit.resource.id })
  const capability = getModuleResourceCapabilityInfo(unit.resource)
  const quality = getModuleResourceQualityInfo(unit.resource)
  const uiState = getLearnResourceUiState(unit.resource, {
    hasCanvasLink: Boolean(canvasHref),
  })
  const deepViewLabel = unit.resource.kind === 'study_file' ? 'Open source detail' : 'Open deep view'
  const shouldPreferSource = uiState.primaryAction === 'source' && Boolean(canvasHref)
  const previewLabel = unit.resource.kind === 'study_file'
      ? quality.shouldUseForGrounding
        ? 'Study snapshot'
        : 'Source status'
    : quality.shouldUseForGrounding
      ? 'Resource Preview'
      : 'Grounding Note'

  return (
    <article className="glass-panel" style={{
      ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
      ['--glass-panel-border' as string]: 'var(--glass-border)',
      ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
      borderRadius: 'var(--radius-panel)',
      padding: compact ? '0.95rem' : '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.9rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
            <span className="ui-chip ui-chip-soft">{labelForResourceKind(unit.resource)}</span>
            <span className="ui-chip ui-chip-soft">{unit.grounding.label}</span>
            <span className="ui-chip ui-chip-soft">{capability.capabilityLabel}</span>
            <span className="ui-chip ui-chip-soft">{quality.qualityLabel}</span>
            <span className="ui-chip ui-chip-soft">{uiState.statusLabel}</span>
            {unit.resource.required && (
              <span className="ui-chip ui-status-warning" style={{ padding: '0.28rem 0.6rem', fontSize: '11px', fontWeight: 700 }}>Required</span>
            )}
          </div>
          <Link href={deepHref} style={{ textDecoration: 'none' }}>
            <h3 style={{ margin: 0, fontSize: compact ? '17px' : '19px', lineHeight: 1.25, fontWeight: 650, color: 'var(--text-primary)' }}>
              {unit.resource.title}
            </h3>
          </Link>
          <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
            {buildContextLine(unit)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {canvasHref && (
            <a
              href={canvasHref}
              target="_blank"
              rel="noreferrer"
              className={`ui-button ${shouldPreferSource ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`}
              style={{ textDecoration: 'none' }}
            >
              {uiState.sourceActionLabel}
            </a>
          )}
          <Link href={deepHref} className={`ui-button ${shouldPreferSource ? 'ui-button-ghost' : 'ui-button-secondary'} ui-button-xs`} style={{ textDecoration: 'none' }}>
            {deepViewLabel}
          </Link>
          <Link href={inspectHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Inspect
          </Link>
        </div>
      </div>

      <Link href={deepHref} style={{ textDecoration: 'none' }}>
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: compact ? '0.85rem' : '0.9rem' }}>
          <p className="ui-kicker">{previewLabel}</p>
          <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{unit.preview}</p>
          {unit.grounding.evidenceSnippet && (
            <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
              Evidence: {unit.grounding.evidenceSnippet}
            </p>
          )}
        </div>
      </Link>

      {unit.resource.whyItMatters && (
        <div className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
          <p className="ui-kicker">Why this matters</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{unit.resource.whyItMatters}</p>
          {unit.resource.linkedContext && (
            <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>{unit.resource.linkedContext}</p>
          )}
        </div>
      )}

      {unit.modes.length > 0 ? (
        <StudyModeSwitcher modes={unit.modes} />
      ) : (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.95rem' }}>
          <p className="ui-kicker">Analysis availability</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {quality.reason}
          </p>
        </div>
      )}
    </article>
  )
}

function buildContextLine(unit: LearnResourceUnit) {
  const parts = [
    unit.resource.courseName,
    unit.resource.moduleName,
    unit.resource.originalTitle && unit.resource.originalTitle !== unit.resource.title ? `Canvas: ${unit.resource.originalTitle}` : null,
    unit.resource.dueDate && unit.resource.dueDate !== 'No due date' ? `Due ${formatDate(unit.resource.dueDate)}` : null,
  ].filter(Boolean)

  return parts.join(' / ') || 'Canvas resource'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function labelForResourceKind(resource: Pick<LearnResourceUnit['resource'], 'kind' | 'type'>) {
  return getLearnResourceKindLabel(resource)
}
