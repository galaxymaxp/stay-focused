import { PageLoadingStage } from '@/components/PageLoadingStage'

/**
 * Do Now loading state.
 * Keeps the preview focused on a single recommended action instead of the full task board.
 */
export default function DoLoading() {
  return (
    <PageLoadingStage
      title="Loading your next step"
      description="Preparing the current recommendation and a short backup list."
    >
      <div className="page-loading-skeleton" style={{ height: '4rem' }} />
      <div className="page-loading-skeleton" style={{ height: '14rem', animationDelay: '80ms' }} />
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '8rem', animationDelay: '160ms' }} />
    </PageLoadingStage>
  )
}
