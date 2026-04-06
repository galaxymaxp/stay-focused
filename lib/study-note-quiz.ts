import type { StudyFileOutlineItem, StudyFileOutlineSection } from '@/lib/study-file-reader'

export type StudyNoteQuizStyle = 'multiple_choice' | 'identification' | 'short_answer'

export interface StudyNoteQuizItem {
  id: string
  style: StudyNoteQuizStyle
  prompt: string
  choices: string[]
  answer: string
  explanation: string
  sourceLabel: string | null
}

interface OutlineFact {
  id: string
  text: string
  trail: string[]
}

interface QuizCandidate {
  id: string
  answer: string
  prompt: string
  explanation: string
  sourceLabel: string | null
  preferredStyle: StudyNoteQuizStyle
}

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30]

const GENERIC_ANSWER_KEYS = new Set([
  'activity',
  'analysis',
  'answer',
  'content',
  'detail',
  'details',
  'example',
  'examples',
  'idea',
  'ideas',
  'information',
  'item',
  'items',
  'issue',
  'issues',
  'lesson',
  'module',
  'note',
  'notes',
  'overview',
  'part',
  'point',
  'points',
  'process',
  'question',
  'questions',
  'reading',
  'section',
  'sections',
  'slide',
  'slides',
  'source',
  'sources',
  'step',
  'steps',
  'study',
  'summary',
  'system',
  'term',
  'terms',
  'topic',
  'topics',
])

const DEFINITION_VERB_PATTERN = /(is|are|was|were|means|refers to|describes|involves|represents|includes|uses|allows|requires|causes|shows|explains|contains|consists of|depends on|creates|produces|changes|increases|decreases|improves|reduces|supports)\b/i

export function buildStudyNoteQuizItems(section: StudyFileOutlineSection): StudyNoteQuizItem[] {
  const facts = collectOutlineFacts(section.items)
  const candidates = facts
    .map((fact) => buildQuizCandidate(section, fact))
    .filter((candidate): candidate is QuizCandidate => Boolean(candidate))

  const uniqueCandidates = uniqueBy(candidates, (candidate) => `${normalizeLookup(candidate.prompt)}::${normalizeLookup(candidate.answer)}`)

  return uniqueCandidates.map((candidate, index) => {
    const distractors = uniqueBy(
      uniqueCandidates
        .filter((entry) => normalizeLookup(entry.answer) !== normalizeLookup(candidate.answer))
        .map((entry) => entry.answer)
        .filter((answer) => answer.length > 0),
      (answer) => normalizeLookup(answer),
    )
      .slice(0, 3)

    return {
      id: `${candidate.id}-${index}`,
      style: candidate.preferredStyle === 'multiple_choice'
        ? (distractors.length >= 3 ? 'multiple_choice' : 'identification')
        : candidate.preferredStyle,
      prompt: candidate.prompt,
      choices: candidate.preferredStyle === 'multiple_choice' && distractors.length >= 3
        ? sortChoices([candidate.answer, ...distractors])
        : [],
      answer: candidate.answer,
      explanation: candidate.explanation,
      sourceLabel: candidate.sourceLabel,
    }
  })
}

export function buildStudyNoteQuestionCountOptions(itemCount: number) {
  return QUESTION_COUNT_OPTIONS.filter((count) => count <= itemCount)
}

export function countQuizReadyStudyNotes(sections: StudyFileOutlineSection[]) {
  return sections.reduce((total, section) => {
    const quizItems = buildStudyNoteQuizItems(section)
    return total + (buildStudyNoteQuestionCountOptions(quizItems.length).length > 0 ? 1 : 0)
  }, 0)
}

export function countStudyNoteQuizItems(sections: StudyFileOutlineSection[]) {
  return sections.reduce((total, section) => total + buildStudyNoteQuizItems(section).length, 0)
}

export function countStudyNoteBullets(section: StudyFileOutlineSection) {
  return collectOutlineFacts(section.items).length
}

export function buildStudyNotePreview(section: StudyFileOutlineSection) {
  const facts = collectOutlineFacts(section.items)
  const preview = facts
    .map((fact) => fact.text)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')

  return trimAtBoundary(preview || section.title, 170)
}

function buildQuizCandidate(section: StudyFileOutlineSection, fact: OutlineFact): QuizCandidate | null {
  const labelDetailMatch = fact.text.match(/^([^:]{2,70}):\s+(.{12,240})$/)
  if (labelDetailMatch) {
    const answer = sanitizeAnswer(labelDetailMatch[1])
    const detail = cleanupPromptFragment(labelDetailMatch[2])
    if (answer && detail) {
      return {
        id: `${fact.id}-label`,
        answer,
        prompt: buildContextPrompt(
          fact.trail,
          `Which note label matches this detail: "${trimAtBoundary(detail, 150)}"?`,
        ),
        explanation: `This question stays inside "${section.title}" and uses the note detail exactly as extracted.`,
        sourceLabel: section.title,
        preferredStyle: 'multiple_choice',
      }
    }
  }

  const definitionMatch = fact.text.match(/^(.{2,70}?)\s+(is|are|was|were|means|refers to|describes|involves|represents|includes|uses|allows|requires|causes|shows|explains|contains|consists of|depends on|creates|produces|changes|increases|decreases|improves|reduces|supports)\s+(.{12,240})$/i)
  if (definitionMatch) {
    const answer = sanitizeAnswer(definitionMatch[1])
    const detail = cleanupPromptFragment(definitionMatch[3])
    if (answer && detail) {
      return {
        id: `${fact.id}-definition`,
        answer,
        prompt: buildContextPrompt(
          fact.trail,
          `Which term or idea is described here: "${trimAtBoundary(detail, 150)}"?`,
        ),
        explanation: `This clue comes directly from the extracted wording inside "${section.title}".`,
        sourceLabel: section.title,
        preferredStyle: 'multiple_choice',
      }
    }
  }

  const maskedPhrase = extractMaskablePhrase(fact.text)
  if (!maskedPhrase) return null

  const maskedLine = trimAtBoundary(
    fact.text.replace(maskedPhrase, '_____'),
    180,
  )

  return {
    id: `${fact.id}-cloze`,
    answer: maskedPhrase,
    prompt: buildContextPrompt(
      fact.trail,
      `Complete this note: "${maskedLine}"`,
    ),
    explanation: `The missing phrase is lifted from the same extracted note section instead of being generated from other material.`,
    sourceLabel: section.title,
    preferredStyle: 'short_answer',
  }
}

function collectOutlineFacts(items: StudyFileOutlineItem[], trail: string[] = [], path = 'root') {
  const collected: OutlineFact[] = []

  for (const [index, item] of items.entries()) {
    const text = sanitizeFactText(item.text)
    if (text && isUsefulFact(text)) {
      collected.push({
        id: `${path}-${index}`,
        text,
        trail: trail.filter(Boolean).slice(-2),
      })
    }

    if (item.children.length > 0) {
      collected.push(...collectOutlineFacts(
        item.children,
        text ? [...trail, text] : trail,
        `${path}-${index}`,
      ))
    }
  }

  return uniqueBy(collected, (fact) => normalizeLookup(fact.text))
}

function sanitizeFactText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\-\u2022*]+\s*/, '')
    .replace(/\s*[:;,-]\s*$/, '')
    .trim()
}

function isUsefulFact(value: string) {
  if (!value) return false
  if (value.length < 16 || value.length > 240) return false
  if (/^[0-9\s./()-]+$/.test(value)) return false
  if (/^(figure|image|page|slide|table)\b/i.test(value)) return false
  if (!/[A-Za-z]/.test(value)) return false
  return countWords(value) >= 3
}

function sanitizeAnswer(value: string) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^[\-\u2022*]+\s*/, '')
    .trim()

  if (!cleaned) return null
  if (cleaned.length < 2 || cleaned.length > 70) return null

  const wordCount = countWords(cleaned)
  if (wordCount === 0 || wordCount > 6) return null
  if (wordCount === 1 && cleaned.length < 6 && !/^[A-Z0-9-]{2,}$/.test(cleaned)) return null
  if (GENERIC_ANSWER_KEYS.has(normalizeLookup(cleaned))) return null
  if (/^(this|that|these|those|it|they|them)$/i.test(cleaned)) return null
  if (/^[0-9\s./()-]+$/.test(cleaned)) return null

  return cleaned
}

function cleanupPromptFragment(value: string) {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.length >= 12 ? cleaned : null
}

function extractMaskablePhrase(text: string) {
  const definitionLead = text.match(/^(.{2,70}?)\s+(.+)$/)
  const verbLead = text.match(new RegExp(`^(.{2,70}?)\\s+${DEFINITION_VERB_PATTERN.source}`, 'i'))
  const punctuationLead = text.match(/^(.{2,70}?)[,;()-]\s+.+$/)

  const rawCandidate = sanitizeAnswer(verbLead?.[1] ?? punctuationLead?.[1] ?? definitionLead?.[1] ?? '')
  if (!rawCandidate) return null

  const normalized = normalizeLookup(rawCandidate)
  if (GENERIC_ANSWER_KEYS.has(normalized)) return null
  if (/^(the|a|an)\b/i.test(rawCandidate)) return null

  return rawCandidate
}

function buildContextPrompt(trail: string[], prompt: string) {
  const context = trail[trail.length - 1]
  if (!context || normalizeLookup(context) === normalizeLookup(prompt)) {
    return prompt
  }

  return `Under "${trimAtBoundary(context, 52)}", ${lowercaseFirstLetter(prompt)}`
}

function lowercaseFirstLetter(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function normalizeLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string) {
  const seen = new Set<string>()
  const result: T[] = []

  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }

  return result
}

function sortChoices(choices: string[]) {
  return [...choices].sort((left, right) => left.localeCompare(right))
}

function trimAtBoundary(value: string, maxLength: number) {
  if (value.length <= maxLength) return value

  const boundary = value.slice(0, maxLength).match(/^(.+?)(?:[.;,:]\s|\s+\S*)?$/)
  return `${(boundary?.[1] ?? value.slice(0, maxLength)).trim()}...`
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}
