import { formatValueToken, gateSignalName } from '../naming.js'
import type { SignalReading } from '../types.js'
import type { TimberbornApi } from './client.js'

/**
 * A small physics-flavored stand-in for a running colony so the dashboard,
 * rules and annunciators can be developed without Timberborn running.
 *
 * It models one water system: the upper reservoir drains through the
 * spillway and irrigation gates, irrigation feeds soil moisture, and total
 * water stock tracks the reservoir. Gate commands are acknowledged on
 * STATE.* adapters after a short delay, like the in-game wiring would.
 */

const TICK_MS = 1000

interface SimGate {
  id: string
  positions: number[] | null // null = binary OPEN gate
  commanded: number | 'OPEN' | null
  acknowledged: number | 'OPEN' | null
  ackAt: number // tick when the pending command confirms
}

export class SimulatedTimberborn implements TimberbornApi {
  readonly simulated = true

  private tick = 0
  private depth = 2.7 // upper reservoir, meters
  private soil = 0.9 // 0..1 moisture in the north fields
  private water = 9200 // colony water stock
  private raining = true
  private levers = new Map<string, boolean>()

  private gates: SimGate[] = [
    { id: 'FG.UPPER.SPILLWAY', positions: [0, 0.5, 1, 1.5, 2, 2.5, 3], commanded: 1, acknowledged: 1, ackAt: 0 },
    { id: 'FG.UPPER.IRRIGATION', positions: [0, 0.5, 1, 1.5], commanded: 0.5, acknowledged: 0.5, ackAt: 0 },
    { id: 'FG.BADWATER.DIVERSION', positions: null, commanded: null, acknowledged: null, ackAt: 0 },
    { id: 'FG.CENTRAL.CONTAM_INLET', positions: null, commanded: null, acknowledged: null, ackAt: 0 },
  ]

  private timer: ReturnType<typeof setInterval>

  constructor() {
    for (const gate of this.gates) {
      for (const pos of gate.positions ?? ['OPEN' as const]) {
        this.levers.set(gateSignalName('CMD', gate.id, pos), gate.commanded === pos)
      }
    }
    this.timer = setInterval(() => this.step(), TICK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    clearInterval(this.timer)
  }

  private step(): void {
    this.tick++

    // Weather: ~90 ticks wet, ~60 ticks "drought".
    if (this.tick % 150 === 0) this.raining = true
    else if (this.tick % 150 === 90) this.raining = false

    // Acknowledge pending gate commands.
    for (const gate of this.gates) {
      if (gate.commanded !== gate.acknowledged && this.tick >= gate.ackAt) {
        gate.acknowledged = gate.commanded
      }
    }

    const spillway = this.ackPosition('FG.UPPER.SPILLWAY')
    const irrigation = this.ackPosition('FG.UPPER.IRRIGATION')

    const inflow = this.raining ? 0.03 : 0.002
    const outflow = 0.006 * spillway + 0.01 * irrigation
    this.depth = clamp(this.depth + inflow - outflow, 0, 3.2)

    this.soil = clamp(this.soil + (irrigation > 0 ? 0.01 : -0.008), 0, 1)
    this.water = clamp(this.water + (this.raining ? 25 : -35), 0, 12000)
  }

  private ackPosition(id: string): number {
    const gate = this.gates.find((g) => g.id === id)
    return typeof gate?.acknowledged === 'number' ? gate.acknowledged : 0
  }

  async listAdapters(): Promise<SignalReading[]> {
    const out: SignalReading[] = []

    for (const t of [0.5, 1, 1.5, 2, 2.5, 3]) {
      out.push({ name: `RES.UPPER.DEPTH.GT_${formatValueToken(t)}`, state: this.depth > t })
    }
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      out.push({ name: `SOIL.NORTH_FIELDS.MOISTURE.GT_${formatValueToken(t)}`, state: this.soil > t })
    }
    for (const t of [1000, 2500, 5000, 7500, 10000]) {
      out.push({ name: `WATER.TOTAL.GT_${t}`, state: this.water > t })
    }

    for (const gate of this.gates) {
      for (const pos of gate.positions ?? ['OPEN' as const]) {
        out.push({ name: gateSignalName('STATE', gate.id, pos), state: gate.acknowledged === pos })
      }
    }

    out.push({ name: 'WEATHER.DROUGHT.ACTIVE', state: !this.raining })
    return out
  }

  async listLevers(): Promise<SignalReading[]> {
    return [...this.levers.entries()].map(([name, state]) => ({ name, state }))
  }

  async setLever(name: string, state: boolean): Promise<void> {
    if (!this.levers.has(name)) throw new Error(`Unknown lever: ${name}`)
    this.levers.set(name, state)
    this.remapGates()
  }

  async switchLever(name: string, state: boolean): Promise<void> {
    // Tolerant: registers arbitrary (registry) lever names so listLevers reflects them.
    this.levers.set(name, state)
    this.remapGates()
  }

  // Mirror what the in-game wiring would do: the highest active position lever
  // wins, and the STATE adapter follows a couple of seconds later.
  private remapGates(): void {
    for (const gate of this.gates) {
      const positions = gate.positions ?? ['OPEN' as const]
      const active = positions.filter((pos) => this.levers.get(gateSignalName('CMD', gate.id, pos)))
      const target = active.length > 0 ? active[active.length - 1]! : gate.positions ? 0 : null
      if (target !== gate.commanded) {
        gate.commanded = target
        gate.ackAt = this.tick + 2
      }
    }
  }

  async ping(): Promise<boolean> {
    return true
  }
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}
