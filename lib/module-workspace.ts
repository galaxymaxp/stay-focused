import { supabase } from '@/lib/supabase'
import type {
  Deadline,
  Module,
  ModuleResource,
  ModuleResourceStudyState,
  ModuleResourceWorkflowOverride,
  StudyFileProgressStatus,
  Task,
} from '@/lib/types'

export interface ModuleWorkspaceData {
  module: Module
  tasks: Task[]
  deadlines: Deadline[]
  resources: ModuleResource[]
  resourceStudyStates: ModuleResourceStudyState[]
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
  moduleUrl?: string | null
  canvasUrl?: string | null
  linkedContext?: string | null
  whyItMatters?: string | null
  extractionStatus?: ModuleResource['extractionStatus']
  extractedText?: string | null
  extractedTextPreview?: string | null
  extractedCharCount?: number
  extractionError?: string | null
  studyProgressStatus?: StudyFileProgressStatus
  workflowOverride?: ModuleResourceWorkflowOverride
  studyStateUpdatedAt?: string | null
}

export interface LearnResourceUnit {
  id: string
  resource: ModuleSourceResource
  modes: LearnSection[]
  preview: string
  priorityScore: number
  grounding: ResourceGrounding
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

export interface ResourceGrounding {
  state: 'grounded' | 'partial' | 'context_only' | 'unread'
  label: 'Read from extracted content' | 'Partially read' | 'Context only' | 'Unread / extraction unavailable'
  confidence: 'High' | 'Medium' | 'Low' | 'None'
  evidenceSnippet: string | null
  hasGroundedAnalysis: boolean
  message: string
}

export async function getModuleWorkspace(id: string): Promise<ModuleWorkspaceData | null> {
  if (!supabase) return null

  const { data: moduleRow } = await supabase.from('modules').select('*').eq('id', id).single()
  if (!moduleRow) return null

  const [tasksResult, deadlinesResult, resourcesResult, resourceStudyStateResult] = await Promise.all([
    supabase.from('tasks').select('*').eq('module_id', id).order('created_at'),
    supabase.from('deadlines').select('*').eq('module_id', id).order('date'),
    supabase.from('module_resources').select('*').eq('module_id', id).order('created_at'),
    supabase.from('module_resource_study_state').select('*').eq('module_id', id).order('updated_at', { ascending: false }),
  ])
  const resourceStudyStates = isMissingSchemaObjectError(resourceStudyStateResult.error)
    ? []
    : (resourceStudyStateResult.data ?? []).map(adaptModuleResourceStudyStateRow)

  return {
    module: adaptModuleWorkspaceRow(moduleRow),
    tasks: (tasksResult.data ?? []).map(adaptTaskRow),
    deadlines: (deadlinesResult.data ?? []).map(adaptDeadlineRow),
    resources: (resourcesResult.data ?? []).map(adaptModuleResourceRow),
    resourceStudyStates,
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
  options?: {
    taskCount?: number
    deadlineCount?: number
    resources?: ModuleResource[]
    resourceStudyStates?: ModuleResourceStudyState[]
  },
): LearnExperience {
  const cleanLines = sanitizeRawContent(module.raw_content)
  const readingBlocks = groupReadingBlocks(cleanLines)
  const parsed = parseCompiledCanvasContent(module.raw_content)
  const parsedOnlyResources = buildSourceResources(parsed)
  const storedResources = options?.resources?.map(adaptStoredResourceForLearn) ?? []
  const studyStateByResourceId = new Map((options?.resourceStudyStates ?? []).map((state) => [state.resourceId, state]))
  const courseName = extractCourseName(module.raw_content)
  const mergedResources = mergeLearnResources(parsedOnlyResources, storedResources)
  const baseDoItems = mergedResources
    .filter((resource) => resource.lane === 'do')
    .sort((a, b) => Number(b.required) - Number(a.required) || a.title.localeCompare(b.title))
  const resources = mergedResources.map((resource) => {
    const enriched = enrichResourceContext(resource, {
      courseName,
      module,
      assignments: parsed.assignments,
      doItems: baseDoItems,
    })

    return applyResourceStudyState(enriched, studyStateByResourceId.get(enriched.id))
  })
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
  const keyConcepts = conceptLines.length > 0
    ? conceptLines
    : buildKeyConceptFallback(parsed, resources, readingBlocks, extractedTextBlocks)
  const coreIdeas = buildCoreIdeas(summary, keyConcepts, resources)
  const breakdown = buildModuleBreakdown(resources, summary)
  const connections = buildModuleConnections(resources, doItems, supportItems)
  const examFocus = buildLikelyExamFocus(parsed, resources, options?.deadlineCount ?? 0)
  const misunderstandings = buildModuleMisunderstandings(resources, summary)
  const deepQuestions = buildDeepQuestions(module, keyConcepts, resources)
  const appliedPractice = buildAppliedPractice(resources, doItems)
  const memoryAnchors = buildMemoryAnchors(resources, keyConcepts, parsed, options?.deadlineCount ?? 0)
  const whyThisMatters = buildModuleWhyThisMatters(module, resources, doItems)
  const nextSteps = buildAfterReadingSteps(resources, doItems, options?.taskCount ?? 0)
  const audit = buildLearnAudit(module, resources, fileResources)

  return {
    sections: [
      {
        id: 'core-ideas',
        title: 'Core Ideas',
        body: coreIdeas.join('\n'),
      },
      {
        id: 'step-by-step-breakdown',
        title: 'Step-by-Step Breakdown',
        body: breakdown.join('\n'),
      },
      {
        id: 'connections',
        title: 'Connections',
        body: connections.join('\n'),
      },
      {
        id: 'likely-exam-focus',
        title: 'Likely Exam Focus',
        body: examFocus.join('\n'),
      },
      {
        id: 'misunderstandings',
        title: 'Misunderstandings to Avoid',
        body: misunderstandings.join('\n'),
      },
      {
        id: 'deep-questions',
        title: 'Deep Questions',
        body: deepQuestions.join('\n'),
      },
      {
        id: 'applied-practice',
        title: 'Applied Practice',
        body: appliedPractice.join('\n'),
      },
      {
        id: 'memory-anchors',
        title: 'Memory Anchors',
        body: memoryAnchors.join('\n'),
      },
      {
        id: 'why-this-matters',
        title: 'Why This Matters',
        body: whyThisMatters,
      },
      {
        id: 'what-to-do-after-reading',
        title: 'What To Do After Reading',
        body: nextSteps.join('\n'),
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
    moduleUrl: typeof resource.metadata.canvasModuleUrl === 'string' ? resource.metadata.canvasModuleUrl : null,
    canvasUrl: getCanvasUrl(
      resource.htmlUrl,
      resource.sourceUrl,
      typeof resource.metadata.canvasModuleUrl === 'string' ? resource.metadata.canvasModuleUrl : null,
    ),
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
    canvasUrl: resource.canvasUrl ?? getCanvasUrl(resource.htmlUrl, resource.sourceUrl, resource.moduleUrl),
    linkedContext,
    whyItMatters: buildWhyItMatters(resource, {
      moduleTitle: context.module.title,
      linkedDoItem,
      dueDate,
    }),
  }
}

function applyResourceStudyState(
  resource: ModuleSourceResource,
  studyState?: ModuleResourceStudyState,
): ModuleSourceResource {
  return {
    ...resource,
    studyProgressStatus: studyState?.studyProgressStatus ?? 'not_started',
    workflowOverride: studyState?.workflowOverride ?? 'study',
    studyStateUpdatedAt: studyState?.updatedAt ?? null,
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

function buildCoreIdeas(summary: string, keyConcepts: string[], resources: ModuleSourceResource[]) {
  const lines = [
    summary,
    ...keyConcepts.slice(0, 3),
    ...resources
      .filter((resource) => resource.lane === 'learn')
      .slice(0, 2)
      .map((resource) => `${resource.title} is one of the main teaching resources for this module.`),
  ]

  return uniqueLines(lines, 4)
}

function buildModuleBreakdown(resources: ModuleSourceResource[], summary: string) {
  const learnResources = resources.filter((resource) => resource.lane === 'learn')
  const first = learnResources[0]
  const second = learnResources[1]

  return uniqueLines([
    first ? `Start with ${first.title} to get the main frame of the topic.` : summary,
    second ? `Then move to ${second.title} and ask how it extends or sharpens the first resource.` : 'Then slow down and separate definitions, examples, and anything that looks procedural.',
    'Turn the repeated terms into a short outline so you can see the internal logic instead of rereading passively.',
    'Before leaving Learn, connect those ideas to the quiz, assignment, or discussion that depends on them.',
  ], 4)
}

function buildModuleConnections(resources: ModuleSourceResource[], doItems: ModuleSourceResource[], supportItems: ModuleSourceResource[]) {
  return uniqueLines([
    ...resources
      .filter((resource) => resource.lane === 'learn' && resource.linkedContext)
      .slice(0, 3)
      .map((resource) => `${resource.title}: ${resource.linkedContext}`),
    doItems[0] ? `The clearest action connection is ${doItems[0].title}, which should feel easier once the Learn-first resources make sense.` : null,
    supportItems[0] ? `${supportItems[0].title} adds background context rather than core testable content.` : null,
  ], 4)
}

function buildLikelyExamFocus(parsed: ParsedCanvasContent, resources: ModuleSourceResource[], deadlineCount: number) {
  const required = resources.filter((resource) => resource.required)
  const dueLines = parsed.assignments.filter((assignment) => assignment.due && assignment.due !== 'No due date')

  return uniqueLines([
    ...required.slice(0, 3).map((resource) => `${resource.title} is marked required, so its key terms or examples are high-value review targets.`),
    ...dueLines.slice(0, 2).map((assignment) => `${assignment.title} signals assessed material, especially the ideas you would need to explain without looking back.`),
    deadlineCount > 0 ? `There are ${deadlineCount} extracted deadline reference${deadlineCount === 1 ? '' : 's'}, so time-sensitive items are likely tied to what matters most.` : null,
  ], 4)
}

function buildModuleMisunderstandings(resources: ModuleSourceResource[], summary: string) {
  const learnTitles = resources.filter((resource) => resource.lane === 'learn').slice(0, 2).map((resource) => resource.title)

  return uniqueLines([
    'Do not treat the resource titles as the same thing; separate the core idea, the example, and the task expectation.',
    learnTitles[0] ? `When reviewing ${learnTitles[0]}, avoid memorizing isolated phrases without asking what problem or concept it is addressing.` : null,
    'If something sounds familiar, verify that you can explain the relationship between parts, not just recognize the wording.',
    summary ? 'Do not stop at the module summary. Use it as a frame, then test whether each resource actually supports that frame.' : null,
  ], 4)
}

function buildDeepQuestions(module: Module, keyConcepts: string[], resources: ModuleSourceResource[]) {
  const prompts = (module.study_prompts ?? []).filter(Boolean)
  if (prompts.length > 0) return uniqueLines(prompts, 4)

  return uniqueLines([
    ...keyConcepts.slice(0, 3).map((concept) => `How would you defend why "${concept}" matters in this module instead of just defining it?`),
    ...resources.filter((resource) => resource.lane === 'learn').slice(0, 2).map((resource) => `What changes in your understanding after reading ${resource.title}, and what would stay unclear without it?`),
  ], 4)
}

function buildAppliedPractice(resources: ModuleSourceResource[], doItems: ModuleSourceResource[]) {
  return uniqueLines([
    'Write a 3-bullet explanation of the topic without looking at the resource, then reopen it and fill the gaps.',
    ...resources.filter((resource) => resource.lane === 'learn').slice(0, 2).map((resource) => `Use ${resource.title} to create one self-test question and answer it in your own words.`),
    doItems[0] ? `Before starting ${doItems[0].title}, write what knowledge from Learn you expect to use so the task is not disconnected from the study pass.` : null,
  ], 4)
}

function buildMemoryAnchors(resources: ModuleSourceResource[], keyConcepts: string[], parsed: ParsedCanvasContent, deadlineCount: number) {
  return uniqueLines([
    ...keyConcepts.slice(0, 2).map((concept) => `Anchor: ${concept}`),
    ...resources.filter((resource) => resource.required).slice(0, 2).map((resource) => `Required anchor: ${resource.title}`),
    parsed.assignments[0]?.due ? `${parsed.assignments[0].title} is due ${parsed.assignments[0].due}, so tie your memory of the concept to that deliverable.` : null,
    deadlineCount > 0 ? 'Remember the concepts together with the task or deadline they unlock.' : null,
  ], 4)
}

function buildModuleWhyThisMatters(module: Module, resources: ModuleSourceResource[], doItems: ModuleSourceResource[]) {
  const firstLearn = resources.find((resource) => resource.lane === 'learn')
  const firstDo = doItems[0]

  if (firstLearn && firstDo) {
    return `${firstLearn.title} helps explain the material that sits underneath ${firstDo.title}, so this module is not just information to skim. It is the understanding layer that reduces friction when you switch into action.`
  }

  return `${module.title} matters because it builds context before the workload turns into isolated tasks. The goal is to understand the idea well enough that later work feels connected instead of rushed.`
}

function buildAfterReadingSteps(resources: ModuleSourceResource[], doItems: ModuleSourceResource[], taskCount: number) {
  const firstLearn = resources.find((resource) => resource.lane === 'learn')
  const firstDo = doItems[0]

  return uniqueLines([
    firstLearn ? `Close ${firstLearn.title} and restate its main point from memory before moving on.` : 'Close the resource and restate the main idea from memory.',
    'Turn the key terms into a short note, comparison, or mini-outline you can revisit quickly.',
    firstDo ? `Open ${firstDo.title} next and mark exactly which concept from Learn it depends on.` : `Switch into Do and decide which of the ${taskCount} extracted task${taskCount === 1 ? '' : 's'} should move next.`,
  ], 4)
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
  const storedLookup = new Map<string, ModuleSourceResource>()

  for (const resource of storedResources) {
    const key = `${resource.title.toLowerCase()}::${resource.kind}::${resource.moduleName ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(resource)
    storedLookup.set(`${normalizeLookup(resource.title)}::${resource.kind}`, resource)
  }

  for (const resource of parsedResources.filter((entry) => entry.category === 'resource')) {
    const storedMatch = storedLookup.get(`${normalizeLookup(resource.title)}::${resource.kind}`)
    if (storedMatch) continue
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
  const grounding = getResourceGrounding(resource)
  const sourceText = resource.extractedText?.trim()
    || resource.extractedTextPreview?.trim()
    || ''
  const summary = summarizeResource(sourceText, resource)
  const concepts = extractResourceConcepts(sourceText, resource)
  const coreIdeas = buildResourceCoreIdeas(resource, summary, concepts)
  const breakdown = buildResourceBreakdown(resource, sourceText)
  const connections = buildResourceConnections(resource, module)
  const examFocus = buildResourceExamFocus(resource, concepts)
  const misunderstandings = buildResourceMisunderstandings(resource, sourceText)
  const deepQuestions = buildResourceDeepQuestions(resource, concepts)
  const appliedPractice = buildResourceAppliedPractice(resource)
  const memoryAnchors = buildResourceMemoryAnchors(resource, sourceText)
  const whyThisMatters = buildResourceWhyThisMatters(resource, module)
  const nextSteps = buildResourceNextSteps(resource)

  return {
    id: `${resource.id}-unit`,
    resource,
    preview: grounding.hasGroundedAnalysis ? summary : grounding.message,
    priorityScore: getLearnPriorityScore(resource, index),
    grounding,
    modes: grounding.hasGroundedAnalysis
      ? [
          { id: `${resource.id}-core-ideas`, title: 'Core Ideas', body: coreIdeas.join('\n') },
          { id: `${resource.id}-step-by-step-breakdown`, title: 'Step-by-Step Breakdown', body: breakdown.join('\n') },
          { id: `${resource.id}-connections`, title: 'Connections', body: connections.join('\n') },
          { id: `${resource.id}-likely-exam-focus`, title: 'Likely Exam Focus', body: examFocus.join('\n') },
          { id: `${resource.id}-misunderstandings`, title: 'Misunderstandings to Avoid', body: misunderstandings.join('\n') },
          { id: `${resource.id}-deep-questions`, title: 'Deep Questions', body: deepQuestions.join('\n') },
          { id: `${resource.id}-applied-practice`, title: 'Applied Practice', body: appliedPractice.join('\n') },
          { id: `${resource.id}-memory-anchors`, title: 'Memory Anchors', body: memoryAnchors.join('\n') },
          { id: `${resource.id}-why-this-matters`, title: 'Why This Matters', body: whyThisMatters },
          { id: `${resource.id}-next-steps`, title: 'What To Do After Reading', body: nextSteps.join('\n') },
        ]
      : [],
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

export function getResourceGrounding(resource: ModuleSourceResource): ResourceGrounding {
  const evidenceText = resource.extractedText?.trim() || resource.extractedTextPreview?.trim() || ''
  const charCount = typeof resource.extractedCharCount === 'number' ? resource.extractedCharCount : 0

  if (resource.extractionStatus === 'extracted' && charCount >= 900 && evidenceText) {
    return {
      state: 'grounded',
      label: 'Read from extracted content',
      confidence: 'High',
      evidenceSnippet: evidenceText.slice(0, 280),
      hasGroundedAnalysis: true,
      message: `This view is grounded in extracted file text (${charCount} characters).`,
    }
  }

  if (resource.extractionStatus === 'extracted' && charCount >= 320 && evidenceText) {
    return {
      state: 'grounded',
      label: 'Read from extracted content',
      confidence: 'Medium',
      evidenceSnippet: evidenceText.slice(0, 280),
      hasGroundedAnalysis: true,
      message: `This view is grounded in extracted file text, but the readable amount is still fairly limited (${charCount} characters).`,
    }
  }

  if (resource.extractionStatus === 'extracted' && evidenceText) {
    return {
      state: 'partial',
      label: 'Partially read',
      confidence: 'Low',
      evidenceSnippet: evidenceText.slice(0, 280),
      hasGroundedAnalysis: false,
      message: `Only a small amount of readable file text was extracted (${charCount} characters), so the app keeps the reader lightweight instead of making deeper claims.`,
    }
  }

  if (resource.extractionStatus === 'metadata_only') {
    return {
      state: 'context_only',
      label: 'Context only',
      confidence: 'None',
      evidenceSnippet: null,
      hasGroundedAnalysis: false,
      message: 'Only the file title, module context, and linked tasks are available here. No readable file text was extracted.',
    }
  }

  return {
    state: 'unread',
    label: 'Unread / extraction unavailable',
    confidence: 'None',
    evidenceSnippet: null,
    hasGroundedAnalysis: false,
    message: buildUnreadGroundingMessage(resource),
  }
}

function buildUnreadGroundingMessage(resource: ModuleSourceResource) {
  if (resource.extractionStatus === 'failed') {
    return `The app could not prepare a readable text view for this file this time.${resource.extractionError ? ` ${resource.extractionError}` : ''}`
  }

  if (resource.extractionStatus === 'unsupported') {
    return 'This file type is not readable in the current extraction pipeline, so the app is keeping the state explicit and linking back to Canvas.'
  }

  if (resource.extractionStatus === 'empty') {
    return 'The file was parsed, but no usable text was found, so the reader is falling back to metadata and module context only.'
  }

  if (resource.extractionStatus === 'pending') {
    return 'Extraction has not finished yet, so the reader is still waiting for usable file text.'
  }

  return 'No extraction evidence is available for this resource yet, so the app is not claiming to have read the document.'
}

function summarizeResource(sourceText: string, resource: ModuleSourceResource) {
  if (!sourceText.trim()) {
    return `No readable file text was extracted for ${resource.title}, so document-grounded analysis is not available yet.`
  }
  const sentences = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean)
  if (sentences.length > 0) {
    return sentences.slice(0, 2).join(' ')
  }
  return `The extracted text for ${resource.title} was too thin to support a confident document-grounded summary.`
}

function extractResourceConcepts(sourceText: string, resource: ModuleSourceResource) {
  if (!sourceText.trim()) return []
  const sentences = sourceText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((line) => line.length >= 28)
    .slice(0, 4)
  return sentences
}

function buildResourceCoreIdeas(resource: ModuleSourceResource, summary: string, concepts: string[]) {
  return uniqueLines([
    summary,
    ...concepts.slice(0, 3),
    resource.required ? `${resource.title} is marked required, so its core claims are worth active review.` : null,
  ], 4)
}

function buildResourceBreakdown(resource: ModuleSourceResource, sourceText: string) {
  const sentences = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter((line) => line.length >= 20)

  return uniqueLines([
    `First, identify the main claim or topic in ${resource.title}.`,
    sentences[0] ? `Then pin down the first concrete idea: ${sentences[0]}` : 'Then separate the first major idea from the examples or supporting details.',
    sentences[1] ? `Next, ask how this second part extends the first: ${sentences[1]}` : 'Next, ask how the later sections extend, justify, or apply that idea.',
    'Finish by writing the smallest possible outline that still shows the logic of the resource.',
  ], 4)
}

function buildResourceConnections(resource: ModuleSourceResource, module: Module) {
  return uniqueLines([
    resource.linkedContext ? `${resource.title} connects forward to ${resource.linkedContext}` : null,
    resource.moduleName ? `${resource.title} sits inside ${resource.moduleName}, which gives it a place in the larger module flow.` : `This resource supports the larger module ${module.title}.`,
    resource.whyItMatters ?? null,
  ], 4)
}

function buildResourceExamFocus(resource: ModuleSourceResource, concepts: string[]) {
  return uniqueLines([
    ...concepts.slice(0, 2).map((concept) => `Be ready to explain or apply: ${concept}`),
    resource.required ? 'Because this is marked required, definitions, distinctions, and repeated examples here are good test targets.' : 'Focus on ideas that can be explained, compared, or applied without reopening the resource.',
    resource.kind === 'practice_link' ? 'If this is a practice resource, the method it asks you to use is likely as important as the content itself.' : null,
  ], 4)
}

function buildResourceMisunderstandings(resource: ModuleSourceResource, sourceText: string) {
  const firstLine = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).find((line) => line.length >= 24)

  return uniqueLines([
    'Do not assume recognizing the wording means you understand the idea. Restate it without copying the phrasing.',
    firstLine ? `Do not over-focus on this single line without connecting it to the rest of ${resource.title}: ${firstLine}` : null,
    resource.kind === 'reference' ? 'Reference material can look simple; make sure you can use the definition, not just spot it.' : null,
    resource.kind === 'study_file' ? 'A file or slide deck can feel complete on its own, but the important move is extracting the structure, not rereading every sentence.' : null,
  ], 4)
}

function buildResourceDeepQuestions(resource: ModuleSourceResource, concepts: string[]) {
  return uniqueLines([
    ...concepts.slice(0, 3).map((concept) => `Why does "${concept}" matter in the logic of ${resource.title}?`),
    `What would be harder to do in this module if ${resource.title} were missing?`,
  ], 4)
}

function buildResourceAppliedPractice(resource: ModuleSourceResource) {
  return uniqueLines([
    `Create one short self-test question from ${resource.title} and answer it from memory.`,
    resource.kind === 'practice_link'
      ? 'Work through the practice step once, then explain why each move is needed.'
      : 'Turn the resource into a tiny example, comparison, or worked explanation.',
    resource.linkedContext ? `Use this resource to prepare for ${resource.linkedContext}` : 'Connect this resource to the next task or check-for-understanding step.',
  ], 4)
}

function buildResourceMemoryAnchors(resource: ModuleSourceResource, sourceText: string) {
  const anchorLine = sourceText.split(/(?<=[.!?])\s+/).map((part) => part.trim()).find((line) => line.length >= 20)

  return uniqueLines([
    `Anchor the title: ${resource.title}`,
    resource.required ? 'Anchor the fact that Canvas marks this resource as required.' : `Anchor the format: ${labelForKind(resource.kind)}`,
    anchorLine ? `Anchor phrase: ${anchorLine}` : null,
  ], 4)
}

function buildResourceWhyThisMatters(resource: ModuleSourceResource, module: Module) {
  return resource.whyItMatters
    ?? `${resource.title} matters because it carries part of the understanding load for ${module.title}. If you skip it, later tasks are more likely to feel disconnected or rushed.`
}

function buildResourceNextSteps(resource: ModuleSourceResource) {
  return uniqueLines([
    `Close ${resource.title} and write one sentence from memory about what it is trying to teach.`,
    'Turn the repeated ideas into 2 or 3 bullets you can review fast later.',
    resource.linkedContext ? `Open the linked task or follow-on item next: ${resource.linkedContext}` : 'Move to the next task or resource and carry forward one idea from this reading.',
  ], 4)
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

function getCanvasUrl(htmlUrl?: string | null, sourceUrl?: string | null, moduleUrl?: string | null) {
  return htmlUrl ?? sourceUrl ?? moduleUrl ?? null
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

function uniqueLines(lines: Array<string | null | undefined>, max = 4) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of lines) {
    const cleaned = line?.trim()
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push(cleaned)
    if (results.length >= max) break
  }

  return results
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

function adaptModuleWorkspaceRow(row: Record<string, unknown>): Module {
  return {
    id: String(row.id ?? ''),
    courseId: typeof row.course_id === 'string' ? row.course_id : undefined,
    title: typeof row.title === 'string' ? row.title : 'Untitled module',
    raw_content: typeof row.raw_content === 'string' ? row.raw_content : '',
    summary: typeof row.summary === 'string' ? row.summary : null,
    concepts: Array.isArray(row.concepts) ? row.concepts.filter((value): value is string => typeof value === 'string') : [],
    study_prompts: Array.isArray(row.study_prompts) ? row.study_prompts.filter((value): value is string => typeof value === 'string') : [],
    recommended_order: Array.isArray(row.recommended_order) ? row.recommended_order.filter((value): value is string => typeof value === 'string') : [],
    status: row.status === 'processed' || row.status === 'error' ? row.status : 'pending',
    order: typeof row.order === 'number' ? row.order : undefined,
    released_at: typeof row.released_at === 'string' ? row.released_at : undefined,
    estimated_minutes: typeof row.estimated_minutes === 'number' ? row.estimated_minutes : undefined,
    priority_signal: row.priority_signal === 'high' || row.priority_signal === 'medium' || row.priority_signal === 'low' ? row.priority_signal : undefined,
    showInLearn: typeof row.show_in_learn === 'boolean' ? row.show_in_learn : true,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function adaptTaskRow(row: Record<string, unknown>): Task {
  return {
    id: String(row.id ?? ''),
    module_id: typeof row.module_id === 'string' ? row.module_id : '',
    title: typeof row.title === 'string' ? row.title : 'Task',
    details: typeof row.details === 'string' ? row.details : null,
    deadline: typeof row.deadline === 'string' ? row.deadline : null,
    canvasUrl: typeof row.canvas_url === 'string' ? row.canvas_url : null,
    priority: row.priority === 'high' || row.priority === 'medium' || row.priority === 'low' ? row.priority : 'medium',
    status: row.status === 'completed' ? 'completed' : 'pending',
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function adaptDeadlineRow(row: Record<string, unknown>): Deadline {
  return {
    id: String(row.id ?? ''),
    module_id: typeof row.module_id === 'string' ? row.module_id : '',
    label: typeof row.label === 'string' ? row.label : 'Deadline',
    date: typeof row.date === 'string' ? row.date : new Date().toISOString(),
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  }
}

function adaptModuleResourceStudyStateRow(row: Record<string, unknown>): ModuleResourceStudyState {
  return {
    moduleId: String(row.module_id ?? ''),
    resourceId: typeof row.resource_id === 'string' ? row.resource_id : '',
    studyProgressStatus: normalizeStudyProgressStatus(row.study_progress_status),
    workflowOverride: normalizeWorkflowOverride(row.workflow_override),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
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

function normalizeStudyProgressStatus(value: unknown): StudyFileProgressStatus {
  return value === 'skimmed' || value === 'reviewed' || value === 'not_started'
    ? value
    : 'not_started'
}

function normalizeWorkflowOverride(value: unknown): ModuleResourceWorkflowOverride {
  return value === 'activity' || value === 'study'
    ? value
    : 'study'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingSchemaObjectError(error: { code?: string | null } | null | undefined) {
  return error?.code === 'PGRST205'
}
