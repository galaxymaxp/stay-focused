import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ModuleLearnVisibilityToggle } from '@/components/ModuleLearnVisibilityToggle'
import { StudyFileManualStateControls } from '@/components/StudyFileManualStateControls'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { buildModuleLearnOverview, type ModuleSuggestedStudyStep, type ModuleStudyMaterial } from '@/lib/module-learn-overview'
import { getStudyFileProgressLabel } from '@/lib/study-file-manual-state'
import { buildLearnExperience, extractCourseName, getLearnResourceHref, getModuleWorkspace, getResourceCanvasHref, type ModuleSourceResource } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LearnPage({ params }: Props) {
  const { id } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, resources: storedResources, resourceStudyStates } = workspace
  const deadlineCount = workspace.deadlines.length
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount,
    resources: storedResources,
    resourceStudyStates,
  })
  const { resources, doItems } = experience
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources,
    doItems,
    tasks,
  })
  const actionLaneCount = overview.actionItems.length + overview.activityOverrides.length

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
      courseName={courseName}
      title={module.title}
      summary={null}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '1rem' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 420px' }}>
              <p className="ui-kicker">Module study overview</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>What to focus on here</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem' }}>
                Learn is grounding this module view in readable study files first, while keeping manual progress and workflow choices close to the actual files.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className="ui-chip ui-chip-soft">{overview.totalStudyFileCount} study file{overview.totalStudyFileCount === 1 ? '' : 's'}</span>
              <span className="ui-chip ui-chip-soft">{actionLaneCount} item{actionLaneCount === 1 ? '' : 's'} in action lane</span>
              {overview.activityOverrideCount > 0 && (
                <span className="ui-chip ui-chip-soft">{overview.activityOverrideCount} treated as activity</span>
              )}
              {module.showInLearn === false && (
                <span className="ui-chip ui-chip-soft">Hidden from global Learn</span>
              )}
              <ModuleLearnVisibilityToggle moduleId={module.id} showInLearn={module.showInLearn !== false} />
            </div>
          </div>

          {module.showInLearn === false && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 1rem', marginTop: '0.95rem' }}>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                This module is hidden from global Learn and recommendation surfaces, but it still stays available here and through normal module navigation.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(280px, 0.95fr)', gap: '0.9rem', marginTop: '1rem' }}>
            <div className="glass-panel" style={{
              ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
              ['--glass-panel-border' as string]: 'var(--glass-border)',
              ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
              borderRadius: 'var(--radius-panel)',
              padding: '1rem 1.05rem',
            }}>
              <p className="ui-kicker">{overview.summary ? 'Grounded module summary' : 'Honest coverage state'}</p>
              <p className="ui-reading-copy" style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                {overview.summary ?? overview.summaryStateMessage}
              </p>
            </div>

            <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.7rem' }}>
                <StudyStatCard label="Study files" value={String(overview.totalStudyFileCount)} />
                <StudyStatCard label="Active study lane" value={String(overview.activeStudyFileCount)} />
                <StudyStatCard label="Reviewed" value={String(overview.progressCounts.reviewed)} />
                <StudyStatCard label="Need Canvas" value={String(overview.unavailableStudyFileCount)} />
              </div>

              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                <p className="ui-kicker">Progress rollup</p>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                  <StatusBadge tone="accent" label={`${overview.progressCounts.reviewed} reviewed`} />
                  <StatusBadge tone="warning" label={`${overview.progressCounts.skimmed} skimmed`} />
                  <StatusBadge tone="muted" label={`${overview.progressCounts.notStarted} not started`} />
                </div>
                {overview.activityOverrideCount > 0 && (
                  <p style={{ margin: '0.45rem 0 0', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                    {overview.activityOverrideCount} {overview.activityOverrideCount === 1 ? 'study file is' : 'study files are'} currently treated as activity instead.
                  </p>
                )}
              </div>

              {overview.resumeTarget && (
                <div className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                  <p className="ui-kicker">{overview.resumeTarget.promptLabel}</p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <StatusBadge tone="muted" label={overview.resumeTarget.fileTypeLabel} />
                    <StatusBadge
                      tone={overview.resumeTarget.readinessLabel === 'Ready to study'
                        ? 'accent'
                        : overview.resumeTarget.readinessLabel === 'Limited'
                          ? 'warning'
                          : 'muted'}
                      label={overview.resumeTarget.readinessLabel}
                    />
                  </div>
                  <p style={{ margin: '0.6rem 0 0', fontSize: '15px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 650 }}>
                    {overview.resumeTarget.resource.title}
                  </p>
                  <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                    {overview.resumeTarget.note}
                  </p>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                    <ActionLink
                      href={overview.resumeTarget.href}
                      label={overview.resumeTarget.actionLabel}
                      external={overview.resumeTarget.external}
                      tone="secondary"
                    />
                  </div>
                </div>
              )}

              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
                <p className="ui-kicker">Study coverage</p>
                <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                  {overview.coverageNote}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="motion-card motion-delay-2 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <p className="ui-kicker">Study materials</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>Files you can study from here</h3>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '44rem' }}>
                Manual progress keeps this view resumable, while the activity override lets you move a study file out of the main study lane without losing the reader.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <StatusBadge tone="accent" label={`${overview.readyStudyFileCount} ready`} />
              {overview.limitedStudyFileCount > 0 && (
                <StatusBadge tone="warning" label={`${overview.limitedStudyFileCount} limited`} />
              )}
              {overview.unavailableStudyFileCount > 0 && (
                <StatusBadge tone="muted" label={`${overview.unavailableStudyFileCount} unavailable`} />
              )}
            </div>
          </div>

          {overview.studyMaterials.length === 0 ? (
            <EmptySurface body={overview.activityOverrideCount > 0
              ? 'All study files in this module are currently treated as activity instead. You can move them back into study materials at any time.'
              : 'No study files are mapped to this module yet, so Learn cannot build a study-file overview here.'}
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginTop: '0.95rem' }}>
              {overview.studyMaterials.map((material) => (
                <StudyMaterialCard
                  key={material.resource.id}
                  moduleId={module.id}
                  courseName={courseName}
                  moduleTitle={module.title}
                  material={material}
                />
              ))}
            </div>
          )}
        </section>

        {overview.suggestedSteps.length > 0 && (
          <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
            <p className="ui-kicker">Suggested study order</p>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '44rem' }}>
              This flow stays close to what Learn can actually read, plus any study files you have manually moved into the action lane.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginTop: '0.95rem' }}>
              {overview.suggestedSteps.map((step) => (
                <SuggestedStepCard key={step.id} step={step} />
              ))}
            </div>
          </section>
        )}

        <section className="motion-card motion-delay-3 section-shell" style={{ padding: '1.25rem 1.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <p className="ui-kicker">Action items</p>
              <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>What still needs doing</h3>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '42rem' }}>
                Assignments, quizzes, and discussions stay separate from the study files. If you manually treat a study file as activity, it appears here in its own clearly labeled group.
              </p>
            </div>
            <span className="ui-chip ui-chip-soft">{actionLaneCount} item{actionLaneCount === 1 ? '' : 's'} in action lane</span>
          </div>

          {overview.activityOverrides.length > 0 && (
            <div className="ui-card" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', marginTop: '0.95rem' }}>
              <p className="ui-kicker">Marked as activity</p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                These are still original study files, but your workflow override places them in the action lane for now.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginTop: '0.85rem' }}>
                {overview.activityOverrides.map((material) => (
                  <ActivityOverrideCard key={material.resource.id} moduleId={module.id} material={material} />
                ))}
              </div>
            </div>
          )}

          {overview.actionItems.length === 0 ? (
            overview.activityOverrides.length === 0 ? (
              <EmptySurface body="No assignment, quiz, or discussion items were mapped into this module's action lane." />
            ) : null
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.85rem', marginTop: '0.95rem' }}>
              {overview.actionItems.map((item) => (
                <article key={item.id} className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <StatusBadge tone="muted" label={labelForResourceKind(item.kind)} />
                    {item.dueDate && item.dueDate !== 'No due date' && (
                      <StatusBadge tone="warning" label={`Due ${formatDate(item.dueDate)}`} />
                    )}
                    {item.required && (
                      <StatusBadge tone="warning" label="Required" />
                    )}
                  </div>

                  <div>
                    <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, color: 'var(--text-primary)' }}>{item.title}</h4>
                    <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                      {item.whyItMatters ?? 'This belongs in the action pass after you finish the main study materials.'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <ActionLink href={`/modules/${module.id}/do`} label="Open in Do" tone="secondary" />
                    {getResourceCanvasHref(item) && (
                      <ActionLink href={getResourceCanvasHref(item)!} label="Open in Canvas" external />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {overview.otherContextResources.length > 0 && (
          <section className="motion-card motion-delay-3 section-shell" style={{ padding: '1.2rem 1.3rem' }}>
            <p className="ui-kicker">More context</p>
            <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '42rem' }}>
              These items support the module, but they are not the main study files or action items.
            </p>
            <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.9rem' }}>
              {overview.otherContextResources.map((item) => (
                <article key={item.id} className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem 1rem', display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
                      <StatusBadge tone="muted" label={labelForResourceKind(item.kind)} />
                    </div>
                    <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 600 }}>{item.title}</p>
                    {(item.linkedContext || item.whyItMatters || item.moduleName) && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                        {item.linkedContext ?? item.whyItMatters ?? item.moduleName}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <ActionLink href={getLearnResourceHref(module.id, item.id)} label="Open detail" />
                    {getResourceCanvasHref(item) && (
                      <ActionLink href={getResourceCanvasHref(item)!} label="Open in Canvas" external />
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </ModuleLensShell>
  )
}

function StudyMaterialCard({
  moduleId,
  courseName,
  moduleTitle,
  material,
}: {
  moduleId: string
  courseName: string
  moduleTitle: string
  material: ModuleStudyMaterial
}) {
  return (
    <article
      className="glass-panel"
      style={{
        ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
        ['--glass-panel-border' as string]: 'var(--glass-border)',
        ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
        borderRadius: 'var(--radius-panel)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.8rem',
      }}
    >
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <StatusBadge tone="muted" label={material.fileTypeLabel} />
        <StatusBadge tone={material.readinessTone} label={material.readinessLabel} />
        <StatusBadge tone="muted" label={getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started')} />
        {material.resource.required && (
          <StatusBadge tone="warning" label="Required" />
        )}
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, color: 'var(--text-primary)' }}>{material.resource.title}</h4>
        <p style={{ margin: '0.35rem 0 0', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
          {buildMaterialContext(material.resource, courseName, moduleTitle)}
        </p>
      </div>

      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
        {material.note}
      </p>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <ActionLink href={getLearnResourceHref(moduleId, material.resource.id)} label="Study reader" />
        {getResourceCanvasHref(material.resource) && (
          <ActionLink href={getResourceCanvasHref(material.resource)!} label="Open in Canvas" external />
        )}
      </div>

      <StudyFileManualStateControls
        moduleId={moduleId}
        resourceId={material.resource.id}
        progressStatus={material.resource.studyProgressStatus ?? 'not_started'}
        workflowOverride={material.resource.workflowOverride ?? 'study'}
        compact
      />
    </article>
  )
}

function ActivityOverrideCard({
  moduleId,
  material,
}: {
  moduleId: string
  material: ModuleStudyMaterial
}) {
  return (
    <article className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <StatusBadge tone="muted" label="Study file" />
        <StatusBadge tone="muted" label={material.fileTypeLabel} />
        <StatusBadge tone="warning" label="Treated as activity" />
        <StatusBadge tone="muted" label={getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started')} />
      </div>

      <div>
        <h4 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, color: 'var(--text-primary)' }}>{material.resource.title}</h4>
        <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
          {material.note}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <ActionLink href={getLearnResourceHref(moduleId, material.resource.id)} label="Study reader" />
        {getResourceCanvasHref(material.resource) && (
          <ActionLink href={getResourceCanvasHref(material.resource)!} label="Open in Canvas" external />
        )}
      </div>

      <StudyFileManualStateControls
        moduleId={moduleId}
        resourceId={material.resource.id}
        progressStatus={material.resource.studyProgressStatus ?? 'not_started'}
        workflowOverride={material.resource.workflowOverride ?? 'study'}
        compact
      />
    </article>
  )
}

function StudyStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.4rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function SuggestedStepCard({ step }: { step: ModuleSuggestedStudyStep }) {
  return (
    <article className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.95rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <p className="ui-kicker">{step.slotLabel}</p>
        <span className="ui-chip ui-chip-soft">{step.destinationLabel}</span>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>{step.title}</p>
        <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{step.note}</p>
      </div>
      <div>
        <ActionLink href={step.href} label={step.destinationLabel} external={step.external} tone={step.external ? 'ghost' : 'secondary'} />
      </div>
    </article>
  )
}

function StatusBadge({
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
      padding: '0.34rem 0.68rem',
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

function ActionLink({
  href,
  label,
  external = false,
  tone = 'ghost',
}: {
  href: string
  label: string
  external?: boolean
  tone?: 'ghost' | 'secondary'
}) {
  const className = `ui-button ${tone === 'secondary' ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`
  const style = { textDecoration: 'none' }

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
        {label}
      </a>
    )
  }

  return (
    <Link href={href} className={className} style={style}>
      {label}
    </Link>
  )
}

function EmptySurface({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.7, marginTop: '0.95rem' }}>
      {body}
    </div>
  )
}

function buildMaterialContext(resource: ModuleSourceResource, courseName: string, moduleTitle: string) {
  const parts = [
    resource.courseName ?? courseName,
    resource.moduleName ?? moduleTitle,
    resource.originalTitle && resource.originalTitle !== resource.title ? `Canvas: ${resource.originalTitle}` : null,
  ].filter(Boolean)

  return parts.join(' / ') || 'Canvas study file'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function labelForResourceKind(kind: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement') {
  if (kind === 'study_file') return 'Study file'
  if (kind === 'practice_link') return 'Practice link'
  if (kind === 'assignment') return 'Assignment'
  if (kind === 'quiz') return 'Quiz'
  if (kind === 'discussion') return 'Discussion'
  if (kind === 'reference') return 'Reference'
  return 'Announcement'
}
