import Link from 'next/link'
import { notFound } from 'next/navigation'
import { reprocessModuleResourcesAction } from '@/actions/module-resources'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import {
  formatNormalizedModuleResourceSourceType,
  getModuleResourceCapabilityInfo,
} from '@/lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { extractCourseName, getModuleWorkspace } from '@/lib/module-workspace'
import { getResourceElementId } from '@/lib/stay-focused-links'
import { getStudySourceTypeLabel } from '@/lib/study-resource'
import { labelForExtractionStatus } from '@/lib/study-file-reader'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ModuleInspectPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, resources } = workspace
  const courseName = extractCourseName(module.raw_content)
  const focusedResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const notice = buildNotice(resolvedSearchParams)
  const rows = resources
    .map((resource) => ({
      resource,
      capability: getModuleResourceCapabilityInfo(resource),
      quality: getModuleResourceQualityInfo(resource),
      debug: getInspectDebugInfo(resource.metadata),
    }))
    .sort(compareInspectRows)

  const counts = {
    supported: rows.filter((row) => row.capability.capability === 'supported').length,
    partial: rows.filter((row) => row.capability.capability === 'partial').length,
    unsupported: rows.filter((row) => row.capability.capability === 'unsupported').length,
    failed: rows.filter((row) => row.capability.capability === 'failed').length,
    strong: rows.filter((row) => row.quality.quality === 'strong').length,
    usable: rows.filter((row) => row.quality.quality === 'usable').length,
    weak: rows.filter((row) => row.quality.quality === 'weak').length,
    empty: rows.filter((row) => row.quality.quality === 'empty').length,
  }

  const baseReturnPath = `/modules/${module.id}/inspect`

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary="Internal compatibility view for the persisted module resource pipeline. This page shows what each resource actually became after sync or reprocess."
    >
      <div className="command-page command-page-tight">
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.9rem' }}>
          <div className="command-header">
            <div className="command-header-main">
              <p className="ui-kicker">Resource inspection</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Compatibility, extraction, and reprocess status</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '50rem' }}>
                Capability shows whether Stay Focused can read the source at all. Quality shows whether the persisted text is actually strong enough to trust for Learn and Quiz. Supported does not automatically mean useful.
              </p>
            </div>
            <div className="command-header-side">
              <div className="command-header-actions">
                <Link href={`/modules/${module.id}/learn#source-support`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                  Back to Learn
                </Link>
                <form action={reprocessModuleResourcesAction}>
                  <input type="hidden" name="moduleId" value={module.id} />
                  {module.courseId && <input type="hidden" name="courseId" value={module.courseId} />}
                  <input type="hidden" name="scope" value="weak" />
                  <input type="hidden" name="returnPath" value={baseReturnPath} />
                  <input type="hidden" name="triggeredBy" value="inspect" />
                  <button type="submit" className="ui-button ui-button-secondary ui-button-xs">
                    Reprocess weak resources
                  </button>
                </form>
                <form action={reprocessModuleResourcesAction}>
                  <input type="hidden" name="moduleId" value={module.id} />
                  {module.courseId && <input type="hidden" name="courseId" value={module.courseId} />}
                  <input type="hidden" name="scope" value="all" />
                  <input type="hidden" name="returnPath" value={baseReturnPath} />
                  <input type="hidden" name="triggeredBy" value="inspect" />
                  <button type="submit" className="ui-button ui-button-ghost ui-button-xs">
                    Reprocess all
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
            <StatCard label="Resources" value={String(rows.length)} />
            <StatCard label="Supported" value={String(counts.supported)} tone="accent" />
            <StatCard label="Partial" value={String(counts.partial)} tone="warning" />
            <StatCard label="Unsupported" value={String(counts.unsupported)} />
            <StatCard label="Failed" value={String(counts.failed)} tone="danger" />
            <StatCard label="Strong" value={String(counts.strong)} tone="accent" />
            <StatCard label="Usable" value={String(counts.usable)} tone="accent" />
            <StatCard label="Weak" value={String(counts.weak)} tone="warning" />
            <StatCard label="Empty" value={String(counts.empty)} />
          </div>

          {notice && (
            <div className={notice.tone === 'danger' ? 'ui-card ui-status-danger' : 'ui-card-soft'} style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.68, color: notice.tone === 'danger' ? 'var(--red)' : 'var(--text-secondary)' }}>
                {notice.message}
              </p>
            </div>
          )}

          <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.85rem 0.9rem' }}>
            <p className="ui-kicker">Backfill note</p>
            <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
              Reprocess uses the stored `module_resources` URLs and the current extraction logic. Protected Canvas items may still need server-side `CANVAS_API_URL` and `CANVAS_API_TOKEN` to fetch again cleanly.
            </p>
          </div>
        </section>

        <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1rem 1.05rem', display: 'grid', gap: '0.8rem' }}>
              <div>
                <p className="ui-kicker">Persisted sources</p>
                <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.04rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
              Title, type, capability, quality, grounding treatment, char count, preview, and reason
                </h3>
              </div>

          {rows.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
              No module resources are stored for this module yet.
            </div>
          ) : (
            <div className="command-scroll-body" data-density="tall">
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {rows.map(({ resource, capability, quality, debug }) => {
                  const rowReturnPath = `${baseReturnPath}?resource=${encodeURIComponent(resource.id)}#${getResourceElementId(resource.id)}`
                  const preview = quality.meaningfulText || resource.extractedTextPreview?.trim() || resource.extractedText?.trim() || quality.reason
                  const lastReprocessedAt = typeof resource.metadata.lastReprocessedAt === 'string' ? resource.metadata.lastReprocessedAt : null

                  return (
                    <article
                      key={resource.id}
                      id={getResourceElementId(resource.id)}
                      className="glass-panel glass-soft"
                      style={{
                        ['--glass-panel-border' as string]: focusedResourceId === resource.id
                          ? 'color-mix(in srgb, var(--accent-border) 38%, var(--border-subtle) 62%)'
                          : 'var(--glass-border)',
                        borderRadius: 'var(--radius-panel)',
                        padding: '0.9rem 0.95rem',
                        display: 'grid',
                        gap: '0.75rem',
                        background: focusedResourceId === resource.id
                          ? 'color-mix(in srgb, var(--surface-selected) 76%, var(--surface-elevated) 24%)'
                          : undefined,
                      }}
                    >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0, flex: '1 1 520px' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.42rem' }}>
                          <StateBadge label={capability.capabilityLabel} tone={capability.capabilityTone} />
                          <StateBadge label={quality.qualityLabel} tone={quality.qualityTone} />
                          <StateBadge label={quality.groundingLabel} tone={quality.groundingLevel === 'strong' ? 'accent' : quality.groundingLevel === 'weak' ? 'warning' : 'muted'} />
                          <StateBadge label={labelForExtractionStatus(resource.extractionStatus, resource.extractionError, { fallbackReason: debug.fallbackReason, previewState: debug.previewState })} tone={capability.capabilityTone === 'danger' ? 'danger' : 'muted'} />
                          <StateBadge label={getStudySourceTypeLabel({ type: resource.resourceType, extension: resource.extension, contentType: resource.contentType })} tone="muted" />
                          <StateBadge label={formatNormalizedModuleResourceSourceType(capability.normalizedSourceType)} tone="muted" />
                        </div>
                        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.5, fontWeight: 650, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
                          {resource.title}
                        </p>
                        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                          {preview}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <Link href={`/modules/${module.id}/learn/resources/${resource.id}`} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                          Open detail
                        </Link>
                        {(resource.htmlUrl || resource.sourceUrl) && (
                          <a href={resource.htmlUrl ?? resource.sourceUrl ?? '#'} target="_blank" rel="noreferrer" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                            Open source
                          </a>
                        )}
                        <form action={reprocessModuleResourcesAction}>
                          <input type="hidden" name="moduleId" value={module.id} />
                          {module.courseId && <input type="hidden" name="courseId" value={module.courseId} />}
                          <input type="hidden" name="resourceId" value={resource.id} />
                          <input type="hidden" name="scope" value="single" />
                          <input type="hidden" name="returnPath" value={rowReturnPath} />
                          <input type="hidden" name="triggeredBy" value="inspect" />
                          <button type="submit" className="ui-button ui-button-secondary ui-button-xs">
                            Reprocess
                          </button>
                        </form>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.7rem' }}>
                      <MetaCard label="Source type" value={resource.resourceType} />
                      <MetaCard label="Original kind" value={debug.originalResourceKind ?? resource.resourceType} />
                      <MetaCard label="Normalized type" value={formatNormalizedModuleResourceSourceType(capability.normalizedSourceType)} />
                      <MetaCard label="Resolved target" value={debug.resolvedTargetType ?? 'Not resolved'} />
                      <MetaCard label="Resolution state" value={debug.resolutionState ?? 'Not recorded'} />
                      <MetaCard label="Capability" value={capability.capabilityLabel} />
                      <MetaCard label="Quality" value={quality.qualityLabel} />
                      <MetaCard label="Grounding" value={quality.groundingLabel} />
                      <MetaCard label="Extraction status" value={labelForExtractionStatus(resource.extractionStatus, resource.extractionError, { fallbackReason: debug.fallbackReason, previewState: debug.previewState })} />
                      <MetaCard label="Readable chars" value={resource.extractedCharCount > 0 ? resource.extractedCharCount.toLocaleString() : '0'} />
                      <MetaCard label="Word count" value={typeof debug.storedWordCount === 'number' ? debug.storedWordCount.toLocaleString() : '0'} />
                      <MetaCard label="Preview state" value={debug.previewState ?? 'Not recorded'} />
                      <MetaCard label="Recommendation" value={debug.recommendationStrength ?? 'Not recorded'} />
                      <MetaCard label="Signal ratio" value={quality.totalCharCount > 0 ? `${Math.round(quality.signalRatio * 100)}%` : '0%'} />
                      <MetaCard label="Last reprocess" value={lastReprocessedAt ? formatDateTime(lastReprocessedAt) : 'Not yet'} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(260px, 0.85fr)', gap: '0.75rem' }}>
                      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
                        <p className="ui-kicker">Preview / stored text</p>
                        <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                          {preview}
                        </p>
                      </div>
                      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
                        <p className="ui-kicker">Quality / fallback note</p>
                        <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                          {quality.reason}
                        </p>
                        {quality.reason !== capability.reason && (
                          <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                            Capability note: {capability.reason}
                          </p>
                        )}
                        {debug.fallbackReason && (
                          <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                            Fallback reason: {debug.fallbackReason}
                          </p>
                        )}
                        {(debug.sourceUrlCategory || debug.resolvedUrlCategory) && (
                          <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                            URL categories: {debug.sourceUrlCategory ?? 'unknown'} {'->'} {debug.resolvedUrlCategory ?? 'unknown'}
                          </p>
                        )}
                        {resource.extractionError && (
                          <p style={{ margin: '0.55rem 0 0', fontSize: '12px', lineHeight: 1.62, color: 'var(--text-muted)' }}>
                            Stored extraction note: {resource.extractionError}
                          </p>
                        )}
                      </div>
                    </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </ModuleLensShell>
  )
}

function StatCard({
  label,
  value,
  tone = 'muted',
}: {
  label: string
  value: string
  tone?: 'accent' | 'warning' | 'muted' | 'danger'
}) {
  return (
    <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.85rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.38rem 0 0', fontSize: '20px', lineHeight: 1.1, fontWeight: 650, color: tone === 'danger' ? 'var(--red)' : 'var(--text-primary)' }}>{value}</p>
    </div>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel glass-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.75rem 0.8rem' }}>
      <p style={{ margin: 0, fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: '0.36rem 0 0', fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</p>
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

function compareInspectRows(
  left: { capability: ReturnType<typeof getModuleResourceCapabilityInfo>; quality: ReturnType<typeof getModuleResourceQualityInfo>; resource: { title: string } },
  right: { capability: ReturnType<typeof getModuleResourceCapabilityInfo>; quality: ReturnType<typeof getModuleResourceQualityInfo>; resource: { title: string } },
) {
  const capabilityDiff = capabilityWeight(left.capability.capability) - capabilityWeight(right.capability.capability)
  if (capabilityDiff !== 0) return capabilityDiff

  const qualityDiff = qualityWeight(left.quality.quality) - qualityWeight(right.quality.quality)
  if (qualityDiff !== 0) return qualityDiff

  const charDiff = right.capability.readableCharCount - left.capability.readableCharCount
  if (charDiff !== 0) return charDiff

  return left.resource.title.localeCompare(right.resource.title)
}

function capabilityWeight(value: ReturnType<typeof getModuleResourceCapabilityInfo>['capability']) {
  if (value === 'failed') return 0
  if (value === 'unsupported') return 1
  if (value === 'partial') return 2
  return 3
}

function qualityWeight(value: ReturnType<typeof getModuleResourceQualityInfo>['quality']) {
  if (value === 'failed') return 0
  if (value === 'unsupported') return 1
  if (value === 'empty') return 2
  if (value === 'weak') return 3
  if (value === 'usable') return 4
  return 5
}

function buildNotice(searchParams?: Record<string, string | string[] | undefined>) {
  const reprocess = getSearchParamValue(searchParams?.reprocess)
  const count = getSearchParamValue(searchParams?.count)
  const message = getSearchParamValue(searchParams?.message)
  const scope = getSearchParamValue(searchParams?.scope)

  if (reprocess === 'done') {
    return {
      tone: 'accent' as const,
      message: `Reprocessed ${count ?? '0'} ${scope === 'single' ? 'source' : 'sources'} using the current extraction logic.`,
    }
  }

  if (reprocess === 'skipped') {
    return {
      tone: 'warning' as const,
      message: scope === 'weak'
        ? 'No weak resources matched the current reprocess filter.'
        : 'No resources matched the requested reprocess target.',
    }
  }

  if (reprocess === 'error') {
    return {
      tone: 'danger' as const,
      message: message ?? 'Resource reprocess failed.',
    }
  }

  return null
}

function getSearchParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getInspectDebugInfo(metadata: unknown): {
  originalResourceKind: string | null
  resolvedTargetType: string | null
  resolutionState: string | null
  fallbackReason: string | null
  sourceUrlCategory: string | null
  resolvedUrlCategory: string | null
  previewState: 'full_text_available' | 'preview_only' | 'no_text_available' | null
  recommendationStrength: string | null
  storedWordCount: number | null
} {
  const record = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}

  return {
    originalResourceKind: readString(record.originalResourceKind),
    resolvedTargetType: readString(record.resolvedTargetType),
    resolutionState: readString(record.resolutionState),
    fallbackReason: readString(record.fallbackReason ?? record.fallbackState),
    sourceUrlCategory: readString(record.sourceUrlCategory),
    resolvedUrlCategory: readString(record.resolvedUrlCategory),
    previewState: normalizePreviewState(record.previewState),
    recommendationStrength: readString(record.recommendationStrength),
    storedWordCount: typeof record.storedWordCount === 'number' ? record.storedWordCount : null,
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizePreviewState(value: unknown) {
  return value === 'full_text_available' || value === 'preview_only' || value === 'no_text_available'
    ? value
    : null
}
