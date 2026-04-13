export function EmptyState({
  message,
  size = 'md',
}: {
  message: string
  size?: 'sm' | 'md'
}) {
  return (
    <div
      className="ui-empty empty-state"
      data-size={size}
    >
      {message}
    </div>
  )
}
