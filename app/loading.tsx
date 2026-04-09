import { PageLoadingStage } from '@/components/PageLoadingStage'

/**
 * Home page loading state.
 * Keeps the loader centered and light while hinting at the dashboard structure underneath.
 */
export default function HomeLoading() {
  return (
    <PageLoadingStage
      title="Loading today"
      description="Gathering the clearest next step and the rest of your current workload."
    >
      <div className="page-loading-skeleton" style={{ height: '4.4rem' }} />
      <div className="page-loading-skeleton" style={{ height: '9rem', animationDelay: '80ms' }} />
      <div className="page-loading-preview-columns">
        <div className="page-loading-skeleton" style={{ height: '11rem', animationDelay: '140ms' }} />
        <div className="page-loading-skeleton" style={{ height: '11rem', animationDelay: '220ms' }} />
      </div>
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '6.75rem', animationDelay: '280ms' }} />
    </PageLoadingStage>
  )
}
