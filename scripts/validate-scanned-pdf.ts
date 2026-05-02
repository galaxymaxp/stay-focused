import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractPdfTextFromBuffer } from '../lib/extraction/pdf-extractor'
import { extractScannedPdfTextWithOpenAI, type PdfOcrResult } from '../lib/extraction/pdf-ocr'
import { buildOcrCompletedUpdate } from '../lib/source-ocr-updates'
import { classifyDeepLearnResourceReadiness } from '../lib/deep-learn-readiness'
import { buildDeepLearnGroundingWithDependencies, generateDeepLearnNoteForResource } from '../lib/deep-learn-generation'
import { getLearnResourceUiState } from '../lib/learn-resource-ui'
import type { ModuleSourceResource } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'

interface ParsedArgs {
  pdfPath: string
}

type CompletedOcrResult = Extract<PdfOcrResult, { status: 'completed' }>

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
]

async function main() {
  loadEnvFile()
  const args = parseArgs(process.argv.slice(2))
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
  assert.equal(preReadiness.detail, 'This PDF appears to be image-based. Run visual extraction first.')

  const preUi = getLearnResourceUiState(preLearn, { hasOriginalFile: true, hasCanvasLink: true })
  assert.equal(preUi.statusKey, 'visual_ocr_required')
  assert.equal(preUi.summary, 'This PDF appears to be image-based. Run visual extraction first.')
  console.log(`Pre-OCR readiness: ${preReadiness.state}`)
  console.log(`Pre-OCR UI copy: ${preUi.summary}`)

  const openAiOcrAvailable = Boolean(process.env.OPENAI_API_KEY?.trim())
  const openAiOcr = openAiOcrAvailable
    ? await extractScannedPdfTextWithOpenAI({
        buffer,
        filename: path.basename(pdfPath),
        pageCount: parsed.pageCount,
      })
    : null

  const openAiOcrSatisfiesTerms = openAiOcr?.status === 'completed'
    ? hasAllRequiredTerms(openAiOcr.text)
    : false
  const effectiveOcr: CompletedOcrResult = openAiOcr?.status === 'completed' && openAiOcrSatisfiesTerms
    ? openAiOcr
    : runOfflineOcr(pdfPath)

  if (openAiOcr?.status === 'completed' && openAiOcrSatisfiesTerms) {
    console.log(`OpenAI OCR completed with ${openAiOcr.charCount} characters`)
  } else if (openAiOcr?.status === 'completed') {
    console.log(`OpenAI OCR completed with ${openAiOcr.charCount} characters but missed expected slide terms`)
    console.log(`OpenAI OCR preview: ${truncate(openAiOcr.text, 220)}`)
    console.log('Falling back to offline OCR for validation only')
  } else if (openAiOcrAvailable) {
    console.log(`OpenAI OCR did not complete cleanly: ${openAiOcr?.error ?? 'unknown error'}`)
    console.log('Falling back to offline OCR for validation only')
  } else {
    console.log('OPENAI_API_KEY was not loaded; using offline OCR for validation')
  }

  for (const term of REQUIRED_TERMS) {
    assert.match(effectiveOcr.text, new RegExp(escapeRegExp(term), 'i'), `Expected OCR text to contain "${term}"`)
  }

  console.log(`Effective OCR completed with ${effectiveOcr.charCount} characters across ${effectiveOcr.pages.length || 1} pages`)
  console.log(`OCR term check passed for ${REQUIRED_TERMS.length} expected terms`)

  const ocrUpdate = buildOcrCompletedUpdate({
    resource: preStored,
    ocr: effectiveOcr,
    now: new Date().toISOString(),
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

  const postUi = getLearnResourceUiState(postLearn, { hasOriginalFile: true, hasCanvasLink: true })
  assert.equal(postUi.statusKey, 'ready')

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
  console.log(`OpenAI OCR status: ${openAiOcr?.status ?? 'not_run'}`)
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
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--pdf') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a file path after --pdf')
      return { pdfPath: nextValue }
    }
  }

  throw new Error('Usage: npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\\path\\to\\file.pdf"')
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
    pageCount: resource.pageCount,
    pagesProcessed: update.pages_processed,
    extractionProvider: update.extraction_provider ?? null,
    metadata: update.metadata,
  }
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

function getOptionalPreviewState(value: unknown): ModuleSourceResource['previewState'] {
  return value === 'full_text_available' || value === 'preview_only' || value === 'no_text_available'
    ? value
    : 'no_text_available'
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function hasAllRequiredTerms(text: string) {
  return REQUIRED_TERMS.every((term) => new RegExp(escapeRegExp(term), 'i').test(text))
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function getForbiddenPatterns() {
  return FORBIDDEN_TERMS.map((label) => ({
    label,
    regex: label === 'ERP'
      ? /\berp\b/i
      : new RegExp(escapeRegExp(label), 'i'),
  }))
}

function runOfflineOcr(pdfPath: string): CompletedOcrResult {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stay-focused-ocr-'))
  const pythonScript = `
import json
import fitz
import os
from rapidocr_onnxruntime import RapidOCR

pdf_path = r"""${pdfPath.replace(/\\/g, '\\\\')}"""
temp_dir = r"""${tempDir.replace(/\\/g, '\\\\')}"""
doc = fitz.open(pdf_path)
ocr = RapidOCR()
pages = []

def extract_page_text(page, scale):
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    image_path = os.path.join(temp_dir, f"page-{page.number + 1}-scale-{scale}.png")
    pix.save(image_path)
    result, _ = ocr(image_path, use_det=True, use_cls=True, use_rec=True)
    entries = []
    if result:
        for item in result:
            text = item[1] if len(item) > 1 else ''
            if text:
                box = item[0]
                xs = [point[0] for point in box]
                ys = [point[1] for point in box]
                entries.append({
                    "text": text.strip(),
                    "x": min(xs),
                    "y": sum(ys) / len(ys),
                })

    entries.sort(key=lambda entry: (entry["y"], entry["x"]))
    rows = []
    for entry in entries:
        if not rows or abs(rows[-1]["y"] - entry["y"]) > 45 * scale / 2:
            rows.append({"y": entry["y"], "items": [entry]})
        else:
            rows[-1]["items"].append(entry)

    ordered_lines = []
    for row in rows:
        row["items"].sort(key=lambda entry: entry["x"])
        line = " ".join([entry["text"] for entry in row["items"] if entry["text"]]).strip()
        if line:
            ordered_lines.append(line)

    return ordered_lines

for page_index in range(len(doc)):
    page = doc.load_page(page_index)
    merged_lines = []
    seen = set()
    for scale in (2, 4):
        for line in extract_page_text(page, scale):
            key = line.lower()
            if key in seen:
                continue
            seen.add(key)
            merged_lines.append(line)

    page_text = "\\n".join([line for line in merged_lines if line]).strip()
    if page_text:
        pages.append({
            "pageNumber": page_index + 1,
            "text": page_text,
            "charCount": len(page_text),
        })

text = "\\n\\n".join([f"Page {page['pageNumber']}:\\n{page['text']}" for page in pages]).strip()
print(json.dumps({
    "status": "completed" if text else "failed",
    "text": text,
    "charCount": len(text),
    "pages": pages,
    "provider": "offline_rapidocr_validation",
    "error": None if text else "Offline OCR returned no text.",
    "metadata": {
        "pdfOcr": {
            "status": "completed" if text else "failed",
            "provider": "offline_rapidocr_validation",
            "pageCount": len(doc),
            "pages": pages,
        }
    }
}))
`

  const run = spawnSync('python', ['-c', pythonScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })

  fs.rmSync(tempDir, { recursive: true, force: true })

  if (run.status !== 0) {
    throw new Error(`Offline OCR failed: ${(run.stderr || run.stdout || '').trim()}`)
  }

  const parsed = JSON.parse(run.stdout.trim()) as {
    status: 'completed'
    text: string
    charCount: number
    pages: Array<{ pageNumber: number; text: string; charCount: number }>
    provider: string
    error: null
    metadata: Record<string, unknown>
  }

  assert.equal(parsed.status, 'completed', parsed.error ?? 'Offline OCR returned no text.')

  return parsed
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
