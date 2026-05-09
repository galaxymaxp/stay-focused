'use client'

import Link from 'next/link'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'

export default function LibraryError() {
  return (
    <main className="page-shell command-page">
      <GeneratedContentState
        kicker="Study Library"
        title="Couldn&apos;t load your saved study content."
        description="Reload this route to try again. A saved-output error should not blank the whole library view."
        tone="warning"
        action={(
          <>
            <Link href="/library" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Retry library
            </Link>
            <Link href="/courses" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Go to Courses
            </Link>
          </>
        )}
      />
    </main>
  )
}
