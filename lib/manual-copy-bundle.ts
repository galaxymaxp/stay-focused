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
  'Treat the task above as a real assignment with a concrete deliverable.',
  '',
  'First, infer the actual requirements from the task:',
  '- what must be produced',
  '- required sections or categories',
  '- quantity required',
  '- material or format constraints',
  '- any urgency that affects what to do next',
  '',
  'Then return exactly these five parts:',
  '',
  '0. Requirement summary',
  '1. What should I do first?',
  '2. What am I trying to produce?',
  '3. Where do I start right now?',
  '4. What is the smallest meaningful next step?',
  '',
  'Rules:',
  '- Ground every answer in the task above.',
  '- Focus on completing the actual deliverable, not reviewing the subject.',
  '- Do not give generic study advice, filler, or motivation tips.',
  '- Prefer direct action on the output over setup advice unless setup is required first.',
  '- Keep each answer short, concrete, and non-repetitive.',
  '- If the task is overdue, mention it briefly only if it changes the next step.',
  '- If a detail is missing or unclear, say that briefly instead of inventing it.',
].join('\n')

export function buildManualCopyBundle(source: ManualCopyBundleSource): ManualCopyBundleResult {
  const taskTitle = cleanInlineText(source.taskTitle) || 'Untitled task'
  const courseName = cleanInlineText(source.courseName) || 'None surfaced'
  const moduleName = cleanInlineText(source.moduleName) || 'None surfaced'
  const resolvedDueDate = source.dueDate ?? source.resource?.dueDate ?? null
  const dueDate = formatDueDate(resolvedDueDate)
  const typeLabel = resolveTypeLabel(source)
  const instructionsSelection = selectInstructions(source)
  const requirements = buildTaskRequirementSummary({
    taskTitle,
    instructionText: instructionsSelection.text,
    dueDate: resolvedDueDate,
  })
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

  if (requirements.length > 0) {
    lines.push('', 'Requirements:', ...requirements.map((requirement) => `- ${requirement}`))
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

export function buildTaskRequirementSummary(input: {
  taskTitle: string
  instructionText: string
  dueDate: string | null
}) {
  const deliverable = deriveDeliverable(input.instructionText)
  const requiredSections = deriveRequiredSections(input.instructionText)
  const quantities = deriveQuantityRequirements(input.instructionText)
    .filter((quantity) => {
      if (!deliverable) return true
      const quantityKey = normalizeRequirementComparison(quantity)
      const deliverableKey = normalizeRequirementComparison(deliverable)
      return !deliverableKey.includes(quantityKey)
    })
  const formatConstraints = deriveFormatConstraints(input.instructionText)
  const urgency = buildUrgencyRequirement(input.dueDate)
  const lines: string[] = []

  if (deliverable) {
    lines.push(`Deliverable: ${deliverable}`)
  }

  if (requiredSections.length > 0) {
    lines.push(`Required sections: ${requiredSections.join(', ')}`)
  }

  if (quantities.length > 0) {
    lines.push(`Quantity: ${quantities.join('; ')}`)
  }

  if (formatConstraints.length > 0) {
    lines.push(`Format / material: ${formatConstraints.join('; ')}`)
  }

  if (urgency) {
    lines.push(`Urgency: ${urgency}`)
  }

  return lines
}

function deriveDeliverable(text: string) {
  const candidates = [
    ...extractMeaningfulLines(text),
    ...extractSentences(text),
  ]
  const patterns = [
    /\b(?:write|create|complete|submit|post|upload|prepare|draft|record|fill out|turn in|build|design|develop)\b\s+([^.!?\n]+)/i,
    /\b(?:respond to|reply to)\b\s+([^.!?\n]+)/i,
  ]

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern)
      const phrase = normalizeDeliverable(match?.[1] ?? '')
      if (phrase) {
        return phrase
      }
    }
  }

  return null
}

function deriveRequiredSections(text: string) {
  const lines = text.split('\n')
  const collected: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = cleanInlineText(lines[index])
    if (!line) continue

    const inlineMatch = line.match(/(?:required sections?|sections?|categories?|parts?|headings?)\s*:\s*(.+)$/i)
      ?? line.match(/include the following (?:sections?|categories?|parts?|headings?)\s*:\s*(.+)$/i)
    if (inlineMatch?.[1]) {
      collected.push(...splitRequirementList(trimRequirementClause(inlineMatch[1])))
      continue
    }

    if (
      /^(?:required sections?|sections?|categories?|parts?|headings?)\s*:?\s*$/i.test(line)
      || /include the following (?:sections?|categories?|parts?|headings?)\s*:?\s*$/i.test(line)
    ) {
      const following: string[] = []

      for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
        const nextLine = cleanInlineText(lines[nextIndex])
        if (!nextLine) break
        if (looksLikeStructuralLabel(nextLine)) break
        following.push(nextLine.replace(/^[-*•]\s*/, ''))
        if (following.length >= 8) break
      }

      collected.push(...following)
    }
  }

  return uniqueRequirementItems(collected, 6)
}

function deriveQuantityRequirements(text: string) {
  const matches: string[] = []
  const patterns = [
    /\b\d+\s*-\s*\d+\s+(?:word|words|page|pages|paragraph|paragraphs|sentence|sentences|entry|entries|bullet|bullets|source|sources|example|examples|response|responses|post|posts|slide|slides|question|questions)\b(?:\s+per\s+(?:section|category|part|heading))?/gi,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z]+\s+){0,2}(?:word|words|page|pages|paragraph|paragraphs|sentence|sentences|entry|entries|bullet|bullets|source|sources|example|examples|response|responses|post|posts|slide|slides|question|questions|idea|ideas)\b(?:\s+per\s+(?:section|category|part|heading))?/gi,
    /\b(?:at least|minimum of|no more than|up to)\s+\d+\s+(?:word|words|page|pages|paragraph|paragraphs|sentence|sentences|entry|entries|bullet|bullets|source|sources|example|examples|response|responses|post|posts|slide|slides|question|questions)\b/gi,
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:[a-z]+\s+){0,2}(?:entry|entries|bullet|bullets|source|sources|example|examples|response|responses|idea|ideas)\s+per\s+(?:section|category|part|heading)\b/gi,
  ]

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = normalizeRequirementPhrase(match[0])
      if (cleaned) {
        matches.push(cleaned)
      }
    }
  }

  return uniqueRequirementItems(matches, 4)
}

function deriveFormatConstraints(text: string) {
  const constraints: string[] = []
  const lines = extractMeaningfulLines(text)

  for (const line of lines) {
    const submissionMatch = line.match(/^submission types?\s*:\s*(.+)$/i)
    if (submissionMatch?.[1]) {
      constraints.push(humanizeSubmissionTypes(submissionMatch[1]))
    }
  }

  const phrasePatterns = [
    /\bhandwritten\b[^.!?\n]*/gi,
    /\btyped\b[^.!?\n]*/gi,
    /\bdouble-spaced\b[^.!?\n]*/gi,
    /\bsingle-spaced\b[^.!?\n]*/gi,
    /\bon\s+(?:one\s+whole\s+)?[a-z]+\s+(?:sheet of paper|paper)\b[^.!?\n]*/gi,
    /\b(?:yellow|blue|lined|blank)\s+paper\b[^.!?\n]*/gi,
    /\bonline text entry\b/gi,
    /\bfile upload\b/gi,
    /\bdiscussion board\b/gi,
    /\bpdf(?:\s+file|\s+format)?\b/gi,
    /\bdocx(?:\s+file)?\b/gi,
    /\bslide deck\b/gi,
    /\bvideo\b(?:\s+submission)?/gi,
    /\baudio\b(?:\s+submission)?/gi,
    /\bapa\b(?:\s+\d+(?:th|st|nd|rd)\s+edition)?/gi,
    /\bmla\b/gi,
  ]

  for (const pattern of phrasePatterns) {
    for (const match of text.matchAll(pattern)) {
      const cleaned = normalizeRequirementPhrase(match[0])
      if (cleaned) {
        constraints.push(cleaned)
      }
    }
  }

  return uniqueRequirementItems(constraints, 4)
}

function buildUrgencyRequirement(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const daysUntil = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'due today'
  if (daysUntil === 1) return 'due tomorrow'
  return null
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

  return inferTaskTypeLabelFromText(source.taskTitle, source.taskDetails)
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

export function inferTaskTypeLabelFromText(title: string, details?: string | null) {
  const combined = `${title} ${details ?? ''}`.toLowerCase()

  if (combined.includes('discussion') || combined.includes('reply') || combined.includes('response')) return 'Discussion'
  if (combined.includes('quiz') || combined.includes('exam') || combined.includes('test')) return 'Quiz'
  if (combined.includes('project') || combined.includes('build') || combined.includes('implement')) return 'Project'
  if (combined.includes('assignment') || combined.includes('submit') || combined.includes('write') || combined.includes('essay') || combined.includes('paper') || combined.includes('worksheet') || combined.includes('contract')) return 'Assignment'
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

function extractMeaningfulLines(text: string) {
  return text
    .split('\n')
    .map((line) => cleanInlineText(line))
    .filter((line) => line.length > 0 && !looksLikeStructuralLabel(line))
}

function extractSentences(text: string) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => cleanInlineText(sentence))
    .filter((sentence) => sentence.length >= 18)
}

function normalizeDeliverable(value: string) {
  const compact = cleanInlineText(value)
    .replace(/\b(?:that|which|using|with|including|include|so that)\b.*$/i, '')
    .replace(/\b(?:on|via)\s+(?:canvas|the discussion board|online text entry|file upload)\b.*$/i, '')
    .replace(/[,:;]+$/g, '')
    .trim()

  if (!compact) return null
  if (compact.length < 4 || compact.length > 120) return null
  if (/^(expectations|contributions|motivations|hindrances|instructions)$/i.test(compact)) return null
  return compact
}

function splitRequirementList(value: string) {
  return value
    .split(/,|;|\band\b/gi)
    .map((item) => cleanInlineText(item.replace(/^[-*•]\s*/, '')))
    .filter((item) => item.length > 1 && item.length <= 60 && !looksLikeStructuralLabel(item))
}

function humanizeSubmissionTypes(value: string) {
  return cleanInlineText(value)
    .split(/,|;/)
    .map((item) => item.trim().replace(/_/g, ' '))
    .filter(Boolean)
    .join(', ')
}

function normalizeRequirementPhrase(value: string) {
  return cleanInlineText(
    value
      .replace(/^submission types?\s*:\s*/i, '')
      .replace(/^[-*•]\s*/, '')
      .replace(/[.:;,]+$/g, ''),
  )
}

function uniqueRequirementItems(values: string[], maxItems: number) {
  const results: string[] = []

  for (const value of values) {
    const cleaned = normalizeRequirementPhrase(value)
    if (!cleaned) continue
    const key = normalizeRequirementComparison(cleaned)
    let merged = false

    for (let index = 0; index < results.length; index += 1) {
      const existingKey = normalizeRequirementComparison(results[index])

      if (existingKey === key || existingKey.includes(key)) {
        merged = true
        break
      }

      if (key.includes(existingKey)) {
        results[index] = cleaned
        merged = true
        break
      }
    }

    if (merged) continue

    results.push(cleaned)
    if (results.length >= maxItems) {
      return results
    }
  }

  return results
}

function trimRequirementClause(value: string) {
  return value.replace(/[.!?].*$/, '').trim()
}

function normalizeRequirementComparison(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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

function looksLikeStructuralLabel(value: string) {
  return /^(assignment|instructions|submission types|rubric|criteria|grading criteria|grading rubric|assessment criteria|evaluation criteria|marks breakdown|discussion|prompt|page content)\s*:?\s*$/i.test(value)
}

function isRubricHeading(value: string) {
  return /^(rubric|criteria|grading criteria|grading rubric|assessment criteria|evaluation criteria|marks breakdown)\s*:?\s*$/i.test(value)
}

function capitalizeWords(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase())
}
