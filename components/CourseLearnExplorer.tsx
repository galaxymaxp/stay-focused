'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ModuleQuickQuiz } from '@/components/ModuleQuickQuiz'
import { ModuleTermBank } from '@/components/ModuleTermBank'
import { StudyOutlineView } from '@/components/StudyOutlineView'
import type {
  CourseLearnModuleCard,
  CourseLearnMoreRow,
  CourseLearnStudyMaterialRow,
  CourseLearnTaskRow,
} from '@/lib/course-learn-overview'
import type { Task } from '@/lib/types'

export function CourseLearnExplorer({
  modules,
}: {
  modules: CourseLearnModuleCard[]
}) {
  const [openModuleId, setOpenModuleId] = useState<string | null>(null)
  const [focusedModuleId, setFocusedModuleId] = useState<string | null>(null)

  const visibleModules = focusedModuleId
    ? modules.filter((module) => module.id === focusedModuleId)
    : modules
  const focusedModule = focusedModuleId
    ? modules.find((module) => module.id === focusedModuleId) ?? null
    : null

  function toggleModule(moduleId: string) {
    setOpenModuleId((current) => current === moduleId ? null : moduleId)
  }

  function focusModule(moduleId: string) {
    setFocusedModuleId(moduleId)
    setOpenModuleId(moduleId)
  }

  function clearFocus() {
    setFocusedModuleId(null)
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      {focusedModule && (
        <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 360px' }}>
            <p className="ui-kicker">Focus mode</p>
            <p style={{ margin: '0.38rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              Only <strong style={{ color: 'var(--text-primary)' }}>{focusedModule.title}</strong> is visible right now so the course list stays out of the way while you study this module.
            </p>
          </div>
          <button type="button" onClick={clearFocus} className="ui-button ui-button-ghost ui-button-xs">
            Show all modules
          </button>
        </section>
      )}

      {visibleModules.map((module, index) => {
        const expanded = openModuleId === module.id
        const focused = focusedModuleId === module.id

        return (
          <article
            key={module.id}
            className={`motion-card motion-delay-${Math.min(index + 1, 4)}`}
            style={{
              borderRadius: 'var(--radius-panel)',
              border: expanded
                ? '1px solid color-mix(in srgb, var(--accent-border) 26%, var(--border-subtle) 74%)'
                : '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
              background: expanded
                ? 'color-mix(in srgb, var(--surface-elevated) 96%, transparent)'
                : 'color-mix(in srgb, var(--surface-soft) 94%, transparent)',
              boxShadow: expanded ? 'var(--shadow-soft)' : 'none',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'stretch', flexWrap: 'wrap', padding: '0.9rem 0.95rem' }}>
              <button
                type="button"
                onClick={() => toggleModule(module.id)}
                aria-expanded={expanded}
                style={{
                  flex: '1 1 520px',
                  minWidth: 0,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  display: 'grid',
                  gap: '0.55rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {module.orderLabel && (
                    <span className="ui-kicker" style={{ color: 'var(--text-muted)' }}>{module.orderLabel}</span>
                  )}
                  <ReadinessPill tone={module.readinessTone} label={module.readinessLabel} />
                  <CountPill label={`${module.outlineSectionCount} outline`} />
                  <CountPill label={`${module.termCount} term${module.termCount === 1 ? '' : 's'}`} />
                  <CountPill label={`${module.pendingTasks.length} active`} />
                  {module.completedTasks.length > 0 && <CountPill label={`${module.completedTasks.length} done`} />}
                </div>

                <div>
                  <h2 style={{ margin: 0, fontSize: expanded ? '21px' : '18px', lineHeight: 1.28, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {module.title}
                  </h2>
                  <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                    {module.coverageHint}
                  </p>
                  <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                    {truncateText(module.summary, expanded ? 240 : 170)}
                  </p>
                </div>
              </button>

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                {expanded && (
                  focused ? (
                    <button type="button" onClick={clearFocus} className="ui-button ui-button-ghost ui-button-xs">
                      Show all modules
                    </button>
                  ) : (
                    <button type="button" onClick={() => focusModule(module.id)} className="ui-button ui-button-ghost ui-button-xs">
                      Focus this module
                    </button>
                  )
                )}
                <Link href={module.moduleHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Open full page
                </Link>
                <button type="button" onClick={() => toggleModule(module.id)} className="ui-button ui-button-secondary ui-button-xs" aria-expanded={expanded}>
                  {expanded ? '- Collapse' : '+ Expand'}
                </button>
              </div>
            </div>

            {expanded && (
              <div style={{
                padding: '0 0.95rem 1rem',
                display: 'grid',
                gap: '0.95rem',
                borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
              }}>
                <div style={{
                  paddingTop: '0.95rem',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.05fr) minmax(280px, 0.95fr)',
                  gap: '0.85rem',
                  alignItems: 'start',
                }}>
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.6rem' }}>
                    <div>
                      <p className="ui-kicker">Module focus</p>
                      <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                        {module.summary}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                      {module.termsStateMessage}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                      <p className="ui-kicker">Module status</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem', marginTop: '0.7rem' }}>
                        <MiniStat label="Study sources" value={String(module.studyCount)} />
                        <MiniStat label="Quiz items" value={String(module.quizCount)} />
                        <MiniStat label="Active work" value={String(module.pendingTasks.length)} />
                        <MiniStat label="Completed" value={String(module.completedTasks.length)} />
                      </div>
                    </div>

                    {module.resumeCue && (
                      <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.4rem' }}>
                        <p className="ui-kicker">{module.resumeCue.promptLabel}</p>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                          {module.resumeCue.title}
                        </p>
                        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                          {module.resumeCue.note}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <section style={{ display: 'grid', gap: '0.8rem' }}>
                  <div>
                    <p className="ui-kicker">Study outline</p>
                    <h3 style={{ margin: '0.38rem 0 0', fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
                      Full module notes stay inside the card
                    </h3>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                      The expanded card reveals the full study outline directly here instead of sending you into another review layer.
                    </p>
                  </div>

                  {module.studyMaterials.length === 0 ? (
                    <SectionEmpty body="No active study materials are ready in this module yet." />
                  ) : (
                    <div style={{ display: 'grid', gap: '0.8rem' }}>
                      {module.studyMaterials.map((material) => (
                        <StudyMaterialOutlineCard key={material.id} moduleId={module.id} material={material} />
                      ))}
                    </div>
                  )}
                </section>

                <TaskStatusPanel moduleId={module.id} pendingTasks={module.pendingTasks} completedTasks={module.completedTasks} />

                <ModuleTermBank
                  moduleId={module.id}
                  courseId={module.courseId}
                  finalTerms={module.finalTerms}
                  suggestedTerms={module.suggestedTerms}
                  dismissedCount={module.dismissedTermCount}
                  embedded
                />

                <ModuleQuickQuiz
                  quizItems={module.quizItems}
                  finalTermCount={module.finalTerms.length}
                  embedded
                />

                <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    View extracted source
                  </summary>
                  <p style={{ margin: '0.7rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    {module.sourceSupportNote}
                  </p>

                  {module.studyMaterials.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.8rem' }}>
                      {module.studyMaterials.map((material) => (
                        <SourceItemRow
                          key={`${material.id}-source`}
                          title={material.title}
                          meta={`${material.fileTypeLabel} / ${material.readinessLabel}`}
                          note={material.note}
                          detailHref={material.readerHref}
                          canvasHref={material.canvasHref}
                        />
                      ))}
                    </div>
                  )}

                  {module.moreItems.length > 0 && (
                    <div style={{ display: 'grid', gap: '0.65rem', marginTop: '0.8rem' }}>
                      {module.moreItems.map((item) => (
                        <SupportSourceItemRow key={item.id} item={item} />
                      ))}
                    </div>
                  )}
                </details>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function StudyMaterialOutlineCard({
  moduleId,
  material,
}: {
  moduleId: string
  material: CourseLearnStudyMaterialRow
}) {
  return (
    <article
      style={{
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)',
        padding: '0.95rem 1rem',
        display: 'grid',
        gap: '0.7rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <CountPill label={material.fileTypeLabel} />
        <CountPill label={material.readinessLabel} />
        <CountPill label={material.progressLabel} />
        {material.required && <CountPill label="Required" />}
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: '15px', lineHeight: 1.42, color: 'var(--text-primary)', fontWeight: 650 }}>
          {material.title}
        </h4>
        <p style={{ margin: '0.38rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {material.note}
        </p>
      </div>

      {material.outlineSections.length > 0 ? (
        <StudyOutlineView sections={material.outlineSections} sectionStyle={{ padding: '0.8rem 0.85rem' }} />
      ) : (
        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
            {material.outlineHint ?? 'Structured study notes are not available for this source yet.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <Link href={material.readerHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
          Open reader
        </Link>
        {material.canvasHref && (
          <a href={material.canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open in Canvas
          </a>
        )}
        <Link href={`/modules/${moduleId}/do`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Open module Do
        </Link>
      </div>
    </article>
  )
}

function TaskStatusPanel({
  moduleId,
  pendingTasks,
  completedTasks,
}: {
  moduleId: string
  pendingTasks: CourseLearnTaskRow[]
  completedTasks: CourseLearnTaskRow[]
}) {
  return (
    <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <p className="ui-kicker">Task status</p>
          <h3 style={{ margin: '0.38rem 0 0', fontSize: '1rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
            Completed Canvas work stays marked while unfinished work stays visible
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <CountPill label={`${pendingTasks.length} active`} />
          <CountPill label={`${completedTasks.length} done`} />
        </div>
      </div>

      {pendingTasks.length === 0 ? (
        <SectionEmpty body="Nothing unfinished is pulling attention in this module right now." />
      ) : (
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {pendingTasks.slice(0, 3).map((task) => (
            <article key={task.id} style={{ borderRadius: 'var(--radius-tight)', border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)', background: 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)', padding: '0.8rem 0.85rem', display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.28rem' }}>
                    <TaskTonePill priority={task.priority} />
                    {task.deadline && <CountPill label={formatDeadlineLabel(task.deadline)} />}
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
                    {task.title}
                  </p>
                  {task.details && (
                    <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
                      {task.details}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <Link href={`/modules/${moduleId}/do#${task.id}`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                    Open in Do
                  </Link>
                  {task.canvasUrl && (
                    <a href={task.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Canvas
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {completedTasks.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Already done
          </summary>
          <div style={{ display: 'grid', gap: '0.55rem', marginTop: '0.7rem' }}>
            {completedTasks.map((task) => (
              <article key={task.id} style={{ borderRadius: 'var(--radius-tight)', border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)', padding: '0.78rem 0.82rem', display: 'grid', gap: '0.4rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <CountPill label={task.completionOrigin === 'canvas' ? 'Done in Canvas' : 'Completed'} />
                  {task.deadline && <CountPill label={formatDate(task.deadline)} />}
                </div>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.55, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                  {task.title}
                </p>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function SourceItemRow({
  title,
  meta,
  note,
  detailHref,
  canvasHref,
}: {
  title: string
  meta: string
  note: string
  detailHref: string
  canvasHref: string | null
}) {
  return (
    <article style={{ borderRadius: 'var(--radius-tight)', border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)', padding: '0.8rem 0.85rem', display: 'grid', gap: '0.45rem' }}>
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
        {meta}
      </p>
      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
        {title}
      </p>
      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
        {note}
      </p>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <Link href={detailHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Open reader
        </Link>
        {canvasHref && (
          <a href={canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Canvas
          </a>
        )}
      </div>
    </article>
  )
}

function SupportSourceItemRow({ item }: { item: CourseLearnMoreRow }) {
  return (
    <SourceItemRow
      title={item.title}
      meta={item.kindLabel}
      note={item.note}
      detailHref={item.detailHref}
      canvasHref={item.canvasHref}
    />
  )
}

function ReadinessPill({
  tone,
  label,
}: {
  tone: 'ready' | 'limited' | 'muted'
  label: string
}) {
  const background = tone === 'ready'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'limited'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'ready'
    ? 'color-mix(in srgb, var(--accent) 32%, var(--border-subtle) 68%)'
    : tone === 'limited'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.68rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: 1.2,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}

function CountPill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.62rem',
      borderRadius: '999px',
      border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
      background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
      fontSize: '11px',
      fontWeight: 600,
      lineHeight: 1.2,
      color: 'var(--text-muted)',
    }}>
      {label}
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.75rem' }}>
      <p style={{ margin: 0, fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: '0.32rem 0 0', fontSize: '18px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  )
}

function TaskTonePill({ priority }: { priority: Task['priority'] }) {
  const label = `${priority} priority`
  return <CountPill label={label} />
}

function SectionEmpty({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.68 }}>
      {body}
    </div>
  )
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const clipped = value.slice(0, maxLength)
  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
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
