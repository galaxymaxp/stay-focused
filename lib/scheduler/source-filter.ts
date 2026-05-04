/**
 * Returns true when a module_resource's resource_type represents an actual
 * source material (PDF, PPT, PPTX, DOC, DOCX, Canvas page, file).
 *
 * Quiz-type Canvas resources ("Canvas Quiz", "quiz", etc.) are assessments —
 * not study source materials — and must be excluded from scheduled blocks.
 */
export function isSchedulableResourceType(resourceType: string | null | undefined): boolean {
  const type = (resourceType ?? '').toLowerCase()
  return !type.includes('quiz')
}
