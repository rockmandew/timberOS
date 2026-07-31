import { bandLabel } from '../format'
import type { ProvisionStatus, TrendSeries } from '../types'

/**
 * Provision balance + action advisories (food, water, …). For each configured
 * stock we show: the current band, whether it's net-produced or net-consumed
 * right now, a small diverging chart of that net movement over time, and the
 * single most relevant suggested action. Honest by construction — the balance
 * is the direction the stored band is actually moving, not a faked rate.
 */

const KIND_ICON: Record<ProvisionStatus['kind'], string> = {
  food: '🌾',
  water: '💧',
  other: '📦',
}

const BALANCE_LABEL: Record<ProvisionStatus['balance'], string> = {
  surplus: '▲ surplus — producing faster than consuming',
  balanced: '▬ balanced — production meets consumption',
  deficit: '▼ deficit — consuming faster than producing',
  unknown: '· gathering balance…',
}

export function ProvisionsPanel({
  provisions,
  trends,
}: {
  provisions: ProvisionStatus[]
  trends: TrendSeries[]
}) {
  if (provisions.length === 0) {
    return <div className="unmapped">No provisions configured. Add a <code>provisions</code> block to config.</div>
  }
  const trendById = new Map(trends.map((t) => [t.sensorId, t]))

  return (
    <div className="provisions">
      {provisions.map((p) => (
        <div className={`provision ${p.balance}`} key={p.sensorId}>
          <div className="provision-head">
            <span className="provision-icon" aria-hidden="true">{KIND_ICON[p.kind]}</span>
            <span className="provision-name">{p.label}</span>
            <span className="provision-band">{bandText(p)}</span>
          </div>
          <div className={`provision-balance ${p.balance}`}>{BALANCE_LABEL[p.balance]}</div>
          <NetBalanceChart series={trendById.get(p.sensorId)} label={p.label} />
          {p.message && (
            <div className={`advisory ${p.severity ?? 'info'}`}>
              <span className="advisory-icon" aria-hidden="true">{p.severity === 'critical' ? '⛔' : p.severity === 'warning' ? '⚠' : 'ℹ'}</span>
              <div className="advisory-body">
                <div className="advisory-msg">{p.message}</div>
                {p.action && <div className="advisory-action"><span className="advisory-arrow">→</span> {p.action}</div>}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function bandText(p: ProvisionStatus): string {
  const unit = p.unit ? ` ${p.unit}` : ''
  const fmt = (v: number) => (Number.isInteger(v) ? v.toString() : v.toFixed(1))
  if (p.lo !== null && p.hi !== null) return `${fmt(p.lo)}–${fmt(p.hi)}${unit}`
  if (p.lo !== null) return `> ${fmt(p.lo)}${unit}`
  if (p.hi !== null) return `< ${fmt(p.hi)}${unit}`
  return '—'
}

const W = 320
const H = 48
const MID = H / 2

/**
 * Net provisioning over time: the change in the stored band between successive
 * recorded points, drawn as diverging bars — up/green when the store grew (net
 * production), down/amber when it shrank (net consumption). Band-derived, so it
 * shows direction and relative size, never a precise units-per-minute rate.
 */
function NetBalanceChart({ series, label }: { series: TrendSeries | undefined; label: string }) {
  const samples = series?.samples ?? []
  const points: { ts: number; delta: number }[] = []
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!.fraction
    const b = samples[i]!.fraction
    if (a === null || b === null) continue
    points.push({ ts: samples[i]!.ts, delta: b - a })
  }

  if (points.length === 0) {
    return <div className="provision-collecting">Collecting balance history…</div>
  }

  const maxAbs = Math.max(...points.map((p) => Math.abs(p.delta))) || 1
  const n = points.length
  const gap = 2
  const barW = Math.max(1, (W - gap * (n - 1)) / n)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="netbalance-svg"
      role="img"
      aria-label={`${label} net production versus consumption over time`}
    >
      <line x1="0" y1={MID} x2={W} y2={MID} className="netbalance-axis" />
      {points.map((p, i) => {
        const x = i * (barW + gap)
        const h = (Math.abs(p.delta) / maxAbs) * (MID - 2)
        const up = p.delta >= 0
        const y = up ? MID - h : MID
        return (
          <rect
            key={p.ts}
            x={x}
            y={y}
            width={barW}
            height={Math.max(0.5, h)}
            className={`netbalance-bar ${up ? 'produced' : 'consumed'}`}
          />
        )
      })}
    </svg>
  )
}
