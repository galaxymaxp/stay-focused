import { getClarityWorkspace, getTaskUrgencyLabel } from '@/lib/clarity-workspace'
import type { TaskItem } from '@/lib/types'

const GROUPS: Array<{ key: string; title: string; description: string; filter: (task: TaskItem) => boolean }> = [
  {
    key: 'urgent',
    title: 'Needs action now',
    description: 'High-pressure or near-term work that should stay visible first.',
    filter: (task) => task.status !== 'completed' && task.actionScore >= 70,
  },
  {
    key: 'soon',
    title: 'Coming up soon',
    description: 'Active work that is not immediate yet, but should be lined up before it crowds the week.',
    filter: (task) => task.status !== 'completed' && task.actionScore >= 36 && task.actionScore < 70,
  },
  {
    key: 'later',
    title: 'Can wait a bit',
    description: 'Clear, lower-pressure tasks that are still worth keeping visible.',
    filter: (task) => task.status !== 'completed' && task.actionScore < 36,
  },
  {
    key: 'done',
    title: 'Already done',
    description: 'Completed items still shown so the product flow feels like a real working queue.',
    filter: (task) => task.status === 'completed',
  },
]

export default async function DoPage() {
  const workspace = await getClarityWorkspace()

  return (
    <main className="page-shell page-stack">
      <header>
        <p className="ui-kicker">Do</p>
        <h1 className="ui-page-title">Actionable work, grouped by urgency and status</h1>
        <p className="ui-page-copy">
          This is the execution layer: extracted tasks, realistic timing, and enough context to act without reopening a messy course feed.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {GROUPS.map((group) => {
          const items = workspace.taskItems.filter(group.filter)

          return (
            <section key={group.key} className="section-shell section-shell-elevated" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div>
                  <p className="ui-kicker">{group.key}</p>
                  <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{group.title}</h2>
                  <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>{group.description}</p>
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
                    <article key={task.id} id={task.id} className="glass-panel glass-hover" style={{
                      ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
                      ['--glass-panel-border' as string]: 'var(--glass-border)',
                      ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
                      borderRadius: 'var(--radius-panel)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      opacity: task.status === 'completed' ? 0.72 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                            <span className="ui-chip" style={priorityChipStyle(task.priority)}>{task.priority} priority</span>
                            <span className="ui-chip ui-chip-soft">{task.taskType}</span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: '17px', lineHeight: 1.3, fontWeight: 650, color: 'var(--text-primary)' }}>{task.title}</h3>
                        </div>
                        <span className="ui-chip ui-chip-soft">{task.estimatedMinutes} min</span>
                      </div>

                      {task.details && (
                        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>{task.details}</p>
                      )}

                      <div className="ui-meta-list">
                        <span><strong>Course:</strong> {task.courseName}</span>
                        <span><strong>Module:</strong> {task.moduleTitle}</span>
                        <span><strong>Timing:</strong> {getTaskUrgencyLabel(task)}</span>
                        <span><strong>Status:</strong> {task.status}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
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
