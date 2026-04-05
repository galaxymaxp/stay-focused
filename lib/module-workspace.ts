import { supabase } from '@/lib/supabase'
import type { Deadline, Module, ModuleResource, Task } from '@/lib/types'

export interface ModuleWorkspaceData {
  module: Module
  tasks: Task[]
  deadlines: Deadline[]
  resources: ModuleResource[]
}

export interface LearnSection {
  id: string
  title: string
  body: string
}

export type LearnResourceKind =
  | 'study_file'
  | 'practice_link'
  | 'assignment'
  | 'quiz'
  | 'discussion'
  | 'reference'
  | 'announcement'

export type LearnResourceLane = 'learn' | 'do' | 'support'

export interface ModuleSourceResource {
  id: string
  title: string
  originalTitle?: string | null
  type: string
  contentType?: string | null
  extension?: string | null
  required: boolean
  moduleName: string | null
  category: 'assignment' | 'announcement' | 'resource'
  kind: LearnResourceKind
  lane: LearnResourceLane
  courseName?: string | null
  dueDate?: string | null
  sourceUrl?: string | null
  htmlUrl?: string | null
  canvasUrl?: string | null
  linkedContext?: string | null
  whyItMatters?: string | null
  extractionStatus?: ModuleResource['extractionStatus']
  extractedText?: string | null
  extractedTextPreview?: string | null
  extractedCharCount?: number
  extractionError?: string | null
}

export interface LearnResourceUnit {
  id: string
  resource: ModuleSourceResource
  modes: LearnSection[]
  preview: string
  priorityScore: number
}

export interface LearnAudit {
  hasFileBasedResources: boolean
  fileResourceCount: number
  missingFileExtraction: boolean
  note: string | null
}

export interface LearnExperience {
  sections: LearnSection[]
  resources: ModuleSourceResource[]
  learnUnits: LearnResourceUnit[]
  doItems: ModuleSourceResource[]
  supportItems: ModuleSourceResource[]
  audit: LearnAudit
}

export interface RecommendedStepTarget {
  id: string
  label: string
  href: string
  destinationLabel: string
}

export async function getModuleWorkspace(id: string): Promise<ModuleWorkspaceData | null> {
  if (!supabase) return null

  const { data: module } = await supabase.from('modules').select('*').eq('id', id).single()
  if (!module) return null

  const [tasksResult, deadlinesResult, resourcesResult] = await Promise.all([
    supabase.from('tasks').select('*').eq('module_id', id).order('created_at'),
    supabase.from('deadlines').select('*').eq('module_id', id).order('date'),
    supabase.from('module_resources').select('*').eq('module_id', id).order('created_at'),
  ])

  return {
    module,
    tasks: (tasksResult.data ?? []) as Task[],
    deadlines: (deadlinesResult.data ?? []) as Deadline[],
    resources: (resourcesResult.data ?? []).map(adaptModuleResourceRow),
  }
}

export function extractCourseName(rawContent?: string | null) {
  if (!rawContent) return 'Synced course'

  const firstLine = rawContent.split('\n').find((line) => line.startsWith('Course:'))
  if (!firstLine) return 'Synced course'

  return firstLine
    .replace(/^Course:\s*/, '')
    .replace(/\s+\([^)]+\)\s*$/, '')
    .trim() || 'Synced course'
}

export function buildLearnSections(module: Module) {
  return buildLearnExperience(module).sections
}

export function buildLearnExperience(
  module: Module,
  options?: { taskCount?: number; deadlineCount?: number; resources?: ModuleResource[] },
): LearnExperience {
  const cleanLines = sanitizeRawContent(module.raw_content)
  const readingBlocks = groupReadingBlocks(cleanLines)
  const parsed = parseCompiledCanvasContent(module.raw_content)
  const parsedOnlyResources = buildSourceResources(parsed)
  const storedResources = options?.resources?.map(adaptStoredResourceForLearn) ?? []
  const courseName = extractCourseName(module.raw_content)
  const mergedResources = mergeLearnResources(parsedOnlyResources, storedResources)
  const baseDoItems = mergedResources
    .filter((resource) => resource.lane === 'do')
    .sort((a, b) => Number(b.required) - Number(a.required) || a.title.localeCompare(b.title))
  const resources = mergedResources.map((resource) =>
    enrichResourceContext(resource, {
      courseName,
      module,
      assignments: parsed.assignments,
      doItems: baseDoItems,
    })
  )
  const fileResources = resources.filter((resource) => isFileBasedResourceType(resource.type))
  const conceptLines = (module.concepts ?? []).filter(Boolean).slice(0, 6)
  const extractedTextBlocks = resources
    .map((resource) => resource.extractedText?.trim() ?? '')
    .filter(Boolean)
  const learnUnits = resources
    .filter((resource) => resource.lane === 'learn')
    .map((resource, index) => buildLearnUnit(resource, module, index))
    .sort((a, b) => b.priorityScore - a.priorityScore || a.resource.title.localeCompare(b.resource.title))
  const doItems = resources
    .filter((resource) => resource.lane === 'do')
    .sort((a, b) => Number(b.required) - Number(a.required) || a.title.localeCompare(b.title))
  const supportItems = resources
    .filter((resource) => resource.lane === 'support')
    .sort((a, b) => a.title.localeCompare(b.title))
  const summary = module.summary?.trim() || buildSummaryFallback(parsed, resources, readingBlocks, extractedTextBlocks)
  const simplifiedExplanation = simplifySummary(summary || 'This module has been turned into a calmer study view so you can understand it before you act on it.')
  const memorizeLines = buildMemorizeLines(parsed, resources, options?.deadlineCount ?? 0)
  const studySteps = buildStudySteps(resources, options?.taskCount ?? 0, fileResources.length)
  const reviewPrompts = buildReviewPrompts(module, conceptLines, resources)
  const keyConcepts = conceptLines.length > 0
    ? conceptLines
    : buildKeyConceptFallback(parsed, resources, readingBlocks, extractedTextBlocks)
  const audit = buildLearnAudit(module, resources, fileResources)

  return {
    sections: [
      {
        id: 'quick-summary',
        title: 'Quick Summary',
        body: summary,
      },
      {
        id: 'explain-simply',
        title: 'Explain Simply',
        body: simplifiedExplanation,
      },
      {
        id: 'key-concepts',
        title: 'Key Concepts',
        body: keyConcepts.join('\n'),
      },
      {
        id: 'what-to-memorize',
        title: 'What to Memorize',
        body: memorizeLines.join('\n'),
      },
      {
        id: 'how-to-study',
        title: 'How to Study This',
        body: studySteps.join('\n'),
      },
      {
        id: 'review-practice',
        title: 'Review / Practice Prompts',
        body: reviewPrompts.join('\n'),
      },
    ].filter((section) => section.body.trim().length > 0),
    resources,
    learnUnits,
    doItems,
    supportItems,
    audit,
  }
}

function sanitizeRawContent(rawContent: string) {
  return rawContent
    .split('\n')
    .map((line) => line.replace(/^Course:\s*.+$/, '').trim())
    .filter(Boolean)
}

function groupReadingBlocks(lines: string[]) {
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    current.push(line)

    const joined = current.join(' ')
    if (joined.length >= 240 || /[.!?]$/.test(line)) {
      blocks.push(joined)
      current = []
    }
  }

  if (current.length > 0) {
    blocks.push(current.join(' '))
  }

  return blocks.filter(Boolean)
}

function simplifySummary(summary: string) {
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (sentences.length <= 1) return summary

  return [
    sentences[0],
    sentences[1] ?? '',
  ].filter(Boolean).join(' ')
}

interface ParsedCanvasAssignment {
  title: string
  due: string | null
  details: string | null
}

interface ParsedCanvasAnnouncement {
  title: string
  body: string | null
}

interface ParsedCanvasModuleGroup {
  name: string
  items: Array<{ title: string; type: string; required: boolean }>
}

interface ParsedCanvasContent {
  assignments: ParsedCanvasAssignment[]
  announcements: ParsedCanvasAnnouncement[]
  modules: ParsedCanvasModuleGroup[]
}

function parseCompiledCanvasContent(rawContent: string): ParsedCanvasContent {
  const lines = rawContent.split('\n')
  const parsed: ParsedCanvasContent = {
    assignments: [],
    announcements: [],
    modules: [],
  }

  let section: 'course' | 'assignments' | 'announcements' | 'modules' | null = null
  let currentAssignment: ParsedCanvasAssignment | null = null
  let currentAnnouncement: ParsedCanvasAnnouncement | null = null
  let currentModule: ParsedCanvasModuleGroup | null = null

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === 'ASSIGNMENTS:') {
      section = 'assignments'
      currentAssignment = null
      currentAnnouncement = null
      currentModule = null
      continue
    }

    if (trimmed === 'RECENT ANNOUNCEMENTS:') {
      section = 'announcements'
      currentAssignment = null
      currentAnnouncement = null
      currentModule = null
      continue
    }

    if (trimmed === 'MODULES:') {
      section = 'modules'
      currentAssignment = null
      currentAnnouncement = null
      currentModule = null
      continue
    }

    if (section === 'assignments') {
      if (trimmed.startsWith('- ')) {
        currentAssignment = {
          title: trimmed.slice(2).trim(),
          due: null,
          details: null,
        }
        parsed.assignments.push(currentAssignment)
        continue
      }

      if (!currentAssignment) continue
      if (trimmed.startsWith('Due:')) currentAssignment.due = trimmed.replace(/^Due:\s*/, '').trim()
      if (trimmed.startsWith('Details:')) currentAssignment.details = trimmed.replace(/^Details:\s*/, '').trim()
      continue
    }

    if (section === 'announcements') {
      if (trimmed.startsWith('- ')) {
        currentAnnouncement = {
          title: trimmed.slice(2).trim(),
          body: null,
        }
        parsed.announcements.push(currentAnnouncement)
        continue
      }

      if (!currentAnnouncement) continue
      currentAnnouncement.body = currentAnnouncement.body
        ? `${currentAnnouncement.body} ${trimmed}`
        : trimmed
      continue
    }

    if (section === 'modules') {
      if (trimmed.startsWith('- ')) {
        currentModule = {
          name: trimmed.slice(2).trim(),
          items: [],
        }
        parsed.modules.push(currentModule)
        continue
      }

      if (!currentModule || !trimmed.startsWith('* ')) continue
      const resource = parseModuleItem(trimmed.slice(2).trim())
      currentModule.items.push(resource)
    }
  }

  return parsed
}

function parseModuleItem(value: string) {
  const match = value.match(/^(.*)\s+\(([^)]+)\)(\s+\[required\])?$/)
  if (!match) {
    return {
      title: value,
      type: 'Resource',
      required: false,
    }
  }

  return {
    title: match[1].trim(),
    type: match[2].trim(),
    required: Boolean(match[3]),
  }
}

function buildSourceResources(parsed: ParsedCanvasContent): ModuleSourceResource[] {
  return [
    ...parsed.assignments.map((assignment, index) => ({
      id: `assignment-${index + 1}`,
      title: assignment.title,
      originalTitle: assignment.title,
      type: 'Assignment',
      required: Boolean(assignment.due),
      moduleName: null,
      category: 'assignment' as const,
      dueDate: assignment.due,
      kind: classifyLearnResourceKind({
        title: assignment.title,
        sourceType: 'assignment',
        category: 'assignment',
        extension: null,
        contentType: null,
        hasExtractedText: false,
      }),
      lane: 'do' as const,
    })),
    ...parsed.announcements.map((announcement, index) => ({
      id: `announcement-${index + 1}`,
      title: announcement.title,
      originalTitle: announcement.title,
      type: 'Announcement',
      required: false,
      moduleName: null,
      category: 'announcement' as const,
      kind: 'announcement' as const,
      lane: 'support' as const,
    })),
    ...parsed.modules.flatMap((moduleGroup, moduleIndex) =>
      moduleGroup.items.map((item, itemIndex) => ({
        id: `resource-${moduleIndex + 1}-${itemIndex + 1}`,
        title: item.title,
        originalTitle: item.title,
        type: item.type,
        required: item.required,
        moduleName: moduleGroup.name,
        category: 'resource' as const,
        kind: classifyLearnResourceKind({
          title: item.title,
          sourceType: item.type,
          category: 'resource',
          extension: null,
          contentType: null,
          hasExtractedText: false,
        }),
        lane: classifyLearnResourceLane(classifyLearnResourceKind({
          title: item.title,
          sourceType: item.type,
          category: 'resource',
          extension: null,
          contentType: null,
          hasExtractedText: false,
        })),
      }))
    ),
  ]
}

function adaptStoredResourceForLearn(resource: ModuleResource): ModuleSourceResource {
  const kind = classifyLearnResourceKind({
    title: resource.title,
    sourceType: resource.resourceType,
    category: 'resource',
    extension: resource.extension,
    contentType: resource.contentType,
    hasExtractedText: Boolean(resource.extractedText?.trim()),
  })

  return {
    id: resource.id,
    title: resource.title,
    originalTitle: resource.title,
    type: resource.resourceType,
    contentType: resource.contentType,
    extension: resource.extension,
    required: resource.required,
    moduleName: typeof resource.metadata.canvasModuleName === 'string' ? resource.metadata.canvasModuleName : null,
    category: 'resource',
    kind,
    lane: classifyLearnResourceLane(kind),
    sourceUrl: resource.sourceUrl,
    htmlUrl: resource.htmlUrl,
    canvasUrl: getCanvasUrl(resource.htmlUrl, resource.sourceUrl),
    extractionStatus: resource.extractionStatus,
    extractedText: resource.extractedText,
    extractedTextPreview: resource.extractedTextPreview,
    extractedCharCount: resource.extractedCharCount,
    extractionError: resource.extractionError,
  }
}

function enrichResourceContext(
  resource: ModuleSourceResource,
  context: {
    courseName: string
    module: Module
    assignments: ParsedCanvasAssignment[]
    doItems: ModuleSourceResource[]
  },
): ModuleSourceResource {
  const matchedAssignment = context.assignments.find((assignment) => matchesResourceTitle(resource.title, assignment.title))
  const linkedDoItem = context.doItems.find((item) => item.id !== resource.id)
  const dueDate = resource.dueDate ?? matchedAssignment?.due ?? null
  const linkedContext = resource.lane === 'learn'
    ? linkedDoItem
      ? `${labelForKind(linkedDoItem.kind)} next: ${linkedDoItem.title}${linkedDoItem.dueDate ? ` (${formatContextDate(linkedDoItem.dueDate)})` : ''}`
      : null
    : matchedAssignment?.details ?? null

  return {
    ...resource,
    courseName: context.courseName,
    dueDate,
    canvasUrl: resource.canvasUrl ?? getCanvasUrl(resource.htmlUrl, resource.sourceUrl),
    linkedContext,
    whyItMatters: buildWhyItMatters(resource, {
      moduleTitle: context.module.title,
      linkedDoItem,
      dueDate,
    }),
  }
}

function buildSummaryFallback(
  parsed: ParsedCanvasContent,
  resources: ModuleSourceResource[],
  readingBlocks: string[],
  extractedTextBlocks: string[],
) {
  const fileCount = resources.filter((resource) => isFileBasedResourceType(resource.type)).length
  const learnCount = resources.filter((resource) => resource.lane === 'learn').length
  const doCount = resources.filter((resource) => resource.lane === 'do').length
  const assignmentCount = parsed.assignments.length
  const announcementCount = parsed.announcements.length
  const resourceCount = parsed.modules.reduce((total, module) => total + module.items.length, 0)
  const extractedCount = resources.filter((resource) => resource.extractionStatus === 'extracted' && resource.extractedText).length

  if (extractedCount > 0 && extractedTextBlocks.length > 0) {
    return `This module is attachment-led: ${learnCount} resource${learnCount === 1 ? '' : 's'} belong in Learn first, while ${doCount} item${doCount === 1 ? '' : 's'} are better treated as action work. ${summarizeExtractedText(extractedTextBlocks.join(' '))}`
  }

  if (fileCount > 0) {
    return `This module is file-heavy, with ${fileCount} attachment-driven resource${fileCount === 1 ? '' : 's'} that should be studied before you worry about assignments. Learn is prioritizing those study materials first and keeping the task-style items separate.`
  }

  if (resourceCount > 0 || assignmentCount > 0) {
    return `This module mixes ${resourceCount} Canvas resource${resourceCount === 1 ? '' : 's'} with ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'}. Learn is now separating study resources from action items so the understanding pass is less assignment-heavy.`
  }

  return readingBlocks[0] ?? 'This module has been reshaped into a simpler study view so the key ideas and next moves are easier to grasp.'
}

function buildKeyConceptFallback(
  parsed: ParsedCanvasContent,
  resources: ModuleSourceResource[],
  readingBlocks: string[],
  extractedTextBlocks: string[],
) {
  const extractedConcepts = extractedTextBlocks
    .flatMap((block) => block.split(/(?<=[.!?])\s+/))
    .map((line) => line.trim())
    .filter((line) => line.length >= 40)
    .slice(0, 4)

  if (extractedConcepts.length > 0) return extractedConcepts

  const concepts = [
    ...resources
      .filter((resource) => resource.lane === 'learn')
      .slice(0, 4)
      .map((resource) => `${labelForKind(resource.kind)}: ${resource.title}`),
    ...parsed.modules.map((moduleGroup) => `${moduleGroup.name}: ${moduleGroup.items.slice(0, 2).map((item) => item.title).join(', ')}`),
  ]

  if (concepts.length > 0) return concepts.slice(0, 5)
  return readingBlocks.slice(0, 4)
}

function buildMemorizeLines(
  parsed: ParsedCanvasContent,
  resources: ModuleSourceResource[],
  deadlineCount: number,
) {
  const dueLines = parsed.assignments
    .filter((assignment) => assignment.due && assignment.due !== 'No due date')
    .slice(0, 4)
    .map((assignment) => `${assignment.title}: ${assignment.due}`)

  const requiredResources = resources
    .filter((resource) => resource.required)
    .slice(0, 4)
    .map((resource) => `${resource.title}${resource.moduleName ? ` in ${resource.moduleName}` : ''}`)
  const extractedResources = resources
    .filter((resource) => resource.extractionStatus === 'extracted' && resource.extractedTextPreview)
    .slice(0, 2)
    .map((resource) => `From ${resource.title}: ${resource.extractedTextPreview}`)

  const lines = [
    ...resources
      .filter((resource) => resource.lane === 'learn')
      .slice(0, 3)
      .map((resource) => `${labelForKind(resource.kind)}: ${resource.title}`),
    ...requiredResources.map((resource) => `Required resource: ${resource}`),
    ...dueLines,
    ...extractedResources,
  ]

  if (deadlineCount > 0 && lines.length === 0) {
    lines.push(`This module has ${deadlineCount} extracted deadline reference${deadlineCount === 1 ? '' : 's'} to keep in view.`)
  }

  if (lines.length === 0) {
    lines.push('Memorize the names of the main resources, the assignment titles, and any repeated terms that show up across the module items.')
  }

  return lines
}

function buildStudySteps(resources: ModuleSourceResource[], taskCount: number, fileResourceCount: number) {
  const firstFile = resources.find((resource) => isFileBasedResourceType(resource.type))
  const firstExtractedFile = resources.find((resource) => resource.extractionStatus === 'extracted' && resource.extractedText)
  const firstTaskLike = resources.find((resource) => resource.lane === 'do')

  const steps = [
    firstExtractedFile
      ? `Start with the extracted file content from "${firstExtractedFile.title}" and turn the opening section into a 3-sentence note in your own words.`
      : fileResourceCount > 0
        ? `Start with the file-based resources first${firstFile ? `, beginning with "${firstFile.title}"` : ''}, and turn each file title into a short note about what it probably covers.`
      : 'Start with the summary and key concepts so the module has a clear shape before you dive into details.',
    resources.length > 0
      ? 'Move through the Learn-first resources one at a time and write one sentence per resource about what it contributes.'
      : 'Pull out the repeated ideas and examples before switching into task mode.',
    firstTaskLike
      ? `After the study pass, switch to the Do-first lane and decide how "${firstTaskLike.title}" depends on the resources you just reviewed.`
      : `After the understanding pass, switch to Do and decide which of the ${taskCount} extracted task${taskCount === 1 ? '' : 's'} should move next.`,
  ]

  return steps
}

function buildReviewPrompts(module: Module, conceptLines: string[], resources: ModuleSourceResource[]) {
  const prompts = (module.study_prompts ?? []).filter(Boolean).slice(0, 5)
  if (prompts.length > 0) return prompts

  const seeds = conceptLines.length > 0
    ? conceptLines
    : resources.filter((resource) => resource.lane === 'learn').slice(0, 4).map((resource) => resource.title)

  if (seeds.length === 0) {
    return ['How would you explain this module to a classmate in under one minute?']
  }

  return seeds.slice(0, 4).map((seed) => `Explain "${seed}" in your own words, then say why it probably matters for the next task.`)
}

function buildLearnAudit(module: Module, resources: ModuleSourceResource[], fileResources: ModuleSourceResource[]): LearnAudit {
  const hasFileBasedResources = fileResources.length > 0
  const extractedFileResources = fileResources.filter((resource) => resource.extractionStatus === 'extracted' && resource.extractedText)
  const hasStructuredExtraction = Boolean(module.summary?.trim()) || (module.concepts?.length ?? 0) > 0 || (module.study_prompts?.length ?? 0) > 0
  const missingFileExtraction = hasFileBasedResources && extractedFileResources.length === 0 && !hasStructuredExtraction

  return {
    hasFileBasedResources,
    fileResourceCount: fileResources.length,
    missingFileExtraction,
    note: extractedFileResources.length > 0
      ? `This module includes ${fileResources.length} file-based Canvas resource${fileResources.length === 1 ? '' : 's'}, and ${extractedFileResources.length} of them produced usable attachment-backed learning text.`
      : missingFileExtraction
        ? `This module includes ${fileResources.length} file-based Canvas resource${fileResources.length === 1 ? '' : 's'}, but the current sync only captured their titles and types, not the actual PDF or slide text.`
        : hasFileBasedResources
          ? `This module includes ${fileResources.length} file-based Canvas resource${fileResources.length === 1 ? '' : 's'}. The current Learn view is combining extracted summary data with the file/resource map that was available.`
          : resources.length === 0
            ? 'This module has very little structured source material in the current sync, so Learn is falling back to the available module text.'
            : null,
  }
}

function isFileBasedResourceType(type: string) {
  const normalized = type.toLowerCase()
  return normalized === 'file' || normalized === 'document' || normalized === 'pdf' || normalized === 'ppt' || normalized === 'pptx'
}

function summarizeExtractedText(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean)
  return sentences.slice(0, 2).join(' ')
}

function mergeLearnResources(parsedResources: ModuleSourceResource[], storedResources: ModuleSourceResource[]) {
  const nonStored = parsedResources.filter((resource) => resource.category !== 'resource')
  const seen = new Set<string>()
  const merged = [...nonStored]

  for (const resource of storedResources) {
    const key = `${resource.title.toLowerCase()}::${resource.kind}::${resource.moduleName ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(resource)
  }

  for (const resource of parsedResources.filter((entry) => entry.category === 'resource')) {
    const key = `${resource.title.toLowerCase()}::${resource.kind}::${resource.moduleName ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(resource)
  }

  return merged
}

export function getLearnResourceHref(moduleId: string, resourceId: string) {
  return `/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`
}

export function getResourceCanvasHref(resource: ModuleSourceResource) {
  return resource.canvasUrl ?? null
}

export function findRecommendedStepTargets(
  module: Module,
  experience: LearnExperience,
  tasks: Task[],
): RecommendedStepTarget[] {
  const searchPool = [
    ...experience.learnUnits.map((unit) => ({
      id: unit.id,
      title: unit.resource.title,
      href: getLearnResourceHref(module.id, unit.resource.id),
      destinationLabel: 'Open resource',
    })),
    ...experience.doItems.map((item) => ({
      id: item.id,
      title: item.title,
      href: `/modules/${module.id}/do`,
      destinationLabel: 'Open in Do',
    })),
    ...tasks.map((task) => ({
      id: task.id,
      title: task.title,
      href: `/modules/${module.id}/do#${task.id}`,
      destinationLabel: 'Open task',
    })),
  ]

  return (module.recommended_order ?? []).map((step, index) => {
    const match = searchPool.find((entry) => matchesStepText(step, entry.title))

    return {
      id: `${module.id}-step-${index + 1}`,
      label: step,
      href: match?.href ?? `/modules/${module.id}/learn`,
      destinationLabel: match?.destinationLabel ?? 'Open module learn',
    }
  })
}

function buildLearnUnit(resource: ModuleSourceResource, module: Module, index: number): LearnResourceUnit {
  const sourceText = resource.extractedText?.trim()
    || resource.extractedTextPreview?.trim()
    || `${resource.title}. ${module.summary ?? ''}`.trim()
  const summary = summarizeResource(sourceText, resource)
  const simple = explainResourceSimply(summary, resource)
  const concepts = extractResourceConcepts(sourceText, resource)
  const memorize = buildResourceMemorize(resource, sourceText)
  const study = buildResourceStudyGuide(resource)
  const review = buildResourceReviewPrompts(resource, concepts)

  return {
    id: `${resource.id}-unit`,
    resource,
    preview: summary,
    priorityScore: getLearnPriorityScore(resource, index),
    modes: [
      { id: `${resource.id}-quick-summary`, title: 'Quick Summary', body: summary },
      { id: `${resource.id}-explain-simply`, title: 'Explain Simply', body: simple },
      { id: `${resource.id}-key-concepts`, title: 'Key Concepts', body: concepts.join('\n') },
      { id: `${resource.id}-what-to-memorize`, title: 'What to Memorize', body: memorize.join('\n') },
      { id: `${resource.id}-how-to-study`, title: 'How to Study This', body: study.join('\n') },
      { id: `${resource.id}-review-practice`, title: 'Review / Practice Prompts', body: review.join('\n') },
    ],
  }
}

export function findLearnUnitByResourceId(experience: LearnExperience, resourceId: string) {
  return experience.learnUnits.find((unit) => unit.resource.id === resourceId) ?? null
}

export function findDoResourceById(experience: LearnExperience, resourceId: string) {
  return experience.doItems.find((item) => item.id === resourceId)
    ?? experience.supportItems.find((item) => item.id === resourceId)
    ?? experience.resources.find((item) => item.id === resourceId)
    ?? null
}

export function matchTaskToResource(taskTitle: string, resources: ModuleSourceResource[]) {
  return resources.find((resource) => matchesResourceTitle(taskTitle, resource.title)) ?? null
}

function summarizeResource(sourceText: string, resource: ModuleSourceResource) {
  const sentences = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean)
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join(' ')
  }
  return `${resource.title} is a ${labelForKind(resource.kind).toLowerCase()} in this module and should be reviewed as part of the understanding pass before you move into task execution.`
}

function explainResourceSimply(summary: string, resource: ModuleSourceResource) {
  return `This resource is here to help you understand "${resource.title}" in a more direct way. ${summary}`
}

function extractResourceConcepts(sourceText: string, resource: ModuleSourceResource) {
  const sentences = sourceText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((line) => line.length >= 28)
    .slice(0, 4)

  if (sentences.length > 0) return sentences
  return [
    `${resource.title} is being treated as a ${labelForKind(resource.kind).toLowerCase()}.`,
    resource.moduleName ? `It sits inside the module group "${resource.moduleName}".` : 'It belongs to the current Canvas module.',
  ]
}

function buildResourceMemorize(resource: ModuleSourceResource, sourceText: string) {
  const firstUsefulLine = sourceText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find((line) => line.length >= 24)

  return [
    `Resource name: ${resource.title}`,
    resource.required ? 'This resource is marked required in Canvas.' : `Resource type: ${labelForKind(resource.kind)}`,
    firstUsefulLine ?? 'Memorize the title, the format, and the main idea you think this resource is trying to teach.',
  ]
}

function buildResourceStudyGuide(resource: ModuleSourceResource) {
  const firstStep = resource.kind === 'study_file'
    ? 'Read or skim the attachment once for structure before taking notes.'
    : resource.kind === 'practice_link'
      ? 'Open the practice resource and identify what skill it wants you to apply.'
      : resource.kind === 'reference'
        ? 'Use this resource as a concept anchor and pull out the definitions or examples that keep recurring.'
        : 'Use this resource to understand the material before acting on it.'

  return [
    firstStep,
    'Write 3 short bullets: what it covers, what terms repeat, and what it probably supports later in the module.',
    'Only after that, connect it to the task or quiz items in Do.',
  ]
}

function buildResourceReviewPrompts(resource: ModuleSourceResource, concepts: string[]) {
  return concepts.slice(0, 3).map((concept) => `How would you explain this part of "${resource.title}" to a classmate: ${concept}`)
}

function getLearnPriorityScore(resource: ModuleSourceResource, index: number) {
  const kindScore = resource.kind === 'study_file'
    ? 50
    : resource.kind === 'practice_link'
      ? 40
      : resource.kind === 'reference'
        ? 30
        : resource.kind === 'announcement'
          ? 12
          : 8
  const extractionScore = resource.extractionStatus === 'extracted' ? 18 : resource.extractedTextPreview ? 10 : 0
  const requiredScore = resource.required ? 6 : 0
  return kindScore + extractionScore + requiredScore - index
}

function buildWhyItMatters(
  resource: ModuleSourceResource,
  context: {
    moduleTitle: string
    linkedDoItem: ModuleSourceResource | undefined
    dueDate: string | null
  },
) {
  if (resource.lane === 'learn') {
    if (context.linkedDoItem) {
      return `${resource.title} sets up ${context.linkedDoItem.title}, so understanding it first should make the action pass lighter.`
    }

    return `${resource.title} is part of the understanding pass for ${context.moduleTitle}, so it helps shape the module before you switch into execution.`
  }

  if (resource.lane === 'do') {
    return context.dueDate
      ? `${resource.title} is an action item tied to ${formatContextDate(context.dueDate)}.`
      : `${resource.title} is a do-first item and belongs in the execution lane instead of the study pass.`
  }

  return `${resource.title} adds background context for ${context.moduleTitle} and is best used as support material.`
}

function getCanvasUrl(htmlUrl?: string | null, sourceUrl?: string | null) {
  return htmlUrl ?? sourceUrl ?? null
}

function matchesStepText(step: string, title: string) {
  const normalizedStep = normalizeLookup(step)
  const normalizedTitle = normalizeLookup(title)
  return normalizedStep.includes(normalizedTitle) || normalizedTitle.includes(normalizedStep)
}

function matchesResourceTitle(left: string, right: string) {
  const normalizedLeft = normalizeLookup(left)
  const normalizedRight = normalizeLookup(right)
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function formatContextDate(value: string) {
  if (!value || value === 'No due date') return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}

function classifyLearnResourceKind(input: {
  title: string
  sourceType: string
  category: ModuleSourceResource['category']
  extension: string | null
  contentType: string | null
  hasExtractedText: boolean
}): LearnResourceKind {
  const title = input.title.toLowerCase()
  const type = input.sourceType.toLowerCase()
  const extension = input.extension?.toLowerCase() ?? null
  const contentType = input.contentType?.toLowerCase() ?? null

  if (input.category === 'announcement' || type.includes('announcement')) return 'announcement'
  if (type.includes('quiz') || title.includes('quiz') || title.includes('exam')) return 'quiz'
  if (type.includes('discussion') || title.includes('discussion') || title.includes('forum')) return 'discussion'
  if (input.category === 'assignment' || type.includes('assignment')) return 'assignment'
  if (extension === 'pdf' || extension === 'ppt' || extension === 'pptx') return 'study_file'
  if (contentType?.includes('pdf') || contentType?.includes('presentation')) return 'study_file'
  if (type.includes('file') || type.includes('document') || input.hasExtractedText) return 'study_file'
  if (title.includes('practice') || title.includes('worksheet') || title.includes('reviewer') || title.includes('activity') || title.includes('exercise') || title.includes('problem set')) {
    return 'practice_link'
  }
  if (type.includes('external') || type.includes('url') || type.includes('link') || type.includes('page')) return 'reference'
  return 'reference'
}

function classifyLearnResourceLane(kind: LearnResourceKind): LearnResourceLane {
  if (kind === 'assignment' || kind === 'quiz' || kind === 'discussion') return 'do'
  if (kind === 'announcement') return 'support'
  return 'learn'
}

function labelForKind(kind: LearnResourceKind) {
  if (kind === 'study_file') return 'Study File'
  if (kind === 'practice_link') return 'Practice Link'
  if (kind === 'assignment') return 'Assignment'
  if (kind === 'quiz') return 'Quiz'
  if (kind === 'discussion') return 'Discussion'
  if (kind === 'reference') return 'Reference'
  return 'Announcement'
}

function adaptModuleResourceRow(row: Record<string, unknown>): ModuleResource {
  return {
    id: String(row.id ?? ''),
    moduleId: String(row.module_id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : null,
    canvasModuleId: typeof row.canvas_module_id === 'number' ? row.canvas_module_id : null,
    canvasItemId: typeof row.canvas_item_id === 'number' ? row.canvas_item_id : null,
    canvasFileId: typeof row.canvas_file_id === 'number' ? row.canvas_file_id : null,
    title: typeof row.title === 'string' ? row.title : 'Resource',
    resourceType: typeof row.resource_type === 'string' ? row.resource_type : 'Resource',
    contentType: typeof row.content_type === 'string' ? row.content_type : null,
    extension: typeof row.extension === 'string' ? row.extension : null,
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null,
    htmlUrl: typeof row.html_url === 'string' ? row.html_url : null,
    extractionStatus: normalizeExtractionStatus(row.extraction_status),
    extractedText: typeof row.extracted_text === 'string' ? row.extracted_text : null,
    extractedTextPreview: typeof row.extracted_text_preview === 'string' ? row.extracted_text_preview : null,
    extractedCharCount: typeof row.extracted_char_count === 'number' ? row.extracted_char_count : 0,
    extractionError: typeof row.extraction_error === 'string' ? row.extraction_error : null,
    required: Boolean(row.required),
    metadata: isPlainRecord(row.metadata) ? row.metadata : {},
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function normalizeExtractionStatus(value: unknown): ModuleResource['extractionStatus'] {
  return value === 'pending'
    || value === 'extracted'
    || value === 'metadata_only'
    || value === 'unsupported'
    || value === 'empty'
    || value === 'failed'
    ? value
    : 'metadata_only'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
