import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { AnnouncementSupportRow } from '@/components/AnnouncementSupportRow'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { ModuleTermBank } from '@/components/ModuleTermBank'
import { StudyResourceAccordionList } from '@/components/StudyResourceAccordionList'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { listDeepLearnNotesForModule } from '@/lib/deep-learn-store'
import { getDeepLearnResourceUiState } from '@/lib/deep-learn-ui'
import { getModuleResourceCapabilityInfo } from '@/lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { buildModuleLearnOverview, type ModuleStudyMaterial } from '@/lib/module-learn-overview'
import { buildModuleDoHref, buildModuleInspectHref, getSearchParamValue, getSupportElementId, getTaskElementId } from '@/lib/stay-focused-links'
import { buildModuleTermBank } from '@/lib/module-term-bank'
import {
  buildLearnExperience,
  extractCourseName,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceOriginalFileHref,
  getResourceCanvasHref,
  resolveLearnResourceSelection,
  type ModuleSourceResource,
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

  const { module, tasks, resources: storedResources, resourceStudyStates, terms, courseInstructor } = workspace
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
  const deepLearnNotesResult = await listDeepLearnNotesForModule(module.id)
  const deepLearnNotes = deepLearnNotesResult.notes
  const deepLearnNoteByResourceId = new Map(deepLearnNotes.map((note) => [note.resourceId, note]))
  const deepLearnSelectionByDisplayId = new Map(
    overview.studyMaterials.map((material) => [
      material.resource.id,
      resolveLearnResourceSelection(experience, storedResources, material.resource.id),
    ]),
  )
  const sortedTasks = sortModuleTasks(tasks)
  const pendingTasks = sortedTasks.filter((task) => task.status !== 'completed')
  const completedTasks = sortedTasks.filter((task) => task.status === 'completed')
  const summaryText = overview.summary ?? module.summary ?? overview.coverageNote ?? termBank.termsStateMessage
  const targetResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const targetTaskId = getSearchParamValue(resolvedSearchParams?.task)
  const targetSupportId = getSearchParamValue(resolvedSearchParams?.support)
  const targetPanel = getSearchParamValue(resolvedSearchParams?.panel)
  const shouldOpenSourceSupport = targetPanel === 'source-support' || Boolean(targetSupportId)
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
      <div className="command-page command-page-tight">
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '1rem' }}>
          <div>
            <p className="ui-kicker">{courseName}</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{module.title}</h2>
            {courseInstructor && (
              <p style={{ margin: '0.32rem 0 0', fontSize: '14px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
                {courseInstructor}
              </p>
            )}
            <p style={{ margin: '0.48rem 0 0', fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)', maxWidth: '52rem' }}>
              {summaryText}
            </p>
          </div>

          {deepLearnNotesResult.availability === 'unavailable' && deepLearnNotesResult.message && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 0.95rem', border: '1px solid color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)' }}>
              <p className="ui-kicker">Exam prep pack status unavailable</p>
              <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                {deepLearnNotesResult.message} Deep Learn is still rendering the module from resources, source support, and fallback reader state.
              </p>
            </div>
          )}

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
                <Link href={`/modules/${module.id}/learn#source-support`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Source support
                </Link>
                <Link href={buildModuleInspectHref(module.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Inspect resources
                </Link>
              </div>
            </div>
          )}
        </section>

        <div className="command-workspace">
          <section id="study-notes" className="motion-card motion-delay-2 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}>
            <div className="command-scroll-body" data-density="tall">
              <StudyResourceAccordionList
                items={overview.studyMaterials.map((material) => {
                  const selection = deepLearnSelectionByDisplayId.get(material.resource.id)
                    ?? resolveLearnResourceSelection(experience, storedResources, material.resource.id)
                  const deepLearnResourceId = selection?.canonicalResourceId ?? material.resource.id
                  const readiness = classifyDeepLearnResourceReadiness({
                    resource: material.resource,
                    storedResource: selection?.storedResource ?? null,
                    canonicalResourceId: selection?.canonicalResourceId ?? null,
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
                  }
                })}
                initialOpenResourceId={targetResourceId}
                emptyMessage="No mapped study resources are available for exam prep in this module yet."
                scrollable
              />
            </div>
          </section>

          <aside className="command-rail">
            <section id="action-status" className="motion-card motion-delay-2 section-shell" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
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

        <div id="source-support">
          <details open={shouldOpenSourceSupport} className="motion-card motion-delay-3 section-shell" style={{ padding: '1rem 1.05rem' }}>
            <summary className="ui-interactive-summary" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Source support
                </summary>
            <div style={{ display: 'grid', gap: '0.85rem', marginTop: '0.8rem' }}>
              <div>
                <p className="ui-kicker">Source support</p>
                <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.02rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
                  Extracted source views and support context stay inside Deep Learn as secondary validation
                </h3>
                <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                  {overview.coverageNote}
                </p>
              </div>

              {overview.studyMaterials.length > 0 ? (
                <div className="command-scroll-body" data-density="compact">
                  <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {overview.studyMaterials.map((material) => (
                      <SourceSupportRow
                        key={`${material.resource.id}-source-support`}
                        moduleId={module.id}
                        material={material}
                        highlighted={targetSupportId === material.resource.id}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
                  No extracted study sources are mapped into this module yet.
                </div>
              )}

              {overview.otherContextResources.length > 0 && (
                <div className="command-scroll-body" data-density="compact">
                  <div style={{ display: 'grid', gap: '0.7rem' }}>
                    {overview.otherContextResources.map((item) => (
                      <SupportContextRow
                        key={item.id}
                        moduleId={module.id}
                        courseId={module.courseId ?? null}
                        item={item}
                        highlighted={targetSupportId === item.id}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </ModuleLensShell>
  )
}

function SourceSupportRow({
  moduleId,
  material,
  highlighted = false,
}: {
  moduleId: string
  material: ModuleStudyMaterial
  highlighted?: boolean
}) {
  const canvasHref = getResourceCanvasHref(material.resource)
  const capability = getModuleResourceCapabilityInfo(material.resource)
  const quality = getModuleResourceQualityInfo(material.resource)
  const note = material.note
  const originalFileHref = getResourceOriginalFileHref(material.resource)
  const sourceHref = originalFileHref ?? canvasHref

  return (
    <article
      id={getSupportElementId(material.resource.id)}
      className="ui-card-soft"
      style={{
        borderRadius: 'var(--radius-panel)',
        padding: '0.82rem 0.88rem',
        display: 'grid',
        gap: '0.55rem',
        border: highlighted
          ? '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
          : undefined,
      }}
    >
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <StateBadge label={material.fileTypeLabel} tone="muted" />
        <StateBadge
          label={material.readinessLabel}
          tone={material.readiness === 'ready' ? 'accent' : material.readiness === 'limited' ? 'warning' : 'muted'}
        />
        <StateBadge label={capability.capabilityLabel} tone={capability.capabilityTone} />
        <StateBadge label={quality.qualityLabel} tone={quality.qualityTone} />
      </div>

      <div>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
          {material.resource.title}
        </p>
        <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {note}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {material.primaryAction === 'source' && sourceHref ? (
          <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            {material.sourceActionLabel}
          </a>
        ) : (
          <Link href={getLearnResourceHref(moduleId, material.resource.id)} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            Source details
          </Link>
        )}
        {material.primaryAction !== 'source' && sourceHref && (
          <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            {material.sourceActionLabel}
          </a>
        )}
        {material.primaryAction === 'source' && (
          <Link href={getLearnResourceHref(moduleId, material.resource.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source details
          </Link>
        )}
        <Link href={buildModuleInspectHref(moduleId, { resourceId: material.resource.id })} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Inspect
        </Link>
      </div>
    </article>
  )
}

function SupportContextRow({
  moduleId,
  courseId,
  item,
  highlighted = false,
}: {
  moduleId: string
  courseId: string | null
  item: ModuleSourceResource
  highlighted?: boolean
}) {
  if (item.kind === 'announcement') {
    return (
      <AnnouncementSupportRow
        moduleId={moduleId}
        courseId={courseId}
        supportId={item.id}
        title={item.title}
        canvasHref={getResourceCanvasHref(item)}
        note={item.linkedContext ?? item.whyItMatters ?? item.qualityReason ?? item.capabilityReason ?? item.moduleName ?? 'Supporting context'}
        highlighted={highlighted}
      />
    )
  }

  const canvasHref = getResourceCanvasHref(item)
  const capability = getModuleResourceCapabilityInfo(item)
  const quality = getModuleResourceQualityInfo(item)

  return (
    <article
      id={getSupportElementId(item.id)}
      className="ui-card-soft"
      style={{
        borderRadius: 'var(--radius-panel)',
        padding: '0.82rem 0.88rem',
        display: 'grid',
        gap: '0.55rem',
        border: highlighted
          ? '1px solid color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
          : undefined,
      }}
    >
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <StateBadge label={capability.capabilityLabel} tone={capability.capabilityTone} />
        <StateBadge label={quality.qualityLabel} tone={quality.qualityTone} />
      </div>

      <div>
        <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
          {item.title}
        </p>
        <p style={{ margin: '0.32rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {item.linkedContext ?? item.whyItMatters ?? item.qualityReason ?? item.capabilityReason ?? item.moduleName ?? 'Supporting context'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        {canvasHref ? (
          <a href={canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            Open target
          </a>
        ) : (
          <Link href={getLearnResourceHref(moduleId, item.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open detail
          </Link>
        )}
        <Link href={buildModuleInspectHref(moduleId, { resourceId: item.id })} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
          Inspect
        </Link>
        {canvasHref && (
          <Link href={getLearnResourceHref(moduleId, item.id)} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Open detail
          </Link>
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
