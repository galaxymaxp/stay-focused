import { PageLoadingStage } from '@/components/PageLoadingStage'

/**
 * Module Learn page loading state.
 * Matches the route-entry loading identity without changing the Learn workspace structure.
 */
export default function ModuleLearnLoading() {
  return (
    <PageLoadingStage
      title="Loading learn workspace"
      description="Preparing notes, grounded resources, and task status for this module."
      shellClassName="page-shell page-shell-compact page-stack"
    >
      <div className="page-loading-skeleton" style={{ height: '5rem' }} />
      <div className="page-loading-preview-columns">
        <div className="page-loading-skeleton" style={{ height: '14.5rem', animationDelay: '90ms' }} />
        <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '14.5rem', animationDelay: '180ms' }} />
      </div>
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '10rem', animationDelay: '260ms' }} />
    </PageLoadingStage>
  )
}
