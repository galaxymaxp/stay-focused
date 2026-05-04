import Link from 'next/link'
import { LibraryDeleteButton } from '@/components/drafts/LibraryDeleteButton'
import type { StudyLibraryItem } from '@/lib/types'

const kindLabels: Record<StudyLibraryItem['kind'], string> = {
  learning: 'Learning',
  task: 'Task',
}

export function DraftCard({ item }: { item: StudyLibraryItem }) {
  return (
    <article className="home-sheet-row">
      <div style={{ minWidth: 0 }}>
        <div className="home-row-meta">
          <span className="ui-chip ui-chip-soft" style={{ fontWeight: 700 }}>
            {kindLabels[item.kind]}
          </span>
          {item.subtitle ? (
            <span className="ui-chip ui-chip-soft" style={{ fontWeight: 600 }}>
              {item.subtitle}
            </span>
          ) : null}
          {item.courseTitle ? (
            <span>{item.courseTitle}</span>
          ) : null}
        </div>

        <Link href={item.href} style={{ textDecoration: 'none' }}>
          <p className="home-row-title">{item.title}</p>
        </Link>

        {item.moduleTitle ? (
          <p className="home-row-copy">{item.moduleTitle}</p>
        ) : null}

        <p className="home-row-note">Updated {formatShortDate(item.updatedAt)}</p>
      </div>

      <LibraryDeleteButton id={item.id} entryKind={item.entryKind} title={item.title} />
    </article>
  )
}

function formatShortDate(value?: string) {
  if (!value) return 'recently'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
