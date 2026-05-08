import { MIN_MEANINGFUL_SOURCE_CHARS } from '@/lib/extracted-text-quality'
import type { DeepLearnNote } from '@/lib/types'

export function deepLearnPackLooksMetadataGrounded(note: DeepLearnNote) {
  const debugLabelPattern = /\b(?:file title|source type of the file|module name|course name|extraction quality reported|source text quality reported|grounding strategy used|ai fallback|transcribed from scanned images|resource context|grounding status|best available source grounding)\b/i
  const refusalPattern = /\bi(?:'m| am)\s+unable\s+to\s+transcribe\b|\bi\s+can(?:not|'t)\s+transcribe\b/i

  const candidates = [
    ...note.answerBank.flatMap((item) => [item.cue, item.answer.examSafe, item.compactAnswer.examSafe, item.reviewText, item.sourceSnippet]),
    ...note.identificationItems.flatMap((item) => [item.prompt, item.answer.examSafe, item.reviewText, item.sourceSnippet]),
    ...note.likelyQuizTargets.flatMap((item) => [item.target, item.reason, item.reviewText, item.sourceSnippet]),
    ...note.distinctions.flatMap((item) => [item.conceptA, item.conceptB, item.difference, item.reviewText, item.sourceSnippet]),
    note.overview,
    ...note.cautionNotes,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

  if (candidates.length === 0) return false

  const flagged = candidates.filter((value) => debugLabelPattern.test(value) || refusalPattern.test(value))
  return flagged.length >= Math.max(2, Math.ceil(candidates.length * 0.2))
}

export function deepLearnNoteHasUntrustworthyGrounding(note: DeepLearnNote) {
  if (deepLearnPackLooksMetadataGrounded(note)) {
    return true
  }

  const sourceTextQuality = note.sourceGrounding.sourceTextQuality
  if (sourceTextQuality && sourceTextQuality !== 'meaningful') {
    return true
  }

  if (note.sourceGrounding.charCount > 0 && note.sourceGrounding.charCount >= MIN_MEANINGFUL_SOURCE_CHARS) {
    return false
  }

  if (note.sourceGrounding.groundingStrategy === 'insufficient') {
    return true
  }

  if (note.sourceGrounding.extractionQuality === 'empty' || note.sourceGrounding.extractionQuality === 'failed') {
    return true
  }

  return false
}
