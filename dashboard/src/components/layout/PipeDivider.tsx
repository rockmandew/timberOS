/**
 * A decorative pipe divider for use between major operational sections only.
 * Purely presentational, so it is hidden from assistive tech.
 */
export function PipeDivider({ className }: { className?: string }) {
  return <hr className={`pipe-divider${className ? ` ${className}` : ''}`} aria-hidden="true" />
}
