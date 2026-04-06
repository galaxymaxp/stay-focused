import type { CSSProperties } from 'react'
import type { StudyFileOutlineItem, StudyFileOutlineSection } from '@/lib/study-file-reader'

export function StudyOutlineView({
  sections,
  sectionStyle,
}: {
  sections: StudyFileOutlineSection[]
  sectionStyle?: CSSProperties
}) {
  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      {sections.map((section, index) => (
        <section
          key={`${section.title}-${index}`}
          className="ui-card-soft"
          style={{
            borderRadius: 'var(--radius-tight)',
            padding: '0.9rem 0.95rem',
            display: 'grid',
            gap: '0.7rem',
            ...sectionStyle,
          }}
        >
          <div>
            <p className="ui-kicker">Study section {index + 1}</p>
            <h4 style={{ margin: '0.38rem 0 0', fontSize: '0.98rem', lineHeight: 1.4, color: 'var(--text-primary)' }}>
              {section.title}
            </h4>
          </div>
          <OutlineItemList items={section.items} path={`${index}`} depth={0} />
        </section>
      ))}
    </div>
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
