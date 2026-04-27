import Link from 'next/link'
import { listDraftsForShelves } from '@/actions/drafts'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { CourseShelf } from '@/components/drafts/CourseShelf'
import { resolveStudyLibraryHref, type DraftShelfItem, type StudyLibraryItem } from '@/lib/types'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function StudyLibraryPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const { drafts, courses, availability, message } = await listDraftsForShelves()
  const courseNames = new Map(courses.map((course) => [course.id, course]))
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]))
  const courseFilter = getFirstSearchParamValue(resolvedSearchParams?.course)
  const moduleFilter = getFirstSearchParamValue(resolvedSearchParams?.module)
  const kindFilter = getFirstSearchParamValue(resolvedSearchParams?.filter) // 'learning' | 'tasks' | null
  const items = drafts.map((draft) => toStudyLibraryItem(draft, courseNames))

  const scopedItems = items.filter((item) => {
    if (courseFilter && draftById.get(item.id)?.courseId !== courseFilter) return false
    if (moduleFilter && draftById.get(item.id)?.sourceModuleId !== moduleFilter) return false
    if (kindFilter === 'learning' && item.kind !== 'learning') return false
    if (kindFilter === 'tasks' && item.kind !== 'task') return false
    return true
  })
  const grouped = groupItemsByCourse(scopedItems, draftById, courseNames)
  const scopedLabel = moduleFilter
    ? 'Module library'
    : courseFilter
      ? 'Course library'
      : 'All generated content'

  const learningCount = items.filter((item) => item.kind === 'learning').length
  const tasksCount = items.filter((item) => item.kind === 'task').length

  function filterHref(filter: string | null) {
    const params = new URLSearchParams()
    if (courseFilter) params.set('course', courseFilter)
    if (moduleFilter) params.set('module', moduleFilter)
    if (filter) params.set('filter', filter)
    const qs = params.toString()
    return `/library${qs ? `?${qs}` : ''}`
  }

  return (
    <main className="page-shell command-page">
      <section
        className="motion-card section-shell section-shell-elevated"
        style={{ padding: '1.05rem 1.15rem', display: 'grid', gap: '1rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">{scopedLabel}</p>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>Study Library</h1>
            <p className="ui-page-copy" style={{ marginTop: '0.35rem', maxWidth: '46rem' }}>
              Generated study content lives here in one place. Learning packs from Learn and saved drafts from Tasks stay grouped by course so you can reopen the right workspace without hunting through modules.
            </p>
            {(courseFilter || moduleFilter) && (
              <div style={{ marginTop: '0.6rem' }}>
                <Link href="/library" className="ui-button ui-button-ghost ui-button-xs">
                  View all generated content
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Link
            href={filterHref(null)}
            className={!kindFilter ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            All ({items.length})
          </Link>
          <Link
            href={filterHref('learning')}
            className={kindFilter === 'learning' ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            Learning ({learningCount})
          </Link>
          <Link
            href={filterHref('tasks')}
            className={kindFilter === 'tasks' ? 'ui-button ui-button-secondary ui-button-xs' : 'ui-button ui-button-ghost ui-button-xs'}
          >
            Tasks ({tasksCount})
          </Link>
        </div>
      </section>

      <section className="motion-card motion-delay-1 section-shell" style={{ padding: '1rem 1.05rem' }}>
        {availability !== 'available' ? (
          <GeneratedContentState
            title={getUnavailableStateTitle(message)}
            description={getUnavailableStateDescription(message)}
            tone={isSignedOutMessage(message) ? 'accent' : 'warning'}
            action={(
              <Link
                href={isSignedOutMessage(message) ? '/sign-in?next=/library' : '/courses'}
                className="ui-button ui-button-secondary ui-button-xs"
                style={{ textDecoration: 'none' }}
              >
                {isSignedOutMessage(message) ? 'Sign in' : 'Go to Courses'}
              </Link>
            )}
          />
        ) : scopedItems.length === 0 ? (
          <GeneratedContentState
            title={getEmptyStateTitle({ kindFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
            description={getEmptyStateDescription({ kindFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
            action={(
              <Link
                href={getEmptyStateHref({ kindFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
                className="ui-button ui-button-secondary ui-button-xs"
                style={{ textDecoration: 'none' }}
              >
                {getEmptyStateActionLabel({ kindFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
              </Link>
            )}
          />
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {grouped.map((group) => {
              const latestItem = group.items[0]

              return (
                <CourseShelf
                  key={group.courseTitle ?? 'uncategorized'}
                  courseName={group.courseTitle ?? 'Unassigned content'}
                  courseCode={group.courseCode ?? ''}
                  items={group.items}
                  latestItemHref={latestItem.href}
                  totalCount={group.items.length}
                  lastUpdated={formatShortDate(latestItem.updatedAt)}
                />
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function getFirstSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toStudyLibraryItem(
  draft: DraftShelfItem,
  courseNames: Map<string, { id: string; name: string; code: string }>,
): StudyLibraryItem {
  const kind = draft.entryKind === 'deep_learn_note' || draft.sourceType !== 'task' ? 'learning' : 'task'
  const courseTitle = draft.courseId ? courseNames.get(draft.courseId)?.name : undefined

  return {
    id: draft.id,
    title: draft.title,
    kind,
    subtitle: getLibrarySubtitle(draft),
    courseTitle,
    moduleTitle: draft.moduleTitle ?? undefined,
    taskTitle: kind === 'task' ? draft.title : undefined,
    updatedAt: draft.updatedAt,
    href: resolveStudyLibraryHref(draft),
  }
}

function getLibrarySubtitle(draft: DraftShelfItem) {
  if (draft.entryKind === 'deep_learn_note') return 'Exam prep pack'
  if (draft.draftType === 'flashcard_set') return 'Flashcard set'
  if (draft.draftType === 'study_notes' && draft.sourceType === 'task') return 'Task draft'
  if (draft.draftType === 'study_notes') return 'Study notes'
  if (draft.draftType === 'summary') return 'Summary'
  return 'Study output'
}

function groupItemsByCourse(
  items: StudyLibraryItem[],
  draftById: Map<string, DraftShelfItem>,
  courseNames: Map<string, { id: string; name: string; code: string }>,
) {
  const groups = new Map<string, StudyLibraryItem[]>()

  items.forEach((item) => {
    const courseId = draftById.get(item.id)?.courseId ?? null
    const key = courseId ?? 'uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), item])
  })

  return Array.from(groups.entries())
    .map(([courseKey, groupItems]) => {
      const course = courseKey === 'uncategorized' ? null : courseNames.get(courseKey) ?? null
      return {
        courseTitle: course?.name ?? null,
        courseCode: course?.code ?? '',
        items: groupItems.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()),
      }
    })
    .sort((a, b) => new Date(b.items[0]?.updatedAt ?? 0).getTime() - new Date(a.items[0]?.updatedAt ?? 0).getTime())
}

function formatShortDate(value?: string) {
  if (!value) return 'recently'
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getEmptyStateTitle({
  kindFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (kindFilter === 'learning') return 'No learning packs yet.'
  if (kindFilter === 'tasks') return 'No task drafts yet.'
  if (hasAnyItems && hasScopedFilters) return 'Nothing matches this view yet.'
  return 'No saved study content yet.'
}

function getEmptyStateDescription({
  kindFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (kindFilter === 'learning') return 'Open a module and generate a Learn item to save it here.'
  if (kindFilter === 'tasks') return 'Start from a task and save a draft to see it here.'
  if (hasAnyItems && hasScopedFilters) return 'Try a broader library view to reopen another saved item.'
  return "Generate notes, task drafts, or exam prep packs and they'll appear here."
}

function getEmptyStateActionLabel({
  kindFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (hasAnyItems && hasScopedFilters && !kindFilter) return 'View all generated content'
  return hasAnyItems && hasScopedFilters ? 'View all generated content' : 'Go to Courses'
}

function getEmptyStateHref({
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (hasAnyItems && hasScopedFilters) return '/library'
  return '/courses'
}

function isSignedOutMessage(message: string | null) {
  return (message ?? '').toLowerCase().includes('sign in')
}

function getUnavailableStateTitle(message: string | null) {
  if (isSignedOutMessage(message)) return 'Sign in to load your saved study content.'
  return "Couldn't load your saved study content."
}

function getUnavailableStateDescription(message: string | null) {
  if (isSignedOutMessage(message)) return 'Your saved notes, task drafts, and exam prep packs will appear here after you sign in.'
  if ((message ?? '').toLowerCase().includes('supabase')) return 'Saved study content is not available in this local setup yet.'
  return 'Try again in a moment, or head back to Courses while this catches up.'
}
