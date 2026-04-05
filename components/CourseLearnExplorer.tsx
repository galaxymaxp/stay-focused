'use client'

import Link from 'next/link'
import { useState } from 'react'
import { StudyFileManualStateControls } from '@/components/StudyFileManualStateControls'
import type { CourseLearnActionRow, CourseLearnModuleCard, CourseLearnMoreRow, CourseLearnStudyMaterialRow } from '@/lib/course-learn-overview'

type ModuleTab = 'study' | 'do' | 'more'

export function CourseLearnExplorer({
  modules,
}: {
  modules: CourseLearnModuleCard[]
}) {
  const [openModuleId, setOpenModuleId] = useState<string | null>(null)
  const [tabByModuleId, setTabByModuleId] = useState<Record<string, ModuleTab>>({})

  function toggleModule(moduleId: string) {
    setOpenModuleId((current) => current === moduleId ? null : moduleId)
  }

  function setModuleTab(moduleId: string, tab: ModuleTab) {
    setTabByModuleId((current) => ({ ...current, [moduleId]: tab }))
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      {modules.map((module, index) => {
        const expanded = openModuleId === module.id
        const activeTab = tabByModuleId[module.id] ?? defaultTabForModule(module)

        return (
          <article
            key={module.id}
            className={`motion-card motion-delay-${Math.min(index + 1, 4)}`}
            style={{
              borderRadius: 'var(--radius-panel)',
              border: '1px solid color-mix(in srgb, var(--border-subtle) 82%, transparent)',
              background: expanded
                ? 'color-mix(in srgb, var(--surface-elevated) 94%, transparent)'
                : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
              boxShadow: expanded ? 'var(--shadow-soft)' : 'none',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => toggleModule(module.id)}
              aria-expanded={expanded}
              style={{
                width: '100%',
                padding: '1rem 1.05rem',
                border: 'none',
                background: 'transparent',
                display: 'grid',
                gap: '0.65rem',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.85rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 400px' }}>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {module.orderLabel && (
                      <span className="ui-kicker" style={{ color: 'var(--text-muted)' }}>{module.orderLabel}</span>
                    )}
                    <ReadinessPill tone={module.readinessTone} label={module.readinessLabel} />
                  </div>
                  <h2 style={{ margin: '0.45rem 0 0', fontSize: '20px', lineHeight: 1.25, fontWeight: 650, color: 'var(--text-primary)' }}>
                    {module.title}
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <CountPill label={`${module.studyCount} study`} />
                  <CountPill label={`${module.actionCount} do`} />
                  {module.moreCount > 0 && (
                    <CountPill label={`${module.moreCount} more`} />
                  )}
                  <CountPill label={expanded ? 'Collapse' : 'Open'} />
                </div>
              </div>

              <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
                {module.coverageHint}
              </p>
            </button>

            {expanded && (
              <div style={{
                padding: '0 1.05rem 1rem',
                display: 'grid',
                gap: '0.9rem',
                borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent)',
              }}>
                <div style={{
                  paddingTop: '0.95rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '0.85rem',
                  alignItems: 'start',
                }}>
                  <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem' }}>
                    <p className="ui-kicker">Module focus</p>
                    <p style={{ margin: '0.48rem 0 0', fontSize: '14px', lineHeight: 1.72, color: 'var(--text-secondary)' }}>
                      {module.summary}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '0.65rem' }}>
                    {module.resumeCue && (
                      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem' }}>
                        <p className="ui-kicker">{module.resumeCue.promptLabel}</p>
                        <p style={{ margin: '0.45rem 0 0', fontSize: '15px', lineHeight: 1.45, fontWeight: 650, color: 'var(--text-primary)' }}>
                          {module.resumeCue.title}
                        </p>
                        <p style={{ margin: '0.35rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                          {module.resumeCue.note}
                        </p>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                          <ActionLink
                            href={module.resumeCue.href}
                            label={module.resumeCue.actionLabel}
                            external={module.resumeCue.external}
                            tone="secondary"
                          />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <ActionLink href={module.moduleHref} label="Open module view" tone="ghost" />
                    </div>
                  </div>
                </div>

                <div className="ui-tab-group" style={{ width: 'fit-content', flexWrap: 'wrap' }}>
                  <TabButton
                    active={activeTab === 'study'}
                    onClick={() => setModuleTab(module.id, 'study')}
                    label={`Study (${module.studyCount})`}
                  />
                  <TabButton
                    active={activeTab === 'do'}
                    onClick={() => setModuleTab(module.id, 'do')}
                    label={`Do (${module.actionCount})`}
                  />
                  <TabButton
                    active={activeTab === 'more'}
                    onClick={() => setModuleTab(module.id, 'more')}
                    label={`More (${module.moreCount})`}
                  />
                </div>

                {activeTab === 'study' && (
                  <StudyTab module={module} />
                )}

                {activeTab === 'do' && (
                  <DoTab module={module} />
                )}

                {activeTab === 'more' && (
                  <MoreTab module={module} />
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function StudyTab({ module }: { module: CourseLearnModuleCard }) {
  if (module.studyMaterials.length === 0) {
    return (
      <SectionEmpty
        body={module.activityOverrides.length > 0
          ? 'All study materials in this module are currently treated as activity instead.'
          : 'No study materials are currently available in the main study lane for this module.'}
      />
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <div className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.8rem 0.9rem' }}>
        <p className="ui-kicker">Study progress</p>
        <p style={{ margin: '0.42rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {module.progressCounts.reviewed} reviewed / {module.progressCounts.skimmed} skimmed / {module.progressCounts.notStarted} not started
        </p>
      </div>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {module.studyMaterials.map((material) => (
          <StudyMaterialRow key={material.id} courseId={module.courseId} moduleId={module.id} material={material} />
        ))}
      </div>
    </div>
  )
}

function DoTab({ module }: { module: CourseLearnModuleCard }) {
  if (module.actionItems.length === 0 && module.activityOverrides.length === 0) {
    return <SectionEmpty body="Nothing is sitting in this module's Do lane right now." />
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      {module.activityOverrides.length > 0 && (
        <section className="ui-card-soft" style={{ borderRadius: 'var(--radius-tight)', padding: '0.9rem 0.95rem', display: 'grid', gap: '0.7rem' }}>
          <div>
            <p className="ui-kicker">Marked as activity</p>
            <p style={{ margin: '0.4rem 0 0', fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
              These are still study materials, but you moved them into the action lane for your own workflow.
            </p>
          </div>
          <div style={{ display: 'grid', gap: '0.7rem' }}>
            {module.activityOverrides.map((material) => (
              <StudyMaterialRow key={material.id} courseId={module.courseId} moduleId={module.id} material={material} subdued />
            ))}
          </div>
        </section>
      )}

      {module.actionItems.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {module.actionItems.map((item) => (
            <ActionItemRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <SectionEmpty body="No assignments, quizzes, or discussions are mapped into this module right now." />
      )}
    </div>
  )
}

function MoreTab({ module }: { module: CourseLearnModuleCard }) {
  if (module.moreItems.length === 0) {
    return <SectionEmpty body="No extra supporting items are sitting in the More lane for this module." />
  }

  return (
    <div style={{ display: 'grid', gap: '0.7rem' }}>
      {module.moreItems.map((item) => (
        <MoreItemRow key={item.id} item={item} />
      ))}
    </div>
  )
}

function StudyMaterialRow({
  courseId,
  moduleId,
  material,
  subdued = false,
}: {
  courseId: string
  moduleId: string
  material: CourseLearnStudyMaterialRow
  subdued?: boolean
}) {
  const meta = [
    material.fileTypeLabel,
    material.readinessLabel,
    material.progressLabel,
    material.required ? 'Required' : null,
    material.workflowOverride === 'activity' ? 'In Do lane' : null,
  ].filter(Boolean)

  return (
    <article
      style={{
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: subdued
          ? 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
          : 'color-mix(in srgb, var(--surface-elevated) 92%, transparent)',
        padding: '0.95rem 1rem',
        display: 'grid',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 380px' }}>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {meta.join(' / ')}
          </p>
          <h3 style={{ margin: '0.34rem 0 0', fontSize: '16px', lineHeight: 1.42, fontWeight: 650, color: 'var(--text-primary)' }}>
            {material.title}
          </h3>
          <p style={{ margin: '0.45rem 0 0', fontSize: '14px', lineHeight: 1.68, color: 'var(--text-secondary)' }}>
            {material.note}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ActionLink href={material.readerHref} label="Study reader" tone="secondary" />
          {material.canvasHref && (
            <ActionLink href={material.canvasHref} label="Canvas" external />
          )}
        </div>
      </div>

      <StudyFileManualStateControls
        moduleId={moduleId}
        resourceId={material.id}
        courseId={courseId || undefined}
        progressStatus={material.progressStatus}
        workflowOverride={material.workflowOverride}
        compact
        variant="quiet"
      />
    </article>
  )
}

function ActionItemRow({ item }: { item: CourseLearnActionRow }) {
  const meta = [
    item.kindLabel,
    item.dueLabel ? `Due ${item.dueLabel}` : null,
    item.required ? 'Required' : null,
  ].filter(Boolean)

  return (
    <article
      style={{
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: 'color-mix(in srgb, var(--surface-elevated) 92%, transparent)',
        padding: '0.9rem 0.95rem',
        display: 'grid',
        gap: '0.65rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 360px' }}>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            {meta.join(' / ')}
          </p>
          <h3 style={{ margin: '0.34rem 0 0', fontSize: '16px', lineHeight: 1.42, fontWeight: 650, color: 'var(--text-primary)' }}>
            {item.title}
          </h3>
          <p style={{ margin: '0.4rem 0 0', fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {item.note}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <ActionLink href={item.doHref} label="Open in Do" tone="secondary" />
          {item.canvasHref && (
            <ActionLink href={item.canvasHref} label="Canvas" external />
          )}
        </div>
      </div>
    </article>
  )
}

function MoreItemRow({ item }: { item: CourseLearnMoreRow }) {
  return (
    <article
      style={{
        borderRadius: 'var(--radius-tight)',
        border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
        background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
        padding: '0.9rem 0.95rem',
        display: 'grid',
        gap: '0.55rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
        {item.kindLabel}
      </p>
      <h3 style={{ margin: 0, fontSize: '16px', lineHeight: 1.42, fontWeight: 650, color: 'var(--text-primary)' }}>
        {item.title}
      </h3>
      <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
        {item.note}
      </p>
      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
        <ActionLink href={item.detailHref} label="Open detail" tone="secondary" />
        {item.canvasHref && (
          <ActionLink href={item.canvasHref} label="Canvas" external />
        )}
      </div>
    </article>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
    >
      {label}
    </button>
  )
}

function ReadinessPill({
  tone,
  label,
}: {
  tone: 'ready' | 'limited' | 'muted'
  label: string
}) {
  const background = tone === 'ready'
    ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
    : tone === 'limited'
      ? 'color-mix(in srgb, var(--amber-light) 88%, transparent)'
      : 'color-mix(in srgb, var(--surface-soft) 92%, transparent)'
  const border = tone === 'ready'
    ? 'color-mix(in srgb, var(--accent) 32%, var(--border-subtle) 68%)'
    : tone === 'limited'
      ? 'color-mix(in srgb, var(--amber) 24%, var(--border-subtle) 76%)'
      : 'var(--border-subtle)'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.68rem',
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

function CountPill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.32rem 0.62rem',
      borderRadius: '999px',
      border: '1px solid color-mix(in srgb, var(--border-subtle) 84%, transparent)',
      background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
      fontSize: '11px',
      fontWeight: 600,
      lineHeight: 1.2,
      color: 'var(--text-muted)',
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

function SectionEmpty({ body }: { body: string }) {
  return (
    <div className="ui-empty" style={{ borderRadius: 'var(--radius-tight)', padding: '0.95rem 1rem', fontSize: '14px', lineHeight: 1.68 }}>
      {body}
    </div>
  )
}

function defaultTabForModule(module: CourseLearnModuleCard): ModuleTab {
  if (module.studyCount > 0) return 'study'
  if (module.actionCount > 0) return 'do'
  return 'more'
}
