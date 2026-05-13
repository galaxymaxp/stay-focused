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
  const subtypeFilter = getFirstSearchParamValue(resolvedSearchParams?.subtype)
  const items = drafts.map((draft) => toStudyLibraryItem(draft, courseNames))

  const scopedItems = items.filter((item) => {
    if (courseFilter && draftById.get(item.id)?.courseId !== courseFilter) return false
    if (moduleFilter && draftById.get(item.id)?.sourceModuleId !== moduleFilter) return false
    if (kindFilter === 'learning' && item.kind !== 'learning') return false
    if (kindFilter === 'tasks' && item.kind !== 'task') return false
    if (subtypeFilter === 'reviewer' && !['reviewer', 'study_sheet', 'cram_sheet'].includes(item.studyOutputKind ?? '')) return false
    if (subtypeFilter && subtypeFilter !== 'reviewer' && item.studyOutputKind !== subtypeFilter) return false
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
  const subtypeCounts = {
    task_output: items.filter((item) => item.studyOutputKind === 'task_output').length,
    reviewer: items.filter((item) => ['reviewer', 'study_sheet', 'cram_sheet'].includes(item.studyOutputKind ?? '')).length,
    quiz_pack: items.filter((item) => item.studyOutputKind === 'quiz_pack').length,
  }

  function filterHref(filter: string | null, subtype: string | null = subtypeFilter) {
    const params = new URLSearchParams()
    if (courseFilter) params.set('course', courseFilter)
    if (moduleFilter) params.set('module', moduleFilter)
    if (filter) params.set('filter', filter)
    if (subtype) params.set('subtype', subtype)
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
                Learning packs and saved outputs grouped by course.
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

        <div className="home-plan-filter" style={{ paddingTop: 0 }}>
          <Link
            href={filterHref(kindFilter, null)}
            className={`home-plan-filter-chip${!subtypeFilter ? ' active' : ''}`}
          >
            All outputs
          </Link>
          <Link
            href={filterHref(kindFilter, 'task_output')}
            className={`home-plan-filter-chip${subtypeFilter === 'task_output' ? ' active' : ''}`}
          >
            Task outputs {subtypeCounts.task_output > 0 ? `(${subtypeCounts.task_output})` : ''}
          </Link>
          <Link
            href={filterHref(kindFilter, 'reviewer')}
            className={`home-plan-filter-chip${subtypeFilter === 'reviewer' ? ' active' : ''}`}
          >
            Reviewers {subtypeCounts.reviewer > 0 ? `(${subtypeCounts.reviewer})` : ''}
          </Link>
          <Link
            href={filterHref(kindFilter, 'quiz_pack')}
            className={`home-plan-filter-chip${subtypeFilter === 'quiz_pack' ? ' active' : ''}`}
          >
            Quizzes {subtypeCounts.quiz_pack > 0 ? `(${subtypeCounts.quiz_pack})` : ''}
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
              title={getEmptyStateTitle({ kindFilter, subtypeFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
              description={getEmptyStateDescription({ kindFilter, subtypeFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
              action={(
                <Link
                  href={getEmptyStateHref({ hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
                  className="ui-button ui-button-secondary ui-button-xs"
                  style={{ textDecoration: 'none' }}
                >
                  {getEmptyStateActionLabel({ kindFilter, subtypeFilter, hasAnyItems: items.length > 0, hasScopedFilters: Boolean(courseFilter || moduleFilter) })}
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
  subtypeFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  subtypeFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (subtypeFilter === 'task_output') return 'No task outputs yet.'
  if (subtypeFilter === 'reviewer') return 'No reviewers yet.'
  if (subtypeFilter === 'quiz_pack') return 'No quizzes yet.'
  if (kindFilter === 'learning') return 'No learning packs yet.'
  if (kindFilter === 'tasks') return 'No task outputs yet.'
  if (hasAnyItems && hasScopedFilters) return 'Nothing matches this view yet.'
  return 'No saved study content yet.'
}

function getEmptyStateDescription({
  kindFilter,
  subtypeFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  subtypeFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (subtypeFilter === 'task_output') return 'Open a task and generate an output to see it here.'
  if (subtypeFilter === 'reviewer') return 'Open a ready Study Pack and generate a Reviewer to see it here. Older Study Sheet and Cram Sheet items appear here too.'
  if (subtypeFilter === 'quiz_pack') return 'Open a ready Study Pack and start a Quiz to see it here.'
  if (kindFilter === 'learning') return 'Open a module and generate a Learn item to save it here.'
  if (kindFilter === 'tasks') return 'Start from a task and generate an output to see it here.'
  if (hasAnyItems && hasScopedFilters) return 'Try a broader library view to reopen another saved item.'
  return "Generate Study Packs, Reviewers, Quizzes, or task outputs and they'll appear here."
}

function getEmptyStateActionLabel({
  kindFilter,
  subtypeFilter,
  hasAnyItems,
  hasScopedFilters,
}: {
  kindFilter: string | null
  subtypeFilter: string | null
  hasAnyItems: boolean
  hasScopedFilters: boolean
}) {
  if (hasAnyItems && hasScopedFilters && !kindFilter && !subtypeFilter) return 'View all generated content'
  return hasAnyItems && hasScopedFilters ? 'View all generated content' : 'Go to Courses'
}

function getEmptyStateHref({
  hasAnyItems,
  hasScopedFilters,
}: {
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
  if (isSignedOutMessage(message)) return 'Your saved Study Packs, Reviewers, Quizzes, and task outputs will appear here after you sign in.'
  if ((message ?? '').toLowerCase().includes('supabase')) return 'Saved study content is not available in this local setup yet.'
  return 'Try again in a moment, or head back to Courses while this catches up.'
}
