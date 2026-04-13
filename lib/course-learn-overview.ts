import { getCourseModules, getModuleTasks, type ClarityWorkspace } from '@/lib/clarity-workspace'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildModuleTermBank, type FinalReviewerTerm, type ModuleTermQuizItem, type ModuleTermSuggestion } from '@/lib/module-term-bank'
import { listDeepLearnNotesForModule } from '@/lib/deep-learn-store'
import { getDeepLearnResourceUiState } from '@/lib/deep-learn-ui'
import {
  buildLearnExperience,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceOriginalFileHref,
  getResourceCanvasHref,
  resolveLearnResourceSelection,
} from '@/lib/module-workspace'
import { buildModuleDoHref } from '@/lib/stay-focused-links'
import { getStudyFileProgressLabel } from '@/lib/study-file-manual-state'
import { getLearnResourceKindLabel } from '@/lib/study-resource'
import type { StudyFileOutlineSection, StudyFileReaderState } from '@/lib/study-file-reader'
import type { LearnResourceActionPriority, LearnResourceStatusKey } from '@/lib/learn-resource-ui'
import type {
  Course,
  DeepLearnNoteLoadAvailability,
  DeepLearnNoteLoadReason,
  Module,
  ModuleResourceWorkflowOverride,
  StudyFileProgressStatus,
  Task,
  TaskCompletionOrigin,
  TaskStatus,
} from '@/lib/types'

export type LearnReadinessLabel = 'Ready' | 'Partial' | 'Source first' | 'No study material'
export type LearnReadinessTone = 'ready' | 'limited' | 'muted'

export interface CourseLearnResumeCue {
  moduleId: string
  moduleTitle: string
  title: string
  promptLabel: 'Resume where you left off' | 'Continue reading'
  note: string
  href: string
  actionLabel: string
  external: boolean
  lastOpenedAt: string | null
}

export interface CourseLearnStudyMaterialRow {
  id: string
  title: string
  fileTypeLabel: string
  readinessLabel: 'Ready' | 'Partial' | 'Source first' | 'Link only' | 'Unsupported' | 'No extract' | 'Loading'
  readinessTone: 'accent' | 'warning' | 'muted'
  statusKey: LearnResourceStatusKey
  readerState: StudyFileReaderState
  note: string
  detailNote: string
  primaryAction: LearnResourceActionPriority
  sourceActionLabel: string
  progressStatus: StudyFileProgressStatus
  progressLabel: string
  workflowOverride: ModuleResourceWorkflowOverride
  required: boolean
  readerHref: string
  canvasHref: string | null
  originalFileHref: string | null
  outlineSections: StudyFileOutlineSection[]
  outlineHint: string | null
  deepLearnStatus: 'not_started' | 'pending' | 'ready' | 'failed' | 'blocked' | 'unavailable'
  deepLearnStatusLabel: 'No pack yet' | 'Preparing' | 'Ready' | 'Failed' | 'Source issue' | 'Unavailable'
  deepLearnTone: 'accent' | 'warning' | 'muted'
  deepLearnSummary: string
  deepLearnDetail: string
  deepLearnPrimaryLabel: 'Build Exam Prep Pack' | 'Open Exam Prep Pack' | 'Rebuild Exam Prep Pack' | 'Open source fallback'
  deepLearnNoteHref: string
  deepLearnQuizHref: string
  deepLearnQuizReady: boolean
  deepLearnTermCount: number
  deepLearnFactCount: number
  deepLearnNoteFailure: string | null
  deepLearnAvailability: DeepLearnNoteLoadAvailability
}

export interface CourseLearnActionRow {
  id: string
  title: string
  kindLabel: string
  note: string
  dueLabel: string | null
  required: boolean
  doHref: string
  canvasHref: string | null
}

export interface CourseLearnMoreRow {
  id: string
  title: string
  kindLabel: string
  note: string
  detailHref: string
  canvasHref: string | null
}

export interface CourseLearnTaskRow {
  id: string
  title: string
  details: string | null
  deadline: string | null
  status: TaskStatus
  completionOrigin: TaskCompletionOrigin | null
  canvasUrl: string | null
  priority: Task['priority']
}

export interface CourseLearnModuleCard {
  id: string
  courseId: string
  title: string
  orderLabel: string | null
  moduleHref: string
  readinessLabel: LearnReadinessLabel
  readinessTone: LearnReadinessTone
  coverageHint: string
  summary: string
  studyCount: number
  actionCount: number
  moreCount: number
  outlineSectionCount: number
  termCount: number
  quizCount: number
  dismissedTermCount: number
  progressCounts: {
    notStarted: number
    skimmed: number
    reviewed: number
  }
  resumeCue: CourseLearnResumeCue | null
  studyMaterials: CourseLearnStudyMaterialRow[]
  activityOverrides: CourseLearnStudyMaterialRow[]
  actionItems: CourseLearnActionRow[]
  moreItems: CourseLearnMoreRow[]
  finalTerms: FinalReviewerTerm[]
  suggestedTerms: ModuleTermSuggestion[]
  quizItems: ModuleTermQuizItem[]
  termsStateMessage: string
  quizStateMessage: string
  pendingTasks: CourseLearnTaskRow[]
  completedTasks: CourseLearnTaskRow[]
  sourceSupportNote: string
  deepLearnNotesAvailability: DeepLearnNoteLoadAvailability
  deepLearnNotesReason: DeepLearnNoteLoadReason
  deepLearnNotesMessage: string | null
}

export interface CourseLearnOverview {
  course: Course
  modules: CourseLearnModuleCard[]
  visibleModuleCount: number
  hiddenModuleCount: number
  studyCount: number
  actionCount: number
  moreCount: number
  note: string
  resumeCue: CourseLearnResumeCue | null
  deepLearnUnavailableModuleCount: number
}

interface CourseLearnOverviewDependencies {
  getModuleWorkspace?: typeof getModuleWorkspace
  listDeepLearnNotesForModule?: typeof listDeepLearnNotesForModule
}

export async function buildCourseLearnOverview(
  workspace: ClarityWorkspace,
  courseId: string,
  dependencies: CourseLearnOverviewDependencies = {},
): Promise<CourseLearnOverview | null> {
  const course = workspace.courses.find((entry) => entry.id === courseId)
  if (!course) return null

  const allModules = getCourseModules(workspace, course.id)
  const visibleModules = allModules.filter((module) => module.showInLearn !== false)
  const moduleCards = await Promise.all(visibleModules.map((module) => buildCourseLearnModuleCard(workspace, module, dependencies)))
  const modules = moduleCards.sort((left, right) =>
    sortableOrder(left.orderLabel) - sortableOrder(right.orderLabel)
    || left.title.localeCompare(right.title),
  )
  const studyCount = modules.reduce((total, module) => total + module.studyCount, 0)
  const actionCount = modules.reduce((total, module) => total + module.actionCount, 0)
  const moreCount = modules.reduce((total, module) => total + module.moreCount, 0)
  const deepLearnUnavailableModuleCount = modules.filter((module) => module.deepLearnNotesAvailability === 'unavailable').length
  const hiddenModuleCount = Math.max(0, allModules.length - visibleModules.length)

  return {
    course,
    modules,
    visibleModuleCount: visibleModules.length,
    hiddenModuleCount,
    studyCount,
    actionCount,
    moreCount,
    note: buildCourseNote({
      visibleModuleCount: visibleModules.length,
      hiddenModuleCount,
      studyCount,
      actionCount,
    }),
    resumeCue: buildCourseResumeCue(modules),
    deepLearnUnavailableModuleCount,
  }
}

async function buildCourseLearnModuleCard(
  workspace: ClarityWorkspace,
  module: Module,
  dependencies: CourseLearnOverviewDependencies,
): Promise<CourseLearnModuleCard> {
  const getModuleWorkspaceImpl = dependencies.getModuleWorkspace ?? getModuleWorkspace
  const listDeepLearnNotesForModuleImpl = dependencies.listDeepLearnNotesForModule ?? listDeepLearnNotesForModule
  const moduleWorkspace = await getModuleWorkspaceImpl(module.id)
  const workspaceTasks = getModuleTasks(workspace, module.id)
  const pendingTaskCount = workspaceTasks.filter((task) => task.status !== 'completed').length
  const experience = buildLearnExperience(module, {
    taskCount: pendingTaskCount,
    deadlineCount: moduleWorkspace?.deadlines.length ?? 0,
    resources: moduleWorkspace?.resources,
    resourceStudyStates: moduleWorkspace?.resourceStudyStates,
  })
  const overview = buildModuleLearnOverview({
    moduleId: module.id,
    resources: experience.resources,
    doItems: experience.doItems,
    tasks: moduleWorkspace?.tasks ?? [],
  })
  const termBank = buildModuleTermBank({
    overview,
    storedTerms: moduleWorkspace?.terms ?? [],
  })
  const deepLearnNotesResult = await listDeepLearnNotesForModuleImpl(module.id)
  const deepLearnNoteByResourceId = new Map(deepLearnNotesResult.notes.map((note) => [note.resourceId, note]))
  const readiness = resolveModuleReadiness(overview)
  const taskRows = sortTasks(moduleWorkspace?.tasks ?? [])
  const pendingTasks = taskRows.filter((task) => task.status !== 'completed')
  const completedTasks = taskRows.filter((task) => task.status === 'completed')
  const resolveDeepLearnMaterialState = (material: typeof overview.studyMaterials[number] | typeof overview.activityOverrides[number]) => {
    const selection = resolveLearnResourceSelection(experience, moduleWorkspace?.resources ?? [], material.resource.id)
    const deepLearnResourceId = selection?.canonicalResourceId ?? material.resource.id
    const deepLearnNote = deepLearnNoteByResourceId.get(selection?.canonicalResourceId ?? material.resource.id) ?? null
    const deepLearnReadiness = classifyDeepLearnResourceReadiness({
      resource: material.resource,
      storedResource: selection?.storedResource ?? null,
      canonicalResourceId: selection?.canonicalResourceId ?? null,
    })

    return {
      deepLearnResourceId,
      deepLearnNote,
      deepLearnReadiness,
    }
  }

  return {
    id: module.id,
    courseId: module.courseId ?? '',
    title: module.title,
    orderLabel: typeof module.order === 'number' ? `Module ${module.order}` : null,
    moduleHref: `/modules/${module.id}/learn`,
    readinessLabel: readiness.label,
    readinessTone: readiness.tone,
    coverageHint: buildModuleCoverageHint(overview),
    summary: overview.summary ?? buildModuleSummaryFallback(overview),
    studyCount: overview.studyMaterials.length,
    actionCount: overview.actionItems.length + overview.activityOverrides.length,
    moreCount: overview.otherContextResources.length,
    outlineSectionCount: overview.studyMaterials.reduce((total, material) => total + material.reader.outlineSections.length, 0),
    termCount: termBank.finalTerms.length,
    quizCount: termBank.quizItems.length,
    dismissedTermCount: termBank.dismissedCount,
    progressCounts: overview.progressCounts,
    resumeCue: overview.resumeTarget
      ? {
          moduleId: module.id,
          moduleTitle: module.title,
          title: overview.resumeTarget.resource.title,
          promptLabel: overview.resumeTarget.promptLabel,
          note: overview.resumeTarget.note,
          href: overview.resumeTarget.href,
          actionLabel: overview.resumeTarget.actionLabel,
          external: overview.resumeTarget.external,
          lastOpenedAt: overview.resumeTarget.resource.lastOpenedAt ?? null,
        }
      : null,
    studyMaterials: overview.studyMaterials.map((material) => ({
      ...(() => {
        const deepLearn = resolveDeepLearnMaterialState(material)
        return buildDeepLearnRowState(
          module.id,
          deepLearn.deepLearnResourceId,
          deepLearn.deepLearnNote,
          deepLearnNotesResult.availability,
          deepLearnNotesResult.message,
          deepLearn.deepLearnReadiness,
        )
      })(),
      id: material.resource.id,
      title: material.resource.title,
      fileTypeLabel: material.fileTypeLabel,
      readinessLabel: mapStudyMaterialReadiness(material.readinessLabel),
      readinessTone: material.readinessTone,
      statusKey: material.statusKey,
      readerState: material.reader.state,
      note: material.note,
      detailNote: material.detailNote,
      primaryAction: material.primaryAction,
      sourceActionLabel: material.sourceActionLabel,
      progressStatus: material.resource.studyProgressStatus ?? 'not_started',
      progressLabel: getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started'),
      workflowOverride: material.resource.workflowOverride ?? 'study',
      required: material.resource.required,
      readerHref: getLearnResourceHref(module.id, material.resource.id),
      canvasHref: getResourceCanvasHref(material.resource),
      originalFileHref: getResourceOriginalFileHref(material.resource),
      outlineSections: material.reader.outlineSections,
      outlineHint: material.reader.outlineHint,
    })),
    activityOverrides: overview.activityOverrides.map((material) => ({
      ...(() => {
        const deepLearn = resolveDeepLearnMaterialState(material)
        return buildDeepLearnRowState(
          module.id,
          deepLearn.deepLearnResourceId,
          deepLearn.deepLearnNote,
          deepLearnNotesResult.availability,
          deepLearnNotesResult.message,
          deepLearn.deepLearnReadiness,
        )
      })(),
      id: material.resource.id,
      title: material.resource.title,
      fileTypeLabel: material.fileTypeLabel,
      readinessLabel: mapStudyMaterialReadiness(material.readinessLabel),
      readinessTone: material.readinessTone,
      statusKey: material.statusKey,
      readerState: material.reader.state,
      note: material.note,
      detailNote: material.detailNote,
      primaryAction: material.primaryAction,
      sourceActionLabel: material.sourceActionLabel,
      progressStatus: material.resource.studyProgressStatus ?? 'not_started',
      progressLabel: getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started'),
      workflowOverride: material.resource.workflowOverride ?? 'activity',
      required: material.resource.required,
      readerHref: getLearnResourceHref(module.id, material.resource.id),
      canvasHref: getResourceCanvasHref(material.resource),
      originalFileHref: getResourceOriginalFileHref(material.resource),
      outlineSections: material.reader.outlineSections,
      outlineHint: material.reader.outlineHint,
    })),
    actionItems: overview.actionItems.map((item) => ({
      id: item.id,
      title: item.title,
      kindLabel: getLearnResourceKindLabel(item),
      note: item.whyItMatters ?? 'This belongs in the action pass after you finish the main study materials.',
      dueLabel: formatDueLabel(item.dueDate),
      required: item.required,
      doHref: buildModuleDoHref(module.id, {
        resourceId: item.id,
      }),
      canvasHref: getResourceCanvasHref(item),
    })),
    moreItems: overview.otherContextResources.map((item) => ({
      id: item.id,
      title: item.title,
      kindLabel: getLearnResourceKindLabel(item),
      note: item.linkedContext ?? item.whyItMatters ?? item.moduleName ?? 'This supports the module but is not the main study or action path.',
      detailHref: getLearnResourceHref(module.id, item.id),
      canvasHref: getResourceCanvasHref(item),
    })),
    finalTerms: termBank.finalTerms,
    suggestedTerms: termBank.suggestedTerms,
    quizItems: termBank.quizItems,
    termsStateMessage: termBank.termsStateMessage,
    quizStateMessage: termBank.quizStateMessage,
    pendingTasks,
    completedTasks,
    sourceSupportNote: overview.coverageNote,
    deepLearnNotesAvailability: deepLearnNotesResult.availability,
    deepLearnNotesReason: deepLearnNotesResult.reason,
    deepLearnNotesMessage: deepLearnNotesResult.message,
  }
}

function resolveModuleReadiness(overview: {
  totalStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
}) {
  if (overview.readyStudyFileCount > 0) {
    return {
      label: 'Ready' as const,
      tone: 'ready' as const,
    }
  }

  if (overview.limitedStudyFileCount > 0) {
    return {
      label: 'Partial' as const,
      tone: 'limited' as const,
    }
  }

  if (overview.totalStudyFileCount > 0) {
    return {
      label: 'Source first' as const,
      tone: 'muted' as const,
    }
  }

  return {
    label: 'No study material' as const,
    tone: 'muted' as const,
  }
}

function buildModuleCoverageHint(overview: {
  totalStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
  unavailableStudyFileCount: number
  actionItems: unknown[]
  activityOverrideCount: number
}) {
  if (overview.totalStudyFileCount === 0) {
    return overview.actionItems.length > 0
      ? 'This module is mostly an action lane right now.'
      : 'No study materials are mapped here yet.'
  }

  if (overview.readyStudyFileCount > 0) {
    const fragments = [`${overview.readyStudyFileCount} grounded study source${overview.readyStudyFileCount === 1 ? '' : 's'}`]
    if (overview.limitedStudyFileCount > 0) {
      fragments.push(`${overview.limitedStudyFileCount} partial`)
    }
    if (overview.unavailableStudyFileCount > 0) {
      fragments.push(`${overview.unavailableStudyFileCount} source-first`)
    }
    if (overview.activityOverrideCount > 0) {
      fragments.push(`${overview.activityOverrideCount} moved to Do`)
    }
    return fragments.join(' / ')
  }

  if (overview.limitedStudyFileCount > 0) {
    return overview.unavailableStudyFileCount > 0
      ? `${overview.limitedStudyFileCount} study source${overview.limitedStudyFileCount === 1 ? ' is' : 's are'} partial in Learn, and ${overview.unavailableStudyFileCount} still depend on the original source.`
      : `${overview.limitedStudyFileCount} study source${overview.limitedStudyFileCount === 1 ? ' is' : 's are'} partial in Learn, but the originals are still the cleanest full read.`
  }

  return `${overview.totalStudyFileCount} study source${overview.totalStudyFileCount === 1 ? '' : 's'} mapped, but the original sources are still the main grounding path.`
}

function buildModuleSummaryFallback(overview: {
  totalStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
  unavailableStudyFileCount: number
  activityOverrideCount: number
  actionItems: unknown[]
}) {
  if (overview.readyStudyFileCount > 0) {
    return 'Grounded study material is available here, so Deep Learn can turn it into answer-first exam prep packs before you switch into action.'
  }

  if (overview.limitedStudyFileCount > 0) {
    return 'Deep Learn can still help here, but some materials still need the original source nearby because the current extract is only partial.'
  }

  if (overview.totalStudyFileCount > 0) {
    return 'This module still depends heavily on the original sources, so Deep Learn treats the saved exam prep pack as the main destination and keeps the reader light and honest.'
  }

  if (overview.actionItems.length > 0 || overview.activityOverrideCount > 0) {
    return 'This module is currently stronger as an action pass than a study packet.'
  }

  return 'Learn does not have enough study material mapped here yet to build a fuller reading view.'
}

function buildCourseNote({
  visibleModuleCount,
  hiddenModuleCount,
  studyCount,
  actionCount,
}: {
  visibleModuleCount: number
  hiddenModuleCount: number
  studyCount: number
  actionCount: number
}) {
  if (visibleModuleCount === 0) {
    return hiddenModuleCount > 0
      ? 'Every module in this course is currently hidden from Learn.'
      : 'This course does not have any Learn modules yet.'
  }

  const fragments = [
    `${visibleModuleCount} module${visibleModuleCount === 1 ? '' : 's'} in Learn`,
    `${studyCount} study item${studyCount === 1 ? '' : 's'}`,
    `${actionCount} action item${actionCount === 1 ? '' : 's'}`,
  ]

  if (hiddenModuleCount > 0) {
    fragments.push(`${hiddenModuleCount} hidden`)
  }

  return fragments.join(' / ')
}

function buildCourseResumeCue(modules: CourseLearnModuleCard[]): CourseLearnResumeCue | null {
  const recentCue = [...modules]
    .map((module) => module.resumeCue)
    .filter((cue): cue is CourseLearnResumeCue => Boolean(cue))
    .sort((left, right) => recentDateValue(right.lastOpenedAt) - recentDateValue(left.lastOpenedAt))[0]

  if (recentCue && recentDateValue(recentCue.lastOpenedAt) !== Number.NEGATIVE_INFINITY) {
    return recentCue
  }

  return modules.find((module) => module.resumeCue)?.resumeCue ?? null
}

function buildDeepLearnRowState(
  moduleId: string,
  resourceId: string,
  note: Parameters<typeof getDeepLearnResourceUiState>[2],
  notesAvailability: DeepLearnNoteLoadAvailability,
  unavailableMessage: string | null,
  readiness: NonNullable<Parameters<typeof getDeepLearnResourceUiState>[3]>['readiness'],
) {
  const deepLearnUi = getDeepLearnResourceUiState(moduleId, resourceId, note, {
    notesAvailability,
    unavailableMessage,
    readiness,
  })

  return {
    deepLearnStatus: deepLearnUi.status,
    deepLearnStatusLabel: deepLearnUi.statusLabel,
    deepLearnTone: deepLearnUi.tone,
    deepLearnSummary: deepLearnUi.summary,
    deepLearnDetail: deepLearnUi.detail,
    deepLearnPrimaryLabel: deepLearnUi.primaryLabel,
    deepLearnNoteHref: deepLearnUi.noteHref,
    deepLearnQuizHref: deepLearnUi.quizHref,
    deepLearnQuizReady: deepLearnUi.quizReady,
    deepLearnTermCount: note?.identificationItems.length ?? 0,
    deepLearnFactCount: note?.answerBank.length ?? 0,
    deepLearnNoteFailure: note?.errorMessage ?? null,
    deepLearnAvailability: notesAvailability,
  } satisfies Pick<
    CourseLearnStudyMaterialRow,
    | 'deepLearnStatus'
    | 'deepLearnStatusLabel'
    | 'deepLearnTone'
    | 'deepLearnSummary'
    | 'deepLearnDetail'
    | 'deepLearnPrimaryLabel'
    | 'deepLearnNoteHref'
    | 'deepLearnQuizHref'
    | 'deepLearnQuizReady'
    | 'deepLearnTermCount'
    | 'deepLearnFactCount'
    | 'deepLearnNoteFailure'
    | 'deepLearnAvailability'
  >
}

function mapStudyMaterialReadiness(label: 'Ready' | 'Partial' | 'Source first' | 'Link only' | 'Unsupported' | 'No extract' | 'Loading' | 'Unavailable') {
  return label === 'Unavailable' ? 'Source first' : label
}

function formatDueLabel(value: string | null | undefined) {
  if (!value || value === 'No due date') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function sortTasks(tasks: Task[]): CourseLearnTaskRow[] {
  return [...tasks]
    .sort((left, right) => {
      const statusDiff = Number(left.status === 'completed') - Number(right.status === 'completed')
      if (statusDiff !== 0) return statusDiff

      const leftDeadline = sortableDateValue(left.deadline)
      const rightDeadline = sortableDateValue(right.deadline)
      if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline

      const priorityDiff = priorityWeight(right.priority) - priorityWeight(left.priority)
      if (priorityDiff !== 0) return priorityDiff

      return left.title.localeCompare(right.title)
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      details: task.details,
      deadline: task.deadline,
      status: task.status,
      completionOrigin: task.completionOrigin ?? null,
      canvasUrl: task.canvasUrl ?? null,
      priority: task.priority,
    }))
}

function priorityWeight(priority: Task['priority']) {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function sortableDateValue(value: string | null | undefined) {
  if (!value || value === 'No due date') return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return date.getTime()
}

function sortableOrder(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY
  const match = value.match(/(\d+)/)
  if (!match) return Number.POSITIVE_INFINITY
  return Number.parseInt(match[1], 10)
}

function recentDateValue(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.NEGATIVE_INFINITY
  return date.getTime()
}
