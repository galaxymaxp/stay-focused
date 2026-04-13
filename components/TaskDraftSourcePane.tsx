'use client'

import Link from 'next/link'
import type { TaskDraftContext } from '@/lib/do-now'

export function TaskDraftSourcePane({
  context,
  isBuilding = false,
}: {
  context: TaskDraftContext
  isBuilding?: boolean
}) {
  const sourceTitle = context.sourceTitle ?? context.taskTitle
  const sourceType = context.sourceType ?? 'Task context'
  const sourceHref = context.sourceHref ?? context.canvasUrl ?? null
  const sourceText = context.sourceText
    ?? context.resourceSnippet
    ?? context.taskDetails
    ?? context.moduleSummary
    ?? null
  const sourceNote = context.sourceNote ?? context.taskDetails
  const canRenderInline = canRenderSourceInline(sourceHref, sourceType)
  const fallbackNote = sourceHref && !canRenderInline
    ? 'This source cannot be rendered inline here, so Stay Focused keeps the surfaced text beside the draft instead.'
    : null

  return (
    <aside className="glass-panel glass-soft draft-source-card" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
      <div style={{ display: 'grid', gap: '0.45rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker" style={{ margin: 0 }}>{isBuilding ? 'Pinned source' : 'Source beside draft'}</p>
            <h3 style={{ margin: '0.38rem 0 0', fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
              {sourceTitle}
            </h3>
          </div>
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {sourceType}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
          {isBuilding
            ? 'Keep the source pinned while the draft builds so the assignment never turns into a blind wait state.'
            : 'Use the draft and the source side-by-side. The main output stays editable while the source remains visible.'}
        </p>
      </div>

      {sourceNote && (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
          <p className="ui-kicker" style={{ margin: 0 }}>Surfaced context</p>
          <p style={{ margin: '0.42rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
            {sourceNote}
          </p>
        </div>
      )}

      {canRenderInline && sourceHref ? (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.32rem', overflow: 'hidden' }}>
          <iframe
            src={sourceHref}
            title={`${sourceTitle} source preview`}
            className="draft-source-frame"
          />
        </div>
      ) : sourceText ? (
        <div className="ui-card-soft draft-source-scroll" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {sourceText}
          </p>
          {fallbackNote && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
              {fallbackNote}
            </p>
          )}
        </div>
      ) : (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
            No extracted source text was surfaced for this task yet. Open the original task or course view if you need the live source page.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {sourceHref && (
          <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            Open source
          </a>
        )}
        {context.learnHref && (
          <Link href={context.learnHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open Learn source
          </Link>
        )}
        {context.canvasUrl && context.canvasUrl !== sourceHref && (
          <a href={context.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open in Canvas
          </a>
        )}
      </div>
    </aside>
  )
}

function canRenderSourceInline(sourceHref: string | null, sourceType: string | null | undefined) {
  if (!sourceHref) return false

  const normalizedHref = sourceHref.toLowerCase()
  const normalizedType = sourceType?.toLowerCase() ?? ''
  const previewableExtensions = ['.pdf', '.txt', '.md', '.html', '.htm', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

  if (previewableExtensions.some((extension) => normalizedHref.includes(extension))) {
    return true
  }

  return normalizedType.includes('pdf')
    || normalizedType.includes('image')
    || normalizedType.includes('text')
}
