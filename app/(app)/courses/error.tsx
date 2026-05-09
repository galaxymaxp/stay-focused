'use client'

import Link from 'next/link'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'

export default function CoursesError() {
  return (
    <main className="page-shell command-page">
      <GeneratedContentState
        kicker="Courses"
        title="Couldn&apos;t load your courses right now."
        description="Reload this route to try again. Stay Focused should never leave the Courses page body blank."
        tone="warning"
        action={(
          <>
            <Link href="/courses" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Retry courses
            </Link>
            <Link href="/" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Go to Home
            </Link>
          </>
        )}
      />
    </main>
  )
}
