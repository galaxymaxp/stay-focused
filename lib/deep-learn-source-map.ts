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

export type AcademicSourceMapStyle =
  | 'technical'
  | 'procedural'
  | 'narrative'
  | 'classification-heavy'
  | 'timeline-heavy'
  | 'reflective'
  | 'taxonomy-heavy'

export type AcademicSourceMapUnitType =
  | 'definition'
  | 'classification'
  | 'timeline'
  | 'procedure'
  | 'equipment'
  | 'historical'
  | 'taxonomy'
  | 'comparison'
  | 'narrative'
  | 'reflective'

export type AcademicDisciplineCluster =
  | 'computer-it-data-software'
  | 'engineering-architecture-built-environment'
  | 'health-nursing-allied-health-medicine'
  | 'law-criminal-justice-criminology-public-safety'
  | 'business-accountancy-management-economics'
  | 'education-pedagogy'
  | 'arts-humanities-communication'
  | 'natural-sciences-mathematics-geology-environmental-science'
  | 'hospitality-tourism'
  | 'religion-theology-philosophy-ethics'
  | 'physical-education-sports-performing-movement'
  | 'general-academic'

export type AcademicLearningShape =
  | 'definition'
  | 'taxonomy'
  | 'procedure'
  | 'timeline'
  | 'formula'
  | 'worked-example'
  | 'case-rule'
  | 'clinical-care'
  | 'cause-effect'
  | 'comparison'
  | 'passage-theme'
  | 'reflection'
  | 'troubleshooting'
  | 'component-system'
  | 'lab-process'
  | 'classification'
  | 'equipment'
  | 'standards-rubrics'
  | 'narrative'

export interface AcademicSourceMapUnit {
  id: string
  title: string
  kind: AcademicSourceMapUnitKind
  unitType?: AcademicSourceMapUnitType
  learningShape?: AcademicLearningShape
  summary: string
  items: string[]
  sourceQuotes: string[]
  importanceScore: number
  confidence: number
}

export interface AcademicSourceMap {
  version: 'academic-source-map-v1'
  sourceStyle?: AcademicSourceMapStyle
  secondaryStyles?: AcademicSourceMapStyle[]
  disciplineCluster?: AcademicDisciplineCluster
  secondaryDisciplineClusters?: AcademicDisciplineCluster[]
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

export interface SourceChunk {
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
  'What is Arnis',
  'Aliases of Arnis',
  'Republic Act 9850',
  'Historical Concept',
  'History of Arnis',
  'Evolution of Arnis',
  'Classifications of Arnis',
  'Organizations and Timeline',
  'Organizations of Arnis',
  'Courtesy and Salutation',
  'Courtesy Salutation',
  'Striking Techniques',
  'Strike Types',
  'Equipment and Weapons',
  'Weapons and Equipment',
  'Stick Types',
  'Regional Classifications',
  'Reflection',
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
  'What is Arnis',
  'Aliases of Arnis',
  'Republic Act 9850',
  'Historical Concept',
  'History of Arnis',
  'Evolution of Arnis',
  'Classifications of Arnis',
  'Organizations and Timeline',
  'Organizations of Arnis',
  'Courtesy and Salutation',
  'Courtesy Salutation',
  'Striking Techniques',
  'Strike Types',
  'Equipment and Weapons',
  'Weapons and Equipment',
  'Stick Types',
  'Regional Classifications',
  'Reflection',
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
  'arnis definition',
  'aliases',
  'ra 9850',
  'historical concept',
  'evolution classifications',
  'organizations timeline',
  'courtesy salutation',
  'strike types',
  'equipment weapons',
  'stick types',
])

export function buildAcademicSourceMap(sourceText: string): AcademicSourceMap {
  const cleanedLines = cleanupSourceMapLines(sourceText)
  const collapsed = collapseDuplicateFragments(cleanedLines)
  const normalizedText = collapsed.lines.join('\n')
  const chunks = chunkSourceMapByHeadings(normalizedText)
  const styleProfile = detectAcademicSourceMapStyles(normalizedText, chunks)
  const disciplineProfile = detectAcademicDisciplineClusters(normalizedText)
  const units = dedupeUnits([
    ...inferKnownSecurityUnits(normalizedText),
    ...inferKnownArnisUnits(normalizedText),
    ...buildUnitsFromChunks(chunks),
  ])
    .sort((left, right) => right.importanceScore - left.importanceScore || left.title.localeCompare(right.title))
    .slice(0, 36)
  const validation = validateAcademicSourceMap({
    version: 'academic-source-map-v1',
    sourceStyle: styleProfile.sourceStyle,
    secondaryStyles: styleProfile.secondaryStyles,
    disciplineCluster: disciplineProfile.disciplineCluster,
    secondaryDisciplineClusters: disciplineProfile.secondaryDisciplineClusters,
    normalizedText,
    chunks,
    units,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
    validation: { ok: false, reason: 'no_units', unitCount: 0, quoteCount: 0 },
  })

  return {
    version: 'academic-source-map-v1',
    sourceStyle: styleProfile.sourceStyle,
    secondaryStyles: styleProfile.secondaryStyles,
    disciplineCluster: disciplineProfile.disciplineCluster,
    secondaryDisciplineClusters: disciplineProfile.secondaryDisciplineClusters,
    normalizedText,
    chunks,
    units,
    duplicateFragmentsRemoved: collapsed.duplicatesRemoved,
    validation,
  }
}

export function detectAcademicDisciplineClusters(
  normalizedText: string,
): { disciplineCluster: AcademicDisciplineCluster; secondaryDisciplineClusters: AcademicDisciplineCluster[] } {
  const source = normalizedText.replace(/\s+/g, ' ')
  const scores = new Map<AcademicDisciplineCluster, number>([
    ['computer-it-data-software', 0],
    ['engineering-architecture-built-environment', 0],
    ['health-nursing-allied-health-medicine', 0],
    ['law-criminal-justice-criminology-public-safety', 0],
    ['business-accountancy-management-economics', 0],
    ['education-pedagogy', 0],
    ['arts-humanities-communication', 0],
    ['natural-sciences-mathematics-geology-environmental-science', 0],
    ['hospitality-tourism', 0],
    ['religion-theology-philosophy-ethics', 0],
    ['physical-education-sports-performing-movement', 0],
  ])
  const add = (cluster: AcademicDisciplineCluster, amount: number) => scores.set(cluster, (scores.get(cluster) ?? 0) + amount)

  const scorePatterns: Array<[AcademicDisciplineCluster, RegExp, number]> = [
    ['computer-it-data-software', /\b(?:computer|information technology|it security|cybersecurity|software|programming|database|data science|network|malware|algorithm|operating system)\b/i, 36],
    ['engineering-architecture-built-environment', /\b(?:engineering|architecture|built environment|construction|structural|circuit|mechanics|materials?|design load|building code|drafting)\b/i, 34],
    ['health-nursing-allied-health-medicine', /\b(?:nursing|clinical|patient|medicine|anatomy|physiology|diagnosis|therapeutic|pharmacology|vital signs|care plan|allied health)\b/i, 38],
    ['law-criminal-justice-criminology-public-safety', /\b(?:law|case|jurisdiction|criminal justice|criminology|public safety|police|forensic|statute|liability|evidence|offense|court|rule)\b/i, 36],
    ['business-accountancy-management-economics', /\b(?:business|accounting|accountancy|management|economics|market|finance|cost|revenue|asset|liability|strategy|entrepreneurship)\b/i, 34],
    ['education-pedagogy', /\b(?:education|pedagogy|curriculum|lesson plan|assessment|instruction|classroom|learner|teaching|learning objectives)\b/i, 34],
    ['arts-humanities-communication', /\b(?:art|literature|humanities|communication|media|rhetoric|poetry|novel|culture|language|journalism|speech|theater)\b/i, 32],
    ['natural-sciences-mathematics-geology-environmental-science', /\b(?:biology|chemistry|physics|mathematics|calculus|statistics|geology|environmental science|ecosystem|experiment|molecule|force|equation)\b/i, 36],
    ['hospitality-tourism', /\b(?:hospitality|tourism|hotel|restaurant|guest|front office|housekeeping|travel|destination|food service|culinary)\b/i, 34],
    ['religion-theology-philosophy-ethics', /\b(?:religion|theology|philosophy|ethics|moral|scripture|faith|doctrine|virtue|argument|metaphysics)\b/i, 32],
    ['physical-education-sports-performing-movement', /\b(?:physical education|pathfit|sports?|fitness|movement|dance|performing movement|arnis|salutation|strike|exercise|training|baston)\b/i, 38],
  ]

  for (const [cluster, pattern, score] of scorePatterns) {
    const matches = source.match(new RegExp(pattern.source, 'gi')) ?? []
    if (matches.length > 0) add(cluster, score + Math.min(matches.length * 4, 20))
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
  const disciplineCluster = ranked[0]?.[0] ?? 'general-academic'
  const secondaryDisciplineClusters = ranked
    .slice(1)
    .filter(([, score]) => score >= 28)
    .map(([cluster]) => cluster)
    .slice(0, 3)
  return { disciplineCluster, secondaryDisciplineClusters }
}

export function detectAcademicSourceMapStyles(
  normalizedText: string,
  chunks: SourceChunk[] = chunkSourceMapByHeadings(cleanupSourceMapLines(normalizedText).join('\n')),
): { sourceStyle: AcademicSourceMapStyle; secondaryStyles: AcademicSourceMapStyle[] } {
  const source = normalizedText.replace(/\s+/g, ' ')
  const headingText = chunks.map((chunk) => chunk.heading).join(' ')
  const scores = new Map<AcademicSourceMapStyle, number>([
    ['technical', 0],
    ['procedural', 0],
    ['narrative', 0],
    ['classification-heavy', 0],
    ['timeline-heavy', 0],
    ['reflective', 0],
    ['taxonomy-heavy', 0],
  ])
  const add = (style: AcademicSourceMapStyle, amount: number) => scores.set(style, (scores.get(style) ?? 0) + amount)

  const numbered = (source.match(/\b\d+[.)]\s+[A-Z]/g) ?? []).length
  const years = (source.match(/\b(?:1[5-9]\d{2}|20\d{2})\b/g) ?? []).length
  const bulletCount = (source.match(/â€¢/g) ?? []).length
  if (numbered >= 3 || /\b(?:steps?|procedure|salutation|courtesy|sequence|perform|execute)\b/i.test(source)) add('procedural', 34 + numbered * 2)
  if (years >= 3 || /\b(?:timeline|history|historical|milestones?|evolution|founded|established)\b/i.test(source)) add('timeline-heavy', 34 + years * 3)
  if (/\b(?:classification|classifications|categories|types?|groups?|regional|taxonomy)\b/i.test(`${headingText} ${source}`)) add('classification-heavy', 32)
  if (bulletCount >= 8 || /\b(?:domains|triad|taxonomy|types?|categories|includes)\b/i.test(source)) add('taxonomy-heavy', 28 + Math.min(bulletCount, 18))
  if (/\b(?:cybersecurity|security|network|malware|vulnerability|exploit|breach|technical|systems?)\b/i.test(source)) {
    add('technical', /\b(?:arnis|eskrima|kali|ra 9850|stick|salutation|strike)\b/i.test(source) ? 36 : 58)
  }
  if (/\b(?:story|origin|developed|during|period|tradition|culture|historical concept)\b/i.test(source)) add('narrative', 20)
  if (/\b(?:reflection|reflect|journal|personal|values?|self assessment|insight)\b/i.test(source)) add('reflective', 34)
  if (/\b(?:arnis|eskrima|kali|ra 9850|stick|weapons?|salutation|strike)\b/i.test(source)) {
    add('procedural', 22)
    add('classification-heavy', 18)
    add('timeline-heavy', 12)
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1])
  const isSecurityTechnical = /\b(?:cybersecurity|it security|infosec|malware|vulnerability|exploit|breach)\b/i.test(source)
    && !/\b(?:arnis|eskrima|kali|ra 9850|stick|salutation|strike)\b/i.test(source)
  const sourceStyle = isSecurityTechnical ? 'technical' : ranked[0]?.[0] ?? 'technical'
  const secondaryStyles = ranked
    .filter(([style]) => style !== sourceStyle)
    .filter(([, score]) => score >= 24)
    .map(([style]) => style)
    .slice(0, 4)
  return { sourceStyle, secondaryStyles }
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
      `- ${unit.title} [${unit.kind}/${unit.learningShape ?? inferSourceMapLearningShape(unit.title, unit.kind, unit.unitType)}, importance ${unit.importanceScore}/100]: ${unit.summary}`,
    ]
    if (unit.items.length > 0) lines.push(`  Items: ${unit.items.slice(0, 10).join(', ')}`)
    if (unit.sourceQuotes[0]) lines.push(`  Source quote: "${unit.sourceQuotes[0]}"`)
    return lines
  })
  const structured = truncateForSourceMapModel([
    `Deterministic academic structure from the selected source (Academic Source Map). Dominant style: ${sourceMap.sourceStyle ?? 'technical'}${sourceMap.secondaryStyles?.length ? `; secondary styles: ${sourceMap.secondaryStyles.join(', ')}` : ''}. Discipline hint: ${sourceMap.disciplineCluster ?? 'general-academic'}${sourceMap.secondaryDisciplineClusters?.length ? `; secondary discipline hints: ${sourceMap.secondaryDisciplineClusters.join(', ')}` : ''}:`,
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

function inferKnownArnisUnits(normalizedText: string): AcademicSourceMapUnit[] {
  const units: AcademicSourceMapUnit[] = []
  const source = normalizedText.replace(/\s+/g, ' ')
  if (!/\b(?:arnis|eskrima|kali|ra 9850)\b/i.test(source)) return units

  const addList = (
    title: string,
    items: string[],
    quoteHeadings: string[],
    kind: AcademicSourceMapUnitKind,
    unitType: AcademicSourceMapUnitType,
  ) => {
    const found = items.filter((item) => new RegExp(`\\b${escapeRegExp(item).replace(/\\-/g, '[- ]?')}\\b`, 'i').test(source))
    if (found.length >= 2) {
      units.push(createUnit({
        title,
        kind,
        unitType,
        summary: `${title} includes ${found.join(', ')}.`,
        items: found,
        sourceQuote: pickKnownSectionQuote(normalizedText, quoteHeadings) ?? `${title}: ${found.join(', ')}`,
      }))
    }
  }

  const addQuoteUnit = (
    title: string,
    quoteHeadings: string[],
    kind: AcademicSourceMapUnitKind,
    unitType: AcademicSourceMapUnitType,
    fallbackPattern?: RegExp,
  ) => {
    const quote = pickKnownSectionQuote(normalizedText, quoteHeadings, fallbackPattern)
    if (!quote) return
    units.push(createUnit({
      title,
      kind,
      unitType,
      summary: summarizeQuote(title, quote),
      items: extractSourceMapItems(quote),
      sourceQuote: quote,
    }))
  }

  addQuoteUnit('Arnis definition', ['What is Arnis'], 'definition', 'definition', /What is Arnis.{0,260}/i)
  addList('Aliases', ['Eskrima', 'Kali', 'Garrote', 'Estoque'], ['Aliases of Arnis', 'What is Arnis'], 'list', 'classification')
  addQuoteUnit('RA 9850', ['Republic Act 9850'], 'concept', 'historical', /(?:RA|Republic Act)\s*9850.{0,260}/i)
  addQuoteUnit('Historical concept', ['Historical Concept', 'History of Arnis'], 'concept', 'historical', /Historical Concept.{0,320}/i)
  addList('Evolution / Classifications', ['Classical Arnis', 'Modern Arnis', 'Sports Arnis', 'Anyo', 'Labanan'], ['Evolution of Arnis', 'Classifications of Arnis'], 'category', 'classification')
  addList('Organizations / Timeline', ['NARAPHIL', 'ARPI', 'WEKAF', 'i-ARNIS'], ['Organizations and Timeline', 'Organizations of Arnis'], 'category', 'timeline')
  addList('Courtesy / Salutation', ['Attention stance', 'Ready stance', 'Bow', 'Salute', 'Return to ready stance'], ['Courtesy and Salutation', 'Courtesy Salutation'], 'process', 'procedure')
  addList('Strike Types', ['Forehand strike', 'Backhand strike', 'Thrust', 'Diagonal strike', 'Horizontal strike', 'Vertical strike'], ['Striking Techniques', 'Strike Types'], 'category', 'classification')
  addList('Equipment / Weapons', ['Baston', 'Daga', 'Bolo', 'Espada y Daga', 'Bangkaw'], ['Equipment and Weapons', 'Weapons and Equipment'], 'category', 'equipment')
  addList('Stick Types', ['Solo Baston', 'Doble Baston', 'Sibat', 'Bangkaw'], ['Stick Types'], 'category', 'equipment')
  addList('Regional Classifications', ['Luzon', 'Visayans', 'Mindanao'], ['Regional Classifications', 'Classifications of Arnis'], 'category', 'classification')

  return units
}

function createUnit(input: {
  title: string
  kind: AcademicSourceMapUnitKind
  unitType?: AcademicSourceMapUnitType
  summary: string
  items: string[]
  sourceQuote: string
}): AcademicSourceMapUnit {
  const title = normalizeSourceMapHeading(input.title)
  return {
    id: slugify(title),
    title,
    kind: input.kind,
    unitType: input.unitType ?? inferSourceMapUnitType(title, input.kind),
    learningShape: inferSourceMapLearningShape(title, input.kind, input.unitType),
    summary: cleanupSummary(stopAtKnownHeading(input.summary, title)),
    items: uniqueStrings(input.items.map((item) => cleanupSourceMapUnitItem(item, title)).filter(Boolean)).slice(0, 14),
    sourceQuotes: uniqueStrings([input.sourceQuote].filter(Boolean).map((quote) => clampSourceMapQuote(quote, title, input.kind))),
    importanceScore: scoreImportance(title, input.kind, input.items.length),
    confidence: input.sourceQuote ? 0.86 : 0.62,
  }
}

function inferSourceMapLearningShape(
  title: string,
  kind: AcademicSourceMapUnitKind,
  unitType?: AcademicSourceMapUnitType,
): AcademicLearningShape {
  const key = normalizeLookup(title)
  const resolvedUnitType = unitType ?? inferSourceMapUnitType(title, kind)
  if (/\b(?:formula|equation|compute|calculate|solve)\b/i.test(key)) return 'formula'
  if (/\b(?:example|sample problem|worked solution)\b/i.test(key)) return 'worked-example'
  if (/\b(?:case|rule|statute|jurisdiction|liability|offense)\b/i.test(key)) return 'case-rule'
  if (/\b(?:clinical|patient|care plan|diagnosis|treatment|assessment)\b/i.test(key)) return 'clinical-care'
  if (/\b(?:cause|effect|impact|risk factor|because|result)\b/i.test(key)) return 'cause-effect'
  if (/\b(?:troubleshoot|error|failure|debug|symptom)\b/i.test(key)) return 'troubleshooting'
  if (/\b(?:component|system|architecture|module|parts?)\b/i.test(key)) return 'component-system'
  if (/\b(?:lab|experiment|protocol|procedure)\b/i.test(key)) return 'lab-process'
  if (/\b(?:rubric|standard|criteria|competency|outcomes?)\b/i.test(key)) return 'standards-rubrics'
  if (/\b(?:passage|theme|motif|character|argument)\b/i.test(key)) return 'passage-theme'
  if (resolvedUnitType === 'definition') return 'definition'
  if (resolvedUnitType === 'classification') return 'classification'
  if (resolvedUnitType === 'timeline' || resolvedUnitType === 'historical') return 'timeline'
  if (resolvedUnitType === 'procedure') return 'procedure'
  if (resolvedUnitType === 'equipment') return 'equipment'
  if (resolvedUnitType === 'comparison') return 'comparison'
  if (resolvedUnitType === 'taxonomy') return 'taxonomy'
  if (resolvedUnitType === 'reflective') return 'reflection'
  return resolvedUnitType === 'narrative' ? 'narrative' : 'definition'
}

function inferSourceMapUnitType(title: string, kind: AcademicSourceMapUnitKind): AcademicSourceMapUnitType {
  const key = normalizeLookup(title)
  if (/\b(?:vs|vulnerability exploit breach)\b/i.test(key)) return 'comparison'
  if (/\b(?:timeline|organizations timeline|history|historical|ra 9850|evolution)\b/i.test(key)) return 'timeline'
  if (/\b(?:courtesy|salutation|procedure|methods?|infiltration|reduction|steps?)\b/i.test(key) || kind === 'process') return 'procedure'
  if (/\b(?:equipment|weapons?|stick types|baston|daga|bangkaw)\b/i.test(key)) return 'equipment'
  if (/\b(?:classification|classifications|regional|types|domains|categories|attackers|malware|threats)\b/i.test(key) || kind === 'category') return 'classification'
  if (kind === 'list') return 'taxonomy'
  if (kind === 'definition') return 'definition'
  if (/\b(?:reflect|reflection)\b/i.test(key)) return 'reflective'
  if (/\b(?:historical concept|origin|tradition)\b/i.test(key)) return 'historical'
  return 'narrative'
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
  if (/^(?:Arnis definition|RA 9850|Organizations \/ Timeline|Courtesy \/ Salutation|Equipment \/ Weapons|Regional Classifications)$/i.test(title)) score += 16
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
  if (lookup === 'what is arnis' || lookup === 'arnis definition') return 'Arnis definition'
  if (lookup === 'aliases of arnis') return 'Aliases'
  if (lookup === 'republic act 9850' || lookup === 'ra 9850') return 'RA 9850'
  if (lookup === 'historical concept' || lookup === 'history of arnis') return 'Historical concept'
  if (lookup === 'evolution of arnis' || lookup === 'classifications of arnis') return 'Evolution / Classifications'
  if (lookup === 'organizations and timeline' || lookup === 'organizations of arnis') return 'Organizations / Timeline'
  if (lookup === 'courtesy and salutation' || lookup === 'courtesy salutation') return 'Courtesy / Salutation'
  if (lookup === 'striking techniques' || lookup === 'strike types') return 'Strike Types'
  if (lookup === 'equipment and weapons' || lookup === 'weapons and equipment') return 'Equipment / Weapons'
  if (lookup === 'stick types') return 'Stick Types'
  if (lookup === 'regional classifications') return 'Regional Classifications'
  return cleaned
}

function cleanupItem(value: string) {
  return sanitizeStudentFacingText(value)
    .replace(/\s+/g, ' ')
    .replace(/^\d+[.)]\s*/, '')
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
