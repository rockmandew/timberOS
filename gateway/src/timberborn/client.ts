import type { EndpointsConfig } from '../config.js'
import type { SignalReading } from '../types.js'

/**
 * Abstraction over the Timberborn HTTP API so the engine can run against
 * the real game or the built-in simulator interchangeably.
 */
export interface TimberbornApi {
  readonly simulated: boolean
  listAdapters(): Promise<SignalReading[]>
  listLevers(): Promise<SignalReading[]>
  setLever(name: string, state: boolean): Promise<void>
  /**
   * Drive an HTTP Lever by its exact in-game name via the game's real endpoints
   * (/api/switch-on|switch-off/{name}). This is how registered gate devices are
   * commanded — the game exposes two GET URLs, not a single templated setter.
   */
  switchLever(name: string, state: boolean, method?: 'GET' | 'POST'): Promise<void>
  ping(): Promise<boolean>
}

/**
 * Client for the game's built-in HTTP integration (Timberborn owns :8080).
 *
 * Endpoint paths and response shapes are configurable because the API surface
 * should be verified against your game version first — run `npm run probe`
 * (see probe.ts) and adjust config/endpoints accordingly. The response parser
 * is deliberately tolerant: it accepts arrays of objects with name/id and
 * state/on/value keys, or a flat { name: boolean } map.
 */
export class HttpTimberbornClient implements TimberbornApi {
  readonly simulated = false

  constructor(private readonly endpoints: EndpointsConfig) {}

  async listAdapters(): Promise<SignalReading[]> {
    return this.fetchSignals(this.endpoints.listAdapters)
  }

  async listLevers(): Promise<SignalReading[]> {
    return this.fetchSignals(this.endpoints.listLevers)
  }

  async setLever(name: string, state: boolean): Promise<void> {
    const path = this.endpoints.setLever
      .replace('{name}', encodeURIComponent(name))
      .replace('{state}', state ? 'true' : 'false')
    const res = await fetch(new URL(path, this.endpoints.baseUrl), { method: 'POST' })
    if (!res.ok) {
      throw new Error(`setLever(${name}, ${state}) → HTTP ${res.status}`)
    }
  }

  async switchLever(name: string, state: boolean, method: 'GET' | 'POST' = 'GET'): Promise<void> {
    const verb = state ? 'switch-on' : 'switch-off'
    const path = `/api/${verb}/${encodeURIComponent(name)}`
    const res = await fetch(new URL(path, this.endpoints.baseUrl), { method })
    if (!res.ok) {
      throw new Error(`switchLever(${name}, ${state}) → HTTP ${res.status}`)
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(new URL(this.endpoints.listAdapters, this.endpoints.baseUrl))
      return res.ok
    } catch {
      return false
    }
  }

  private async fetchSignals(path: string): Promise<SignalReading[]> {
    const res = await fetch(new URL(path, this.endpoints.baseUrl))
    if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`)
    return normalizeSignals(await res.json())
  }
}

/** Accepts several plausible payload shapes and normalizes to SignalReading[]. */
export function normalizeSignals(payload: unknown): SignalReading[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      if (typeof entry === 'string') return [{ name: entry, state: false }]
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>
        const name = obj['name'] ?? obj['id'] ?? obj['adapter'] ?? obj['lever']
        const state = obj['state'] ?? obj['on'] ?? obj['value'] ?? obj['isOn']
        if (typeof name === 'string') return [{ name, state: toBool(state) }]
      }
      return []
    })
  }
  if (payload && typeof payload === 'object') {
    // Either a flat { name: boolean } map or a wrapper like { adapters: [...] }.
    const obj = payload as Record<string, unknown>
    for (const key of ['adapters', 'levers', 'items', 'entries']) {
      if (Array.isArray(obj[key])) return normalizeSignals(obj[key])
    }
    return Object.entries(obj)
      .filter(([, v]) => typeof v === 'boolean' || v === 'true' || v === 'false')
      .map(([name, v]) => ({ name, state: toBool(v) }))
  }
  return []
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === 'on'
}
