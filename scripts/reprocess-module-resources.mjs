import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { extractCanvasFileContent } from '../lib/canvas-resource-extraction.ts'

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local')
  const contents = fs.readFileSync(envPath, 'utf8')

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function parseArgs(argv) {
  const args = {
    ids: [],
    titles: [],
    failedPdfsOnly: true,
    dryRun: false,
    limit: 25,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--id') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --id')
      args.ids.push(nextValue)
      args.failedPdfsOnly = false
      index += 1
      continue
    }

    if (value === '--title') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --title')
      args.titles.push(nextValue)
      args.failedPdfsOnly = false
      index += 1
      continue
    }

    if (value === '--all-pdfs') {
      args.failedPdfsOnly = false
      continue
    }

    if (value === '--failed-pdfs') {
      args.failedPdfsOnly = true
      continue
    }

    if (value === '--dry-run') {
      args.dryRun = true
      continue
    }

    if (value === '--limit') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a numeric value after --limit')
      const parsed = Number.parseInt(nextValue, 10)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value: ${nextValue}`)
      }
      args.limit = parsed
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${value}`)
  }

  if (args.ids.length > 0 || args.titles.length > 0) {
    args.limit = null
  }

  return args
}

function isPdfResource(resource) {
  const extension = resource.extension?.toLowerCase() ?? null
  const contentType = resource.content_type?.toLowerCase() ?? null

  return extension === 'pdf' || contentType === 'application/pdf'
}

function buildMissingSourceResult(title) {
  return {
    extractionStatus: 'failed',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: `Reprocess failed: ${title} has no stored source URL.`,
    supported: true,
  }
}

async function fetchResourceBuffer(sourceUrl) {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`)
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  }
}

async function main() {
  loadEnvFile()

  const args = parseArgs(process.argv.slice(2))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase env vars are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let query = supabase
    .from('module_resources')
    .select('id,title,source_url,content_type,extension,extraction_status,extraction_error,created_at')
    .order('created_at', { ascending: false })

  if (args.failedPdfsOnly) {
    query = query.eq('extraction_status', 'failed')
  }

  if (args.ids.length > 0) {
    query = query.in('id', args.ids)
  }

  if (args.titles.length > 0) {
    query = query.in('title', args.titles)
  }

  if (typeof args.limit === 'number') {
    query = query.limit(args.limit)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to load module_resources: ${error.message}`)

  const pdfResources = (data ?? []).filter(isPdfResource)
  const results = []

  for (const resource of pdfResources) {
    let extracted = buildMissingSourceResult(resource.title)

    if (resource.source_url) {
      try {
        const downloaded = await fetchResourceBuffer(resource.source_url)
        extracted = await extractCanvasFileContent({
          buffer: downloaded.buffer,
          title: resource.title,
          extension: resource.extension,
          contentType: resource.content_type ?? downloaded.contentType,
        })
      } catch (downloadError) {
        extracted = {
          extractionStatus: 'failed',
          extractedText: null,
          extractedTextPreview: null,
          extractedCharCount: 0,
          extractionError: downloadError instanceof Error
            ? `Reprocess download failed: ${downloadError.message}`
            : 'Reprocess download failed.',
          supported: true,
        }
      }
    }

    if (!args.dryRun) {
      const { error: updateError } = await supabase
        .from('module_resources')
        .update({
          extraction_status: extracted.extractionStatus,
          extracted_text: extracted.extractedText,
          extracted_text_preview: extracted.extractedTextPreview,
          extracted_char_count: extracted.extractedCharCount,
          extraction_error: extracted.extractionError,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resource.id)

      if (updateError) {
        throw new Error(`Failed to update ${resource.title}: ${updateError.message}`)
      }
    }

    results.push({
      id: resource.id,
      title: resource.title,
      previousStatus: resource.extraction_status,
      nextStatus: extracted.extractionStatus,
      extractedCharCount: extracted.extractedCharCount,
      extractionError: extracted.extractionError,
      updated: !args.dryRun,
    })
  }

  console.log(JSON.stringify({
    dryRun: args.dryRun,
    attempted: pdfResources.length,
    results,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
