import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CopyTaskBundleActions } from '@/components/CopyTaskBundleActions'
import { DeepLearnNoteView } from '@/components/DeepLearnNoteView'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { StudyFileReader } from '@/components/StudyFileReader'
import { StudyModeSwitcher } from '@/components/StudyModeSwitcher'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import { getLearnResourceUiState } from '@/lib/learn-resource-ui'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
import { formatNormalizedModuleResourceSourceType, getModuleResourceCapabilityInfo } from '@/lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { buildModuleInspectHref } from '@/lib/stay-focused-links'
import { getLearnResourceKindLabel } from '@/lib/study-resource'
import {
  buildLearnExperience,
  extractCourseName,
  findDoResourceById,
  findLearnUnitByResourceId,
  getModuleWorkspace,
  getResourceGrounding,
  getResourceCanvasHref,
  getResourceOriginalFileHref,
} from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string; resourceId: string }>
}

export default async function ResourceDetailPage({ params }: Props) {
  const { id, resourceId } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources, resourceStudyStates } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
    resourceStudyStates,
  })
  const unit = findLearnUnitByResourceId(experience, resourceId)
  const resource = unit?.resource ?? findDoResourceById(experience, resourceId)

  if (!resource) notFound()

  const canvasHref = getResourceCanvasHref(resource)
  const originalFileHref = getResourceOriginalFileHref(resource)
  const uiState = getLearnResourceUiState(resource, {
    hasOriginalFile: Boolean(originalFileHref),
    hasCanvasLink: Boolean(canvasHref),
  })
  const sourceHref = originalFileHref ?? canvasHref
  const showSourceAsPrimary = uiState.primaryAction === 'source' && Boolean(sourceHref)
  const grounding = unit?.grounding ?? getResourceGrounding(resource)
  const capability = getModuleResourceCapabilityInfo(resource)
  const quality = getModuleResourceQualityInfo(resource)
  const linkedTask = tasks.find((task) => matchesByTitle(resource.title, task.title)) ?? null
  const manualCopy = buildManualCopyBundle({
    taskTitle: linkedTask?.title ?? resource.title,
    courseName: resource.courseName ?? courseName,
    moduleName: resource.moduleName ?? module.title,
    dueDate: linkedTask?.deadline ?? resource.dueDate ?? null,
    resource,
  })
  const deepLearnNoteResult = await getDeepLearnNoteForResource(module.id, resource.id)

  if (resource.kind === 'study_file') {
    return (
      <ModuleLensShell
        currentLens="learn"
        moduleId={module.id}
        courseId={module.courseId}
        courseName={courseName}
        title={module.title}
        summary={module.summary}
      >
        <div style={{ display: 'grid', gap: '1rem' }}>
          <DeepLearnNoteView
            moduleId={module.id}
            courseId={module.courseId ?? null}
            resource={resource}
            note={deepLearnNoteResult.note}
            noteAvailability={deepLearnNoteResult.availability}
            noteAvailabilityMessage={deepLearnNoteResult.message}
            readerHref={`/modules/${module.id}/learn/resources/${encodeURIComponent(resource.id)}`}
            sourceHref={sourceHref}
          />
          <StudyFileReader
            moduleId={module.id}
            courseId={module.courseId}
            courseName={courseName}
            moduleTitle={module.title}
            resource={resource}
            canvasHref={canvasHref}
            linkedTask={linkedTask}
          />
        </div>
      </ModuleLensShell>
    )
  }

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={module.summary}
    >
      <div style={{ display: 'grid', gap: '1rem' }}>
        <DeepLearnNoteView
          moduleId={module.id}
          courseId={module.courseId ?? null}
          resource={resource}
          note={deepLearnNoteResult.note}
          noteAvailability={deepLearnNoteResult.availability}
          noteAvailabilityMessage={deepLearnNoteResult.message}
          readerHref={`/modules/${module.id}/learn/resources/${encodeURIComponent(resource.id)}`}
          sourceHref={sourceHref}
        />
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 480px' }}>
            <p className="ui-kicker">Fallback source detail</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{resource.title}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.5rem' }}>
              Deep Learn is the main study path. This page stays focused on source evidence, fallback context, and direct source actions for this individual Canvas item.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <CopyTaskBundleActions
              bundleText={manualCopy.bundleText}
              promptText={manualCopy.promptText}
            />
            <Link href={`/modules/${module.id}/learn#source-support`} className="ui-button ui-button-secondary">Back to module Learn</Link>
            <Link href={buildModuleInspectHref(module.id, { resourceId: resource.id })} className="ui-button ui-button-ghost">
              Inspect resource
            </Link>
            {linkedTask && (
              <Link href={`/modules/${module.id}/do#${linkedTask.id}`} className="ui-button ui-button-ghost">
                Open related task
              </Link>
            )}
            {originalFileHref && (
              <a href={originalFileHref} target="_blank" rel="noreferrer" className={`ui-button ${showSourceAsPrimary ? 'ui-button-secondary' : 'ui-button-ghost'}`}>
                {uiState.sourceActionLabel}
              </a>
            )}
            {canvasHref && !originalFileHref && (
              <a href={canvasHref} target="_blank" rel="noreferrer" className={`ui-button ${showSourceAsPrimary ? 'ui-button-secondary' : 'ui-button-ghost'}`}>
                {uiState.sourceActionLabel}
              </a>
            )}
            {canvasHref && originalFileHref && (
              <a href={canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost">
                Open in Canvas
              </a>
            )}
            <Link href="/canvas" className="ui-button ui-button-ghost">
              Reconnect / resync
            </Link>
          </div>
        </div>

        <div className={grounding.hasGroundedAnalysis ? 'ui-card' : 'ui-card-soft'} style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <p className="ui-kicker">Source grounding</p>
              <p style={{ margin: '0.45rem 0 0', fontSize: '16px', lineHeight: 1.45, color: 'var(--text-primary)', fontWeight: 650 }}>{grounding.label}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span className="ui-chip ui-chip-soft">Confidence: {grounding.confidence}</span>
              <span className="ui-chip ui-chip-soft">Capability: {capability.capabilityLabel}</span>
              <span className="ui-chip ui-chip-soft">Quality: {quality.qualityLabel}</span>
              <span className="ui-chip ui-chip-soft">{quality.groundingLabel}</span>
              <span className="ui-chip ui-chip-soft">Status: {uiState.statusLabel}</span>
            </div>
          </div>
          <p style={{ margin: '0.65rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {grounding.message}
          </p>
          {grounding.evidenceSnippet && (
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', marginTop: '0.8rem' }}>
              <p className="ui-kicker">Evidence snippet</p>
              <p style={{ margin: '0.5rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                {grounding.evidenceSnippet}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <MetaCard label="Course" value={resource.courseName ?? courseName} />
          <MetaCard label="Module / week" value={resource.moduleName ?? module.title} />
          <MetaCard label="Resource type" value={labelForResourceKind(resource)} />
          <MetaCard label="Original resource kind" value={resource.originalResourceKind ?? resource.type} />
          <MetaCard label="Normalized source type" value={formatNormalizedModuleResourceSourceType(capability.normalizedSourceType)} />
          <MetaCard label="Resolved target type" value={resource.resolvedTargetType ?? 'Not resolved'} />
          <MetaCard label="Resolution state" value={resource.resolutionState ?? 'Not recorded'} />
          <MetaCard label="Quality" value={quality.qualityLabel} />
          <MetaCard label="Grounding treatment" value={quality.groundingLabel} />
          <MetaCard label="Preview state" value={resource.previewState ?? 'Not recorded'} />
          <MetaCard label="Recommendation" value={resource.recommendationStrength ?? 'Not recorded'} />
          <MetaCard label="Original Canvas title" value={resource.originalTitle ?? resource.title} />
          <MetaCard label="Due date" value={resource.dueDate && resource.dueDate !== 'No due date' ? formatDate(resource.dueDate) : 'None surfaced'} />
          <MetaCard label="Linked context" value={resource.linkedContext ?? 'No linked task or assignment context surfaced yet'} />
        </div>

        {resource.whyItMatters && (
          <div className="ui-card" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
            <p className="ui-kicker">Why this matters in the flow</p>
            <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              {resource.whyItMatters}
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: unit ? 'minmax(0, 1.45fr) minmax(280px, 0.9fr)' : 'minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {unit && unit.modes.length > 0 ? (
              <>
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">Fallback reader preview</p>
                  <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>{unit.preview}</p>
                </div>
                <StudyModeSwitcher modes={unit.modes} summaryLabel="Learning modes are collapsed by default here too" />
              </>
            ) : (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">{uiState.statusLabel}</p>
                <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                  {uiState.detail}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.8rem' }}>
                  {resource.whyItMatters && (
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Why it may matter:</strong> {resource.whyItMatters}
                    </p>
                  )}
                  {resource.linkedContext && (
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Linked follow-on:</strong> {resource.linkedContext}
                    </p>
                  )}
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Best next step:</strong> {showSourceAsPrimary
                      ? `${uiState.sourceActionLabel}. The reader view here is only a fallback for this item right now.`
                      : uiState.statusKey === 'source_first'
                        ? 'Stay in this detail view for the limited context available here. The original source is not linked from this page right now.'
                        : 'Use this detail view to review the context that is available here.'}
                  </p>
                </div>
              </div>
            )}

            {(resource.extractedTextPreview || resource.extractionError || grounding.evidenceSnippet) && (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">Extraction evidence</p>
                {resource.extractedTextPreview && (
                  <p style={{ margin: '0.55rem 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                    {resource.extractedTextPreview}
                  </p>
                )}
                {resource.extractionError && (
                  <p style={{ margin: resource.extractedTextPreview ? '0.6rem 0 0' : '0.55rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--red)' }}>
                    {resource.extractionError}
                  </p>
                )}
              </div>
            )}
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
              <p className="ui-kicker">Metadata and status</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.75rem' }}>
                <MetaLine label="Canvas source" value={canvasHref ? 'Direct item link available' : 'No direct item URL stored'} />
                <MetaLine label="Capability" value={capability.capabilityLabel} />
                <MetaLine label="Capability note" value={capability.reason} />
                <MetaLine label="Quality" value={quality.qualityLabel} />
                <MetaLine label="Quality note" value={quality.reason} />
                <MetaLine label="Reader status" value={uiState.statusLabel} />
                <MetaLine label="Source URL category" value={resource.sourceUrlCategory ?? 'Not recorded'} />
                <MetaLine label="Resolved URL category" value={resource.resolvedUrlCategory ?? 'Not recorded'} />
                <MetaLine label="Resolved URL" value={resource.resolvedUrl ?? 'Not recorded'} />
                <MetaLine label="Text in reader" value={uiState.textAvailabilityLabel} />
                <MetaLine label="Full text stored" value={resource.fullTextAvailable ? 'Yes' : 'No'} />
                <MetaLine label="Character count" value={typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0 ? `${resource.extractedCharCount}` : 'Not available'} />
                <MetaLine label="Stored text length" value={typeof resource.storedTextLength === 'number' ? `${resource.storedTextLength}` : 'Not recorded'} />
                <MetaLine label="Stored preview length" value={typeof resource.storedPreviewLength === 'number' ? `${resource.storedPreviewLength}` : 'Not recorded'} />
                <MetaLine label="Word count" value={typeof resource.storedWordCount === 'number' ? `${resource.storedWordCount}` : 'Not recorded'} />
                <MetaLine label="Recommendation" value={resource.recommendationStrength ?? 'Not recorded'} />
                <MetaLine label="Grounding confidence" value={grounding.confidence} />
                <MetaLine label="Required" value={resource.required ? 'Yes' : 'No'} />
              </div>
            </div>

            {linkedTask && (
              <div className="ui-card" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">Related task</p>
                <p style={{ margin: '0.5rem 0 0', fontSize: '15px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 650 }}>
                  {linkedTask.title}
                </p>
                {linkedTask.deadline && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                    Due {formatDate(linkedTask.deadline)}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
        </section>
      </div>
    </ModuleLensShell>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '0.9rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.22rem 0 0', fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function labelForResourceKind(resource: { kind: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement'; type: string }) {
  return getLearnResourceKindLabel(resource)
}

function matchesByTitle(left: string, right: string) {
  const normalizedLeft = left.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const normalizedRight = right.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft)
}
