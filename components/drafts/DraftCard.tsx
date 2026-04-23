import Link from 'next/link'
import type { DraftShelfItem } from '@/lib/types'

const typeLabels: Record<string, string> = {
  exam_reviewer: 'Exam Prep Pack',
  study_notes: 'Study Notes',
  summary: 'Summary',
  flashcard_set: 'Flashcard Set',
}

const statusLabels: Record<string, string> = {
  ready: 'Ready',
  generating: 'Generating',
  refining: 'Refining',
  failed: 'Failed',
}

function statusTone(status: string): 'accent' | 'warning' | 'muted' {
  if (status === 'ready') return 'accent'
  if (status === 'failed') return 'warning'
  return 'muted'
}

export function DraftCard({ draft }: { draft: DraftShelfItem }) {
  const tone = statusTone(draft.status)
  const pillBg = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 40%, var(--surface-soft) 60%)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const pillBorder = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <Link
      href={`/drafts/${draft.id}`}
      style={{
        display: 'grid',
        gap: '0.38rem',
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)',
        padding: '0.8rem 0.85rem',
        textDecoration: 'none',
        boxShadow: 'var(--shadow-low)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
      className="ui-interactive-card"
    >
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.24rem 0.55rem',
          borderRadius: '999px',
          border: '1px solid var(--border-subtle)',
          background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1.2,
          color: 'var(--text-primary)',
        }}>
          {typeLabels[draft.draftType] ?? draft.draftType}
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0.24rem 0.55rem',
          borderRadius: '999px',
          border: `1px solid ${pillBorder}`,
          background: pillBg,
          fontSize: '11px',
          fontWeight: 700,
          lineHeight: 1.2,
          color: 'var(--text-primary)',
        }}>
          {statusLabels[draft.status] ?? draft.status}
        </span>
        {draft.quizReady && (
          <span className="ui-chip ui-chip-soft" style={{ fontSize: '11px', fontWeight: 700 }}>
            Quiz ready
          </span>
        )}
      </div>

      <p style={{ margin: 0, fontSize: '0.93rem', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 650 }}>
        {draft.title}
      </p>

      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
        {draft.sourceTitle}
      </p>

      {draft.moduleTitle && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          Module: {draft.moduleTitle}
        </p>
      )}

      {draft.summary && (
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {draft.summary}
        </p>
      )}

      <p style={{ margin: '0.1rem 0 0', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-muted)' }}>
        {draft.entryKind === 'deep_learn_note' ? 'saved pack' : draft.sourceType.replace(/_/g, ' ')} · {new Date(draft.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        {draft.tokenCount ? ` · ${draft.tokenCount.toLocaleString()} tokens` : ''}
      </p>
    </Link>
  )
}
