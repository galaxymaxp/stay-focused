import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import type { Task, Deadline } from '@/lib/types'

interface Props { params: Promise<{ id: string }> }

export default async function ModulePage({ params }: Props) {
  const { id } = await params

  const { data: module } = await supabase.from('modules').select('*').eq('id', id).single()
  if (!module) notFound()

  const { data: tasks } = await supabase.from('tasks').select('*').eq('module_id', id).order('created_at')
  const { data: deadlines } = await supabase.from('deadlines').select('*').eq('module_id', id).order('date')

  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <div className="ui-card ui-card-soft ui-status-danger" style={{ borderRadius: 'var(--radius-control)', padding: '14px', fontSize: '14px' }}>
          Processing failed. Delete this module and try again.
        </div>
      </main>
    )
  }

  const label = (text: string) => (
    <h2 style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 10px' }}>
      {text}
    </h2>
  )

  return (
    <main className="page-shell page-shell-compact page-stack" style={{ gap: '1.5rem' }}>
      <section className="section-shell section-shell-elevated" style={{ padding: '1.25rem 1.2rem' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{module.title}</h1>
        {module.summary && (
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{module.summary}</p>
        )}
      </section>

      {deadlines && deadlines.length > 0 && (
        <section className="section-shell">
          {label('Deadlines')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {deadlines.map((d: Deadline) => (
              <li key={d.id} className="ui-card" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '10px 14px', borderRadius: 'var(--radius-tight)' }}>
                <span style={{ color: 'var(--text-primary)' }}>{d.label}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>{d.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks && tasks.length > 0 && (
        <section className="section-shell">
          {label('Tasks')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tasks.map((task: Task) => (
              <li key={task.id} className="ui-card" style={{ borderRadius: 'var(--radius-control)', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{task.title}</span>
                  <PriorityBadge priority={task.priority} />
                </div>
                {task.details && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{task.details}</p>}
                {task.deadline && <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>Due {task.deadline}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {module.recommended_order && (module.recommended_order as string[]).length > 0 && (
        <section className="section-shell">
          {label('Recommended order')}
          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(module.recommended_order as string[]).map((step, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px', color: 'var(--text-primary)' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '16px', flexShrink: 0 }}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

    </main>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles: Record<string, { background: string; color: string; border: string }> = {
    high: { background: 'color-mix(in srgb, var(--red-light) 24%, var(--surface-soft) 76%)', color: 'var(--red)', border: 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)' },
    medium: { background: 'color-mix(in srgb, var(--amber-light) 24%, var(--surface-soft) 76%)', color: 'var(--amber)', border: 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' },
    low: { background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)', color: 'var(--text-muted)', border: 'var(--border-subtle)' },
  }
  const s = styles[priority] ?? styles.low
  return (
    <span className="ui-chip" style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: 'var(--radius-tight)', background: s.background, color: s.color, flexShrink: 0 }}>
      {priority}
    </span>
  )
}
