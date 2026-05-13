const ACRONYMS = new Set(['api', 'cia', 'css', 'html', 'http', 'https', 'id', 'infosec', 'ip', 'it', 'ocr', 'pdf', 'ui', 'url'])

const RAW_LABEL_SUFFIX_PATTERN = /\s*(?:->|=>|:)\s*(?:definition|define|list(?:\s+the)?(?:\s+\w+){0,4}|goals?|objectives?|examples?|items?|meaning|overview|summary|notes?)\s*$/i
const RAW_LABEL_PREFIX_PATTERN = /^(?:what\s+is|what\s+are|define|definition\s+of|goals?\s+of|goals?)\s+/i

export function normalizeStudyOutputHeading(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^(?:goals?[-_\s]+)?cia(?:[-_\s]+triad)?$|^goals?[-_\s]+cia$/i.test(trimmed)) {
    return 'CIA Triad'
  }

  const withoutSuffix = trimmed
    .replace(RAW_LABEL_SUFFIX_PATTERN, '')
    .replace(/\s*->.*$/i, '')
    .trim()

  const spaced = withoutSuffix
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(RAW_LABEL_PREFIX_PATTERN, '')
    .trim()

  return titleCaseAcademicHeading(spaced || trimmed)
}

export function normalizeStudyOutputHeadingIfRaw(value: string) {
  return looksLikeRawExtractionHeading(value) ? normalizeStudyOutputHeading(value) : value.trim()
}

export function normalizeSourceFaithfulText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*[:;,-]\s*$/, '')
    .trim()
}

export function buildSourceWordingLine(sourceWording: string | null | undefined) {
  const cleaned = normalizeSourceFaithfulText(sourceWording ?? '')
  return cleaned ? `Source wording: "${cleaned}"` : null
}

export function buildSourceBasisLine(sourceWording: string | null | undefined) {
  const cleaned = normalizeSourceFaithfulText(sourceWording ?? '')
  return cleaned ? `Source basis: ${cleaned}` : null
}

function titleCaseAcademicHeading(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (ACRONYMS.has(lower)) return lower === 'infosec' ? 'InfoSec' : lower.toUpperCase()
      if (lower === 'cybersecurity') return 'Cybersecurity'
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join(' ')
}

function looksLikeRawExtractionHeading(value: string) {
  const trimmed = value.trim()
  return RAW_LABEL_SUFFIX_PATTERN.test(trimmed)
    || /^what[-_\s]+(?:is|are)[-_\s]+/i.test(trimmed)
    || /^goals[-_\s]+/i.test(trimmed)
    || /^[a-z0-9]+(?:[-_][a-z0-9]+){1,}$/i.test(trimmed)
}
