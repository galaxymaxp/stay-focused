import { getCourseModules, getModuleTasks, type ClarityWorkspace } from '@/lib/clarity-workspace'
import { buildModuleLearnOverview } from '@/lib/module-learn-overview'
import { buildModuleTermBank, type FinalReviewerTerm, type ModuleTermQuizItem, type ModuleTermSuggestion } from '@/lib/module-term-bank'
import {
  buildLearnExperience,
  getLearnResourceHref,
  getModuleWorkspace,
  getResourceCanvasHref,
} from '@/lib/module-workspace'
import { buildModuleDoHref } from '@/lib/stay-focused-links'
import { getStudyFileProgressLabel } from '@/lib/study-file-manual-state'
import { getLearnResourceKindLabel } from '@/lib/study-resource'
import type { StudyFileOutlineSection } from '@/lib/study-file-reader'
import type {
  Course,
  Module,
  ModuleResourceWorkflowOverride,
  StudyFileProgressStatus,
  Task,
  TaskCompletionOrigin,
  TaskStatus,
} from '@/lib/types'

export type LearnReadinessLabel = 'Ready to study' | 'Limited' | 'Needs Canvas' | 'No study material'
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
  readinessLabel: Exclude<LearnReadinessLabel, 'No study material'>
  note: string
  progressStatus: StudyFileProgressStatus
  progressLabel: string
  workflowOverride: ModuleResourceWorkflowOverride
  required: boolean
  readerHref: string
  canvasHref: string | null
  outlineSections: StudyFileOutlineSection[]
  outlineHint: string | null
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
}

export async function buildCourseLearnOverview(
  workspace: ClarityWorkspace,
  courseId: string,
): Promise<CourseLearnOverview | null> {
  const course = workspace.courses.find((entry) => entry.id === courseId)
  if (!course) return null

  const allModules = getCourseModules(workspace, course.id)
  const visibleModules = allModules.filter((module) => module.showInLearn !== false)
  const moduleCards = await Promise.all(visibleModules.map((module) => buildCourseLearnModuleCard(workspace, module)))
  const modules = moduleCards.sort((left, right) =>
    sortableOrder(left.orderLabel) - sortableOrder(right.orderLabel)
    || left.title.localeCompare(right.title),
  )
  const studyCount = modules.reduce((total, module) => total + module.studyCount, 0)
  const actionCount = modules.reduce((total, module) => total + module.actionCount, 0)
  const moreCount = modules.reduce((total, module) => total + module.moreCount, 0)
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
  }
}

async function buildCourseLearnModuleCard(
  workspace: ClarityWorkspace,
  module: Module,
): Promise<CourseLearnModuleCard> {
  const moduleWorkspace = await getModuleWorkspace(module.id)
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
  const readiness = resolveModuleReadiness(overview)
  const taskRows = sortTasks(moduleWorkspace?.tasks ?? [])
  const pendingTasks = taskRows.filter((task) => task.status !== 'completed')
  const completedTasks = taskRows.filter((task) => task.status === 'completed')

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
      id: material.resource.id,
      title: material.resource.title,
      fileTypeLabel: material.fileTypeLabel,
      readinessLabel: mapStudyMaterialReadiness(material.readinessLabel),
      note: material.note,
      progressStatus: material.resource.studyProgressStatus ?? 'not_started',
      progressLabel: getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started'),
      workflowOverride: material.resource.workflowOverride ?? 'study',
      required: material.resource.required,
      readerHref: getLearnResourceHref(module.id, material.resource.id),
      canvasHref: getResourceCanvasHref(material.resource),
      outlineSections: material.reader.outlineSections,
      outlineHint: material.reader.outlineHint,
    })),
    activityOverrides: overview.activityOverrides.map((material) => ({
      id: material.resource.id,
      title: material.resource.title,
      fileTypeLabel: material.fileTypeLabel,
      readinessLabel: mapStudyMaterialReadiness(material.readinessLabel),
      note: material.note,
      progressStatus: material.resource.studyProgressStatus ?? 'not_started',
      progressLabel: getStudyFileProgressLabel(material.resource.studyProgressStatus ?? 'not_started'),
      workflowOverride: material.resource.workflowOverride ?? 'activity',
      required: material.resource.required,
      readerHref: getLearnResourceHref(module.id, material.resource.id),
      canvasHref: getResourceCanvasHref(material.resource),
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
  }
}

function resolveModuleReadiness(overview: {
  totalStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
}) {
  if (overview.readyStudyFileCount > 0) {
    return {
      label: 'Ready to study' as const,
      tone: 'ready' as const,
    }
  }

  if (overview.limitedStudyFileCount > 0) {
    return {
      label: 'Limited' as const,
      tone: 'limited' as const,
    }
  }

  if (overview.totalStudyFileCount > 0) {
    return {
      label: 'Needs Canvas' as const,
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
    const fragments = [`${overview.readyStudyFileCount} ready to study`]
    if (overview.limitedStudyFileCount > 0) {
      fragments.push(`${overview.limitedStudyFileCount} limited`)
    }
    if (overview.unavailableStudyFileCount > 0) {
      fragments.push(`${overview.unavailableStudyFileCount} need Canvas`)
    }
    if (overview.activityOverrideCount > 0) {
      fragments.push(`${overview.activityOverrideCount} moved to Do`)
    }
    return fragments.join(' / ')
  }

  if (overview.limitedStudyFileCount > 0) {
    return overview.unavailableStudyFileCount > 0
      ? `${overview.limitedStudyFileCount} readable in Learn, but ${overview.unavailableStudyFileCount} still need Canvas.`
      : `${overview.limitedStudyFileCount} readable in Learn, but coverage is still limited.`
  }

  return `${overview.totalStudyFileCount} study material${overview.totalStudyFileCount === 1 ? '' : 's'} mapped, but Canvas is still the more reliable read.`
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
    return 'Readable study material is available here, so Learn can help you get oriented before you switch into action.'
  }

  if (overview.limitedStudyFileCount > 0) {
    return 'Learn can surface part of the reading here, but some of the fuller source still lives back in Canvas.'
  }

  if (overview.totalStudyFileCount > 0) {
    return 'This module still reads more cleanly through the original Canvas sources, so Learn keeps the lane honest and lightweight.'
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

function mapStudyMaterialReadiness(label: 'Ready to study' | 'Limited' | 'Needs Canvas' | 'Unavailable') {
  return label === 'Unavailable' ? 'Needs Canvas' : label
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
