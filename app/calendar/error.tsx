'use client'

import Link from 'next/link'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'

export default function CalendarError() {
  return (
    <main className="page-shell">
      <GeneratedContentState
        kicker="Calendar"
        title="Couldn&apos;t load your calendar right now."
        description="Reload this route to try again. Stay Focused should show an error state here instead of an empty page body."
        tone="warning"
        action={(
          <>
            <Link href="/calendar" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Retry calendar
            </Link>
            <Link href="/tasks" className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open Tasks
            </Link>
          </>
        )}
      />
    </main>
  )
}
