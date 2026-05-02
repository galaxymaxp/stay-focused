import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { extractPdfTextFromBuffer } from '../lib/extraction/pdf-extractor'
import { extractScannedPdfTextWithOpenAI } from '../lib/extraction/pdf-ocr'
import { classifyExtractedTextQuality, classifyModuleResourceTextQuality } from '../lib/extracted-text-quality'
import { buildOcrCompletedUpdate } from '../lib/source-ocr-updates'
import { classifyDeepLearnResourceReadiness } from '../lib/deep-learn-readiness'
import { buildDeepLearnGroundingWithDependencies, generateDeepLearnNoteForResource } from '../lib/deep-learn-generation'
import { getLearnResourceUiState } from '../lib/learn-resource-ui'
import { adaptModuleResourceRow } from '../lib/module-resource-row'
import type { ModuleSourceResource } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'

interface ParsedArgs {
  pdfPath: string | null
  resourceId: string | null
}

const REQUIRED_TERMS = [
  'DATA ORGANIZATION',
  'OLTP',
  'Online Transaction Processing',
  'ODS',
  'Operational Data Store',
  'Subject-Oriented',
  'Integrated',
  'Current Valued',
  'Volatile',
]

const FORBIDDEN_TERMS = [
  'ERP',
  'SAP Learning Hub',
  'Gym Badge',
  'File title',
  'Source type of the file',
  'Module name',
  'Course name',
  'Extraction quality reported',
  'Source text quality reported',
  'Grounding strategy used',
]

async function main() {
  loadEnvFile()
  const args = parseArgs(process.argv.slice(2))
  if (args.resourceId) {
    await validateDbResource(args.resourceId)
  }

  if (!args.pdfPath) {
    if (args.resourceId) return
    throw new Error('Usage: npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\\path\\to\\file.pdf" [--resource-id uuid]')
  }

  const pdfPath = path.resolve(args.pdfPath)
  const buffer = fs.readFileSync(pdfPath)

  console.log(`Validating scanned PDF guardrail for ${pdfPath}`)
  console.log(`PDF bytes: ${buffer.length}`)

  const parsed = await extractPdfTextFromBuffer(buffer)
  assert.equal(parsed.status, 'empty', `Expected normal PDF parse to return empty for image-only slides, got ${parsed.status}`)
  assert.equal(parsed.errorCode, 'pdf_image_only_possible', `Expected OCR-required PDF classification, got ${parsed.errorCode ?? 'null'}`)
  console.log(`Pre-OCR parse: ${parsed.status} (${parsed.errorCode})`)

  const preStored = createStoredResource({
    title: path.basename(pdfPath),
    sourceUrl: pdfPath,
    extractionStatus: 'empty',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: parsed.message ? `${parsed.errorCode}: ${parsed.message}` : parsed.errorCode,
    visualExtractionStatus: 'available',
    pageCount: parsed.pageCount,
    metadata: {
      normalizedSourceType: 'pdf',
      previewState: 'no_text_available',
      fullTextAvailable: false,
      storedTextLength: 0,
      storedPreviewLength: 0,
      storedWordCount: 0,
      pdfExtraction: {
        status: parsed.status,
        errorCode: parsed.errorCode,
        pageCount: parsed.pageCount,
        charCount: parsed.charCount,
        meaningfulTextRatio: parsed.quality.meaningfulTextRatio,
        meaningfulCharCount: parsed.quality.meaningfulCharCount,
        wordCount: parsed.quality.wordCount,
        sentenceCount: parsed.quality.sentenceCount,
        imageOnlyPossible: parsed.quality.imageOnlyPossible,
        needsReview: false,
      },
    },
  })
  const preLearn = createLearnResourceFromStored(preStored)

  const preReadiness = classifyDeepLearnResourceReadiness({
    resource: preLearn,
    storedResource: preStored,
    canonicalResourceId: preStored.id,
  })
  assert.equal(preReadiness.state, 'unreadable')
  assert.equal(preReadiness.canGenerate, false)
  assert.equal(preReadiness.detail, 'Preparing scanned PDF will start automatically. If it does not start, retry extraction.')

  const preUi = getLearnResourceUiState(preLearn, { hasOriginalFile: true, hasCanvasLink: true })
  assert.equal(preUi.statusKey, 'visual_ocr_required')
  assert.equal(preUi.summary, 'Preparing scanned PDF will start automatically. If it does not start, retry extraction.')
  console.log(`Pre-OCR readiness: ${preReadiness.state}`)
  console.log(`Pre-OCR UI copy: ${preUi.summary}`)

  assert.ok(process.env.OPENAI_API_KEY?.trim(), 'OPENAI_API_KEY is required to run the production OCR validation script.')
  const ocr = await extractScannedPdfTextWithOpenAI({
    buffer,
    filename: path.basename(pdfPath),
    pageCount: parsed.pageCount,
  })
  assert.equal(ocr.status, 'completed', ocr.error ?? 'OCR did not complete.')
  const rawOcrQuality = classifyExtractedTextQuality({
    text: ocr.text,
    title: path.basename(pdfPath),
  })
  assert.equal(rawOcrQuality.quality, 'meaningful', `Expected production OCR to return meaningful text, got ${rawOcrQuality.quality}`)

  for (const term of REQUIRED_TERMS) {
    assert.match(ocr.text, new RegExp(escapeRegExp(term), 'i'), `Expected OCR text to contain "${term}"`)
  }

  console.log(`OCR completed with ${ocr.charCount} characters across ${ocr.pages.length || 1} rendered pages`)
  console.log(`OCR term check passed for ${REQUIRED_TERMS.length} expected terms`)

  const ocrUpdate = buildOcrCompletedUpdate({
    resource: preStored,
    ocr,
    now: new Date().toISOString(),
  })
  assert.equal(ocrUpdate.extraction_status, 'completed', `OCR update should keep the resource blocked when text is bad; got ${ocrUpdate.extraction_status}`)
  const failedPageNumbers = ocr.pages
    .filter((page) => page.status === 'failed')
    .map((page) => page.pageNumber)
  printOcrPersistenceDiagnostics({
    label: 'Local OCR update diagnostics',
    resource: preStored,
    pageCountDetected: ocrUpdate.page_count ?? preStored.pageCount ?? null,
    ocrPagesProcessed: ocrUpdate.pages_processed,
    totalOcrCharacters: ocr.charCount,
    extractedTextLength: ocrUpdate.extracted_text?.length ?? 0,
    visualExtractedTextLength: ocrUpdate.visual_extracted_text?.length ?? 0,
    extractedCharCount: ocrUpdate.extracted_char_count,
    sourceTextQuality: classifyExtractedTextQuality({ text: ocrUpdate.extracted_text, title: preStored.title }).quality,
    readiness: null,
    failedPageIndexes: failedPageNumbers,
  })
  const postStored = applyOcrUpdate(preStored, ocrUpdate)
  const postLearn = createLearnResourceFromStored(postStored)

  const postReadiness = classifyDeepLearnResourceReadiness({
    resource: postLearn,
    storedResource: postStored,
    canonicalResourceId: postStored.id,
  })
  assert.equal(postReadiness.state, 'text_ready')
  assert.equal(postReadiness.canGenerate, true)
  printOcrPersistenceDiagnostics({
    label: 'Post-OCR readiness diagnostics',
    resource: postStored,
    pageCountDetected: postStored.pageCount ?? null,
    ocrPagesProcessed: postStored.pagesProcessed ?? 0,
    totalOcrCharacters: ocr.charCount,
    extractedTextLength: postStored.extractedText?.length ?? 0,
    visualExtractedTextLength: postStored.visualExtractedText?.length ?? 0,
    extractedCharCount: postStored.extractedCharCount,
    sourceTextQuality: classifyExtractedTextQuality({ text: postStored.extractedText, title: postStored.title }).quality,
    readiness: postReadiness,
  })

  const postUi = getLearnResourceUiState(postLearn, { hasOriginalFile: true, hasCanvasLink: true })
  const pagesProcessed = postStored.pagesProcessed ?? 0
  const pageCount = postStored.pageCount ?? 0
  const expectedOcrStatusKey = pageCount > 0 && pagesProcessed < pageCount ? 'visual_ocr_partial' : 'ready'
  assert.equal(postUi.statusKey, expectedOcrStatusKey, `Expected OCR UI statusKey to be "${expectedOcrStatusKey}" (${pagesProcessed}/${pageCount} pages processed)`)

  const context = createGenerationContext(postLearn, postStored)
  const grounding = await buildDeepLearnGroundingWithDependencies(context)
  for (const forbiddenPattern of getForbiddenPatterns()) {
    assert.doesNotMatch(grounding.promptGrounding, forbiddenPattern.regex, `Prompt grounding should not contain stale term "${forbiddenPattern.label}"`)
  }

  const generated = await generateDeepLearnNoteForResource(context)
  const generatedText = JSON.stringify(generated.content)
  for (const forbiddenPattern of getForbiddenPatterns()) {
    assert.doesNotMatch(generatedText, forbiddenPattern.regex, `Deep Learn output should not contain stale term "${forbiddenPattern.label}"`)
  }

  assert.match(generatedText, /data organization/i, 'Deep Learn output should mention Data Organization')
  assert.match(generatedText, /oltp|online transaction processing/i, 'Deep Learn output should mention OLTP')
  assert.match(generatedText, /ods|operational data store/i, 'Deep Learn output should mention ODS')

  console.log('Deep Learn generation check passed')
  console.log('Validation succeeded')
}

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return

  const contents = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  let pdfPath: string | null = null
  let resourceId: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--pdf') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a file path after --pdf')
      pdfPath = nextValue
      index += 1
      continue
    }
    if (argv[index] === '--resource-id') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a resource id after --resource-id')
      resourceId = nextValue
      index += 1
    }
  }

  return { pdfPath, resourceId }
}

async function validateDbResource(resourceId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required for --resource-id validation.')
  assert.ok(supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required for --resource-id validation.')

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await supabase
    .from('module_resources')
    .select('*')
    .eq('id', resourceId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load module_resources row ${resourceId}: ${error.message}`)
  assert.ok(data, `No module_resources row found for ${resourceId}`)

  const resource = adaptModuleResourceRow(data as Record<string, unknown>)
  const learnResource = createLearnResourceFromStored(resource)
  const sourceTextQuality = classifyModuleResourceTextQuality(resource)
  const readiness = classifyDeepLearnResourceReadiness({
    resource: learnResource,
    storedResource: resource,
    canonicalResourceId: resource.id,
  })

  const ocrQueueJob = await loadLatestOcrQueueJob(supabase, resource.id)
  const dbFailedPages = getNestedArray(resource.metadata, ['visualExtractionPages'])
    .filter((page) => asPlainRecord(page).status === 'failed')
    .map((page) => Number(asPlainRecord(page).pageNumber))
    .filter((n) => Number.isFinite(n))
  printOcrPersistenceDiagnostics({
    label: 'DB resource diagnostics',
    resource,
    pageCountDetected: resource.pageCount ?? null,
    ocrPagesProcessed: resource.pagesProcessed ?? 0,
    totalOcrCharacters: getNestedNumber(resource.metadata, ['pdfOcr', 'usefulCharCount']) ?? (resource.visualExtractedText?.length ?? resource.extractedText?.length ?? 0),
    extractedTextLength: resource.extractedText?.length ?? 0,
    visualExtractedTextLength: resource.visualExtractedText?.length ?? 0,
    extractedCharCount: resource.extractedCharCount,
    sourceTextQuality: sourceTextQuality.quality,
    readiness,
    ocrQueueJob,
    failedPageIndexes: dbFailedPages,
    autoEnqueueDecision: explainAutoEnqueueDecision(resource, readiness),
  })
}

function createStoredResource(overrides: Partial<ModuleResource>): ModuleResource {
  return {
    id: overrides.id ?? 'stored-resource-1',
    moduleId: overrides.moduleId ?? 'module-1',
    courseId: overrides.courseId ?? 'course-1',
    canvasModuleId: overrides.canvasModuleId ?? 101,
    canvasItemId: overrides.canvasItemId ?? 201,
    canvasFileId: overrides.canvasFileId ?? 301,
    title: overrides.title ?? '1.1-Data Organization.pdf',
    resourceType: overrides.resourceType ?? 'File',
    contentType: overrides.contentType ?? 'application/pdf',
    extension: overrides.extension ?? 'pdf',
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/files/data-organization.pdf',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/files/1',
    extractionStatus: overrides.extractionStatus ?? 'empty',
    extractedText: overrides.extractedText ?? null,
    extractedTextPreview: overrides.extractedTextPreview ?? null,
    extractedCharCount: overrides.extractedCharCount ?? 0,
    extractionError: overrides.extractionError ?? null,
    visualExtractionStatus: overrides.visualExtractionStatus ?? 'available',
    visualExtractedText: overrides.visualExtractedText ?? null,
    visualExtractionError: overrides.visualExtractionError ?? null,
    pageCount: overrides.pageCount ?? null,
    pagesProcessed: overrides.pagesProcessed ?? 0,
    extractionProvider: overrides.extractionProvider ?? null,
    required: overrides.required ?? true,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? '2026-05-02T00:00:00.000Z',
  }
}

function createLearnResourceFromStored(resource: ModuleResource): ModuleSourceResource {
  const metadata = resource.metadata
  return {
    id: resource.id,
    title: resource.title,
    originalTitle: resource.title,
    canvasModuleId: resource.canvasModuleId,
    canvasItemId: resource.canvasItemId,
    canvasFileId: resource.canvasFileId,
    metadata,
    type: 'File',
    contentType: resource.contentType,
    extension: resource.extension,
    required: resource.required,
    moduleName: 'Week 1',
    category: 'resource',
    kind: 'study_file',
    lane: 'learn',
    courseName: 'Data Warehousing',
    dueDate: null,
    sourceUrl: resource.sourceUrl,
    htmlUrl: resource.htmlUrl,
    moduleUrl: null,
    canvasUrl: resource.htmlUrl,
    linkedContext: 'ERP SAP Learning Hub Gym Badge unrelated assignment dates.',
    whyItMatters: 'ERP SAP Learning Hub Gym Badge assignment date stale context.',
    extractionStatus: resource.extractionStatus,
    extractedText: resource.extractedText,
    extractedTextPreview: resource.extractedTextPreview,
    extractedCharCount: resource.extractedCharCount,
    extractionError: resource.extractionError,
    visualExtractionStatus: resource.visualExtractionStatus,
    visualExtractedText: resource.visualExtractedText,
    visualExtractionError: resource.visualExtractionError,
    pageCount: resource.pageCount,
    pagesProcessed: resource.pagesProcessed,
    extractionProvider: resource.extractionProvider,
    normalizedSourceType: 'pdf',
    capability: null,
    capabilityReason: null,
    quality: null,
    qualityReason: null,
    groundingLevel: null,
    originalResourceKind: 'File',
    resolvedTargetType: 'file',
    sourceUrlCategory: 'canvas_file',
    resolvedUrlCategory: 'canvas_file',
    resolvedUrl: resource.sourceUrl,
    resolutionState: 'resolved',
    fallbackReason: getOptionalString(metadata.fallbackReason) ?? null,
    recommendationStrength: 'weak',
    previewState: getOptionalPreviewState(metadata.previewState),
    fullTextAvailable: getOptionalBoolean(metadata.fullTextAvailable) ?? false,
    storedTextLength: getOptionalNumber(metadata.storedTextLength) ?? resource.extractedCharCount,
    storedPreviewLength: getOptionalNumber(metadata.storedPreviewLength) ?? (resource.extractedTextPreview?.length ?? 0),
    storedWordCount: getOptionalNumber(metadata.storedWordCount) ?? 0,
    studyProgressStatus: 'not_started',
    workflowOverride: 'study',
    lastOpenedAt: null,
    studyStateUpdatedAt: null,
  }
}

function applyOcrUpdate(resource: ModuleResource, update: ReturnType<typeof buildOcrCompletedUpdate>): ModuleResource {
  return {
    ...resource,
    extractionStatus: update.extraction_status,
    extractedText: update.extracted_text,
    extractedTextPreview: update.extracted_text_preview,
    extractedCharCount: update.extracted_char_count,
    extractionError: update.extraction_error,
    visualExtractionStatus: update.visual_extraction_status,
    visualExtractedText: update.visual_extracted_text,
    visualExtractionError: update.visual_extraction_error,
    pageCount: update.page_count ?? resource.pageCount,
    pagesProcessed: update.pages_processed,
    extractionProvider: update.extraction_provider ?? null,
    metadata: update.metadata,
  }
}

function printOcrPersistenceDiagnostics(input: {
  label: string
  resource: ModuleResource
  pageCountDetected: number | null
  ocrPagesProcessed: number
  totalOcrCharacters: number
  extractedTextLength: number
  visualExtractedTextLength: number
  extractedCharCount: number
  sourceTextQuality: string
  readiness: ReturnType<typeof classifyDeepLearnResourceReadiness> | null
  ocrQueueJob?: {
    id: string
    status: string
    currentPage?: number | null
    pagesProcessed?: number | null
    pageCount?: number | null
    lastHeartbeat?: string | null
    startedAt?: string | null
    completedAt?: string | null
  } | null
  failedPageIndexes?: number[]
  autoEnqueueDecision?: string | null
}) {
  console.log(input.label)
  console.log(`- resource id: ${input.resource.id}`)
  console.log(`- title: ${input.resource.title}`)
  console.log(`- canvas file id: ${input.resource.canvasFileId ?? 'null'}`)
  console.log(`- canvas module id: ${input.resource.canvasModuleId ?? 'null'}`)
  console.log(`- canvas item id: ${input.resource.canvasItemId ?? 'null'}`)
  console.log(`- page count detected: ${input.pageCountDetected ?? 'null'}`)
  console.log(`- extraction_status: ${input.resource.extractionStatus}`)
  console.log(`- visual_extraction_status: ${input.resource.visualExtractionStatus ?? 'null'}`)
  console.log(`- OCR pages processed: ${input.ocrPagesProcessed}`)
  console.log(`- total OCR characters: ${input.totalOcrCharacters}`)
  console.log(`- extracted_text length: ${input.extractedTextLength}`)
  console.log(`- visual_extracted_text length: ${input.visualExtractedTextLength}`)
  console.log(`- extracted_char_count: ${input.extractedCharCount}`)
  console.log(`- sourceTextQuality: ${input.sourceTextQuality}`)
  if (input.failedPageIndexes && input.failedPageIndexes.length > 0) {
    console.log(`- failed page numbers: ${input.failedPageIndexes.join(', ')}`)
  }
  const pdfOcr = getNestedRecord(input.resource.metadata, ['pdfOcr'])
  if (pdfOcr.isPartial === true) {
    console.log(`- isPartial: true — ${pdfOcr.remainingPages ?? '?'} pages remaining, can continue extraction`)
  }
  const completedNums = pdfOcr.completedPageNumbers
  if (Array.isArray(completedNums) && completedNums.length > 0) {
    console.log(`- completed page numbers: ${completedNums.slice(0, 10).join(', ')}${completedNums.length > 10 ? ` ... (${completedNums.length} total)` : ''}`)
  }
  if (input.readiness) {
    console.log(`- readiness: ${input.readiness.state}`)
    console.log(`- canGenerate: ${input.readiness.canGenerate}`)
    if (input.readiness.detail) console.log(`- readiness detail: ${input.readiness.detail}`)
  }
  if (input.ocrQueueJob) {
    const job = input.ocrQueueJob
    console.log(`- OCR queue job id: ${job.id}`)
    console.log(`- OCR queue job status: ${job.status}`)
    if (job.currentPage != null) console.log(`- OCR current page: ${job.currentPage}`)
    if (job.pagesProcessed != null) console.log(`- OCR pages processed (job): ${job.pagesProcessed}`)
    if (job.pageCount != null) console.log(`- OCR page count (job): ${job.pageCount}`)
    console.log(`- OCR last heartbeat: ${job.lastHeartbeat ?? 'none'}`)
    if (job.startedAt) console.log(`- OCR started at: ${job.startedAt}`)
    if (job.completedAt) console.log(`- OCR completed at: ${job.completedAt}`)
    if (job.status === 'running' && job.lastHeartbeat) {
      const heartbeatAge = Math.round((Date.now() - new Date(job.lastHeartbeat).getTime()) / 1000)
      console.log(`- OCR heartbeat age: ${heartbeatAge}s`)
      if (heartbeatAge > 15 * 60) {
        console.log('  ⚠ heartbeat is stale — job may be stuck (>15 min since last update)')
      }
    }
  } else {
    console.log('- OCR queue job: none')
  }
  console.log(`- auto-enqueue decision: ${input.autoEnqueueDecision ?? 'not evaluated in this local-only check'}`)
}

async function loadLatestOcrQueueJob(
  supabase: { from: (table: string) => ReturnType<ReturnType<typeof createClient>['from']> },
  resourceId: string,
) {
  const { data, error } = await supabase
    .from('queued_jobs')
    .select('id,status,payload,result,created_at,updated_at,started_at,completed_at')
    .eq('type', 'source_ocr')
    .order('created_at', { ascending: false })
    .limit(25)

  if (error || !data) return null
  const row = (data as Record<string, unknown>[]).find((job) => {
    const payload = asPlainRecord(job.payload)
    const result = asPlainRecord(job.result)
    return payload.resourceId === resourceId || result.resourceId === resourceId
  })
  if (!row) return null

  const result = asPlainRecord(row.result)
  return {
    id: String(row.id),
    status: String(row.status),
    currentPage: getOptionalNumber(result.pagesProcessed) ?? null,
    pagesProcessed: getOptionalNumber(result.pagesProcessed) ?? null,
    pageCount: getOptionalNumber(result.pageCount) ?? null,
    lastHeartbeat: row.updated_at ? String(row.updated_at) : null,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  }
}

function explainAutoEnqueueDecision(resource: ModuleResource, readiness: ReturnType<typeof classifyDeepLearnResourceReadiness>) {
  if (readiness.canGenerate) return 'not queued because source text is already meaningful'
  if (resource.visualExtractionStatus === 'queued' || resource.visualExtractionStatus === 'running') return 'not queued because OCR is already active'
  if (resource.visualExtractionStatus === 'failed') return 'not queued automatically if a recent failed source_ocr job exists; retry is manual'
  if (resource.extension?.toLowerCase() === 'pdf' || resource.contentType?.toLowerCase().includes('pdf')) return 'auto-enqueue expected when normal extraction reports image-only/empty/thin PDF text'
  return 'not queued because the resource does not look like a PDF OCR candidate'
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function createGenerationContext(resource: ModuleSourceResource, storedResource: ModuleResource) {
  const moduleRecord: Module = {
    id: 'module-1',
    courseId: 'course-1',
    title: 'Week 1',
    raw_content: 'Real scanned PDF validation context',
    summary: 'ERP SAP Learning Hub Gym Badge unrelated assignment dates.',
    concepts: [],
    study_prompts: [],
    recommended_order: [],
    status: 'processed',
    created_at: '2026-05-02T00:00:00.000Z',
  }

  return {
    module: moduleRecord,
    courseName: 'Data Warehousing',
    resource,
    storedResource,
    linkedTask: null,
  }
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' ? value : null
}

function getOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function getOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getNestedRecord(source: Record<string, unknown>, pathParts: string[]): Record<string, unknown> {
  let current: unknown = source
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return {}
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'object' && current !== null && !Array.isArray(current)
    ? (current as Record<string, unknown>)
    : {}
}

function getNestedArray(source: Record<string, unknown>, pathParts: string[]): unknown[] {
  let current: unknown = source
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return []
    current = (current as Record<string, unknown>)[part]
  }
  return Array.isArray(current) ? current : []
}

function getNestedNumber(source: Record<string, unknown>, pathParts: string[]) {
  let current: unknown = source
  for (const part of pathParts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : null
}

function getOptionalPreviewState(value: unknown): ModuleSourceResource['previewState'] {
  return value === 'full_text_available' || value === 'preview_only' || value === 'no_text_available'
    ? value
    : 'no_text_available'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getForbiddenPatterns() {
  return FORBIDDEN_TERMS.map((label) => ({
    label,
    regex: label === 'ERP'
      ? /\berp\b/i
      : new RegExp(escapeRegExp(label), 'i'),
  }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
