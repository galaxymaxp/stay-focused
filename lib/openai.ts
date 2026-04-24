import OpenAI from 'openai'
import type { AIResponse } from './types'

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables')
  }
  return new OpenAI({ apiKey })
}

const SYSTEM_PROMPT = `You are an academic task extractor. 
Given raw module content (syllabus, announcement, study material, assignment brief), extract structured information.

Return ONLY valid JSON — no markdown, no code fences, no explanation. 

Rules:
- If no clear deadline exists for a task, set deadline to null. Do NOT invent dates.
- If the text is ambiguous about priority, default to "medium".
- Keep the summary to 2-3 sentences maximum.
- The title should be 8 words or fewer.
- recommended_order should list task titles in the suggested completion order.
- If the content includes resource extracts from PDFs or slide decks, use that material to improve the summary, concepts, and study prompts.

Return this exact shape:
{
  "title": "string",
  "summary": "string",
  "concepts": ["string"],
  "study_prompts": ["string"],
  "tasks": [
    {
      "title": "string",
      "details": "string or null",
      "deadline": "YYYY-MM-DD or null",
      "priority": "high | medium | low",
      "task_type": "assignment | quiz | reading | prep | discussion | project",
      "estimated_minutes": 20
    }
  ],
  "deadlines": [
    { "label": "string", "date": "YYYY-MM-DD" }
  ],
  "recommended_order": ["task title", ...]
}`

export async function generateCourseSummary(courseName: string, contextSnippet?: string): Promise<string> {
  try {
    const client = getClient()
    const contextLine = contextSnippet ? `\nContext: ${contextSnippet.slice(0, 400)}` : ''
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Generate a 1-2 sentence summary of this course for students. Be concise, friendly, and helpful.\n\nTitle: ${courseName}${contextLine}\n\nSummary:`,
      }],
      max_tokens: 100,
      temperature: 0.7,
    })
    return completion.choices[0].message.content?.trim() || 'Course overview not available'
  } catch {
    return 'Course overview not available'
  }
}

export async function processModuleContent(content: string): Promise<AIResponse> {
  const client = getClient()

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Process this module content:\n\n${content}` }
    ],
    max_tokens: 16384,
    temperature: 0.2,  // low temp = more predictable structured output
  })

  const choice = response.choices[0]
  const finishReason = choice?.finish_reason
  if (finishReason === 'length') {
    throw new Error('AI response was truncated (token limit reached) - module content may be too long')
  }

  const raw = choice?.message?.content
  if (!raw) throw new Error('Empty response from OpenAI')

  let parsed: AIResponse
  try {
    parsed = JSON.parse(raw) as AIResponse
  } catch {
    throw new Error(`Failed to parse AI response (finish_reason=${finishReason}): ${raw.slice(0, 200)}`)
  }

  if (!parsed.title || !parsed.summary || !Array.isArray(parsed.tasks)) {
    throw new Error('AI response missing required fields')
  }
  parsed.concepts = Array.isArray(parsed.concepts) ? parsed.concepts : []
  parsed.study_prompts = Array.isArray(parsed.study_prompts) ? parsed.study_prompts : []
  return parsed
}
