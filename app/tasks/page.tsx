import Link from 'next/link'
import { SyncFirstEmptyState } from '@/components/SyncFirstEmptyState'
import { getClarityWorkspace, getTaskUrgencyLabel } from '@/lib/clarity-workspace'
import { buildModuleDoHref, getSearchParamValue } from '@/lib/stay-focused-links'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { TaskDraftButton } from '@/components/DoNowButton'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
import type { TaskItem } from '@/lib/types'

const GROUPS: Array<{ key: string; eyebrow: string; title: string; description: string; filter: (task: TaskItem) => boolean }> = [
  {
    key: 'urgent',
    eyebrow: 'Urgent',
    title: 'Overdue or due soon',
    description: 'Work that is already pressing on today or the next few days.',
    filter: (task) => task.status !== 'completed' && task.actionScore >= 70,
  },
  {
    key: 'soon',
    eyebrow: 'Coming up',
    title: 'Coming up next',
    description: 'Tasks that are active, but not at panic level yet.',
    filter: (task) => task.status !== 'completed' && task.actionScore >= 36 && task.actionScore < 70,
  },
  {
    key: 'later',
    eyebrow: 'Later',
    title: 'Later',
    description: 'Clear, lower-pressure tasks that can wait a bit without disappearing.',
    filter: (task) => task.status !== 'completed' && task.actionScore < 36,
  },
]

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function TasksPage({ searchParams }: Props) {
  const workspace = await getClarityWorkspace()
  const resolvedSearchParams = await searchParams
  if (!workspace.hasSyncedData) {
    return (
      <main className="page-shell page-stack">
        <SyncFirstEmptyState eyebrow="Tasks" />
      </main>
    )
  }

  const targetTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const targetTaskTitle = getSearchParamValue(resolvedSearchParams?.taskTitle)
  const draftAutoOpen = getSearchParamValue(resolvedSearchParams?.donow) === '1'
  const highlightedTaskId = (() => {
    if (targetTaskId) {
      return workspace.taskItems.find((task) => task.id === targetTaskId)?.id ?? null
    }

    if (targetTaskTitle) {
      const normalizedTitle = targetTaskTitle.trim().toLowerCase()
      return workspace.taskItems.find((task) => task.title.trim().toLowerCase() === normalizedTitle)?.id ?? null
    }

    return null
  })()

  const completedItems = workspace.taskItems
    .filter((task) => task.status === 'completed')
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <main className="page-shell page-stack">
      <header className="motion-card page-intro">
        <p className="ui-kicker">Tasks</p>
        <h1 className="ui-page-title">Tasks, grouped by what matters first</h1>
        <p className="ui-page-copy page-intro-copy">
          Keep the active list compact: urgent work first, lower-pressure work later, and completed items hidden until you need them.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {GROUPS.map((group) => {
          const items = workspace.taskItems.filter(group.filter)

          return (
            <section key={group.key} className="motion-card motion-delay-1 section-shell" style={{ padding: '1.05rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <div>
                  <p className="ui-kicker">{group.eyebrow}</p>
                  <h2 className="ui-section-title" style={{ marginTop: '0.36rem' }}>{group.title}</h2>
                  <p className="ui-section-copy" style={{ marginTop: '0.32rem' }}>{group.description}</p>
                </div>
                <span className="ui-chip ui-chip-soft">{items.length} task{items.length === 1 ? '' : 's'}</span>
              </div>

              {items.length === 0 ? (
                <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px' }}>
                  Nothing falls into this group right now.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                  {items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      highlighted={highlightedTaskId === task.id}
                      autoOpenDraft={draftAutoOpen && highlightedTaskId === task.id}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.05rem' }}>
        <details>
          <summary style={{
            cursor: 'pointer',
            listStyle: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <div>
              <p className="ui-kicker">Done</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.36rem' }}>Completed items</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.32rem' }}>
                Hidden by default so active work stays easier to scan.
              </p>
            </div>
            <span className="ui-chip ui-chip-soft">{completedItems.length} completed</span>
          </summary>

          <div style={{ marginTop: '1rem' }}>
            {completedItems.length === 0 ? (
              <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px' }}>
                Nothing has been marked complete yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
                {completedItems.map((task) => {
                  const taskHref = buildModuleDoHref(task.moduleId, { taskTitle: task.title })

                  return (
                    <article key={task.id} className="ui-card-soft ui-interactive-card task-card-shell task-card-shell-complete" style={{
                      borderRadius: 'var(--radius-panel)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}>
                      <div className="task-card-frame">
                        <Link href={taskHref} className="ui-interactive-row task-card-link">
                          <p className="task-card-title" style={{ margin: 0, fontSize: '16px', lineHeight: 1.35, fontWeight: 650, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                            {task.title}
                          </p>
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {task.courseName} | {task.moduleTitle}
                          </p>
                        </Link>
                        <div className="task-card-side task-card-side-compact">
                          <span className="ui-chip ui-status-success task-card-side-chip" style={{ padding: '0.28rem 0.6rem', fontSize: '11px', fontWeight: 700 }}>
                            Done
                          </span>
                          <TaskStatusToggle
                            status={task.status}
                            moduleId={task.moduleId}
                            title={task.title}
                            taskItemId={task.id}
                            style={{ justifyContent: 'center' }}
                          />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </details>
      </section>
    </main>
  )
}

function TaskCard({
  task,
  highlighted = false,
  autoOpenDraft = false,
}: {
  task: TaskItem
  highlighted?: boolean
  autoOpenDraft?: boolean
}) {
  const taskHref = buildModuleDoHref(task.moduleId, { taskTitle: task.title })
  const manualCopy = buildManualCopyBundle({
    taskTitle: task.title,
    courseName: task.courseName,
    moduleName: task.moduleTitle,
    dueDate: task.deadline,
    taskType: task.taskType,
    taskDetails: task.details,
  })

  return (
    <article id={task.id} className="ui-card ui-interactive-card task-card-shell" style={{
      borderColor: highlighted
        ? 'color-mix(in srgb, var(--accent-border) 32%, var(--border-subtle) 68%)'
        : 'var(--border-subtle)',
      boxShadow: highlighted ? 'var(--shadow-low)' : 'none',
      borderRadius: 'var(--radius-panel)',
      padding: '0.92rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.68rem',
      opacity: task.status === 'completed' ? 0.72 : 1,
    }}>
      <div className="task-card-frame">
        <Link href={taskHref} className="ui-interactive-row task-card-link">
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
            <span className="ui-chip" style={priorityChipStyle(task.priority)}>{task.priority} priority</span>
            <span className="ui-chip ui-chip-soft">{task.taskType}</span>
          </div>
          <h3 className="task-card-title" style={{ margin: 0, fontSize: '16px', lineHeight: 1.34, fontWeight: 650, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{task.title}</h3>
          {task.details && (
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.58, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{task.details}</p>
          )}
          <div className="ui-meta-list">
            <span><strong>Course:</strong> {task.courseName}</span>
            <span><strong>Module:</strong> {task.moduleTitle}</span>
            <span><strong>Timing:</strong> {getTaskUrgencyLabel(task)}</span>
          </div>
        </Link>
        <div className="task-card-side">
          <span className="ui-chip ui-chip-soft task-card-side-chip">{task.estimatedMinutes} min</span>
          <TaskStatusToggle
            status={task.status}
            moduleId={task.moduleId}
            title={task.title}
            taskItemId={task.id}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <TaskDraftButton
          defaultOpen={autoOpenDraft}
          copyBundle={manualCopy}
          context={{
            taskTitle: task.title,
            taskDetails: task.details,
            deadline: task.deadline,
            priority: task.priority,
            courseName: task.courseName,
            moduleTitle: task.moduleTitle,
            canvasUrl: task.canvasUrl,
          }}
          buttonStyle={actionButtonStyle}
        />
        {task.canvasUrl && (
          <a href={task.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={actionButtonStyle}>
            Open in Canvas
          </a>
        )}
      </div>
    </article>
  )
}

function priorityChipStyle(priority: 'high' | 'medium' | 'low') {
  if (priority === 'high') {
    return {
      padding: '0.25rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--amber-light) 40%, var(--surface-soft) 60%)',
      color: 'var(--amber)',
      border: '1px solid color-mix(in srgb, var(--amber) 26%, var(--border-subtle) 74%)',
    }
  }

  if (priority === 'medium') {
    return {
      padding: '0.25rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--accent-light) 44%, var(--surface-soft) 56%)',
      color: 'var(--accent-foreground)',
      border: '1px solid color-mix(in srgb, var(--accent-border) 32%, var(--border-subtle) 68%)',
    }
  }

  return {
    padding: '0.25rem 0.55rem',
    fontSize: '11px',
    fontWeight: 700,
    background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  }
}

const actionButtonStyle = {
  minHeight: '2rem',
  padding: '0.45rem 0.72rem',
  fontSize: '12px',
  fontWeight: 700,
  borderRadius: 'var(--radius-control)',
  textDecoration: 'none',
}
