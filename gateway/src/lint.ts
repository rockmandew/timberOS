import type { TimberOSConfig } from './config.js'
import { parseName } from './naming.js'
import type { LintFinding, SignalReading } from './types.js'

/**
 * Config ↔ save linter (docs/ROADMAP.md Phase 2, recommendation #2).
 *
 * Cross-checks the discovered HTTP adapters/levers against config and turns
 * wiring mistakes into explicit findings instead of silent wrong readings:
 * a gate command with no matching STATE.* ack, an interlock referencing a
 * missing sensor/gate, an alarm threshold that no adapter can actually fire at,
 * and so on. Pure and side-effect-free so it can run at startup and on every
 * change to the discovered signal set.
 */

interface Discovered {
  /** sensorId → ascending threshold values. */
  sensors: Map<string, number[]>
  /** gateId → command/ack positions. */
  gates: Map<string, { commands: Array<number | 'OPEN'>; acks: Array<number | 'OPEN'> }>
  adapterNames: Set<string>
  leverNames: Set<string>
}

export function lintConfig(
  config: TimberOSConfig,
  adapters: SignalReading[],
  levers: SignalReading[],
): LintFinding[] {
  const found: LintFinding[] = []
  const add = (severity: LintFinding['severity'], code: string, subject: string, message: string): void => {
    found.push({ severity, code, subject, message })
  }

  const d = discover(adapters, levers)
  const knownSensorIds = new Set([...d.sensors.keys(), ...config.sensors.map((s) => s.id)])
  const knownGateIds = new Set([...d.gates.keys(), ...config.gates.map((g) => g.id)])

  // ── Duplicate ids ─────────────────────────────────────────────────────
  reportDuplicates(config.sensors.map((s) => s.id), 'sensor', add)
  reportDuplicates(config.gates.map((g) => g.id), 'gate', add)
  reportDuplicates(config.interlocks.map((i) => i.id), 'interlock', add)
  reportDuplicates(config.modes.map((m) => m.id), 'mode', add)

  // ── Sensors ───────────────────────────────────────────────────────────
  for (const sensor of config.sensors) {
    const thresholds = d.sensors.get(sensor.id)
    if (!thresholds) {
      add('error', 'sensor-not-discovered', sensor.id,
        `Sensor "${sensor.id}" is configured but no GT_* adapters were discovered — check the names in the save.`)
      continue
    }
    for (const alarm of sensor.alarms ?? []) {
      if (!thresholds.includes(alarm.belowOrAt)) {
        const nearest = nearestAtOrAbove(thresholds, alarm.belowOrAt)
        const detail = nearest === null
          ? `no threshold at or above it exists, so it can never fire`
          : `it can only fire at the nearest band boundary (${nearest})`
        add('warning', 'alarm-threshold-gap', sensor.id,
          `Alarm at ${alarm.belowOrAt} has no matching GT_${tokenish(alarm.belowOrAt)} adapter — ${detail}.`)
      }
      for (const mode of alarm.modes ?? []) {
        if (!config.modes.some((m) => m.id === mode)) {
          add('warning', 'alarm-unknown-mode', sensor.id,
            `Alarm references mode "${mode}", which is not defined.`)
        }
      }
    }
    if (thresholds.length >= 3 && unevenlySpaced(thresholds)) {
      add('info', 'threshold-uneven-spacing', sensor.id,
        `Threshold family is unevenly spaced (${thresholds.join(', ')}) — intended, or a missing band?`)
    }
  }
  for (const [sensorId] of d.sensors) {
    if (!config.sensors.some((s) => s.id === sensorId)) {
      add('info', 'sensor-unconfigured', sensorId,
        `Sensor "${sensorId}" was discovered but has no config entry — using default label/scale.`)
    }
  }

  // ── Gates ─────────────────────────────────────────────────────────────
  for (const [gateId, g] of d.gates) {
    const gateConfig = config.gates.find((c) => c.id === gateId)
    if (g.commands.length === 0) {
      add('warning', 'gate-no-commands', gateId,
        `Gate "${gateId}" has STATE.* acks but no CMD.* levers — it can be read but never commanded.`)
    }
    if (g.acks.length === 0) {
      const protectedGate = gateConfig?.confirmRequired
      add(protectedGate ? 'warning' : 'info', 'gate-no-ack', gateId,
        protectedGate
          ? `Protected gate "${gateId}" has no STATE.* ack family — a high-risk control whose position can never be confirmed.`
          : `Gate "${gateId}" has no STATE.* ack family — its position is assumed from the command, never confirmed.`)
    }
  }
  for (const gate of config.gates) {
    if (!d.gates.has(gate.id)) {
      add('error', 'gate-not-discovered', gate.id,
        `Gate "${gate.id}" is configured but no CMD.*/STATE.* signals were discovered — check the names in the save.`)
    }
  }

  // ── Interlocks ────────────────────────────────────────────────────────
  for (const rule of config.interlocks) {
    if (!knownGateIds.has(rule.gate)) {
      add('error', 'interlock-unknown-gate', rule.id,
        `Interlock "${rule.id}" constrains gate "${rule.gate}", which is neither discovered nor configured.`)
    } else if (typeof rule.whenCommanded === 'number') {
      const positions = (d.gates.get(rule.gate)?.commands ?? []).filter((p): p is number => typeof p === 'number')
      if (positions.length > 0 && !positions.includes(rule.whenCommanded)) {
        add('warning', 'interlock-position-gap', rule.id,
          `Interlock "${rule.id}" triggers at position ${rule.whenCommanded}, but gate "${rule.gate}" has no such position (${positions.join(', ')}).`)
      }
    }
    const cond = rule.require
    if ('gate' in cond && !knownGateIds.has(cond.gate)) {
      add('error', 'interlock-unknown-require-gate', rule.id,
        `Interlock "${rule.id}" requires gate "${cond.gate}", which is neither discovered nor configured.`)
    }
    if ('sensor' in cond && !knownSensorIds.has(cond.sensor)) {
      add('error', 'interlock-unknown-require-sensor', rule.id,
        `Interlock "${rule.id}" requires sensor "${cond.sensor}", which is neither discovered nor configured.`)
    }
  }

  // ── Relationships ─────────────────────────────────────────────────────
  for (const rel of config.relationships ?? []) {
    if (!knownSensorIds.has(rel.sensor)) {
      add('warning', 'relationship-unknown-sensor', rel.sensor,
        `Relationship rule targets sensor "${rel.sensor}", which is neither discovered nor configured.`)
    }
    for (const inf of rel.influences) {
      if (inf.gate && !knownGateIds.has(inf.gate)) {
        add('warning', 'relationship-unknown-gate', rel.sensor,
          `Relationship influence references gate "${inf.gate}", which is not known.`)
      }
      if (inf.sensor && !knownSensorIds.has(inf.sensor)) {
        add('warning', 'relationship-unknown-sensor', rel.sensor,
          `Relationship influence references sensor "${inf.sensor}", which is not known.`)
      }
      if (inf.signal && !d.adapterNames.has(inf.signal)) {
        add('info', 'relationship-unknown-signal', rel.sensor,
          `Relationship influence references adapter "${inf.signal}", which was not discovered.`)
      }
    }
  }

  // ── Network ───────────────────────────────────────────────────────────
  if (config.network) {
    const nodeIds = new Set(config.network.nodes.map((n) => n.id))
    for (const node of config.network.nodes) {
      if (node.contaminatedWhenSignal && !d.adapterNames.has(node.contaminatedWhenSignal)) {
        add('info', 'network-unknown-signal', node.id,
          `Network node "${node.id}" watches adapter "${node.contaminatedWhenSignal}", which was not discovered.`)
      }
    }
    for (const edge of config.network.edges) {
      if (!nodeIds.has(edge.from)) {
        add('error', 'network-unknown-node', edge.id, `Network edge "${edge.id}" starts at unknown node "${edge.from}".`)
      }
      if (!nodeIds.has(edge.to)) {
        add('error', 'network-unknown-node', edge.id, `Network edge "${edge.id}" ends at unknown node "${edge.to}".`)
      }
      if (edge.gate && !knownGateIds.has(edge.gate)) {
        add('warning', 'network-unknown-gate', edge.id,
          `Network edge "${edge.id}" is governed by gate "${edge.gate}", which is not known.`)
      }
    }
  }

  return found.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
}

function discover(adapters: SignalReading[], levers: SignalReading[]): Discovered {
  const sensors = new Map<string, number[]>()
  const gates = new Map<string, { commands: Array<number | 'OPEN'>; acks: Array<number | 'OPEN'> }>()
  const adapterNames = new Set<string>()
  const leverNames = new Set<string>()

  const gateEntry = (id: string) => {
    let e = gates.get(id)
    if (!e) { e = { commands: [], acks: [] }; gates.set(id, e) }
    return e
  }

  for (const a of adapters) {
    adapterNames.add(a.name)
    const parsed = parseName(a.name)
    if (parsed.kind === 'threshold') {
      const list = sensors.get(parsed.sensorId) ?? []
      if (!list.includes(parsed.value)) list.push(parsed.value)
      sensors.set(parsed.sensorId, list)
    } else if (parsed.kind === 'gate-ack') {
      gateEntry(parsed.gateId).acks.push(parsed.position)
    }
  }
  for (const l of levers) {
    leverNames.add(l.name)
    const parsed = parseName(l.name)
    if (parsed.kind === 'gate-command') gateEntry(parsed.gateId).commands.push(parsed.position)
  }
  for (const list of sensors.values()) list.sort((a, b) => a - b)
  return { sensors, gates, adapterNames, leverNames }
}

function reportDuplicates(
  ids: string[],
  kind: string,
  add: (s: LintFinding['severity'], c: string, subj: string, m: string) => void,
): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) add('error', 'duplicate-id', id, `Duplicate ${kind} id "${id}" in config.`)
    seen.add(id)
  }
}

function nearestAtOrAbove(sorted: number[], value: number): number | null {
  for (const t of sorted) if (t >= value) return t
  return null
}

function unevenlySpaced(sorted: number[]): boolean {
  const deltas: number[] = []
  for (let i = 1; i < sorted.length; i++) deltas.push(sorted[i]! - sorted[i - 1]!)
  const min = Math.min(...deltas)
  const max = Math.max(...deltas)
  return min > 0 && max > min * 2 + 1e-9
}

/** Best-effort GT_ token for a message, mirroring naming.formatValueToken loosely. */
function tokenish(value: number): string {
  if (Number.isInteger(value) && value >= 10) return String(value)
  return value.toFixed(1).replace('.', '_')
}

function severityRank(s: LintFinding['severity']): number {
  return s === 'error' ? 3 : s === 'warning' ? 2 : 1
}
