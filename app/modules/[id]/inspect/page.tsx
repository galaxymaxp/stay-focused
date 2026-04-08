import Link from 'next/link'
import { notFound } from 'next/navigation'
import { reprocessModuleResourcesAction } from '@/actions/module-resources'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import {
  formatNormalizedModuleResourceSourceType,
  getModuleResourceCapabilityInfo,
} from '@/lib/module-resource-capability'
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
    }))
    .sort(compareInspectRows)

  const counts = {
    supported: rows.filter((row) => row.capability.capability === 'supported').length,
    partial: rows.filter((row) => row.capability.capability === 'partial').length,
    unsupported: rows.filter((row) => row.capability.capability === 'unsupported').length,
    failed: rows.filter((row) => row.capability.capability === 'failed').length,
    readable: rows.filter((row) => row.capability.hasReadableText).length,
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
      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="motion-card motion-delay-1 section-shell section-shell-elevated" style={{ padding: '1.2rem 1.3rem', display: 'grid', gap: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.9rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 520px' }}>
              <p className="ui-kicker">Resource inspection</p>
              <h2 className="ui-section-title" style={{ marginTop: '0.45rem' }}>Compatibility, extraction, and reprocess status</h2>
              <p className="ui-section-copy" style={{ marginTop: '0.45rem', maxWidth: '50rem' }}>
                Supported means readable text is actually persisted. Partial means the type is known but the stored result is still thin. Unsupported means Stay Focused can only link back out. Failed means the last extraction attempt did not complete cleanly.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.7rem' }}>
            <StatCard label="Resources" value={String(rows.length)} />
            <StatCard label="Supported" value={String(counts.supported)} tone="accent" />
            <StatCard label="Partial" value={String(counts.partial)} tone="warning" />
            <StatCard label="Unsupported" value={String(counts.unsupported)} />
            <StatCard label="Failed" value={String(counts.failed)} tone="danger" />
            <StatCard label="Readable" value={String(counts.readable)} tone="accent" />
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

        <section className="motion-card motion-delay-2 section-shell" style={{ padding: '1.1rem 1.15rem', display: 'grid', gap: '0.8rem' }}>
          <div>
            <p className="ui-kicker">Persisted resource rows</p>
            <h3 style={{ margin: '0.42rem 0 0', fontSize: '1.04rem', lineHeight: 1.35, color: 'var(--text-primary)' }}>
              Title, type, capability, extraction state, char count, preview, and reason
            </h3>
          </div>

          {rows.length === 0 ? (
            <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
              No module resources are stored for this module yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {rows.map(({ resource, capability }) => {
                const rowReturnPath = `${baseReturnPath}?resource=${encodeURIComponent(resource.id)}#${getResourceElementId(resource.id)}`
                const preview = resource.extractedTextPreview?.trim() || resource.extractedText?.trim() || capability.reason
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
                          <StateBadge label={labelForExtractionStatus(resource.extractionStatus)} tone={capability.capabilityTone === 'danger' ? 'danger' : 'muted'} />
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
                      <MetaCard label="Normalized type" value={formatNormalizedModuleResourceSourceType(capability.normalizedSourceType)} />
                      <MetaCard label="Capability" value={capability.capabilityLabel} />
                      <MetaCard label="Extraction status" value={labelForExtractionStatus(resource.extractionStatus)} />
                      <MetaCard label="Readable chars" value={resource.extractedCharCount > 0 ? resource.extractedCharCount.toLocaleString() : '0'} />
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
                        <p className="ui-kicker">Reason / fallback note</p>
                        <p style={{ margin: '0.45rem 0 0', fontSize: '13px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                          {capability.reason}
                        </p>
                      </div>
                    </div>
                  </article>
                )
              })}
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
  left: { capability: ReturnType<typeof getModuleResourceCapabilityInfo>; resource: { title: string } },
  right: { capability: ReturnType<typeof getModuleResourceCapabilityInfo>; resource: { title: string } },
) {
  const capabilityDiff = capabilityWeight(left.capability.capability) - capabilityWeight(right.capability.capability)
  if (capabilityDiff !== 0) return capabilityDiff

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

function buildNotice(searchParams?: Record<string, string | string[] | undefined>) {
  const reprocess = getSearchParamValue(searchParams?.reprocess)
  const count = getSearchParamValue(searchParams?.count)
  const message = getSearchParamValue(searchParams?.message)
  const scope = getSearchParamValue(searchParams?.scope)

  if (reprocess === 'done') {
    return {
      tone: 'accent' as const,
      message: `Reprocessed ${count ?? '0'} ${scope === 'single' ? 'resource' : 'resource rows'} using the current extraction logic.`,
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
