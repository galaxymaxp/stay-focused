import type { TaskOutputRequest } from '@/lib/task-output'

export type TaskOutputGenerationMode = 'initial_full' | 'refinement_reshape' | 'refinement_needs_facts'

const DEFAULT_TASK_OUTPUT_FULL_MODEL = 'gpt-5.4'
const DEFAULT_TASK_OUTPUT_REFINEMENT_MODEL = 'gpt-5-mini'

export function classifyTaskOutputGenerationMode(request: Pick<TaskOutputRequest, 'refinementInstruction' | 'previousOutput'>): TaskOutputGenerationMode {
  const instruction = request.refinementInstruction?.trim() ?? ''
  if (!instruction) return 'initial_full'

  if (requiresNewUnsupportedFacts(instruction)) return 'refinement_needs_facts'
  return 'refinement_reshape'
}

export function getTaskOutputModelForRequest(
  request: Pick<TaskOutputRequest, 'refinementInstruction' | 'previousOutput'>,
  env: NodeJS.ProcessEnv = process.env,
) {
  const mode = classifyTaskOutputGenerationMode(request)
  const fullModel = getTaskOutputFullModel(env)
  const miniModel = getTaskOutputRefinementModel(env)

  return {
    mode,
    model: mode === 'refinement_reshape' ? miniModel : fullModel,
    fullModel,
    refinementModel: miniModel,
  }
}

export function getTaskOutputFullModel(env: NodeJS.ProcessEnv = process.env) {
  return env.OPENAI_TASK_OUTPUT_FULL_MODEL?.trim()
    || env.OPENAI_TASK_OUTPUT_MODEL?.trim()
    || env.OPENAI_MODEL?.trim()
    || DEFAULT_TASK_OUTPUT_FULL_MODEL
}

export function getTaskOutputRefinementModel(env: NodeJS.ProcessEnv = process.env) {
  return env.OPENAI_TASK_OUTPUT_REFINEMENT_MODEL?.trim()
    || env.OPENAI_DO_NOW_MODEL?.trim()
    || env.OPENAI_MODEL_MINI?.trim()
    || DEFAULT_TASK_OUTPUT_REFINEMENT_MODEL
}

export function isTaskOutputReshapeOnlyRefinement(instruction: string) {
  const normalized = instruction.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  if (requiresNewUnsupportedFacts(normalized)) return false

  return /\b(formal|casual|shorter|longer|concise|simpler|wording|tone|table|bullet|bullets|format|organize|organization|reorganize|structure|rewrite|polish|conclusion|intro|introduction|paragraph|follow.*format|student wording)\b/i.test(normalized)
}

export function requiresNewUnsupportedFacts(instruction: string) {
  const normalized = instruction.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!normalized) return false

  return /\b(add|include|complete|finish|fill|make it complete|make complete|research|sources?|citations?|apa|references?|facts?|examples?|cases?|current|latest|top\s*\d+|threat names?|malware|virus|impact figures?|dates?|statistics?|external)\b/i.test(normalized)
}
