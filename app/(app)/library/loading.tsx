import { PageLoadingStage } from '@/components/PageLoadingStage'

export default function StudyLibraryLoading() {
  return (
    <PageLoadingStage
      title="Loading Study Library"
      description="Gathering your saved packs, sheets, quizzes, and task outputs."
      shellClassName="page-shell command-page"
    >
      <div className="page-loading-skeleton" style={{ height: '4.2rem' }} />
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '14rem', animationDelay: '100ms' }} />
      <div className="page-loading-skeleton page-loading-skeleton-soft" style={{ height: '10rem', animationDelay: '180ms' }} />
    </PageLoadingStage>
  )
}
