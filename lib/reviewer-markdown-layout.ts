const LABEL_PATTERN = /^(Source wording|Key idea|Important List|Important list|Quick Comparison|Quick comparison|Practice Questions|Practice questions|Answer Key|Answer key|Quick Review Sheet|Quick review sheet|Definitions?|Key Concepts?|Important Lists?|Practice|Answers?):\s*(.*)$/

export function normalizeReviewerMarkdownLayout(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')

  const lines = normalized.split('\n')
  const output: string[] = []

  for (const rawLine of lines) {
    const line = stripAccidentalAnswerKeyIndent(rawLine).trimEnd()
    if (!line.trim()) {
      pushBlank(output)
      continue
    }

    const expanded = expandInlineMarkdownLine(line)
    for (const expandedLine of expanded) {
      pushFormattedLine(output, expandedLine)
    }
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripAccidentalAnswerKeyIndent(line: string) {
  if (!/^\s{4,}/.test(line)) return line
  const trimmed = line.trimStart()
  if (
    /^#{1,6}\s+/.test(trimmed)
    || /^[-*]\s+/.test(trimmed)
    || /^\d{1,2}[.)]\s+/.test(trimmed)
    || /^[A-D][.)]\s+/.test(trimmed)
    || /^(?:Answer\s*Key|Answers?|Correct\s*Answers?|Source wording|Key idea|Important List|Quick Comparison)\b:?/i.test(trimmed)
  ) {
    return trimmed
  }
  return line
}

function expandInlineMarkdownLine(line: string): string[] {
  const trimmed = line.trim()
  if (/^#{1,6}\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed) || /^-{3,}$/.test(trimmed)) return [trimmed]

  const withChoices = splitInlineChoices(trimmed)
  if (withChoices.length > 1) return withChoices.flatMap(expandInlineMarkdownLine)

  if (/^\d{1,2}[.)]\s+/.test(trimmed) || /^[A-D][.)]\s+/.test(trimmed)) return [trimmed]

  const withNumbered = splitInlineNumberedList(trimmed)
  if (withNumbered.length > 1) return withNumbered

  const withBullets = splitInlineBulletList(trimmed)
  if (withBullets.length > 1) return withBullets

  const labelMatch = trimmed.match(LABEL_PATTERN)
  if (labelMatch) {
    const label = normalizeReviewerLabel(labelMatch[1] ?? '')
    const body = labelMatch[2]?.trim() ?? ''
    return [body ? `**${label}:** ${body}` : `**${label}:**`]
  }

  return [trimmed]
}

function splitInlineChoices(line: string) {
  const matches = [...line.matchAll(/(?:^|\s)([A-D])[.)]\s+/g)]
  if (matches.length < 2) return [line]

  const result: string[] = []
  const firstIndex = matches[0]?.index ?? -1
  if (firstIndex > 0) {
    const prefix = line.slice(0, firstIndex).trim()
    if (prefix) result.push(prefix)
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!
    const start = (match.index ?? 0) + (match[0].startsWith(' ') ? 1 : 0)
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? line.length : line.length
    const item = line.slice(start, end).trim()
    if (item) result.push(item)
  }
  return result
}

function splitInlineNumberedList(line: string) {
  const matches = [...line.matchAll(/(?:^|\s)(\d{1,2})[.)]\s+/g)]
  if (matches.length < 2) return [line]

  const firstIndex = matches[0]?.index ?? -1
  const prefix = firstIndex > 0 ? line.slice(0, firstIndex).trim() : ''
  if (prefix && prefix.length > 90) return [line]

  const result: string[] = []
  if (prefix) result.push(prefix)

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!
    const start = (match.index ?? 0) + (match[0].startsWith(' ') ? 1 : 0)
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? line.length : line.length
    const item = line.slice(start, end).trim()
    if (item) result.push(item)
  }
  return result
}

function splitInlineBulletList(line: string) {
  if (line.includes('•')) {
    const parts = line.split(/\s*•\s*/).map((part) => part.trim()).filter(Boolean)
    if (parts.length >= 2) {
      const [prefix, ...items] = parts
      return [
        ...(prefix && !looksLikeListItem(prefix) ? [prefix] : prefix ? [`- ${prefix}`] : []),
        ...items.map((item) => `- ${item.replace(/^[-*]\s+/, '')}`),
      ]
    }
  }

  const dashParts = line.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  if (dashParts.length >= 3 && dashParts[0] && dashParts[0].length <= 80) {
    const [prefix, ...items] = dashParts
    return [prefix, ...items.map((item) => `- ${item}`)]
  }

  return [line]
}

function looksLikeListItem(value: string) {
  return /^[-*]\s+/.test(value) || /^\d{1,2}[.)]\s+/.test(value)
}

function pushFormattedLine(output: string[], line: string) {
  const trimmed = line.trim()
  if (!trimmed) {
    pushBlank(output)
    return
  }

  if (/^#{1,6}\s+/.test(trimmed) || /^-{3,}$/.test(trimmed)) {
    pushBlank(output)
    output.push(trimmed)
    pushBlank(output)
    return
  }

  if (/^[-*]\s+/.test(trimmed) || /^\d{1,2}[.)]\s+/.test(trimmed) || /^[A-D][.)]\s+/.test(trimmed)) {
    if (output.length > 0 && output[output.length - 1] !== '' && !isListLine(output[output.length - 1] ?? '')) {
      pushBlank(output)
    }
    output.push(trimmed)
    return
  }

  output.push(trimmed)
}

function isListLine(line: string) {
  return /^[-*]\s+/.test(line) || /^\d{1,2}[.)]\s+/.test(line) || /^[A-D][.)]\s+/.test(line)
}

function pushBlank(output: string[]) {
  if (output.length === 0) return
  if (output[output.length - 1] !== '') output.push('')
}

function normalizeReviewerLabel(value: string) {
  const lower = value.toLowerCase()
  if (lower === 'important list') return 'Important list'
  if (lower === 'quick comparison') return 'Quick comparison'
  if (lower === 'practice questions') return 'Practice questions'
  if (lower === 'answer key') return 'Answer key'
  if (lower === 'quick review sheet') return 'Quick Review Sheet'
  if (lower === 'key concepts') return 'Key concepts'
  if (lower === 'important lists') return 'Important lists'
  if (lower === 'answers') return 'Answers'
  if (lower === 'definition' || lower === 'definitions') return 'Definitions'
  return value
}
