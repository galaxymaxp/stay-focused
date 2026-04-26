import { getNormalizedModuleResourceSourceType } from '@/lib/module-resource-capability'
import type { ModuleResource } from '@/lib/types'

const PROCESSABLE_TYPES = new Set(['pdf', 'pptx', 'docx', 'doc', 'text', 'markdown', 'csv', 'html', 'page', 'assignment', 'discussion', 'file', 'module_item'])
const UNSUPPORTED_EXTENSIONS = new Set(['pkt', 'pka', 'ppt'])

export function isProcessableReadableSource(resource: ModuleResource) {
  const extension = resource.extension?.replace(/^\./, '').toLowerCase() ?? null
  if (extension && UNSUPPORTED_EXTENSIONS.has(extension)) return false
  if (!resource.sourceUrl && !resource.htmlUrl) return false
  const sourceType = getNormalizedModuleResourceSourceType(resource)
  return PROCESSABLE_TYPES.has(sourceType)
}
