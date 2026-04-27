import { getModuleResourceCapabilityInfo } from '@/lib/module-resource-capability'
import { getLearnResourceUiState, type LearnResourceActionPriority, type LearnResourceStatusKey } from '@/lib/learn-resource-ui'
import { getModuleResourceQualityInfo, type ModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { getResourceCanvasHref, getResourceOriginalFileHref, type ModuleSourceResource } from '@/lib/module-workspace'
import { buildModuleDoHref, buildModuleLearnHref } from '@/lib/stay-focused-links'
import { buildStudyFileReaderModel, getStudyFileTypeLabel, type StudyFileReaderModel } from '@/lib/study-file-reader'
import { getStudySourceNoun } from '@/lib/study-resource'
import type { ModuleResourceWorkflowOverride, StudyFileProgressStatus, Task } from '@/lib/types'

export type ModuleStudyReadiness = 'ready' | 'limited' | 'unavailable'

export interface ModuleStudyMaterial {
  resource: ModuleSourceResource
  reader: StudyFileReaderModel
  quality: ModuleResourceQualityInfo
  fileTypeLabel: string
  readiness: ModuleStudyReadiness
  readinessLabel: 'Ready' | 'Partial' | 'Source first' | 'Link only' | 'Unsupported' | 'No extract' | 'Scanned PDF' | 'OCR required' | 'Extracting...' | 'OCR complete' | 'OCR failed' | 'Loading'
  readinessTone: 'accent' | 'warning' | 'muted'
  statusKey: LearnResourceStatusKey
  note: string
  detailNote: string
  primaryAction: LearnResourceActionPriority
  sourceActionLabel: string
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

export interface ModuleStudyResumeTarget {
  resource: ModuleSourceResource
  fileTypeLabel: string
  readinessLabel: ModuleStudyMaterial['readinessLabel']
  promptLabel: 'Resume where you left off' | 'Continue reading'
  note: string
  href: string
  actionLabel: string
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
  resumeTarget: ModuleStudyResumeTarget | null
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
    .filter((resource) => resource.lane === 'learn')
    .map((resource) => buildStudyMaterial(resource))
    .sort(compareStudyMaterials)
  const studyMaterials = allStudyFiles.filter((material) => getWorkflowOverride(material.resource) !== 'activity')
  const activityOverrides = allStudyFiles.filter((material) => getWorkflowOverride(material.resource) === 'activity')
  const actionItems = [...doItems].sort(compareActionItems)
  const otherContextResources = resources
    .filter((resource) => resource.lane === 'support')
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
  const resumeTarget = buildResumeTarget(moduleId, studyMaterials)

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
    resumeTarget,
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
  const quality = getModuleResourceQualityInfo(resource)
  const readiness = resolveStudyReadiness(quality)
  const uiState = getLearnResourceUiState(resource, {
    readerState: reader.state,
    hasOriginalFile: Boolean(getResourceOriginalFileHref(resource)),
    hasCanvasLink: Boolean(getResourceCanvasHref(resource)),
  })

  return {
    resource,
    reader,
    quality,
    fileTypeLabel: getStudyFileTypeLabel(resource),
    readiness,
    readinessLabel: uiState.statusLabel,
    readinessTone: uiState.tone,
    statusKey: uiState.statusKey,
    note: buildStudyNote(resource, reader, readiness, uiState),
    detailNote: buildStudyDetail(reader, readiness, uiState),
    primaryAction: uiState.primaryAction,
    sourceActionLabel: uiState.sourceActionLabel,
  }
}

function resolveStudyReadiness(quality: ModuleResourceQualityInfo): ModuleStudyReadiness {
  if (quality.quality === 'strong' || quality.quality === 'usable') {
    return 'ready'
  }

  if (quality.quality === 'weak') {
    return 'limited'
  }

  return 'unavailable'
}

function buildStudyNote(
  resource: ModuleSourceResource,
  reader: StudyFileReaderModel,
  readiness: ModuleStudyReadiness,
  uiState: ReturnType<typeof getLearnResourceUiState>,
) {
  const sourceNoun = getStudySourceNoun(resource)
  const capability = getModuleResourceCapabilityInfo(resource)

  if (readiness === 'ready') {
    return reader.summary ?? uiState.summary
  }

  if (reader.state === 'empty') {
    if (/scanned|image-only|image based|image-based/i.test(resource.extractionError ?? '')) {
      return `The ${sourceNoun} was parsed, but it still looks more like a scanned or image-based document in Learn.`
    }

    return uiState.summary
  }

  if (resource.extractionStatus === 'pending') {
    return uiState.summary
  }

  if (resource.extractionStatus === 'unsupported') {
    return uiState.summary
  }

  return uiState.summary || capability.reason || `The reader could not prepare usable text for this ${sourceNoun} this time.`
}

function buildStudyDetail(
  reader: StudyFileReaderModel,
  readiness: ModuleStudyReadiness,
  uiState: ReturnType<typeof getLearnResourceUiState>,
) {
  if (readiness === 'ready') {
    return reader.outlineHint ?? uiState.detail
  }

  return uiState.detail
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
    return 'No study materials are mapped to this module yet, so Learn stays focused on resources and tasks instead of guessing at a module summary.'
  }

  if (activeStudyFileCount === 0 && activityOverrideCount > 0) {
    return 'All mapped study materials are currently treated as activity, so Learn is keeping this module in task mode instead of building a reading summary.'
  }

  if (readyStudyFileCount > 0) {
    return 'Learn has enough readable study material to give this module a reliable in-app reading pass.'
  }

  if (extractedStudyFileCount > 0) {
    return 'Some study materials are readable here, but the module still reads best as a mix of in-app notes and original sources.'
  }

  if (limitedStudyFileCount > 0) {
    return 'The mapped study materials are still partial in Learn, so this page stays honest and keeps the original sources close.'
  }

  if (unavailableStudyFileCount > 0) {
    return 'The mapped study materials still need their original sources more than the in-app reader right now.'
  }

  return 'Learn is waiting on stronger study-file coverage before it turns this module into a fuller reading lane.'
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
    return 'No mapped study materials are available for this module yet.'
  }

  if (activeStudyFileCount === 0 && activityOverrideCount > 0) {
    return `${activityOverrideCount} study material${activityOverrideCount === 1 ? ' is' : 's are'} currently treated as activity instead of the main study lane.`
  }

  const fragments: string[] = []

  if (readyStudyFileCount > 0) {
    fragments.push(
      readyStudyFileCount === activeStudyFileCount
        ? `${readyStudyFileCount} study material${readyStudyFileCount === 1 ? '' : 's'} are ready in the reader.`
        : `${readyStudyFileCount} of ${activeStudyFileCount} study material${activeStudyFileCount === 1 ? '' : 's'} are ready in the reader.`,
    )
  } else {
    fragments.push('No study materials in the current study lane are fully reader-ready yet.')
  }

  if (limitedStudyFileCount > 0) {
    fragments.push(`${limitedStudyFileCount} ${limitedStudyFileCount === 1 ? 'file is' : 'files are'} partial in the reader.`)
  }

  if (unavailableStudyFileCount > 0) {
    fragments.push(`${unavailableStudyFileCount} ${unavailableStudyFileCount === 1 ? 'item is' : 'items are'} source-first right now.`)
  }

  if (activityOverrideCount > 0) {
    fragments.push(`${activityOverrideCount} ${activityOverrideCount === 1 ? 'study material is' : 'study materials are'} currently treated as activity instead.`)
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

function buildResumeTarget(moduleId: string, studyMaterials: ModuleStudyMaterial[]): ModuleStudyResumeTarget | null {
  if (studyMaterials.length === 0) {
    return null
  }

  const recentlyOpened = [...studyMaterials]
    .filter((material) => recentDateValue(material.resource.lastOpenedAt) !== Number.NEGATIVE_INFINITY)
    .sort((left, right) => recentDateValue(right.resource.lastOpenedAt) - recentDateValue(left.resource.lastOpenedAt))
  const recentReadable = recentlyOpened.find((material) => material.reader.state === 'extracted')
  if (recentReadable) {
    return buildResumeTargetModel(moduleId, recentReadable, 'recent')
  }

  const strongestReadable = studyMaterials.find((material) => material.reader.state === 'extracted')
  if (strongestReadable) {
    return buildResumeTargetModel(moduleId, strongestReadable, 'fallback_readable')
  }

  const recentFallback = recentlyOpened[0]
  if (recentFallback) {
    return buildResumeTargetModel(moduleId, recentFallback, 'recent_fallback')
  }

  return buildResumeTargetModel(moduleId, studyMaterials[0], 'fallback_available')
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
  const destination = resolveStudyMaterialDestination(moduleId, material)

  return {
    id: `${material.resource.id}-study-step`,
    title: material.resource.title,
    note: material.readiness === 'ready'
      ? material.quality.quality === 'strong'
        ? 'Start in the reader here. The recovered text is strong enough for a reliable study pass.'
        : 'Start in the reader here. The recovered text should be good enough for a first pass.'
      : material.readiness === 'limited'
        ? 'Start in the reader for a quick pass, then open the original source when you want the clearest full version.'
        : material.primaryAction === 'source'
          ? 'Start with the original source. The reader is only a fallback view for this item right now.'
          : 'The original source is not linked here right now, so use the reader for the limited context available in Learn.',
    href: destination.href,
    destinationLabel: destination.destinationLabel,
    external: destination.external,
  }
}

function buildResumeTargetModel(
  moduleId: string,
  material: ModuleStudyMaterial,
  source: 'recent' | 'fallback_readable' | 'recent_fallback' | 'fallback_available',
): ModuleStudyResumeTarget {
  const destination = resolveStudyMaterialDestination(moduleId, material)
  const openedAtLabel = formatOpenedAt(material.resource.lastOpenedAt)
  const promptLabel = source === 'recent' || source === 'recent_fallback'
    ? 'Resume where you left off'
    : 'Continue reading'

  return {
    resource: material.resource,
    fileTypeLabel: material.fileTypeLabel,
    readinessLabel: material.readinessLabel,
    promptLabel,
    note: buildResumeNote(material, source, openedAtLabel),
    href: destination.href,
    actionLabel: destination.actionLabel,
    external: destination.external,
  }
}

function buildActivityOverrideStep(moduleId: string, material: ModuleStudyMaterial): Omit<ModuleSuggestedStudyStep, 'slotLabel'> {
  const destination = resolveStudyMaterialDestination(moduleId, material)

  return {
    id: `${material.resource.id}-activity-override-step`,
    title: material.resource.title,
    note: material.primaryAction === 'source'
      ? 'You marked this as activity, and the original source is still the clearest place to read it.'
      : 'You marked this as activity, but the reader is still available if you want a quick study pass before doing the work.',
    href: destination.href,
    destinationLabel: destination.destinationLabel,
    external: destination.external,
  }
}

function buildResumeNote(
  material: ModuleStudyMaterial,
  source: 'recent' | 'fallback_readable' | 'recent_fallback' | 'fallback_available',
  openedAtLabel: string | null,
) {
  if (source === 'recent') {
    return openedAtLabel
      ? `Last opened ${openedAtLabel}. This item is still the clearest next place to pick up your reading.`
      : 'This is the most recent study item that still makes sense to reopen from Learn.'
  }

  if (source === 'fallback_readable') {
    return 'No recent study item is pinned yet, so Learn is pointing you to the clearest readable source in this module.'
  }

  if (source === 'recent_fallback') {
    return openedAtLabel
      ? `Last opened ${openedAtLabel}. This still looks like the best next place to continue, even though the reader is limited here.`
      : 'This was the most recent study item in your lane, and it still makes the most sense to keep close.'
  }

  if (material.reader.state === 'metadata_only') {
    return 'No readable study item is pinned yet, so Learn is keeping the closest source-first item nearby.'
  }

  if (material.reader.state === 'weak') {
    return 'No stronger reader is ready yet, so Learn is keeping the clearest partial read nearby.'
  }

  if (material.reader.state === 'empty') {
    return 'No readable study item is pinned yet, so Learn is keeping the closest source nearby even though no useful text surfaced in the reader.'
  }

  if (material.readiness === 'unavailable') {
    return material.primaryAction === 'source'
      ? 'No reader-ready study item is pinned yet, so Learn is sending you back to the original source for the cleanest reopen.'
      : 'No reader-ready study item is pinned yet, so Learn is reopening the limited reader view because the original source is not linked here right now.'
  }

  return 'No recent study item is pinned yet, so Learn is keeping the clearest available source close.'
}

function resolveStudyMaterialDestination(moduleId: string, material: ModuleStudyMaterial) {
  const originalFileHref = getResourceOriginalFileHref(material.resource)
  const canvasHref = getResourceCanvasHref(material.resource)
  const shouldUseSource = material.primaryAction === 'source' && Boolean(originalFileHref ?? canvasHref)

  if (shouldUseSource) {
    return {
      href: originalFileHref ?? canvasHref!,
      actionLabel: material.sourceActionLabel,
      destinationLabel: originalFileHref
        ? 'Original file'
        : material.statusKey === 'link_only'
          ? 'Original link'
          : 'Canvas source',
      external: true,
    }
  }

  return {
    href: buildModuleLearnHref(moduleId, {
      resourceId: material.resource.id,
      panel: 'study-notes',
    }),
    actionLabel: 'Open reader',
    destinationLabel: 'Study reader',
    external: false,
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
      ? buildModuleDoHref(moduleId, { taskId: matchedTask.id })
      : canvasHref ?? buildModuleDoHref(moduleId, { resourceId: item.id }),
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
    || qualityWeight(left.quality.quality) - qualityWeight(right.quality.quality)
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

function qualityWeight(quality: ModuleResourceQualityInfo['quality']) {
  if (quality === 'strong') return 0
  if (quality === 'usable') return 1
  if (quality === 'weak') return 2
  if (quality === 'empty') return 3
  if (quality === 'unsupported') return 4
  return 5
}

function hasReadableText(resource: ModuleSourceResource) {
  if (resource.extractionStatus !== 'extracted' && resource.extractionStatus !== 'completed') return false
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

function formatOpenedAt(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function recentDateValue(value: string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return Number.NEGATIVE_INFINITY
  return date.getTime()
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
