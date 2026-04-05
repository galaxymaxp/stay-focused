import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { StudyModeSwitcher } from '@/components/StudyModeSwitcher'
import {
  buildLearnExperience,
  extractCourseName,
  findDoResourceById,
  findLearnUnitByResourceId,
  getModuleWorkspace,
  getResourceCanvasHref,
} from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string; resourceId: string }>
}

export default async function ResourceDetailPage({ params }: Props) {
  const { id, resourceId } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, deadlines, resources: storedResources } = workspace
  const courseName = extractCourseName(module.raw_content)
  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: deadlines.length,
    resources: storedResources,
  })
  const unit = findLearnUnitByResourceId(experience, resourceId)
  const resource = unit?.resource ?? findDoResourceById(experience, resourceId)

  if (!resource) notFound()

  const canvasHref = getResourceCanvasHref(resource)
  const linkedTask = tasks.find((task) => matchesByTitle(resource.title, task.title)) ?? null

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={module.id}
      courseName={courseName}
      title={module.title}
      summary={module.summary}
    >
      <section className="section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 480px' }}>
            <p className="ui-kicker">Resource deep view</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{resource.title}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.5rem' }}>
              Stronger context, deeper analysis, and direct source actions for this individual Canvas item.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link href={`/modules/${module.id}/learn`} className="ui-button ui-button-secondary">Back to module Learn</Link>
            {linkedTask && (
              <Link href={`/modules/${module.id}/do#${linkedTask.id}`} className="ui-button ui-button-ghost">
                Open related task
              </Link>
            )}
            {canvasHref && (
              <a href={canvasHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost">
                Open in Canvas
              </a>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <MetaCard label="Course" value={resource.courseName ?? courseName} />
          <MetaCard label="Module / week" value={resource.moduleName ?? module.title} />
          <MetaCard label="Resource type" value={labelForResourceKind(resource.kind)} />
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
            {unit ? (
              <>
                <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                  <p className="ui-kicker">Quick read</p>
                  <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>{unit.preview}</p>
                </div>
                <StudyModeSwitcher modes={unit.modes} summaryLabel="Learning modes are collapsed by default here too" />
              </>
            ) : (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">Action item context</p>
                <p style={{ margin: '0.55rem 0 0', fontSize: '15px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                  This item is currently classified into the Do or support lane, so the deeper study modes are not generated for it yet.
                </p>
              </div>
            )}

            {(resource.extractedTextPreview || resource.extractionError) && (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem' }}>
                <p className="ui-kicker">Source analysis</p>
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
              <p className="ui-kicker">Metadata</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.75rem' }}>
                <MetaLine label="Canvas source" value={canvasHref ? 'Direct item link available' : 'No direct item URL stored'} />
                <MetaLine label="Extraction status" value={labelForExtractionStatus(resource.extractionStatus)} />
                <MetaLine label="Character count" value={typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0 ? `${resource.extractedCharCount}` : 'Not available'} />
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

function labelForExtractionStatus(status?: 'pending' | 'extracted' | 'metadata_only' | 'unsupported' | 'empty' | 'failed') {
  if (!status) return 'Not available'
  if (status === 'extracted') return 'Text extracted'
  if (status === 'unsupported') return 'Unsupported'
  if (status === 'failed') return 'Extraction failed'
  if (status === 'empty') return 'No text found'
  if (status === 'pending') return 'Pending'
  return 'Metadata only'
}

function labelForResourceKind(kind: 'study_file' | 'practice_link' | 'assignment' | 'quiz' | 'discussion' | 'reference' | 'announcement') {
  if (kind === 'study_file') return 'Study File'
  if (kind === 'practice_link') return 'Practice Link'
  if (kind === 'assignment') return 'Assignment'
  if (kind === 'quiz') return 'Quiz'
  if (kind === 'discussion') return 'Discussion'
  if (kind === 'reference') return 'Reference'
  return 'Announcement'
}

function matchesByTitle(left: string, right: string) {
  const normalizedLeft = left.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const normalizedRight = right.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft)
}
