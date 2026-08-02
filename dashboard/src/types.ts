/** Mirrors gateway/src/types.ts — extract to a shared package once it stabilizes. */

export type Trend = 'rising' | 'falling' | 'stable' | 'unknown'

export interface BandSensor {
  id: string
  label: string
  unit: string | null
  thresholds: number[]
  active: boolean[]
  lo: number | null
  hi: number | null
  fraction: number | null
  trend: Trend
  fault: boolean
  updatedAt: number
}

export type CommandStatus = 'idle' | 'pending' | 'confirmed' | 'failed'

export interface GateState {
  id: string
  label: string
  kind: 'discrete' | 'binary'
  positions: number[]
  requested: number | boolean | null
  confirmed: number | boolean | null
  status: CommandStatus
  acknowledged: boolean
  blockedBy: string | null
  confirmRequired: boolean
  updatedAt: number
}

export interface Alarm {
  id: string
  severity: 'warning' | 'critical'
  message: string
  since: number
}

export interface RawSignal {
  name: string
  state: boolean
  kind: 'adapter' | 'lever'
}

export type LintSeverity = 'error' | 'warning' | 'info'

export interface LintFinding {
  severity: LintSeverity
  code: string
  subject: string
  message: string
}

export interface RelationshipInsight {
  sensorId: string
  severity: 'info' | 'warning' | 'critical'
  headline: string
  because: string
  causes: string[]
}

export type IntegrationKind = 'light' | 'audio' | 'voice' | 'chat' | 'console'

export interface IntegrationState {
  id: string
  label: string
  kind: IntegrationKind
  enabled: boolean
  available: boolean
  detail: string
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
  gate: string | null
  flowing: boolean
  contaminated: boolean
  isolated: boolean
  label: string | null
}

export interface NetworkView {
  nodes: NetworkNodeView[]
  edges: NetworkEdgeView[]
}

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

/* --- Colony feed (from the timberOS Data Console mod, via GET /api/colony) --- */

export type ColonyFeedStatus = 'connected' | 'stale' | 'unavailable' | 'disabled'

export interface ColonyGameState {
  gameVersion: string | null
  modVersion: string
  factionId: string | null
  settlementName: string | null
}

export interface ColonyPopulation {
  total: number
  beavers: number
  adults: number
  children: number
  bots: number
  employed: number | null
  openJobs: number | null
  beds: number | null
  contaminatedBeavers: number | null
}

export interface ColonyResource {
  goodId: string
  amount: number
  capacity: number
}

export interface ColonyWeather {
  isHazardous: boolean
  hazardId: string | null
  temperateDurationDays: number
  hazardDurationDays: number
  daysUntilHazard: number | null
  hazardDaysRemaining: number | null
}

export interface ColonyPowerNetwork {
  index: number
  supply: number
  demand: number
  surplus: number
  batteryCharge: number
  batteryCapacity: number
  generators: number
  powered: boolean
}

export interface ColonyPower {
  networkCount: number
  totalSupply: number
  totalDemand: number
  totalSurplus: number
  totalBatteryCharge: number
  totalBatteryCapacity: number
  networksInDeficit: number
  networks: ColonyPowerNetwork[]
}

export interface ColonyProduction {
  buildings: number
  operating: number
  utilization: number | null
  paused: number
  noWorkers: number
  noPower: number
  noIngredients: number
  outputFull: number
  noRecipe: number
  idle: number
  dominantConstraint: string | null
}

export interface ColonyWater {
  sources: number
  contaminatedSources: number
  /** Flow-weighted share of incoming water that is contaminated (0–1). */
  contaminatedFraction: number | null
  totalStrength: number
}

export interface ColonyGameTime {
  cycle: number
  cycleDay: number
  partialCycleDay: number
}

export interface ColonySnapshot {
  schemaVersion: string
  settlementId: string | null
  sequence: number
  capturedAt: string
  gameTime: ColonyGameTime | null
  payload: {
    game: ColonyGameState | null
    population: ColonyPopulation | null
    resources: ColonyResource[] | null
    weather: ColonyWeather | null
    power: ColonyPower | null
    production?: ColonyProduction | null
    water?: ColonyWater | null
    collectors: Array<{ name: string; status: string; error: string | null }>
  }
}

export interface ColonyFeedState {
  status: ColonyFeedStatus
  url: string
  colony: ColonySnapshot | null
  lastUpdated: number | null
  message: string | null
}

/* --- Device registry (the Wiring panel) --- */

export interface NamedSignal {
  id: string
  label: string
  state: boolean
  updatedAt: number
}

export interface GateDevice {
  id: string
  label: string
  lever: string
  method?: 'GET' | 'POST'
  confirmRequired?: boolean
}

export interface SignalDevice {
  id: string
  label: string
  adapter: string
}

export interface ReservoirThreshold {
  adapter: string
  value: number
}

export interface ReservoirDevice {
  id: string
  label: string
  unit?: string
  thresholds: ReservoirThreshold[]
}

export interface DeviceRegistry {
  gates: GateDevice[]
  signals: SignalDevice[]
  reservoirs: ReservoirDevice[]
}

export interface Discovery {
  adapters: Array<{ name: string; state: boolean }>
  levers: Array<{ name: string; state: boolean }>
}

export interface Snapshot {
  connected: boolean
  simulated: boolean
  mode: string
  automationSuspended: boolean
  sensors: BandSensor[]
  gates: GateState[]
  alarms: Alarm[]
  signals?: NamedSignal[]
  unmapped: RawSignal[]
  lint: LintFinding[]
  insights: RelationshipInsight[]
  network: NetworkView | null
  integrations: IntegrationState[]
  /** Live colony telemetry from the Data Console mod, or undefined if the feed is off. */
  colony?: ColonyFeedState
  updatedAt: number
}

export interface EventRecord {
  id: number
  ts: number
  kind: string
  subject: string
  message: string
  data?: unknown
}

export interface CommandResult {
  ok: boolean
  status: 'accepted' | 'blocked' | 'needs-confirm' | 'error'
  message: string
}
