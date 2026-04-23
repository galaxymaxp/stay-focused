import { NewDraftFlow } from '@/components/drafts/NewDraftFlow'
import { getClarityWorkspace } from '@/lib/clarity-workspace'
import { getSearchParamValue } from '@/lib/stay-focused-links'

interface Props {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function NewDraftPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const courseFilter = getSearchParamValue(resolvedSearchParams?.course)
  const initialModuleId = getSearchParamValue(resolvedSearchParams?.module)
  const workspace = await getClarityWorkspace()
  const courseNames = new Map(workspace.courses.map((course) => [course.id, course.name]))
  const modules = workspace.modules
    .filter((module) => module.showInLearn !== false)
    .filter((module) => (courseFilter ? module.courseId === courseFilter : true))
    .map((module) => ({
      id: module.id,
      title: module.title,
      courseTitle: module.courseId ? courseNames.get(module.courseId) : undefined,
    }))

  return (
    <main className="page-shell">
      <NewDraftFlow modules={modules} initialModuleId={initialModuleId} />
    </main>
  )
}
