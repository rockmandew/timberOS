import { brand } from '../../lib/timberosAssets'

/**
 * The timberOS wordmark (full logotype) or compact mark. Informative: it names
 * the application, so it always carries a real alt. Use `wordmark` in the header
 * and `mark` for collapsed nav, loading, and compact connection indicators.
 */
export function TimberOSLogo({
  variant = 'wordmark',
  size,
  className,
}: {
  variant?: 'wordmark' | 'mark'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const src = variant === 'mark' ? brand.mark : brand.wordmark
  const sizeClass = size === 'lg' ? ' brand-lg' : size === 'sm' ? ' brand-sm' : ''
  const markClass = variant === 'mark' ? ' brand-mark' : ''
  return (
    <img
      src={src}
      alt="timberOS"
      className={`brand-logo${markClass}${sizeClass}${className ? ` ${className}` : ''}`}
      draggable={false}
    />
  )
}
