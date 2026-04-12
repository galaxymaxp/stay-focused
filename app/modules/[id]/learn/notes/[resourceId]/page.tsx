import { notFound } from 'next/navigation'
import { DeepLearnNoteView } from '@/components/DeepLearnNoteView'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import {
  buildLearnExperience,
  extractCourseName,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceCanvasHref,
  getResourceOriginalFileHref,
} from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string; resourceId: string }>
}

export default async function DeepLearnNotePage({ params }: Props) {
  const { id, resourceId } = await params
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const courseName = extractCourseName(workspace.module.raw_content)
  const experience = buildLearnExperience(workspace.module, {
    taskCount: workspace.tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: workspace.resources,
    resourceStudyStates: workspace.resourceStudyStates,
  })
  const resource = experience.resources.find((entry) => entry.id === resourceId)
  if (!resource) notFound()

  const note = await getDeepLearnNoteForResource(id, resourceId)
  const sourceHref = getResourceOriginalFileHref(resource) ?? getResourceCanvasHref(resource)

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={workspace.module.id}
      courseId={workspace.module.courseId}
      courseName={courseName}
      title={workspace.module.title}
      summary={note?.overview ?? workspace.module.summary}
    >
      <DeepLearnNoteView
        moduleId={workspace.module.id}
        courseId={workspace.module.courseId ?? null}
        resource={resource}
        note={note}
        readerHref={getLearnResourceHref(workspace.module.id, resource.id)}
        sourceHref={sourceHref}
      />
    </ModuleLensShell>
  )
}
