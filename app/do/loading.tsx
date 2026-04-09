import { PageLoadingStage } from '@/components/PageLoadingStage'

/**
 * Do page loading state.
 * Uses the shared route-entry loading language while previewing the stacked urgency groups below.
 */
export default function DoLoading() {
  return (
    <PageLoadingStage
      title="Loading action board"
      description="Preparing urgency groups, task cards, and completed work."
    >
      <div className="page-loading-skeleton" style={{ height: '4rem' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '80ms' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '160ms' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '240ms' }} />
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '6.25rem', animationDelay: '320ms' }} />
    </PageLoadingStage>
  )
}
