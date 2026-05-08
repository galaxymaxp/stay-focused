import { classifyDeepLearnResourceReadiness, selectDeepLearnGroundingText } from '@/lib/deep-learn-readiness'
import { isMeaningfulDeepLearnSourceText } from '@/lib/extracted-text-quality'
import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { ModuleResource } from '@/lib/types'

const DEFAULT_DEEP_LEARN_MODEL = 'gpt-5-mini'

export const DEEP_LEARN_REFINEMENT_BAD_SOURCE_MESSAGE =
  'Deep Learn needs readable study text from the selected source before it can refine this pack.'

export function getDeepLearnRefinementModel(env: NodeJS.ProcessEnv = process.env) {
  return env.OPENAI_DEEP_LEARN_MODEL?.trim()
    || env.OPENAI_MODEL?.trim()
    || DEFAULT_DEEP_LEARN_MODEL
}

export function selectDeepLearnRefinementGrounding(input: {
  resource: ModuleSourceResource
  storedResource: ModuleResource | null
  canonicalResourceId: string | null
}): { ok: true; sourceText: string } | { ok: false; message: string } {
  const readiness = classifyDeepLearnResourceReadiness(input)
  if (!input.storedResource || !input.canonicalResourceId || !readiness.canGenerate) {
    return { ok: false, message: DEEP_LEARN_REFINEMENT_BAD_SOURCE_MESSAGE }
  }

  const sourceText = selectDeepLearnGroundingText(input.storedResource)
  if (!sourceText || !isMeaningfulDeepLearnSourceText({
    text: sourceText,
    title: input.storedResource.title,
  })) {
    return { ok: false, message: DEEP_LEARN_REFINEMENT_BAD_SOURCE_MESSAGE }
  }

  return { ok: true, sourceText }
}
