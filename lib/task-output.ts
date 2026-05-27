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
  TaskOutputReadinessStatus,
  TaskOutputSourceMode,
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
  sourceMode: TaskOutputSourceMode
  detectedFormat: TaskOutputDetectedFormat
  previousOutput?: string | null
  refinementInstruction?: string | null
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

export interface TaskOutputReadinessEvaluation {
  status: TaskOutputReadinessStatus
  label: string
  ready: boolean
  reasons: string[]
}

export const TASK_OUTPUT_SYSTEM_PROMPT = [
  'You are Stay Focused\'s task-output generator.',
  '',
  'Your job is to produce the student deliverable itself from the surfaced task instructions, rubric/requirements, selected context, and the explicit generation mode.',
  '',
  'Rules:',
  '- Always follow the explicit Task Output mode.',
  '- In course_grounded mode, ground every part of the output in the task data and selected readable course/source context.',
  '- In general_research_labeled mode, complete the requested deliverable using cautious general/background knowledge because course-provided source content is insufficient.',
  '- In general_research_labeled mode, clearly label the output and reference section as general/background research, not course-provided evidence.',
  '- In source_limited_scaffold mode, return only a conservative scaffold because the task cannot be completed safely.',
  '- Do not invent requirements, rubric criteria, or missing deliverable details.',
  '- Do not invent quotations, page numbers, retrieval dates, course-provided sources, or source precision.',
  '- Do not present general/background knowledge as course-confirmed or selected-source evidence.',
  '- Do not include unrelated course requirements, course outcomes, room links, syllabus policies, or extra deliverables not requested by the assignment.',
  '- Generate the actual answer/content first. Do not return a planning scaffold when enough prompt/source context exists.',
  '- Preserve instructor constraints such as sentence counts, word counts, point values, rubric criteria, required headings, and file format.',
  '- If the task asks for 2-3 sentences, return 2-3 polished sentences and nothing longer unless the requested export wrapper requires it.',
  '- For reports, documents, HTML, PDF, DOCX, and presentation exports, wrap the actual answer/content in the selected format instead of outputting only section placeholders.',
  '- If the source text is genuinely weak or missing and the mode is source_limited_scaffold, state exactly what is missing and return only a conservative scaffold/draft that is safe.',
  '- For research-style assignments in general_research_labeled mode, produce the completed report/deliverable instead of an empty scaffold.',
  '- For APA/reference sections in general_research_labeled mode, use honest labels such as "General/background references to verify" when exact retrieval data is unavailable.',
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
  const sourceMode = classifyTaskOutputSourceMode({
    title: draftPayload.title,
    instructions: draftPayload.instructions,
    requirements: draftPayload.requirements ?? [],
    selectedContext,
    groundingStatus,
    preset: input.preset,
    outputType: input.outputType,
  })

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
    sourceMode,
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
    input.sourceMode === 'general_research_labeled'
      ? 'Complete this research deliverable using cautious general/background knowledge, with clear labeling that course-provided source content was insufficient.'
      : 'Use only the task data surfaced in this request.',
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
    `Task Output mode: ${input.sourceMode}`,
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
    'Source context status:',
    input.sourceMode === 'general_research_labeled'
      ? '- Course-provided factual source context is insufficient. General/background research may be used only with honest labeling.'
      : input.selectedContext.length > 0
      ? '- Readable related Canvas/course source text is included above.'
      : '- No readable related Canvas/course source text was available. Do not treat the task title, file titles, metadata, or assignment wording as factual source content.',
    input.previousOutput
      ? [
          '',
          'Previous output to revise:',
          input.previousOutput,
        ].join('\n')
      : '',
    input.refinementInstruction
      ? [
          '',
          'User refinement request:',
          input.refinementInstruction,
        ].join('\n')
      : '',
    '',
    'Contract:',
    `- Task Output mode is ${input.sourceMode}.`,
    input.sourceMode === 'general_research_labeled'
      ? '- Produce the completed deliverable first, using cautious general/background knowledge and honest source labeling.'
      : '- Stay strictly grounded in the surfaced task data.',
    '- The original Canvas task remains the anchor even when revising a previous output.',
    '- A user refinement may change tone, format, length, organization, or emphasis, but it may not turn unsupported facts into course-confirmed facts.',
    input.sourceMode === 'general_research_labeled'
      ? '- For refinement, you may complete research-style content with general/background knowledge, but must not call it course-provided or exact retrieved evidence.'
      : '- For refinement, preserve the previous output\'s factual boundaries. You may reshape supported content; you may not add unsupported facts, citations, threat names, dates, impact figures, or external claims.',
    '- Produce the submission-ready answer/content before any notes about limitations.',
    '- Do not output a generic scaffold with headings like Purpose, Deliverable focus, Grounded context, or Next edit pass when grounding is marked grounded.',
    '- Apply instructor format constraints exactly, especially sentence counts and required sections.',
    '- No fake citations.',
    input.sourceMode === 'general_research_labeled'
      ? '- References must be labeled as general/background references to verify unless exact source metadata was provided.'
      : '- Do not invent APA references.',
    input.sourceMode === 'general_research_labeled'
      ? '- Do not fabricate course-provided facts or exact source confidence.'
      : '- Do not fabricate external facts.',
    '- Do not present generic model-memory facts as course-confirmed.',
    '- No fabricated requirements.',
    '- Do not include unrelated course requirements, room links, ODL links, syllabus/CLO material, or backup/restore sections unless the task explicitly asks for them.',
    '- Do not mark research plans, source checklists, or templates as final or ready.',
    input.sourceMode === 'source_limited_scaffold'
      ? '- If grounding is limited, say what readable assignment/source text is missing and keep any draft conservative.'
      : '- If course context is limited, keep the limitation label but do not turn a research assignment into an empty scaffold.',
    input.sourceMode === 'general_research_labeled'
      ? '- Do not output "research needed" placeholder sections; complete the report and include an honest general/background source note.'
      : '- If the task requires external research and no approved research mode is available, label the output as research-needed rather than final.',
    '- Make the output feel submission-ready, not like tutoring notes.',
  ].join('\n')
}

export function buildTaskOutputFallback(input: TaskOutputRequest): StudyOutputTaskOutputContent {
  const previewMode = resolvePreviewMode(input.outputType)
  const previewContent = input.sourceMode === 'general_research_labeled'
    ? buildGeneralResearchUnavailablePreview(input, previewMode)
    : input.groundingStatus === 'grounded'
    ? buildGroundedAnswerPreview(input, previewMode)
    : buildFallbackPreview(input, previewMode)
  const readiness = evaluateTaskOutputReadiness({
    request: input,
    previewContent,
    summary: buildTaskOutputSummary(input, input.groundingStatus !== 'grounded'),
    warnings: [],
    limitationNote: input.groundingStatus === 'limited'
      ? 'Add real task evidence, source detail, or class-specific content before submission.'
      : null,
  })
  const warning = input.sourceMode === 'general_research_labeled'
    ? 'General research mode was selected, but the model response was unavailable; this output needs another generation pass before submission.'
    : input.groundingStatus === 'limited'
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
    sourceMode: input.sourceMode,
    readinessStatus: readiness.status,
    readinessLabel: readiness.label,
    groundingNote: input.sourceMode === 'general_research_labeled'
      ? 'This task is marked for general/background research because the assignment asks for research and course-provided factual source content was insufficient.'
      : input.groundingStatus === 'limited'
      ? 'Only partial readable task/source text was available, so this output is a scaffold anchored to surfaced requirements only.'
      : 'This output is a direct first-pass answer grounded in the surfaced task prompt, requirements, and readable course/source context.',
    limitationNote: input.sourceMode === 'general_research_labeled'
      ? 'Regenerate with the task-output model to complete the report; verify any general/background references before submission.'
      : input.groundingStatus === 'limited'
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
  const title = sanitizeInternalModeLabels(cleanInline(response.title)) || buildTaskOutputTitle(request)
  const previewContent = sanitizeInternalModeLabels(cleanBlock(response.previewContent)) || buildFallbackPreview(request, previewMode)
  const groundingNote = sanitizeInternalModeLabels(cleanInline(response.groundingNote))
    || (request.sourceMode === 'general_research_labeled'
      ? 'General/background research was used because course-provided source content was insufficient.'
      : request.groundingStatus === 'limited'
      ? 'Only partial readable task/source text was available, so this output stays limited and scaffold-first.'
      : 'This output is grounded in the surfaced task instructions and selected readable context.')
  const limitationNote = sanitizeInternalModeLabels(cleanInline(response.limitationNote ?? null))
  const exports = buildTaskOutputExports({
    title,
    outputType: request.outputType,
    previewMode,
    previewContent,
    stylesheet: sanitizeInternalModeLabels(cleanBlock(response.stylesheet ?? null)),
    script: sanitizeInternalModeLabels(cleanBlock(response.script ?? null)),
    metadata: buildTaskOutputExportMetadata(request),
  })
  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent,
    summary: sanitizeInternalModeLabels(cleanInline(response.summary)),
    warnings: sanitizeStringList(response.warnings ?? [], 6).map(sanitizeInternalModeLabels),
    limitationNote,
  })

  const content: StudyOutputTaskOutputContent = {
    version: 'task-output-v1',
    sourceTaskId: request.taskId,
    taskTitle: request.title,
    preset: request.preset,
    outputType: request.outputType,
    previewMode,
    title,
    summary: sanitizeInternalModeLabels(cleanInline(response.summary)) || buildTaskOutputSummary(request, false),
    previewContent,
    stylesheet: sanitizeInternalModeLabels(cleanBlock(response.stylesheet ?? null)),
    script: sanitizeInternalModeLabels(cleanBlock(response.script ?? null)),
    requirementSummary: summarizeRequirements(response.requirementsUsed?.length ? response.requirementsUsed : request.requirements),
    requirements: sanitizeStringList(response.requirementsUsed?.length ? response.requirementsUsed : request.requirements, 8),
    selectedContext: sanitizeStringList(response.selectedContextUsed?.length ? response.selectedContextUsed : request.selectedContext, 6),
    groundingStatus: request.groundingStatus,
    sourceMode: request.sourceMode,
    readinessStatus: readiness.status,
    readinessLabel: readiness.label,
    groundingNote,
    limitationNote: request.sourceMode === 'general_research_labeled'
      ? limitationNote ?? 'General/background research was used because course-provided source context was insufficient. Verify references before final submission.'
      : request.groundingStatus === 'limited'
      ? limitationNote ?? 'Add course-specific facts or source details before submitting this output.'
      : limitationNote,
    warnings: sanitizeStringList(response.warnings ?? [], 6).map(sanitizeInternalModeLabels),
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
  const nextLabel = history.length === 0
    ? 'Initial generation'
    : request.refinementInstruction
      ? `Refinement ${history.length + 1}`
      : `Revision ${history.length + 1}`
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
    context.resourceSnippet,
    context.sourceText,
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

export function classifyTaskOutputSourceMode(input: {
  title: string
  instructions: string
  requirements?: string[]
  selectedContext?: string[]
  groundingStatus: TaskOutputGroundingStatus
  preset?: TaskOutputPreset
  outputType?: TaskOutputTargetType
}): TaskOutputSourceMode {
  const selectedContextChars = cleanBlock((input.selectedContext ?? []).join('\n')).length
  if (requiresCourseProvidedSource(input) && selectedContextChars < 220 && !isResearchStyleDeliverable(input)) {
    return 'source_limited_scaffold'
  }
  if (input.groundingStatus === 'grounded' && selectedContextChars >= 500) return 'course_grounded'

  if (isResearchStyleDeliverable(input) && selectedContextChars < 500) {
    return 'general_research_labeled'
  }

  if (input.groundingStatus === 'grounded') return 'course_grounded'
  return 'source_limited_scaffold'
}

function requiresCourseProvidedSource(input: {
  title: string
  instructions: string
  requirements?: string[]
}) {
  const text = normalizeComparisonText([
    input.title,
    input.instructions,
    ...(input.requirements ?? []),
  ].join(' '))
  return /\busing (?:the )?(?:module|course|class|lecture|reading|readings|textbook|canvas|provided material|notes)\b|\bfrom (?:the )?(?:module|course|class|lecture|reading|readings|textbook|canvas|provided material|notes)\b|\baccording to (?:the )?(?:module|course|class|lecture|reading|readings|textbook|canvas|provided material|notes)\b|\bassigned readings?\b|\bcourse evidence\b|\bmodule framework\b/i.test(text)
}

function isResearchStyleDeliverable(input: {
  title: string
  instructions: string
  requirements?: string[]
  preset?: TaskOutputPreset
  outputType?: TaskOutputTargetType
}) {
  const text = normalizeComparisonText([
    input.title,
    input.instructions,
    ...(input.requirements ?? []),
    input.preset ?? '',
    input.outputType ?? '',
  ].join(' '))
  const asksForResearch = /\b(research|investigate|investigation|case stud(?:y|ies)|top\s+\d+|most infamous|past decade|current events?|recent examples?|technology topics?|security threats?|malware|viruses?|references?|apa|citations?)\b/i.test(text)
    || /\b(?:compare|comparison|analyze|analysis)\b.*\b(?:technology|security|malware|viruses?|threats?|current|recent)\b/i.test(text)
  const deliverableShape = /\b(report|essay|paper|analysis|presentation|document|webpage|html|pdf|docx|ppt|table|summary)\b/i.test(text)
  const shortAnswer = /\b(2\s*[-–]\s*3|two\s+to\s+three|one|two|three)\s+(?:complete\s+)?sentences?\b/i.test(text)
    || /\bshort answer\b|\bdiscussion post\b|\breflection\b/.test(text)

  return asksForResearch && deliverableShape && !shortAnswer
}

function buildTaskOutputTitle(input: TaskOutputRequest) {
  return input.title
}

function buildTaskOutputSummary(input: TaskOutputRequest, fallback: boolean) {
  const lead = input.sourceMode === 'general_research_labeled'
    ? 'General research task output'
    : input.groundingStatus === 'limited'
    ? 'Limited-grounding scaffold'
    : 'Grounded task output'
  const tail = input.sourceMode === 'general_research_labeled'
    ? 'prepared with honest general/background research labeling because course source context was insufficient.'
    : fallback
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

function buildGeneralResearchUnavailablePreview(input: TaskOutputRequest, previewMode: TaskOutputPreviewMode) {
  const body = [
    input.title,
    '',
    'General/background research mode',
    'This assignment asks for a completed research deliverable, but the generation model was unavailable in this run. Course-provided factual source content was insufficient, so Stay Focused did not create a fake completed report from placeholders.',
    '',
    'Recommended retry',
    'Regenerate this Task Output when the model is available. The completed pass should include the deliverable first, clear general/background research labeling, and references that are honest about verification needs.',
  ].join('\n')

  if (previewMode === 'html') {
    return [
      '<main class="task-output-shell">',
      `  <h1>${escapeHtml(input.title)}</h1>`,
      '  <section>',
      '    <h2>General/background research mode</h2>',
      '    <p>This assignment asks for a completed research deliverable, but the generation model was unavailable in this run. Course-provided factual source content was insufficient, so Stay Focused did not create a fake completed report from placeholders.</p>',
      '  </section>',
      '</main>',
    ].join('\n')
  }

  return body
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

export function evaluateTaskOutputReadiness(input: {
  request: TaskOutputRequest
  previewContent: string
  summary?: string | null
  warnings?: string[]
  limitationNote?: string | null
}): TaskOutputReadinessEvaluation {
  const text = stripHtml(cleanBlock(input.previewContent))
  const normalized = normalizeComparisonText(text)
  const taskText = normalizeComparisonText([
    input.request.title,
    input.request.instructions,
    input.request.requirements.join(' '),
  ].join(' '))
  const selectedContextText = normalizeComparisonText(input.request.selectedContext.join(' '))
  const reasons: string[] = []

  const substantiveWords = normalized
    .split(/\s+/)
    .filter((word) => /^[a-z][a-z'-]{3,}$/i.test(word))
    .filter((word) => !TEMPLATE_STOP_WORDS.has(word))
  const uniqueSubstantiveWords = new Set(substantiveWords)
  const underscoreRuns = (input.previewContent.match(/_{4,}/g) ?? []).length
  const placeholderPhrases = countMatches(normalized, [
    /\bfill in (?:this|the) section\b/g,
    /\breplace (?:the )?placeholders?\b/g,
    /\badd (?:real|course-specific|your|the strongest|grounded) (?:task )?(?:evidence|detail|details|content)\b/g,
    /\bwrite (?:your|the) answer here\b/g,
    /\badd sources?\b/g,
    /\badd citations?\b/g,
    /\bto be completed after research\b/g,
    /\bmust be completed after research\b/g,
    /\bcomplete(?:d)? after research\b/g,
    /\bexternal (?:factual )?sources? (?:are|is) required\b/g,
    /\bexternal research (?:is )?required\b/g,
    /\brequires external sources\b/g,
    /\bresearch checklist\b/g,
    /\bfinalization checklist\b/g,
    /\bcandidate selection criteria\b/g,
    /\bplaceholder\b/g,
    /\btbd\b/g,
  ])
  const emptyFieldLines = text
    .split('\n')
    .filter((line) => /^\s*(?:[A-Z][A-Za-z /-]{2,40}|[-*]\s*[A-Z][A-Za-z /-]{2,40})\s*:\s*(?:_+|--+|\[.*?\])?\s*$/.test(line))
    .length
  const genericHeadingCount = text
    .split('\n')
    .filter((line) => /^(?:#{1,3}\s*)?(purpose|deliverable focus|grounded context|next edit pass|introduction|background|analysis|conclusion|references|recommendations|source requirements|research plan)\s*:?\s*$/i.test(line.trim()))
    .length
  const emptyTableRows = text
    .split('\n')
    .filter((line) => /\|/.test(line) && /\b(tbd|n\/a|fill|research needed|source needed)\b|_{3,}|\[\s*\]/i.test(line))
    .length
  const metaInstructionSentences = countMatches(normalized, [
    /\bstudents should\b/g,
    /\bthe student should\b/g,
    /\bthis report should\b/g,
    /\bthis section should\b/g,
  ])
  const hasResearchRequirement = /\b(research|investigate|top\s+\d+|past decade|sources?|references?|citations?|case stud(?:y|ies)|current events?|recent examples?)\b/i.test(taskText)
  const hasCourseSourceRequirement = /\b(course|module|class|lecture|reading|readings|textbook|canvas|source|sources|provided material|notes|rubric)\b/i.test(taskText)
  const selectedContextChars = selectedContextText.length
  const usesGeneralResearch = input.request.sourceMode === 'general_research_labeled'
  const hasInsufficientResearchSource = hasResearchRequirement && selectedContextChars < 500 && !usesGeneralResearch
  const hasMissingCourseSource = !hasResearchRequirement && hasCourseSourceRequirement && selectedContextChars < 220
  const hasGeneralResearchLabel = /\b(general|background)\s+(?:research|knowledge|references?|sources?)\b|\bcourse-provided source content (?:was|is) insufficient\b|\bverify (?:before|prior to) submission\b/i.test(text)
  const falselyClaimsCourseSources = usesGeneralResearch && /\bcourse[- ]provided (?:sources?|evidence|references?)\b|\bselected course sources?\b|\bsource-grounded\b/i.test(text)
  const contentWords = new Set(substantiveWords)
  const instructionWords = new Set(taskText.split(/\s+/).filter((word) => /^[a-z][a-z'-]{3,}$/i.test(word)))
  const copiedInstructionWords = [...contentWords].filter((word) => instructionWords.has(word)).length
  const newContentWords = [...contentWords].filter((word) => !instructionWords.has(word)).length
  const copiedInstructionsOnly = instructionWords.size >= 8
    && copiedInstructionWords >= Math.min(12, instructionWords.size)
    && newContentWords < 26
  const exactInstructionRestated = input.request.instructions.length >= 60
    && normalized.includes(normalizeComparisonText(input.request.instructions).slice(0, 80))
    && newContentWords < 35
  const sameAsInstructions = normalized === normalizeComparisonText(input.request.instructions)
  const assignmentTextRestated = normalized.length >= 60
    && taskText.includes(normalized)
    && newContentWords < 20

  if (input.request.groundingStatus === 'limited' && !usesGeneralResearch) reasons.push('limited_grounding')
  if (usesGeneralResearch && !hasGeneralResearchLabel) reasons.push('missing_general_research_label')
  if (falselyClaimsCourseSources) reasons.push('fake_course_source_claim')
  if (underscoreRuns >= 2) reasons.push('blank_lines_or_underscores')
  if (placeholderPhrases >= 2) reasons.push('placeholder_language')
  if (hasResearchRequirement && placeholderPhrases >= 1) reasons.push('external_research_required')
  if (emptyFieldLines >= 3) reasons.push('empty_fields')
  if (emptyTableRows >= 2) reasons.push('empty_table')
  if (metaInstructionSentences >= 2) reasons.push('meta_instruction_language')
  if (genericHeadingCount >= 5 && uniqueSubstantiveWords.size < 55) reasons.push('generic_template_headings')
  if (uniqueSubstantiveWords.size < 35 && text.length < 900) reasons.push('too_little_substantive_content')
  if (sameAsInstructions || assignmentTextRestated || copiedInstructionsOnly || exactInstructionRestated) reasons.push('copied_assignment_instructions')
  if (hasInsufficientResearchSource) reasons.push('external_research_required')
  if (hasMissingCourseSource && !usesGeneralResearch) reasons.push('course_source_content_required')

  if (reasons.includes('external_research_required')) {
    return {
      status: 'needs_research',
      label: 'Needs research',
      ready: false,
      reasons,
    }
  }

  if (reasons.some((reason) => reason === 'blank_lines_or_underscores' || reason === 'placeholder_language' || reason === 'empty_fields' || reason === 'empty_table' || reason === 'meta_instruction_language' || reason === 'generic_template_headings' || reason === 'copied_assignment_instructions')) {
    return {
      status: 'draft_outline_only',
      label: 'Draft outline only',
      ready: false,
      reasons,
    }
  }

  if (reasons.includes('course_source_content_required') || (input.request.groundingStatus === 'limited' && !usesGeneralResearch)) {
    return {
      status: 'needs_course_source_content',
      label: 'Needs source content',
      ready: false,
      reasons,
    }
  }

  if (reasons.length > 0) {
    return {
      status: 'insufficient_content',
      label: 'Could not generate enough usable content',
      ready: false,
      reasons,
    }
  }

  return {
    status: 'ready',
    label: 'Output ready',
    ready: true,
    reasons: [],
  }
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

function sanitizeInternalModeLabels(value: string) {
  return value
    .replace(/\bgeneral_research_labeled\b/g, 'general/background research')
    .replace(/\bcourse_grounded\b/g, 'course-grounded')
    .replace(/\bsource_limited_scaffold\b/g, 'source-limited scaffold')
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

function countMatches(value: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (value.match(pattern)?.length ?? 0), 0)
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

const TEMPLATE_STOP_WORDS = new Set([
  'purpose',
  'deliverable',
  'focus',
  'grounded',
  'context',
  'next',
  'edit',
  'pass',
  'introduction',
  'background',
  'analysis',
  'conclusion',
  'references',
  'recommendations',
  'section',
  'source',
  'requirements',
  'placeholder',
  'fill',
  'replace',
])

export function buildTaskOutputPromptPreview(input: TaskOutputRequest, output?: StudyOutputTaskOutputContent | null) {
  const prompt = buildTaskOutputUserPrompt(input)
  const currentPreview = output?.previewContent ? cleanBlock(output.previewContent).slice(0, 720) : null

  return [
    'mode: grounded task output generation',
    '',
    `preset: ${input.preset}`,
    `output_type: ${input.outputType}`,
    `grounding_status: ${input.groundingStatus}`,
    `source_mode: ${input.sourceMode}`,
    '',
    'prompt_contract <<',
    prompt,
    '>>',
    currentPreview ? ['', 'latest_preview <<', currentPreview, '>>'].join('\n') : '',
  ].filter(Boolean).join('\n')
}
