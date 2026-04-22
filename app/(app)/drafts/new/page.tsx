import { NewDraftFlow } from '@/components/drafts/NewDraftFlow'
import { getClarityWorkspace } from '@/lib/clarity-workspace'

export default async function NewDraftPage() {
  const workspace = await getClarityWorkspace()
  const courseNames = new Map(workspace.courses.map((course) => [course.id, course.name]))
  const modules = workspace.modules
    .filter((module) => module.showInLearn !== false)
    .map((module) => ({
      id: module.id,
      title: module.title,
      courseTitle: module.courseId ? courseNames.get(module.courseId) : undefined,
    }))

  return (
    <main className="page-shell">
      <NewDraftFlow modules={modules} />
    </main>
  )
}
