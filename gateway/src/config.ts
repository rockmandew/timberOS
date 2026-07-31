import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NodeKind } from './types.js'

/**
 * TimberOS configuration. The naming convention (docs/NAMING.md) drives
 * auto-discovery; this file only adds what names can't carry: display
 * labels, units, alarm thresholds, interlocks and mode definitions.
 */

export interface SensorConfig {
  /** Sensor id, e.g. "RES.UPPER.DEPTH". */
  id: string
  label?: string
  unit?: string
  /** Full-scale value used to render a percentage; defaults to the highest threshold. */
  fullScale?: number
  alarms?: AlarmRuleConfig[]
}

export interface AlarmRuleConfig {
  /** Alarm fires when the band's upper bound is at or below this value. */
  belowOrAt: number
  severity: 'warning' | 'critical'
  message: string
  /** Restrict this alarm to specific operating modes (default: all). */
  modes?: string[]
}

export interface GateConfig {
  /** Gate id, e.g. "FG.UPPER.SPILLWAY". */
  id: string
  label?: string
  /** Require an explicit confirm flag before commanding (two-step commit). */
  confirmRequired?: boolean
}

export interface InterlockConfig {
  id: string
  description: string
  /** Gate this rule constrains. */
  gate: string
  /**
   * The rule blocks commands that would move the gate to a position matching this
   * predicate: "open" (binary open or any position > 0), "closed", or a number.
   */
  whenCommanded: 'open' | 'closed' | number
  /** Condition that must hold for the command to be allowed. */
  require: InterlockCondition
}

export type InterlockCondition =
  | { gate: string; state: 'open' | 'closed' }
  | { sensor: string; atLeast: number }
  | { sensor: string; below: number }

export interface ModeConfig {
  id: string
  label: string
  /** Manual-engineering style modes suspend automation rules. */
  suspendAutomation?: boolean
  description?: string
}

/**
 * Relationship rules for the diagnostics engine: when `sensor` is in an adverse
 * state (falling trend or in an alarm band), each influence whose condition
 * currently holds contributes its `because` clause to the explanation.
 */
export interface RelationshipConfig {
  /** Sensor id this rule explains, e.g. "SOIL.NORTH_FIELDS.MOISTURE". */
  sensor: string
  influences: RelationshipInfluence[]
}

export interface RelationshipInfluence {
  /** Human clause, e.g. "the irrigation gate is closed". */
  because: string
  /** A gate whose confirmed state must match `gateState`. */
  gate?: string
  gateState?: 'open' | 'closed'
  /** A raw adapter signal (e.g. "WEATHER.DROUGHT.ACTIVE") whose state must match. */
  signal?: string
  signalState?: boolean
  /** Another band sensor that must itself be low/high. */
  sensor?: string
  sensorBand?: 'low' | 'high'
}

/**
 * A colony stock the settlement both produces and consumes — food, water — so
 * TimberOS can frame it as a production/consumption *balance* and suggest an
 * action. The underlying data is the stock's threshold-band sensor (e.g.
 * FOOD.TOTAL.GT_*); the balance is read honestly from the band's trend
 * direction (rising = producing faster than consuming), never a faked rate.
 */
export interface ProvisionConfig {
  /** Stock band sensor id this provision tracks, e.g. "FOOD.TOTAL". */
  sensor: string
  label: string
  /** Drives the panel icon; defaults to "other". */
  kind?: 'food' | 'water' | 'other'
  /** Ranked advisories; the first whose conditions hold is shown. */
  advisories?: ProvisionAdvisoryConfig[]
}

/**
 * One suggested action for a provision, gated on the balance state and,
 * optionally, the band level and operating mode. Band gates use the same
 * guaranteed-bound rule as alarms: `belowOrAt` matches only when the band's
 * *ceiling* is at or below the value (we only advise on what we know), and
 * `aboveOrAt` only when the band's *floor* is at or above it.
 */
export interface ProvisionAdvisoryConfig {
  /** Balance state this advisory applies to. */
  balance: 'surplus' | 'balanced' | 'deficit'
  /** Only when the band ceiling ≤ this (a low/deficit guard). */
  belowOrAt?: number
  /** Only when the band floor ≥ this (a high/surplus guard). */
  aboveOrAt?: number
  severity: 'info' | 'warning' | 'critical'
  /** What's happening, e.g. "Food is being eaten faster than it's grown". */
  message: string
  /** The recommended operator action, e.g. "Assign more farmers or plant faster crops". */
  action: string
  /** Restrict to specific operating modes (default: all). */
  modes?: string[]
}

/**
 * Optional water-network topology for the contamination view. Node positions
 * are normalized 0..1 (the dashboard scales them into the SVG viewport).
 */
export interface NetworkConfig {
  nodes: NetworkNodeConfig[]
  edges: NetworkEdgeConfig[]
}

export interface NetworkNodeConfig {
  id: string
  label: string
  kind: NodeKind
  x: number
  y: number
  /** Node is contaminated while this adapter signal is ON. */
  contaminatedWhenSignal?: string
}

export interface NetworkEdgeConfig {
  id: string
  from: string
  to: string
  /** Gate governing flow along this edge (edge flows only when the gate is open). */
  gate?: string
  /** This edge carries badwater when flowing (routes contamination downstream). */
  carriesContamination?: boolean
  label?: string
}

/** Ambient output integrations (docs/ROADMAP.md Phase 3–4). Credentials come
 * from the gateway .env, never from this file or the browser. `enabled` here is
 * only the *initial* state — each integration can be toggled live from the
 * dashboard without restarting the gateway. */
export interface AnnunciatorsConfig {
  hue?: HueConfig
  audio?: AudioConfig
}

/** PC audio hydraulic-event cues, played in the dashboard browser (Web Audio). */
export interface AudioConfig {
  /** Initial on/off state (default: on). Toggle live from the dashboard. */
  enabled?: boolean
}

export interface HueConfig {
  /** Initial on/off state (default: off). Toggle live from the dashboard. */
  enabled?: boolean
  /** Bridge LAN IP (not a secret). The app key comes from HUE_USERNAME in .env. */
  bridgeIp: string
  /** Hue group id to drive as the status light (e.g. a room). */
  group?: string
  /** Individual light ids (informational; v1 drives the group). */
  lights?: string[]
  /** Colour fade time in ms. */
  transitionMs?: number
}

export interface EndpointsConfig {
  /** Base URL of the Timberborn HTTP API. */
  baseUrl: string
  /** Path returning all HTTP Adapters (game → out signals). */
  listAdapters: string
  /** Path returning all HTTP Levers (out → game switches). */
  listLevers: string
  /** Path template to set a lever; {name} and {state} are substituted. */
  setLever: string
}

export interface TimberOSConfig {
  endpoints: EndpointsConfig
  gateway: {
    port: number
    /** Adapter poll interval in ms. */
    pollMs: number
    /** Consecutive identical reads required before a change is accepted (debounce). */
    debounceReads: number
    /** Band transitions older than this no longer contribute to trend (ms). */
    trendWindowMs: number
    /** Time to wait for a STATE.* acknowledgment before marking a command failed (ms). */
    commandTimeoutMs: number
    /** SQLite event-store path (relative to repo root). */
    eventStore: string
  }
  sensors: SensorConfig[]
  gates: GateConfig[]
  interlocks: InterlockConfig[]
  modes: ModeConfig[]
  /** Optional diagnostics rules (docs/ROADMAP.md Phase 2). */
  relationships?: RelationshipConfig[]
  /** Optional production/consumption balance + action advisories for colony stocks. */
  provisions?: ProvisionConfig[]
  /** Optional contamination/flow network topology. */
  network?: NetworkConfig
  /** Optional ambient output integrations (docs/ROADMAP.md Phase 3–4). */
  annunciators?: AnnunciatorsConfig
}

const HERE = dirname(fileURLToPath(import.meta.url))

export const DEFAULT_CONFIG_PATHS = [
  resolve(HERE, '../../config/timberos.json'),
  resolve(HERE, '../../config/timberos.example.json'),
]

export function loadConfig(explicitPath?: string): { config: TimberOSConfig; path: string } {
  const candidates = explicitPath ? [resolve(explicitPath)] : DEFAULT_CONFIG_PATHS
  for (const path of candidates) {
    if (existsSync(path)) {
      const config = JSON.parse(readFileSync(path, 'utf8')) as TimberOSConfig
      validate(config, path)
      return { config, path }
    }
  }
  throw new Error(`No config found. Looked at: ${candidates.join(', ')}`)
}

function validate(config: TimberOSConfig, path: string): void {
  const problems: string[] = []
  if (!config.endpoints?.baseUrl) problems.push('endpoints.baseUrl is required')
  if (!config.gateway?.port) problems.push('gateway.port is required')
  if (!Array.isArray(config.modes) || config.modes.length === 0) problems.push('at least one mode is required')
  for (const interlock of config.interlocks ?? []) {
    if (!interlock.gate || interlock.whenCommanded === undefined || !interlock.require) {
      problems.push(`interlock "${interlock.id}" is missing gate/whenCommanded/require`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`Invalid config at ${path}:\n  - ${problems.join('\n  - ')}`)
  }
}
