import type { ModuleSourceResource } from '@/lib/module-workspace'
import type { ModuleResourceExtractionStatus } from '@/lib/types'
import { getCanvasSourceLabel, getStudySourceNoun, getStudySourceTypeLabel } from '@/lib/study-resource'

export type StudyFileReaderState = 'extracted' | 'metadata_only' | 'empty' | 'failed'

export interface StudyFilePreviewBlock {
  id: string
  title: string
  body: string
}

export interface StudyFileOutlineItem {
  text: string
  children: StudyFileOutlineItem[]
}

export interface StudyFileOutlineSection {
  title: string
  items: StudyFileOutlineItem[]
}

export interface StudyFileReaderModel {
  state: StudyFileReaderState
  fileTypeLabel: string
  statusLabel: string
  statusTone: 'accent' | 'muted' | 'warning' | 'danger'
  summary: string | null
  keyPoints: string[]
  outlineSections: StudyFileOutlineSection[]
  previewBlocks: StudyFilePreviewBlock[]
  overviewTitle: string
  overviewBody: string
  keyPointsHint: string | null
  outlineHint: string | null
  previewHint: string | null
  transparencyNote: string
  charCount: number
}

const PAGE_MARKER_PATTERN = /\n?--\s*\d+\s+of\s+\d+\s*--\n?/gi

export function buildStudyFileReaderModel(resource: ModuleSourceResource): StudyFileReaderModel {
  const state = resolveStudyFileReaderState(resource)
  const fileTypeLabel = getStudyFileTypeLabel(resource)
  const statusLabel = labelForExtractionStatus(resource.extractionStatus)
  const normalizedText = normalizeReaderText(resource.extractedText ?? resource.extractedTextPreview ?? '')
  const charCount = typeof resource.extractedCharCount === 'number' && resource.extractedCharCount > 0
    ? resource.extractedCharCount
    : normalizedText.length
  const paragraphs = buildPreviewParagraphs(normalizedText)
  const sourceNoun = getStudySourceNoun(resource)
  const canvasSourceLabel = getCanvasSourceLabel(resource)

  if (state === 'extracted' && normalizedText) {
    const summary = buildGroundedSummary(paragraphs)
    const keyPoints = buildGroundedKeyPoints(paragraphs, summary)
    const outlineSections = buildStudyOutline(normalizedText)
    const previewBlocks = buildPreviewBlocks(normalizedText, paragraphs)
    const transparencyBase = charCount >= 1200
      ? 'This study page is grounded in real extracted source text.'
      : 'This study page is grounded in real extracted source text, but the readable amount is still fairly light.'

    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'accent',
      summary,
      keyPoints,
      outlineSections,
      previewBlocks,
      overviewTitle: 'What this material is about',
      overviewBody: summary,
      keyPointsHint: null,
      outlineHint: outlineSections.length > 0
        ? null
        : `Readable ${sourceNoun} text is available, but the outline parser could not recover stable structure from it yet.`,
      previewHint: null,
      transparencyNote: resource.extractionError
        ? `${transparencyBase} Extraction note: ${resource.extractionError}`
        : `${transparencyBase} The outline stays as close as possible to the extracted headings, bullets, and readable paragraphs.`,
      charCount,
    }
  }

  if (state === 'metadata_only') {
    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'muted',
      summary: null,
      keyPoints: [],
      outlineSections: [],
      previewBlocks: [],
      overviewTitle: 'What this material is about',
      overviewBody: `Only the ${sourceNoun} title, type, and module context are available here right now. The app did not extract readable ${sourceNoun} text for this item, so it is not pretending to summarize it.`,
      keyPointsHint: `Key points stay hidden until the reader has real extracted ${sourceNoun} text to work from.`,
      outlineHint: `Study notes stay hidden until Learn has real extracted ${sourceNoun} text to structure.`,
      previewHint: `Open the original ${canvasSourceLabel.toLowerCase()} in Canvas if you want the full source material right away.`,
      transparencyNote: resource.extractionError
        ? `No readable ${sourceNoun} text is stored for this item. Note: ${resource.extractionError}`
        : `No readable ${sourceNoun} text is stored for this item yet.`,
      charCount,
    }
  }

  if (state === 'empty') {
    const likelyScanned = /scanned|image-only|image based|image-based/i.test(resource.extractionError ?? '')

    return {
      state,
      fileTypeLabel,
      statusLabel,
      statusTone: 'warning',
      summary: null,
      keyPoints: [],
      outlineSections: [],
      previewBlocks: [],
      overviewTitle: 'What this material is about',
      overviewBody: likelyScanned
        ? `The ${sourceNoun} was parsed, but no usable text surfaced in the reader. It may be a scanned or image-based document, so this page stays quiet instead of inventing a summary.`
        : `The ${sourceNoun} was parsed successfully, but no usable text surfaced in the reader. This page stays honest and keeps the original ${canvasSourceLabel.toLowerCase()} close at hand.`,
      keyPointsHint: `Key points are hidden because the parser did not return usable text from the ${sourceNoun}.`,
      outlineHint: likelyScanned
        ? `Structured study notes are hidden because this still looks like a scanned or image-based ${sourceNoun}.`
        : `Structured study notes are hidden because no usable ${sourceNoun} text surfaced in the reader.`,
      previewHint: likelyScanned
        ? `If this is a scanned handout or image-based PDF, the original ${canvasSourceLabel.toLowerCase()} will still be the best place to read it.`
        : `The ${sourceNoun} may still be useful in Canvas even though no readable text surfaced here.`,
      transparencyNote: resource.extractionError
        ? `Extraction completed, but no usable text was returned. Note: ${resource.extractionError}`
        : 'Extraction completed, but no usable text was returned.',
      charCount,
    }
  }

  return {
    state,
    fileTypeLabel,
    statusLabel,
    statusTone: 'danger',
    summary: null,
    keyPoints: [],
    outlineSections: [],
    previewBlocks: [],
    overviewTitle: 'What this material is about',
    overviewBody: `The app could not prepare a readable study view for this ${sourceNoun} this time. The original ${canvasSourceLabel.toLowerCase()} is still available, and this page keeps the state clear without making the reader feel broken.`,
    keyPointsHint: `Key points are hidden because extraction did not complete cleanly for this ${sourceNoun}.`,
    outlineHint: `Structured study notes are hidden because extraction did not complete cleanly for this ${sourceNoun}.`,
    previewHint: `Use the Canvas link for the original ${sourceNoun}, then resync later if you want the reader to try again.`,
    transparencyNote: resource.extractionError
      ? `Extraction did not complete cleanly. Error: ${resource.extractionError}`
      : `Extraction did not complete cleanly for this ${sourceNoun}.`,
    charCount,
  }
}

export function getStudyFileTypeLabel(resource: Pick<ModuleSourceResource, 'type' | 'extension' | 'contentType'>) {
  return getStudySourceTypeLabel(resource)
}

export function labelForExtractionStatus(status?: ModuleResourceExtractionStatus) {
  if (!status) return 'Not available'
  if (status === 'extracted') return 'Text extracted'
  if (status === 'metadata_only') return 'Metadata only'
  if (status === 'empty') return 'No usable text found'
  if (status === 'failed') return 'Extraction unavailable'
  if (status === 'unsupported') return 'Unsupported'
  return 'Pending'
}

function resolveStudyFileReaderState(resource: ModuleSourceResource): StudyFileReaderState {
  if (resource.extractionStatus === 'metadata_only') return 'metadata_only'
  if (resource.extractionStatus === 'empty') return 'empty'
  if (resource.extractionStatus === 'failed' || resource.extractionStatus === 'unsupported' || resource.extractionStatus === 'pending') {
    return 'failed'
  }

  const normalizedText = normalizeReaderText(resource.extractedText ?? resource.extractedTextPreview ?? '')
  return normalizedText ? 'extracted' : 'empty'
}

function normalizeReaderText(text: string) {
  return decodeBasicHtmlEntities(
    text
      .replace(PAGE_MARKER_PATTERN, '\n')
      .replace(/(?:^|\n)\s*Speaker notes:\s*\d+\s*(?=\n|$)/gi, '\n\n')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/p\s*>/gi, '\n')
      .replace(/<\s*p\s*>/gi, '\n')
      .replace(/<\s*\/li\s*>/gi, '\n')
      .replace(/<\s*li\s*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/(?:^|\n)[^\n|]{1,100}\|\s*\d+\s*(?=\n|$)/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\u0000/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function buildPreviewParagraphs(text: string) {
  const blocks = splitReadableBlocks(text)

  if (blocks.length >= 2) {
    return blocks.slice(0, 8)
  }

  const sentences = splitSentences(text)
  const chunked: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length < 260) {
      current = next
      continue
    }

    if (current) chunked.push(current)
    current = sentence
    if (chunked.length >= 6) break
  }

  if (current && chunked.length < 6) {
    chunked.push(current)
  }

  const compactBlocks = chunked.filter((block) => block.length >= 48).slice(0, 6)
  if (compactBlocks.length > 0) {
    return compactBlocks
  }

  const trimmed = text.replace(/\s+/g, ' ').trim()
  return trimmed ? [trimAtBoundary(trimmed, 240)] : []
}

function buildGroundedSummary(paragraphs: string[]) {
  const opening = paragraphs.find((paragraph) => paragraph.length >= 90) ?? paragraphs[0] ?? ''
  return trimAtBoundary(opening, 320)
}

function buildGroundedKeyPoints(paragraphs: string[], summary: string) {
  const candidates = uniqueLines([
    ...splitSentences(paragraphs.join(' ')),
    ...paragraphs,
  ])
    .map((line) => cleanupPoint(line))
    .filter((line) => line.length >= 38 && line.length <= 220)
    .filter((line) => !looksLikeNoise(line))
    .filter((line) => !summary || normalizeLookup(line) !== normalizeLookup(summary))

  const points = candidates.slice(0, 6)

  if (points.length >= 4) {
    return points
  }

  return uniqueLines([
    ...points,
    ...paragraphs.map((paragraph) => trimAtBoundary(paragraph, 180)),
  ]).slice(0, 6)
}

function buildStudyOutline(text: string): StudyFileOutlineSection[] {
  const blocks = splitOutlineBlocks(text)
  const sections: StudyFileOutlineSection[] = []
  let currentSection: StudyFileOutlineSection | null = null

  for (const block of blocks) {
    const lines = compactOutlineLines(
      block
        .map((line) => cleanOutlineLine(line))
        .filter((line) => Boolean(line) && !looksLikeOutlineNoise(line)),
    )

    if (lines.length === 0) continue

    const heading = extractOutlineSectionHeading(lines)
    if (heading) {
      currentSection = {
        title: heading.title,
        items: [],
      }
      sections.push(currentSection)

      if (heading.remainingLines.length > 0) {
        currentSection.items.push(...buildOutlineItems(heading.remainingLines))
      }

      continue
    }

    if (!currentSection) {
      currentSection = {
        title: 'Study notes',
        items: [],
      }
      sections.push(currentSection)
    }

    currentSection.items.push(...buildOutlineItems(lines))
  }

  const mergedSections = mergeDuplicateOutlineSections(sections)
  if (mergedSections.length > 0) {
    return mergedSections
  }

  const fallbackLines = compactOutlineLines(
    text
      .split('\n')
      .map((line) => cleanOutlineLine(line))
      .filter((line) => Boolean(line) && !looksLikeOutlineNoise(line)),
  )
  const fallbackItems = buildOutlineItems(fallbackLines)
  return fallbackItems.length > 0
    ? [{ title: 'Study notes', items: fallbackItems }]
    : []
}

function splitOutlineBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0)
}

function compactOutlineLines(lines: string[]) {
  const compacted: string[] = []

  for (const line of lines) {
    const previous = compacted[compacted.length - 1]
    if (previous && shouldMergeOutlineLines(previous, line)) {
      compacted[compacted.length - 1] = mergeOutlineText(previous, line)
      continue
    }

    compacted.push(line)
  }

  return compacted
}

function shouldMergeOutlineLines(previous: string, line: string) {
  if (!previous || !line) return false
  if (isExplicitListItem(previous) || isExplicitListItem(line)) return false
  if (isLikelyHeadingLine(line, null)) return false
  if (/:$/.test(previous)) return false

  return /[,;]$/.test(previous)
    || /\b(and|or|of|to|for|with|in|on|the|a|an|vs)\s*$/i.test(previous)
    || (previous.length >= 40 && !/[.!?]$/.test(previous) && /^[a-z(]/.test(line))
}

function extractOutlineSectionHeading(lines: string[]) {
  const first = lines[0]
  if (!first) return null

  if (/^slide:\s*/i.test(first)) {
    return {
      title: cleanHeadingLine(first.replace(/^slide:\s*/i, '')),
      remainingLines: lines.slice(1),
    }
  }

  const multiLineTitle = collectLeadingHeadingLines(lines)
  if (multiLineTitle.length > 1) {
    return {
      title: cleanHeadingLine(multiLineTitle.join(' ')),
      remainingLines: lines.slice(multiLineTitle.length),
    }
  }

  if (isLikelyHeadingLine(first, lines[1] ?? null)) {
    return {
      title: cleanHeadingLine(first),
      remainingLines: lines.slice(1),
    }
  }

  return null
}

function collectLeadingHeadingLines(lines: string[]) {
  const collected: string[] = []
  let totalWords = 0

  for (const line of lines) {
    if (!isHeadingFragment(line)) break

    const wordCount = countWords(line)
    if (wordCount === 0) break

    collected.push(line)
    totalWords += wordCount

    if (collected.length >= 4 || totalWords >= 14) {
      break
    }
  }

  return collected.length > 1 ? collected : []
}

function isHeadingFragment(line: string) {
  if (!line || looksLikeOutlineNoise(line) || isExplicitListItem(line)) return false
  if (line.includes(':') && !/^slide:/i.test(line)) return false
  if (/[.!]$/.test(line) && !/^[A-Z0-9\s/&-]+[.]$/.test(line)) return false

  return countWords(line) <= 6
    && line.length <= 48
    && !isDateLikeLine(line)
}

function isLikelyHeadingLine(line: string, nextLine: string | null) {
  if (!line || looksLikeOutlineNoise(line) || isExplicitListItem(line) || isDateLikeLine(line)) return false

  const cleaned = cleanHeadingLine(line)
  if (!cleaned) return false

  const wordCount = countWords(cleaned)
  if (wordCount === 0 || wordCount > 12) return false

  if (/^slide:\s*/i.test(line)) return true
  if (/^[A-Z0-9\s/&-]+[.]?$/.test(cleaned) && wordCount <= 8) return true
  if (/[?:]$/.test(cleaned) && wordCount <= 10) return true
  if (/[.]$/.test(cleaned) && wordCount <= 4) return true

  if (!nextLine) return line.length <= 60 && wordCount <= 6

  return cleaned.length <= 72
    && !/[.!]$/.test(cleaned)
    && (isExplicitListItem(nextLine) || isShortOutlineLine(nextLine) || isParagraphLikeLine(nextLine))
}

function buildOutlineItems(lines: string[], depth = 0): StudyFileOutlineItem[] {
  const items: StudyFileOutlineItem[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || looksLikeOutlineNoise(line)) continue

    const previousItem = items[items.length - 1]
    if (previousItem && shouldAppendToPrevious(previousItem, line)) {
      previousItem.text = mergeOutlineText(previousItem.text, line)
      continue
    }

    if (depth < 2 && isParentLabelLine(line, lines[index + 1] ?? null)) {
      const childLines: string[] = []
      let cursor = index + 1

      while (cursor < lines.length) {
        const candidate = lines[cursor]
        if (!candidate || looksLikeOutlineNoise(candidate)) {
          cursor += 1
          continue
        }

        if (isLikelyHeadingLine(candidate, lines[cursor + 1] ?? null)) {
          break
        }

        if (candidate.endsWith(':') && childLines.length > 0) {
          break
        }

        childLines.push(candidate)
        cursor += 1
      }

      const children = buildOutlineItems(childLines, depth + 1)
      if (children.length > 0) {
        items.push({
          text: trimTrailingPunctuation(line, ':'),
          children,
        })
        index = cursor - 1
        continue
      }
    }

    const inlineList = splitInlineList(line)
    if (inlineList) {
      items.push({
        text: inlineList.title,
        children: inlineList.items.map((item) => ({
          text: item,
          children: [],
        })),
      })
      continue
    }

    if (isExplicitListItem(line)) {
      items.push({
        text: cleanupPoint(line),
        children: [],
      })
      continue
    }

    const paragraphItems = buildParagraphOutlineItems(line)
    items.push(...paragraphItems)
  }

  return mergeDuplicateOutlineItems(items)
}

function shouldAppendToPrevious(previousItem: StudyFileOutlineItem, line: string) {
  if (previousItem.children.length > 0) return false
  if (isExplicitListItem(line) || isLikelyHeadingLine(line, null) || line.endsWith(':')) return false

  return /[,;]$/.test(previousItem.text)
    || /\b(and|or|of|to|for|with|in|on|the|a|an|vs)\s*$/i.test(previousItem.text)
    || (previousItem.text.length >= 48 && !/[.!?]$/.test(previousItem.text) && /^[a-z(]/.test(line))
}

function isParentLabelLine(line: string, nextLine: string | null) {
  if (!line || !nextLine) return false
  if (!/:$/.test(line)) return false
  if (isExplicitListItem(nextLine) || isShortOutlineLine(nextLine) || isParagraphLikeLine(nextLine)) {
    return countWords(line) <= 6
  }

  return false
}

function splitInlineList(line: string) {
  const dividerIndex = line.indexOf(':')
  if (dividerIndex <= 0) return null

  const title = cleanHeadingLine(line.slice(0, dividerIndex))
  const remainder = line.slice(dividerIndex + 1).trim()
  if (!title || !remainder) return null

  const items = remainder
    .split(/[,;]\s+/)
    .map((part) => cleanupPoint(part))
    .filter((part) => part.length >= 2 && part.length <= 80)

  if (items.length < 2 || items.length > 8 || title.length > 42) {
    return null
  }

  return { title, items }
}

function buildParagraphOutlineItems(line: string): StudyFileOutlineItem[] {
  const sentences = splitSentences(line)
    .map((sentence) => cleanupPoint(sentence))
    .filter((sentence) => sentence.length >= 18 && !looksLikeNoise(sentence))

  if (sentences.length >= 2 && line.length >= 150) {
    return sentences.map((sentence) => ({
      text: sentence,
      children: [],
    }))
  }

  return [{
    text: cleanupPoint(line),
    children: [],
  }]
}

function mergeDuplicateOutlineSections(sections: StudyFileOutlineSection[]) {
  const merged: StudyFileOutlineSection[] = []
  const sectionByKey = new Map<string, StudyFileOutlineSection>()

  for (const section of sections) {
    const title = cleanHeadingLine(section.title)
    const items = mergeDuplicateOutlineItems(section.items)
    if (!title || items.length === 0) continue

    const key = normalizeLookup(title) || title.toLowerCase()
    const existing = sectionByKey.get(key)
    if (existing) {
      existing.items = mergeDuplicateOutlineItems([...existing.items, ...items])
      continue
    }

    const nextSection = {
      title,
      items,
    }
    sectionByKey.set(key, nextSection)
    merged.push(nextSection)
  }

  return merged
}

function mergeDuplicateOutlineItems(items: StudyFileOutlineItem[]) {
  const merged: StudyFileOutlineItem[] = []
  const itemByKey = new Map<string, StudyFileOutlineItem>()

  for (const item of items) {
    const text = cleanupPoint(item.text)
    if (!text || looksLikeNoise(text)) continue

    const normalizedChildren = mergeDuplicateOutlineItems(item.children)
    const key = normalizeLookup(text) || text.toLowerCase()
    const existing = itemByKey.get(key)

    if (existing) {
      existing.children = mergeDuplicateOutlineItems([...existing.children, ...normalizedChildren])
      continue
    }

    const nextItem = {
      text,
      children: normalizedChildren,
    }
    itemByKey.set(key, nextItem)
    merged.push(nextItem)
  }

  return merged
}

function buildPreviewBlocks(text: string, fallbackParagraphs: string[]): StudyFilePreviewBlock[] {
  const blockCandidates = splitReadableBlocks(text)
  const selectedParagraphs = blockCandidates.length >= 2
    ? samplePreviewSections(blockCandidates, Math.min(blockCandidates.length, 4))
    : fallbackParagraphs.slice(0, 4)
  const labels = buildPreviewSectionLabels(selectedParagraphs.length)

  return selectedParagraphs.map((paragraph, index) => ({
    id: `study-preview-section-${index + 1}`,
    title: labels[index] ?? `Section ${index + 1}`,
    body: trimAtBoundary(paragraph, selectedParagraphs.length === 1 ? 560 : 440),
  }))
}

function splitReadableBlocks(text: string) {
  return text
    .split(/\n{2,}/)
    .map((block) => block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((block) => block.length >= 48 && !looksLikeNoise(block))
}

function samplePreviewSections(blocks: string[], count: number) {
  if (blocks.length <= count) {
    return blocks.slice(0, count)
  }

  const indices = new Set<number>()
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0 : index / (count - 1)
    indices.add(Math.round(ratio * (blocks.length - 1)))
  }

  return Array.from(indices)
    .sort((left, right) => left - right)
    .map((index) => blocks[index])
}

function buildPreviewSectionLabels(count: number) {
  if (count <= 1) return ['Beginning']
  if (count === 2) return ['Beginning', 'Later section']
  if (count === 3) return ['Beginning', 'Middle', 'Final section']
  return ['Beginning', 'Middle', 'Later section', 'Final section']
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function cleanOutlineLine(text: string) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .trim()
}

function cleanHeadingLine(text: string) {
  return cleanOutlineLine(text)
    .replace(/^slide:\s*/i, '')
    .replace(/\s*\d{1,2}(?:\s+\d{1,2})*\s*$/, '')
    .replace(/[.:]\s*$/, '')
    .trim()
}

function cleanupPoint(text: string) {
  return text
    .replace(/^[\-\u2022*]+\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mergeOutlineText(left: string, right: string) {
  return `${left} ${right}`.replace(/\s+/g, ' ').trim()
}

function trimTrailingPunctuation(text: string, character: ':' | '.') {
  const pattern = character === ':' ? /:\s*$/ : /\.\s*$/
  return text.replace(pattern, '').trim()
}

function trimAtBoundary(text: string, maxLength: number) {
  if (text.length <= maxLength) return text

  const clipped = text.slice(0, maxLength)
  const punctuationIndex = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('? '),
    clipped.lastIndexOf('! '),
  )

  if (punctuationIndex >= 80) {
    return clipped.slice(0, punctuationIndex + 1).trim()
  }

  const spaceIndex = clipped.lastIndexOf(' ')
  return `${clipped.slice(0, spaceIndex > 0 ? spaceIndex : maxLength).trim()}...`
}

function uniqueLines(lines: string[]) {
  const seen = new Set<string>()
  const results: string[] = []

  for (const line of lines) {
    const cleaned = line.trim()
    if (!cleaned) continue
    const key = normalizeLookup(cleaned)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(cleaned)
  }

  return results
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function isExplicitListItem(line: string) {
  return /^[\-\u2022*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)
}

function isShortOutlineLine(line: string) {
  return line.length <= 72 && countWords(line) <= 10
}

function isParagraphLikeLine(line: string) {
  return line.length >= 72 || countWords(line) >= 12
}

function isDateLikeLine(line: string) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(line)
    && /\b\d{1,2},?\s+\d{4}\b/.test(line)
}

function looksLikeOutlineNoise(value: string) {
  return looksLikeNoise(value)
    || /^\d+(?:\s+\d+)+$/.test(value)
    || /\|\s*\d+\s*$/.test(value)
    || /^speaker notes:\s*\d+$/i.test(value)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function looksLikeNoise(value: string) {
  return /^page\s+\d+$/i.test(value)
    || /^figure\s+\d+$/i.test(value)
    || /^table\s+\d+$/i.test(value)
    || /^[\d\s.,-]+$/.test(value)
}
