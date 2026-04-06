import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { ModuleQuickQuiz } from '@/components/ModuleQuickQuiz'
import { ModuleTermBank } from '@/components/ModuleTermBank'
import { TaskStatusToggle } from '@/components/TaskStatusToggle'
import { buildModuleLearnOverview, type ModuleStudyMaterial } from '@/lib/module-learn-overview'
import { buildModuleTermBank } from '@/lib/module-term-bank'
import {
  buildLearnExperience,
  extractCourseName,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceCanvasHref,
  type LearnSection,
} from '@/lib/module-workspace'
import type { Task } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LearnPage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, resources: storedResources, resourceStudyStates, terms } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: storedResources,
    resourceStudyStates,
  })
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks,
  })
  const termBank = buildModuleTermBank({
    overview,
    storedTerms: terms,
  })
  const sortedTasks = sortModuleTasks(tasks)
  const pendingTasks = sortedTasks.filter((task) => task.status !== 'completed')
  const completedTasks = sortedTasks.filter((task) => task.status === 'completed')
  const featuredSections = pickFeaturedSections(experience.sections)
  const extraSections = experience.sections.filter((section) => !featuredSections.some((featured) => featured.id === section.id))
  const summaryText = overview.summary ?? module.summary ?? featuredSections[0]?.body ?? termBank.termsStateMessage

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
      currentLens="learn"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={overview.summaryStateMessage}
    >
      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 460px' }}>
              <p className="ui-kicker">Unified Learn workspace</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Learn the module, scan the terms, and quiz yourself in one place</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '46rem' }}>
                This page keeps the grounded study content first, lays the extracted terms directly underneath it, and keeps quiz practice in the same module flow instead of splitting it into a separate mode.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="ui-chip ui-chip-soft">{featuredSections.length + extraSections.length} learn section{featuredSections.length + extraSections.length === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{termBank.finalTerms.length} key term{termBank.finalTerms.length === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{termBank.quizItems.length} quiz item{termBank.quizItems.length === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{pendingTasks.length} active task{pendingTasks.length === 1 ? '' : 's'}</span>
              {completedTasks.length > 0 && <span className="ui-chip ui-chip-soft">{completedTasks.length} done</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(300px, 0.95fr)', gap: '0.9rem', alignItems: 'start' }}>
            <div className="glass-panel glass-accent" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', display: 'grid', gap: '0.85rem' }}>
              <div>
                <p className="ui-kicker">Module focus</p>
                <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)' }}>
                  {summaryText}
                </p>
              </div>

              {overview.suggestedSteps.length > 0 && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                  <p className="ui-kicker">Suggested flow</p>
                  <ol style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.55rem' }}>
                    {overview.suggestedSteps.map((step, index) => (
                      <li key={step.id}>
                        <ActionLink
                          href={step.href}
                          external={step.external}
                          style={{
                            display: 'flex',
                            gap: '0.7rem',
                            alignItems: 'flex-start',
                            textDecoration: 'none',
                            color: 'inherit',
                          }}
                        >
                          <span style={{
                            width: '1.45rem',
                            height: '1.45rem',
                            borderRadius: '999px',
                            background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)',
                            color: 'var(--text-primary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ display: 'grid', gap: '0.18rem' }}>
                            <span style={{ fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>
                              {step.title}
                            </span>
                            <span style={{ fontSize: '12px', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                              {step.note}
                            </span>
                          </span>
                        </ActionLink>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>

            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem' }}>
                <StatCard label="Grounded sources" value={String(termBank.groundedSourceCount)} />
                <StatCard label="Readable chars" value={termBank.groundedCharCount.toLocaleString()} />
                <StatCard label="Ready readers" value={String(overview.readyStudyFileCount)} />
                <StatCard label="Completed work" value={String(completedTasks.length)} />
              </div>

              {overview.resumeTarget && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.45rem' }}>
                  <p className="ui-kicker">{overview.resumeTarget.promptLabel}</p>
                  <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {overview.resumeTarget.resource.title}
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    {overview.resumeTarget.note}
                  </p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <ActionButton href={overview.resumeTarget.href} label={overview.resumeTarget.actionLabel} external={overview.resumeTarget.external} tone="secondary" />
                    <Link href={`/modules/${module.id}/source`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                      Open Source
                    </Link>
                  </div>
                </div>
              )}

              {experience.audit.note && (
                <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                  <p className="ui-kicker">Grounding note</p>
                  <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                    {experience.audit.note}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.18fr) minmax(320px, 0.92fr)', gap: '1rem', alignItems: 'start' }}>
          <section className="motion-card motion-delay-2 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'grid', gap: '0.95rem' }}>
            <div>
              <p className="ui-kicker">Learn material</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.08rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Grounded study content for this module</h3>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '44rem' }}>
                The summary, structure, likely test focus, and follow-up prompts stay visible before you move into term review and quiz practice.
              </p>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem' }}>
              {featuredSections.map((section) => (
                <StudySectionCard key={section.id} section={section} />
              ))}
            </div>

            {extraSections.length > 0 && (
              <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem' }}>
                <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  More study angles
                </summary>
                <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.85rem' }}>
                  {extraSections.map((section) => (
                    <StudySectionCard key={section.id} section={section} subtle />
                  ))}
                </div>
              </details>
            )}
          </section>

          <aside style={{ display: 'grid', gap: '1rem' }}>
            <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.2rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">Action status</p>
                  <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.02rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Finished graded work already drops out of the way</h3>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span className="ui-chip ui-chip-soft">{pendingTasks.length} active</span>
                  <span className="ui-chip ui-chip-soft">{completedTasks.length} done</span>
                </div>
              </div>

              {pendingTasks.length === 0 ? (
                <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
                  No unfinished module work is demanding attention right now.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {pendingTasks.map((task) => (
                    <article key={task.id} className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.92rem 0.95rem', display: 'grid', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                            <PriorityBadge priority={task.priority} />
                            {task.deadline && <StateBadge label={formatDeadlineLabel(task.deadline)} tone={deadlineTone(task.deadline)} />}
                          </div>
                          <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>{task.title}</p>
                          {task.details && (
                            <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                              {task.details}
                            </p>
                          )}
                        </div>
                        <TaskStatusToggle status={task.status} moduleId={module.id} title={task.title} legacyTaskId={task.id} align="end" />
                      </div>

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <Link href={`/modules/${module.id}/do#${task.id}`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                          Open in Do
                        </Link>
                        {task.canvasUrl && (
                          <a href={task.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                            Open in Canvas
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {completedTasks.length > 0 && (
                <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 0.95rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Already done
                  </summary>
                  <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.8rem' }}>
                    {completedTasks.map((task) => (
                      <article key={task.id} style={{ display: 'grid', gap: '0.5rem', padding: '0.8rem 0.85rem', borderRadius: 'var(--radius-tight)', border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                              <CompletionBadge origin={task.completionOrigin ?? null} />
                              {task.deadline && <StateBadge label={formatDate(task.deadline)} tone="muted" />}
                            </div>
                            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-muted)', textDecoration: 'line-through' }}>{task.title}</p>
                          </div>
                          <TaskStatusToggle status={task.status} moduleId={module.id} title={task.title} legacyTaskId={task.id} align="end" />
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </section>

            <section className="motion-card motion-delay-3 section-shell" style={{ padding: '1.2rem 1.25rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="ui-kicker">Grounded sources</p>
                  <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.02rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Keep the strongest readers nearby</h3>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <StateBadge label={`${overview.readyStudyFileCount} ready`} tone="accent" />
                  {overview.limitedStudyFileCount > 0 && <StateBadge label={`${overview.limitedStudyFileCount} limited`} tone="warning" />}
                </div>
              </div>

              {overview.studyMaterials.length === 0 ? (
                <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
                  No study readers are mapped into this module yet, so Learn is leaning on the summary, tasks, and any grounded terms it can find.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '0.7rem' }}>
                  {overview.studyMaterials.slice(0, 3).map((material) => (
                    <StudyMaterialCard key={material.resource.id} moduleId={module.id} material={material} />
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <Link href={`/modules/${module.id}/source`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Open full Source
                </Link>
              </div>
            </section>
          </aside>
        </div>

        <div id="terms">
          <ModuleTermBank
            moduleId={module.id}
            courseId={module.courseId}
            finalTerms={termBank.finalTerms}
            suggestedTerms={termBank.suggestedTerms}
            dismissedCount={termBank.dismissedCount}
          />
        </div>

        <div id="quiz">
          <ModuleQuickQuiz quizItems={termBank.quizItems} finalTermCount={termBank.finalTerms.length} />
        </div>
      </div>
    </ModuleLensShell>
  )
}

function StudySectionCard({
  section,
  subtle = false,
}: {
  section: LearnSection
  subtle?: boolean
}) {
  const lines = section.body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <article className={subtle ? 'ui-card-soft' : 'glass-panel glass-soft'} style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
      <p className="ui-kicker">{section.title}</p>
      <ul style={{ margin: '0.65rem 0 0', paddingLeft: '1rem', display: 'grid', gap: '0.45rem' }}>
        {lines.map((line) => (
          <li key={line} style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {line}
          </li>
        ))}
      </ul>
    </article>
  )
}

function StudyMaterialCard({
  moduleId,
  material,
}: {
  moduleId: string
  material: ModuleStudyMaterial
}) {
  const canvasHref = getResourceCanvasHref(material.resource)

  return (
    <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.92rem 0.95rem', display: 'grid', gap: '0.65rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <StateBadge label={material.fileTypeLabel} tone="muted" />
        <StateBadge
          label={material.readinessLabel}
          tone={material.readiness === 'ready' ? 'accent' : material.readiness === 'limited' ? 'warning' : 'muted'}
        />
        {material.resource.required && <StateBadge label="Required" tone="warning" />}
      </div>

      <div>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>{material.resource.title}</p>
        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>{material.note}</p>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <Link href={getLearnResourceHref(moduleId, material.resource.id)} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
          Open reader
        </Link>
        {canvasHref && (
          <a href={canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open in Canvas
          </a>
        )}
      </div>
    </article>
  )
}

function ActionLink({
  href,
  external = false,
  children,
  style,
}: {
  href: string
  external?: boolean
  children: ReactNode
  style?: CSSProperties
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" style={style}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href} style={style}>
      {children}
    </Link>
  )
}

function ActionButton({
  href,
  label,
  external = false,
  tone,
}: {
  href: string
  label: string
  external?: boolean
  tone: 'secondary' | 'ghost'
}) {
  const className = `ui-button ${tone === 'secondary' ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} style={{ textDecoration: 'none' }}>
        {label}
      </a>
    )
  }

  return (
    <Link href={href} className={className} style={{ textDecoration: 'none' }}>
      {label}
    </Link>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.4rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function StateBadge({
  label,
  tone,
}: {
  label: string
  tone: 'accent' | 'warning' | 'muted'
}) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.64rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
      color: 'var(--text-primary)',
    }}>
      {label}
    </span>
  )
}

function CompletionBadge({ origin }: { origin: Task['completionOrigin'] }) {
  return (
    <StateBadge
      label={origin === 'canvas' ? 'Done in Canvas' : 'Completed'}
      tone={origin === 'canvas' ? 'accent' : 'muted'}
    />
  )
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  return (
    <StateBadge
      label={`${priority} priority`}
      tone={priority === 'high' ? 'warning' : priority === 'medium' ? 'accent' : 'muted'}
    />
  )
}

function pickFeaturedSections(sections: LearnSection[]) {
  const preferredOrder = [
    'core-ideas',
    'step-by-step-breakdown',
    'likely-exam-focus',
    'what-to-do-after-reading',
  ]
  const chosen: LearnSection[] = []

  for (const id of preferredOrder) {
    const match = sections.find((section) => section.id === id)
    if (match) chosen.push(match)
  }

  if (chosen.length === 0) {
    return sections.slice(0, 4)
  }

  return chosen
}

function sortModuleTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const statusDiff = Number(left.status === 'completed') - Number(right.status === 'completed')
    if (statusDiff !== 0) return statusDiff

    const leftDeadline = sortableDateValue(left.deadline)
    const rightDeadline = sortableDateValue(right.deadline)
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline

    const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority)
    if (priorityDiff !== 0) return priorityDiff

    return left.title.localeCompare(right.title)
  })
}

function priorityWeight(priority: Task['priority']) {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function sortableDateValue(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return date.getTime()
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

function deadlineTone(value: string): 'warning' | 'accent' | 'muted' {
  const daysUntil = Math.ceil((new Date(value).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil <= 1) return 'warning'
  if (daysUntil <= 7) return 'accent'
  return 'muted'
}
