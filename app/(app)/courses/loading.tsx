import { PageLoadingStage } from '@/components/PageLoadingStage'

export default function CoursesLoading() {
  return (
    <PageLoadingStage
      title="Loading courses"
      description="Pulling together your course cards, pending work, and ready study packs."
      shellClassName="page-shell command-page"
    >
      <div className="page-loading-skeleton" style={{ height: '4.2rem' }} />
      <div
        className="page-loading-preview-columns"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
      >
        <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '12rem', animationDelay: '90ms' }} />
        <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '12rem', animationDelay: '180ms' }} />
        <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '12rem', animationDelay: '270ms' }} />
      </div>
    </PageLoadingStage>
  )
}
