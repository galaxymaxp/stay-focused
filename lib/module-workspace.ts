import { supabase } from '@/lib/supabase'
import type { Deadline, Module, Task } from '@/lib/types'

export interface ModuleWorkspaceData {
  module: Module
  tasks: Task[]
  deadlines: Deadline[]
}

export interface LearnSection {
  id: string
  title: string
  body: string
}

export interface ModuleSourceResource {
  id: string
  title: string
  type: string
  required: boolean
  moduleName: string | null
  category: 'assignment' | 'announcement' | 'resource'
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
  audit: LearnAudit
}

export async function getModuleWorkspace(id: string): Promise<ModuleWorkspaceData | null> {
  if (!supabase) return null

  const { data: module } = await supabase.from('modules').select('*').eq('id', id).single()
  if (!module) return null

  const { data: tasks } = await supabase.from('tasks').select('*').eq('module_id', id).order('created_at')
  const { data: deadlines } = await supabase.from('deadlines').select('*').eq('module_id', id).order('date')

  return {
    module,
    tasks: (tasks ?? []) as Task[],
    deadlines: (deadlines ?? []) as Deadline[],
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
  options?: { taskCount?: number; deadlineCount?: number },
): LearnExperience {
  const cleanLines = sanitizeRawContent(module.raw_content)
  const readingBlocks = groupReadingBlocks(cleanLines)
  const parsed = parseCompiledCanvasContent(module.raw_content)
  const resources = buildSourceResources(parsed)
  const fileResources = resources.filter((resource) => isFileBasedResourceType(resource.type))
  const conceptLines = (module.concepts ?? []).filter(Boolean).slice(0, 6)
  const summary = module.summary?.trim() || buildSummaryFallback(parsed, resources, readingBlocks)
  const simplifiedExplanation = simplifySummary(summary || 'This module has been turned into a calmer study view so you can understand it before you act on it.')
  const memorizeLines = buildMemorizeLines(parsed, resources, options?.deadlineCount ?? 0)
  const studySteps = buildStudySteps(resources, options?.taskCount ?? 0, fileResources.length)
  const reviewPrompts = buildReviewPrompts(module, conceptLines, resources)
  const keyConcepts = conceptLines.length > 0
    ? conceptLines
    : buildKeyConceptFallback(parsed, resources, readingBlocks)
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
      type: 'Assignment',
      required: Boolean(assignment.due),
      moduleName: null,
      category: 'assignment' as const,
    })),
    ...parsed.announcements.map((announcement, index) => ({
      id: `announcement-${index + 1}`,
      title: announcement.title,
      type: 'Announcement',
      required: false,
      moduleName: null,
      category: 'announcement' as const,
    })),
    ...parsed.modules.flatMap((moduleGroup, moduleIndex) =>
      moduleGroup.items.map((item, itemIndex) => ({
        id: `resource-${moduleIndex + 1}-${itemIndex + 1}`,
        title: item.title,
        type: item.type,
        required: item.required,
        moduleName: moduleGroup.name,
        category: 'resource' as const,
      }))
    ),
  ]
}

function buildSummaryFallback(
  parsed: ParsedCanvasContent,
  resources: ModuleSourceResource[],
  readingBlocks: string[],
) {
  const fileCount = resources.filter((resource) => isFileBasedResourceType(resource.type)).length
  const assignmentCount = parsed.assignments.length
  const announcementCount = parsed.announcements.length
  const resourceCount = parsed.modules.reduce((total, module) => total + module.items.length, 0)

  if (fileCount > 0) {
    return `This looks like a file-heavy Canvas module with ${fileCount} linked file resource${fileCount === 1 ? '' : 's'}, ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'}, and ${announcementCount} recent announcement${announcementCount === 1 ? '' : 's'}. The sync captured the file titles and surrounding task context, so this view turns them into a guided study pass even when the original PDF or slide text was not extracted.`
  }

  if (resourceCount > 0 || assignmentCount > 0) {
    return `This module combines ${assignmentCount} assignment${assignmentCount === 1 ? '' : 's'} and ${resourceCount} structured learning resource${resourceCount === 1 ? '' : 's'} into one calmer study view. Use it to understand the material first, then switch into Do only when you are ready to act.`
  }

  return readingBlocks[0] ?? 'This module has been reshaped into a simpler study view so the key ideas and next moves are easier to grasp.'
}

function buildKeyConceptFallback(
  parsed: ParsedCanvasContent,
  resources: ModuleSourceResource[],
  readingBlocks: string[],
) {
  const concepts = [
    ...parsed.modules.map((moduleGroup) => `${moduleGroup.name}: ${moduleGroup.items.slice(0, 2).map((item) => item.title).join(', ')}`),
    ...resources.filter((resource) => resource.category === 'assignment').slice(0, 2).map((resource) => `Assignment focus: ${resource.title}`),
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

  const lines = [
    ...dueLines,
    ...requiredResources.map((resource) => `Required resource: ${resource}`),
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
  const firstAssignment = resources.find((resource) => resource.category === 'assignment')

  const steps = [
    fileResourceCount > 0
      ? `Start with the file-based resources first${firstFile ? `, beginning with "${firstFile.title}"` : ''}, and turn each file title into a short note about what it probably covers.`
      : 'Start with the summary and key concepts so the module has a clear shape before you dive into details.',
    resources.length > 0
      ? 'Move through the resource list in order and write one sentence per item about what it seems to contribute.'
      : 'Pull out the repeated ideas and examples before switching into task mode.',
    firstAssignment
      ? `After that, connect the learning material back to "${firstAssignment.title}" so the assignment feels anchored to the content.`
      : `After the understanding pass, switch to Do and decide which of the ${taskCount} extracted task${taskCount === 1 ? '' : 's'} should move next.`,
  ]

  return steps
}

function buildReviewPrompts(module: Module, conceptLines: string[], resources: ModuleSourceResource[]) {
  const prompts = (module.study_prompts ?? []).filter(Boolean).slice(0, 5)
  if (prompts.length > 0) return prompts

  const seeds = conceptLines.length > 0
    ? conceptLines
    : resources.slice(0, 4).map((resource) => resource.title)

  if (seeds.length === 0) {
    return ['How would you explain this module to a classmate in under one minute?']
  }

  return seeds.slice(0, 4).map((seed) => `Explain "${seed}" in your own words, then say why it probably matters for the next task.`)
}

function buildLearnAudit(module: Module, resources: ModuleSourceResource[], fileResources: ModuleSourceResource[]): LearnAudit {
  const hasFileBasedResources = fileResources.length > 0
  const hasStructuredExtraction = Boolean(module.summary?.trim()) || (module.concepts?.length ?? 0) > 0 || (module.study_prompts?.length ?? 0) > 0
  const missingFileExtraction = hasFileBasedResources && !hasStructuredExtraction

  return {
    hasFileBasedResources,
    fileResourceCount: fileResources.length,
    missingFileExtraction,
    note: missingFileExtraction
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
