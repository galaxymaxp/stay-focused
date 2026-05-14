import { randomUUID } from 'node:crypto'
import { buildTaskDraftRequestPayload, buildTaskDraftSourceKey, type TaskDraftContext } from '@/lib/do-now'
import { buildTaskRequirementSummary } from '@/lib/manual-copy-bundle'
import { formatTaskExportDate, wrapActivitySubmissionHtml, type TaskOutputExportMetadata } from '@/lib/task-output-template'
import type {
  StudyOutputTaskOutputContent,
  StudyOutputTaskOutputExportFile,
  TaskOutputGroundingStatus,
  TaskOutputPreset,
  TaskOutputPreviewMode,
  TaskOutputTargetType,
} from '@/lib/types'

export interface TaskOutputRequest {
  taskId: string
  title: string
  course?: string
  module?: string
  dueDate?: string
  taskType?: string
  instructions: string
  requirements: string[]
  sourceKey: string
  preset: TaskOutputPreset
  outputType: TaskOutputTargetType
  selectedContext: string[]
  groundingStatus: TaskOutputGroundingStatus
  detectedFormat: TaskOutputDetectedFormat
}

export type TaskOutputDetectedFormat =
  | 'short_answer'
  | 'essay_report'
  | 'quiz_like'
  | 'reflection'
  | 'activity_sheet'
  | 'file_upload_report'
  | 'presentation_document'

export interface TaskOutputModelResponse {
  title: string
  summary: string
  previewMode: TaskOutputPreviewMode
  previewContent: string
  stylesheet?: string | null
  script?: string | null
  groundingNote: string
  limitationNote?: string | null
  warnings?: string[]
  requirementsUsed?: string[]
  selectedContextUsed?: string[]
}

export interface TaskOutputApiResponse {
  ok: true
  output: StudyOutputTaskOutputContent
  cacheStatus: 'hit' | 'miss'
}

export const TASK_OUTPUT_SYSTEM_PROMPT = [
  'You are Stay Focused\'s grounded task-output generator.',
  '',
  'Your job is to produce the student deliverable itself using only the surfaced task instructions, rubric/requirements, and readable selected context.',
  '',
  'Rules:',
  '- Ground every part of the output in the task data provided in this request.',
  '- Do not invent requirements, rubric criteria, or missing deliverable details.',
  '- Do not invent citations, quotations, page numbers, references, or sources.',
  '- Generate the actual answer/content first. Do not return a planning scaffold when enough prompt/source context exists.',
  '- Preserve instructor constraints such as sentence counts, word counts, point values, rubric criteria, required headings, and file format.',
  '- If the task asks for 2-3 sentences, return 2-3 polished sentences and nothing longer unless the requested export wrapper requires it.',
  '- For reports, documents, HTML, PDF, DOCX, and presentation exports, wrap the actual answer/content in the selected format instead of outputting only section placeholders.',
  '- If the source text is genuinely weak or missing, state exactly what is missing and return only a conservative scaffold/draft that is safe.',
  '- Do not use generic motivational filler, fake confidence, or decorative academic fluff.',
  '- Prefer compact, export-ready structure over long explanations.',
  '- Keep presentation, report, reviewer, webpage, and documentation outputs aligned with the requested preset and target output type.',
  '',
  'Return strict JSON with these fields:',
  '{',
  '  "title": "string",',
  '  "summary": "string",',
  '  "previewMode": "rich_text" | "html" | "code",',
  '  "previewContent": "string",',
  '  "stylesheet": "string | null",',
  '  "script": "string | null",',
  '  "groundingNote": "string",',
  '  "limitationNote": "string | null",',
  '  "warnings": ["string"],',
  '  "requirementsUsed": ["string"],',
  '  "selectedContextUsed": ["string"]',
  '}',
].join('\n')

export function buildTaskOutputRequest(context: TaskDraftContext, input: {
  preset: TaskOutputPreset
  outputType: TaskOutputTargetType
}): TaskOutputRequest {
  const draftPayload = buildTaskDraftRequestPayload(context)
  const selectedContext = buildSelectedContext(context)
  const groundingStatus = classifyTaskOutputGrounding(context, draftPayload.instructions)

  return {
    taskId: context.taskId ?? '',
    title: draftPayload.title,
    ...(draftPayload.course ? { course: draftPayload.course } : {}),
    ...(draftPayload.module ? { module: draftPayload.module } : {}),
    ...(draftPayload.dueDate ? { dueDate: draftPayload.dueDate } : {}),
    ...(draftPayload.type ? { taskType: draftPayload.type } : {}),
    instructions: draftPayload.instructions,
    requirements: draftPayload.requirements ?? buildTaskRequirementSummary({
      taskTitle: draftPayload.title,
      instructionText: draftPayload.instructions,
      dueDate: context.deadline,
    }),
    sourceKey: buildTaskDraftSourceKey(context),
    preset: input.preset,
    outputType: input.outputType,
    selectedContext,
    groundingStatus,
    detectedFormat: detectTaskOutputFormat({
      title: draftPayload.title,
      instructions: draftPayload.instructions,
      requirements: draftPayload.requirements ?? [],
      preset: input.preset,
      outputType: input.outputType,
    }),
  }
}

export function buildTaskOutputUserPrompt(input: TaskOutputRequest) {
  return [
    'Use only the task data surfaced in this request.',
    '',
    'Task data:',
    `Task title: ${input.title}`,
    `Course: ${input.course ?? 'None surfaced'}`,
    `Module: ${input.module ?? 'None surfaced'}`,
    `Due date: ${input.dueDate ?? 'None surfaced'}`,
    `Task type: ${input.taskType ?? 'Task'}`,
    `Requested preset: ${input.preset}`,
    `Requested output type: ${input.outputType}`,
    `Detected task format: ${input.detectedFormat}`,
    `Grounding strength: ${input.groundingStatus}`,
    `Source key: ${input.sourceKey}`,
    '',
    'Instructions:',
    input.instructions,
    '',
    'Derived requirements:',
    input.requirements.length > 0
      ? input.requirements.map((item) => `- ${item}`).join('\n')
      : '- None derived from the available task text.',
    '',
    'Selected context:',
    input.selectedContext.length > 0
      ? input.selectedContext.map((item) => `- ${item}`).join('\n')
      : '- No extra selected context was surfaced.',
    '',
    'Contract:',
    '- Stay strictly grounded in the surfaced task data.',
    '- Produce the submission-ready answer/content before any notes about limitations.',
    '- Do not output a generic scaffold with headings like Purpose, Deliverable focus, Grounded context, or Next edit pass when grounding is marked grounded.',
    '- Apply instructor format constraints exactly, especially sentence counts and required sections.',
    '- No fake citations.',
    '- No fabricated requirements.',
    '- If grounding is limited, say what readable assignment/source text is missing and keep any draft conservative.',
    '- Make the output feel submission-ready, not like tutoring notes.',
  ].join('\n')
}

export function buildTaskOutputFallback(input: TaskOutputRequest): StudyOutputTaskOutputContent {
  const previewMode = resolvePreviewMode(input.outputType)
  const previewContent = input.groundingStatus === 'grounded'
    ? buildGroundedAnswerPreview(input, previewMode)
    : buildFallbackPreview(input, previewMode)
  const warning = input.groundingStatus === 'limited'
    ? 'Limited readable source text was available, so this stays as a conservative scaffold.'
    : 'This first-pass output stays tightly grounded in the surfaced task requirements.'

  return {
    version: 'task-output-v1',
    sourceTaskId: input.taskId,
    taskTitle: input.title,
    preset: input.preset,
    outputType: input.outputType,
    previewMode,
    title: buildTaskOutputTitle(input),
    summary: buildTaskOutputSummary(input, input.groundingStatus !== 'grounded'),
    previewContent,
    stylesheet: previewMode === 'html' ? buildHtmlStylesForPreset(input.preset) : null,
    script: previewMode === 'html' && input.outputType === 'js'
      ? buildJsScaffold(input)
      : previewMode === 'code' && input.outputType === 'js'
        ? buildJsScaffold(input)
        : null,
    requirementSummary: summarizeRequirements(input.requirements),
    requirements: input.requirements.slice(0, 8),
    selectedContext: input.selectedContext.slice(0, 6),
    groundingStatus: input.groundingStatus,
    groundingNote: input.groundingStatus === 'limited'
      ? 'Only partial readable task/source text was available, so this output is a scaffold anchored to surfaced requirements only.'
      : 'This output is a direct first-pass answer grounded in the surfaced task prompt, requirements, and readable course/source context.',
    limitationNote: input.groundingStatus === 'limited'
      ? 'Add real task evidence, source detail, or class-specific content before submission.'
      : null,
    warnings: [warning],
    exports: buildTaskOutputExports({
      title: buildTaskOutputTitle(input),
      outputType: input.outputType,
      previewMode,
      previewContent,
      stylesheet: previewMode === 'html' ? buildHtmlStylesForPreset(input.preset) : null,
      script: previewMode === 'html' || input.outputType === 'js' ? buildJsScaffold(input) : null,
      metadata: buildTaskOutputExportMetadata(input),
    }),
    revisionHistory: [createRevisionEntry(input, 'Initial generation', input.groundingStatus)],
  }
}

export function normalizeTaskOutputModelResponse(
  response: TaskOutputModelResponse,
  request: TaskOutputRequest,
  previous: StudyOutputTaskOutputContent | null,
): StudyOutputTaskOutputContent {
  const previewMode = normalizePreviewMode(response.previewMode, request.outputType)
  const title = cleanInline(response.title) || buildTaskOutputTitle(request)
  const previewContent = cleanBlock(response.previewContent) || buildFallbackPreview(request, previewMode)
  const groundingNote = cleanInline(response.groundingNote)
    || (request.groundingStatus === 'limited'
      ? 'Only partial readable task/source text was available, so this output stays limited and scaffold-first.'
      : 'This output is grounded in the surfaced task instructions and selected readable context.')
  const limitationNote = cleanInline(response.limitationNote ?? null)
  const exports = buildTaskOutputExports({
    title,
    outputType: request.outputType,
    previewMode,
    previewContent,
    stylesheet: cleanBlock(response.stylesheet ?? null),
    script: cleanBlock(response.script ?? null),
    metadata: buildTaskOutputExportMetadata(request),
  })

  const content: StudyOutputTaskOutputContent = {
    version: 'task-output-v1',
    sourceTaskId: request.taskId,
    taskTitle: request.title,
    preset: request.preset,
    outputType: request.outputType,
    previewMode,
    title,
    summary: cleanInline(response.summary) || buildTaskOutputSummary(request, false),
    previewContent,
    stylesheet: cleanBlock(response.stylesheet ?? null),
    script: cleanBlock(response.script ?? null),
    requirementSummary: summarizeRequirements(response.requirementsUsed?.length ? response.requirementsUsed : request.requirements),
    requirements: sanitizeStringList(response.requirementsUsed?.length ? response.requirementsUsed : request.requirements, 8),
    selectedContext: sanitizeStringList(response.selectedContextUsed?.length ? response.selectedContextUsed : request.selectedContext, 6),
    groundingStatus: request.groundingStatus,
    groundingNote,
    limitationNote: request.groundingStatus === 'limited'
      ? limitationNote ?? 'Add course-specific facts or source details before submitting this output.'
      : limitationNote,
    warnings: sanitizeStringList(response.warnings ?? [], 6),
    exports,
    revisionHistory: buildTaskOutputRevisionHistory(previous, request),
  }

  return content
}

export function isTaskOutputApiResponse(value: unknown): value is TaskOutputApiResponse {
  if (!isPlainRecord(value)) return false

  return value.ok === true
    && isTaskOutputContent(value.output)
    && (value.cacheStatus === 'hit' || value.cacheStatus === 'miss')
}

export function isTaskOutputContent(value: unknown): value is StudyOutputTaskOutputContent {
  if (!isPlainRecord(value)) return false

  return value.version === 'task-output-v1'
    && typeof value.sourceTaskId === 'string'
    && typeof value.taskTitle === 'string'
    && typeof value.previewContent === 'string'
    && typeof value.title === 'string'
    && Array.isArray(value.exports)
    && Array.isArray(value.revisionHistory)
}

function buildTaskOutputRevisionHistory(previous: StudyOutputTaskOutputContent | null, request: TaskOutputRequest) {
  const history = previous?.revisionHistory ?? []
  const nextLabel = history.length === 0 ? 'Initial generation' : `Revision ${history.length + 1}`
  return [
    createRevisionEntry(request, nextLabel, request.groundingStatus),
    ...history,
  ].slice(0, 8)
}

function createRevisionEntry(
  request: TaskOutputRequest,
  label: string,
  groundingStatus: TaskOutputGroundingStatus,
) {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    label,
    summary: `${request.preset} -> ${request.outputType}`,
    outputType: request.outputType,
    preset: request.preset,
    groundingStatus,
  }
}

function buildSelectedContext(context: TaskDraftContext) {
  return sanitizeStringList([
    context.taskDetails,
    context.resourceSnippet,
    context.sourceText,
    context.sourceNote,
  ].map(sanitizeGroundedTextBlock), 6)
}

function classifyTaskOutputGrounding(context: TaskDraftContext, instructions: string): TaskOutputGroundingStatus {
  const readableChars = [
    context.taskDetails,
    context.resourceSnippet,
    context.sourceText,
    context.sourceNote,
  ]
    .map(sanitizeGroundedTextBlock)
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
    .length

  if (/full task instructions were not available/i.test(instructions)) return 'limited'
  if (readableChars >= 220) return 'grounded'
  if (hasActionableAssignmentPrompt(sanitizeGroundedTextBlock(instructions) ?? '')) return 'grounded'
  return 'limited'
}

function buildTaskOutputTitle(input: TaskOutputRequest) {
  return input.title
}

function buildTaskOutputSummary(input: TaskOutputRequest, fallback: boolean) {
  const lead = input.groundingStatus === 'limited'
    ? 'Limited-grounding scaffold'
    : 'Grounded task output'
  const tail = fallback
    ? 'prepared conservatively from surfaced task requirements.'
    : 'prepared from surfaced task requirements and selected readable context.'
  return `${lead} for a ${input.outputType.toUpperCase()} ${input.preset}. ${tail}`
}

function buildTaskOutputExportMetadata(input: TaskOutputRequest): TaskOutputExportMetadata {
  return {
    courseLabel: input.course ?? null,
    moduleTitle: input.module ?? null,
    activityTitle: input.title,
    studentName: null,
    dateLabel: formatTaskExportDate(input.dueDate ?? null),
    sectionSchedule: null,
  }
}

function summarizeRequirements(requirements: string[]) {
  if (requirements.length === 0) return 'No explicit requirements were surfaced beyond the task title and instructions.'
  return requirements.slice(0, 3).join(' ')
}

function buildFallbackPreview(input: TaskOutputRequest, previewMode: TaskOutputPreviewMode) {
  if (previewMode === 'html') {
    return [
      '<main class="task-output-shell">',
      `  <h1>${escapeHtml(buildTaskOutputTitle(input))}</h1>`,
      `  <p>${escapeHtml(summarizeRequirements(input.requirements))}</p>`,
      '  <section>',
      '    <h2>Grounded sections</h2>',
      ...buildSectionList(input).map((item) => `    <article><h3>${escapeHtml(item.heading)}</h3><p>${escapeHtml(item.body)}</p></article>`),
      '  </section>',
      '</main>',
    ].join('\n')
  }

  if (previewMode === 'code') {
    if (input.outputType === 'css') {
      return [
        '.task-output-shell {',
        '  max-width: 72rem;',
        '  margin: 0 auto;',
        '  padding: 2rem;',
        '}',
        '',
        '/* Grounded sections */',
        '.task-output-section {',
        '  margin-bottom: 1.25rem;',
        '}',
      ].join('\n')
    }

    return buildJsScaffold(input)
  }

  return [
    buildTaskOutputTitle(input),
    '',
    'Purpose',
    summarizeRequirements(input.requirements),
    '',
    ...buildSectionList(input).flatMap((item) => [item.heading, item.body, '']),
  ].join('\n').trim()
}

function buildGroundedAnswerPreview(input: TaskOutputRequest, previewMode: TaskOutputPreviewMode) {
  const answer = buildConservativeGroundedAnswer(input)

  if (previewMode === 'html') {
    return [
      '<main class="task-output-shell">',
      `  <h1>${escapeHtml(input.title)}</h1>`,
      '  <section>',
      `    <p>${escapeHtml(answer)}</p>`,
      '  </section>',
      '</main>',
    ].join('\n')
  }

  if (previewMode === 'code') {
    return input.outputType === 'js'
      ? [
          `// ${input.title}`,
          'export const taskOutput = {',
          `  title: ${JSON.stringify(input.title)},`,
          `  answer: ${JSON.stringify(answer)},`,
          '};',
        ].join('\n')
      : `.task-output-answer {\n  max-width: 65ch;\n  line-height: 1.6;\n}`
  }

  if (input.detectedFormat === 'short_answer') return answer

  return [
    input.title,
    '',
    answer,
  ].join('\n')
}

function buildConservativeGroundedAnswer(input: TaskOutputRequest) {
  const contextSentences = splitSentences([
    input.instructions,
    ...input.selectedContext,
  ].join('\n'))
  const sentenceConstraint = detectSentenceConstraint(input.instructions, input.requirements)
  const targetCount = sentenceConstraint ? Math.min(Math.max(sentenceConstraint.min, 1), Math.max(sentenceConstraint.max, sentenceConstraint.min)) : null

  if (targetCount && sentenceConstraint) {
    const sentences = contextSentences
      .filter((sentence) => !/^(task details|assignment context|selected context|instructions|rubric)\s*:/i.test(sentence))
      .slice(0, targetCount)
    if (sentences.length >= sentenceConstraint.min) return sentences.join(' ')
  }

  const usable = contextSentences.slice(0, input.detectedFormat === 'essay_report' || input.detectedFormat === 'file_upload_report' ? 6 : 3)
  if (usable.length > 0) return usable.join(' ')

  return 'A conservative first draft can be written from the surfaced assignment prompt, but the source text is too thin to add course-specific details safely.'
}

export function detectTaskOutputFormat(input: {
  title: string
  instructions: string
  requirements?: string[]
  preset?: TaskOutputPreset
  outputType?: TaskOutputTargetType
}): TaskOutputDetectedFormat {
  const text = normalizeComparisonText([
    input.title,
    input.instructions,
    ...(input.requirements ?? []),
    input.preset ?? '',
    input.outputType ?? '',
  ].join(' '))

  if (/\b(2\s*[-–]\s*3|two\s+to\s+three|one|two|three|4|four|5|five)\s+(?:complete\s+)?sentences?\b/.test(text)
    || /\bshort answer\b|\banswer in\b/.test(text)) return 'short_answer'
  if (/\bquiz\b|\banswer sheet\b|\bmultiple choice\b|\btrue or false\b|\bidentification\b/.test(text)) return 'quiz_like'
  if (/\breflection\b|\breflect\b|\binsight\b|\bexperience\b|\blearning journal\b/.test(text)) return 'reflection'
  if (/\bactivity sheet\b|\bworksheet\b|\bfill in\b|\btable\b|\bchart\b|\btemplate\b/.test(text)) return 'activity_sheet'
  if (/\bfile upload\b|\bupload\b|\breport file\b/.test(text)) return 'file_upload_report'
  if (/\bpresentation\b|\bslide\b|\bppt\b|\bdocument\b|\bhtml\b|\bwebpage\b/.test(text)) return 'presentation_document'
  return 'essay_report'
}

function hasActionableAssignmentPrompt(text: string) {
  const normalized = cleanBlock(text)
  if (normalized.length >= 80) return true
  if (detectSentenceConstraint(normalized, [])) return true
  return /\b(rubric|points?|criteria|required format|answer in|write in|submit as)\b/i.test(normalized)
}

function detectSentenceConstraint(instructions: string, requirements: string[]) {
  const text = `${instructions}\n${requirements.join('\n')}`
  const range = text.match(/\b(\d+)\s*[-–]\s*(\d+)\s+(?:complete\s+)?sentences?\b/i)
  if (range?.[1] && range?.[2]) return { min: Number(range[1]), max: Number(range[2]) }
  const wordRange = text.match(/\b(two|three|four|five)\s+to\s+(three|four|five|six)\s+(?:complete\s+)?sentences?\b/i)
  if (wordRange?.[1] && wordRange?.[2]) return { min: NUMBER_WORDS[wordRange[1].toLowerCase()] ?? 2, max: NUMBER_WORDS[wordRange[2].toLowerCase()] ?? 3 }
  const exact = text.match(/\b(one|two|three|four|five|six|\d+)\s+(?:complete\s+)?sentences?\b/i)
  if (!exact?.[1]) return null
  const value = /^\d+$/.test(exact[1]) ? Number(exact[1]) : NUMBER_WORDS[exact[1].toLowerCase()] ?? null
  return value ? { min: value, max: value } : null
}

function splitSentences(text: string) {
  return cleanBlock(text)
    .replace(/^(Task details|Assignment context|Instructions|Selected context):\s*/gim, '')
    .split(/(?<=[.!?])\s+/)
    .map((part) => cleanInline(part))
    .filter((part) => part.length >= 24)
    .filter((part) => !isLikelyMetadataLeak(part))
}

function buildSectionList(input: TaskOutputRequest) {
  const sections = [
    { heading: 'Deliverable focus', body: summarizeRequirements(input.requirements) },
    { heading: 'Grounded context', body: input.selectedContext[0] ?? 'Add the strongest readable source detail here.' },
    { heading: 'Next edit pass', body: input.groundingStatus === 'limited' ? 'Replace placeholders with real task evidence before submission.' : 'Tighten formatting and confirm the final submission requirements.' },
  ]

  if (input.preset === 'presentation') {
    return [
      { heading: 'Slide 1', body: 'State the main topic and the clearest task-specific takeaway.' },
      { heading: 'Slide 2', body: 'Add the strongest required detail or evidence surfaced in the task.' },
      { heading: 'Slide 3', body: 'Close with the exact point the student should present or submit.' },
    ]
  }

  if (input.preset === 'webpage') {
    return [
      { heading: 'Hero section', body: 'State the task focus and the main action or summary.' },
      { heading: 'Content section', body: input.selectedContext[0] ?? 'Add grounded page content here.' },
      { heading: 'Footer note', body: 'List remaining assumptions or missing required details briefly.' },
    ]
  }

  return sections
}

function resolvePreviewMode(outputType: TaskOutputTargetType): TaskOutputPreviewMode {
  if (outputType === 'html') return 'html'
  if (outputType === 'css' || outputType === 'js') return 'code'
  return 'rich_text'
}

function normalizePreviewMode(value: string, outputType: TaskOutputTargetType): TaskOutputPreviewMode {
  if (value === 'html' || value === 'code' || value === 'rich_text') return value
  return resolvePreviewMode(outputType)
}

function buildTaskOutputExports(input: {
  title: string
  outputType: TaskOutputTargetType
  previewMode: TaskOutputPreviewMode
  previewContent: string
  stylesheet: string | null
  script: string | null
  metadata: TaskOutputExportMetadata
}): StudyOutputTaskOutputExportFile[] {
  const baseName = slugify(input.title) || 'task-output'
  const files: StudyOutputTaskOutputExportFile[] = []

  if (input.outputType === 'html') {
    files.push({
      filename: `${baseName}.html`,
      mimeType: 'text/html;charset=utf-8',
      content: wrapActivitySubmissionHtml({
        title: input.title,
        previewContent: input.previewContent,
        previewMode: input.previewMode,
        metadata: input.metadata,
        stylesheet: input.stylesheet,
        script: input.script,
      }),
      label: 'Download Activity HTML',
    })
    return files
  }

  if (input.outputType === 'css') {
    files.push({
      filename: `${baseName}.css`,
      mimeType: 'text/css;charset=utf-8',
      content: input.previewContent,
      label: 'Download CSS',
    })
    return files
  }

  if (input.outputType === 'js') {
    files.push({
      filename: `${baseName}.js`,
      mimeType: 'text/javascript;charset=utf-8',
      content: input.previewContent,
      label: 'Download JS',
    })
    return files
  }

  files.push({
    filename: `${baseName}.html`,
    mimeType: 'text/html;charset=utf-8',
    content: wrapActivitySubmissionHtml({
      title: input.title,
      previewContent: input.previewContent,
      previewMode: input.previewMode,
      metadata: input.metadata,
      stylesheet: input.stylesheet,
      script: input.script,
    }),
    label: input.outputType === 'pdf' ? 'Download Activity printable HTML' : 'Download Activity HTML',
  })
  files.push({
    filename: `${baseName}.txt`,
    mimeType: 'text/plain;charset=utf-8',
    content: input.previewMode === 'rich_text'
      ? input.previewContent
      : stripHtml(input.previewContent),
    label: 'Download text backup',
  })

  return files
}


function buildHtmlStylesForPreset(preset: TaskOutputPreset) {
  if (preset === 'presentation') {
    return [
      'body { font-family: "Segoe UI", Arial, sans-serif; background: #f7f4ee; color: #1b1a18; margin: 0; }',
      '.task-output-shell { max-width: 72rem; margin: 0 auto; padding: 2.5rem 1.2rem; display: grid; gap: 1rem; }',
      '.task-output-shell article { border: 1px solid rgba(27,26,24,0.12); border-radius: 16px; padding: 1rem; background: #fffdf8; }',
    ].join('\n')
  }

  return [
    'body { font-family: "Segoe UI", Arial, sans-serif; background: #faf8f2; color: #1b1a18; margin: 0; }',
    '.task-output-shell { max-width: 58rem; margin: 0 auto; padding: 2rem 1rem 3rem; display: grid; gap: 1rem; }',
    '.task-output-shell section, .task-output-shell article { border: 1px solid rgba(27,26,24,0.1); border-radius: 14px; padding: 1rem; background: #fffdf9; }',
  ].join('\n')
}

function buildJsScaffold(input: TaskOutputRequest) {
  return [
    `// ${buildTaskOutputTitle(input)}`,
    'const taskOutput = {',
    `  title: ${JSON.stringify(input.title)},`,
    `  preset: ${JSON.stringify(input.preset)},`,
    `  outputType: ${JSON.stringify(input.outputType)},`,
    '};',
    '',
    'export function renderTaskOutput() {',
    '  return taskOutput;',
    '}',
  ].join('\n')
}

function sanitizeStringList(values: Array<string | null | undefined>, maxItems: number) {
  return values
    .map((value) => cleanInline(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems)
}

function sanitizeGroundedTextBlock(value: string | null | undefined) {
  if (!value) return null

  const cleaned = value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !isLikelyMetadataLeak(line))
    .join('\n')
    .trim()

  return cleaned || null
}

function isLikelyMetadataLeak(line: string) {
  const compact = line.replace(/\s+/g, ' ').trim()
  if (!compact) return true
  if (compact.length < 3) return true

  if (
    /^(metadata|debug|quality note|quality score|quality warning|ocr status|ocr provider|extraction status|extraction provider|source key|job id|uuid|id)\b/i.test(compact)
    || /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(compact)
  ) {
    return true
  }

  const alphaChars = compact.replace(/[^A-Za-z]/g, '').length
  const totalChars = compact.replace(/\s/g, '').length
  if (totalChars > 0 && alphaChars / totalChars < 0.35) return true

  return false
}

function cleanInline(value: string | null | undefined) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
}

function cleanBlock(value: string | null | undefined) {
  return value
    ?.replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() ?? ''
}

function normalizeComparisonText(value: string | null | undefined) {
  return cleanInline(value).toLowerCase()
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
}

export function buildTaskOutputPromptPreview(input: TaskOutputRequest, output?: StudyOutputTaskOutputContent | null) {
  const prompt = buildTaskOutputUserPrompt(input)
  const currentPreview = output?.previewContent ? cleanBlock(output.previewContent).slice(0, 720) : null

  return [
    'mode: grounded task output generation',
    '',
    `preset: ${input.preset}`,
    `output_type: ${input.outputType}`,
    `grounding_status: ${input.groundingStatus}`,
    '',
    'prompt_contract <<',
    prompt,
    '>>',
    currentPreview ? ['', 'latest_preview <<', currentPreview, '>>'].join('\n') : '',
  ].filter(Boolean).join('\n')
}
