import type { ProvisionAdvisoryConfig, ProvisionConfig } from '../config.js'
import type { BandSensor, ProvisionBalance, ProvisionStatus, Trend } from '../types.js'

/**
 * Provision balance + action advisories (food, water, …).
 *
 * The colony both produces and consumes each provision, so the useful question
 * isn't just "how full is the store" (the band gauge already answers that) but
 * "are we gaining or losing ground, and what should I do about it". We answer
 * the first half honestly from the band's *trend* — rising means production is
 * currently outpacing consumption, falling means the reverse — and the second
 * half from ranked, config-driven advisories. No fabricated per-tick rates: the
 * balance is the direction the stored band is actually moving.
 */
export function deriveProvisions(
  configs: ProvisionConfig[] | undefined,
  sensors: BandSensor[],
  mode: string,
): ProvisionStatus[] {
  if (!configs || configs.length === 0) return []
  const byId = new Map(sensors.map((s) => [s.id, s]))

  return configs.map((cfg) => {
    const sensor = byId.get(cfg.sensor)
    const balance = balanceOf(sensor?.trend ?? 'unknown')
    const advisory = sensor ? pickAdvisory(cfg.advisories ?? [], balance, sensor, mode) : null
    return {
      sensorId: cfg.sensor,
      label: cfg.label,
      kind: cfg.kind ?? 'other',
      balance,
      trend: sensor?.trend ?? 'unknown',
      lo: sensor?.lo ?? null,
      hi: sensor?.hi ?? null,
      fraction: sensor?.fraction ?? null,
      unit: sensor?.unit ?? null,
      severity: advisory?.severity ?? null,
      message: advisory?.message ?? null,
      action: advisory?.action ?? null,
    }
  })
}

function balanceOf(trend: Trend): ProvisionBalance {
  switch (trend) {
    case 'rising':
      return 'surplus'
    case 'falling':
      return 'deficit'
    case 'stable':
      return 'balanced'
    default:
      return 'unknown'
  }
}

/** First advisory whose balance, band-level guards and mode all match. */
function pickAdvisory(
  advisories: ProvisionAdvisoryConfig[],
  balance: ProvisionBalance,
  sensor: BandSensor,
  mode: string,
): ProvisionAdvisoryConfig | null {
  for (const a of advisories) {
    if (a.balance !== balance) continue
    if (a.modes && !a.modes.includes(mode)) continue
    // Guaranteed-bound gating, mirroring the alarm engine: only advise on what
    // the band actually proves, never on an optimistic midpoint.
    if (a.belowOrAt !== undefined && !(sensor.hi !== null && sensor.hi <= a.belowOrAt)) continue
    if (a.aboveOrAt !== undefined && !(sensor.lo !== null && sensor.lo >= a.aboveOrAt)) continue
    return a
  }
  return null
}
