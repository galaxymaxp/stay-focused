import Link from 'next/link'
import { DeepLearnGenerateButton } from '@/components/DeepLearnGenerateButton'
import { DeepLearnWorkspace } from '@/components/DeepLearnWorkspace'
import { OcrSourceButton } from '@/components/OcrSourceButton'
import { WorkspacePanel } from '@/components/ui/WorkspacePanel'
import type { DeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { getDeepLearnResourceUiState } from '@/lib/deep-learn-ui'
import { buildModuleQuizHref } from '@/lib/stay-focused-links'
import type { DeepLearnNote, DeepLearnNoteLoadAvailability } from '@/lib/types'
import type { ModuleSourceResource } from '@/lib/module-workspace'

export function DeepLearnNoteView({
  moduleId,
  courseId,
  resource,
  deepLearnResourceId = resource.id,
  note,
  noteAvailability = 'available',
  noteAvailabilityMessage = null,
  readiness = null,
  readerHref,
  sourceHref,
}: {
  moduleId: string
  courseId: string | null
  resource: ModuleSourceResource
  deepLearnResourceId?: string | null
  note: DeepLearnNote | null
  noteAvailability?: DeepLearnNoteLoadAvailability
  noteAvailabilityMessage?: string | null
  readiness?: DeepLearnResourceReadiness | null
  readerHref: string
  sourceHref: string | null
}) {
  const resolvedDeepLearnResourceId = deepLearnResourceId ?? resource.id
  const effectiveAvailability = deepLearnResourceId ? noteAvailability : 'unavailable'
  const effectiveAvailabilityMessage = deepLearnResourceId
    ? noteAvailabilityMessage
    : noteAvailabilityMessage ?? 'This item needs to be reconnected to its Canvas source before Deep Learn can save notes or quizzes.'
  const ui = getDeepLearnResourceUiState(moduleId, resolvedDeepLearnResourceId, note, {
    notesAvailability: effectiveAvailability,
    unavailableMessage: effectiveAvailabilityMessage,
    readiness,
  })
  const quizHref = buildModuleQuizHref(moduleId, { resourceId: resolvedDeepLearnResourceId })
  const visualExtractionAvailable = resource.visualExtractionStatus === 'available'
  const visualExtractionRunning = resource.visualExtractionStatus === 'running' || resource.extractionStatus === 'processing'
  const disabledReason = readiness && !readiness.canGenerate ? readiness.detail : null

  return (
    <div style={{ display: 'grid', gap: '0.9rem' }}>
      <DeepLearnWorkspace
        key={`${moduleId}:${resolvedDeepLearnResourceId}:${resource.id}:${note?.id ?? 'no-note'}:${note?.updatedAt ?? 'not-loaded'}`}
        moduleId={moduleId}
        courseId={courseId}
        resource={resource}
        deepLearnResourceId={resolvedDeepLearnResourceId}
        note={note}
        sourceHref={sourceHref}
        readerHref={readerHref}
        statusSummary={ui.detail}
        blockedMessage={(ui.status === 'unavailable' || ui.status === 'blocked') ? effectiveAvailabilityMessage : null}
      />

      <section className="motion-card motion-delay-2 section-shell" style={{ padding: '0.95rem 1rem', display: 'grid', gap: '0.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 460px' }}>
          <p className="ui-kicker">Deep Learn status</p>
          <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '48rem' }}>{ui.summary}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {ui.status === 'unavailable' || ui.status === 'blocked' ? (
            visualExtractionAvailable ? (
              <OcrSourceButton moduleId={moduleId} resourceId={resolvedDeepLearnResourceId} autoStart statusOnly />
            ) : (
              <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', maxWidth: '24rem' }}>
                {effectiveAvailabilityMessage}
              </span>
            )
          ) : note?.status !== 'ready' ? (
            <DeepLearnGenerateButton
              moduleId={moduleId}
              resourceId={resolvedDeepLearnResourceId}
              courseId={courseId}
              label={ui.primaryLabel}
              className="ui-button ui-button-secondary ui-button-xs"
              disabledReason={disabledReason}
            />
          ) : null}
          {visualExtractionRunning && (
            <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              Reading scanned pages...
            </span>
          )}
          {note?.status === 'ready' && note.quizReady && (
            <Link href={quizHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Quiz this
            </Link>
          )}
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open original source
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <StatePill label={ui.statusLabel} tone={ui.tone} />
        <StatePill label={resource.type} tone="muted" />
        {note?.status === 'ready' && <StatePill label={`${note.answerBank.length} key answer${note.answerBank.length === 1 ? '' : 's'}`} tone="muted" />}
        {note?.status === 'ready' && <StatePill label={`${note.identificationItems.length} ID item${note.identificationItems.length === 1 ? '' : 's'}`} tone="muted" />}
        {note?.status === 'ready' && note.mcqDrill.length > 0 && <StatePill label={`${note.mcqDrill.length} MCQ`} tone="muted" />}
        {note?.status === 'ready' && note.timeline.length > 0 && <StatePill label={`${note.timeline.length} timeline cue${note.timeline.length === 1 ? '' : 's'}`} tone="muted" />}
        {note?.status === 'ready' && note.quizReady && <StatePill label="Quiz ready" tone="accent" />}
      </div>

      {note?.status === 'ready' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <WorkspacePanel title="Pack profile">
            <MetaLine label="Primary mode" value={note.quizReady ? 'Quiz-ready review pack' : 'Review pack with partial quiz coverage'} />
            <MetaLine label="Key answers" value={`${note.answerBank.length}`} />
            <MetaLine label="Identification items" value={`${note.identificationItems.length}`} />
            <MetaLine label="MCQ drill items" value={`${note.mcqDrill.length}`} />
          </WorkspacePanel>

          <WorkspacePanel title="Source grounding">
            <MetaLine label="Source type" value={note.sourceGrounding.sourceType ?? resource.type} />
            <MetaLine label="Extraction quality" value={note.sourceGrounding.extractionQuality ?? 'Unknown'} />
            <MetaLine label="Grounding strategy" value={formatGroundingStrategy(note.sourceGrounding.groundingStrategy)} />
            <MetaLine label="Grounded chars" value={`${note.sourceGrounding.charCount}`} />
          </WorkspacePanel>
        </div>
      )}
      <details className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.72rem 0.78rem' }}>
        <summary className="ui-interactive-summary" style={{ padding: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Advanced source tools
        </summary>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.72rem' }}>
          <Link href={readerHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Source details
          </Link>
          {visualExtractionAvailable && (
            <OcrSourceButton
              moduleId={moduleId}
              resourceId={resolvedDeepLearnResourceId}
              className="ui-button ui-button-ghost ui-button-xs"
              idleLabel="Retry OCR"
            />
          )}
        </div>
      </details>
      </section>
    </div>
  )
}

function formatGroundingStrategy(value: DeepLearnNote['sourceGrounding']['groundingStrategy']) {
  if (value === 'stored_extract') return 'Stored text'
  if (value === 'source_refetch') return 'Source refetch'
  if (value === 'scan_fallback') return 'Scan fallback'
  if (value === 'context_only') return 'Context only'
  return 'Insufficient'
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: '0.15rem', marginBottom: '0.5rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
        {value}
      </p>
    </div>
  )
}

function StatePill({
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
      padding: '0.3rem 0.62rem',
      borderRadius: '999px',
      border: `1px solid ${border}`,
      background,
      color: 'var(--text-primary)',
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}
