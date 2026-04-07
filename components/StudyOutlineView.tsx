'use client'

import { useState, type CSSProperties } from 'react'
import {
  buildStudyNotePreview,
  buildStudyNoteQuestionCountOptions,
  buildStudyNoteQuizItems,
  countStudyNoteBullets,
} from '@/lib/study-note-quiz'
import type { StudyFileOutlineItem, StudyFileOutlineSection } from '@/lib/study-file-reader'

export function StudyOutlineView({
  sections,
  sectionStyle,
}: {
  sections: StudyFileOutlineSection[]
  sectionStyle?: CSSProperties
}) {
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)
  const resolvedOpenSectionId = openSectionId && sections.some((section, index) => buildSectionId(section, index) === openSectionId)
    ? openSectionId
    : null

  return (
    <div style={{ display: 'grid', gap: '0.7rem' }}>
      {sections.map((section, index) => {
        const sectionId = buildSectionId(section, index)
        const expanded = resolvedOpenSectionId === sectionId

        return (
          <StudyNoteCard
            key={sectionId}
            section={section}
            index={index}
            expanded={expanded}
            onToggle={() => setOpenSectionId((current) => current === sectionId ? null : sectionId)}
            sectionStyle={sectionStyle}
          />
        )
      })}
    </div>
  )
}

function StudyNoteCard({
  section,
  index,
  expanded,
  onToggle,
  sectionStyle,
}: {
  section: StudyFileOutlineSection
  index: number
  expanded: boolean
  onToggle: () => void
  sectionStyle?: CSSProperties
}) {
  const quizItems = buildStudyNoteQuizItems(section)
  const questionCountOptions = buildStudyNoteQuestionCountOptions(quizItems.length)
  const preview = buildStudyNotePreview(section)
  const bulletCount = countStudyNoteBullets(section)

  return (
    <section
      className="ui-card-soft ui-interactive-card"
      data-open={expanded ? 'true' : 'false'}
      style={{
        borderRadius: 'var(--radius-tight)',
        padding: '0.8rem 0.85rem',
        display: 'grid',
        gap: expanded ? '0.8rem' : '0.55rem',
        ...sectionStyle,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="ui-interactive-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '0.75rem',
          alignItems: 'flex-start',
          textAlign: 'left',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 340px', display: 'grid', gap: '0.38rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Note {index + 1}</p>
            <MiniPill label={`${bulletCount} bullet${bulletCount === 1 ? '' : 's'}`} />
            <MiniPill label={questionCountOptions.length > 0 ? `${quizItems.length} quizable` : 'Quiz unavailable'} tone={questionCountOptions.length > 0 ? 'accent' : 'muted'} />
          </div>
          <h4 style={{ margin: 0, fontSize: '0.98rem', lineHeight: 1.38, color: 'var(--text-primary)' }}>
            {section.title}
          </h4>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.62, color: 'var(--text-secondary)' }}>
            {preview}
          </p>
        </div>

        <span className={expanded ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}>
          {expanded ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {expanded && (
        <div style={{ paddingTop: '0.15rem' }}>
          <OutlineItemList items={section.items} path={`${index}`} depth={0} />
        </div>
      )}
    </section>
  )
}

function OutlineItemList({
  items,
  path,
  depth,
}: {
  items: StudyFileOutlineItem[]
  path: string
  depth: number
}) {
  const listStyle = depth === 0 ? 'disc' : depth === 1 ? 'circle' : 'square'

  return (
    <ul style={{
      margin: 0,
      paddingLeft: depth === 0 ? '1.15rem' : '1.05rem',
      display: 'grid',
      gap: '0.45rem',
      listStyle,
    }}>
      {items.map((item, index) => (
        <li key={`${path}-${index}`} style={{ color: 'var(--text-secondary)' }}>
          <span style={{ fontSize: '14px', lineHeight: 1.72 }}>
            {item.text}
          </span>
          {item.children.length > 0 && (
            <div style={{ marginTop: '0.38rem' }}>
              <OutlineItemList items={item.children} path={`${path}-${index}`} depth={depth + 1} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function MiniPill({ label, tone = 'muted' }: { label: string; tone?: 'accent' | 'muted' }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0.24rem 0.55rem',
      borderRadius: '999px',
      border: `1px solid ${tone === 'accent'
        ? 'color-mix(in srgb, var(--accent) 28%, var(--border-subtle) 72%)'
        : 'var(--border-subtle)'}`,
      background: tone === 'accent'
        ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
        : 'color-mix(in srgb, var(--surface-soft) 94%, transparent)',
      color: 'var(--text-primary)',
      fontSize: '11px',
      fontWeight: 700,
      lineHeight: 1.2,
    }}>
      {label}
    </span>
  )
}

function buildSectionId(section: StudyFileOutlineSection, index: number) {
  return `${section.title}-${index}`
}
