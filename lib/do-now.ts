/**
 * Do Now activity prompt builders and API payload helpers.
 */

export interface DoNowContext {
  taskTitle: string
  taskDetails: string | null
  /** ISO date string */
  deadline: string | null
  priority: 'high' | 'medium' | 'low' | null
  courseName: string
  moduleTitle: string | null
  /** From module.study_prompts, AI-generated at sync time */
  studyPrompts?: string[] | null
  /** From module.concepts */
  concepts?: string[] | null
  moduleSummary?: string | null
  resourceSnippet?: string | null
  canvasUrl?: string | null
  learnHref?: string | null
}

export interface DoNowPrompt {
  /** What should I do first? */
  whatFirst: string
  /** What am I trying to produce? */
  whatToProduce: string
  /** Where do I start right now? */
  whereToStart: string
  /** What is the smallest meaningful next step? */
  smallestStep: string
  /** Urgency note to show at the top, if deadline is close */
  urgencyNote: string | null
}

export interface DoNowApiRequest {
  taskTitle: string
  taskDetails?: string
  courseName?: string
  moduleTitle?: string
  moduleSummary?: string
  concepts?: string[]
  studyPrompts?: string[]
  deadline?: string
  resourceSnippet?: string
}

export function buildDoNowPrompt(ctx: DoNowContext): DoNowPrompt {
  return {
    urgencyNote: buildUrgencyNote(ctx),
    whatFirst: buildWhatFirst(ctx),
    whatToProduce: buildWhatToProduce(ctx),
    whereToStart: buildWhereToStart(ctx),
    smallestStep: buildSmallestStep(ctx),
  }
}

export function buildDoNowRequestPayload(ctx: DoNowContext): DoNowApiRequest {
  const taskTitle = compactOptionalText(ctx.taskTitle, 160) ?? ctx.taskTitle.trim()
  const taskDetails = compactOptionalText(ctx.taskDetails, 700)
  const courseName = compactOptionalText(ctx.courseName, 120)
  const moduleTitle = compactOptionalText(ctx.moduleTitle, 160)
  const moduleSummary = compactOptionalText(ctx.moduleSummary, 360)
  const concepts = compactTextList(ctx.concepts, 6, 80)
  const studyPrompts = compactTextList(ctx.studyPrompts, 4, 160)
  const deadline = compactOptionalText(ctx.deadline, 80)
  const resourceSnippet = buildDoNowResourceSnippet(ctx.resourceSnippet)

  return {
    taskTitle,
    ...(taskDetails ? { taskDetails } : {}),
    ...(courseName ? { courseName } : {}),
    ...(moduleTitle ? { moduleTitle } : {}),
    ...(moduleSummary ? { moduleSummary } : {}),
    ...(concepts.length > 0 ? { concepts } : {}),
    ...(studyPrompts.length > 0 ? { studyPrompts } : {}),
    ...(deadline ? { deadline } : {}),
    ...(resourceSnippet ? { resourceSnippet } : {}),
  }
}

export function buildDoNowResourceSnippet(text: string | null | undefined, maxLength = 280) {
  return compactOptionalText(text, maxLength)
}

export function isDoNowPrompt(value: unknown): value is DoNowPrompt {
  if (!isPlainRecord(value)) return false

  return typeof value.whatFirst === 'string'
    && typeof value.whatToProduce === 'string'
    && typeof value.whereToStart === 'string'
    && typeof value.smallestStep === 'string'
    && (typeof value.urgencyNote === 'string' || value.urgencyNote === null)
}

function buildWhatFirst(ctx: DoNowContext): string {
  const firstPrompt = ctx.studyPrompts?.find((prompt) => prompt.trim().length > 0)
  if (firstPrompt) return trimToSentence(firstPrompt, 220)

  const firstSentence = firstSentenceOf(ctx.taskDetails)
  if (firstSentence) return firstSentence

  return `Open ${ctx.moduleTitle ?? ctx.taskTitle} and locate the material for this task.`
}

function buildWhatToProduce(ctx: DoNowContext): string {
  const title = ctx.taskTitle.toLowerCase()

  if (/\b(quiz|test|exam|midterm|final)\b/.test(title)) {
    return `Complete and submit "${ctx.taskTitle}".`
  }

  if (/\b(essay|paper|report|write|writing|draft)\b/.test(title)) {
    return `Submit a written "${ctx.taskTitle}".`
  }

  if (/\b(discussion|post|response|reply|forum)\b/.test(title)) {
    return `Post your response for "${ctx.taskTitle}".`
  }

  if (/\b(read|reading|chapter|review|study|watch|video)\b/.test(title)) {
    const conceptList = ctx.concepts?.slice(0, 3).join(', ')
    if (conceptList) return `Be able to explain: ${conceptList}.`
    if (ctx.moduleSummary) return `Understand the core idea: ${trimToSentence(ctx.moduleSummary, 160)}`
    return `A solid understanding of "${ctx.taskTitle}" that you can explain in your own words.`
  }

  if (/\b(assignment|homework|problem|exercise|worksheet)\b/.test(title)) {
    return `A completed and submitted "${ctx.taskTitle}".`
  }

  const conceptList = ctx.concepts?.slice(0, 3).join(', ')
  if (conceptList) return `A clear grasp of: ${conceptList}.`

  return `A completed "${ctx.taskTitle}".`
}

function buildWhereToStart(ctx: DoNowContext): string {
  const secondPrompt = ctx.studyPrompts?.filter((prompt) => prompt.trim().length > 0)[1]
  if (secondPrompt) return trimToSentence(secondPrompt, 220)

  if (ctx.canvasUrl) {
    return 'Open the assignment directly in Canvas, then read through the instructions before doing anything else.'
  }

  if (ctx.learnHref) {
    const anchor = ctx.concepts?.[0]
      ? ` Look for the section on "${ctx.concepts[0]}" first.`
      : ''
    return `Open the module in Learn.${anchor}`
  }

  const detail = firstSentenceOf(ctx.taskDetails)
  if (detail && detail.length > 40) return detail

  return `Open ${ctx.moduleTitle ?? ctx.courseName} and find the part that covers "${ctx.taskTitle}".`
}

function buildSmallestStep(ctx: DoNowContext): string {
  const thirdPrompt = ctx.studyPrompts?.filter((prompt) => prompt.trim().length > 0)[2]
  if (thirdPrompt) return trimToSentence(thirdPrompt, 220)

  const secondSentence = secondSentenceOf(ctx.taskDetails)
  if (secondSentence && secondSentence.length > 40) return secondSentence

  const concept = ctx.concepts?.[0]
  if (concept) {
    return `Write one sentence in your own words explaining "${concept}", then continue from there.`
  }

  if (ctx.moduleSummary) {
    return 'Skim the module summary, highlight anything unfamiliar, then open the specific section that covers it.'
  }

  return 'Write the task title at the top of a blank page, list three things you already know, then start from what is already clear.'
}

function buildUrgencyNote(ctx: DoNowContext): string | null {
  if (!ctx.deadline) return null

  const daysUntil = Math.ceil(
    (new Date(ctx.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )

  if (daysUntil < 0) return 'This task is past its due date. Completing it now limits further impact.'
  if (daysUntil === 0) return 'Due today. Finishing this is the highest-value use of the next session.'
  if (daysUntil === 1) return 'Due tomorrow. Starting now leaves time to course-correct if needed.'
  if (daysUntil <= 3) return `Due in ${daysUntil} days. Getting ahead of it now keeps the rest of the week lighter.`
  return null
}

function compactOptionalText(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeWhitespace(value)
  if (!normalized) return null
  return trimToSentence(normalized, maxLength)
}

function compactTextList(values: string[] | null | undefined, maxItems: number, maxLength: number) {
  return (values ?? [])
    .map((value) => compactOptionalText(value, maxLength))
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems)
}

function normalizeWhitespace(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function firstSentenceOf(text: string | null | undefined): string | null {
  if (!text) return null
  const match = text.match(/^([^.!?]{20,}[.!?])/)
  return match?.[1]?.trim() ?? null
}

function secondSentenceOf(text: string | null | undefined): string | null {
  if (!text) return null
  const sentences = text.match(/[^.!?]{20,}[.!?]/g) ?? []
  return sentences[1]?.trim() ?? null
}

function trimToSentence(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const boundary = text.slice(0, maxLength).match(/^(.+?[.!?])\s/)
  return boundary?.[1] ?? `${text.slice(0, maxLength).trimEnd()}...`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
