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
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <div style={{ background: 'var(--red-light)', border: '1px solid #F5C5BC', borderRadius: '10px', padding: '14px', fontSize: '14px', color: 'var(--red)' }}>
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
    <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>{module.title}</h1>
        {module.summary && (
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{module.summary}</p>
        )}
      </div>

      {deadlines && deadlines.length > 0 && (
        <section>
          {label('Deadlines')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {deadlines.map((d: Deadline) => (
              <li key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                <span style={{ color: 'var(--text-primary)' }}>{d.label}</span>
                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '13px' }}>{d.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tasks && tasks.length > 0 && (
        <section>
          {label('Tasks')}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tasks.map((task: Task) => (
              <li key={task.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
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
        <section>
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
    high: { background: 'var(--red-light)', color: 'var(--red)', border: '#F5C5BC' },
    medium: { background: 'var(--amber-light)', color: 'var(--amber)', border: '#F0DCBF' },
    low: { background: 'var(--bg-hover)', color: 'var(--text-muted)', border: 'var(--border)' },
  }
  const s = styles[priority] ?? styles.low
  return (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '6px', border: `1px solid ${s.border}`, background: s.background, color: s.color, flexShrink: 0 }}>
      {priority}
    </span>
  )
}