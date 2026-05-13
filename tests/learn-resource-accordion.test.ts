import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('Learn resource cards expose a clear Scan PDF action for OCR-recoverable PDFs', () => {
  const source = readFileSync('components/StudyResourceAccordionList.tsx', 'utf8')

  assert.match(source, /idleLabel="Scan PDF"/)
  assert.match(source, /function shouldShowScanPdfAction/)
  assert.match(source, /sourceReadinessState === 'visual_ocr_available'/)
  assert.match(source, /sourceReadinessState === 'empty_or_metadata_only'/)
})

test('Learn resource cards show queued and scanning states instead of another OCR trigger', () => {
  const source = readFileSync('components/StudyResourceAccordionList.tsx', 'utf8')

  assert.match(source, /function shouldShowScanningStatus/)
  assert.match(source, /item\.sourceReadinessState === 'visual_ocr_queued'/)
  assert.match(source, /item\.sourceReadinessState === 'visual_ocr_running'/)
  assert.match(source, /\? 'Queued' : 'Scanning'/)
})
