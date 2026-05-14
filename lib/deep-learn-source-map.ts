import { sanitizeStudentFacingText } from '@/lib/deep-learn'
import { normalizeStudyOutputHeading } from '@/lib/study-outputs/source-faithful'

const DEFAULT_SOURCE_MAP_GROUNDING_CHARS = 12000
const STRUCTURED_SOURCE_MAP_CHARS = 7800
const EXACT_SOURCE_QUOTE_CHARS = 3800

export type AcademicSourceMapUnitKind =
  | 'concept'
  | 'definition'
  | 'list'
  | 'category'
  | 'process'

export interface AcademicSourceMapUnit {
  id: string
  title: string
  kind: AcademicSourceMapUnitKind
  summary: string
  items: string[]
  sourceQuotes: string[]
  importanceScore: number
  confidence: number
}

export interface AcademicSourceMap {
  version: 'academic-source-map-v1'
  normalizedText: string
  units: AcademicSourceMapUnit[]
  chunks: Array<{ heading: string; text: string; sourceQuote: string }>
  duplicateFragmentsRemoved: number
  validation: AcademicSourceMapValidation
}

export interface AcademicSourceMapValidation {
  ok: boolean
  reason: 'ok' | 'empty' | 'metadata_only' | 'no_units' | 'missing_quotes'
  unitCount: number
  quoteCount: number
}

interface SourceChunk {
  heading: string
  text: string
  sourceQuote: string
}

const SOURCE_MAP_HEADINGS = [
  'What is IT Security',
  'Goal of IT Security',
  'Domains of IT Security',
  'What is Cybersecurity all about',
  'What is Cybersecurity',
  'Importance of cybersecurity',
  'Challenges of Cybersecurity',
  'Impact of a Security Breach',
  'Types of Attackers',
  'Definition of Terms',
  'Types of Cybersecurity Threats',
  'Types of Malware',
  'Symptoms of Malware',
  'Methods of Infiltration',
  'Methods to Deny Service',
  'Blended Attacks',
  'Impact Reduction',
]

const SOURCE_MAP_STOP_TOKENS = [
  'Goal of IT Security',
  'Domains of IT Security',
  'What is Cybersecurity?',
  'What is Cybersecurity',
  'Importance of Cybersecurity',
  'Importance of cybersecurity',
  'Challenges of Cybersecurity',
  'Impact of a Security Breach',
  'Types of Attackers',
  'Definition of Terms',
  'Types of Cybersecurity Threats',
  'Types of Malware',
  'Symptoms of Malware',
  'Methods of Infiltration',
  'Methods to Deny Service',
  'Blended Attacks',
  'Impact Reduction',
  'Attacks backed by state agencies that',
]

const HIGH_IMPORTANCE_PATTERNS = [
  /\bdefinition\b/i,
  /\bwhat is\b/i,
  /\bgoal\b/i,
  /\bcia triad\b/i,
  /\bconfidentiality\b/i,
  /\bintegrity\b/i,
  /\bavailability\b/i,
  /\bvulnerability\b/i,
  /\bexploit\b/i,
  /\bbreach\b/i,
  /\bimportance\b/i,
  /\bimpact reduction\b/i,
  /\bblended attacks?\b/i,
]

const RECOGNIZED_SOURCE_MAP_TERMS = new Set([
  'it security',
  'infosec vs it sec',
  'infosec',
  'it sec',
  'cia triad',
  'cybersecurity',
  'domains of it security',
  'importance of cybersecurity',
  'challenges',
  'challenges of cybersecurity',
  'types of attackers',
  'vulnerability',
  'exploit',
  'breach',
  'vulnerability exploit breach',
  'cybercrime disruption espionage',
  'malware types',
  'malware symptoms',
  'infiltration methods',
  'denial of service methods',
  'blended attacks',
  'impact reduction',
])

export function buildAcademicSourceMap(sourceText: string): AcademicSourceMap {
  const cleanedLines = cleanupSourceMapLines(sourceText)
  const collapsed = collapseDuplicateFragments(cleanedLines)
  const normalizedText = collapsed.lines.join('\n')
  const chunks = chunkSourceMapByHeadings(normalizedText)
  const units = dedupeUnits([
    ...buildUnitsFromChunks(chunks),
    ...inferKnownSecurityUnits(normalizedText),
  ])
    .sort((left, right) => right.importanceScore - left.importanceScore || left.title.localeCompare(right.title))
    .slice(0, 36)
  const validation = validateAcademicSourceMap({
    version: 'academic-source-map-v1',
    normalizedText,
    chunks,
    units,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
    validation: { ok: false, reason: 'no_units', unitCount: 0, quoteCount: 0 },
  })

  return {
    version: 'academic-source-map-v1',
    normalizedText,
    chunks,
    units,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
    validation,
  }
}

export function validateAcademicSourceMap(sourceMap: AcademicSourceMap): AcademicSourceMapValidation {
  if (!sourceMap.normalizedText.trim()) {
    return { ok: false, reason: 'empty', unitCount: 0, quoteCount: 0 }
  }
  if (looksMetadataOnly(sourceMap.normalizedText)) {
    return { ok: false, reason: 'metadata_only', unitCount: 0, quoteCount: 0 }
  }

  const unitCount = sourceMap.units.length
  const quoteCount = sourceMap.units.reduce((count, unit) => count + unit.sourceQuotes.length, 0)
  if (unitCount === 0) return { ok: false, reason: 'no_units', unitCount, quoteCount }
  if (quoteCount < Math.min(2, unitCount)) return { ok: false, reason: 'missing_quotes', unitCount, quoteCount }
  return { ok: true, reason: 'ok', unitCount, quoteCount }
}

export function buildAcademicSourceMapGrounding(sourceText: string, maxChars = DEFAULT_SOURCE_MAP_GROUNDING_CHARS) {
  const sourceMap = buildAcademicSourceMap(sourceText)
  if (!sourceMap.validation.ok) return ''

  const unitLines = sourceMap.units.flatMap((unit) => {
    const lines = [
      `- ${unit.title} [${unit.kind}, importance ${unit.importanceScore}/100]: ${unit.summary}`,
    ]
    if (unit.items.length > 0) lines.push(`  Items: ${unit.items.slice(0, 10).join(', ')}`)
    if (unit.sourceQuotes[0]) lines.push(`  Source quote: "${unit.sourceQuotes[0]}"`)
    return lines
  })
  const structured = truncateForSourceMapModel([
    'Deterministic academic structure from the selected source (Academic Source Map):',
    ...unitLines,
  ].join('\n'), Math.min(STRUCTURED_SOURCE_MAP_CHARS, Math.max(2400, maxChars - 1800)))
  const quoteBlock = truncateForSourceMapModel([
    'Closest source passages for exact wording:',
    ...sourceMap.chunks.slice(0, 12).map((chunk) => `- ${chunk.heading}: ${chunk.sourceQuote}`),
  ].join('\n'), Math.min(EXACT_SOURCE_QUOTE_CHARS, Math.max(1400, maxChars - structured.length - 160)))

  return truncateForSourceMapModel(`${structured}\n\n${quoteBlock}`, maxChars)
}

function cleanupSourceMapLines(sourceText: string) {
  const normalized = sourceText
    .replace(/\r/g, '\n')
    .replace(/â€¢/g, ' • ')
    .replace(/\u2022/g, ' • ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+(?=\d+[.)]\s+[A-Z])/g, '\n')
    .trim()

  return normalized
    .split(/\n+/)
    .flatMap(splitInlineSourceMapHeadings)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .filter((line) => !isSourceMapNoiseLine(line))
    .slice(0, 520)
}

function splitInlineSourceMapHeadings(line: string) {
  let current = line
  for (const heading of [...SOURCE_MAP_HEADINGS].sort((left, right) => right.length - left.length)) {
    const pattern = new RegExp(`\\s+(${escapeRegExp(heading)}\\??)(?=\\s|\\d+[.)])`, 'gi')
    current = current.replace(pattern, '\n$1 ')
  }
  return current.split('\n')
}

function collapseDuplicateFragments(lines: string[]) {
  const seen = new Set<string>()
  const collapsed: string[] = []
  let duplicatesRemoved = 0
  for (const line of lines) {
    const key = normalizeLookup(line)
    if (!key) continue
    if (seen.has(key)) {
      duplicatesRemoved += 1
      continue
    }
    seen.add(key)
    collapsed.push(line)
  }
  return { lines: collapsed, duplicatesRemoved }
}

function chunkSourceMapByHeadings(normalizedText: string): SourceChunk[] {
  const source = normalizedText.replace(/\n+/g, '\n')
  const matches = [...source.matchAll(new RegExp(`(^|\\n)(${SOURCE_MAP_HEADINGS.map(escapeRegExp).join('|')})\\??`, 'gi'))]
  if (matches.length === 0) {
    return [{ heading: 'Source Notes', text: source, sourceQuote: truncateForSourceMapModel(source, 460) }]
  }

  const chunks: SourceChunk[] = []
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const next = matches[index + 1]
    const start = match.index ?? 0
    const end = next?.index ?? source.length
    const block = source.slice(start, end).replace(/^\s+/, '')
    const heading = normalizeSourceMapHeading(match[2] ?? 'Source Notes')
    const text = block.replace(new RegExp(`^${escapeRegExp(match[2] ?? '')}\\??\\s*`, 'i'), '').trim()
    chunks.push({
      heading,
      text,
      sourceQuote: truncateForSourceMapModel(block.replace(/\s+/g, ' ').trim(), 520),
    })
  }
  return chunks.filter((chunk) => chunk.text.length > 0)
}

function buildUnitsFromChunks(chunks: SourceChunk[]): AcademicSourceMapUnit[] {
  return chunks.flatMap((chunk) => {
    const items = extractSourceMapItems(chunk.text)
    const definitions = extractDefinitionsFromText(chunk.text)
    const canExtractDefinitionUnits = isDefinitionSourceMapChunk(chunk.heading)
    const chunkDefinitions = canExtractDefinitionUnits ? definitions : []
    const kind = classifyUnitKind(chunk.heading, chunk.text, items, chunkDefinitions)
    const units: AcademicSourceMapUnit[] = []

    if (canExtractDefinitionUnits && definitions.length > 0) {
      units.push(...definitions.map((definition) => createUnit({
        title: definition.term,
        kind: 'definition',
        summary: definition.definition,
        items: [],
        sourceQuote: pickSourceQuote(chunk, definition.term),
      })))
    }

    if (items.length >= 2 || definitions.length === 0 || !canExtractDefinitionUnits) {
      units.push(createUnit({
        title: chunk.heading,
        kind,
        summary: summarizeChunk(chunk, items, chunkDefinitions),
        items,
        sourceQuote: chunk.sourceQuote,
      }))
    }

    return units
  })
}

function isDefinitionSourceMapChunk(heading: string) {
  return /\b(?:what is|definition of terms?)\b/i.test(heading)
}

function inferKnownSecurityUnits(normalizedText: string): AcademicSourceMapUnit[] {
  const units: AcademicSourceMapUnit[] = []
  const source = normalizedText.replace(/\s+/g, ' ')
  const addList = (title: string, items: string[], quoteHeadings: string[], kind: AcademicSourceMapUnitKind = 'list') => {
    const found = items.filter((item) => new RegExp(`\\b${escapeRegExp(item).replace(/\\-/g, '[- ]?')}\\b`, 'i').test(source))
    if (found.length >= 2) {
      units.push(createUnit({
        title,
        kind,
        summary: `${title} includes ${found.join(', ')}.`,
        items: found,
        sourceQuote: pickKnownSectionQuote(normalizedText, quoteHeadings) ?? `${title}: ${found.join(', ')}`,
      }))
    }
  }

  addList('CIA Triad', ['Confidentiality', 'Integrity', 'Availability'], ['Goal of IT Security'], 'concept')
  addList('Domains of IT Security', ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security'], ['Domains of IT Security'], 'category')
  addList('Types of attackers', ['Insiders', 'Employees and ex-employees', 'Contract Staff', 'Trusted Partners', 'Organized Attackers', 'Cyber Criminals', 'Hacktivists', 'Terrorists', 'State-sponsored Hackers', 'Black hats', 'Grey hats', 'White hats', 'Amateurs'], ['Types of Attackers'], 'category')
  addList('Malware types', ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM'], ['Types of Malware'], 'category')
  addList('Malware symptoms', ['increase in CPU usage', 'decrease in computer speed', 'freezes or crashes often', 'decrease in Web browsing speed', 'network connections', 'Files are modified', 'Files are deleted', 'unknown files', 'unknown processes', 'Email is being sent'], ['Symptoms of Malware'])
  addList('Infiltration methods', ['Social Engineering', 'Password Cracking', 'Vulnerability Exploitation', 'Advanced Persistent Threats'], ['Methods of Infiltration'], 'process')
  addList('Denial of service methods', ['Overwhelm quantity of traffic', 'Maliciously formatted packets', 'Zombie', 'Botnet', 'SEO Poisoning'], ['Methods to Deny Service'], 'process')
  addList('Cybercrime / Disruption / Espionage', ['Cybercrime', 'Disruption', 'Espionage'], ['Types of Cybersecurity Threats'], 'category')
  addList('Blended attacks', ['multiple techniques', 'worms', 'Trojan horses', 'spyware', 'keyloggers', 'spam', 'phishing schemes', 'DDoS combined with phishing emails'], ['Blended Attacks'], 'concept')
  addList('Impact reduction', ['Communicate the Issue', 'Be sincere and accountable', 'Provide details', 'Understand the cause of the breach', 'Ensure all systems are clean', 'Educate employees, partners, and customers'], ['Impact Reduction'], 'process')

  for (const [title, headings, pattern] of [
    ['IT Security definition', ['What is IT Security'], /What is IT Security.{0,260}/i],
    ['InfoSec vs IT Sec', ['What is IT Security'], /InfoSec.{0,140}IT Sec.{0,140}/i],
    ['Cybersecurity definitions', ['What is Cybersecurity'], /What is Cybersecurity\?.{0,360}/i],
    ['Importance of cybersecurity', ['Importance of cybersecurity'], /Importance of cybersecurity.{0,360}/i],
    ['Challenges', ['Challenges of Cybersecurity'], /Challenges of Cybersecurity.{0,320}/i],
    ['Vulnerability / Exploit / Breach', ['Definition of Terms'], /Definition of Terms.{0,320}/i],
    ['Blended attacks', ['Blended Attacks'], /Blended Attacks.{0,320}/i],
  ] as const) {
    const quote = title === 'InfoSec vs IT Sec'
      ? pickRegexQuote(source, pattern) ?? pickKnownSectionQuote(normalizedText, headings, pattern)
      : pickKnownSectionQuote(normalizedText, headings, pattern)
    if (quote) {
      const items = title === 'InfoSec vs IT Sec'
        ? extractSourceMapItems(quote).filter((item) => /^(?:InfoSec|IT Sec)\b/i.test(item))
        : extractSourceMapItems(quote)
      units.push(createUnit({
        title,
        kind: title.includes('definition') || title.includes('Definitions') ? 'definition' : title.includes('/') ? 'category' : 'concept',
        summary: summarizeQuote(title, quote),
        items,
        sourceQuote: quote,
      }))
    }
  }

  return units
}

function createUnit(input: {
  title: string
  kind: AcademicSourceMapUnitKind
  summary: string
  items: string[]
  sourceQuote: string
}): AcademicSourceMapUnit {
  const title = normalizeSourceMapHeading(input.title)
  return {
    id: slugify(title),
    title,
    kind: input.kind,
    summary: cleanupSummary(stopAtKnownHeading(input.summary, title)),
    items: uniqueStrings(input.items.map((item) => cleanupSourceMapUnitItem(item, title)).filter(Boolean)).slice(0, 14),
    sourceQuotes: uniqueStrings([input.sourceQuote].filter(Boolean).map((quote) => clampSourceMapQuote(quote, title, input.kind))),
    importanceScore: scoreImportance(title, input.kind, input.items.length),
    confidence: input.sourceQuote ? 0.86 : 0.62,
  }
}

function cleanupSourceMapUnitItem(value: string, title: string) {
  return cleanupItem(stopAtKnownHeading(value, title))
    .replace(/\s+(?:Goal of IT Security|Domains of IT(?: Security)?|What is Cybersecurity\??|Importance of Cybersecurity|Challenges of Cybersecurity|Impact of a Security Breach|Types of Attackers|Definition of Terms|Types of Cybersecurity Threats|Types of Malware|Symptoms of Malware|Methods of Infiltration|Methods to Deny Service|Blended Attacks|Impact Reduction)\b.*$/i, '')
    .trim()
}

function extractSourceMapItems(text: string) {
  const bulletItems = text
    .split(/\s*•\s*|\s+\d+[.)]\s+|(?:^|\s)[a-z][.)]\s+/i)
    .map(cleanupItem)
    .filter((item) => item.length >= 3 && item.length <= 96)
    .filter((item) => !SOURCE_MAP_HEADINGS.some((heading) => normalizeLookup(item) === normalizeLookup(heading)))
  if (bulletItems.length >= 2) return uniqueStrings(bulletItems)

  return uniqueStrings(
    text
      .split(/[,;]|\s+\band\b\s+/i)
      .map(cleanupItem)
      .filter((item) => item.length >= 3 && item.length <= 72),
  )
}

function extractDefinitionsFromText(text: string) {
  const definitions: Array<{ term: string; definition: string }> = []
  const parts = text.split(/\s*•\s*/).map((part) => part.trim()).filter(Boolean)
  for (const part of parts) {
    const match = part.match(/^(.{3,72}?)\s*(?:-|–|:)\s*(.{10,280})$/)
      ?? part.match(/^(.{3,72}?)\s+(?:is|are|refers to|means|focuses on)\s+(.{10,280})$/i)
    if (!match?.[1] || !match[2]) continue
    const term = normalizeSourceMapHeading(match[1].replace(/^(?:the|a|an)\s+/i, ''))
    const definition = cleanupSummary(match[2])
    if (!term || !definition || isSourceMapNoiseLine(term)) continue
    definitions.push({ term, definition })
  }
  return uniqueBy(definitions, (item) => normalizeLookup(item.term)).slice(0, 10)
}

function classifyUnitKind(
  heading: string,
  text: string,
  items: string[],
  definitions: Array<{ term: string; definition: string }>,
): AcademicSourceMapUnitKind {
  const combined = `${heading} ${text}`
  if (definitions.length > 0 || /\bwhat is\b|\bdefinition\b/i.test(combined)) return 'definition'
  if (/\bmethod|process|steps?|reduction|infiltration|deny service\b/i.test(combined)) return 'process'
  if (/\btypes?|domains?|categories|attackers|malware|threats?|symptoms|challenges\b/i.test(combined)) return 'category'
  if (items.length >= 2) return 'list'
  return 'concept'
}

function summarizeChunk(
  chunk: SourceChunk,
  items: string[],
  definitions: Array<{ term: string; definition: string }>,
) {
  if (definitions[0]) return `${definitions[0].term}: ${definitions[0].definition}`
  if (items.length >= 2) return `${chunk.heading} includes ${items.slice(0, 8).join(', ')}.`
  return summarizeQuote(chunk.heading, chunk.sourceQuote)
}

function summarizeQuote(title: string, quote: string) {
  const cleaned = cleanupSummary(quote.replace(new RegExp(`^${escapeRegExp(title)}\\??\\s*`, 'i'), ''))
  return truncateForSourceMapModel(cleaned || title, 260)
}

function pickSourceQuote(chunk: SourceChunk, term: string) {
  const parts = chunk.text.split(/\s*•\s*/).map((part) => part.trim()).filter(Boolean)
  return parts.find((part) => normalizeLookup(part).includes(normalizeLookup(term)))
    ?? chunk.sourceQuote
}

function pickRegexQuote(source: string, pattern: RegExp) {
  const match = source.match(pattern)
  return match?.[0] ? truncateForSourceMapModel(match[0].replace(/\s+/g, ' ').trim(), 560) : null
}

function pickKnownSectionQuote(normalizedText: string, headings: readonly string[], fallbackPattern?: RegExp) {
  const source = normalizedText.replace(/\r/g, '\n')
  const headingPattern = headings.map(escapeRegExp).join('|')
  const match = source.match(new RegExp(`(^|\\n)(${headingPattern})\\??\\s*`, 'i'))
  if (match?.[0] && typeof match.index === 'number') {
    const start = match.index + (match[1]?.length ?? 0)
    const next = findNextSourceMapHeadingIndex(source, start + match[2].length)
    const block = source.slice(start, next ?? source.length)
    return clampSourceMapQuote(block, match[2], classifyKnownHeadingKind(match[2]))
  }

  if (!fallbackPattern) return null
  return pickRegexQuote(source.replace(/\s+/g, ' '), fallbackPattern)
}

function findNextSourceMapHeadingIndex(source: string, fromIndex: number) {
  let nextIndex: number | null = null
  for (const heading of SOURCE_MAP_HEADINGS) {
    const pattern = new RegExp(`\\n${escapeRegExp(heading)}\\??\\s*`, 'gi')
    let match: RegExpExecArray | null
    while ((match = pattern.exec(source)) !== null) {
      if (match.index <= fromIndex) continue
      nextIndex = nextIndex === null ? match.index : Math.min(nextIndex, match.index)
      break
    }
  }
  return nextIndex
}

function classifyKnownHeadingKind(heading: string): AcademicSourceMapUnitKind {
  if (/\bdefinition|what is\b/i.test(heading)) return 'definition'
  if (/\bmethod|reduction|infiltration|deny service\b/i.test(heading)) return 'process'
  if (/\btypes?|domains?|symptoms|challenges\b/i.test(heading)) return 'category'
  return 'concept'
}

function clampSourceMapQuote(value: string, title: string, kind: AcademicSourceMapUnitKind) {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  const withoutAdjacent = stopAtKnownHeading(oneLine, title)
  const maxChars = kind === 'definition' ? 260 : kind === 'process' ? 420 : 360
  return truncateForSourceMapModel(withoutAdjacent, maxChars)
}

function stopAtKnownHeading(value: string, title: string) {
  let end = value.length
  for (const heading of SOURCE_MAP_STOP_TOKENS) {
    if (normalizeLookup(heading) === normalizeLookup(title)) continue
    const match = value.match(new RegExp(`\\s${escapeRegExp(heading)}\\??(?=\\s|\\d+[.)])`, 'i'))
    if (match?.index && match.index > 20) end = Math.min(end, match.index)
  }
  return value.slice(0, end).trim()
}

function dedupeUnits(units: AcademicSourceMapUnit[]) {
  return uniqueBy(
    units.filter((unit) => isMeaningfulSourceMapUnit(unit)),
    (unit) => normalizeLookup(unit.title),
  )
}

function isMeaningfulSourceMapUnit(unit: AcademicSourceMapUnit) {
  const titleKey = normalizeLookup(unit.title)
  const summaryKey = normalizeLookup(unit.summary)
  if (!titleKey || unit.title.length < 3 || unit.sourceQuotes.length === 0) return false
  if (isWeakSourceMapTitle(unit.title)) return false
  if (summaryKey.length < 14 && !RECOGNIZED_SOURCE_MAP_TERMS.has(titleKey)) return false
  if (/^cyber crime\b/i.test(unit.title) && /\bbig business\b/i.test(unit.summary)) return false
  return true
}

function isWeakSourceMapTitle(title: string) {
  const key = normalizeLookup(title)
  if (!key) return true
  if (RECOGNIZED_SOURCE_MAP_TERMS.has(key)) return false
  if (/^(?:there|high|state|terms|programs|activity|organization|source summary|what)$/i.test(key)) return true
  if (/^(?:cyber crime|organized and state|seo poisoning|sent to a host or application and the receiver)$/i.test(key)) return true
  if (/\bthat$/i.test(key)) return true
  if (/^(?:attacks backed by state agencies that|sent to a host or application and the receiver)\b/i.test(key)) return true
  const words = key.split(/\s+/).filter(Boolean)
  if (words.length === 1 && !RECOGNIZED_SOURCE_MAP_TERMS.has(key)) return true
  if (words.length >= 7 && !/^(?:vulnerability exploit breach|cybercrime disruption espionage)$/i.test(key)) return true
  if (/\b(?:there is|there are|sent to|attempts to|refers to|the receiver|that are part)\b/i.test(title)) return true
  return false
}

function scoreImportance(title: string, kind: AcademicSourceMapUnitKind, itemCount: number) {
  let score = kind === 'definition' ? 82 : kind === 'process' ? 76 : kind === 'category' ? 72 : 66
  if (HIGH_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(title))) score += 14
  if (/^(?:CIA Triad|IT Security definition|InfoSec vs IT Sec|Vulnerability \/ Exploit \/ Breach)$/i.test(title)) score += 18
  if (itemCount >= 3) score += 6
  if (itemCount >= 8) score += 4
  return Math.max(1, Math.min(100, score))
}

function normalizeSourceMapHeading(value: string) {
  const cleaned = normalizeStudyOutputHeading(sanitizeStudentFacingText(value).replace(/\s+/g, ' ').trim())
  const lookup = normalizeLookup(cleaned)
  if (lookup === 'it security definition') return 'IT Security definition'
  if (lookup === 'infosec vs it sec') return 'InfoSec vs IT Sec'
  if (lookup === 'cia triad') return 'CIA Triad'
  if (lookup === 'domains of it security') return 'Domains of IT Security'
  if (lookup === 'cybersecurity definitions') return 'Cybersecurity definitions'
  if (lookup === 'importance of cybersecurity') return 'Importance of cybersecurity'
  if (lookup === 'vulnerability exploit breach') return 'Vulnerability / Exploit / Breach'
  if (lookup === 'cybercrime disruption espionage') return 'Cybercrime / Disruption / Espionage'
  if (lookup === 'malware types') return 'Malware types'
  if (lookup === 'malware symptoms') return 'Malware symptoms'
  if (lookup === 'types of attackers') return 'Types of attackers'
  if (lookup === 'infiltration methods') return 'Infiltration methods'
  if (lookup === 'denial of service methods') return 'Denial of service methods'
  if (lookup === 'blended attacks') return 'Blended attacks'
  if (lookup === 'impact reduction') return 'Impact reduction'
  if (lookup === 'goal of it security') return 'CIA Triad'
  if (lookup === 'types of cybersecurity threats') return 'Cybercrime / Disruption / Espionage'
  if (lookup === 'types of malware') return 'Malware types'
  if (lookup === 'symptoms of malware') return 'Malware symptoms'
  if (lookup === 'challenges of cybersecurity') return 'Challenges'
  return cleaned
}

function cleanupItem(value: string) {
  return sanitizeStudentFacingText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'([{.:;-]+|[\s"'.,;:)\]}]+$/g, '')
    .trim()
}

function cleanupSummary(value: string) {
  return cleanupItem(value).slice(0, 320)
}

function isSourceMapNoiseLine(line: string) {
  const compact = line.replace(/\s+/g, ' ').trim()
  if (!compact) return true
  if (/^(?:course|module|file|source|extraction|grounding|metadata|uuid|id|debug|quality)\s*[:\-]/i.test(compact)) return true
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(compact)) return true
  const alphaChars = compact.replace(/[^A-Za-z]/g, '').length
  const totalChars = compact.replace(/\s/g, '').length
  return totalChars > 0 && alphaChars / totalChars < 0.35
}

function looksMetadataOnly(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return true
  const metadataLines = lines.filter(isSourceMapNoiseLine).length
  return metadataLines / lines.length > 0.6
}

function truncateForSourceMapModel(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  const clipped = value.slice(0, maxChars)
  const breakIndex = Math.max(clipped.lastIndexOf('\n'), clipped.lastIndexOf('. '))
  return clipped.slice(0, breakIndex > 240 ? breakIndex + 1 : maxChars).trim()
}

function slugify(value: string) {
  return normalizeLookup(value).replace(/\s+/g, '-').slice(0, 80) || 'source-unit'
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function uniqueStrings(values: string[]) {
  return uniqueBy(values, normalizeLookup)
}

function uniqueBy<T>(values: T[], getKey: (value: T) => string) {
  const seen = new Set<string>()
  const result: T[] = []
  for (const value of values) {
    const key = getKey(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
