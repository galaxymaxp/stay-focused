import { PageLoadingStage } from '@/components/PageLoadingStage'

export default function TasksLoading() {
  return (
    <PageLoadingStage
      title="Loading tasks"
      description="Preparing urgent work, upcoming work, and completed items."
    >
      <div className="page-loading-skeleton" style={{ height: '4rem' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '80ms' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '160ms' }} />
      <div className="page-loading-skeleton" style={{ height: '8.75rem', animationDelay: '240ms' }} />
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '6.25rem', animationDelay: '320ms' }} />
    </PageLoadingStage>
  )
}
