import Link from 'next/link'
import { listDraftsForShelves } from '@/actions/drafts'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { CourseShelf } from '@/components/drafts/CourseShelf'
import { groupItemsByCourse, toStudyLibraryItem } from '@/lib/study-library'

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
      <section className="motion-card section-shell" style={{ padding: '1rem 1.1rem', display: 'grid', gap: '0.9rem' }}>
        <div className="home-section-heading">
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker">{scopedLabel}</p>
            <h1 className="ui-page-title" style={{ marginTop: '0.4rem', fontSize: 'clamp(1.6rem, 2.5vw, 2.1rem)' }}>Study Library</h1>
            <p className="ui-section-copy" style={{ marginTop: '0.4rem', maxWidth: '44rem' }}>
              Learning packs and saved drafts grouped by course.
            </p>
          </div>
          {(courseFilter || moduleFilter) && (
            <Link href="/library" className="home-subtle-link">
              View all
            </Link>
          )}
        </div>

        {/* Filter chips */}
        <div className="home-plan-filter" style={{ paddingBottom: 0 }}>
          <Link
            href={filterHref(null)}
            className={`home-plan-filter-chip${!kindFilter ? ' active' : ''}`}
          >
            All {items.length > 0 ? `(${items.length})` : ''}
          </Link>
          <Link
            href={filterHref('learning')}
            className={`home-plan-filter-chip${kindFilter === 'learning' ? ' active' : ''}`}
          >
            Learning {learningCount > 0 ? `(${learningCount})` : ''}
          </Link>
          <Link
            href={filterHref('tasks')}
            className={`home-plan-filter-chip${kindFilter === 'tasks' ? ' active' : ''}`}
          >
            Tasks {tasksCount > 0 ? `(${tasksCount})` : ''}
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
