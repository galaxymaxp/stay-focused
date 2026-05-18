import { normalizeReviewerMarkdownLayout } from '@/lib/reviewer-markdown-layout'

type LabelTone = 'normal' | 'source' | 'key' | 'practice' | 'answer'

type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string; key: string }
  | { kind: 'paragraph'; text: string; key: string; labelTone: LabelTone }
  | { kind: 'unordered-list'; items: string[]; key: string }
  | { kind: 'ordered-list'; items: string[]; key: string; answerChoices?: boolean }
  | { kind: 'rule'; key: string }

export function ReviewerMarkdownDocument({
  markdown,
  compact = false,
}: {
  markdown: string
  compact?: boolean
}) {
  const blocks = parseReviewerMarkdownBlocks(normalizeReviewerMarkdownLayout(markdown))
  return (
    <div className={compact ? 'reviewer-markdown-document reviewer-markdown-document-compact' : 'reviewer-markdown-document'}>
      {blocks.map((block) => {
        if (block.kind === 'heading') {
          if (block.level === 1) return <h1 key={block.key}>{renderInlineMarkdown(block.text)}</h1>
          if (block.level === 2) return <h2 key={block.key}>{renderInlineMarkdown(block.text)}</h2>
          return <h3 key={block.key}>{renderInlineMarkdown(block.text)}</h3>
        }
        if (block.kind === 'unordered-list') {
          return (
            <ul key={block.key}>
              {block.items.map((item, index) => <li key={`${block.key}-${index}`}>{renderInlineMarkdown(item)}</li>)}
            </ul>
          )
        }
        if (block.kind === 'ordered-list') {
          const className = block.answerChoices ? 'reviewer-markdown-answer-choices' : undefined
          return (
            <ol key={block.key} className={className}>
              {block.items.map((item, index) => <li key={`${block.key}-${index}`}>{renderInlineMarkdown(item)}</li>)}
            </ol>
          )
        }
        if (block.kind === 'rule') return <hr key={block.key} />
        return (
          <p key={block.key} className={block.labelTone === 'normal' ? undefined : `reviewer-markdown-label reviewer-markdown-label-${block.labelTone}`}>
            {renderInlineMarkdown(block.text)}
          </p>
        )
      })}
    </div>
  )
}

function parseReviewerMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks = markdown.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  return blocks.map((block, index): MarkdownBlock => {
    const key = `reviewer-md-${index}`
    if (/^#\s+/.test(block)) return { kind: 'heading', level: 1, text: block.replace(/^#\s+/, ''), key }
    if (/^##\s+/.test(block)) return { kind: 'heading', level: 2, text: block.replace(/^##\s+/, ''), key }
    if (/^###\s+/.test(block)) return { kind: 'heading', level: 3, text: block.replace(/^###\s+/, ''), key }
    if (/^-{3,}$/.test(block)) return { kind: 'rule', key }

    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
      return { kind: 'unordered-list', items: lines.map((line) => line.replace(/^[-*]\s+/, '')), key }
    }
    if (lines.length > 0 && lines.every((line) => /^\d{1,2}[.)]\s+/.test(line))) {
      return { kind: 'ordered-list', items: lines.map((line) => line.replace(/^\d{1,2}[.)]\s+/, '')), key }
    }
    if (lines.length > 0 && lines.every((line) => /^[A-D][.)]\s+/.test(line))) {
      return { kind: 'ordered-list', items: lines.map((line) => line.replace(/^[A-D][.)]\s+/, '')), key, answerChoices: true }
    }

    return { kind: 'paragraph', text: block, key, labelTone: getLabelTone(block) }
  })
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((part) => part.length > 0)
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={index}>{part.slice(2, -2)}</strong>
    }
    return <span key={index}>{part}</span>
  })
}

function getLabelTone(text: string): LabelTone {
  const label = text.match(/^\*\*([^:*]+):\*\*/)?.[1]?.toLowerCase() ?? ''
  if (/source wording/.test(label)) return 'source'
  if (/key idea|important list|important lists|key concepts|definitions/.test(label)) return 'key'
  if (/practice questions|practice/.test(label)) return 'practice'
  if (/answer key|answers|quick review sheet/.test(label)) return 'answer'
  return 'normal'
}
