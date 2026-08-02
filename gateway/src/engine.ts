import type { SensorConfig, TimberOSConfig } from './config.js'
import { type DeviceRegistry, claimedNames, emptyRegistry } from './devices/registry.js'
import { EventStore } from './events.js'
import type { Annunciator } from './integrations/annunciator.js'
import { lintConfig } from './lint.js'
import { gateSignalName, parseName } from './naming.js'
import { checkInterlocks } from './rules/interlocks.js'
import { evaluateAlarms } from './telemetry/alarms.js'
import { buildBandSensor, TrendTracker, type ThresholdReading } from './telemetry/bands.js'
import { deriveNetwork } from './telemetry/network.js'
import { deriveInsights } from './telemetry/relationships.js'
import type { TimberbornApi } from './timberborn/client.js'
import type { Alarm, BandSensor, GateState, IntegrationState, LintFinding, NamedSignal, NetworkView, RawSignal, RelationshipInsight, SignalReading, Snapshot, TrendSeries } from './types.js'

/**
 * The TimberOS engine: polls the game, debounces raw booleans, derives
 * band telemetry and gate state, enforces interlocks and mutual exclusion
 * on commands, evaluates alarms, and journals everything to the event store.
 */

interface Debounced {
  accepted: boolean
  candidate: boolean
  candidateCount: number
}

interface PendingCommand {
  gateId: string
  target: number | 'OPEN' | 'CLOSED'
  deadline: number
}

export interface CommandResult {
  ok: boolean
  status: 'accepted' | 'blocked' | 'needs-confirm' | 'error'
  message: string
}

export class Engine {
  private adapterStates = new Map<string, Debounced>()
  private leverStates = new Map<string, boolean>()
  private trend: TrendTracker
  private alarmsById = new Map<string, Alarm>()
  private pending = new Map<string, PendingCommand>()
  private gateMeta = new Map<string, { positions: Set<number>; binary: boolean; hasAck: boolean }>()
  private lint: LintFinding[] = []
  private lintSignature = ''
  private lastBand = new Map<string, { lo: number | null; hi: number | null }>()
  private connected = false
  private mode: string
  private snapshot: Snapshot
  private listeners = new Set<(snapshot: Snapshot) => void>()
  private timer: ReturnType<typeof setInterval> | null = null
  private polling = false
  private registry: DeviceRegistry
  // Latest raw reads, kept for the Wiring panel's device-discovery picker.
  private rawAdapters: SignalReading[] = []
  private rawLevers: SignalReading[] = []

  constructor(
    private readonly config: TimberOSConfig,
    private readonly api: TimberbornApi,
    readonly events: EventStore,
    private readonly annunciators: Annunciator[] = [],
    registry: DeviceRegistry = emptyRegistry(),
  ) {
    this.trend = new TrendTracker(config.gateway.trendWindowMs)
    this.mode = config.modes[0]!.id
    this.registry = registry
    this.snapshot = this.emptySnapshot()
  }

  /** Swap in an updated device registry (from the Wiring panel) and rebuild live. */
  setRegistry(registry: DeviceRegistry): void {
    this.registry = registry
    this.rebuildSnapshot(Date.now())
  }

  getRegistry(): DeviceRegistry {
    return this.registry
  }

  /** Raw discovered devices for the Wiring picker: every adapter/lever the game reports. */
  getDiscovery(): { adapters: SignalReading[]; levers: SignalReading[] } {
    return { adapters: this.rawAdapters, levers: this.rawLevers }
  }

  start(): void {
    this.timer = setInterval(() => void this.poll(), this.config.gateway.pollMs)
    this.timer.unref?.()
    void this.poll()
    this.events.append('system', 'gateway', `Gateway started (${this.api.simulated ? 'SIMULATOR' : 'live game'})`)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  onChange(listener: (snapshot: Snapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): Snapshot {
    return this.snapshot
  }

  getLint(): LintFinding[] {
    return this.lint
  }

  /** Dashboard-facing view of every user-toggleable integration (console excluded). */
  getIntegrations(): IntegrationState[] {
    return this.annunciators
      .filter((a) => a.kind !== 'console')
      .map((a) => ({ id: a.id, label: a.label, kind: a.kind, enabled: a.enabled, available: a.available, detail: a.detail }))
  }

  /** Flip an integration on/off live — no gateway restart, honoured on the next event. */
  setIntegrationEnabled(id: string, enabled: boolean): CommandResult {
    const target = this.annunciators.find((a) => a.id === id && a.kind !== 'console')
    if (!target) return { ok: false, status: 'error', message: `Unknown integration: ${id}` }
    if (target.enabled === enabled) {
      return { ok: true, status: 'accepted', message: `${target.label} already ${enabled ? 'enabled' : 'disabled'}` }
    }
    target.enabled = enabled
    this.events.append('integration', target.id, `${target.label} ${enabled ? 'ENABLED' : 'DISABLED'} from dashboard`)
    // A freshly-enabled annunciator catches up to the current state immediately.
    if (enabled) {
      void target.onMode(this.mode)
      void target.onSnapshot(this.snapshot)
    }
    this.rebuildSnapshot(Date.now())
    return { ok: true, status: 'accepted', message: `${target.label} ${enabled ? 'enabled' : 'disabled'}` }
  }

  /** Stepped band history per sensor, extended to `now` with the live band. */
  getTrends(sinceMs: number): TrendSeries[] {
    const now = Date.now()
    const bySensor = this.events.samplesSince(now - sinceMs)
    const liveById = new Map(this.snapshot.sensors.map((s) => [s.id, s]))
    const ids = new Set<string>([...bySensor.keys(), ...liveById.keys()])
    const out: TrendSeries[] = []
    for (const id of ids) {
      const samples = [...(bySensor.get(id) ?? [])]
      const live = liveById.get(id)
      if (live) samples.push({ ts: now, lo: live.lo, hi: live.hi, fraction: live.fraction })
      out.push({ sensorId: id, label: live?.label ?? id, unit: live?.unit ?? null, samples })
    }
    return out.sort((a, b) => a.sensorId.localeCompare(b.sensorId))
  }

  /** Recompute config↔save lint only when the discovered signal *name set* changes. */
  private refreshLint(adapters: SignalReading[], levers: SignalReading[]): void {
    const signature = `${adapters.map((a) => a.name).sort().join('|')}::${levers.map((l) => l.name).sort().join('|')}`
    if (signature === this.lintSignature) return
    this.lintSignature = signature
    this.lint = lintConfig(this.config, adapters, levers)
    const errors = this.lint.filter((f) => f.severity === 'error').length
    const warnings = this.lint.filter((f) => f.severity === 'warning').length
    if (errors + warnings > 0) {
      this.events.append('system', 'lint', `Config lint: ${errors} error(s), ${warnings} warning(s) — see /api/lint`)
    }
  }

  // ── Commands ──────────────────────────────────────────────────────────

  async commandGate(
    gateId: string,
    target: number | 'OPEN' | 'CLOSED',
    confirm: boolean,
  ): Promise<CommandResult> {
    const meta = this.gateMeta.get(gateId)
    if (!meta) return { ok: false, status: 'error', message: `Unknown gate: ${gateId}` }

    if (typeof target === 'number' && !meta.positions.has(target)) {
      return { ok: false, status: 'error', message: `Gate ${gateId} has no position ${target}` }
    }
    if (typeof target !== 'number' && !meta.binary) {
      return { ok: false, status: 'error', message: `Gate ${gateId} takes numeric positions, not OPEN/CLOSED` }
    }

    const regGate = this.registry.gates.find((g) => g.id === gateId)
    const gateConfig = this.config.gates.find((g) => g.id === gateId)
    const confirmRequired = regGate?.confirmRequired ?? gateConfig?.confirmRequired ?? false
    if (confirmRequired && !confirm) {
      return {
        ok: false,
        status: 'needs-confirm',
        message: `${gateId} is a protected control — repeat the command with confirm=true`,
      }
    }

    const violation = checkInterlocks(this.config.interlocks, gateId, target, {
      sensors: new Map(this.snapshot.sensors.map((s) => [s.id, s])),
      gates: new Map(this.snapshot.gates.map((g) => [g.id, g])),
    })
    if (violation) {
      this.events.append('command', gateId, `BLOCKED by interlock ${violation.ruleId}: ${violation.description}`, { target })
      return { ok: false, status: 'blocked', message: violation.description }
    }

    try {
      if (regGate) {
        // Registered gate: drive the game's real lever endpoints directly.
        await this.api.switchLever(regGate.lever, target === 'OPEN', regGate.method)
      } else if (meta.binary) {
        // Mutual exclusion: drop every other position lever before raising the target.
        await this.api.setLever(gateSignalName('CMD', gateId, 'OPEN'), target === 'OPEN')
      } else {
        const want = target as number
        for (const pos of [...meta.positions].sort((a, b) => a - b)) {
          if (pos !== want) await this.api.setLever(gateSignalName('CMD', gateId, pos), false)
        }
        await this.api.setLever(gateSignalName('CMD', gateId, want), true)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.events.append('command', gateId, `Command FAILED to send: ${message}`, { target })
      return { ok: false, status: 'error', message }
    }

    this.pending.set(gateId, {
      gateId,
      target,
      deadline: Date.now() + this.config.gateway.commandTimeoutMs,
    })
    this.events.append('command', gateId, `Commanded → ${formatTarget(target)}`, { target })
    await this.poll()
    return { ok: true, status: 'accepted', message: `${gateId} commanded to ${formatTarget(target)}` }
  }

  setMode(modeId: string): CommandResult {
    const mode = this.config.modes.find((m) => m.id === modeId)
    if (!mode) return { ok: false, status: 'error', message: `Unknown mode: ${modeId}` }
    if (mode.id === this.mode) return { ok: true, status: 'accepted', message: `Already in ${mode.label}` }
    this.mode = mode.id
    this.events.append('mode', 'system', `Operating mode → ${mode.label}`)
    for (const a of this.annunciators) if (a.enabled) void a.onMode(mode.id)
    this.rebuildSnapshot(Date.now())
    return { ok: true, status: 'accepted', message: `Operating mode set to ${mode.label}` }
  }

  // ── Polling ───────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const [adapters, levers] = await Promise.all([this.api.listAdapters(), this.api.listLevers()])
      this.setConnected(true)
      this.rawAdapters = adapters
      this.rawLevers = levers
      this.refreshLint(adapters, levers)

      const seen = new Set<string>()
      for (const reading of adapters) {
        seen.add(reading.name)
        this.debounce(reading.name, reading.state)
      }
      // A save reload can swap the whole adapter set out from under us.
      for (const name of [...this.adapterStates.keys()]) {
        if (!seen.has(name)) {
          this.adapterStates.delete(name)
          this.events.append('system', name, 'Adapter disappeared (save reloaded or renamed?)')
        }
      }

      this.leverStates = new Map(levers.map((l) => [l.name, l.state]))
      this.rebuildSnapshot(Date.now())
    } catch {
      this.setConnected(false)
    } finally {
      this.polling = false
    }
  }

  /** Accept a change only after N consecutive identical reads — kills band flapping. */
  private debounce(name: string, state: boolean): void {
    const entry = this.adapterStates.get(name)
    if (!entry) {
      this.adapterStates.set(name, { accepted: state, candidate: state, candidateCount: 0 })
      return
    }
    if (state === entry.accepted) {
      entry.candidateCount = 0
      return
    }
    if (state === entry.candidate) entry.candidateCount++
    else {
      entry.candidate = state
      entry.candidateCount = 1
    }
    if (entry.candidateCount >= this.config.gateway.debounceReads) {
      entry.accepted = state
      entry.candidateCount = 0
    }
  }

  // ── Snapshot derivation ───────────────────────────────────────────────

  private rebuildSnapshot(now: number): void {
    const thresholdsBySensor = new Map<string, ThresholdReading[]>()
    const acksByGate = new Map<string, Array<{ position: number | 'OPEN'; state: boolean }>>()
    const unmapped: RawSignal[] = []

    const claimed = claimedNames(this.registry)
    for (const [name, entry] of this.adapterStates) {
      if (claimed.adapters.has(name)) continue // handled by registry reservoirs/signals
      const parsed = parseName(name)
      if (parsed.kind === 'threshold') {
        const list = thresholdsBySensor.get(parsed.sensorId) ?? []
        list.push({ value: parsed.value, active: entry.accepted })
        thresholdsBySensor.set(parsed.sensorId, list)
      } else if (parsed.kind === 'gate-ack') {
        const list = acksByGate.get(parsed.gateId) ?? []
        list.push({ position: parsed.position, state: entry.accepted })
        acksByGate.set(parsed.gateId, list)
      } else {
        unmapped.push({ name, state: entry.accepted, kind: 'adapter' })
      }
    }

    const commandsByGate = new Map<string, Array<{ position: number | 'OPEN'; state: boolean }>>()
    for (const [name, state] of this.leverStates) {
      if (claimed.levers.has(name)) continue // handled by registry gates
      const parsed = parseName(name)
      if (parsed.kind === 'gate-command') {
        const list = commandsByGate.get(parsed.gateId) ?? []
        list.push({ position: parsed.position, state })
        commandsByGate.set(parsed.gateId, list)
      } else {
        unmapped.push({ name, state, kind: 'lever' })
      }
    }

    const sensorConfigById = new Map(this.config.sensors.map((s) => [s.id, s]))
    const namingSensors: BandSensor[] = [...thresholdsBySensor.entries()].map(([sensorId, readings]) => {
      const sorted = [...readings].sort((a, b) => a.value - b.value)
      const derived = buildBandSensor(sensorId, sorted, 'unknown', now, sensorConfigById.get(sensorId))
      const trend = this.trend.update(sensorId, derived.lo, derived.hi, now)
      return { ...derived, trend }
    })
    const sensors: BandSensor[] = [...this.buildRegistryReservoirs(now), ...namingSensors].sort((a, b) =>
      a.id.localeCompare(b.id),
    )

    // Registry gates take precedence over any naming-derived gate with the same id.
    const registryGates = this.buildRegistryGates(now)
    const regGateIds = new Set(registryGates.map((g) => g.id))
    const namingGates = this.deriveGates(commandsByGate, acksByGate, now).filter((g) => !regGateIds.has(g.id))
    const gates = [...registryGates, ...namingGates].sort((a, b) => a.id.localeCompare(b.id))

    const namedSignals = this.buildRegistrySignals(now)

    // Record band transitions for trend charts (sparse: only when the band moves).
    for (const sensor of sensors) {
      const prev = this.lastBand.get(sensor.id)
      if (!prev || prev.lo !== sensor.lo || prev.hi !== sensor.hi) {
        this.lastBand.set(sensor.id, { lo: sensor.lo, hi: sensor.hi })
        this.events.recordSample(sensor.id, sensor.lo, sensor.hi, sensor.fraction)
      }
    }

    const previousAlarms = this.alarmsById
    const alarms = evaluateAlarms(sensors, this.config.sensors, this.mode, previousAlarms, now)
    this.emitAlarmEdges(previousAlarms, alarms)
    this.alarmsById = new Map(alarms.map((a) => [a.id, a]))

    const signals = new Map<string, boolean>()
    for (const [name, entry] of this.adapterStates) signals.set(name, entry.accepted)
    const insights: RelationshipInsight[] = deriveInsights(this.config.relationships ?? [], sensors, gates, signals)
    const network: NetworkView | null = deriveNetwork(this.config.network, gates, signals)

    const modeConfig = this.config.modes.find((m) => m.id === this.mode)
    this.snapshot = {
      connected: this.connected,
      simulated: this.api.simulated,
      mode: this.mode,
      automationSuspended: modeConfig?.suspendAutomation ?? false,
      sensors,
      gates,
      alarms,
      signals: namedSignals,
      unmapped: unmapped.sort((a, b) => a.name.localeCompare(b.name)),
      lint: this.lint,
      insights,
      network,
      integrations: this.getIntegrations(),
      updatedAt: now,
    }
    for (const listener of this.listeners) listener(this.snapshot)
    for (const a of this.annunciators) if (a.enabled) void a.onSnapshot(this.snapshot)
  }

  private deriveGates(
    commands: Map<string, Array<{ position: number | 'OPEN'; state: boolean }>>,
    acks: Map<string, Array<{ position: number | 'OPEN'; state: boolean }>>,
    now: number,
  ): GateState[] {
    const gateIds = new Set([...commands.keys(), ...acks.keys()])
    const gates: GateState[] = []

    for (const gateId of gateIds) {
      const cmdList = commands.get(gateId) ?? []
      const ackList = acks.get(gateId) ?? []
      const binary = cmdList.some((c) => c.position === 'OPEN') || ackList.some((a) => a.position === 'OPEN')
      const positions = [...new Set(cmdList.filter((c) => c.position !== 'OPEN').map((c) => c.position as number))]
        .sort((a, b) => a - b)
      this.gateMeta.set(gateId, { positions: new Set(positions), binary, hasAck: ackList.length > 0 })

      const requested = activePosition(cmdList, binary)
      const confirmed = ackList.length > 0 ? activePosition(ackList, binary) : requested
      const pending = this.pending.get(gateId)

      let status: GateState['status'] = 'idle'
      if (pending) {
        const targetValue = pending.target === 'OPEN' ? true : pending.target === 'CLOSED' ? false : pending.target
        if (confirmed === targetValue) {
          status = 'confirmed'
          this.pending.delete(gateId)
          this.events.append('state', gateId, `Position confirmed at ${formatTarget(pending.target)}`)
        } else if (now > pending.deadline) {
          status = 'failed'
          this.pending.delete(gateId)
          this.events.append('state', gateId, `Command NOT confirmed within timeout (wanted ${formatTarget(pending.target)})`)
        } else {
          status = 'pending'
        }
      }

      const gateConfig = this.config.gates.find((g) => g.id === gateId)
      gates.push({
        id: gateId,
        label: gateConfig?.label ?? gateId,
        kind: binary ? 'binary' : 'discrete',
        positions,
        requested,
        confirmed,
        status,
        acknowledged: ackList.length > 0,
        blockedBy: null,
        confirmRequired: gateConfig?.confirmRequired ?? false,
        updatedAt: now,
      })
    }

    return gates.sort((a, b) => a.id.localeCompare(b.id))
  }

  private emitAlarmEdges(previous: Map<string, Alarm>, current: Alarm[]): void {
    const currentIds = new Set(current.map((a) => a.id))
    for (const alarm of current) {
      if (!previous.has(alarm.id)) {
        this.events.append('alarm', alarm.id, `RAISED [${alarm.severity}] ${alarm.message}`)
        for (const a of this.annunciators) if (a.enabled) void a.onAlarm(alarm, 'raised')
      }
    }
    for (const [id, alarm] of previous) {
      if (!currentIds.has(id)) {
        this.events.append('alarm', id, `CLEARED ${alarm.message}`)
        for (const a of this.annunciators) if (a.enabled) void a.onAlarm(alarm, 'cleared')
      }
    }
  }

  private setConnected(connected: boolean): void {
    if (connected === this.connected) return
    this.connected = connected
    this.events.append('system', 'timberborn', connected ? 'Connected to Timberborn API' : 'LOST connection to Timberborn API')
    if (!connected) this.rebuildSnapshot(Date.now())
  }

  private emptySnapshot(): Snapshot {
    return {
      connected: false,
      simulated: this.api.simulated,
      mode: this.mode,
      automationSuspended: false,
      sensors: [],
      gates: [],
      alarms: [],
      signals: [],
      unmapped: [],
      lint: [],
      insights: [],
      network: null,
      integrations: this.getIntegrations(),
      updatedAt: 0,
    }
  }

  // ── Registry-driven devices (the Wiring panel) ────────────────────────

  /** Group each registered reservoir's threshold adapters into a band sensor. */
  private buildRegistryReservoirs(now: number): BandSensor[] {
    const out: BandSensor[] = []
    for (const dev of this.registry.reservoirs) {
      if (dev.thresholds.length === 0) continue
      const readings: ThresholdReading[] = dev.thresholds
        .map((t) => ({ value: t.value, active: this.adapterStates.get(t.adapter)?.accepted ?? false }))
        .sort((a, b) => a.value - b.value)
      const cfg: SensorConfig = { id: dev.id, label: dev.label, unit: dev.unit }
      const derived = buildBandSensor(dev.id, readings, 'unknown', now, cfg)
      const trend = this.trend.update(dev.id, derived.lo, derived.hi, now)
      out.push({ ...derived, trend })
    }
    return out
  }

  /** Each registered lever becomes a binary gate; the lever's own state is the ack. */
  private buildRegistryGates(now: number): GateState[] {
    const out: GateState[] = []
    for (const dev of this.registry.gates) {
      const leverOn = this.leverStates.get(dev.lever) ?? false
      this.gateMeta.set(dev.id, { positions: new Set<number>(), binary: true, hasAck: false })

      const pending = this.pending.get(dev.id)
      let requested: boolean = leverOn
      const confirmed: boolean = leverOn
      let status: GateState['status'] = 'idle'
      if (pending) {
        const targetBool = pending.target === 'OPEN'
        requested = targetBool
        if (leverOn === targetBool) {
          status = 'confirmed'
          this.pending.delete(dev.id)
          this.events.append('state', dev.id, `Lever confirmed ${targetBool ? 'ON' : 'OFF'}`)
        } else if (now > pending.deadline) {
          status = 'failed'
          this.pending.delete(dev.id)
          this.events.append('state', dev.id, 'Lever command not confirmed within timeout')
        } else {
          status = 'pending'
        }
      }

      out.push({
        id: dev.id,
        label: dev.label,
        kind: 'binary',
        positions: [],
        requested,
        confirmed,
        status,
        acknowledged: true,
        blockedBy: null,
        confirmRequired: dev.confirmRequired ?? false,
        updatedAt: now,
      })
    }
    return out
  }

  /** Each registered plain adapter becomes a nicknamed boolean signal. */
  private buildRegistrySignals(now: number): NamedSignal[] {
    return this.registry.signals
      .map((dev) => ({
        id: dev.id,
        label: dev.label,
        state: this.adapterStates.get(dev.adapter)?.accepted ?? false,
        updatedAt: now,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  }
}

/** For a family of position signals, the highest active one wins. */
function activePosition(
  list: Array<{ position: number | 'OPEN'; state: boolean }>,
  binary: boolean,
): number | boolean | null {
  if (binary) {
    const open = list.find((e) => e.position === 'OPEN')
    return open ? open.state : null
  }
  const active = list
    .filter((e) => e.state && typeof e.position === 'number')
    .map((e) => e.position as number)
    .sort((a, b) => a - b)
  if (active.length > 0) return active[active.length - 1]!
  return list.length > 0 ? 0 : null
}

function formatTarget(target: number | 'OPEN' | 'CLOSED'): string {
  return typeof target === 'number' ? `${target.toFixed(1)} m` : target
}
