import Link from 'next/link'
import { listDraftsForShelves } from '@/actions/drafts'
import { CourseShelf } from '@/components/drafts/CourseShelf'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function DraftsPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const { drafts, courses } = await listDraftsForShelves()
  const courseNames = new Map(courses.map((course) => [course.id, course]))
  const courseFilter = getFirstSearchParamValue(resolvedSearchParams?.course)
  const moduleFilter = getFirstSearchParamValue(resolvedSearchParams?.module)
  const scopedDrafts = drafts.filter((draft) => {
    if (courseFilter && draft.courseId !== courseFilter) return false
    if (moduleFilter && draft.sourceModuleId !== moduleFilter) return false
    return true
  })
  const grouped = groupDraftsByCourse(scopedDrafts)
  const scopedLabel = moduleFilter
    ? 'Module notebook'
    : courseFilter
      ? 'Course notebook'
      : 'Notebook library'

  return (
    <main className="page-shell command-page">
      <section
        className="motion-card section-shell section-shell-elevated"
        style={{ padding: '1.05rem 1.15rem', display: 'grid', gap: '1rem' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p className="ui-kicker">{scopedLabel}</p>
            <h1 className="ui-page-title" style={{ marginTop: '0.5rem' }}>Draft notebook</h1>
            <p className="ui-page-copy" style={{ marginTop: '0.35rem', maxWidth: '46rem' }}>
              Saved notes and study workbenches created from Learn and Do. Open a draft to continue from its course, module, and source context.
            </p>
            {(courseFilter || moduleFilter) && (
              <div style={{ marginTop: '0.6rem' }}>
                <Link href="/drafts" className="ui-button ui-button-ghost ui-button-xs">
                  View all drafts
                </Link>
              </div>
            )}
          </div>
          <Link href="/drafts/new" className="ui-button ui-button-secondary ui-button-xs">
            New Draft
          </Link>
        </div>
      </section>

      <section className="motion-card motion-delay-1 section-shell" style={{ padding: '1rem 1.05rem' }}>
        {scopedDrafts.length === 0 ? (
          <div className="ui-empty" style={{ borderRadius: 'var(--radius-panel)', padding: '1rem', fontSize: '14px', lineHeight: 1.68 }}>
            No drafts in this notebook scope yet. Start from a Learn resource or a Do task and save notes into Draft.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {grouped.map((group) => {
              const course = group.courseId ? courseNames.get(group.courseId) : null
              const latestDraft = group.drafts[0]

              return (
                <CourseShelf
                  key={group.courseId ?? 'uncategorized'}
                  courseName={course?.name ?? 'Unassigned drafts'}
                  courseCode={course?.code ?? ''}
                  drafts={group.drafts}
                  latestDraftId={latestDraft.id}
                  totalCount={group.drafts.length}
                  quizReadyCount={group.drafts.filter((draft) => draft.draftType === 'exam_reviewer' || draft.draftType === 'flashcard_set').length}
                  statusBreakdown={{
                    ready: group.drafts.filter((draft) => draft.status === 'ready').length,
                    inProgress: group.drafts.filter((draft) => draft.status === 'generating' || draft.status === 'refining').length,
                    needsAttention: group.drafts.filter((draft) => draft.status === 'failed').length,
                  }}
                  lastUpdated={new Date(latestDraft.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
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

function groupDraftsByCourse<T extends { courseId: string | null; updatedAt: string }>(drafts: T[]) {
  const groups = new Map<string, T[]>()

  drafts.forEach((draft) => {
    const key = draft.courseId ?? 'uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), draft])
  })

  return Array.from(groups.entries())
    .map(([courseId, groupDrafts]) => ({
      courseId: courseId === 'uncategorized' ? null : courseId,
      drafts: groupDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    }))
    .sort((a, b) => new Date(b.drafts[0]?.updatedAt ?? 0).getTime() - new Date(a.drafts[0]?.updatedAt ?? 0).getTime())
}
