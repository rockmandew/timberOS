import type { TrendSeries } from '../types'

/**
 * A trend "ribbon": the sensor's band (lo–hi) drawn as a stepped shaded area
 * over time. Deliberately a band, never a line through the midpoint — the value
 * is only known to within a band, so the chart shows exactly that width and no
 * more (docs/ROADMAP.md: "never imply precision the bands don't have").
 */

const W = 320
const H = 72
const PAD = { l: 4, r: 4, t: 6, b: 6 }

export function TrendChart({ series }: { series: TrendSeries }) {
  const samples = series.samples
  if (samples.length < 2) {
    return (
      <div className="trendchart">
        <div className="trendchart-head">
          <span className="sensor-name">{series.label}</span>
          <span className="trendchart-collecting">collecting…</span>
        </div>
      </div>
    )
  }

  // Y domain from the observed band edges (nulls clamp to the domain edges).
  const values = samples.flatMap((s) => [s.lo, s.hi].filter((v): v is number => v !== null))
  const yMinRaw = values.length ? Math.min(...values) : 0
  const yMaxRaw = values.length ? Math.max(...values) : 1
  const span = yMaxRaw - yMinRaw || 1
  const yMin = yMinRaw - span * 0.08
  const yMax = yMaxRaw + span * 0.08

  const t0 = samples[0]!.ts
  const t1 = samples[samples.length - 1]!.ts
  const tSpan = t1 - t0 || 1

  const X = (ts: number) => PAD.l + ((ts - t0) / tSpan) * (W - PAD.l - PAD.r)
  const Y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b)

  const top: string[] = []
  const bottom: string[] = []
  for (let i = 0; i < samples.length - 1; i++) {
    const s = samples[i]!
    const xa = X(s.ts)
    const xb = X(samples[i + 1]!.ts)
    const hi = Y(s.hi ?? yMax)
    const lo = Y(s.lo ?? yMin)
    top.push(`${xa},${hi}`, `${xb},${hi}`)
    bottom.push(`${xb},${lo}`, `${xa},${lo}`)
  }
  const ribbon = `M ${top.join(' L ')} L ${bottom.reverse().join(' L ')} Z`

  const last = samples[samples.length - 2] ?? samples[0]!
  const frac = last.fraction
  const severity = frac === null ? '' : frac <= 0.25 ? 'crit' : frac <= 0.5 ? 'low' : ''
  const unit = series.unit ? ` ${series.unit}` : ''
  const bandText =
    last.lo !== null && last.hi !== null ? `${fmt(last.lo)}–${fmt(last.hi)}${unit}`
      : last.lo !== null ? `> ${fmt(last.lo)}${unit}`
      : last.hi !== null ? `< ${fmt(last.hi)}${unit}` : '—'

  return (
    <div className="trendchart">
      <div className="trendchart-head">
        <span className="sensor-name">{series.label}</span>
        <span className="sensor-band">{bandText}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="trendchart-svg" role="img"
           aria-label={`${series.label} band trend, currently ${bandText}`}>
        <path d={ribbon} className={`ribbon ${severity}`} />
      </svg>
      <div className="trendchart-axis">
        <span>{minutesAgo(t0, t1)}</span>
        <span>now</span>
      </div>
    </div>
  )
}

function fmt(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function minutesAgo(t0: number, t1: number): string {
  const mins = Math.round((t1 - t0) / 60000)
  return mins <= 0 ? 'just now' : `−${mins}m`
}
