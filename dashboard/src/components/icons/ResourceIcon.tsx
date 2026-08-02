import {
  resourceIconForGood,
  resourceIconPath,
  type ResourceIconName,
} from '../../lib/timberosAssets'

/**
 * A resource icon, resolved either from an explicit `name` or classified from a
 * Timberborn `good` id. Unrecognized goods get a neutral placeholder (never a
 * misleading icon). It is a static `<img>` — it does NOT animate when values
 * change (only real live-state visuals animate).
 *
 * Accessibility: decorative usage passes an empty alt / aria-hidden; informative
 * usage requires a meaningful `label` (or falls back to the good id).
 */
export function ResourceIcon({
  name,
  good,
  label,
  size = 'sm',
  decorative = false,
  className,
}: {
  name?: ResourceIconName
  good?: string
  label?: string
  size?: 'sm' | 'md' | 'lg'
  decorative?: boolean
  className?: string
}) {
  const resolved: ResourceIconName | null = name ?? (good ? resourceIconForGood(good) : null)
  const sizeClass = size === 'lg' ? ' ri-lg' : size === 'md' ? ' ri-md' : ''
  const cls = `resource-icon${sizeClass}${className ? ` ${className}` : ''}`
  const alt = label ?? (resolved ? resolved : good ?? 'resource')

  if (!resolved) {
    // Neutral fallback: a placeholder chip showing the good's initial.
    const initial = (good ?? '?').charAt(0).toUpperCase()
    return (
      <span
        className={`${cls} resource-icon-fallback`}
        title={good}
        role={decorative ? undefined : 'img'}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : alt}
      >
        {initial}
      </span>
    )
  }

  return (
    <img
      src={resourceIconPath(resolved)}
      className={cls}
      draggable={false}
      alt={decorative ? '' : alt}
      aria-hidden={decorative || undefined}
    />
  )
}
