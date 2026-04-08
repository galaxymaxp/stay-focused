import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { getModuleResourceCapabilityInfo, getNormalizedModuleResourceSourceType } from '../lib/module-resource-capability'
import { getModuleResourceQualityInfo } from '../lib/module-resource-quality'
import { adaptModuleResourceRow } from '../lib/module-resource-row'
import { reprocessStoredModuleResource, shouldReprocessWeakModuleResource } from '../lib/module-resource-reprocess'

type ScriptScope = 'weak' | 'all'

interface ParsedArgs {
  ids: string[]
  titles: string[]
  scope: ScriptScope
  normalizedType: string | null
  dryRun: boolean
  limit: number | null
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

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    ids: [],
    titles: [],
    scope: 'weak',
    normalizedType: null,
    dryRun: false,
    limit: 25,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--id') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --id')
      args.ids.push(nextValue)
      args.limit = null
      index += 1
      continue
    }

    if (value === '--title') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --title')
      args.titles.push(nextValue)
      args.limit = null
      index += 1
      continue
    }

    if (value === '--scope') {
      const nextValue = argv[index + 1]
      if (nextValue !== 'weak' && nextValue !== 'all') {
        throw new Error('Expected --scope weak or --scope all')
      }
      args.scope = nextValue
      index += 1
      continue
    }

    if (value === '--type') {
      const nextValue = argv[index + 1]
      if (!nextValue) throw new Error('Expected a value after --type')
      args.normalizedType = nextValue.trim().toLowerCase()
      index += 1
      continue
    }

    if (value === '--failed-pdfs') {
      args.scope = 'weak'
      args.normalizedType = 'pdf'
      continue
    }

    if (value === '--all-pdfs') {
      args.scope = 'all'
      args.normalizedType = 'pdf'
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

  return args
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
    .select('*')
    .order('created_at', { ascending: false })

  if (args.ids.length > 0) {
    query = query.in('id', args.ids)
  }

  if (args.titles.length > 0) {
    query = query.in('title', args.titles)
  }

  if (typeof args.limit === 'number' && args.ids.length === 0 && args.titles.length === 0) {
    query = query.limit(args.limit)
  }

  const { data, error } = await query
  if (error) throw new Error(`Failed to load module_resources: ${error.message}`)

  const resources = (data ?? []).map((row) => adaptModuleResourceRow(row as Record<string, unknown>))
  const filtered = resources.filter((resource) => {
    if (args.normalizedType && getNormalizedModuleResourceSourceType(resource) !== args.normalizedType) {
      return false
    }

    if (args.scope === 'weak' && !shouldReprocessWeakModuleResource(resource)) {
      return false
    }

    return true
  })

  const results: Array<Record<string, unknown>> = []

  for (const resource of filtered) {
    const before = getModuleResourceCapabilityInfo(resource)
    const beforeQuality = getModuleResourceQualityInfo(resource)
    const reprocessed = await reprocessStoredModuleResource(resource, {
      triggeredBy: 'script',
    })

    if (!args.dryRun) {
      const { error: updateError } = await supabase
        .from('module_resources')
        .update({
          extraction_status: reprocessed.update.extractionStatus,
          extracted_text: reprocessed.update.extractedText,
          extracted_text_preview: reprocessed.update.extractedTextPreview,
          extracted_char_count: reprocessed.update.extractedCharCount,
          extraction_error: reprocessed.update.extractionError,
          metadata: reprocessed.update.metadata,
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
      normalizedSourceType: before.normalizedSourceType,
      previousStatus: resource.extractionStatus,
      previousCapability: before.capability,
      previousQuality: beforeQuality.quality,
      nextStatus: reprocessed.update.extractionStatus,
      nextCapability: reprocessed.capability.capability,
      nextQuality: reprocessed.quality.quality,
      extractedCharCount: reprocessed.update.extractedCharCount,
      extractionError: reprocessed.update.extractionError,
      qualityReason: reprocessed.quality.reason,
      updated: !args.dryRun,
    })
  }

  console.log(JSON.stringify({
    dryRun: args.dryRun,
    scope: args.scope,
    normalizedType: args.normalizedType,
    attempted: filtered.length,
    results,
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
