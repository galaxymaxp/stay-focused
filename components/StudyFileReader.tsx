import Link from 'next/link'
import type { ReactNode } from 'react'
import { CopyTaskBundleActions } from '@/components/CopyTaskBundleActions'
import { StudyFileManualStateControls } from '@/components/StudyFileManualStateControls'
import { StudyFileOpenTracker } from '@/components/StudyFileOpenTracker'
import { StudyFilePreviewExplorer } from '@/components/StudyFilePreviewExplorer'
import { buildManualCopyBundle } from '@/lib/manual-copy-bundle'
import { formatNormalizedModuleResourceSourceType, getModuleResourceCapabilityInfo } from '@/lib/module-resource-capability'
import { getStudyFileProgressLabel } from '@/lib/study-file-manual-state'
import { buildModuleInspectHref } from '@/lib/stay-focused-links'
import { getStudySourceNoun } from '@/lib/study-resource'
import { buildStudyFileReaderModel } from '@/lib/study-file-reader'
import type { ModuleSourceResource } from '@/lib/module-workspace'

interface LinkedTaskLike {
  id: string
  title: string
  deadline: string | null
}

export function StudyFileReader({
  moduleId,
  courseId,
  courseName,
  moduleTitle,
  resource,
  canvasHref,
  linkedTask,
}: {
  moduleId: string
  courseId?: string
  courseName: string
  moduleTitle: string
  resource: ModuleSourceResource
  canvasHref: string | null
  linkedTask: LinkedTaskLike | null
}) {
  const reader = buildStudyFileReaderModel(resource)
  const studyProgress = resource.studyProgressStatus ?? 'not_started'
  const workflowOverride = resource.workflowOverride ?? 'study'
  const sourceNoun = getStudySourceNoun(resource)
  const capability = getModuleResourceCapabilityInfo(resource)
  const progressTone = studyProgress === 'reviewed'
    ? 'accent'
    : studyProgress === 'skimmed'
      ? 'warning'
      : 'muted'
  const manualCopy = buildManualCopyBundle({
    taskTitle: linkedTask?.title ?? resource.title,
    courseName,
    moduleName: moduleTitle,
    dueDate: linkedTask?.deadline ?? resource.dueDate ?? null,
    resource,
  })
  const contextBits = [
    resource.courseName ?? courseName,
    resource.moduleName ?? moduleTitle,
    resource.linkedContext,
  ].filter(Boolean)

  return (
    <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.35rem 1.45rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <StudyFileOpenTracker moduleId={moduleId} resourceId={resource.id} courseId={courseId} />
      <div className="glass-panel" style={{
        ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
        ['--glass-panel-border' as string]: 'var(--glass-border)',
        ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
        borderRadius: 'var(--radius-panel)',
        padding: '1.1rem 1.15rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 420px' }}>
            <p className="ui-kicker">Study reader</p>
            <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>{resource.title}</h2>
            <p className="ui-section-copy" style={{ marginTop: '0.5rem' }}>
              A calm reading surface over the original Canvas source, with grounded guidance only when the app has real text to stand on.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <CopyTaskBundleActions
              bundleText={manualCopy.bundleText}
              promptText={manualCopy.promptText}
            />
            <Link href={`/modules/${moduleId}/learn#source-support`} className="ui-button ui-button-secondary">Back to module Learn</Link>
            <Link href={buildModuleInspectHref(moduleId, { resourceId: resource.id })} className="ui-button ui-button-ghost">
              Inspect resource
            </Link>
            {linkedTask && (
              <Link href={`/modules/${moduleId}/do#${linkedTask.id}`} className="ui-button ui-button-ghost">
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

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <ReaderBadge tone="muted" label={reader.fileTypeLabel} />
          <ReaderBadge tone={reader.statusTone} label={reader.statusLabel} />
          <ReaderBadge tone={capability.capabilityTone} label={capability.capabilityLabel} />
          <ReaderBadge tone={reader.qualityTone} label={reader.qualityLabel} />
          <ReaderBadge tone={reader.groundingLabel === 'Strong grounding' ? 'accent' : reader.groundingLabel === 'Weak grounding' ? 'warning' : 'muted'} label={reader.groundingLabel} />
          <ReaderBadge tone={progressTone} label={getStudyFileProgressLabel(studyProgress)} />
          {workflowOverride === 'activity' && (
            <ReaderBadge tone="warning" label="Treated as activity" />
          )}
          {resource.required && (
            <ReaderBadge tone="warning" label="Required" />
          )}
          {linkedTask && (
            <ReaderBadge tone="accent" label="Task linked" />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <ReaderMetaCard label="Course" value={resource.courseName ?? courseName} />
          <ReaderMetaCard label="Module" value={resource.moduleName ?? moduleTitle} />
          <ReaderMetaCard label="Context" value={contextBits.join(' / ') || 'Canvas study material'} />
          <ReaderMetaCard label="Canvas title" value={resource.originalTitle ?? resource.title} />
        </div>

        <StudyFileManualStateControls
          moduleId={moduleId}
          resourceId={resource.id}
          courseId={courseId}
          progressStatus={studyProgress}
          workflowOverride={workflowOverride}
        />
      </div>

      <ReaderSection
        title="What this material is about"
        kicker={reader.state === 'extracted'
          ? reader.quality === 'strong'
            ? 'Grounded overview'
            : 'Usable overview'
          : reader.state === 'weak'
            ? 'Weak extract'
            : 'Honest state'}
      >
        <p className="ui-reading-copy" style={{ margin: 0, fontSize: '15px', lineHeight: 1.76, color: 'var(--text-secondary)' }}>
          {reader.overviewBody}
        </p>
        {resource.whyItMatters && (
          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', marginTop: '0.85rem' }}>
            <p className="ui-kicker">Why it matters in this module</p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              {resource.whyItMatters}
            </p>
          </div>
        )}
      </ReaderSection>

      <ReaderSection title="Key points" kicker={reader.state === 'extracted' ? 'Quick study frame' : 'Held back on purpose'}>
        {reader.keyPoints.length > 0 ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.7rem' }}>
            {reader.keyPoints.map((point, index) => (
              <li key={point} className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem', display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
                <span style={{ width: '1.55rem', height: '1.55rem', borderRadius: '999px', background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>
                  {index + 1}
                </span>
                <span style={{ fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyReaderState body={reader.keyPointsHint ?? 'Key points are hidden until real extracted text is available.'} />
        )}
      </ReaderSection>

      <ReaderSection title="Study preview" kicker={reader.state === 'extracted' || reader.state === 'weak' ? 'Readable source preview' : 'Source stays quiet'}>
        {reader.previewBlocks.length > 0 ? (
          <StudyFilePreviewExplorer previewBlocks={reader.previewBlocks} />
        ) : (
          <EmptyReaderState body={reader.previewHint ?? 'No readable study preview is available in the app yet.'} />
        )}
      </ReaderSection>

      <ReaderSection title="Source transparency" kicker="What this page is actually using">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
          <ReaderMetaCard label="Source type" value={reader.fileTypeLabel} />
          <ReaderMetaCard
            label="Normalized type"
            value={resource.normalizedSourceType ? formatNormalizedModuleResourceSourceType(resource.normalizedSourceType) : 'Unknown'}
          />
          <ReaderMetaCard label="Capability" value={capability.capabilityLabel} />
          <ReaderMetaCard label="Quality" value={reader.qualityLabel} />
          <ReaderMetaCard label="Grounding" value={reader.groundingLabel} />
          <ReaderMetaCard label="Extraction status" value={reader.statusLabel} />
          <ReaderMetaCard label="Readable characters" value={reader.charCount > 0 ? reader.charCount.toLocaleString() : 'Not available'} />
          <ReaderMetaCard label="Canvas source" value={canvasHref ? `Direct ${sourceNoun} link available` : 'No direct Canvas link stored'} />
        </div>

        <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 1rem', marginTop: '0.85rem' }}>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
            {reader.transparencyNote}
          </p>
        </div>

        {(resource.extractionError || linkedTask) && (
          <div style={{ display: 'grid', gridTemplateColumns: linkedTask ? 'minmax(0, 1fr) minmax(240px, 0.8fr)' : 'minmax(0, 1fr)', gap: '0.8rem', marginTop: '0.85rem' }}>
            {resource.extractionError && (
              <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 1rem' }}>
                <p className="ui-kicker">Stored extraction note</p>
                <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                  {resource.extractionError}
                </p>
              </div>
            )}
            {linkedTask && (
              <div className="ui-card" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 1rem' }}>
                <p className="ui-kicker">Related task</p>
                <p style={{ margin: '0.45rem 0 0', fontSize: '15px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 650 }}>
                  {linkedTask.title}
                </p>
                {linkedTask.deadline && (
                  <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                    Due {formatDate(linkedTask.deadline)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </ReaderSection>
    </section>
  )
}

function ReaderSection({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <section className="glass-panel" style={{
      ['--glass-panel-bg' as string]: 'var(--glass-surface-strong)',
      ['--glass-panel-border' as string]: 'var(--glass-border)',
      ['--glass-panel-shadow' as string]: 'var(--glass-shadow)',
      borderRadius: 'var(--radius-panel)',
      padding: '1.1rem 1.15rem',
    }}>
      <p className="ui-kicker">{kicker}</p>
      <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.05rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>{title}</h3>
      <div style={{ marginTop: '0.9rem' }}>
        {children}
      </div>
    </section>
  )
}

function ReaderMetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.42rem 0 0', fontSize: '14px', lineHeight: 1.6, color: 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function ReaderBadge({ label, tone }: { label: string; tone: 'accent' | 'muted' | 'warning' | 'danger' }) {
  const background = tone === 'accent'
    ? 'color-mix(in srgb, var(--surface-selected) 82%, var(--accent) 18%)'
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

function EmptyReaderState({ body }: { body: string }) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem' }}>
      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        {body}
      </p>
    </div>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}
