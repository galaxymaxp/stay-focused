import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import {
  isTaskDraftResponse,
  parseTaskDraftResponseText,
  TASK_DRAFT_SYSTEM_PROMPT,
  type TaskDraftApiRequest,
} from '@/lib/do-now'
import { applyAutoPromptUserCookie, loadSavedAutoPrompt, saveAutoPromptResult } from '@/lib/do-now-store'

export const runtime = 'nodejs'

function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim()

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  if (!model) {
    throw new Error('OPENAI_MODEL is not set')
  }

  return { apiKey, model }
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}...`
    : normalized
}

function normalizeBlockString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined

  const normalized = value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return undefined

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}...`
    : normalized
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return undefined

  const items = value
    .map((entry) => normalizeString(entry, maxLength))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)

  return items.length > 0 ? items : undefined
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequestBody(body: unknown): TaskDraftApiRequest | null {
  if (!isPlainRecord(body)) return null

  const title = normalizeString(body.title, 160)
  const instructions = normalizeBlockString(body.instructions, 2400)
  const sourceKey = normalizeString(body.sourceKey, 400)

  if (!title || !instructions || !sourceKey) return null

  const course = normalizeString(body.course, 120)
  const moduleName = normalizeString(body.module, 160)
  const dueDate = normalizeString(body.dueDate, 80)
  const type = normalizeString(body.type, 60)
  const requirements = normalizeStringList(body.requirements, 8, 220)

  return {
    title,
    ...(course ? { course } : {}),
    ...(moduleName ? { module: moduleName } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(type ? { type } : {}),
    instructions,
    ...(requirements ? { requirements } : {}),
    sourceKey,
  }
}

export async function POST(req: NextRequest) {
  let rawBody: unknown

  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'Invalid JSON body',
      },
      { status: 400 },
    )
  }

  const body = readRequestBody(rawBody)

  if (!body) {
    return NextResponse.json(
      {
        ok: false,
        error: 'title, instructions, and sourceKey are required',
      },
      { status: 400 },
    )
  }

  let apiKey: string
  let model: string

  try {
    ({ apiKey, model } = getOpenAIConfig())
  } catch (error) {
    console.error('Task draft API configuration error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'Draft output generation is not configured on the server.',
      },
      { status: 500 },
    )
  }

  try {
    const savedResult = await loadSavedAutoPrompt(req, body)
    if (savedResult.cachedDraft) {
      const response = NextResponse.json({
        ok: true,
        draft: savedResult.cachedDraft,
        cacheStatus: 'hit',
      })
      applyAutoPromptUserCookie(response, savedResult.userKey)
      return response
    }

    const client = new OpenAI({ apiKey })

    const response = await client.responses.create({
      model,
      store: false,
      instructions: TASK_DRAFT_SYSTEM_PROMPT,
      input: savedResult.promptText,
      max_output_tokens: 4096,
    })

    console.log('Task draft raw response shape:', JSON.stringify({
      status: response.status,
      incomplete_details: response.incomplete_details,
      error: response.error,
      output_text_length: response.output_text?.length ?? 0,
      output_item_types: response.output.map((item) => item.type),
    }))

    if (response.status && response.status !== 'completed') {
      const reason = response.incomplete_details?.reason ?? response.status
      throw new Error(`Model response was not completed (${reason})`)
    }

    const draft = parseTaskDraftResponseText(response.output_text ?? '')

    if (!isTaskDraftResponse(draft)) {
      throw new Error('Model response did not match the expected draft output shape')
    }

    await saveAutoPromptResult({
      payload: body,
      userId: savedResult.userId,
      userKey: savedResult.userKey,
      storageKey: savedResult.storageKey,
      promptText: savedResult.promptText,
      contentHash: savedResult.contentHash,
      draft,
      rawText: response.output_text ?? undefined,
    })

    const successResponse = NextResponse.json({
      ok: true,
      draft,
      cacheStatus: 'miss',
    })
    applyAutoPromptUserCookie(successResponse, savedResult.userKey)
    return successResponse
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Task draft API error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: `OpenAI request failed: ${message}`,
      },
      { status: 500 },
    )
  }
}
