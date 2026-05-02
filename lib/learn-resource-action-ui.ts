export interface LearnResourceActionUiInput {
  deepLearnCanGenerate?: boolean | null
  deepLearnStatus: 'not_started' | 'pending' | 'ready' | 'failed' | 'blocked' | 'unavailable'
  sourceReadinessBucket: 'ready' | 'needs_action' | 'unsupported'
  sourceReadinessState: string
}

export function shouldShowGenerateStudyPackAction(item: LearnResourceActionUiInput) {
  if (!item.deepLearnCanGenerate) return false
  if (item.sourceReadinessBucket !== 'ready') return false
  return item.deepLearnStatus !== 'ready'
    && item.deepLearnStatus !== 'pending'
    && item.deepLearnStatus !== 'unavailable'
}

export function shouldShowSourceOcrRetryAction(item: Pick<LearnResourceActionUiInput, 'sourceReadinessState'>) {
  return item.sourceReadinessState === 'visual_ocr_available'
    || item.sourceReadinessState === 'visual_ocr_failed'
    || item.sourceReadinessState === 'visual_ocr_completed_empty'
}
