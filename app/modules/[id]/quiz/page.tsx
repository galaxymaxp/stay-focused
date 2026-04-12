import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { ModuleQuizWorkspace } from '@/components/ModuleQuizWorkspace'
import type { QuizSection } from '@/components/ModuleQuizWorkspace'
import { buildDeepLearnQuizItems } from '@/lib/deep-learn-quiz'
import { listDeepLearnNotesForModule } from '@/lib/deep-learn-store'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildDeepLearnNoteHref, buildModuleInspectHref, buildModuleLearnHref, getSearchParamValue } from '@/lib/stay-focused-links'
import {
  buildLearnExperience,
  extractCourseName,
  getModuleWorkspace,
} from '@/lib/module-workspace'
import { buildStudyNoteQuestionCountOptions } from '@/lib/study-note-quiz'

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function QuizPage({ params, searchParams }: Props) {
  const { id } = await params
  const resolvedSearchParams = await searchParams
  const workspace = await getModuleWorkspace(id)
  if (!workspace) notFound()

  const { module, tasks, resources: storedResources, resourceStudyStates } = workspace
  const courseName = extractCourseName(module.raw_content)

  if (module.status === 'error') {
    return (
      <main className="page-shell page-shell-compact page-stack">
        <div className="ui-card ui-card-soft ui-status-danger" style={{ borderRadius: 'var(--radius-control)', padding: '14px', fontSize: '14px' }}>
          Processing failed. Delete this module and try again.
        </div>
      </main>
    )
  }

  const experience = buildLearnExperience(module, {
    taskCount: tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: storedResources,
    resourceStudyStates,
  })

  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks,
  })

  const deepLearnNotesResult = await listDeepLearnNotesForModule(module.id)
  const readyDeepLearnNotes = deepLearnNotesResult.notes.filter((note) => note.status === 'ready')
  const quizReadyNotes = readyDeepLearnNotes.filter((note) => note.quizReady)
  const targetResourceId = getSearchParamValue(resolvedSearchParams?.resource)
  const targetSectionId = targetResourceId ? `quiz-note-${encodeURIComponent(targetResourceId)}` : null
  const quizReadyResourceIds = new Set(quizReadyNotes.map((note) => note.resourceId))
  const readyButNotQuizReadyCount = readyDeepLearnNotes.filter((note) => !note.quizReady).length
  const withheldMaterialCount = overview.studyMaterials.filter((material) => !quizReadyResourceIds.has(material.resource.id)).length

  const quizSections: QuizSection[] = quizReadyNotes
    .map((note) => {
      const resource = experience.resources.find((entry) => entry.id === note.resourceId)
      if (!resource) return null

      const quizItems = buildDeepLearnQuizItems(note)
      const questionCountOptions = buildStudyNoteQuestionCountOptions(quizItems.length)
      if (questionCountOptions.length === 0) return null

      return {
        id: `quiz-note-${encodeURIComponent(note.resourceId)}`,
        title: note.title,
        resourceTitle: resource.title,
        noteHref: buildDeepLearnNoteHref(module.id, note.resourceId),
        quizItems,
        questionCountOptions,
      } satisfies QuizSection
    })
    .filter((section): section is QuizSection => Boolean(section))

  return (
    <ModuleLensShell
      currentLens="quiz"
      moduleId={module.id}
      courseId={module.courseId}
      courseName={courseName}
      title={module.title}
      summary={null}
    >
      <ModuleQuizWorkspace
        quizSections={quizSections}
        initialSelectedId={targetSectionId}
        inspectHref={buildModuleInspectHref(module.id)}
        learnHref={buildModuleLearnHref(module.id, { panel: 'study-notes', resourceId: targetResourceId })}
        withheldMaterialCount={withheldMaterialCount}
        notReadyDeepLearnCount={readyButNotQuizReadyCount}
        noteAvailabilityMessage={deepLearnNotesResult.availability === 'unavailable' ? deepLearnNotesResult.message : null}
      />
    </ModuleLensShell>
  )
}
