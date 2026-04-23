import { cn } from '@/lib/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'muted' | 'accent'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-sf-surface-2 text-sf-text border border-sf-border',
  success: 'bg-sf-success-bg text-sf-success',
  warning: 'bg-sf-warning-bg text-sf-warning',
  error: 'bg-sf-error-bg text-sf-error',
  info: 'bg-sf-info-bg text-sf-info',
  muted: 'bg-sf-surface-2 text-sf-muted',
  accent: 'bg-sf-accent-light text-sf-accent',
}

type Props = {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
  dot?: boolean
}

export function Badge({ children, variant = 'default', className, dot }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className,
      )}
    >
      {dot && (
        <span
          className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', {
            'bg-sf-success': variant === 'success',
            'bg-sf-warning': variant === 'warning',
            'bg-sf-error': variant === 'error',
            'bg-sf-info': variant === 'info',
            'bg-sf-accent': variant === 'accent',
            'bg-sf-muted': variant === 'muted' || variant === 'default',
          })}
        />
      )}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    ready: { label: 'Ready', variant: 'success' },
    generating: { label: 'Generating', variant: 'info' },
    refining: { label: 'Refining', variant: 'accent' },
    failed: { label: 'Failed', variant: 'error' },
    in_progress: { label: 'In Progress', variant: 'accent' },
    not_started: { label: 'Not Started', variant: 'muted' },
    completed: { label: 'Completed', variant: 'success' },
    overdue: { label: 'Overdue', variant: 'error' },
  }
  const config = map[status] ?? { label: status, variant: 'default' as BadgeVariant }
  return (
    <Badge variant={config.variant} dot>
      {config.label}
    </Badge>
  )
}

export function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    // Draft types
    exam_reviewer: 'Exam Reviewer',
    study_notes: 'Study Notes',
    summary: 'Summary',
    flashcard_set: 'Flashcard Set',
    // Draft source types
    module_resource: 'Learn Resource',
    task: 'Task',
    module: 'Module',
    upload: 'Upload',
    paste: 'Pasted',
    // Legacy / other types
    essay: 'Essay',
    study_guide: 'Study Guide',
    notes: 'Notes',
    flashcards: 'Flashcards',
    template: 'Template',
    outline: 'Outline',
    assignment: 'Assignment',
    quiz: 'Quiz',
    discussion: 'Discussion',
    lab: 'Lab',
    reading: 'Reading',
    video: 'Video',
    lesson: 'Lesson',
  }
  return <Badge variant="muted">{labels[type] ?? type}</Badge>
}
