import type { CSSProperties } from 'react'
import { useMotion } from '../motion/MotionProvider'

export interface ContaminationWaveProps {
  /** Contamination as a percentage; null/0 hides the whole visual. */
  percent: number | null
  label?: string
  stale?: boolean
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Badwater contamination front (purple, per the CVD-safe encoding). Hidden
 * entirely when contamination is zero or unknown. Motion scales with severity —
 * slow drift when low, quicker when high — but never flashes or strobes. Always
 * shows the numeric value. Purely additive: returns null when there's nothing to
 * show.
 */
export function ContaminationWave({ percent, label = 'Contamination', stale = false }: ContaminationWaveProps) {
  const motion = useMotion()

  if (percent == null || Number.isNaN(percent) || percent <= 0) return null

  const p = clamp(percent, 0, 100)
  const severity: 'low' | 'rising' | 'critical' = p >= 50 ? 'critical' : p >= 20 ? 'rising' : 'low'
  const driftSeconds = severity === 'critical' ? 3.5 : severity === 'rising' ? 5.5 : 9
  const animate = motion.active && !stale

  return (
    <div className="contam">
      <svg
        className={`contam-svg sev-${severity}${animate ? ' is-animated' : ''}`}
        viewBox="0 0 800 120"
        preserveAspectRatio="none"
        style={{ '--drift': `${driftSeconds}s` } as CSSProperties}
        role="img"
        aria-label={`${label}: ${Math.round(p)}%${severity === 'critical' ? ', critical' : ''}${stale ? ', telemetry stale' : ''}`}
      >
        <g className="contam-waves" fill="none" strokeLinecap="round">
          <path
            className="contam-wave-back"
            d="M-40 84c80-30 160 30 240 0s160 30 240 0 160 30 240 0 160 30 240 0 160 30 240 0"
            strokeWidth={12}
          />
          <path
            className="contam-wave-path"
            d="M-80 60c80-40 160 40 240 0s160 40 240 0 160 40 240 0 160 40 240 0 160 40 240 0"
            strokeWidth={16}
          />
        </g>
      </svg>
      <div className={`contam-readout${severity === 'critical' ? ' is-critical' : ''}`}>
        <span>{label}</span>
        <strong>{Math.round(p)}%</strong>
        {severity === 'critical' && <span className="chip critical">critical</span>}
      </div>
    </div>
  )
}
