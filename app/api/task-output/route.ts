import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import {
  TASK_OUTPUT_SYSTEM_PROMPT,
  buildTaskOutputFallback,
  buildTaskOutputRequest,
  buildTaskOutputUserPrompt,
  detectTaskOutputFormat,
  normalizeTaskOutputModelResponse,
  type TaskOutputModelResponse,
  type TaskOutputRequest,
} from '@/lib/task-output'
import type { TaskDraftContext } from '@/lib/do-now'
import type { TaskOutputPreset, TaskOutputTargetType } from '@/lib/types'

export const runtime = 'nodejs'

const DEFAULT_TASK_OUTPUT_MODEL = 'gpt-5-mini'

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_TASK_OUTPUT_MODEL?.trim()
    || process.env.OPENAI_DO_NOW_MODEL?.trim()
    || process.env.OPENAI_MODEL?.trim()
    || DEFAULT_TASK_OUTPUT_MODEL

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  return { apiKey, model }
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized
}

function normalizeBlockString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined
  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) return undefined
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => normalizeString(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePreset(value: unknown): TaskOutputPreset | null {
  return value === 'report' || value === 'presentation' || value === 'reviewer' || value === 'webpage' || value === 'documentation'
    ? value
    : null
}

function normalizeOutputType(value: unknown): TaskOutputTargetType | null {
  return value === 'docx' || value === 'pdf' || value === 'ppt' || value === 'html' || value === 'css' || value === 'js'
    ? value
    : null
}

function readLegacyContext(body: Record<string, unknown>): TaskDraftContext | null {
  const taskId = normalizeString(body.taskId, 120) ?? null
  const moduleId = normalizeString(body.moduleId, 120) ?? null
  const courseId = normalizeString(body.courseId, 120) ?? null
  const taskTitle = normalizeString(body.taskTitle, 160)
  const courseName = normalizeString(body.courseName, 120)

  if (!taskTitle || !courseName) return null

  return {
    taskId,
    moduleId,
    courseId,
    taskTitle,
    taskDetails: normalizeBlockString(body.taskDetails, 3200) ?? null,
    deadline: normalizeString(body.deadline, 120) ?? null,
    priority: body.priority === 'high' || body.priority === 'medium' || body.priority === 'low' ? body.priority : null,
    courseName,
    moduleTitle: normalizeString(body.moduleTitle, 160) ?? null,
    studyPrompts: normalizeStringList(body.studyPrompts, 8, 220),
    concepts: normalizeStringList(body.concepts, 8, 220),
    moduleSummary: normalizeBlockString(body.moduleSummary, 2200) ?? null,
    resourceSnippet: normalizeBlockString(body.resourceSnippet, 2600) ?? null,
    canvasUrl: normalizeString(body.canvasUrl, 400) ?? null,
    learnHref: normalizeString(body.learnHref, 400) ?? null,
    sourceTitle: normalizeString(body.sourceTitle, 200) ?? null,
    sourceType: normalizeString(body.sourceType, 80) ?? null,
    sourceHref: normalizeString(body.sourceHref, 400) ?? null,
    sourceText: normalizeBlockString(body.sourceText, 6000) ?? null,
    sourceNote: normalizeBlockString(body.sourceNote, 1200) ?? null,
  }
}

function readTaskOutputRequest(body: unknown): TaskOutputRequest | null {
  if (!isPlainRecord(body)) return null

  const preset = normalizePreset(body.preset)
  const outputType = normalizeOutputType(body.outputType)

  if (preset && outputType) {
    const taskId = normalizeString(body.taskId, 120)
    const title = normalizeString(body.title, 160)
    const instructions = normalizeBlockString(body.instructions, 6000)
    const sourceKey = normalizeString(body.sourceKey, 400)
    if (!taskId || !title || !instructions || !sourceKey) return null

    return {
      taskId,
      title,
      ...(normalizeString(body.course, 120) ? { course: normalizeString(body.course, 120) } : {}),
      ...(normalizeString(body.module, 160) ? { module: normalizeString(body.module, 160) } : {}),
      ...(normalizeString(body.dueDate, 80) ? { dueDate: normalizeString(body.dueDate, 80) } : {}),
      ...(normalizeString(body.taskType, 60) ? { taskType: normalizeString(body.taskType, 60) } : {}),
      instructions,
      requirements: normalizeStringList(body.requirements, 8, 220),
      sourceKey,
      preset,
      outputType,
      selectedContext: normalizeStringList(body.selectedContext, 6, 800),
      groundingStatus: body.groundingStatus === 'limited' ? 'limited' : 'grounded',
      detectedFormat: detectTaskOutputFormat({
        title,
        instructions,
        requirements: normalizeStringList(body.requirements, 8, 220),
        preset,
        outputType,
      }),
    }
  }

  const legacyContext = readLegacyContext(body)
  const legacyPreset = normalizePreset(body.preset)
  const legacyOutputType = normalizeOutputType(body.outputType)
  if (!legacyContext || !legacyPreset || !legacyOutputType) return null
  return buildTaskOutputRequest(legacyContext, { preset: legacyPreset, outputType: legacyOutputType })
}

function normalizeModelOutput(raw: unknown): TaskOutputModelResponse | null {
  if (!isPlainRecord(raw)) return null

  return {
    title: normalizeString(raw.title, 220) ?? '',
    summary: normalizeString(raw.summary, 260) ?? '',
    previewMode: raw.previewMode === 'html' || raw.previewMode === 'code' || raw.previewMode === 'rich_text'
      ? raw.previewMode
      : 'rich_text',
    previewContent: normalizeBlockString(raw.previewContent, 24000) ?? '',
    stylesheet: normalizeBlockString(raw.stylesheet, 12000) ?? null,
    script: normalizeBlockString(raw.script, 12000) ?? null,
    groundingNote: normalizeString(raw.groundingNote, 260) ?? '',
    limitationNote: normalizeString(raw.limitationNote, 260) ?? null,
    warnings: normalizeStringList(raw.warnings, 6, 220),
    requirementsUsed: normalizeStringList(raw.requirementsUsed, 8, 220),
    selectedContextUsed: normalizeStringList(raw.selectedContextUsed, 6, 300),
  }
}

export async function POST(req: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const requestBody = readTaskOutputRequest(rawBody)
  if (!requestBody) {
    return NextResponse.json({ ok: false, error: 'taskId, preset, outputType, title, instructions, and sourceKey are required' }, { status: 400 })
  }

  const fallback = buildTaskOutputFallback(requestBody)
  if (requestBody.groundingStatus === 'limited') {
    return NextResponse.json({ ok: true, output: fallback, cacheStatus: 'miss' as const })
  }

  let apiKey: string
  let model: string
  try {
    ({ apiKey, model } = getOpenAIConfig())
  } catch (error) {
    console.error('Task output API configuration error:', error)
    return NextResponse.json({ ok: true, output: fallback, cacheStatus: 'miss' as const })
  }

  try {
    const client = new OpenAI({ apiKey })
    const response = await client.responses.create({
      model,
      store: false,
      instructions: TASK_OUTPUT_SYSTEM_PROMPT,
      input: buildTaskOutputUserPrompt(requestBody),
      max_output_tokens: 10000,
    })

    if (response.status && response.status !== 'completed') {
      throw new Error(`Model response was not completed (${response.incomplete_details?.reason ?? response.status})`)
    }

    const normalized = normalizeModelOutput(tryParseJson(response.output_text ?? ''))
    if (!normalized) {
      throw new Error('Model response did not match the expected task output shape')
    }

    const output = normalizeTaskOutputModelResponse(normalized, requestBody, null)
    return NextResponse.json({
      ok: true,
      output,
      cacheStatus: 'miss' as const,
    })
  } catch (error) {
    console.error('Task output API error:', error)
    return NextResponse.json({
      ok: true,
      output: fallback,
      cacheStatus: 'miss' as const,
    })
  }
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
