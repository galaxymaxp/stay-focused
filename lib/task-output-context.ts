import { buildTaskDraftContextText, type TaskDraftContext } from '@/lib/do-now'
import { getModuleResourceQualityInfo } from '@/lib/module-resource-quality'
import { getModuleWorkspace } from '@/lib/module-workspace'
import type { ModuleResource } from '@/lib/types'

const TASK_OUTPUT_GENERIC_CONTEXT_TOKENS = new Set([
  'assignment',
  'activity',
  'analyze',
  'analysis',
  'course',
  'include',
  'instructions',
  'module',
  'recommendations',
  'references',
  'report',
  'research',
  'student',
  'students',
])

export async function resolveGroundedTaskOutputContext(
  moduleId: string,
  taskId: string,
  context: TaskDraftContext,
): Promise<TaskDraftContext> {
  const workspace = await getModuleWorkspace(moduleId).catch(() => null)
  if (!workspace) return context

  const task = workspace.tasks.find((candidate) => candidate.id === taskId) ?? null
  const taskTitle = task?.title ?? context.taskTitle
  const taskDetails = task?.details?.trim() || context.taskDetails
  const relatedResources = selectTaskOutputRelatedResources(`${taskTitle}\n${taskDetails ?? ''}`, workspace.resources)
  const relatedContext = relatedResources
    .map(formatTaskOutputResourceContext)
    .filter((value): value is string => Boolean(value))

  if (relatedContext.length === 0 && !taskDetails) return context

  const sourceText = buildTaskDraftContextText(relatedContext.join('\n\n'), 9000)
  const primaryResource = relatedResources[0] ?? null

  return {
    ...context,
    taskTitle,
    taskDetails,
    deadline: task?.deadline ?? context.deadline,
    priority: task?.priority ?? context.priority,
    courseId: context.courseId ?? workspace.module.courseId ?? null,
    moduleTitle: context.moduleTitle ?? workspace.module.title,
    resourceSnippet: sourceText,
    sourceText,
    sourceTitle: primaryResource?.title ?? context.sourceTitle,
    sourceType: primaryResource?.resourceType ?? context.sourceType,
    sourceHref: primaryResource ? getResourceOriginalFileHrefForTaskContext(primaryResource) ?? context.sourceHref : context.sourceHref,
    sourceNote: relatedContext.length > 0
      ? 'Readable related Canvas source text was found for this task.'
      : 'No readable related Canvas source text was found for this task.',
  }
}

export function selectTaskOutputRelatedResources(taskText: string, resources: ModuleResource[]) {
  const taskKey = normalizeTaskOutputLookup(taskText)
  const taskTokens = new Set(taskKey.split(' ').filter((token) => token.length >= 2))
  const scored = resources
    .map((resource, index) => {
      const quality = getModuleResourceQualityInfo(resource)
      const text = quality.meaningfulText || quality.normalizedText || resource.extractedText?.trim() || resource.extractedTextPreview?.trim() || ''
      if (!text.trim()) return null
      const titleKey = normalizeTaskOutputLookup(resource.title)
      const contentKey = normalizeTaskOutputLookup(text.slice(0, 2600))
      const titleTokens = titleKey.split(' ').filter((token) => token.length >= 2)
      const contentTokens = contentKey.split(' ').filter((token) => token.length >= 3)
      const titleOverlap = titleTokens.filter((token) => taskTokens.has(token)).length
      const contentOverlap = contentTokens.filter((token) => taskTokens.has(token)).length
      const exactish = titleKey && (taskKey.includes(titleKey) || titleKey.includes(taskKey)) ? 8 : 0
      const moduleMarker = titleTokens.some((token) => /^m\d+$/.test(token) && taskTokens.has(token)) ? 5 : 0
      const sourceTypeBoost = /page|file|document|pdf|docx|pptx/i.test(resource.resourceType) ? 1 : 0
      const adminPenalty = isAdministrativeTaskOutputResource(resource.title, text) && !hasDirectTaskOverlap(taskTokens, titleKey, contentKey) ? 20 : 0
      const relevanceGate = exactish > 0 || titleOverlap >= 1 || contentOverlap >= 2 || moduleMarker > 0
      if (!relevanceGate || adminPenalty >= 20) return null
      const score = exactish + moduleMarker + titleOverlap * 3 + Math.min(contentOverlap, 8) + sourceTypeBoost + Math.max(0, 3 - index / 10) - adminPenalty
      if (score < 4) return null
      return { resource, textLength: text.length, score }
    })
    .filter((entry): entry is { resource: ModuleResource; textLength: number; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || right.textLength - left.textLength)

  return scored.slice(0, 4).map((entry) => entry.resource)
}

function isAdministrativeTaskOutputResource(title: string, text: string) {
  return /\b(syllabus|course outline|course policies|room assignment|odl|online distance learning|class link|meeting link|curated videos?|video links?|zoom|google meet|classroom|learning outcomes?|clo\d*|course learning outcomes?)\b/i.test(`${title}\n${text.slice(0, 1200)}`)
}

function hasDirectTaskOverlap(taskTokens: Set<string>, titleKey: string, contentKey: string) {
  const directTerms = [...taskTokens].filter((token) => token.length >= 5 && !TASK_OUTPUT_GENERIC_CONTEXT_TOKENS.has(token))
  return directTerms.some((token) => titleKey.includes(token) || contentKey.includes(token))
}

function formatTaskOutputResourceContext(resource: ModuleResource) {
  const quality = getModuleResourceQualityInfo(resource)
  const text = buildTaskDraftContextText(
    quality.meaningfulText || quality.normalizedText || resource.extractedText || resource.extractedTextPreview,
    2200,
  )
  if (!text) return null
  return `Related Canvas source: ${resource.title}\n${text}`
}

function getResourceOriginalFileHrefForTaskContext(resource: ModuleResource) {
  return resource.sourceUrl ?? resource.htmlUrl ?? null
}

function normalizeTaskOutputLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
