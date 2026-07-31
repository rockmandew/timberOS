/** Shared domain types for the TimberOS gateway. */

/** A single boolean signal read from the game (HTTP Adapter) or written to it (HTTP Lever). */
export interface SignalReading {
  name: string
  state: boolean
}

export type Trend = 'rising' | 'falling' | 'stable' | 'unknown'

/**
 * A threshold-band sensor derived from a family of GT_* adapters,
 * e.g. RES.UPPER.DEPTH.GT_0_5 … GT_3_0 collapse into one BandSensor.
 */
export interface BandSensor {
  /** Stable id: the adapter name prefix, e.g. "RES.UPPER.DEPTH". */
  id: string
  label: string
  unit: string | null
  /** Ascending threshold values contributed by the GT_* adapters. */
  thresholds: number[]
  /** Which thresholds are currently ON (parallel to `thresholds`). */
  active: boolean[]
  /** Derived band. `lo` null = below lowest threshold, `hi` null = above highest. */
  lo: number | null
  hi: number | null
  /** Midpoint of the band as a fraction of full scale (0..1), null when indeterminate. */
  fraction: number | null
  trend: Trend
  /** True when the pattern is non-monotonic (a higher threshold ON while a lower one is OFF). */
  fault: boolean
  updatedAt: number
}

export type GateKind = 'discrete' | 'binary'
export type CommandStatus = 'idle' | 'pending' | 'confirmed' | 'failed'

export interface GateState {
  /** Stable id, e.g. "FG.UPPER.SPILLWAY". */
  id: string
  label: string
  kind: GateKind
  /** Available discrete positions (empty for binary gates). */
  positions: number[]
  /** Requested position: number for discrete, boolean for binary, null when never commanded. */
  requested: number | boolean | null
  /** Last confirmed position (from STATE.* adapters when present, else assumed). */
  confirmed: number | boolean | null
  status: CommandStatus
  /** True when a matching STATE.* adapter family exists to acknowledge commands. */
  acknowledged: boolean
  /** Interlock rule id currently blocking this gate, if any. */
  blockedBy: string | null
  /** True when commanding this gate requires an explicit confirm flag (two-step commit). */
  confirmRequired: boolean
  updatedAt: number
}

export type AlarmSeverity = 'warning' | 'critical'

export interface Alarm {
  id: string
  severity: AlarmSeverity
  message: string
  since: number
}

/** A raw boolean signal that did not match any naming convention — surfaced as-is. */
export interface RawSignal {
  name: string
  state: boolean
  kind: 'adapter' | 'lever'
}

export type LintSeverity = 'error' | 'warning' | 'info'

/**
 * A wiring/config mismatch found by the linter — a save-vs-config discrepancy
 * turned into a dashboard warning instead of a silent wrong reading.
 */
export interface LintFinding {
  severity: LintSeverity
  /** Stable slug for the rule that produced this, e.g. "gate-no-ack". */
  code: string
  /** The signal/gate/interlock the finding is about. */
  subject: string
  message: string
}

/**
 * A causal explanation for a sensor's adverse state — the relationship engine's
 * output, e.g. "North Fields Moisture is drying · because the irrigation gate is
 * closed while a drought is active".
 */
export interface RelationshipInsight {
  sensorId: string
  severity: 'info' | 'warning' | 'critical'
  /** What is happening, e.g. "North Fields Moisture is drying". */
  headline: string
  /** Why, as a single clause joining the active causes. */
  because: string
  /** Signal/gate ids that contributed, for cross-highlighting. */
  causes: string[]
}

/**
 * Kind of ambient output an integration drives, for iconography and grouping.
 * `console` is the always-on gateway log and is not shown as a user toggle.
 */
export type IntegrationKind = 'light' | 'audio' | 'voice' | 'chat' | 'console'

/**
 * Dashboard-facing view of one annunciator/integration and its live on/off
 * state. Toggled from the dashboard without restarting the gateway; the
 * updated list rides the snapshot so every client stays in sync.
 */
export interface IntegrationState {
  id: string
  label: string
  kind: IntegrationKind
  enabled: boolean
  /** Configured and usable right now (credentials present, etc.). A disabled
   * but available integration can be switched on live; an unavailable one needs
   * setup first (see `detail`). */
  available: boolean
  /** One-line status shown under the toggle, e.g. "bridge 192.168.1.2 · group 3". */
  detail: string
}

/** Net production-vs-consumption reading for a colony stock, from its band trend. */
export type ProvisionBalance = 'surplus' | 'balanced' | 'deficit' | 'unknown'

/**
 * A provision's live status: its current band, whether it's net-produced or
 * net-consumed right now, and the single most relevant suggested action.
 */
export interface ProvisionStatus {
  sensorId: string
  label: string
  kind: 'food' | 'water' | 'other'
  /** surplus = rising, deficit = falling, balanced = stable (from the band trend). */
  balance: ProvisionBalance
  trend: Trend
  lo: number | null
  hi: number | null
  fraction: number | null
  unit: string | null
  /** Advisory severity, or null when nothing needs saying. */
  severity: 'info' | 'warning' | 'critical' | null
  /** What's happening (advisory headline), or null. */
  message: string | null
  /** The recommended operator action, or null. */
  action: string | null
}

export type NodeKind = 'source' | 'reservoir' | 'junction' | 'field' | 'outlet' | 'colony'

export interface NetworkNodeView {
  id: string
  label: string
  kind: NodeKind
  x: number
  y: number
  contaminated: boolean
}

export interface NetworkEdgeView {
  id: string
  from: string
  to: string
  /** Gate that governs this edge, if any. */
  gate: string | null
  /** Clean water is currently moving along this edge. */
  flowing: boolean
  /** This edge is carrying (or would carry) contaminated water. */
  contaminated: boolean
  /** Route deliberately cut by a closed gate to protect downstream nodes. */
  isolated: boolean
  label: string | null
}

export interface NetworkView {
  nodes: NetworkNodeView[]
  edges: NetworkEdgeView[]
}

/** One stepped band sample for trend charts (honest range, never a point value). */
export interface TrendSample {
  ts: number
  lo: number | null
  hi: number | null
  fraction: number | null
}

export interface TrendSeries {
  sensorId: string
  label: string
  unit: string | null
  samples: TrendSample[]
}

export interface Snapshot {
  connected: boolean
  simulated: boolean
  mode: string
  automationSuspended: boolean
  sensors: BandSensor[]
  gates: GateState[]
  alarms: Alarm[]
  unmapped: RawSignal[]
  /** Config-vs-save wiring findings (recomputed when the discovered signal set changes). */
  lint: LintFinding[]
  /** Causal diagnostics for sensors currently in an adverse state. */
  insights: RelationshipInsight[]
  /** Production/consumption balance + suggested actions for colony stocks (food, water). */
  provisions: ProvisionStatus[]
  /** Contamination/flow network, or null when no `network` block is configured. */
  network: NetworkView | null
  /** Ambient output integrations and their live on/off state (Hue, PC audio, …). */
  integrations: IntegrationState[]
  updatedAt: number
}

export interface EventRecord {
  id: number
  ts: number
  /** e.g. "command", "state", "alarm", "mode", "system" */
  kind: string
  subject: string
  message: string
  data: unknown
}
