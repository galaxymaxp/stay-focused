import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { ModuleOverviewCard } from '@/components/ModuleOverviewCard'
import { StudyResourceAccordionList } from '@/components/StudyResourceAccordionList'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { listDeepLearnNotesForModule } from '@/lib/deep-learn-store'
import { getDeepLearnResourceUiState } from '@/lib/deep-learn-ui'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildModuleOverviewFallback, getModuleSummary, listResourceSummaries } from '@/lib/source-summaries'
import { getSourceReadinessBucket, normalizeSourceReadiness } from '@/lib/source-readiness'
import { buildModuleDoHref, getSearchParamValue, getTaskElementId } from '@/lib/stay-focused-links'
import {
  buildLearnExperience,
  extractCourseName,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceOriginalFileHref,
  getResourceCanvasHref,
  resolveLearnResourceSelection,
} from '@/lib/module-workspace'
import type { Task } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LearnPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, resources: storedResources, resourceStudyStates, courseInstructor } = workspace
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
  const deepLearnNotesResult = await listDeepLearnNotesForModule(module.id)
  const deepLearnNotes = deepLearnNotesResult.notes
  const deepLearnNoteByResourceId = new Map(deepLearnNotes.map((note) => [note.resourceId, note]))
  const [resourceSummaryById, moduleSummary] = await Promise.all([
    listResourceSummaries(storedResources.map((resource) => resource.id)),
    getModuleSummary(module.id),
  ])
  const moduleOverviewFallback = buildModuleOverviewFallback({
    readyCount: overview.readyStudyFileCount,
    needsActionCount: overview.limitedStudyFileCount,
    summary: moduleSummary,
  })
  const deepLearnSelectionByDisplayId = new Map(
    overview.studyMaterials.map((material) => [
      material.resource.id,
      resolveLearnResourceSelection(experience, storedResources, material.resource.id),
    ]),
  )
  const sortedTasks = sortModuleTasks(tasks)
  const pendingTasks = sortedTasks.filter((task) => task.status !== 'completed')
  const completedTasks = sortedTasks.filter((task) => task.status === 'completed')
  const targetResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const targetTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const shouldOpenCompletedTasks = Boolean(targetTaskId && completedTasks.some((task) => task.id === targetTaskId))
  const resumeTargetDeepLearn = overview.resumeTarget
    ? (() => {
      const selection = deepLearnSelectionByDisplayId.get(overview.resumeTarget.resource.id)
        ?? resolveLearnResourceSelection(experience, storedResources, overview.resumeTarget.resource.id)
      const deepLearnResourceId = selection?.canonicalResourceId ?? overview.resumeTarget.resource.id
      const readiness = classifyDeepLearnResourceReadiness({
        resource: overview.resumeTarget.resource,
        storedResource: selection?.storedResource ?? null,
        canonicalResourceId: selection?.canonicalResourceId ?? null,
      })

      return {
        resourceId: deepLearnResourceId,
        ui: getDeepLearnResourceUiState(
          module.id,
          deepLearnResourceId,
          deepLearnNoteByResourceId.get(selection?.canonicalResourceId ?? overview.resumeTarget.resource.id) ?? null,
          {
            notesAvailability: deepLearnNotesResult.availability,
            unavailableMessage: deepLearnNotesResult.message,
            readiness,
          },
        ),
      }
    })()
    : null
  const studyResourceItems = overview.studyMaterials.map((material) => {
    const selection = deepLearnSelectionByDisplayId.get(material.resource.id)
      ?? resolveLearnResourceSelection(experience, storedResources, material.resource.id)
    const deepLearnResourceId = selection?.canonicalResourceId ?? material.resource.id
    const readiness = classifyDeepLearnResourceReadiness({
      resource: material.resource,
      storedResource: selection?.storedResource ?? null,
      canonicalResourceId: selection?.canonicalResourceId ?? null,
    })
    const sourceReadiness = normalizeSourceReadiness({
      resource: material.resource,
      storedResource: selection?.storedResource ?? null,
      canonicalResourceId: selection?.canonicalResourceId ?? null,
      moduleId: module.id,
      moduleTitle: module.title,
      summary: toSourceSummarySnapshot(selection?.canonicalResourceId ? resourceSummaryById.get(selection.canonicalResourceId) : null),
    })

    return {
      ...buildDeepLearnAccordionState(
        module.id,
        module.courseId ?? null,
        deepLearnResourceId,
        deepLearnNoteByResourceId.get(selection?.canonicalResourceId ?? material.resource.id) ?? null,
        deepLearnNotesResult.availability,
        deepLearnNotesResult.message,
        readiness,
      ),
      moduleId: module.id,
      courseId: module.courseId ?? null,
      id: material.resource.id,
      title: material.resource.title,
      note: material.note,
      detailNote: material.detailNote,
      fileTypeLabel: material.fileTypeLabel,
      readinessLabel: material.readinessLabel,
      readinessTone: material.readinessTone,
      statusKey: material.statusKey,
      readerState: material.reader.state,
      primaryAction: material.primaryAction,
      sourceActionLabel: material.sourceActionLabel,
      required: material.resource.required,
      outlineSections: material.reader.outlineSections,
      outlineHint: material.reader.outlineHint,
      previewState: material.resource.previewState,
      fallbackReason: material.resource.fallbackReason,
      readerHref: getLearnResourceHref(module.id, material.resource.id),
      canvasHref: getResourceCanvasHref(material.resource),
      originalFileHref: getResourceOriginalFileHref(material.resource),
      sourceReadinessState: sourceReadiness.state,
      sourceReadinessStatusLabel: sourceReadiness.statusLabel,
      sourceReadinessMessage: sourceReadiness.message,
      sourceReadinessActions: sourceReadiness.actions,
      sourceReadinessBucket: getSourceReadinessBucket(sourceReadiness.state),
      pageCount: sourceReadiness.pageCount,
      sourceTypeLabel: sourceReadiness.sourceTypeLabel,
      originLabel: sourceReadiness.originLabel,
      canonicalResourceId: sourceReadiness.canonicalResourceId,
      isSummarizable: sourceReadiness.isSummarizable,
      sourceSummary: sourceReadiness.summary,
      deepLearnCanGenerate: readiness.canGenerate,
      deepLearnDisabledReason: readiness.canGenerate ? null : describeGenerationBlock(sourceReadiness.state, readiness.detail),
    }
  })
  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <GeneratedContentState
          title="This Learn workspace is not ready yet."
          description="Open Courses, try source repair, and then open the item in Canvas if it still needs attention."
          tone="warning"
          action={(
            <Link href="/courses" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open Courses
            </Link>
          )}
        />
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
      dueCount={pendingTasks.length}
      completedCount={completedTasks.length}
    >
      <div className="command-page command-page-tight">
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '1rem' }}>
          <div>
            <p className="ui-kicker">{courseName}</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{module.title}</h2>
            <p style={{ margin: '0.32rem 0 0', fontSize: '14px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
              {courseInstructor || 'Instructor name not available'}
            </p>
            <p style={{ margin: '0.48rem 0 0', fontSize: '14px', lineHeight: 1.76, color: 'var(--text-secondary)', maxWidth: '52rem' }}>
              {moduleSummary?.status === 'ready' && moduleSummary.summary
                ? moduleSummary.summary
                : moduleOverviewFallback}
            </p>
          </div>

          {deepLearnNotesResult.availability === 'unavailable' && deepLearnNotesResult.message && (
            <GeneratedContentState
              title="Saved learning packs are unavailable right now."
              description="You can still open source material below and generate a new pack once the saved library is available again."
              tone="warning"
            />
          )}

          <StudyResourceAccordionList
            items={studyResourceItems}
            initialOpenResourceId={targetResourceId}
            emptyMessage="No study sources are ready for Learn in this module yet."
          />

          {overview.suggestedSteps.length > 0 && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
              <p className="ui-kicker">Suggested flow</p>
              <ol style={{ listStyle: 'none', padding: 0, margin: '0.7rem 0 0', display: 'grid', gap: '0.55rem' }}>
                {overview.suggestedSteps.map((step, index) => (
                  <li key={step.id}>
                    <ActionLink
                      href={step.href}
                      external={step.external}
                      className="ui-interactive-row"
                      style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', textDecoration: 'none', color: 'inherit' }}
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

          <ModuleOverviewCard
            moduleId={module.id}
            fallbackSummary={moduleOverviewFallback}
            readyCount={overview.readyStudyFileCount}
            needsActionCount={overview.limitedStudyFileCount}
            unsupportedCount={overview.unavailableStudyFileCount}
            summary={moduleSummary}
          />

          {overview.resumeTarget && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'grid', gap: '0.45rem' }}>
              <p className="ui-kicker">{overview.resumeTarget.promptLabel}</p>
              <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                {overview.resumeTarget.resource.title}
              </p>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {resumeTargetDeepLearn?.ui.summary ?? overview.resumeTarget.note}
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {resumeTargetDeepLearn && (resumeTargetDeepLearn.ui.status === 'not_started' || resumeTargetDeepLearn.ui.status === 'failed') ? (
                  <DeepLearnGenerateButton
                    moduleId={module.id}
                    resourceId={resumeTargetDeepLearn.resourceId}
                    courseId={module.courseId ?? null}
                    resourceTitle={overview.resumeTarget.resource.title}
                    label={resumeTargetDeepLearn.ui.primaryLabel}
                  />
                ) : resumeTargetDeepLearn?.ui.status === 'unavailable' || resumeTargetDeepLearn?.ui.status === 'blocked' ? (
                  <ActionButton href={overview.resumeTarget.href} label={resumeTargetDeepLearn.ui.primaryLabel} external={overview.resumeTarget.external} tone="secondary" />
                ) : resumeTargetDeepLearn ? (
                  <Link href={resumeTargetDeepLearn.ui.noteHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                    {resumeTargetDeepLearn.ui.primaryLabel}
                  </Link>
                ) : (
                  <ActionButton href={overview.resumeTarget.href} label={overview.resumeTarget.actionLabel} external={overview.resumeTarget.external} tone="secondary" />
                )}
                {resumeTargetDeepLearn?.ui.quizReady && (
                  <Link href={resumeTargetDeepLearn.ui.quizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                    Quiz this
                  </Link>
                )}
                <ActionButton href={overview.resumeTarget.href} label={overview.resumeTarget.actionLabel} external={overview.resumeTarget.external} tone="ghost" />
              </div>
            </div>
          )}
        </section>

        <section id="action-status" className="motion-card motion-delay-2 section-shell" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
              <div>
                <p className="ui-kicker">Action status</p>
                <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.02rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Finished graded work already drops out of the way</h3>
              </div>

              {pendingTasks.length === 0 ? (
                <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
                  No unfinished module work is demanding attention right now.
                </div>
              ) : (
                <div className="contained-scroll-frame">
                  <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {pendingTasks.map((task) => (
                      <article
                        key={task.id}
                        id={getTaskElementId(task.id)}
                        className="glass-panel glass-soft"
                        style={{
                          ['--glass-panel-border' as string]: targetTaskId === task.id
                            ? 'color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
                            : 'var(--glass-border)',
                          borderRadius: 'var(--radius-panel)',
                          padding: '0.82rem 0.88rem',
                          display: 'grid',
                          gap: '0.6rem',
                          background: targetTaskId === task.id
                            ? 'color-mix(in srgb, var(--surface-selected) 78%, var(--surface-elevated) 22%)'
                            : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                              <PriorityBadge priority={task.priority} />
                              {task.deadline && <StateBadge label={formatDeadlineLabel(task.deadline)} tone={deadlineTone(task.deadline)} />}
                            </div>
                            <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650, overflowWrap: 'anywhere' }}>{task.title}</p>
                            {task.details && (
                              <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>
                                {task.details}
                              </p>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <Link href={buildModuleDoHref(module.id, { taskId: task.id })} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                            Open task
                          </Link>
                          {task.canvasUrl && (
                            <a href={task.canvasUrl} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                              Open in Canvas
                            </a>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

              {completedTasks.length > 0 && (
                <details open={shouldOpenCompletedTasks} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 0.95rem' }}>
                  <summary className="ui-interactive-summary" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Already done
                  </summary>
                  <div className="contained-scroll-frame" style={{ marginTop: '0.8rem' }}>
                    <div style={{ display: 'grid', gap: '0.6rem' }}>
                      {completedTasks.map((task) => (
                        <article
                          key={task.id}
                          id={getTaskElementId(task.id)}
                          style={{
                            display: 'grid',
                            gap: '0.5rem',
                            padding: '0.8rem 0.85rem',
                            borderRadius: 'var(--radius-tight)',
                            border: targetTaskId === task.id
                              ? '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
                              : '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                              <CompletionBadge origin={task.completionOrigin ?? null} />
                              {task.deadline && <StateBadge label={formatDate(task.deadline)} tone="muted" />}
                            </div>
                            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-muted)', textDecoration: 'line-through', overflowWrap: 'anywhere' }}>{task.title}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </details>
              )}
        </section>

      </div>
    </ModuleLensShell>
  )
}

function ActionLink({
  href,
  external = false,
  children,
  style,
  className,
}: {
  href: string
  external?: boolean
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
        {children}
      </a>
    )
  }

  return (
    <Link href={href} className={className} style={style}>
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

function StateBadge({
  label,
  tone,
}: {
  label: string
  tone: 'accent' | 'warning' | 'muted' | 'danger'
}) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : tone === 'danger'
        ? 'color-mix(in srgb, var(--red-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'accent'
    ? 'color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%)'
    : tone === 'warning'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : tone === 'danger'
        ? 'color-mix(in srgb, var(--red) 24%, var(--border-subtle) 76%)'
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

function toSourceSummarySnapshot(summary: Awaited<ReturnType<typeof listResourceSummaries>> extends Map<string, infer Row> ? Row | undefined | null : never) {
  if (!summary) return null
  return {
    summary: summary.summary,
    topics: summary.topics,
    studyValue: summary.studyValue,
    suggestedUse: summary.suggestedUse,
    status: summary.status,
    generatedAt: summary.generatedAt,
  }
}

function describeGenerationBlock(state: ReturnType<typeof normalizeSourceReadiness>['state'], fallback: string) {
  if (state === 'visual_ocr_available') return 'This PDF is scanned and needs OCR before Deep Learn can use it.'
  if (state === 'visual_ocr_running') return 'Reading scanned pages...'
  if (state === 'visual_ocr_failed') return 'OCR failed. Open the original file or retry.'
  if (state === 'empty_or_metadata_only') return 'No readable text found. Deep Learn cannot generate from this source.'
  return fallback
}

function buildDeepLearnAccordionState(
  moduleId: string,
  courseId: string | null,
  resourceId: string,
  note: Parameters<typeof getDeepLearnResourceUiState>[2],
  notesAvailability: 'available' | 'unavailable',
  unavailableMessage: string | null,
  readiness: NonNullable<Parameters<typeof getDeepLearnResourceUiState>[3]>['readiness'],
) {
  const deepLearnUi = getDeepLearnResourceUiState(moduleId, resourceId, note, {
    notesAvailability,
    unavailableMessage,
    readiness,
  })

  return {
    moduleId,
    courseId,
    deepLearnStatus: deepLearnUi.status,
    deepLearnStatusLabel: deepLearnUi.statusLabel,
    deepLearnTone: deepLearnUi.tone,
    deepLearnSummary: deepLearnUi.summary,
    deepLearnDetail: deepLearnUi.detail,
    deepLearnPrimaryLabel: deepLearnUi.primaryLabel,
    deepLearnNoteHref: deepLearnUi.noteHref,
    deepLearnQuizHref: deepLearnUi.quizHref,
    deepLearnQuizReady: deepLearnUi.quizReady,
    deepLearnTermCount: note?.identificationItems.length ?? 0,
    deepLearnFactCount: note?.answerBank.length ?? 0,
    deepLearnNoteFailure: note?.errorMessage ?? null,
    deepLearnAvailability: notesAvailability,
  }
}
