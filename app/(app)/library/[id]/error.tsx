'use client'

import Link from 'next/link'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'

export default function LibraryDetailError() {
  return (
    <main className="page-shell">
      <GeneratedContentState
        title="Couldn&apos;t load this saved item right now."
        description="Try reopening it from Study Library. A malformed saved output should not blank this page."
        tone="warning"
        action={(
          <Link href="/library" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
            Back to Library
          </Link>
        )}
      />
    </main>
  )
}
