import { buildTaskRequirementSummary, inferTaskTypeLabelFromText } from '@/lib/manual-copy-bundle'

/**
 * Task draft prompt builders and API payload helpers.
 */

export interface TaskDraftContext {
  taskTitle: string
  taskDetails: string | null
  /** ISO date string */
  deadline: string | null
  priority: 'high' | 'medium' | 'low' | null
  courseName: string
  moduleTitle: string | null
  studyPrompts?: string[] | null
  concepts?: string[] | null
  moduleSummary?: string | null
  resourceSnippet?: string | null
  canvasUrl?: string | null
  learnHref?: string | null
}

export interface TaskDraftResponse {
  requirementSummary: string
  draftOutput: string
  missingDetails: string
  paperAction: string
  smallestNextStep: string
}

export interface TaskDraftApiRequest {
  title: string
  course?: string
  module?: string
  dueDate?: string
  type?: string
  instructions: string
  requirements?: string[]
  sourceKey: string
}

export interface TaskDraftApiResponse {
  ok: true
  draft: TaskDraftResponse
  cacheStatus: 'hit' | 'miss'
}

export const TASK_DRAFT_SYSTEM_PROMPT = [
  'You are Stay Focused\'s task-completion assistant.',
  '',
  'Your job is to turn the following academic task into usable output immediately.',
  '',
  'Default to output-first behavior:',
  '- identify the most likely required deliverable from the task text',
  '- generate a strong first-pass version of that deliverable right away',
  '- do not begin with planning, explanation, or generic advice',
  '- do not rely on prior chat turns or surrounding conversation',
  '- if details are missing, make the safest minimal assumptions and label them clearly',
  '- after generating the output, briefly state what is still missing and what the student should do next on the actual paper or submission',
  '',
  'You are not a tutor, study coach, or motivator.',
  'Do not give study tips, productivity advice, or filler.',
  'Do not explain the lesson unless the task explicitly requires explanation.',
  'Prefer direct completion over guidance.',
  '',
  'When the deliverable is already explicit, answer in terms of what should be written, typed, structured, or submitted.',
  '',
  'Output exactly in this format:',
  '',
  '0. Requirement summary',
  '[one short grounded summary of what the following task requires]',
  '',
  '1. Draft output',
  '[generate the actual deliverable here]',
  '',
  '2. What is still missing or unclear?',
  '[only real missing or unclear details; if nothing blocks a first draft, say "None that block a first draft."]',
  '',
  '3. What should I do on the paper right now?',
  '[one short concrete action on the actual output]',
  '',
  '4. Smallest next step',
  '[one short concrete immediate next step]',
].join('\n')

export function buildTaskDraftFallback(ctx: TaskDraftContext): TaskDraftResponse {
  return buildHeuristicTaskDraft(buildTaskDraftRequestPayload(ctx))
}

export function buildTaskDraftRequestPayload(ctx: TaskDraftContext): TaskDraftApiRequest {
  const title = compactInlineText(ctx.taskTitle, 160) ?? ctx.taskTitle.trim()
  const instructions = buildTaskInstructions(ctx)
  const course = compactInlineText(ctx.courseName, 120)
  const moduleName = compactInlineText(ctx.moduleTitle, 160)
  const dueDate = compactInlineText(ctx.deadline, 80)
  const type = compactInlineText(
    inferTaskTypeLabelFromText(title, `${ctx.taskDetails ?? ''}\n${ctx.resourceSnippet ?? ''}`),
    60,
  )
  const requirements = buildTaskRequirementSummary({
    taskTitle: title,
    instructionText: instructions,
    dueDate: ctx.deadline,
  })

  return {
    title,
    ...(course ? { course } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(type ? { type } : {}),
    instructions,
    ...(requirements.length > 0 ? { requirements } : {}),
    sourceKey: buildTaskDraftSourceKey(ctx),
  }
}

export function buildTaskDraftUserPrompt(input: TaskDraftApiRequest) {
  return [
    'Use only the following task data in this request. Do not rely on any other chat context.',
    '',
    'Task data:',
    `Task title: ${input.title}`,
    `Course: ${input.course ?? 'None surfaced'}`,
    `Module: ${input.module ?? 'None surfaced'}`,
    `Due date: ${input.dueDate ?? 'None surfaced'}`,
    `Type: ${input.type ?? 'Task'}`,
    `Source key: ${input.sourceKey}`,
    '',
    'Instructions:',
    input.instructions,
    '',
    'Requirements:',
    input.requirements && input.requirements.length > 0
      ? input.requirements.map((requirement) => `- ${requirement}`).join('\n')
      : 'None derived from the available task text.',
    '',
    'Treat the following task as a real assignment with a concrete deliverable.',
    '',
    'Rules:',
    '- Ground the response strictly in the following task data.',
    '- Produce the likely deliverable immediately.',
    '- Make Draft output the primary action when the deliverable is clear.',
    '- Do not start with planning language.',
    '- Keep assumptions minimal and visible.',
    '- If the task is overdue, prioritize immediate completion language but do not lecture.',
    '- If something is unclear, do not stop; make the safest first-pass version possible.',
  ].join('\n')
}

export function buildTaskPromptBuildPreview(
  input: TaskDraftApiRequest,
  draft?: TaskDraftResponse,
) {
  const instructionFocus = buildTaskDraftContextText(input.instructions, 760)
    ?? 'No assignment instructions were surfaced.'
  const outputFocus = buildTaskDraftContextText(draft?.draftOutput, 520)
  const lines = [
    'mode: output-first academic draft generation',
    '',
    'task_context {',
    `  title: "${input.title}"`,
    `  course: "${input.course ?? 'None surfaced'}"`,
    `  module: "${input.module ?? 'None surfaced'}"`,
    `  due_date: "${input.dueDate ?? 'None surfaced'}"`,
    `  task_type: "${input.type ?? 'Task'}"`,
    `  source_key: "${input.sourceKey}"`,
    '}',
    '',
    'draft_rules {',
    '  - stay grounded in the surfaced assignment details',
    '  - generate the likely deliverable before explanation',
    '  - keep assumptions minimal and visible',
    '  - end with the smallest concrete next step',
    '}',
    '',
    'assignment_context <<',
    instructionFocus,
    '>>',
  ]

  if (input.requirements && input.requirements.length > 0) {
    lines.push('', 'derived_requirements {')
    for (const requirement of input.requirements.slice(0, 6)) {
      lines.push(`  - ${requirement}`)
    }
    lines.push('}')
  }

  if (draft) {
    lines.push(
      '',
      'draft_target {',
      `  requirement_summary: ${toPromptBuildInlineText(draft.requirementSummary, 220)}`,
      `  immediate_action: ${toPromptBuildInlineText(draft.smallestNextStep, 180)}`,
    )

    if (outputFocus) {
      lines.push('  primary_output <<', indentPromptBuildBlock(outputFocus), '  >>')
    }

    lines.push('}')
  }

  lines.push(
    '',
    'response_shape {',
    '  0. Requirement summary',
    '  1. Draft output',
    '  2. What is still missing or unclear?',
    '  3. What should I do on the paper right now?',
    '  4. Smallest next step',
    '}',
  )

  return lines.join('\n')
}

export function buildTaskDraftContextText(text: string | null | undefined, maxLength = 1600) {
  const normalized = cleanBlockText(text)
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized

  const clipped = normalized.slice(0, maxLength)
  const paragraphBreak = clipped.lastIndexOf('\n\n')
  if (paragraphBreak >= Math.floor(maxLength * 0.55)) {
    return `${clipped.slice(0, paragraphBreak).trimEnd()}\n\n...`
  }

  const sentenceBreak = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('? '), clipped.lastIndexOf('! '))
  if (sentenceBreak >= Math.floor(maxLength * 0.55)) {
    return `${clipped.slice(0, sentenceBreak + 1).trimEnd()}...`
  }

  return `${clipped.trimEnd()}...`
}

export function parseTaskDraftResponseText(content: string): TaskDraftResponse {
  const normalized = content.replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    throw new Error('Model returned an empty response')
  }

  const requirementSummary = extractNumberedSectionBody(normalized, '0. Requirement summary', '1. Draft output')
  const draftOutput = extractNumberedSectionBody(normalized, '1. Draft output', '2. What is still missing or unclear?')
  const missingDetails = extractNumberedSectionBody(normalized, '2. What is still missing or unclear?', '3. What should I do on the paper right now?')
  const paperAction = extractNumberedSectionBody(normalized, '3. What should I do on the paper right now?', '4. Smallest next step')
  const smallestNextStep = extractNumberedSectionBody(normalized, '4. Smallest next step')

  if (!draftOutput) {
    throw new Error('Model response did not include a Draft output section')
  }

  return normalizeTaskDraftResponse({
    requirementSummary,
    draftOutput,
    missingDetails,
    paperAction,
    smallestNextStep,
  })
}

export function isTaskDraftResponse(value: unknown): value is TaskDraftResponse {
  if (!isPlainRecord(value)) return false

  return typeof value.requirementSummary === 'string'
    && typeof value.draftOutput === 'string'
    && typeof value.missingDetails === 'string'
    && typeof value.paperAction === 'string'
    && typeof value.smallestNextStep === 'string'
}

export function isTaskDraftApiResponse(value: unknown): value is TaskDraftApiResponse {
  if (!isPlainRecord(value)) return false

  return value.ok === true
    && isTaskDraftResponse(value.draft)
    && (value.cacheStatus === 'hit' || value.cacheStatus === 'miss')
}

function buildTaskInstructions(ctx: TaskDraftContext) {
  const taskDetails = cleanBlockText(ctx.taskDetails)
  const resourceText = cleanBlockText(ctx.resourceSnippet)
  const moduleSummary = cleanBlockText(ctx.moduleSummary)

  if (resourceText && taskDetails) {
    const taskDetailsKey = normalizeComparisonText(taskDetails)
    const resourceKey = normalizeComparisonText(resourceText)

    if (resourceKey.includes(taskDetailsKey)) return resourceText
    if (taskDetailsKey.includes(resourceKey)) return taskDetails

    return [
      'Task details:',
      taskDetails,
      '',
      'Assignment context:',
      resourceText,
    ].join('\n')
  }

  if (resourceText) return resourceText
  if (taskDetails) return taskDetails
  if (moduleSummary) {
    return `Full task instructions were not available. Closest surfaced module context: ${moduleSummary}`
  }

  return `Full task instructions were not available. The best surfaced detail is the task title: ${ctx.taskTitle}.`
}

export function buildTaskDraftSourceKey(ctx: TaskDraftContext) {
  const canvasUrl = compactInlineText(ctx.canvasUrl, 400)
  if (canvasUrl) return `canvas:${canvasUrl}`

  const learnHref = compactInlineText(ctx.learnHref, 400)
  if (learnHref) return `learn:${learnHref}`

  const parts = [
    compactInlineText(ctx.courseName, 120) ?? 'course:none',
    compactInlineText(ctx.moduleTitle, 160) ?? 'module:none',
    compactInlineText(ctx.taskTitle, 160) ?? 'task:none',
  ]

  return `task:${parts.map((part) => normalizeComparisonText(part)).join('::')}`
}

function buildHeuristicTaskDraft(input: TaskDraftApiRequest): TaskDraftResponse {
  const requirements = parseRequirementSummary(input.requirements)
  const taskType = (input.type ?? inferTaskTypeLabelFromText(input.title, input.instructions)).toLowerCase()
  const requirementSummary = buildRequirementSummaryText(input, requirements)
  const draftOutput = buildDraftOutput(input, requirements, taskType)
  const missingDetails = buildMissingDetails(input, requirements, taskType)
  const paperAction = buildPaperAction(input, requirements, taskType)
  const smallestNextStep = buildSmallestNextStep(input, requirements, taskType)

  return normalizeTaskDraftResponse({
    requirementSummary,
    draftOutput,
    missingDetails,
    paperAction,
    smallestNextStep,
  })
}

function buildRequirementSummaryText(input: TaskDraftApiRequest, requirements: ParsedRequirementSummary) {
  const parts: string[] = []

  if (requirements.deliverable) {
    parts.push(`Deliverable: ${requirements.deliverable}.`)
  }

  if (requirements.requiredSections.length > 0) {
    parts.push(`Sections: ${requirements.requiredSections.join(', ')}.`)
  }

  if (requirements.quantity.length > 0) {
    parts.push(`Quantity: ${requirements.quantity.join('; ')}.`)
  }

  if (requirements.format.length > 0) {
    parts.push(`Format: ${requirements.format.join('; ')}.`)
  }

  if (requirements.urgency) {
    parts.push(`Urgency: ${requirements.urgency}.`)
  }

  if (parts.length === 0) {
    return `Produce the most likely ${input.type?.toLowerCase() ?? 'task'} deliverable using only the surfaced task details.`
  }

  return parts.join(' ')
}

function buildDraftOutput(
  input: TaskDraftApiRequest,
  requirements: ParsedRequirementSummary,
  taskType: string,
) {
  if (requirements.requiredSections.length > 0) {
    return buildSectionedDraft(input.title, requirements)
  }

  if (taskType.includes('discussion') || hasAnyPhrase(requirements.deliverable, ['response', 'reply', 'post'])) {
    return buildDiscussionDraft(input, requirements)
  }

  if (taskType.includes('quiz') || hasAnyPhrase(input.title, ['quiz', 'test', 'exam', 'midterm', 'final'])) {
    return [
      `${input.title}`,
      '',
      'Working answer sheet',
      '1. [Paste question 1 here]',
      'Answer: [Write the direct answer here.]',
      '',
      '2. [Paste question 2 here]',
      'Answer: [Write the direct answer here.]',
      '',
      '3. [Paste question 3 here]',
      'Answer: [Write the direct answer here.]',
    ].join('\n')
  }

  if (hasAnyPhrase(requirements.deliverable, ['slide', 'presentation', 'deck'])) {
    return buildSlideDraft(input)
  }

  if (taskType.includes('project') || hasAnyPhrase(requirements.deliverable, ['project', 'prototype', 'design', 'build'])) {
    return buildProjectDraft(input, requirements)
  }

  return buildWritingDraft(input, requirements)
}

function buildSectionedDraft(title: string, requirements: ParsedRequirementSummary) {
  const entriesPerSection = Math.min(Math.max(requirements.entriesPerSection ?? 3, 2), 5)
  const lines = [title, '']

  for (const section of requirements.requiredSections) {
    lines.push(section)

    const starterLines = buildSectionStarterLines(section, entriesPerSection)
    for (const starterLine of starterLines) {
      lines.push(starterLine)
    }

    lines.push('')
  }

  return lines.join('\n').trim()
}

function buildDiscussionDraft(input: TaskDraftApiRequest, requirements: ParsedRequirementSummary) {
  const lines = [input.title, '']
  const readingNeeded = requirements.quantity.some((entry) => /\breading example\b/i.test(entry))
  const lectureNeeded = requirements.quantity.some((entry) => /\blecture idea\b/i.test(entry))

  lines.push(`My main response is that [state your direct answer to ${input.title.toLowerCase()} here].`)

  if (readingNeeded) {
    lines.push('One reading example that supports this point is [insert the strongest reading example here].')
  }

  if (lectureNeeded) {
    lines.push('One lecture idea that connects to this response is [insert the matching lecture idea here].')
  }

  lines.push('Overall, this means [write the short takeaway you want to submit].')
  return lines.join('\n')
}

function buildSlideDraft(input: TaskDraftApiRequest) {
  return [
    `${input.title}`,
    '',
    'Slide 1: Title and main point',
    '- [State the topic clearly]',
    '- [Add the one-sentence takeaway]',
    '',
    'Slide 2: Core detail',
    '- [Add the strongest supporting detail]',
    '- [Explain why it matters]',
    '',
    'Slide 3: Example or evidence',
    '- [Insert one concrete example]',
    '- [Connect it back to the main point]',
    '',
    'Slide 4: Closing',
    '- [State the final takeaway or recommendation]',
  ].join('\n')
}

function buildProjectDraft(input: TaskDraftApiRequest, requirements: ParsedRequirementSummary) {
  return [
    `${input.title}`,
    '',
    'Project goal',
    `Create ${requirements.deliverable ?? 'the required submission'} in a form that can be turned in quickly.`,
    '',
    'Core structure',
    '- Goal: [state what the finished output should do]',
    '- Main part 1: [add the first required piece]',
    '- Main part 2: [add the next required piece]',
    '- Final result: [state what will be submitted]',
  ].join('\n')
}

function buildWritingDraft(input: TaskDraftApiRequest, requirements: ParsedRequirementSummary) {
  const focus = extractFocusPhrase(input.title)
  const deliverable = requirements.deliverable ?? 'the assignment'

  return [
    `${input.title}`,
    '',
    `This first draft addresses ${focus} by directly working toward ${deliverable}.`,
    `My main point is that [write the clearest answer or thesis for ${focus} here].`,
    `The strongest supporting detail is [insert the best example, source, or observation from the task here].`,
    `This matters because [explain the result, interpretation, or takeaway the assignment needs].`,
    `Overall, [write the short closing sentence you can submit or expand].`,
  ].join('\n')
}

function buildMissingDetails(
  input: TaskDraftApiRequest,
  requirements: ParsedRequirementSummary,
  taskType: string,
) {
  const missingDetails: string[] = []

  if (/full task instructions were not available/i.test(input.instructions)) {
    missingDetails.push('Full task instructions were not surfaced, so this stays conservative and title-grounded.')
  }

  if ((taskType.includes('discussion') || taskType.includes('quiz')) && !hasConcretePromptText(input.instructions)) {
    missingDetails.push(`The exact ${taskType.includes('quiz') ? 'question text' : 'prompt wording'} was not visible.`)
  }

  if (requirements.requiredSections.length === 0 && !requirements.deliverable) {
    missingDetails.push('The specific deliverable was not explicit.')
  }

  return missingDetails.length > 0
    ? missingDetails.join(' ')
    : 'None that block a first draft.'
}

function buildPaperAction(
  input: TaskDraftApiRequest,
  requirements: ParsedRequirementSummary,
  taskType: string,
) {
  if (requirements.requiredSections.length > 0) {
    return `Write the heading "${requirements.requiredSections[0]}" and add the first ${requirements.entriesPerSection ?? 3} entries under it.`
  }

  if (taskType.includes('discussion')) {
    return 'Write the first sentence of the response exactly as your main answer to the prompt.'
  }

  if (taskType.includes('quiz')) {
    return 'Write or paste the first question, then place a direct answer under it.'
  }

  return `Write the first two lines of the draft for "${input.title}" exactly on the paper or submission.`
}

function buildSmallestNextStep(
  input: TaskDraftApiRequest,
  requirements: ParsedRequirementSummary,
  taskType: string,
) {
  if (requirements.requiredSections.length > 1) {
    return `Finish the first entry under "${requirements.requiredSections[0]}", then move to "${requirements.requiredSections[1]}".`
  }

  if (taskType.includes('discussion')) {
    return 'Replace the first placeholder with one real course example.'
  }

  if (taskType.includes('quiz')) {
    return 'Answer the first question in one direct sentence.'
  }

  return `Replace the first placeholder in the draft for "${input.title}" with a real detail from the task.`
}

function normalizeTaskDraftResponse(value: TaskDraftResponse): TaskDraftResponse {
  return {
    requirementSummary: cleanSectionText(value.requirementSummary) || 'Use only the surfaced task details to produce the most likely deliverable.',
    draftOutput: cleanSectionText(value.draftOutput),
    missingDetails: cleanSectionText(value.missingDetails) || 'None that block a first draft.',
    paperAction: cleanSectionText(value.paperAction) || 'Write the first concrete line of the deliverable now.',
    smallestNextStep: cleanSectionText(value.smallestNextStep) || 'Replace one placeholder with a real task detail.',
  }
}

function parseRequirementSummary(requirements: string[] | undefined): ParsedRequirementSummary {
  const parsed: ParsedRequirementSummary = {
    requiredSections: [],
    quantity: [],
    format: [],
    entriesPerSection: null,
    deliverable: null,
    urgency: null,
  }

  for (const requirement of requirements ?? []) {
    if (requirement.startsWith('Deliverable: ')) {
      parsed.deliverable = requirement.slice('Deliverable: '.length).trim() || null
      continue
    }

    if (requirement.startsWith('Required sections: ')) {
      parsed.requiredSections = requirement
        .slice('Required sections: '.length)
        .split(',')
        .map((section) => section.trim())
        .filter(Boolean)
      continue
    }

    if (requirement.startsWith('Quantity: ')) {
      parsed.quantity = requirement
        .slice('Quantity: '.length)
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
      parsed.entriesPerSection = extractEntriesPerSection(parsed.quantity.join('; '))
      continue
    }

    if (requirement.startsWith('Format / material: ')) {
      parsed.format = requirement
        .slice('Format / material: '.length)
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
      continue
    }

    if (requirement.startsWith('Urgency: ')) {
      parsed.urgency = requirement.slice('Urgency: '.length).trim() || null
    }
  }

  return parsed
}

function extractNumberedSectionBody(text: string, heading: string, nextHeading?: string) {
  const escapedHeading = escapeRegExp(heading)
  const escapedNextHeading = nextHeading ? `\\n{2,}${escapeRegExp(nextHeading)}\\s*\\n` : '$'
  const match = text.match(new RegExp(`${escapedHeading}\\s*\\n([\\s\\S]*?)(?=${escapedNextHeading})`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function buildSectionStarterLines(section: string, count: number) {
  const normalizedSection = normalizeComparisonText(section)
  const starters = SECTION_STARTERS[normalizedSection] ?? []

  return Array.from({ length: count }, (_, index) => {
    const starter = starters[index]
    if (starter) return `${index + 1}. ${starter}`
    return `${index + 1}. [Add ${section.toLowerCase()} point ${index + 1} here.]`
  })
}

function extractEntriesPerSection(value: string) {
  const match = value.match(/\b(one|two|three|four|five|six|\d+)\s+(?:entry|entries|bullet|bullets|point|points|idea|ideas)\s+per\s+(?:section|category|part|heading)\b/i)
  if (!match?.[1]) return null

  const word = match[1].toLowerCase()
  if (/^\d+$/.test(word)) return Number(word)

  return NUMBER_WORDS[word] ?? null
}

function extractFocusPhrase(title: string) {
  const cleaned = cleanInlineText(
    title
      .replace(/\b(assignment|discussion|response|reply|post|task|activity|essay|paper|report|project|draft)\b/gi, '')
      .replace(/\s+/g, ' '),
  )

  return cleaned ? `"${cleaned}"` : 'the following task'
}

function hasConcretePromptText(text: string) {
  return text.trim().length >= 80 && !/full task instructions were not available/i.test(text)
}

function hasAnyPhrase(value: string | null | undefined, phrases: string[]) {
  const normalized = normalizeComparisonText(value)
  return phrases.some((phrase) => normalized.includes(normalizeComparisonText(phrase)))
}

function cleanSectionText(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function compactInlineText(value: string | null | undefined, maxLength: number) {
  const normalized = cleanInlineText(value)
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

function cleanInlineText(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function cleanBlockText(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function normalizeComparisonText(value: string | null | undefined) {
  return cleanInlineText(value).toLowerCase()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function indentPromptBuildBlock(value: string) {
  return value
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

function toPromptBuildInlineText(value: string | null | undefined, maxLength: number) {
  return compactInlineText(value, maxLength) ?? 'None surfaced.'
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface ParsedRequirementSummary {
  deliverable: string | null
  requiredSections: string[]
  quantity: string[]
  format: string[]
  urgency: string | null
  entriesPerSection: number | null
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
}

const SECTION_STARTERS: Record<string, string[]> = {
  expectations: [
    'I expect to stay on schedule by checking the course at the start of each week.',
    'I expect to read the task instructions before I begin writing or submitting anything.',
    'I expect to finish the hardest part of each task before the due date.',
    'I expect to ask for clarification early if the instructions are unclear.',
    'I expect to review my work once before I submit it.',
  ],
  contributions: [
    'I will contribute by showing up prepared for class tasks and discussions.',
    'I will contribute by submitting work on time whenever possible.',
    'I will contribute by participating respectfully and staying engaged with the course.',
    'I will contribute by keeping my notes, files, and tasks organized.',
    'I will contribute by following the task directions as closely as I can.',
  ],
  motivations: [
    'I want to build stronger habits that help me finish work with less last-minute stress.',
    'I want to improve my understanding of the course through consistent effort.',
    'I want to submit cleaner work that reflects what I actually know.',
    'I want to stay accountable so overdue work does not pile up.',
    'I want to leave the course with skills I can use outside class.',
  ],
  hindrances: [
    'A major risk is delaying the start when the task feels unclear or large.',
    'I can lose time when I switch between too many tasks at once.',
    'I sometimes wait too long before asking for help or checking the instructions again.',
    'I can fall behind when I underestimate how long writing or revision will take.',
    'Distractions and inconsistent routines can make it harder to finish on time.',
  ],
}
