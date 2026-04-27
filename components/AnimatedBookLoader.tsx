import type { CSSProperties } from 'react'

export function AnimatedBookLoader({
  size = 88,
  style,
}: {
  size?: number | string
  style?: CSSProperties
}) {
  return (
    <div
      className="page-loading-book"
      style={{
        width: size,
        ...style,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 220 166" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g className="page-loading-book-shell">
          <path className="page-loading-book-frame" d="M34 28V116" />
          <path className="page-loading-book-frame" d="M186 28V116" />
          <path className="page-loading-book-frame" d="M42 34C67 34 88 42 110 58C132 42 153 34 178 34" />
          <path className="page-loading-book-frame" d="M42 116C67 116 88 124 110 140C132 124 153 116 178 116" />
          <path className="page-loading-book-spine" d="M110 58V140" />
        </g>

        <g className="page-loading-book-left-page">
          <path className="page-loading-book-page" d="M50 46C71 48 90 55 110 68V124C90 112 71 105 50 103" />
        </g>

        <g className="page-loading-book-right-page">
          <path className="page-loading-book-page" d="M170 46C149 48 130 55 110 68V124C130 112 149 105 170 103" />
        </g>

        <g className="page-loading-book-flip-page">
          <path className="page-loading-book-flip" d="M110 68C124 57 139 50 156 48V104C139 107 125 114 110 124" />
        </g>

        <path className="page-loading-book-base-mark" d="M101 146L110 154L119 146" />
      </svg>
    </div>
  )
}
