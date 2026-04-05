import { getLearnResourceHref, getResourceCanvasHref, getResourceGrounding, type ModuleSourceResource } from '@/lib/module-workspace'
import { buildStudyFileReaderModel, getStudyFileTypeLabel, type StudyFileReaderModel } from '@/lib/study-file-reader'
import type { ModuleResourceWorkflowOverride, StudyFileProgressStatus, Task } from '@/lib/types'

export type ModuleStudyReadiness = 'ready' | 'limited' | 'unavailable'

export interface ModuleStudyMaterial {
  resource: ModuleSourceResource
  reader: StudyFileReaderModel
  fileTypeLabel: string
  readiness: ModuleStudyReadiness
  readinessLabel: 'Ready to study' | 'Limited' | 'Unavailable'
  readinessTone: 'accent' | 'warning' | 'muted'
  note: string
}

export interface ModuleSuggestedStudyStep {
  id: string
  slotLabel: 'Start here' | 'Next' | 'Then'
  title: string
  note: string
  href: string
  destinationLabel: string
  external: boolean
}

export interface ModuleLearnOverviewModel {
  summary: string | null
  summaryStateMessage: string
  coverageNote: string
  totalStudyFileCount: number
  activeStudyFileCount: number
  activityOverrideCount: number
  extractedStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
  unavailableStudyFileCount: number
  progressCounts: {
    notStarted: number
    skimmed: number
    reviewed: number
  }
  studyMaterials: ModuleStudyMaterial[]
  activityOverrides: ModuleStudyMaterial[]
  actionItems: ModuleSourceResource[]
  otherContextResources: ModuleSourceResource[]
  suggestedSteps: ModuleSuggestedStudyStep[]
}

export function buildModuleLearnOverview({
  moduleId,
  resources,
  doItems,
  tasks,
}: {
  moduleId: string
  resources: ModuleSourceResource[]
  doItems: ModuleSourceResource[]
  tasks: Task[]
}): ModuleLearnOverviewModel {
  const allStudyFiles = resources
    .filter((resource) => resource.kind === 'study_file')
    .map((resource) => buildStudyMaterial(resource))
    .sort(compareStudyMaterials)
  const studyMaterials = allStudyFiles.filter((material) => getWorkflowOverride(material.resource) !== 'activity')
  const activityOverrides = allStudyFiles.filter((material) => getWorkflowOverride(material.resource) === 'activity')
  const actionItems = [...doItems].sort(compareActionItems)
  const otherContextResources = resources
    .filter((resource) => resource.kind !== 'study_file' && resource.lane !== 'do')
    .sort((left, right) => left.title.localeCompare(right.title))
  const totalStudyFileCount = allStudyFiles.length
  const activeStudyFileCount = studyMaterials.length
  const activityOverrideCount = activityOverrides.length
  const extractedStudyFileCount = allStudyFiles.filter((material) => hasReadableText(material.resource)).length
  const readyStudyFileCount = studyMaterials.filter((material) => material.readiness === 'ready').length
  const limitedStudyFileCount = studyMaterials.filter((material) => material.readiness === 'limited').length
  const unavailableStudyFileCount = studyMaterials.filter((material) => material.readiness === 'unavailable').length
  const summary = buildGroundedModuleSummary(studyMaterials)
  const progressCounts = buildProgressCounts(allStudyFiles)

  return {
    summary,
    summaryStateMessage: buildSummaryStateMessage({
      totalStudyFileCount,
      activeStudyFileCount,
      activityOverrideCount,
      extractedStudyFileCount,
      readyStudyFileCount,
      limitedStudyFileCount,
      unavailableStudyFileCount,
    }),
    coverageNote: buildCoverageNote({
      totalStudyFileCount,
      activeStudyFileCount,
      activityOverrideCount,
      readyStudyFileCount,
      limitedStudyFileCount,
      unavailableStudyFileCount,
    }),
    totalStudyFileCount,
    activeStudyFileCount,
    activityOverrideCount,
    extractedStudyFileCount,
    readyStudyFileCount,
    limitedStudyFileCount,
    unavailableStudyFileCount,
    progressCounts,
    studyMaterials,
    activityOverrides,
    actionItems,
    otherContextResources,
    suggestedSteps: buildSuggestedStudySteps({
      moduleId,
      studyMaterials,
      activityOverrides,
      actionItems,
      tasks,
    }),
  }
}

function buildStudyMaterial(resource: ModuleSourceResource): ModuleStudyMaterial {
  const reader = buildStudyFileReaderModel(resource)
  const grounding = getResourceGrounding(resource)
  const readiness = resolveStudyReadiness(reader, grounding.hasGroundedAnalysis)

  return {
    resource,
    reader,
    fileTypeLabel: getStudyFileTypeLabel(resource),
    readiness,
    readinessLabel: labelForReadiness(readiness),
    readinessTone: toneForReadiness(readiness),
    note: buildStudyNote(resource, reader, readiness),
  }
}

function resolveStudyReadiness(reader: StudyFileReaderModel, hasGroundedAnalysis: boolean): ModuleStudyReadiness {
  if (reader.state === 'extracted' && hasGroundedAnalysis) {
    return 'ready'
  }

  if (reader.state === 'extracted' || reader.state === 'metadata_only' || reader.state === 'empty') {
    return 'limited'
  }

  return 'unavailable'
}

function labelForReadiness(readiness: ModuleStudyReadiness) {
  if (readiness === 'ready') return 'Ready to study'
  if (readiness === 'limited') return 'Limited'
  return 'Unavailable'
}

function toneForReadiness(readiness: ModuleStudyReadiness) {
  if (readiness === 'ready') return 'accent'
  if (readiness === 'limited') return 'warning'
  return 'muted'
}

function buildStudyNote(resource: ModuleSourceResource, reader: StudyFileReaderModel, readiness: ModuleStudyReadiness) {
  if (readiness === 'ready') {
    return reader.summary ?? 'Readable text is available in the study reader for this file.'
  }

  if (reader.state === 'extracted') {
    return 'Some readable text is available, but it is still too light for a fuller module-level read.'
  }

  if (reader.state === 'metadata_only') {
    return 'Only file context is available here right now, so the original Canvas file is still the fuller source.'
  }

  if (reader.state === 'empty') {
    if (/scanned|image-only|image based|image-based/i.test(resource.extractionError ?? '')) {
      return 'The file was parsed, but it still looks more like a scanned or image-based document in Learn.'
    }

    return 'The file was parsed, but no usable text surfaced in Learn.'
  }

  if (resource.extractionStatus === 'pending') {
    return 'The reader is still waiting on extraction for this file.'
  }

  if (resource.extractionStatus === 'unsupported') {
    return 'This file type is not readable in the current study reader, so Canvas stays the source of truth.'
  }

  return 'The reader could not prepare usable text for this file this time.'
}

function buildGroundedModuleSummary(studyMaterials: ModuleStudyMaterial[]) {
  const groundedSummaries = uniqueLines(
    studyMaterials
      .filter((material) => material.readiness === 'ready')
      .map((material) => material.reader.summary)
      .filter((summary): summary is string => Boolean(summary?.trim())),
  )

  if (groundedSummaries.length === 0) {
    return null
  }

  return trimAtBoundary(groundedSummaries.slice(0, 2).join(' '), 360)
}

function buildSummaryStateMessage({
  totalStudyFileCount,
  activeStudyFileCount,
  activityOverrideCount,
  extractedStudyFileCount,
  readyStudyFileCount,
  limitedStudyFileCount,
  unavailableStudyFileCount,
}: {
  totalStudyFileCount: number
  activeStudyFileCount: number
  activityOverrideCount: number
  extractedStudyFileCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
  unavailableStudyFileCount: number
}) {
  if (totalStudyFileCount === 0) {
    return 'No study files are mapped to this module yet, so Learn stays at the resource and action level instead of pretending to summarize the module.'
  }

  if (activeStudyFileCount === 0 && activityOverrideCount > 0) {
    return 'All study files in this module are currently treated as activity instead, so Learn is not building a study-lane summary from them.'
  }

  if (readyStudyFileCount > 0) {
    return 'A grounded module summary is available because at least one study file in the current study lane produced enough readable text to support it.'
  }

  if (extractedStudyFileCount > 0) {
    return 'Some study files have readable text, but not enough of the current study lane is strong enough for a grounded module summary yet.'
  }

  if (limitedStudyFileCount > 0) {
    return 'The mapped study files are still limited in Learn, so this page stays at the file and action level instead of inventing a theme.'
  }

  if (unavailableStudyFileCount > 0) {
    return 'The mapped study files are still unreadable in Learn right now, so the overview stays honest and keeps Canvas close by.'
  }

  return 'Learn is waiting on stronger study-file coverage before it creates a grounded module summary.'
}

function buildCoverageNote({
  totalStudyFileCount,
  activeStudyFileCount,
  activityOverrideCount,
  readyStudyFileCount,
  limitedStudyFileCount,
  unavailableStudyFileCount,
}: {
  totalStudyFileCount: number
  activeStudyFileCount: number
  activityOverrideCount: number
  readyStudyFileCount: number
  limitedStudyFileCount: number
  unavailableStudyFileCount: number
}) {
  if (totalStudyFileCount === 0) {
    return 'No mapped study files are available for this module yet.'
  }

  if (activeStudyFileCount === 0 && activityOverrideCount > 0) {
    return `${activityOverrideCount} study file${activityOverrideCount === 1 ? ' is' : 's are'} currently treated as activity instead of study material.`
  }

  const fragments: string[] = []

  if (readyStudyFileCount > 0) {
    fragments.push(
      readyStudyFileCount === activeStudyFileCount
        ? `Grounded from all ${readyStudyFileCount} study file${readyStudyFileCount === 1 ? '' : 's'} still in the study lane.`
        : `Grounded from ${readyStudyFileCount} of ${activeStudyFileCount} study file${activeStudyFileCount === 1 ? '' : 's'} in the study lane.`,
    )
  } else {
    fragments.push('No study files in the current study lane have enough readable text for a grounded module summary yet.')
  }

  if (limitedStudyFileCount > 0) {
    fragments.push(`${limitedStudyFileCount} ${limitedStudyFileCount === 1 ? 'file is' : 'files are'} visible with limited readability.`)
  }

  if (unavailableStudyFileCount > 0) {
    fragments.push(`${unavailableStudyFileCount} ${unavailableStudyFileCount === 1 ? 'file still needs' : 'files still need'} Canvas for the full read.`)
  }

  if (activityOverrideCount > 0) {
    fragments.push(`${activityOverrideCount} ${activityOverrideCount === 1 ? 'study file is' : 'study files are'} currently treated as activity instead.`)
  }

  return fragments.join(' ')
}

function buildProgressCounts(studyMaterials: ModuleStudyMaterial[]) {
  const counts = {
    notStarted: 0,
    skimmed: 0,
    reviewed: 0,
  }

  for (const material of studyMaterials) {
    const progress = getStudyProgress(material.resource)
    if (progress === 'reviewed') {
      counts.reviewed += 1
      continue
    }

    if (progress === 'skimmed') {
      counts.skimmed += 1
      continue
    }

    counts.notStarted += 1
  }

  return counts
}

function buildSuggestedStudySteps({
  moduleId,
  studyMaterials,
  activityOverrides,
  actionItems,
  tasks,
}: {
  moduleId: string
  studyMaterials: ModuleStudyMaterial[]
  activityOverrides: ModuleStudyMaterial[]
  actionItems: ModuleSourceResource[]
  tasks: Task[]
}): ModuleSuggestedStudyStep[] {
  const steps: Omit<ModuleSuggestedStudyStep, 'slotLabel'>[] = []
  const usedIds = new Set<string>()

  const primaryStudy = studyMaterials.find((material) => material.readiness === 'ready')
    ?? studyMaterials.find((material) => material.readiness === 'limited')
    ?? studyMaterials[0]
  if (primaryStudy) {
    steps.push(buildStudyStep(moduleId, primaryStudy))
    usedIds.add(primaryStudy.resource.id)
  }

  const secondaryStudy = studyMaterials.find((material) => !usedIds.has(material.resource.id) && material.readiness === 'ready')
    ?? studyMaterials.find((material) => !usedIds.has(material.resource.id) && material.readiness === 'limited')
  if (secondaryStudy) {
    steps.push(buildStudyStep(moduleId, secondaryStudy))
    usedIds.add(secondaryStudy.resource.id)
  }

  const primaryAction = actionItems.find((item) => !usedIds.has(item.id))
  if (primaryAction) {
    steps.push(buildActionStep(moduleId, primaryAction, tasks))
    usedIds.add(primaryAction.id)
  } else {
    const overriddenStudy = activityOverrides.find((material) => !usedIds.has(material.resource.id))
    if (overriddenStudy) {
      steps.push(buildActivityOverrideStep(moduleId, overriddenStudy))
      usedIds.add(overriddenStudy.resource.id)
    }
  }

  if (steps.length < 3) {
    const fallbackAction = actionItems.find((item) => !usedIds.has(item.id))
    if (fallbackAction) {
      steps.push(buildActionStep(moduleId, fallbackAction, tasks))
      usedIds.add(fallbackAction.id)
    }
  }

  if (steps.length < 3) {
    const fallbackOverride = activityOverrides.find((material) => !usedIds.has(material.resource.id))
    if (fallbackOverride) {
      steps.push(buildActivityOverrideStep(moduleId, fallbackOverride))
      usedIds.add(fallbackOverride.resource.id)
    }
  }

  if (steps.length < 3) {
    const fallbackStudy = studyMaterials.find((material) => !usedIds.has(material.resource.id))
    if (fallbackStudy) {
      steps.push(buildStudyStep(moduleId, fallbackStudy))
    }
  }

  const slotLabels: ModuleSuggestedStudyStep['slotLabel'][] = ['Start here', 'Next', 'Then']

  return steps.slice(0, 3).map((step, index) => ({
    ...step,
    slotLabel: slotLabels[index] ?? 'Then',
  }))
}

function buildStudyStep(moduleId: string, material: ModuleStudyMaterial): Omit<ModuleSuggestedStudyStep, 'slotLabel'> {
  const canvasHref = getResourceCanvasHref(material.resource)
  const useCanvas = material.readiness === 'unavailable' && Boolean(canvasHref)

  return {
    id: `${material.resource.id}-study-step`,
    title: material.resource.title,
    note: material.readiness === 'ready'
      ? 'Readable extracted text is available, so this is the clearest place to get oriented.'
      : material.readiness === 'limited'
        ? 'Use this as a guidepost, then keep the original Canvas file nearby for the fuller read.'
        : 'Canvas is still the most reliable place to read this one in full.',
    href: useCanvas ? canvasHref! : getLearnResourceHref(moduleId, material.resource.id),
    destinationLabel: useCanvas ? 'Canvas file' : 'Study reader',
    external: useCanvas,
  }
}

function buildActivityOverrideStep(moduleId: string, material: ModuleStudyMaterial): Omit<ModuleSuggestedStudyStep, 'slotLabel'> {
  const canvasHref = getResourceCanvasHref(material.resource)
  const useCanvas = material.readiness === 'unavailable' && Boolean(canvasHref)

  return {
    id: `${material.resource.id}-activity-override-step`,
    title: material.resource.title,
    note: 'You marked this study file as activity for your workflow, so it sits in the action lane even though the study reader is still available.',
    href: useCanvas ? canvasHref! : getLearnResourceHref(moduleId, material.resource.id),
    destinationLabel: useCanvas ? 'Canvas file' : 'Study reader',
    external: useCanvas,
  }
}

function buildActionStep(moduleId: string, item: ModuleSourceResource, tasks: Task[]): Omit<ModuleSuggestedStudyStep, 'slotLabel'> {
  const matchedTask = findMatchingTask(item, tasks)
  const canvasHref = getResourceCanvasHref(item)
  const dueContext = formatDueContext(item.dueDate ?? matchedTask?.deadline ?? null)

  return {
    id: `${item.id}-action-step`,
    title: item.title,
    note: dueContext
      ? `This is an action item for the module and is due ${dueContext}.`
      : 'This is the clearest action item to tackle after the study pass.',
    href: matchedTask
      ? `/modules/${moduleId}/do#${matchedTask.id}`
      : canvasHref ?? `/modules/${moduleId}/do`,
    destinationLabel: matchedTask
      ? 'Open task'
      : canvasHref
        ? 'Canvas link'
        : 'Open Do',
    external: !matchedTask && Boolean(canvasHref),
  }
}

function compareStudyMaterials(left: ModuleStudyMaterial, right: ModuleStudyMaterial) {
  return readinessWeight(left.readiness) - readinessWeight(right.readiness)
    || Number(right.resource.required) - Number(left.resource.required)
    || left.resource.title.localeCompare(right.resource.title)
}

function compareActionItems(left: ModuleSourceResource, right: ModuleSourceResource) {
  return sortableDateValue(left.dueDate) - sortableDateValue(right.dueDate)
    || Number(right.required) - Number(left.required)
    || left.title.localeCompare(right.title)
}

function readinessWeight(readiness: ModuleStudyReadiness) {
  if (readiness === 'ready') return 0
  if (readiness === 'limited') return 1
  return 2
}

function hasReadableText(resource: ModuleSourceResource) {
  if (resource.extractionStatus !== 'extracted') return false
  return Boolean(resource.extractedText?.trim() || resource.extractedTextPreview?.trim())
}

function getStudyProgress(resource: ModuleSourceResource): StudyFileProgressStatus {
  return resource.studyProgressStatus ?? 'not_started'
}

function getWorkflowOverride(resource: ModuleSourceResource): ModuleResourceWorkflowOverride {
  return resource.workflowOverride ?? 'study'
}

function findMatchingTask(item: ModuleSourceResource, tasks: Task[]) {
  const normalizedTitle = normalizeLookup(item.title)
  return tasks.find((task) => {
    const normalizedTask = normalizeLookup(task.title)
    return normalizedTask === normalizedTitle
      || normalizedTask.includes(normalizedTitle)
      || normalizedTitle.includes(normalizedTask)
  }) ?? null
}

function sortableDateValue(value: string | null | undefined) {
  if (!value || value === 'No due date') return Number.POSITIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  return date.getTime()
}

function formatDueContext(value: string | null) {
  if (!value || value === 'No due date') return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function trimAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const punctuationIndex = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('! '),
  )

  if (punctuationIndex >= 80) {
    return clipped.slice(0, punctuationIndex + 1).trim()
  }

  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}

function uniqueLines(lines: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of lines) {
    const cleaned = line?.trim()
    if (!cleaned) continue
    const key = normalizeLookup(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(cleaned)
  }

  return results
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
