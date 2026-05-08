'use client'

import { Printer } from 'lucide-react'

export function ReviewerPrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="ui-button ui-button-secondary ui-button-xs reviewer-print-hide">
      <Printer className="h-3.5 w-3.5" />
      Print / Save PDF
    </button>
  )
}
