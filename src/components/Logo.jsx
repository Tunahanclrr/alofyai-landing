export default function Logo({ variant = 'dark', className = '' }) {
  const wordColor = variant === 'light' ? 'text-white' : 'text-ink'
  return (
    <span className={`inline-flex items-center gap-2 text-lg font-bold tracking-tight ${wordColor} ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m12 3-1.4 4.6L6 9l4.6 1.4L12 15l1.4-4.6L18 9l-4.6-1.4L12 3Z" />
        </svg>
      </span>
      Alofy<span className="text-teal">AI</span>
    </span>
  )
}
