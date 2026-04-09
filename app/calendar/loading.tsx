import { PageLoadingStage } from '@/components/PageLoadingStage'

/**
 * Calendar page loading state.
 * Uses the page-entry loader plus a faint grid/rail preview without introducing a process bar.
 */
export default function CalendarLoading() {
  return (
    <PageLoadingStage
      title="Loading calendar"
      description="Preparing the month view and selected-day detail."
    >
      <div className="page-loading-skeleton" style={{ height: '4rem' }} />
      <div
        className="page-loading-preview-columns"
        style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}
      >
        <div className="page-loading-skeleton" style={{ height: '18.75rem', animationDelay: '90ms' }} />
        <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '15rem', animationDelay: '180ms' }} />
      </div>
    </PageLoadingStage>
  )
}
