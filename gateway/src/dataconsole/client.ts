/**
 * Colony feed — consumes the **timberOS Data Console** mod's telemetry endpoint
 * (https://github.com/rockmandew/timberOSDataConsole).
 *
 * The Data Console is a separate Timberborn mod that serves real colony telemetry
 * (population, resources, weather, power) as JSON on the game's native HTTP API.
 * When it's present, TimberOS shows live colony data alongside the waterworks view.
 * When it's absent, this feed simply reports `unavailable` and TimberOS runs exactly
 * as before — the two products are independent but better together.
 *
 * This poller never blocks the gateway: it fetches on its own interval, tolerates a
 * missing endpoint, and marks data `stale` if the mod stops responding.
 */

export type ColonyFeedStatus = 'connected' | 'stale' | 'unavailable' | 'disabled'

/** The telemetry envelope served at /timberos/v1/snapshot (Data Console schema 1.x). */
export interface ColonySnapshot {
  schemaVersion: string
  settlementId: string | null
  sequence: number
  capturedAt: string
  gameTime: { cycle: number; cycleDay: number; partialCycleDay: number } | null
  payload: {
    game: {
      gameVersion: string | null
      modVersion: string
      factionId: string | null
      settlementName: string | null
    } | null
    population: Record<string, number | null> | null
    resources: Array<{ goodId: string; amount: number; capacity: number }> | null
    weather: Record<string, unknown> | null
    power: Record<string, unknown> | null
    // Added in Data Console schema 1.2.0 (optional; older mods omit them).
    production?: Record<string, unknown> | null
    water?: Record<string, unknown> | null
    collectors: Array<{ name: string; status: string; error: string | null }>
  }
}

export interface ColonyFeedState {
  status: ColonyFeedStatus
  url: string
  /** Latest validated snapshot, or null if none has been received. */
  colony: ColonySnapshot | null
  /** Wall-clock ms of the last successful fetch, or null. */
  lastUpdated: number | null
  /** Short human message when status is not "connected". */
  message: string | null
}

export interface ColonyFeedOptions {
  enabled: boolean
  url: string
  pollMs: number
  /** Treat data older than this as stale (defaults to 4× pollMs). */
  staleAfterMs?: number
}

export class ColonyFeed {
  private readonly enabled: boolean
  private readonly url: string
  private readonly pollMs: number
  private readonly staleAfterMs: number

  private timer: ReturnType<typeof setInterval> | null = null
  private colony: ColonySnapshot | null = null
  private lastUpdated: number | null = null
  private lastError: string | null = null

  constructor(options: ColonyFeedOptions) {
    this.enabled = options.enabled
    this.url = options.url
    this.pollMs = options.pollMs
    this.staleAfterMs = options.staleAfterMs ?? options.pollMs * 4
  }

  start(): void {
    if (!this.enabled || this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.pollMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getState(): ColonyFeedState {
    if (!this.enabled) {
      return { status: 'disabled', url: this.url, colony: null, lastUpdated: null, message: 'Colony feed disabled in config.' }
    }
    let status: ColonyFeedStatus
    let message: string | null = null
    if (this.lastUpdated === null) {
      status = 'unavailable'
      // Keep the raw fetch error internal; show non-technical guidance.
      message = 'Waiting for the Data Console mod. Is Timberborn running with the mod installed and a settlement loaded?'
    } else if (Date.now() - this.lastUpdated > this.staleAfterMs) {
      status = 'stale'
      message = 'No fresh telemetry recently — the game may be closed or the save unloaded.'
    } else {
      status = 'connected'
    }
    return { status, url: this.url, colony: this.colony, lastUpdated: this.lastUpdated, message }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch(this.url, { signal: AbortSignal.timeout(Math.min(this.pollMs, 3000)) })
      if (res.status === 503) {
        // Mod is loaded but no settlement snapshot yet — not an error.
        this.lastError = 'Data Console is up but no settlement is loaded yet.'
        return
      }
      if (!res.ok) {
        this.lastError = `Data Console responded HTTP ${res.status}.`
        return
      }
      const body = (await res.json()) as unknown
      const parsed = validateColonySnapshot(body)
      if (!parsed) {
        this.lastError = 'Data Console returned an unexpected payload shape.'
        return
      }
      this.colony = parsed
      this.lastUpdated = Date.now()
      this.lastError = null
    } catch (err) {
      // Endpoint unreachable (mod not installed / game closed) — expected, stay quiet.
      this.lastError = err instanceof Error ? err.message : String(err)
    }
  }
}

/** Tolerant shape check — enough to trust the fields TimberOS reads, no hard dependency. */
export function validateColonySnapshot(input: unknown): ColonySnapshot | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (typeof obj['schemaVersion'] !== 'string') return null
  if (!obj['payload'] || typeof obj['payload'] !== 'object') return null
  return obj as unknown as ColonySnapshot
}
