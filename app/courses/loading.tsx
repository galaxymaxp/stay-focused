export default function CoursesLoading() {
  return (
    <main className="page-shell command-page">
      <section
        className="section-shell section-shell-elevated page-loading-skeleton"
        style={{ minHeight: '7.5rem' }}
        aria-label="Loading courses header"
      />
      <div className="courses-grid" aria-label="Loading courses">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="page-loading-skeleton page-loading-skeleton-soft section-shell courses-card"
            style={{ animationDelay: `${i * 55}ms` }}
          />
        ))}
      </div>
    </main>
  )
}
