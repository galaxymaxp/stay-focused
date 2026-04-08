import { notFound } from 'next/navigation'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { ModuleQuizWorkspace } from '@/components/ModuleQuizWorkspace'
import type { QuizSection } from '@/components/ModuleQuizWorkspace'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildModuleInspectHref } from '@/lib/stay-focused-links'
import {
  buildLearnExperience,
  extractCourseName,
  getModuleWorkspace,
} from '@/lib/module-workspace'
import {
  buildStudyNoteQuizItems,
  buildStudyNoteQuestionCountOptions,
} from '@/lib/study-note-quiz'

interface Props {
  params: Promise<{ id: string }>
}

export default async function QuizPage({ params }: Props) {
  const { id } = await params
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

  const quizReadyMaterials = overview.studyMaterials.filter((material) => material.quality.shouldUseForQuiz)
  const withheldMaterials = overview.studyMaterials.filter((material) => !material.quality.shouldUseForQuiz)

  const quizSections: QuizSection[] = quizReadyMaterials.flatMap((material) =>
    material.reader.outlineSections.map((section, index) => {
      const quizItems = buildStudyNoteQuizItems(section)
      const questionCountOptions = buildStudyNoteQuestionCountOptions(quizItems.length)
      return {
        id: `${material.resource.id}-${index}`,
        title: section.title,
        resourceTitle: material.resource.title,
        quizItems,
        questionCountOptions,
      }
    }).filter((s) => s.questionCountOptions.length > 0),
  )

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
        inspectHref={buildModuleInspectHref(module.id)}
        withheldMaterialCount={withheldMaterials.length}
        weakMaterialCount={withheldMaterials.filter((material) => material.quality.quality === 'weak').length}
      />
    </ModuleLensShell>
  )
}
