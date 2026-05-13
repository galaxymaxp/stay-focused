export function StudyOutputPrintHeader({
  title,
  outputLabel,
  courseLabel,
  moduleTitle,
  generatedAt,
}: {
  title: string
  outputLabel: string
  courseLabel: string | null
  moduleTitle: string | null
  generatedAt: string | null
}) {
  const printDate = formatStudyOutputPrintDate(generatedAt)

  return (
    <div className="reviewer-print-only reviewer-print-meta study-output-print-header">
      <p className="study-output-print-title">{title}</p>
      <div className="study-output-print-meta-grid">
        <p><strong>Output:</strong> {outputLabel}</p>
        {courseLabel ? <p><strong>Course:</strong> {courseLabel}</p> : null}
        {moduleTitle ? <p><strong>Module:</strong> {moduleTitle}</p> : null}
        {printDate ? <p><strong>Date:</strong> {printDate}</p> : null}
      </div>
    </div>
  )
}

function formatStudyOutputPrintDate(value: string | null) {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}
