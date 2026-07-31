import type { RelationshipConfig, RelationshipInfluence } from '../config.js'
import type { BandSensor, GateState, RelationshipInsight } from '../types.js'

/**
 * Diagnostics / relationship engine (docs/ROADMAP.md Phase 2).
 *
 * When a sensor is in an adverse state (falling toward, or already inside, a
 * low band), this attaches the *reason* by evaluating configured influences —
 * gate positions, weather signals, other sensors — that currently hold. It
 * turns "North Fields Moisture is low" into "…drying · because the irrigation
 * gate is closed while a drought is active".
 *
 * Purely observational: it explains state, it never commands anything.
 */

const LOW = 0.4
const HIGH = 0.75

export function deriveInsights(
  rules: RelationshipConfig[],
  sensors: BandSensor[],
  gates: GateState[],
  signals: Map<string, boolean>,
): RelationshipInsight[] {
  const sensorById = new Map(sensors.map((s) => [s.id, s]))
  const gateById = new Map(gates.map((g) => [g.id, g]))
  const insights: RelationshipInsight[] = []

  for (const rule of rules) {
    const sensor = sensorById.get(rule.sensor)
    if (!sensor) continue
    const adverse = adverseState(sensor)
    if (!adverse) continue

    const clauses: string[] = []
    const causes: string[] = []
    for (const inf of rule.influences) {
      if (influenceHolds(inf, gateById, sensorById, signals)) {
        clauses.push(inf.because)
        causes.push(...influenceCauses(inf))
      }
    }
    if (clauses.length === 0) continue

    insights.push({
      sensorId: rule.sensor,
      severity: adverse,
      headline: `${sensor.label} is ${sensor.trend === 'falling' ? 'dropping' : 'low'}`,
      because: joinClauses(clauses),
      causes: [...new Set(causes)],
    })
  }

  return insights.sort((a, b) => rank(b.severity) - rank(a.severity))
}

/** null = not adverse; otherwise the severity to report. */
function adverseState(sensor: BandSensor): RelationshipInsight['severity'] | null {
  if (sensor.fault) return null // a faulted sensor's band is untrustworthy
  const f = sensor.fraction
  if (f !== null && f <= 0.25) return 'critical'
  if (f !== null && f <= LOW) return 'warning'
  if (sensor.trend === 'falling' && f !== null && f <= 0.6) return 'info'
  return null
}

function influenceHolds(
  inf: RelationshipInfluence,
  gates: Map<string, GateState>,
  sensors: Map<string, BandSensor>,
  signals: Map<string, boolean>,
): boolean {
  if (inf.gate && inf.gateState) {
    const gate = gates.get(inf.gate)
    if (!gate) return false
    const open = gate.confirmed === true || (typeof gate.confirmed === 'number' && gate.confirmed > 0)
    if ((inf.gateState === 'open') !== open) return false
  }
  if (inf.signal) {
    const want = inf.signalState ?? true
    if ((signals.get(inf.signal) ?? false) !== want) return false
  }
  if (inf.sensor && inf.sensorBand) {
    const other = sensors.get(inf.sensor)
    if (!other || other.fraction === null) return false
    const matches = inf.sensorBand === 'low' ? other.fraction <= LOW : other.fraction >= HIGH
    if (!matches) return false
  }
  // A clause with no testable condition never fires (avoids always-on noise).
  return Boolean(inf.gate || inf.signal || inf.sensor)
}

function influenceCauses(inf: RelationshipInfluence): string[] {
  const c: string[] = []
  if (inf.gate) c.push(inf.gate)
  if (inf.signal) c.push(inf.signal)
  if (inf.sensor) c.push(inf.sensor)
  return c
}

function joinClauses(clauses: string[]): string {
  if (clauses.length === 1) return clauses[0]!
  if (clauses.length === 2) return `${clauses[0]} while ${clauses[1]}`
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`
}

function rank(s: RelationshipInsight['severity']): number {
  return s === 'critical' ? 3 : s === 'warning' ? 2 : 1
}
