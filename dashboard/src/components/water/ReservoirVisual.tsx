import type { CSSProperties } from 'react'
import { useMotion } from '../motion/MotionProvider'

export interface ReservoirVisualProps {
  name: string
  /** 0–100, or null when telemetry can't determine a level (never treated as 0). */
  fillPercent: number | null
  /** Separate badwater layer; only shown when a real value > 0 exists. */
  contaminationPercent?: number | null
  inflowRate?: number | null
  outflowRate?: number | null
  trend?: 'rising' | 'stable' | 'falling'
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  stale?: boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

const TREND_GLYPH = { rising: '▲', falling: '▼', stable: '▬' } as const

/**
 * Telemetry-driven reservoir. Level is a CSS-transitioned fill; the surface wave
 * runs only when telemetry is live and the game is running (via MotionProvider);
 * the tank pulses only for a live critical state; contamination is a distinct
 * purple layer shown only when real data supports it. Missing level → "Unknown",
 * never 0. Respects reduced motion through the global motion switch.
 */
export function ReservoirVisual({
  name,
  fillPercent,
  contaminationPercent = null,
  inflowRate = null,
  outflowRate = null,
  trend,
  status,
  stale = false,
}: ReservoirVisualProps) {
  const motion = useMotion()

  const value = fillPercent == null || Number.isNaN(fillPercent) ? null : clamp(fillPercent, 0, 100)
  const contam =
    contaminationPercent == null || Number.isNaN(contaminationPercent)
      ? null
      : clamp(contaminationPercent, 0, 100)
  const showContam = contam != null && contam > 0

  const animateWave = motion.active && !stale && value != null
  const pulseCritical = status === 'critical' && !stale

  const readout = value == null ? 'Unknown' : `${Math.round(value)}%`
  const label =
    `${name}: ${value == null ? 'level unknown' : `${Math.round(value)}% full`}` +
    (showContam ? `, ${Math.round(contam as number)}% contaminated` : '') +
    (stale ? ', telemetry stale' : '') +
    `, status ${status}`

  return (
    <figure className={`reservoir${stale ? ' is-stale' : ''}`}>
      <div className={`reservoir-tank${pulseCritical ? ' is-critical' : ''}`} role="img" aria-label={label}>
        {value == null ? (
          <div className="reservoir-unknown">NO DATA</div>
        ) : (
          <div
            className={`reservoir-water status-${status}${animateWave ? ' is-animated' : ''}`}
            style={{ '--fill': `${value}%` } as CSSProperties}
          >
            <div className="reservoir-wave" aria-hidden="true" />
          </div>
        )}
        {showContam && (
          <div className="reservoir-contam" style={{ '--contam': `${contam}%` } as CSSProperties} aria-hidden="true" />
        )}
      </div>

      <figcaption className="reservoir-info">
        <span className="reservoir-name">{name}</span>
        <span className="reservoir-read">{readout}</span>
        <span className="reservoir-sub">
          {trend && (
            <span title={`Trend: ${trend}`}>
              <span aria-hidden="true">{TREND_GLYPH[trend]}</span> {trend}
            </span>
          )}
          {inflowRate != null && <span>in {inflowRate}</span>}
          {outflowRate != null && <span>out {outflowRate}</span>}
          {showContam && <span className="reservoir-contam-tag">contam {Math.round(contam as number)}%</span>}
          {stale && <span className="reservoir-stale-tag">stale</span>}
        </span>
      </figcaption>
    </figure>
  )
}
