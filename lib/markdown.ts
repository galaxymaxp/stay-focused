export function simpleMarkdownToHtml(markdown: string, options: { headingIds?: boolean } = {}): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  const output: string[] = []
  let inCodeBlock = false
  let inList = false
  let listType: 'ul' | 'ol' | null = null

  function closeList() {
    if (inList && listType) {
      output.push(`</${listType}>`)
      inList = false
      listType = null
    }
  }

  function inlineFormat(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Code block fence
    if (line.startsWith('```')) {
      closeList()
      if (inCodeBlock) {
        output.push('</code></pre>')
        inCodeBlock = false
      } else {
        output.push('<pre><code>')
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      output.push(escapeHtml(line))
      continue
    }

    // Headings
    const h3 = line.match(/^### (.+)$/)
    if (h3) { closeList(); output.push(`<h3${headingIdAttribute(h3[1])}>${inlineFormat(h3[1])}</h3>`); continue }
    const h2 = line.match(/^## (.+)$/)
    if (h2) { closeList(); output.push(`<h2${headingIdAttribute(h2[1])}>${inlineFormat(h2[1])}</h2>`); continue }
    const h1 = line.match(/^# (.+)$/)
    if (h1) { closeList(); output.push(`<h1${headingIdAttribute(h1[1])}>${inlineFormat(h1[1])}</h1>`); continue }

    // Horizontal rule
    if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
      closeList()
      output.push('<hr>')
      continue
    }

    // Unordered list
    const ulMatch = line.match(/^[-*+] (.+)$/)
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        closeList()
        output.push('<ul>')
        inList = true
        listType = 'ul'
      }
      output.push(`<li>${inlineFormat(ulMatch[1])}</li>`)
      continue
    }

    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)$/)
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        closeList()
        output.push('<ol>')
        inList = true
        listType = 'ol'
      }
      output.push(`<li>${inlineFormat(olMatch[1])}</li>`)
      continue
    }

    // Blockquote
    const bqMatch = line.match(/^> (.+)$/)
    if (bqMatch) {
      closeList()
      output.push(`<blockquote><p>${inlineFormat(bqMatch[1])}</p></blockquote>`)
      continue
    }

    // Empty line — paragraph break
    if (line.trim() === '') {
      closeList()
      output.push('')
      continue
    }

    // Regular paragraph
    closeList()
    output.push(`<p>${inlineFormat(line)}</p>`)
  }

  if (inCodeBlock) output.push('</code></pre>')
  closeList()

  return output.join('\n')

  function headingIdAttribute(text: string) {
    if (!options.headingIds) return ''
    const id = slugifyHeading(text)
    return id ? ` id="deep-learn-draft-section-${id}"` : ''
  }
}

function slugifyHeading(value: string) {
  return value
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}
