import { getLearnResourceKindLabel, getStudySourceTypeLabel, isCanvasPageResourceType } from '@/lib/study-resource'
import type { ModuleSourceResource } from '@/lib/module-workspace'

export interface ManualCopyBundleSource {
  taskTitle: string
  courseName?: string | null
  moduleName?: string | null
  dueDate?: string | null
  taskType?: string | null
  taskDetails?: string | null
  resource?: Pick<
    ModuleSourceResource,
    | 'type'
    | 'kind'
    | 'contentType'
    | 'extension'
    | 'extractedText'
    | 'extractedTextPreview'
    | 'linkedContext'
    | 'whyItMatters'
    | 'dueDate'
  > | null
}

export interface ManualCopyBundleResult {
  bundleText: string
  promptText: string
  fallbackMode: 'full_context' | 'task_details' | 'preview_only' | 'limited_context'
}

type InstructionsSource =
  | 'resource_full'
  | 'task_details'
  | 'resource_preview'
  | 'linked_context'
  | 'why_it_matters'
  | 'title_only'

const EXTERNAL_AI_PROMPT = [
  'Based on the task above, help me start and complete it with the least friction.',
  'Give me:',
  '1. What should I do first?',
  '2. What am I trying to produce?',
  '3. Where do I start right now?',
  '4. What is the smallest meaningful next step?',
  '',
  'Ground the answer in the assignment/task instructions above.',
  'Do not give generic study advice if the task is already specific.',
  'Keep the response short, concrete, and output-oriented.',
].join('\n')

export function buildManualCopyBundle(source: ManualCopyBundleSource): ManualCopyBundleResult {
  const taskTitle = cleanInlineText(source.taskTitle) || 'Untitled task'
  const courseName = cleanInlineText(source.courseName) || 'None surfaced'
  const moduleName = cleanInlineText(source.moduleName) || 'None surfaced'
  const dueDate = formatDueDate(source.dueDate ?? source.resource?.dueDate ?? null)
  const typeLabel = resolveTypeLabel(source)
  const instructionsSelection = selectInstructions(source)
  const splitText = splitInstructionsAndRubric(instructionsSelection.text)
  const notes = buildUsefulNotes(source, instructionsSelection.source)

  const lines = [
    `Task title: ${taskTitle}`,
    `Course: ${courseName}`,
    `Module: ${moduleName}`,
    `Due date: ${dueDate}`,
    `Type: ${typeLabel}`,
    '',
    'Instructions:',
    splitText.instructions,
  ]

  if (splitText.rubric) {
    lines.push('', 'Criteria / rubric:', splitText.rubric)
  }

  if (notes.length > 0) {
    lines.push('', 'Notes:', ...notes.map((note) => `- ${note}`))
  }

  lines.push('', 'Prompt:', EXTERNAL_AI_PROMPT)

  return {
    bundleText: lines.join('\n'),
    promptText: EXTERNAL_AI_PROMPT,
    fallbackMode: labelFallbackMode(instructionsSelection.source),
  }
}

function selectInstructions(source: ManualCopyBundleSource): {
  text: string
  source: InstructionsSource
} {
  const taskDetails = cleanBlockText(source.taskDetails)
  const resourceText = cleanBlockText(source.resource?.extractedText)
  const resourcePreview = cleanBlockText(source.resource?.extractedTextPreview)
  const linkedContext = cleanBlockText(source.resource?.linkedContext)
  const whyItMatters = cleanBlockText(source.resource?.whyItMatters)

  if (shouldPreferResourceContext(source.resource) && resourceText) {
    return {
      text: resourceText,
      source: 'resource_full',
    }
  }

  if (taskDetails) {
    return {
      text: taskDetails,
      source: 'task_details',
    }
  }

  if (resourceText) {
    return {
      text: resourceText,
      source: 'resource_full',
    }
  }

  if (resourcePreview) {
    return {
      text: resourcePreview,
      source: 'resource_preview',
    }
  }

  if (linkedContext) {
    return {
      text: linkedContext,
      source: 'linked_context',
    }
  }

  if (whyItMatters) {
    return {
      text: whyItMatters,
      source: 'why_it_matters',
    }
  }

  return {
    text: `Full instructions were not available in Stay Focused when this was copied. The best surfaced detail is the task title: ${cleanInlineText(source.taskTitle) || 'Untitled task'}.`,
    source: 'title_only',
  }
}

function shouldPreferResourceContext(resource: ManualCopyBundleSource['resource']) {
  if (!resource) return false
  if (resource.kind === 'assignment' || resource.kind === 'discussion' || resource.kind === 'quiz') return true
  if (isCanvasPageResourceType(resource.type)) return true
  return resource.kind === 'reference'
}

function splitInstructionsAndRubric(text: string) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
  const instructionBlocks: string[] = []
  const rubricBlocks: string[] = []

  for (const block of blocks) {
    const inlineMatch = block.match(/^(rubric|criteria|grading criteria|grading rubric|assessment criteria|evaluation criteria|marks breakdown)\s*:\s*([\s\S]*)$/i)
    if (inlineMatch) {
      const body = inlineMatch[2].trim()
      if (body) {
        rubricBlocks.push(body)
      }
      continue
    }

    const lines = block.split('\n')
    const heading = lines[0]?.trim() ?? ''
    if (isRubricHeading(heading)) {
      const body = lines.slice(1).join('\n').trim()
      rubricBlocks.push(body || block)
      continue
    }

    instructionBlocks.push(block)
  }

  return {
    instructions: instructionBlocks.join('\n\n').trim() || text.trim(),
    rubric: rubricBlocks.join('\n\n').trim() || null,
  }
}

function buildUsefulNotes(source: ManualCopyBundleSource, instructionsSource: InstructionsSource) {
  const notes: string[] = []
  const dueDate = source.dueDate ?? source.resource?.dueDate ?? null

  if (isOverdue(dueDate)) {
    notes.push('This task appears overdue.')
  }

  if (
    instructionsSource === 'resource_preview'
    || instructionsSource === 'linked_context'
    || instructionsSource === 'why_it_matters'
    || instructionsSource === 'title_only'
  ) {
    notes.push('Full instructions were not available in Stay Focused when this was copied, so this uses the best surfaced task context.')
  }

  return notes
}

function resolveTypeLabel(source: ManualCopyBundleSource) {
  const explicitTaskType = cleanInlineText(source.taskType)
  if (explicitTaskType) {
    return labelTaskType(explicitTaskType)
  }

  const resource = source.resource
  if (resource) {
    if (resource.kind === 'study_file' || isCanvasPageResourceType(resource.type)) {
      return getStudySourceTypeLabel(resource)
    }

    return getLearnResourceKindLabel({
      kind: resource.kind,
      type: resource.type,
    })
  }

  return inferTaskTypeFromText(source.taskTitle, source.taskDetails)
}

function labelTaskType(value: string) {
  if (value === 'prep') return 'Prep'
  if (value === 'reading') return 'Reading'
  if (value === 'project') return 'Project'
  if (value === 'discussion') return 'Discussion'
  if (value === 'quiz') return 'Quiz'
  if (value === 'assignment') return 'Assignment'
  return capitalizeWords(value.replace(/[_-]+/g, ' '))
}

function inferTaskTypeFromText(title: string, details?: string | null) {
  const combined = `${title} ${details ?? ''}`.toLowerCase()

  if (combined.includes('discussion') || combined.includes('reply') || combined.includes('response')) return 'Discussion'
  if (combined.includes('quiz') || combined.includes('exam') || combined.includes('test')) return 'Quiz'
  if (combined.includes('project') || combined.includes('build') || combined.includes('implement')) return 'Project'
  if (combined.includes('read') || combined.includes('chapter') || combined.includes('article')) return 'Reading'
  if (combined.includes('prepare') || combined.includes('draft') || combined.includes('review')) return 'Prep'
  return 'Task'
}

function labelFallbackMode(source: InstructionsSource): ManualCopyBundleResult['fallbackMode'] {
  if (source === 'resource_full') return 'full_context'
  if (source === 'task_details') return 'task_details'
  if (source === 'resource_preview') return 'preview_only'
  return 'limited_context'
}

function cleanInlineText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function cleanBlockText(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function formatDueDate(value: string | null) {
  if (!value) return 'None surfaced'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const includesTime = /T\d{2}:\d{2}/.test(value)
  return new Intl.DateTimeFormat(undefined, includesTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  ).format(date)
}

function isOverdue(value: string | null) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

function isRubricHeading(value: string) {
  return /^(rubric|criteria|grading criteria|grading rubric|assessment criteria|evaluation criteria|marks breakdown)\s*:?\s*$/i.test(value)
}

function capitalizeWords(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase())
}
