import type { CSSProperties } from 'react'
import type { ColonyProduction } from '../../types'
import { useMotion } from '../motion/MotionProvider'

export interface ProductionMotionProps {
  production: ColonyProduction | null
  stale?: boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const CONSTRAINT_LABEL: Record<string, string> = {
  no_workers: 'Waiting on workers',
  no_power: 'No power',
  no_ingredients: 'Missing ingredients',
  output_full: 'Outputs full',
  no_recipe: 'No recipe set',
  paused: 'Paused',
  idle: 'Idle',
}

/**
 * Gear cluster that turns only when production is actually operating; its speed
 * reflects bounded utilization. When stopped or constrained it names the dominant
 * reason in visible + accessible text (never motion/colour alone). Amber for
 * constrained operation, muted for an intentional pause. Motion honours the global
 * MotionProvider gates (reduced-motion / paused / stale / hidden).
 */
export function ProductionMotion({ production, stale = false }: ProductionMotionProps) {
  const motion = useMotion()

  if (!production || production.buildings === 0) {
    return <div className="unmapped">No production telemetry.</div>
  }

  const { buildings, operating, utilization, dominantConstraint } = production
  const util = utilization == null ? null : clamp(utilization, 0, 1)
  const anyOperating = operating > 0
  const spinning = anyOperating && motion.active && !stale
  const gearSeconds = util == null ? 5 : clamp(6 - util * 4, 2, 6)

  const constrained = buildings - operating
  const reason = dominantConstraint ? (CONSTRAINT_LABEL[dominantConstraint] ?? dominantConstraint) : null
  const intentionalPause = dominantConstraint === 'paused'
  const tone = !anyOperating ? (intentionalPause ? 'muted' : 'stopped') : constrained > 0 ? 'constrained' : 'ok'

  const utilText = util == null ? '—' : `${Math.round(util * 100)}%`
  const label =
    `Production: ${operating} of ${buildings} operating (${utilText} utilization)` +
    (constrained > 0 && reason ? `; ${constrained} stopped, mostly ${reason.toLowerCase()}` : '') +
    (stale ? '; telemetry stale' : '')

  return (
    <div className={`production tone-${tone}`}>
      <svg
        className={`gears-svg${spinning ? ' is-spinning' : ''}`}
        viewBox="0 0 130 90"
        style={{ '--gear-duration': `${gearSeconds}s` } as CSSProperties}
        role="img"
        aria-label={label}
      >
        <Gear cx={44} cy={48} r={26} teeth={9} cls="gear gear-a" />
        <Gear cx={92} cy={38} r={17} teeth={7} cls="gear gear-b" />
      </svg>

      <div className="production-info">
        <div className="production-headline">
          <strong>{operating}</strong> / {buildings} operating
          <span className="production-util"> · {utilText}</span>
        </div>
        {constrained > 0 && reason && (
          <div className="production-reason">
            {constrained} stopped · {reason}
          </div>
        )}
        {constrained === 0 && anyOperating && <div className="production-reason ok">All producing</div>}
      </div>
    </div>
  )
}

function Gear({ cx, cy, r, teeth, cls }: { cx: number; cy: number; r: number; teeth: number; cls: string }) {
  const toothW = r * 0.3
  const toothLen = r * 0.55
  return (
    <g className={cls}>
      {Array.from({ length: teeth }).map((_, i) => (
        <rect
          key={i}
          x={cx - toothW / 2}
          y={cy - r - toothLen * 0.5}
          width={toothW}
          height={toothLen}
          rx={1.5}
          transform={`rotate(${(360 / teeth) * i} ${cx} ${cy})`}
        />
      ))}
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.34} className="gear-hole" />
    </g>
  )
}
