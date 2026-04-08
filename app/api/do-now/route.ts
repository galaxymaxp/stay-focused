import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { isDoNowPrompt, type DoNowApiRequest, type DoNowPrompt } from '@/lib/do-now'

export const runtime = 'nodejs'

const DO_NOW_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['whatFirst', 'whatToProduce', 'whereToStart', 'smallestStep', 'urgencyNote'],
  properties: {
    whatFirst: {
      type: 'string',
      description: 'One immediate first action the student can do in the next five minutes.',
    },
    whatToProduce: {
      type: 'string',
      description: 'The likely deliverable or concrete learning target.',
    },
    whereToStart: {
      type: 'string',
      description: 'The best place to begin based on the provided task and module context.',
    },
    smallestStep: {
      type: 'string',
      description: 'The smallest meaningful next step after starting.',
    },
    urgencyNote: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: 'A short timing note only when the deadline makes it useful, otherwise null.',
    },
  },
} as const

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

function buildUserPrompt(input: DoNowApiRequest) {
  const lines = [
    'Help the student start this task right now without completing it for them.',
    'Keep every field concise, concrete, and cautious.',
    '',
    `Task title: ${input.taskTitle}`,
    `Task details: ${input.taskDetails ?? ''}`,
  ]

  if (input.resourceSnippet) {
    lines.push(`Assignment body: ${input.resourceSnippet}`)
  }

  lines.push(
    `Course: ${input.courseName ?? ''}`,
    `Module: ${input.moduleTitle ?? ''}`,
    `Module summary: ${input.moduleSummary ?? ''}`,
    `Concepts: ${(input.concepts ?? []).join(', ')}`,
    `Study prompts: ${(input.studyPrompts ?? []).join(' | ')}`,
    `Deadline: ${input.deadline ?? ''}`,
    '',
    'Do not invent facts that are not supported by the input.',
    'Do not write the assignment for the student.',
  )

  if (input.resourceSnippet) {
    lines.push('The assignment body above describes what the student must produce. Ground all four response fields in that content. Do not fall back to module concepts or study prompts when the assignment body is specific enough.')
  }

  lines.push(
    'If the context is thin, say that implicitly through cautious wording and still provide a practical next step.',
    'Return JSON only.',
  )

  return lines.join('\n')
}

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined

  const normalized = value.replace(/\s+/g, ' ').trim()
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

function readRequestBody(body: unknown): DoNowApiRequest | null {
  if (!isPlainRecord(body)) return null

  const taskTitle = normalizeString(body.taskTitle, 160)
  if (!taskTitle) return null

  const taskDetails = normalizeString(body.taskDetails, 700)
  const courseName = normalizeString(body.courseName, 120)
  const moduleTitle = normalizeString(body.moduleTitle, 160)
  const moduleSummary = normalizeString(body.moduleSummary, 360)
  const concepts = normalizeStringList(body.concepts, 6, 80)
  const studyPrompts = normalizeStringList(body.studyPrompts, 4, 160)
  const deadline = normalizeString(body.deadline, 80)
  const resourceSnippet = normalizeString(body.resourceSnippet, 600)

  return {
    taskTitle,
    ...(taskDetails ? { taskDetails } : {}),
    ...(courseName ? { courseName } : {}),
    ...(moduleTitle ? { moduleTitle } : {}),
    ...(moduleSummary ? { moduleSummary } : {}),
    ...(concepts ? { concepts } : {}),
    ...(studyPrompts ? { studyPrompts } : {}),
    ...(deadline ? { deadline } : {}),
    ...(resourceSnippet ? { resourceSnippet } : {}),
  }
}

function parsePromptResponse(content: string): DoNowPrompt {
  const trimmed = content.trim()

  if (!trimmed) {
    throw new Error('Model returned an empty response')
  }

  // Strip markdown code fences the model may wrap JSON in (```json ... ``` or ``` ... ```)
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    console.error('Do Now JSON parse failed. Raw output_text:', content)
    throw new Error('Model returned invalid JSON')
  }

  if (!isDoNowPrompt(parsed)) {
    console.error('Do Now shape mismatch. Parsed value:', parsed)
    throw new Error('Model response did not match the expected Do Now shape')
  }

  return parsed
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
        error: 'taskTitle is required',
      },
      { status: 400 },
    )
  }

  let apiKey: string
  let model: string

  try {
    ({ apiKey, model } = getOpenAIConfig())
  } catch (error) {
    console.error('Do Now API configuration error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'Do Now generation is not configured on the server.',
      },
      { status: 500 },
    )
  }

  try {
    const client = new OpenAI({ apiKey })

    const response = await client.responses.create({
      model,
      store: false,
      instructions: [
        'You help students start academic work without doing the work for them.',
        'Stay grounded in the provided context.',
        'Avoid invented facts.',
        'Make the next action feel immediately doable.',
        'Be concise: each field should be one or two sentences at most.',
      ].join(' '),
      input: buildUserPrompt(body),
      // Reasoning models (o3, o4-mini) spend tokens on internal reasoning before
      // emitting output. 2048 provides headroom for both reasoning and JSON output.
      max_output_tokens: 2048,
      text: {
        format: {
          type: 'json_schema',
          name: 'stay_focused_do_now',
          description: 'Structured Do Now guidance for the Stay Focused task panel.',
          strict: true,
          schema: DO_NOW_RESPONSE_SCHEMA,
        },
      },
    })

    console.log('Do Now raw response shape:', JSON.stringify({
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

    const prompt = parsePromptResponse(response.output_text)

    return NextResponse.json({
      ok: true,
      prompt,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Do Now API error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: `OpenAI request failed: ${message}`,
      },
      { status: 500 },
    )
  }
}
