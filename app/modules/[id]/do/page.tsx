import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { buildLearnExperience, extractCourseName, findRecommendedStepTargets, getModuleWorkspace, getResourceCanvasHref, matchTaskToResource } from '@/lib/module-workspace'
import { buildModuleLearnHref, getSearchParamValue, getTaskElementId } from '@/lib/stay-focused-links'
import { sortTasksByRecommendation } from '@/lib/task-ranking'
import { DoNowButton } from '@/components/DoNowButton'
import { buildDoNowResourceSnippet } from '@/lib/do-now'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function DoPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources } = workspace
  const courseName = extractCourseName(module.raw_content)
  const pendingTasks = sortTasksByRecommendation(tasks.filter((task) => task.status !== 'completed'))
  const completedTasks = tasks.filter((task) => task.status === 'completed')
  const learnExperience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
  })
  const suggestedSteps = findRecommendedStepTargets(module, learnExperience, tasks)
  const targetTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const targetTaskTitle = getSearchParamValue(resolvedSearchParams?.taskTitle)
  const targetResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const doNowAutoOpen = getSearchParamValue(resolvedSearchParams?.donow) === '1'
  const allTasks = [...pendingTasks, ...completedTasks]
  // Resolve the targeted task using whichever matching strategy the URL encodes:
  //   ?task=     — ID match (module-internal links from tasks table, e.g. Suggested Order)
  //   ?taskTitle — title match (cross-table links from task_items, e.g. Calendar, Today, global Do)
  //   ?resource  — resource title fuzzy match (resource-based deep links)
  const targetedTask = (() => {
    if (targetTaskId) return allTasks.find((t) => t.id === targetTaskId) ?? null
    if (targetTaskTitle) {
      const normalized = targetTaskTitle.trim().toLowerCase()
      return allTasks.find((t) => t.title.trim().toLowerCase() === normalized) ?? null
    }
    if (targetResourceId) {
      return pendingTasks.find((task) => matchTaskToResource(task.title, learnExperience.resources)?.id === targetResourceId)
        ?? completedTasks.find((task) => matchTaskToResource(task.title, learnExperience.resources)?.id === targetResourceId)
        ?? null
    }
    return null
  })()
  const highlightedTaskId = targetedTask?.id ?? null
  const shouldOpenCompleted = Boolean(highlightedTaskId && completedTasks.some((task) => task.id === highlightedTaskId))

  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <div className="ui-card ui-card-soft ui-status-danger" style={{ borderRadius: 'var(--radius-control)', padding: '14px', fontSize: '14px' }}>
          Processing failed. Delete this module and try again.
        </div>
      </main>
    )
  }

  return (
    <ModuleLensShell
      currentLens="do"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={module.summary}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <p className="ui-kicker">
                Task feed
              </p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>
                What exactly needs to get done
              </h2>
            </div>
            <span className="ui-chip ui-chip-soft">
              {pendingTasks.length} active task{pendingTasks.length === 1 ? '' : 's'}
            </span>
          </div>

          {pendingTasks.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.6 }}>
              Nothing active is left in this module right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {pendingTasks.map((task, index) => {
                const matchedResource = matchTaskToResource(task.title, learnExperience.resources)
                const learnHref = buildModuleLearnHref(module.id, matchedResource
                  ? {
                      resourceId: matchedResource.id,
                      panel: 'study-notes',
                    }
                  : {
                      taskId: task.id,
                      panel: 'action-status',
                    })
                const canvasHref = task.canvasUrl ?? (matchedResource ? getResourceCanvasHref(matchedResource) : null)
                const resourceSnippet = buildDoNowResourceSnippet(
                  matchedResource?.extractedText
                    ?? matchedResource?.extractedTextPreview
                    ?? matchedResource?.linkedContext
                    ?? matchedResource?.whyItMatters
                    ?? null,
                  600,
                )

                return (
                  <article key={task.id} id={getTaskElementId(task.id)} className="glass-panel" style={{
                    ['--glass-panel-bg' as string]: index === 0 ? 'color-mix(in srgb, var(--glass-surface-accent) 34%, var(--glass-surface-strong) 66%)' : 'var(--glass-surface-strong)',
                    ['--glass-panel-border' as string]: highlightedTaskId === task.id
                      ? 'color-mix(in srgb, var(--accent-border) 42%, var(--border-subtle) 58%)'
                      : index === 0
                        ? 'var(--accent-border)'
                        : 'var(--glass-border)',
                    ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                    borderRadius: 'var(--radius-panel)',
                    padding: '0.9rem 0.95rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.72rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                          <span className="ui-chip" style={priorityChipStyle(task.priority)}>
                            {task.priority} priority
                          </span>
                          {task.deadline && (
                            <span className="ui-chip" style={deadlineChipStyle(task.deadline)}>
                              {formatDeadlineLabel(task.deadline)}
                            </span>
                          )}
                        </div>
                        <h3 style={{ margin: 0, fontSize: '17px', lineHeight: 1.3, fontWeight: 650, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{task.title}</h3>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Step {index + 1}</span>
                    </div>

                    {task.details && (
                      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.62, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{task.details}</p>
                    )}

                    <TaskStatusToggle
                      status={task.status}
                      moduleId={module.id}
                      title={task.title}
                      legacyTaskId={task.id}
                    />

                    <div className="ui-meta-list">
                      <span><strong>Course:</strong> {courseName}</span>
                      <span><strong>Source:</strong> {module.title}</span>
                      <span><strong>Timing:</strong> {task.deadline ? `Due ${formatDate(task.deadline)}` : 'No due date found'}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <DoNowButton
                        defaultOpen={doNowAutoOpen && highlightedTaskId === task.id}
                        context={{
                          taskTitle: task.title,
                          taskDetails: task.details,
                          deadline: task.deadline,
                          priority: task.priority,
                          courseName,
                          moduleTitle: module.title,
                          studyPrompts: module.study_prompts,
                          concepts: module.concepts,
                          moduleSummary: module.summary,
                          resourceSnippet,
                          canvasUrl: task.canvasUrl,
                          learnHref,
                        }}
                      />
                      <Link href={learnHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                        Open Learn
                      </Link>
                      {canvasHref ? (
                        <a href={canvasHref} target="_blank" rel="noreferrer" className={`ui-button ${task.canvasUrl ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`} style={{ textDecoration: 'none' }}>
                          Open in Canvas
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {completedTasks.length > 0 && (
            <details open={shouldOpenCompleted} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)' }}>
              <summary className="ui-interactive-summary">
                <div>
                  <p className="ui-kicker">
                    Already cleared
                  </p>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                    Completed tasks stay tucked away unless you need to reopen one.
                  </p>
                </div>
                <span className="ui-chip ui-chip-soft">{completedTasks.length} completed</span>
              </summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.85rem' }}>
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    id={getTaskElementId(task.id)}
                    className="ui-card-soft"
                    style={{
                      borderRadius: 'var(--radius-tight)',
                      padding: '0.8rem 0.9rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                      border: highlightedTaskId === task.id
                        ? '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
                        : undefined,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{task.title}</p>
                    <TaskStatusToggle
                      status={task.status}
                      moduleId={module.id}
                      title={task.title}
                      legacyTaskId={task.id}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {module.recommended_order && module.recommended_order.length > 0 && (
            <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.15rem' }}>
              <p className="ui-kicker">
                Suggested order
              </p>
              <ol style={{ listStyle: 'none', padding: 0, margin: '0.85rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {suggestedSteps.map((step, index) => (
                  <li key={step.id}>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem', display: 'grid', gap: '0.55rem' }}>
                      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
                        <span style={{ width: '1.4rem', height: '1.4rem', borderRadius: '999px', background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                          {index + 1}
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem', minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>{step.label}</span>
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span className="ui-chip" style={suggestedOrderTypeChipStyle(step.type)}>{suggestedOrderTypeLabel(step.type)}</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{step.destinationLabel}</span>
                          </div>
                        </span>
                      </div>
                      <div>
                        <Link href={step.href} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                          {step.actionLabel}
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.15rem' }}>
            <p className="ui-kicker">
              Deadlines
            </p>
            {deadlines.length === 0 ? (
              <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem', fontSize: '13px', lineHeight: 1.6, marginTop: '0.85rem' }}>
                No separate deadlines were extracted for this module.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.85rem' }}>
                {deadlines.map((deadline) => (
                  <div key={deadline.id} className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.45, color: 'var(--text-primary)' }}>{deadline.label}</p>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{formatDate(deadline.date)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </ModuleLensShell>
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

function deadlineChipStyle(deadline: string) {
  const daysUntil = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const color = daysUntil <= 1 ? 'var(--amber)' : 'var(--text-secondary)'
  const background = daysUntil <= 1
    ? 'color-mix(in srgb, var(--amber-light) 40%, var(--surface-soft) 60%)'
    : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'

  return {
    padding: '0.25rem 0.55rem',
    fontSize: '11px',
    fontWeight: 700,
    background,
    color,
    border: `1px solid ${daysUntil <= 1 ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' : 'var(--border-subtle)'}`,
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDeadlineLabel(value: string) {
  const daysUntil = Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'Past due'
  if (daysUntil === 0) return 'Due today'
  if (daysUntil === 1) return 'Due tomorrow'
  if (daysUntil <= 7) return `Due in ${daysUntil} days`
  return formatDate(value)
}

function suggestedOrderTypeLabel(type: 'task' | 'learn' | 'review' | 'quiz' | 'module' | 'announcement') {
  if (type === 'task') return 'Task'
  if (type === 'learn') return 'Learn'
  if (type === 'review') return 'Review'
  if (type === 'quiz') return 'Quiz'
  if (type === 'announcement') return 'Announcement'
  return 'Module'
}

function suggestedOrderTypeChipStyle(type: 'task' | 'learn' | 'review' | 'quiz' | 'module' | 'announcement') {
  if (type === 'task') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--amber-light) 38%, var(--surface-soft) 62%)',
      color: 'var(--amber)',
      border: '1px solid color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)',
    }
  }

  if (type === 'quiz') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--blue-light) 38%, var(--surface-soft) 62%)',
      color: 'var(--blue)',
      border: '1px solid color-mix(in srgb, var(--blue) 24%, var(--border-subtle) 76%)',
    }
  }

  return {
    padding: '0.22rem 0.55rem',
    fontSize: '11px',
    fontWeight: 700,
    background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  }
}
