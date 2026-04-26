'use client'

export type SourceReadinessFilter = 'all' | 'ready' | 'needs_action' | 'unsupported'

export function SourceReadinessFilters({
  value,
  counts,
  onChange,
}: {
  value: SourceReadinessFilter
  counts: Record<SourceReadinessFilter, number>
  onChange: (value: SourceReadinessFilter) => void
}) {
  const options: Array<{ value: SourceReadinessFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'ready', label: 'Ready' },
    { value: 'needs_action', label: 'Needs action' },
    { value: 'unsupported', label: 'Unsupported' },
  ]

  return (
    <div role="tablist" aria-label="Source readiness filters" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className="ui-button ui-button-xs"
          style={{
            borderRadius: '999px',
            background: value === option.value
              ? 'color-mix(in srgb, var(--surface-selected) 82%, var(--accent) 18%)'
              : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
            border: value === option.value
              ? '1px solid color-mix(in srgb, var(--accent-border) 35%, var(--border-subtle) 65%)'
              : '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {option.label} {counts[option.value]}
        </button>
      ))}
    </div>
  )
}
