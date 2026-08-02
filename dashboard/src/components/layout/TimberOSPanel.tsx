import type { ReactNode } from 'react'

/**
 * A standard operational panel: brass-lined header + body, matching the existing
 * `.panel` chrome so new asset-driven sections sit seamlessly beside the current
 * ones. `title` may include an icon or status badge. Keeps data density high —
 * no decorative illustration unless the caller passes one.
 */
export function TimberOSPanel({
  title,
  aside,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode
  aside?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      <h2 className="panel-h2">
        <span className="panel-title">{title}</span>
        {aside && <span className="panel-aside">{aside}</span>}
      </h2>
      <div className={`panel-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
    </section>
  )
}
