/**
 * Do Now — activity prompt builder.
 *
 * Derives four concrete, actionable answers from already-processed data.
 * No AI calls. Pure function.
 */

export interface DoNowContext {
  taskTitle: string
  taskDetails: string | null
  /** ISO date string */
  deadline: string | null
  priority: 'high' | 'medium' | 'low' | null
  courseName: string
  moduleTitle: string | null
  /** From module.study_prompts — AI-generated at sync time */
  studyPrompts?: string[] | null
  /** From module.concepts */
  concepts?: string[] | null
  moduleSummary?: string | null
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

export function buildDoNowPrompt(ctx: DoNowContext): DoNowPrompt {
  return {
    urgencyNote: buildUrgencyNote(ctx),
    whatFirst: buildWhatFirst(ctx),
    whatToProduce: buildWhatToProduce(ctx),
    whereToStart: buildWhereToStart(ctx),
    smallestStep: buildSmallestStep(ctx),
  }
}

// ─── Field builders ───────────────────────────────────────────────────────────

function buildWhatFirst(ctx: DoNowContext): string {
  // Use the first study prompt if available — it was written specifically as a starting action
  const firstPrompt = ctx.studyPrompts?.find((p) => p.trim().length > 0)
  if (firstPrompt) return trimToSentence(firstPrompt, 220)

  // Fall back to the first sentence of task details
  const firstSentence = firstSentenceOf(ctx.taskDetails)
  if (firstSentence) return firstSentence

  return `Open ${ctx.moduleTitle ?? ctx.taskTitle} and locate the material for this task.`
}

function buildWhatToProduce(ctx: DoNowContext): string {
  const title = ctx.taskTitle.toLowerCase()

  // Task type inference from title keywords
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

  // Concept-based fallback
  const conceptList = ctx.concepts?.slice(0, 3).join(', ')
  if (conceptList) return `A clear grasp of: ${conceptList}.`

  return `A completed "${ctx.taskTitle}".`
}

function buildWhereToStart(ctx: DoNowContext): string {
  // Second study prompt is usually the "how to approach it" prompt
  const secondPrompt = ctx.studyPrompts?.filter((p) => p.trim().length > 0)[1]
  if (secondPrompt) return trimToSentence(secondPrompt, 220)

  if (ctx.canvasUrl) {
    return `Open the assignment directly in Canvas, then read through the instructions before doing anything else.`
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
  // Third study prompt is typically a specific action step
  const thirdPrompt = ctx.studyPrompts?.filter((p) => p.trim().length > 0)[2]
  if (thirdPrompt) return trimToSentence(thirdPrompt, 220)

  // If task details have a second sentence, use it
  const secondSentence = secondSentenceOf(ctx.taskDetails)
  if (secondSentence && secondSentence.length > 40) return secondSentence

  // Concept-based smallest step
  const concept = ctx.concepts?.[0]
  if (concept) {
    return `Write one sentence in your own words explaining "${concept}", then continue from there.`
  }

  // Module summary based
  if (ctx.moduleSummary) {
    return `Skim the module summary, highlight anything unfamiliar, then open the specific section that covers it.`
  }

  return `Write the task title at the top of a blank page, list three things you already know, then start from what is already clear.`
}

function buildUrgencyNote(ctx: DoNowContext): string | null {
  if (!ctx.deadline) return null
  const daysUntil = Math.ceil(
    (new Date(ctx.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (daysUntil < 0) return `This task is past its due date. Completing it now limits further impact.`
  if (daysUntil === 0) return `Due today — finishing this is the highest-value use of the next session.`
  if (daysUntil === 1) return `Due tomorrow. Starting now leaves time to course-correct if needed.`
  if (daysUntil <= 3) return `Due in ${daysUntil} days. Getting ahead of it now keeps the rest of the week lighter.`
  return null
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

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
  return boundary?.[1] ?? `${text.slice(0, maxLength).trimEnd()}…`
}
