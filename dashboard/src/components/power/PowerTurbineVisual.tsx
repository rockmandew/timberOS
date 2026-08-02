import type { CSSProperties } from 'react'
import { illustrations } from '../../lib/timberosAssets'
import { useMotion } from '../motion/MotionProvider'

export interface PowerTurbineVisualProps {
  supply: number | null
  demand: number | null
  surplus: number | null
  batteryCharge?: number | null
  batteryCapacity?: number | null
  networksInDeficit?: number
  stale?: boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const num = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : Math.round(v).toLocaleString())

/**
 * Power network turbine. Inline + React-controlled: the rotor speed rides a
 * bounded CSS variable (never rebuilds the SVG per tick). Stops at zero
 * generation, slows near idle, goes amber when demand is close to supply, and
 * red when supply can't meet demand. Battery charge/discharge is shown
 * separately. When there is no live feed it shows the static turbine.
 */
export function PowerTurbineVisual({
  supply,
  demand,
  surplus,
  batteryCharge = null,
  batteryCapacity = null,
  networksInDeficit = 0,
  stale = false,
}: PowerTurbineVisualProps) {
  const motion = useMotion()

  // No usable feed → static illustration (empty / disconnected / loading).
  if (supply == null || demand == null) {
    return (
      <div className="turbine">
        <img className="turbine-svg" src={illustrations.powerTurbineStatic} alt="" aria-hidden="true" width={96} height={96} />
        <div className="turbine-info" role="img" aria-label="Power network: no data">
          <div className="turbine-figures">
            <Figure label="Supply" value="—" />
            <Figure label="Demand" value="—" />
          </div>
          <div className="turbine-battery">No power telemetry</div>
        </div>
      </div>
    )
  }

  const generating = supply > 0
  const deficit = (surplus != null && surplus < 0) || supply < demand || networksInDeficit > 0
  const tight = !deficit && demand > 0 && supply > 0 && demand / supply >= 0.85

  const state: 'healthy' | 'warning' | 'critical' = deficit ? 'critical' : tight ? 'warning' : 'healthy'

  // Bounded normalized generation → rotor seconds (faster = smaller). Stopped when
  // not generating. Slower when supply is struggling to meet demand.
  const normalized = generating ? clamp(supply / Math.max(supply, demand, 1), 0, 1) : 0
  const rotorSeconds = clamp(8 - normalized * 5, 3, 8)
  const spinning = generating && motion.active && !stale

  const batteryState =
    batteryCapacity && batteryCapacity > 0
      ? surplus != null && surplus > 0
        ? batteryCharge != null && batteryCharge >= batteryCapacity
          ? 'full'
          : 'charging'
        : surplus != null && surplus < 0
          ? 'discharging'
          : 'idle'
      : 'none'

  const label =
    `Power network: ${generating ? `generating ${num(supply)} hp` : 'idle, no generation'}` +
    `, demand ${num(demand)} hp` +
    (deficit ? ', in deficit' : tight ? ', near capacity' : '') +
    (stale ? ', telemetry stale' : '')

  return (
    <div className="turbine">
      <svg
        className={`turbine-svg${spinning ? ' is-spinning' : ''} state-${state}`}
        viewBox="0 0 120 120"
        style={{ '--rotor-duration': `${rotorSeconds}s` } as CSSProperties}
        role="img"
        aria-label={label}
      >
        <circle className="turbine-ring" cx="60" cy="60" r="40" strokeWidth={7} />
        <g className="turbine-rotor">
          <circle className="turbine-hub" cx="60" cy="60" r="17" />
          <g className="turbine-blade">
            <rect x="56.5" y="22" width="7" height="18" rx="2.5" />
            <rect x="56.5" y="80" width="7" height="18" rx="2.5" />
            <rect x="22" y="56.5" width="18" height="7" rx="2.5" />
            <rect x="80" y="56.5" width="18" height="7" rx="2.5" />
          </g>
          <circle cx="60" cy="60" r="6" fill="var(--panel)" />
        </g>
      </svg>

      <div className="turbine-info">
        <div className="turbine-figures">
          <Figure label="Supply" value={`${num(supply)} hp`} />
          <Figure label="Demand" value={`${num(demand)} hp`} tone={tight ? 'tight' : undefined} />
          <Figure
            label="Surplus"
            value={`${surplus != null && surplus >= 0 ? '+' : ''}${num(surplus)} hp`}
            tone={deficit ? 'deficit' : undefined}
          />
        </div>
        <div className="turbine-battery">
          {batteryState === 'none' ? (
            'No batteries'
          ) : (
            <>
              Battery {num(batteryCharge)} / {num(batteryCapacity)} hp·h · <span>{batteryState}</span>
            </>
          )}
          {networksInDeficit > 0 && ` · ${networksInDeficit} network${networksInDeficit > 1 ? 's' : ''} in deficit`}
        </div>
      </div>
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'deficit' | 'tight' }) {
  return (
    <span className="turbine-fig">
      <span className={`turbine-fig-val${tone ? ` ${tone}` : ''}`}>{value}</span>
      <span className="turbine-fig-label">{label}</span>
    </span>
  )
}
