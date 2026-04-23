import { notFound } from 'next/navigation'
import { DeepLearnNoteView } from '@/components/DeepLearnNoteView'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { getDeepLearnNoteForResource } from '@/lib/deep-learn-store'
import {
  buildLearnExperience,
  extractCourseName,
  findDoResourceById,
  findLearnUnitByResourceId,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceCanvasHref,
  getResourceOriginalFileHref,
  resolveLearnResourceSelection,
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
  const unit = findLearnUnitByResourceId(experience, resourceId)
  const resourceSelection = resolveLearnResourceSelection(experience, workspace.resources, resourceId)
  const resource = resourceSelection?.resource ?? unit?.resource ?? findDoResourceById(experience, resourceId)
  if (!resource) notFound()

  const deepLearnResourceId = resourceSelection?.canonicalResourceId ?? resourceId
  const noteResult = await getDeepLearnNoteForResource(id, deepLearnResourceId)
  const sourceHref = getResourceOriginalFileHref(resource) ?? getResourceCanvasHref(resource)

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={workspace.module.id}
      courseId={workspace.module.courseId}
      courseName={courseName}
      title={workspace.module.title}
      summary={noteResult.note?.overview ?? workspace.module.summary}
    >
      <div className="command-page command-page-tight">
        <DeepLearnNoteView
          moduleId={workspace.module.id}
          courseId={workspace.module.courseId ?? null}
          resource={resource}
          deepLearnResourceId={deepLearnResourceId}
          note={noteResult.note}
          noteAvailability={noteResult.availability}
          noteAvailabilityMessage={noteResult.message}
          readerHref={getLearnResourceHref(workspace.module.id, resource.id)}
          sourceHref={sourceHref}
        />
      </div>
    </ModuleLensShell>
  )
}
