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

export type AcademicRelationType =
  | 'definition'
  | 'list_membership'
  | 'comparison'
  | 'timeline_milestone'
  | 'procedure_step'
  | 'classification'
  | 'cause_effect'
  | 'formula_variable'
  | 'rule_element'
  | 'equipment_property'
  | 'component_function'
  | 'symptom_intervention'
  | 'passage_theme'
  | 'troubleshooting_step'
  | 'standard_rubric'

export type AcademicBankKind =
  | 'definition'
  | 'terminology'
  | 'classification'
  | 'timeline'
  | 'procedure'
  | 'formula'
  | 'relationship'
  | 'likely_question'
  | 'comparison'
  | 'acronym'
  | 'cause_effect'

export interface AcademicSourceMapUnit {
  id: string
  title: string
  kind: AcademicSourceMapUnitKind
  unitType?: AcademicSourceMapUnitType
  learningShape?: AcademicLearningShape
  sectionPath?: string[]
  summary: string
  items: string[]
  sourceQuotes: string[]
  importanceScore: number
  confidence: number
}

export interface AcademicSourceRelation {
  id: string
  relationType: AcademicRelationType
  parentConcept: string
  childConcepts: string[]
  answerText: string
  sourceEvidence: string
  sourceUnitId: string
  confidence: number
  learningShape: AcademicLearningShape
  unitType: AcademicSourceMapUnitType
}

export interface AcademicSourceMapBankEntry {
  kind: AcademicBankKind
  title: string
  prompt: string
  answer: string
  items: string[]
  sectionPath: string[]
  sourceQuote: string
  confidence: number
}

export interface AcademicSourceMapBanks {
  definitionBank: AcademicSourceMapBankEntry[]
  terminologyBank: AcademicSourceMapBankEntry[]
  classificationBank: AcademicSourceMapBankEntry[]
  timelineBank: AcademicSourceMapBankEntry[]
  procedureBank: AcademicSourceMapBankEntry[]
  formulaBank: AcademicSourceMapBankEntry[]
  relationshipBank: AcademicSourceMapBankEntry[]
  likelyQuestionBank: AcademicSourceMapBankEntry[]
  comparisonBank: AcademicSourceMapBankEntry[]
  acronymBank: AcademicSourceMapBankEntry[]
  causeEffectBank: AcademicSourceMapBankEntry[]
}

export interface AcademicSourceMap {
  version: 'academic-source-map-v1'
  sourceStyle?: AcademicSourceMapStyle
  secondaryStyles?: AcademicSourceMapStyle[]
  disciplineCluster?: AcademicDisciplineCluster
  secondaryDisciplineClusters?: AcademicDisciplineCluster[]
  banks?: AcademicSourceMapBanks
  normalizedText: string
  relations?: AcademicSourceRelation[]
  units: AcademicSourceMapUnit[]
  chunks: Array<{ heading: string; text: string; sourceQuote: string }>
  duplicateFragmentsRemoved: number
  validation: AcademicSourceMapValidation
}

export interface AcademicSourceMapValidation {
  ok: boolean
  reason: 'ok' | 'empty' | 'metadata_only' | 'no_units' | 'missing_quotes' | 'insufficient_academic_content'
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
  'ARNIS/ STICK FIGHTING',
  'ARNIS AS A SPORT',
  'Aliases of Arnis',
  'Republic Act 9850',
  'R.A. 9850',
  'Historical Concept',
  'A. HISTORICAL CONCEPT',
  'History of Arnis',
  'Evolution of Arnis',
  'B. EVOLVEMENT OF THE ART',
  'Classifications of Arnis',
  'Organizations and Timeline',
  'Organizations of Arnis',
  '3 MAIN GROUPS',
  'Courtesy and Salutation',
  'Courtesy Salutation',
  'COURTESY / SALUTATION',
  'Striking Techniques',
  'Strike Types',
  'TYPES OF STRIKES',
  'Equipment and Weapons',
  'Facilities and Equipment',
  'Weapons and Equipment',
  'Weapons',
  'Stick Types',
  'Types of Arnis sticks',
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
  'ARNIS/ STICK FIGHTING',
  'ARNIS AS A SPORT',
  'Aliases of Arnis',
  'Republic Act 9850',
  'R.A. 9850',
  'Historical Concept',
  'A. HISTORICAL CONCEPT',
  'History of Arnis',
  'Evolution of Arnis',
  'B. EVOLVEMENT OF THE ART',
  'Classifications of Arnis',
  'Organizations and Timeline',
  'Organizations of Arnis',
  '3 MAIN GROUPS',
  'Courtesy and Salutation',
  'Courtesy Salutation',
  'COURTESY / SALUTATION',
  'Striking Techniques',
  'Strike Types',
  'TYPES OF STRIKES',
  'Equipment and Weapons',
  'Facilities and Equipment',
  'Weapons and Equipment',
  'Weapons',
  'Stick Types',
  'Types of Arnis sticks',
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
  'cybersecurity approach layers',
  'people process technology',
  'unified threat management',
  'domains of it security',
  'importance of cybersecurity',
  'challenges',
  'challenges of cybersecurity',
  'impact of a security breach',
  'types of attackers',
  'vulnerability',
  'exploit',
  'breach',
  'vulnerability exploit breach',
  'zombie vs botnet',
  'seo vs seo poisoning',
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
  'main groups',
  'regional systems',
  'naming systems',
  'arnis as a sport',
  'timeline',
])

export function buildAcademicSourceMap(sourceText: string): AcademicSourceMap {
  const cleanedLines = cleanupSourceMapLines(sourceText)
  const collapsed = collapseDuplicateFragments(cleanedLines)
  const normalizedText = collapsed.lines.join('\n')
  const chunks = chunkSourceMapByHeadings(normalizedText)
  const styleProfile = detectAcademicSourceMapStyles(normalizedText, chunks)
  const disciplineProfile = detectAcademicDisciplineClusters(normalizedText)
  const relations = extractAcademicRelations(normalizedText, chunks)
  const baseUnits = dedupeUnits([
    ...inferKnownSecurityUnits(normalizedText),
    ...inferKnownArnisUnits(normalizedText),
    ...buildUnitsFromChunks(chunks),
    ...buildUnitsFromRelations(relations),
  ])
  const initialBanks = buildAcademicSourceMapBanks(normalizedText, chunks, baseUnits)
  const units = dedupeUnits([
    ...baseUnits,
    ...buildUnitsFromAcademicBanks(initialBanks),
  ])
    .sort((left, right) => right.importanceScore - left.importanceScore || left.title.localeCompare(right.title))
    .slice(0, 36)
  const banks = buildAcademicSourceMapBanks(normalizedText, chunks, units)
  const validation = validateAcademicSourceMap({
    version: 'academic-source-map-v1',
    sourceStyle: styleProfile.sourceStyle,
    secondaryStyles: styleProfile.secondaryStyles,
    disciplineCluster: disciplineProfile.disciplineCluster,
    secondaryDisciplineClusters: disciplineProfile.secondaryDisciplineClusters,
    banks,
    normalizedText,
    relations,
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
    banks,
    normalizedText,
    relations,
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

  const meaningfulUnits = sourceMap.units.filter(isMeaningfulSourceMapUnit)
  const unitCount = meaningfulUnits.length
  const quoteCount = meaningfulUnits.reduce((count, unit) => count + unit.sourceQuotes.length, 0)
  const relationCount = (sourceMap.relations ?? []).filter(isMeaningfulAcademicRelation).length
  const bankEntryCount = countAcademicBankEntries(sourceMap.banks)
  const hasDenseAcademicBanks = bankEntryCount >= 8
    && getCoreAcademicBankCount(sourceMap.banks) >= 3
  const hasMeaningfulRelations = relationCount >= 3
  if (unitCount === 0) return { ok: false, reason: 'no_units', unitCount, quoteCount }
  if (quoteCount < Math.min(2, unitCount)) return { ok: false, reason: 'missing_quotes', unitCount, quoteCount }
  if (unitCount < 4 && !hasDenseAcademicBanks && !hasMeaningfulRelations) {
    return { ok: false, reason: 'insufficient_academic_content', unitCount, quoteCount }
  }
  return { ok: true, reason: 'ok', unitCount, quoteCount }
}

export function countValidatedAcademicRelations(sourceMap: AcademicSourceMap | null | undefined) {
  return (sourceMap?.relations ?? []).filter(isMeaningfulAcademicRelation).length
}

export function buildAcademicSourceMapGrounding(sourceText: string, maxChars = DEFAULT_SOURCE_MAP_GROUNDING_CHARS) {
  const sourceMap = buildAcademicSourceMap(sourceText)
  if (!sourceMap.validation.ok) return ''

  const unitLines = sourceMap.units.flatMap((unit) => {
    const lines = [
      `- ${unit.title} [${unit.kind}/${unit.learningShape ?? inferSourceMapLearningShape(unit.title, unit.kind, unit.unitType)}, importance ${unit.importanceScore}/100${unit.sectionPath?.length ? `, section ${unit.sectionPath.join(' > ')}` : ''}]: ${unit.summary}`,
    ]
    if (unit.items.length > 0) lines.push(`  Items: ${unit.items.slice(0, 10).join(', ')}`)
    if (unit.sourceQuotes[0]) lines.push(`  Source quote: "${unit.sourceQuotes[0]}"`)
    return lines
  })
  const bankLines = formatAcademicBankGrounding(sourceMap.banks)
  const structured = truncateForSourceMapModel([
    `Deterministic academic structure from the selected source (Academic Source Map). Dominant style: ${sourceMap.sourceStyle ?? 'technical'}${sourceMap.secondaryStyles?.length ? `; secondary styles: ${sourceMap.secondaryStyles.join(', ')}` : ''}. Discipline hint: ${sourceMap.disciplineCluster ?? 'general-academic'}${sourceMap.secondaryDisciplineClusters?.length ? `; secondary discipline hints: ${sourceMap.secondaryDisciplineClusters.join(', ')}` : ''}:`,
    ...unitLines,
    ...(bankLines.length > 0 ? ['', 'Academic banks:', ...bankLines] : []),
  ].join('\n'), Math.min(STRUCTURED_SOURCE_MAP_CHARS, Math.max(2400, maxChars - 1800)))
  const quoteBlock = truncateForSourceMapModel([
    'Closest source passages for exact wording:',
    ...sourceMap.chunks.slice(0, 12).map((chunk) => `- ${chunk.heading}: ${chunk.sourceQuote}`),
  ].join('\n'), Math.min(EXACT_SOURCE_QUOTE_CHARS, Math.max(1400, maxChars - structured.length - 160)))

  return truncateForSourceMapModel(`${structured}\n\n${quoteBlock}`, maxChars)
}

function buildAcademicSourceMapBanks(
  normalizedText: string,
  chunks: SourceChunk[],
  units: AcademicSourceMapUnit[],
): AcademicSourceMapBanks {
  const definitionBank = dedupeBankEntries([
    ...chunks.flatMap((chunk) => extractDefinitionsFromText(chunk.text).map((definition) => createBankEntry({
      kind: 'definition',
      title: definition.term,
      prompt: `Define ${definition.term}.`,
      answer: definition.definition,
      items: [],
      sectionPath: [chunk.heading],
      sourceQuote: pickSourceQuote(chunk, definition.term),
      confidence: 0.88,
    }))),
    ...units
      .filter((unit) => unit.kind === 'definition' || unit.learningShape === 'definition')
      .map((unit) => createBankEntry({
        kind: 'definition',
        title: unit.title,
        prompt: `Define ${unit.title}.`,
        answer: unit.summary,
        items: unit.items,
        sectionPath: unit.sectionPath ?? [unit.title],
        sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
        confidence: unit.confidence,
      })),
  ]).slice(0, 24)

  const terminologyBank = dedupeBankEntries(units.map((unit) => createBankEntry({
    kind: 'terminology',
    title: unit.title,
    prompt: `Recall the exam meaning of ${unit.title}.`,
    answer: unit.summary,
    items: unit.items,
    sectionPath: unit.sectionPath ?? [unit.title],
    sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
    confidence: unit.confidence,
  }))).slice(0, 32)

  const classificationBank = dedupeBankEntries([
    ...units
      .filter((unit) => unit.items.length >= 2 && (unit.kind === 'category' || unit.kind === 'list' || unit.unitType === 'classification' || unit.unitType === 'taxonomy' || unit.unitType === 'equipment'))
      .map((unit) => createBankEntry({
        kind: 'classification',
        title: unit.title,
        prompt: `Classify the items under ${unit.title}.`,
        answer: `${unit.title}: ${unit.items.join(', ')}`,
        items: unit.items,
        sectionPath: unit.sectionPath ?? [unit.title],
        sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
        confidence: unit.confidence,
      })),
    ...extractDashPairGroups(normalizedText).map((group) => createBankEntry({
      kind: 'classification',
      title: group.title,
      prompt: `Match each item under ${group.title}.`,
      answer: `${group.title}: ${group.items.join(', ')}`,
      items: group.items,
      sectionPath: [group.title],
      sourceQuote: group.sourceQuote,
      confidence: 0.84,
    })),
  ]).slice(0, 24)

  const timelineBank = dedupeBankEntries([
    ...units
      .filter((unit) => unit.unitType === 'timeline' || unit.learningShape === 'timeline')
      .map((unit) => createBankEntry({
        kind: 'timeline',
        title: unit.title,
        prompt: `Arrange the milestones under ${unit.title}.`,
        answer: unit.items.length >= 2 ? unit.items.join(', ') : unit.summary,
        items: unit.items,
        sectionPath: unit.sectionPath ?? [unit.title],
        sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
        confidence: unit.confidence,
      })),
    ...extractTimelineBankEntries(normalizedText),
  ]).slice(0, 18)

  const procedureBank = dedupeBankEntries(units
    .filter((unit) => unit.kind === 'process' || unit.unitType === 'procedure' || unit.learningShape === 'procedure' || unit.learningShape === 'lab-process')
    .map((unit) => createBankEntry({
      kind: 'procedure',
      title: unit.title,
      prompt: `Sequence ${unit.title}.`,
      answer: unit.items.length >= 2 ? unit.items.join(', ') : unit.summary,
      items: unit.items,
      sectionPath: unit.sectionPath ?? [unit.title],
      sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
      confidence: unit.confidence,
    }))).slice(0, 18)

  const formulaBank = dedupeBankEntries(extractFormulaBankEntries(normalizedText)).slice(0, 12)
  const relationshipBank = dedupeBankEntries([
    ...classificationBank.map((entry) => createBankEntry({
      ...entry,
      kind: 'relationship',
      prompt: `Explain the relationship inside ${entry.title}.`,
    })),
    ...extractRelationshipBankEntries(normalizedText),
  ]).slice(0, 20)
  const comparisonBank = dedupeBankEntries([
    ...units
      .filter((unit) => unit.unitType === 'comparison' || unit.learningShape === 'comparison' || /\b(?:vs|versus|compare|differentiate)\b|\/\s*[A-Za-z]/i.test(unit.title))
      .map((unit) => createBankEntry({
        kind: 'comparison',
        title: unit.title,
        prompt: `Differentiate ${unit.title}.`,
        answer: unit.summary,
        items: unit.items,
        sectionPath: unit.sectionPath ?? [unit.title],
        sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
        confidence: unit.confidence,
      })),
    ...extractComparisonBankEntries(normalizedText),
  ]).slice(0, 14)
  const acronymBank = dedupeBankEntries(extractAcronymBankEntries(normalizedText)).slice(0, 16)
  const causeEffectBank = dedupeBankEntries(extractCauseEffectBankEntries(normalizedText)).slice(0, 14)
  const likelyQuestionBank = dedupeBankEntries([
    ...units.map((unit) => createBankEntry({
      kind: 'likely_question',
      title: unit.title,
      prompt: buildLikelyQuestionPrompt(unit),
      answer: unit.items.length >= 2 ? unit.items.join(', ') : unit.summary,
      items: unit.items,
      sectionPath: unit.sectionPath ?? [unit.title],
      sourceQuote: unit.sourceQuotes[0] ?? unit.summary,
      confidence: Math.min(0.96, unit.confidence + 0.04),
    })),
    ...definitionBank.map((entry) => createBankEntry({
      ...entry,
      kind: 'likely_question',
      prompt: `Define ${entry.title}.`,
    })),
  ]).slice(0, 28)

  return {
    definitionBank,
    terminologyBank,
    classificationBank,
    timelineBank,
    procedureBank,
    formulaBank,
    relationshipBank,
    likelyQuestionBank,
    comparisonBank,
    acronymBank,
    causeEffectBank,
  }
}

function buildUnitsFromAcademicBanks(banks: AcademicSourceMapBanks): AcademicSourceMapUnit[] {
  const entries = [
    ...banks.definitionBank,
    ...banks.classificationBank,
    ...banks.timelineBank,
    ...banks.procedureBank,
    ...banks.formulaBank,
    ...banks.comparisonBank,
    ...banks.acronymBank,
    ...banks.causeEffectBank,
  ]
  return entries
    .filter((entry) => entry.answer.length >= 16 || entry.items.length >= 2)
    .map((entry) => createUnit({
      title: entry.title,
      kind: bankKindToUnitKind(entry.kind),
      unitType: bankKindToUnitType(entry.kind),
      summary: entry.answer,
      items: entry.items,
      sourceQuote: entry.sourceQuote,
      sectionPath: entry.sectionPath,
    }))
}

function bankKindToUnitKind(kind: AcademicBankKind): AcademicSourceMapUnitKind {
  if (kind === 'definition' || kind === 'acronym' || kind === 'formula' || kind === 'comparison' || kind === 'cause_effect') return 'definition'
  if (kind === 'procedure') return 'process'
  if (kind === 'classification' || kind === 'timeline' || kind === 'relationship') return 'category'
  return 'concept'
}

function bankKindToUnitType(kind: AcademicBankKind): AcademicSourceMapUnitType {
  if (kind === 'definition' || kind === 'acronym') return 'definition'
  if (kind === 'classification' || kind === 'relationship') return 'classification'
  if (kind === 'timeline') return 'timeline'
  if (kind === 'procedure') return 'procedure'
  if (kind === 'formula') return 'definition'
  if (kind === 'comparison') return 'comparison'
  if (kind === 'cause_effect') return 'narrative'
  return 'narrative'
}

function createBankEntry(input: AcademicSourceMapBankEntry): AcademicSourceMapBankEntry
function createBankEntry(input: {
  kind: AcademicBankKind
  title: string
  prompt: string
  answer: string
  items: string[]
  sectionPath: string[]
  sourceQuote: string
  confidence: number
}): AcademicSourceMapBankEntry {
  const title = normalizeSourceMapHeading(input.title)
  const answer = cleanupSummary(input.answer)
  const items = uniqueStrings(input.items.map((item) => cleanupSourceMapUnitItem(item, title)).filter(Boolean)).slice(0, 14)
  return {
    kind: input.kind,
    title,
    prompt: cleanQuestionPrompt(input.prompt),
    answer,
    items,
    sectionPath: input.sectionPath.map((section) => normalizeSourceMapHeading(section)).filter(Boolean).slice(0, 4),
    sourceQuote: clampSourceMapQuote(input.sourceQuote || answer, title, bankKindToUnitKind(input.kind)),
    confidence: Math.max(0.4, Math.min(1, input.confidence)),
  }
}

function extractDashPairGroups(normalizedText: string) {
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean)
  const groups: Array<{ title: string; items: string[]; sourceQuote: string }> = []
  let currentTitle = 'Classification Relationships'
  let currentItems: string[] = []
  let currentSource: string[] = []
  const flush = () => {
    if (currentItems.length >= 3) {
      groups.push({
        title: currentTitle,
        items: uniqueStrings(currentItems).slice(0, 14),
        sourceQuote: currentSource.join(' '),
      })
    }
    currentItems = []
    currentSource = []
  }

  for (const line of lines) {
    if (isLikelySectionHeading(line)) {
      flush()
      currentTitle = normalizeSourceMapHeading(line)
      continue
    }
    const match = line.match(/^(.{3,54}?)\s*(?:-|â€“|–|:)\s*(.{2,90})$/)
    if (!match?.[1] || !match[2]) continue
    const left = cleanupItem(match[1])
    const right = cleanupItem(match[2])
    if (!isUsefulPairSide(left) || right.length < 2) continue
    currentItems.push(`${left} - ${right}`)
    currentSource.push(line)
  }
  flush()
  return groups
}

function isUsefulPairSide(value: string) {
  const key = normalizeLookup(value)
  if (!key || key.length < 3) return false
  if (/^(?:there|what|source|metadata|debug|quality|file|page)$/i.test(key)) return false
  return true
}

function extractTimelineBankEntries(normalizedText: string) {
  const source = normalizedText.replace(/\s+/g, ' ')
  const entries: AcademicSourceMapBankEntry[] = []
  const timelineItems = uniqueStrings(
    [...source.matchAll(/\b((?:1[5-9]\d{2}|20\d{2})|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(?:1[5-9]\d{2}|20\d{2}))\s*(?:-|â€“|–)?\s*([^.!?]{10,150})/gi)]
      .map((match) => `${cleanupItem(match[1] ?? '')} - ${cleanupItem(match[2] ?? '')}`)
      .filter((item) => item.length >= 16),
  ).slice(0, 14)
  if (timelineItems.length >= 2) {
    entries.push(createBankEntry({
      kind: 'timeline',
      title: 'Timeline',
      prompt: 'Arrange the source milestones chronologically.',
      answer: timelineItems.join(', '),
      items: timelineItems,
      sectionPath: ['Timeline'],
      sourceQuote: timelineItems.join(' '),
      confidence: 0.86,
    }))
  }
  return entries
}

function extractFormulaBankEntries(normalizedText: string) {
  return normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\b(?:formula|equation|equals|=|calculate|solve)\b/i.test(line))
    .map((line) => createBankEntry({
      kind: 'formula',
      title: line.match(/^(.{3,54}?)(?:formula|equation|:|=)/i)?.[1]?.trim() || 'Formula',
      prompt: 'Use the source formula.',
      answer: line,
      items: extractSourceMapItems(line),
      sectionPath: ['Formula'],
      sourceQuote: line,
      confidence: 0.84,
    }))
}

function extractRelationshipBankEntries(normalizedText: string) {
  return normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\b(?:includes|consists of|composed of|made up of|belongs to|classified as|characterized by)\b/i.test(line))
    .map((line) => createBankEntry({
      kind: 'relationship',
      title: inferRelationshipTitle(line),
      prompt: 'Explain the source relationship.',
      answer: line,
      items: extractSourceMapItems(line),
      sectionPath: [inferRelationshipTitle(line)],
      sourceQuote: line,
      confidence: 0.78,
    }))
    .filter((entry) => entry.items.length >= 2 || entry.answer.length >= 40)
}

function extractComparisonBankEntries(normalizedText: string) {
  return normalizedText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /\b(?:while|whereas|compared with|different from|versus| vs\.? )\b/i.test(line))
    .map((line) => createBankEntry({
      kind: 'comparison',
      title: inferRelationshipTitle(line),
      prompt: 'Differentiate the compared concepts.',
      answer: line,
      items: extractSourceMapItems(line),
      sectionPath: [inferRelationshipTitle(line)],
      sourceQuote: line,
      confidence: 0.78,
    }))
}

function extractAcronymBankEntries(normalizedText: string) {
  const source = normalizedText.replace(/\s+/g, ' ')
  const acronymPairs = [
    ...[...source.matchAll(/\b([A-Z][A-Z0-9-]{1,10})\s*\(([^)]{3,90})\)/g)]
      .map((match) => ({ acronym: match[1] ?? '', meaning: match[2] ?? '' })),
    ...[...source.matchAll(/\b([A-Z][A-Za-z ]{4,90})\s*\(([A-Z][A-Z0-9-]{1,10})\)/g)]
      .map((match) => ({ acronym: match[2] ?? '', meaning: match[1] ?? '' })),
  ]
  return uniqueBy(acronymPairs, (item) => normalizeLookup(item.acronym))
    .map((item) => createBankEntry({
      kind: 'acronym',
      title: item.acronym,
      prompt: `What does ${item.acronym} stand for?`,
      answer: item.meaning,
      items: [item.meaning],
      sectionPath: ['Acronyms'],
      sourceQuote: `${item.acronym} (${item.meaning})`,
      confidence: 0.86,
    }))
}

function extractCauseEffectBankEntries(normalizedText: string) {
  return normalizedText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => /\b(?:because|therefore|results? in|leads? to|causes?|impact|effect|so that|in order to)\b/i.test(line))
    .map((line) => createBankEntry({
      kind: 'cause_effect',
      title: inferRelationshipTitle(line),
      prompt: 'Explain the cause-effect relationship.',
      answer: line,
      items: [],
      sectionPath: [inferRelationshipTitle(line)],
      sourceQuote: line,
      confidence: 0.76,
    }))
    .filter((entry) => entry.answer.length >= 24)
}

function inferRelationshipTitle(line: string) {
  const beforeVerb = line.split(/\b(?:includes|consists of|composed of|made up of|belongs to|classified as|characterized by|because|therefore|results? in|leads? to|causes?|while|whereas)\b/i)[0]?.trim()
  const words = cleanupItem(beforeVerb || line).split(/\s+/).slice(0, 6).join(' ')
  return words.length >= 3 ? words : 'Concept Relationship'
}

function buildLikelyQuestionPrompt(unit: AcademicSourceMapUnit) {
  const shape = unit.learningShape ?? inferSourceMapLearningShape(unit.title, unit.kind, unit.unitType)
  if (shape === 'timeline') return `Arrange or identify the chronology for ${unit.title}.`
  if (shape === 'procedure' || shape === 'lab-process') return `Sequence the steps in ${unit.title}.`
  if (shape === 'classification' || shape === 'taxonomy') return `Classify or enumerate the items under ${unit.title}.`
  if (shape === 'equipment') return `Identify the equipment or tool examples under ${unit.title}.`
  if (shape === 'formula') return `Use the formula in ${unit.title}.`
  if (shape === 'comparison') return `Differentiate ${unit.title}.`
  if (shape === 'cause-effect') return `Explain why ${unit.title} happens.`
  if (unit.kind === 'definition') return `Define ${unit.title}.`
  return `Explain ${unit.title}.`
}

function countAcademicBankEntries(banks: AcademicSourceMapBanks | null | undefined) {
  if (!banks) return 0
  return Object.values(banks).reduce((count, entries) => count + entries.length, 0)
}

function getCoreAcademicBankCount(banks: AcademicSourceMapBanks | null | undefined) {
  if (!banks) return 0
  return [
    banks.definitionBank,
    banks.classificationBank,
    banks.timelineBank,
    banks.procedureBank,
    banks.formulaBank,
    banks.relationshipBank,
    banks.comparisonBank,
    banks.acronymBank,
    banks.causeEffectBank,
  ].filter((entries) => entries.length > 0).length
}

function formatAcademicBankGrounding(banks: AcademicSourceMapBanks | null | undefined) {
  if (!banks) return []
  const groups: Array<[string, AcademicSourceMapBankEntry[]]> = [
    ['Definitions', banks.definitionBank],
    ['Terminology', banks.terminologyBank],
    ['Classifications', banks.classificationBank],
    ['Timelines', banks.timelineBank],
    ['Procedures', banks.procedureBank],
    ['Formulas', banks.formulaBank],
    ['Relationships', banks.relationshipBank],
    ['Likely questions', banks.likelyQuestionBank],
    ['Comparisons', banks.comparisonBank],
    ['Acronyms', banks.acronymBank],
    ['Cause/effect', banks.causeEffectBank],
  ]
  return groups
    .filter(([, entries]) => entries.length > 0)
    .flatMap(([label, entries]) => [
      `${label}:`,
      ...entries.slice(0, 5).map((entry) => `  - ${entry.title}: ${entry.items.length >= 2 ? entry.items.slice(0, 8).join(', ') : entry.answer}`),
    ])
}

function dedupeBankEntries(entries: AcademicSourceMapBankEntry[]) {
  return uniqueBy(
    entries
      .filter((entry) => entry.title.length >= 3)
      .filter((entry) => (entry.answer.length >= 8 || entry.items.length >= 2) && entry.sourceQuote.length >= 8)
      .filter((entry) => !isWeakSourceMapTitle(entry.title))
      .filter((entry) => !containsInternalSourceMapText(`${entry.title} ${entry.answer} ${entry.sourceQuote}`)),
    (entry) => `${entry.kind}:${normalizeLookup(entry.title)}:${normalizeLookup(entry.answer)}`,
  )
}

export function extractAcademicRelations(
  normalizedText: string,
  chunks: SourceChunk[] = chunkSourceMapByHeadings(cleanupSourceMapLines(normalizedText).join('\n')),
): AcademicSourceRelation[] {
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => cleanupItem(line))
    .filter((line) => line.length >= 8 && !isSourceMapNoiseLine(line))
  const relations: AcademicSourceRelation[] = []
  const add = (input: Omit<AcademicSourceRelation, 'id' | 'sourceUnitId'> & { sourceUnitId?: string }) => {
    const parentConcept = normalizeSourceMapHeading(input.parentConcept)
    const answerText = cleanupSummary(input.answerText)
    const sourceEvidence = cleanupSummary(input.sourceEvidence)
    const childConcepts = uniqueStrings(input.childConcepts.map(cleanupItem).filter(Boolean)).slice(0, 14)
    if (!parentConcept || !answerText || !sourceEvidence) return
    if (isWeakSourceMapTitle(parentConcept) && childConcepts.length < 2) return
    relations.push({
      ...input,
      id: slugify(`${input.relationType}-${parentConcept}-${answerText}`),
      parentConcept,
      childConcepts,
      answerText,
      sourceEvidence,
      sourceUnitId: input.sourceUnitId ?? slugify(parentConcept),
      confidence: Math.max(0.45, Math.min(1, input.confidence)),
    })
  }

  for (const chunk of chunks) {
    const chunkItems = extractSourceMapItems(chunk.text)
    if (chunkItems.length >= 2 && chunk.heading !== 'Source Notes') {
      add({
        relationType: inferListRelationType(chunk.heading, chunk.text),
        parentConcept: chunk.heading,
        childConcepts: chunkItems,
        answerText: `${chunk.heading}: ${chunkItems.join(', ')}`,
        sourceEvidence: chunk.sourceQuote,
        confidence: 0.82,
        learningShape: inferSourceMapLearningShape(chunk.heading, 'list'),
        unitType: inferSourceMapUnitType(chunk.heading, 'list'),
      })
    }
  }

  for (const line of lines) {
    const definition = line.match(/^(.{3,72}?)\s+(?:is|are|refers to|means|involves|describes|can be defined as)\s+(.{10,260})$/i)
    if (definition?.[1] && definition[2]) {
      add({
        relationType: 'definition',
        parentConcept: definition[1],
        childConcepts: [],
        answerText: definition[2],
        sourceEvidence: line,
        confidence: 0.86,
        learningShape: 'definition',
        unitType: 'definition',
      })
    }

    const list = line.match(/^(.{3,96}?)\s+(?:includes|include|consists of|consist of|comprises|contains|is composed of|is made up of|has)\s+(.{8,240})$/i)
    if (list?.[1] && list[2]) {
      const items = splitRelationItems(list[2])
      if (items.length >= 2) {
        add({
          relationType: inferListRelationType(list[1], line),
          parentConcept: list[1],
          childConcepts: items,
          answerText: `${cleanupItem(list[1])}: ${items.join(', ')}`,
          sourceEvidence: line,
          confidence: 0.84,
          learningShape: inferSourceMapLearningShape(list[1], 'list'),
          unitType: inferSourceMapUnitType(list[1], 'list'),
        })
      }
    }

    const dashPair = line.match(/^(.{3,72}?)\s*(?:-|:)\s*(.{3,180})$/)
    if (dashPair?.[1] && dashPair[2]) {
      const relationType = inferDashPairRelationType(dashPair[1], dashPair[2], line)
      add({
        relationType,
        parentConcept: dashPair[1],
        childConcepts: splitRelationItems(dashPair[2]),
        answerText: `${cleanupItem(dashPair[1])} - ${cleanupItem(dashPair[2])}`,
        sourceEvidence: line,
        confidence: relationType === 'equipment_property' ? 0.88 : 0.78,
        learningShape: relationTypeToLearningShape(relationType),
        unitType: relationTypeToUnitType(relationType),
      })
    }

    const timeline = line.match(/\b((?:1[5-9]\d{2}|20\d{2})|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(?:1[5-9]\d{2}|20\d{2}))\b\s*(?:-|:)?\s*(.{8,180})/i)
    if (timeline?.[1] && timeline[2]) {
      add({
        relationType: 'timeline_milestone',
        parentConcept: 'Timeline',
        childConcepts: [`${timeline[1]} - ${cleanupItem(timeline[2])}`],
        answerText: `${timeline[1]} - ${cleanupItem(timeline[2])}`,
        sourceEvidence: line,
        confidence: 0.86,
        learningShape: 'timeline',
        unitType: 'timeline',
      })
    }

    const ordered = [...line.matchAll(/\b\d+[.)]\s*([^0-9.]{3,90})(?=\s+\d+[.)]|$)/g)].map((match) => cleanupItem(match[1] ?? ''))
    if (ordered.length >= 2) {
      add({
        relationType: inferProcedureRelationType(line),
        parentConcept: inferRelationshipTitle(line),
        childConcepts: ordered,
        answerText: ordered.join(', '),
        sourceEvidence: line,
        confidence: 0.84,
        learningShape: inferProcedureRelationType(line) === 'troubleshooting_step' ? 'troubleshooting' : inferProcedureRelationType(line) === 'symptom_intervention' ? 'clinical-care' : 'procedure',
        unitType: 'procedure',
      })
    }

    if (/\b(?:while|whereas|compared with|different from|versus| vs\.? )\b/i.test(line)) {
      add({
        relationType: 'comparison',
        parentConcept: inferRelationshipTitle(line),
        childConcepts: splitRelationItems(line),
        answerText: line,
        sourceEvidence: line,
        confidence: 0.8,
        learningShape: 'comparison',
        unitType: 'comparison',
      })
    }

    if (/\b(?:formula|equation|equals|calculate|solve)\b|=/.test(line) && /[=0-9+\-*/^()]|\bequals\b/i.test(line)) {
      add({
        relationType: 'formula_variable',
        parentConcept: inferRelationshipTitle(line),
        childConcepts: splitRelationItems(line).filter((item) => item.length <= 48),
        answerText: line,
        sourceEvidence: line,
        confidence: 0.84,
        learningShape: 'formula',
        unitType: 'definition',
      })
    }

    if (/\b(?:because|therefore|results? in|leads? to|causes?|effect|impact|so that|in order to)\b/i.test(line)) {
      add({
        relationType: 'cause_effect',
        parentConcept: inferRelationshipTitle(line),
        childConcepts: [],
        answerText: line,
        sourceEvidence: line,
        confidence: 0.76,
        learningShape: 'cause-effect',
        unitType: 'narrative',
      })
    }

    if (/\b(?:court|statute|jurisdiction|liability|offense|evidence|rule|law|penalty)\b/i.test(line)) {
      add({
        relationType: 'rule_element',
        parentConcept: inferRelationshipTitle(line),
        childConcepts: splitRelationItems(line).filter((item) => /\b(?:court|statute|jurisdiction|liability|offense|evidence|rule|law|penalty)\b/i.test(item)),
        answerText: line,
        sourceEvidence: line,
        confidence: 0.78,
        learningShape: 'case-rule',
        unitType: 'narrative',
      })
    }

    if (/\b(?:equipment|tool|instrument|device|weapon|microscope|apparatus|used to|used for|magnify)\b/i.test(line)) {
      add({
        relationType: 'equipment_property',
        parentConcept: inferRelationshipTitle(line),
        childConcepts: splitRelationItems(line),
        answerText: line,
        sourceEvidence: line,
        confidence: 0.78,
        learningShape: 'equipment',
        unitType: 'equipment',
      })
    }
  }

  return uniqueBy(
    relations.filter(isMeaningfulAcademicRelation),
    (relation) => `${relation.relationType}:${normalizeLookup(relation.parentConcept)}:${normalizeLookup(relation.answerText)}`,
  ).slice(0, 48)
}

function buildUnitsFromRelations(relations: AcademicSourceRelation[]): AcademicSourceMapUnit[] {
  const grouped = new Map<string, AcademicSourceRelation[]>()
  for (const relation of relations) {
    const key = `${relation.relationType}:${normalizeLookup(relation.parentConcept)}`
    grouped.set(key, [...(grouped.get(key) ?? []), relation])
  }
  return [...grouped.values()].map((group) => {
    const first = group[0]
    const items = uniqueStrings(group.flatMap((relation) => relation.childConcepts.length ? relation.childConcepts : [relation.answerText]))
    return createUnit({
      title: first.parentConcept,
      kind: relationTypeToUnitKind(first.relationType),
      unitType: first.unitType,
      learningShape: first.learningShape,
      summary: first.childConcepts.length >= 2 ? `${first.parentConcept}: ${first.childConcepts.join(', ')}` : first.answerText,
      items,
      sourceQuote: group.map((relation) => relation.sourceEvidence).join(' '),
      sectionPath: [first.parentConcept],
    })
  })
}

function isMeaningfulAcademicRelation(relation: AcademicSourceRelation) {
  if (!relation.parentConcept || !relation.answerText || !relation.sourceEvidence) return false
  if (containsInternalSourceMapText(`${relation.parentConcept} ${relation.answerText} ${relation.sourceEvidence}`)) return false
  if (relation.answerText.length < 12 && relation.childConcepts.length < 2) return false
  return true
}

function inferListRelationType(title: string, text: string): AcademicRelationType {
  const combined = `${title} ${text}`
  if (/\b(?:classifications?|categories|types?|groups?|taxonomy)\b/i.test(combined)) return 'classification'
  if (/\b(?:equipment|tool|device|instrument|weapon|materials?)\b/i.test(title)) return 'equipment_property'
  if (/\b(?:rule|statute|law|elements?|penalty|offense|procedure)\b/i.test(combined)) return 'rule_element'
  if (/\b(?:symptoms?|interventions?|nursing|clinical|patient|care|treatment)\b/i.test(combined)) return 'symptom_intervention'
  if (/\b(?:rubric|criteria|standard|competency|outcomes?)\b/i.test(combined)) return 'standard_rubric'
  if (/\b(?:component|function|part|system)\b/i.test(combined)) return 'component_function'
  return 'list_membership'
}

function inferDashPairRelationType(left: string, right: string, line: string): AcademicRelationType {
  const combined = `${left} ${right} ${line}`
  if (/\b(?:feet?|foot|inch(?:es)?|meter|cm|length|tool|equipment|weapon|instrument|used for|used to|made of|magnify)\b/i.test(combined)) return 'equipment_property'
  if (/\b(?:rule|statute|law|penalty|offense|element|court|jurisdiction)\b/i.test(combined)) return 'rule_element'
  if (/\b(?:symptom|intervention|patient|nursing|care|diagnosis|treatment)\b/i.test(combined)) return 'symptom_intervention'
  if (/\b(?:component|function|part|system|role)\b/i.test(combined)) return 'component_function'
  return 'definition'
}

function inferProcedureRelationType(line: string): AcademicRelationType {
  if (/\b(?:troubleshoot|error|failure|fix|diagnose|isolate)\b/i.test(line)) return 'troubleshooting_step'
  if (/\b(?:symptom|intervention|patient|nursing|clinical|care|diagnosis|treatment|vital signs)\b/i.test(line)) return 'symptom_intervention'
  if (/\b(?:rule|statute|law|court|offense|procedure)\b/i.test(line)) return 'rule_element'
  return 'procedure_step'
}

function splitRelationItems(value: string) {
  return value
    .replace(/\([^)]{100,}\)/g, '')
    .split(/[,;]|\s+\band\b\s+|\s*\/\s*/)
    .map(cleanupItem)
    .filter((item) => item.length >= 2 && item.length <= 96)
}

function relationTypeToUnitKind(type: AcademicRelationType): AcademicSourceMapUnitKind {
  if (type === 'definition' || type === 'comparison' || type === 'formula_variable' || type === 'cause_effect') return 'definition'
  if (type === 'procedure_step' || type === 'troubleshooting_step' || type === 'symptom_intervention') return 'process'
  if (type === 'list_membership' || type === 'classification' || type === 'timeline_milestone' || type === 'equipment_property' || type === 'rule_element' || type === 'standard_rubric') return 'category'
  return 'concept'
}

function relationTypeToUnitType(type: AcademicRelationType): AcademicSourceMapUnitType {
  if (type === 'comparison') return 'comparison'
  if (type === 'timeline_milestone') return 'timeline'
  if (type === 'procedure_step' || type === 'troubleshooting_step' || type === 'symptom_intervention') return 'procedure'
  if (type === 'equipment_property') return 'equipment'
  if (type === 'classification' || type === 'list_membership' || type === 'standard_rubric') return 'classification'
  if (type === 'definition' || type === 'formula_variable') return 'definition'
  return 'narrative'
}

function relationTypeToLearningShape(type: AcademicRelationType): AcademicLearningShape {
  if (type === 'timeline_milestone') return 'timeline'
  if (type === 'procedure_step') return 'procedure'
  if (type === 'troubleshooting_step') return 'troubleshooting'
  if (type === 'symptom_intervention') return 'clinical-care'
  if (type === 'equipment_property') return 'equipment'
  if (type === 'formula_variable') return 'formula'
  if (type === 'rule_element') return 'case-rule'
  if (type === 'comparison') return 'comparison'
  if (type === 'cause_effect') return 'cause-effect'
  if (type === 'component_function') return 'component-system'
  if (type === 'standard_rubric') return 'standards-rubrics'
  if (type === 'passage_theme') return 'passage-theme'
  if (type === 'classification') return 'classification'
  if (type === 'list_membership') return 'taxonomy'
  return 'definition'
}

function cleanQuestionPrompt(value: string) {
  const cleaned = cleanupItem(value)
  return /[?!.]$/.test(cleaned) ? cleaned : `${cleaned}.`
}

function cleanupSourceMapLines(sourceText: string) {
  const normalized = sourceText
    .replace(/\r/g, '\n')
    .replace(/â€¢/g, ' • ')
    .replace(/\u2022/g, ' • ')
    .replace(/â€“|â€”|–|—/g, ' - ')
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
        sectionPath: [chunk.heading],
      })))
    }

    if (items.length >= 2 || definitions.length === 0 || !canExtractDefinitionUnits) {
      units.push(createUnit({
        title: chunk.heading,
        kind,
        summary: summarizeChunk(chunk, items, chunkDefinitions),
        items,
        sourceQuote: chunk.sourceQuote,
        sectionPath: [chunk.heading],
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
    const found = items.filter((item) => sourceContainsStudyItem(source, item))
    if (found.length >= 2) {
      units.push(createUnit({
        title,
        kind,
        summary: `${title}: ${found.join(', ')}.`,
        items: found,
        sourceQuote: pickKnownSectionQuote(normalizedText, quoteHeadings) ?? `${title}: ${found.join(', ')}`,
      }))
    }
  }

  const addUnit = (input: {
    title: string
    kind: AcademicSourceMapUnitKind
    unitType?: AcademicSourceMapUnitType
    items: string[]
    summary?: string
    quoteHeadings: string[]
    fallbackPattern?: RegExp
  }) => {
    const found = input.items.filter((item) => sourceContainsStudyItem(source, item))
    const quote = pickKnownSectionQuote(normalizedText, input.quoteHeadings, input.fallbackPattern)
    if (found.length < 2 && !quote) return
    units.push(createUnit({
      title: input.title,
      kind: input.kind,
      unitType: input.unitType,
      summary: input.summary ?? `${input.title}: ${(found.length >= 2 ? found : input.items).join(', ')}.`,
      items: found.length >= 2 ? found : input.items,
      sourceQuote: quote ?? `${input.title}: ${(found.length >= 2 ? found : input.items).join(', ')}`,
    }))
  }

  addList('CIA Triad', ['Confidentiality', 'Integrity', 'Availability'], ['Goal of IT Security'], 'concept')
  addList('Domains of IT Security', ['Network Security', 'Internet Security', 'Endpoint Security', 'Cloud Security', 'Application Security', 'Information Security', 'Operational Security', 'Mobile Security', 'IoT Security', 'User Education', 'Cyber Security'], ['Domains of IT Security'], 'category')
  addList('Cybersecurity approach layers', ['Computers', 'Networks', 'Programs', 'Data'], ['What is Cybersecurity all about'], 'list')
  addList('People / Process / Technology', ['People', 'Processes', 'Technology'], ['What is Cybersecurity all about'], 'category')
  addList('Unified Threat Management', ['Detection', 'Investigation', 'Remediation'], ['What is Cybersecurity all about'], 'process')
  addList('Types of attackers', ['Insiders', 'Employees and ex-employees', 'Contract Staff', 'Trusted Partners', 'Organized Attackers', 'Cyber Criminals', 'Hacktivists', 'Terrorists', 'State-sponsored Hackers', 'Black hats', 'Grey hats', 'White hats', 'Amateurs'], ['Types of Attackers'], 'category')
  addList('Impact of a Security Breach', ['Ruined Reputation', 'Vandalism', 'Theft', 'Revenue Lost', 'Damaged Intellectual Property'], ['Impact of a Security Breach'], 'category')
  addList('Malware types', ['Spyware', 'Adware', 'Bot', 'Rootkit', 'Scareware', 'Ransomware', 'Virus', 'Trojan Horse', 'Worm', 'MiTM'], ['Types of Malware'], 'category')
  addList('Malware symptoms', ['increase in CPU usage', 'decrease in computer speed', 'freezes or crashes often', 'decrease in Web browsing speed', 'network connections', 'Files are modified', 'Files are deleted', 'unknown files', 'unknown processes', 'Email is being sent'], ['Symptoms of Malware'])
  addList('Infiltration methods', ['Social Engineering', 'Password Cracking', 'Vulnerability Exploitation', 'Advanced Persistent Threats'], ['Methods of Infiltration'], 'process')
  addList('Denial of service methods', ['Overwhelm quantity of traffic', 'Maliciously formatted packets', 'Zombie', 'Botnet', 'SEO Poisoning'], ['Methods to Deny Service'], 'process')
  addUnit({
    title: 'Zombie vs Botnet',
    kind: 'definition',
    unitType: 'comparison',
    items: ['Zombie - Infected Host', 'Botnet - Network of Infected Hosts'],
    summary: 'Zombie = infected host; Botnet = network of infected hosts.',
    quoteHeadings: ['Methods to Deny Service'],
    fallbackPattern: /Zombie.{0,80}Botnet.{0,100}/i,
  })
  addUnit({
    title: 'SEO vs SEO Poisoning',
    kind: 'definition',
    unitType: 'comparison',
    items: ['SEO - Search Engine Optimization', 'SEO Poisoning - Increase traffic to malicious websites'],
    summary: 'SEO improves website search ranking; SEO Poisoning increases traffic to malicious websites and forces malicious sites to rank higher.',
    quoteHeadings: ['Methods to Deny Service'],
    fallbackPattern: /SEO.{0,220}SEO Poisoning.{0,180}/i,
  })
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
        kind: /\bdefinitions?\b/i.test(title) ? 'definition' : title.includes('/') ? 'category' : 'concept',
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
    const found = items.filter((item) => sourceContainsStudyItem(source, item))
    if (found.length >= 2) {
      units.push(createUnit({
        title,
        kind,
        unitType,
        summary: `${title}: ${found.join(', ')}.`,
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

  addQuoteUnit('Arnis definition', ['What is Arnis', 'ARNIS', 'ARNIS/ STICK FIGHTING'], 'definition', 'definition', /(?:What is Arnis|ARNIS\/ STICK FIGHTING|ARNIS)\s+.{0,320}?(?:Martial Art|Sport|sticks?)/i)
  addList('Aliases', ['Eskrima', 'Kali', 'Garrote', 'Estoque'], ['Aliases of Arnis', 'What is Arnis'], 'list', 'classification')
  addQuoteUnit('RA 9850', ['Republic Act 9850', 'R.A. 9850'], 'concept', 'historical', /(?:R\.?A\.?|Republic Act)\s*9850.{0,320}/i)
  addQuoteUnit('Historical concept', ['Historical Concept', 'A. HISTORICAL CONCEPT', 'History of Arnis'], 'concept', 'historical', /(?:A\.\s*)?Historical Concept.{0,320}/i)
  addList('Evolution / Classifications', ['Classical Arnis', 'Modern Arnis', 'Sports Arnis', 'Anyo', 'Labanan', 'Arnis Philippines', 'Kali Ilustrisimo', 'Arnis de Abaniko', 'Rizal Arnis', 'Balintawak Arnis', 'Estocada', 'Espada y Daga'], ['Evolution of Arnis', 'B. EVOLVEMENT OF THE ART', 'Classifications of Arnis'], 'category', 'classification')
  addList('Organizations / Timeline', ['1st Arnis Club', 'Doce Pares Association', 'NARAPHIL', 'WEKAF', 'ARPI', 'i-ARNIS', '1970 Arnis clubs accepted Doce Pares rules'], ['Organizations and Timeline', 'Organizations of Arnis', 'B. EVOLVEMENT OF THE ART'], 'category', 'timeline')
  addList('Regional Systems', ['Pangasinan - KALIRONGAN', 'Tagalogs - PANANANDATA', 'Ilocanos - DIDYA/KABAROAN', 'Ibanags - PAGKALIKALI', 'Pampanguenos - SINAWALI', 'Visayans - KINAADMAN/PAGARADMAN/ESGRIMA/ESCRIMA'], ['B. EVOLVEMENT OF THE ART', 'Classifications of Arnis'], 'category', 'classification')
  addList('Main Groups', ['Northern Style - Arnis', 'Central Style - Arnis de Mano', 'Southern Style - Kali'], ['3 MAIN GROUPS'], 'category', 'classification')
  addList('Courtesy / Salutation', ['Attention stance', 'Ready stance', 'Bow', 'Salute', 'Return to ready stance', 'Handa', 'Pugay'], ['Courtesy and Salutation', 'Courtesy Salutation', 'COURTESY / SALUTATION'], 'process', 'procedure')
  addList('Strike Types', ['Babad Hangin', 'Buong Palo', 'Pitik', 'Babad Araw', 'Forehand strike', 'Backhand strike', 'Thrust', 'Diagonal strike', 'Horizontal strike', 'Vertical strike'], ['Striking Techniques', 'Strike Types', 'TYPES OF STRIKES'], 'category', 'classification')
  addList('Equipment / Weapons', ['Baston', 'Yantok', 'Daga', 'Bolo', 'Espada y Daga', 'Bangkaw', 'Bankaw', 'Panangga'], ['Equipment and Weapons', 'Weapons and Equipment', 'Facilities and Equipment', 'Weapons'], 'category', 'equipment')
  addList('Stick Types', ['Baston / Olisi / Yantok - 24 to 28 inches', 'Largo mano yantok - 28 to 36 inches', 'Dulo y Dulo - 4 to 7 inches', 'Bankaw - six-foot pole', 'Panangga - shield', 'Solo Baston', 'Doble Baston', 'Sibat', 'Bangkaw'], ['Stick Types', 'Types of Arnis sticks'], 'category', 'equipment')
  addList('Regional Classifications', ['Luzon', 'Visayans', 'Mindanao'], ['Regional Classifications', 'Classifications of Arnis', '3 MAIN GROUPS'], 'category', 'classification')

  return units
}

function createUnit(input: {
  title: string
  kind: AcademicSourceMapUnitKind
  unitType?: AcademicSourceMapUnitType
  learningShape?: AcademicLearningShape
  sectionPath?: string[]
  summary: string
  items: string[]
  sourceQuote: string
}): AcademicSourceMapUnit {
  const title = normalizeSourceMapHeading(input.title)
  const sectionPath = input.sectionPath?.length
    ? input.sectionPath.map((section) => normalizeSourceMapHeading(section)).filter(Boolean).slice(0, 4)
    : [title]
  return {
    id: slugify(title),
    title,
    kind: input.kind,
    unitType: input.unitType ?? inferSourceMapUnitType(title, input.kind),
    learningShape: input.learningShape ?? inferSourceMapLearningShape(title, input.kind, input.unitType),
    sectionPath,
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
  const bulletItems = text.replace(/\u2022/g, 'â€¢')
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

function sourceContainsStudyItem(source: string, item: string) {
  const cleanedItem = item.replace(/\([^)]*\)/g, ' ').trim()
  if (matchesSourceMapPhrase(source, cleanedItem)) return true

  if (/[-\u2013\u2014/]/u.test(cleanedItem)) {
    const parts = cleanedItem
      .split(/\s*(?:-|\/|\u2013|\u2014)\s*/u)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
    const head = parts[0] ?? ''
    const details = parts.slice(1)
    if (head && details.length > 0) {
      return matchesSourceMapPhrase(source, head) && details.some((detail) => matchesSourceMapPhrase(source, detail))
    }
  }

  const candidates = uniqueStrings([
    item,
    item.split(/\s+(?:-|\u2013|\u2014)\s+/u)[0] ?? '',
    item.split('/')[0] ?? '',
    item.split(',')[0] ?? '',
  ])
    .map((candidate) => candidate.replace(/\([^)]*\)/g, ' ').trim())
    .filter((candidate) => candidate.length >= 3)

  return candidates.some((candidate) => matchesSourceMapPhrase(source, candidate))
}

function matchesSourceMapPhrase(source: string, phrase: string) {
  const cleaned = phrase.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 3) return false
  const pattern = escapeRegExp(cleaned)
    .replace(/-/g, '[-\\s]?')
    .replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${pattern}\\b`, 'i').test(source)
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
  if (items.length >= 2) return `${chunk.heading}: ${items.slice(0, 8).join(', ')}.`
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
  const scoped = /^(?:IT Security definition|IT Security)$/i.test(title)
    ? withoutAdjacent.replace(/\s+InfoSec\s*[-:]\s*.*$/i, '').trim()
    : withoutAdjacent
  const maxChars = kind === 'definition' ? 260 : kind === 'process' ? 420 : 360
  return truncateForSourceMapModel(scoped, maxChars)
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
  if (isWeakSourceMapTitle(unit.title) && unit.items.length < 2) return false
  if (containsInternalSourceMapText(`${unit.title} ${unit.summary} ${unit.sourceQuotes.join(' ')}`)) return false
  if (summaryKey.length < 14 && !RECOGNIZED_SOURCE_MAP_TERMS.has(titleKey)) return false
  if (/^cyber crime\b/i.test(unit.title) && /\bbig business\b/i.test(unit.summary)) return false
  return true
}

function isWeakSourceMapTitle(title: string) {
  const key = normalizeLookup(title)
  if (!key) return true
  if (RECOGNIZED_SOURCE_MAP_TERMS.has(key)) return false
  if (/^(?:there|high|state|terms|programs|activity|organization|source summary|source notes|what)$/i.test(key)) return true
  if (/^(?:understand the|insiders employees and ex)\b/i.test(key)) return true
  if (/\u2022/.test(title) || /Ã¢â‚¬Â¢/.test(title)) return true
  if (/^organized (?:(?:and|&) )?state\b/i.test(key)) return true
  if (/^(?:communicate the issue|overwhelm quantity of traffic)$/i.test(key)) return true
  if (/^(?:cyber crime|organized and state|seo poisoning|sent to a host or application and the receiver)$/i.test(key)) return true
  if (/\?{2,}/.test(title)) return true
  if (/\bthat$/i.test(key)) return true
  if (/^(?:attacks backed by state agencies that|sent to a host or application and the receiver)\b/i.test(key)) return true
  if (/\b(?:other threats infosec processes|contract staff trusted partners|the cause of the breach)\b/i.test(key)) return true
  const words = key.split(/\s+/).filter(Boolean)
  if (words.length === 1 && !RECOGNIZED_SOURCE_MAP_TERMS.has(key) && !/^(?:formula|timeline|rubric|criteria|symptoms?|interventions?|equipment|components?|rules?)$/i.test(key)) return true
  if (words.length >= 7 && !/^(?:vulnerability exploit breach|cybercrime disruption espionage)$/i.test(key)) return true
  if (/\b(?:there is|there are|sent to|attempts to|refers to|the receiver|that are part)\b/i.test(title)) return true
  return false
}

function scoreImportance(title: string, kind: AcademicSourceMapUnitKind, itemCount: number) {
  let score = kind === 'definition' ? 82 : kind === 'process' ? 76 : kind === 'category' ? 72 : 66
  if (HIGH_IMPORTANCE_PATTERNS.some((pattern) => pattern.test(title))) score += 14
  if (/^(?:CIA Triad|IT Security definition|InfoSec vs IT Sec|Vulnerability \/ Exploit \/ Breach|Cybersecurity approach layers|People \/ Process \/ Technology|Unified Threat Management|Zombie vs Botnet|SEO vs SEO Poisoning)$/i.test(title)) score += 18
  if (/^(?:Arnis definition|RA 9850|Organizations \/ Timeline|Timeline|Courtesy \/ Salutation|Equipment \/ Weapons|Regional Classifications|Regional Systems|Main Groups|Stick Types)$/i.test(title)) score += 16
  if (itemCount >= 3) score += 6
  if (itemCount >= 8) score += 4
  return Math.max(1, Math.min(100, score))
}

function normalizeSourceMapHeading(value: string) {
  const cleaned = normalizeStudyOutputHeading(sanitizeStudentFacingText(value).replace(/\?{2,}/g, ' ').replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim())
  const lookup = normalizeLookup(cleaned)
  if (lookup === 'it security definition') return 'IT Security definition'
  if (lookup === 'infosec vs it sec') return 'InfoSec vs IT Sec'
  if (lookup === 'cia triad') return 'CIA Triad'
  if (lookup === 'domains of it security') return 'Domains of IT Security'
  if (lookup === 'cybersecurity definitions') return 'Cybersecurity definitions'
  if (lookup === 'cybersecurity approach layers') return 'Cybersecurity approach layers'
  if (lookup === 'people process technology') return 'People / Process / Technology'
  if (lookup === 'unified threat management') return 'Unified Threat Management'
  if (lookup === 'importance of cybersecurity') return 'Importance of cybersecurity'
  if (lookup === 'impact of a security breach') return 'Impact of a Security Breach'
  if (lookup === 'zombie vs botnet') return 'Zombie vs Botnet'
  if (lookup === 'seo vs seo poisoning') return 'SEO vs SEO Poisoning'
  if (lookup === 'vulnerability exploit breach') return 'Vulnerability / Exploit / Breach'
  if (lookup === 'cybercrime disruption espionage') return 'Cybercrime / Disruption / Espionage'
  if (lookup === 'malware types') return 'Malware types'
  if (lookup === 'malware symptoms') return 'Malware symptoms'
  if (lookup === 'types of attackers') return 'Types of attackers'
  if (lookup === 'infiltration methods' || lookup === 'methods of infiltration') return 'Infiltration methods'
  if (lookup === 'denial of service methods' || lookup === 'methods to deny service') return 'Denial of service methods'
  if (lookup === 'blended attacks') return 'Blended attacks'
  if (lookup === 'impact reduction communicate the issue') return 'Impact reduction'
  if (lookup === 'impact reduction') return 'Impact reduction'
  if (lookup === 'goal of it security') return 'CIA Triad'
  if (lookup === 'types of cybersecurity threats') return 'Cybercrime / Disruption / Espionage'
  if (lookup === 'types of malware') return 'Malware types'
  if (lookup === 'symptoms of malware') return 'Malware symptoms'
  if (lookup === 'challenges of cybersecurity') return 'Challenges'
  if (lookup === 'what is arnis' || lookup === 'arnis definition' || lookup === 'arnis' || lookup === 'arnis stick fighting') return 'Arnis definition'
  if (lookup === 'aliases of arnis') return 'Aliases'
  if (lookup === 'republic act 9850' || lookup === 'ra 9850' || lookup === 'r a 9850') return 'RA 9850'
  if (lookup === 'historical concept' || lookup === 'a historical concept' || lookup === 'history of arnis') return 'Historical concept'
  if (lookup === 'evolution of arnis' || lookup === 'evolvement of the art' || lookup === 'b evolvement of the art' || lookup === 'classifications of arnis') return 'Evolution / Classifications'
  if (lookup === 'organizations and timeline' || lookup === 'organizations of arnis') return 'Organizations / Timeline'
  if (lookup === '3 main groups' || lookup === 'main groups') return 'Main Groups'
  if (lookup === 'courtesy and salutation' || lookup === 'courtesy salutation') return 'Courtesy / Salutation'
  if (lookup === 'striking techniques' || lookup === 'strike types' || lookup === 'types of strikes') return 'Strike Types'
  if (lookup === 'equipment and weapons' || lookup === 'weapons and equipment' || lookup === 'facilities and equipment' || lookup === 'weapons') return 'Equipment / Weapons'
  if (lookup === 'stick types' || lookup === 'types of arnis sticks') return 'Stick Types'
  if (lookup === 'regional classifications') return 'Regional Classifications'
  if (lookup === 'arnis as a sport') return 'Arnis as a Sport'
  return cleaned
}

function cleanupItem(value: string) {
  return sanitizeStudentFacingText(value)
    .replace(/\s+/g, ' ')
    .replace(/\?{2,}/g, ' ')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[\s"'([{.:;-]+|[\s"'.,;:)\]}]+$/g, '')
    .trim()
}

function cleanupSummary(value: string) {
  return cleanupItem(value).slice(0, 320)
}

function isLikelySectionHeading(line: string) {
  const cleaned = cleanupItem(line).replace(/[:.]$/, '')
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 8) return false
  if (SOURCE_MAP_HEADINGS.some((heading) => normalizeLookup(heading) === normalizeLookup(cleaned))) return true
  if (/^(?:[A-Z]\.\s*)?[A-Z0-9][A-Z0-9 /&-]{3,}$/.test(cleaned) && !/[.!?]$/.test(cleaned)) return true
  return /^(?:chapter|lesson|unit|section|part|topic|module)\s+\d+/i.test(cleaned)
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

function containsInternalSourceMapText(value: string) {
  return /\b(?:source notes|source summary|exact source wording|reconstructed lists|clean source summary fragments|academic source map|deterministic academic structure|metadata|uuid|debug|quality notes?)\b/i.test(value)
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
