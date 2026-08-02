import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * User-configured device registry — the in-app alternative to the naming
 * convention. Instead of naming things precisely in-game and hand-editing
 * timberos.json, the operator registers each placed HTTP Lever / HTTP Adapter
 * from the dashboard's Wiring panel (picked from live discovery or by pasting a
 * URL) and it is persisted here (config/devices.json).
 *
 * Three device kinds:
 *  - gate:      an HTTP Lever driven on/off via the game's /api/switch-on|off/{name}.
 *  - signal:    an HTTP Adapter surfaced as a named boolean.
 *  - reservoir: several threshold HTTP Adapters grouped into one % band gauge.
 */

export interface GateDevice {
  id: string
  label: string
  /** Exact in-game HTTP Lever name (drives /api/switch-on|off/{name}). */
  lever: string
  /** HTTP method the game's lever endpoints expect (its panel default is GET). */
  method?: 'GET' | 'POST'
  /** Require a two-step confirm before commanding. */
  confirmRequired?: boolean
}

export interface SignalDevice {
  id: string
  label: string
  /** Exact in-game HTTP Adapter name. */
  adapter: string
}

export interface ReservoirThreshold {
  /** Exact in-game HTTP Adapter name whose ON means "level is above `value`". */
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

export function emptyRegistry(): DeviceRegistry {
  return { gates: [], signals: [], reservoirs: [] }
}

export function loadRegistry(path: string): DeviceRegistry {
  if (!existsSync(path)) return emptyRegistry()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<DeviceRegistry>
    return normalizeRegistry(parsed)
  } catch {
    return emptyRegistry()
  }
}

export function saveRegistry(path: string, registry: DeviceRegistry): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(normalizeRegistry(registry), null, 2), 'utf8')
}

const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'device'

/**
 * Coerce arbitrary input into a valid registry (drops malformed entries) and
 * guarantee every device has a non-empty, unique id — derived from the nickname
 * (or the underlying lever/adapter) when one isn't supplied, so direct API use
 * is as safe as going through the dashboard.
 */
export function normalizeRegistry(input: Partial<DeviceRegistry> | null | undefined): DeviceRegistry {
  const reg = emptyRegistry()
  if (!input || typeof input !== 'object') return reg

  const used = new Set<string>()
  const uid = (preferred: string | undefined, fallback: string): string => {
    let base = preferred && preferred.trim() ? slug(preferred) : slug(fallback)
    let id = base
    let n = 2
    while (used.has(id)) id = `${base}-${n++}`
    used.add(id)
    return id
  }

  for (const g of input.gates ?? []) {
    if (g && typeof g.lever === 'string' && g.lever) {
      const id = uid(g.id || g.label, g.lever)
      reg.gates.push({
        id,
        label: g.label ?? id,
        lever: g.lever,
        method: g.method === 'POST' ? 'POST' : 'GET',
        confirmRequired: Boolean(g.confirmRequired),
      })
    }
  }
  for (const s of input.signals ?? []) {
    if (s && typeof s.adapter === 'string' && s.adapter) {
      const id = uid(s.id || s.label, s.adapter)
      reg.signals.push({ id, label: s.label ?? id, adapter: s.adapter })
    }
  }
  for (const r of input.reservoirs ?? []) {
    if (r && Array.isArray(r.thresholds)) {
      const thresholds = r.thresholds
        .filter((t) => t && typeof t.adapter === 'string' && Number.isFinite(t.value))
        .map((t) => ({ adapter: t.adapter, value: Number(t.value) }))
        .sort((a, b) => a.value - b.value)
      if (thresholds.length === 0) continue
      const id = uid(r.id || r.label, 'reservoir')
      reg.reservoirs.push({ id, label: r.label ?? id, unit: r.unit, thresholds })
    }
  }
  return reg
}

/** Every in-game adapter/lever name the registry claims, so the engine can
 * exclude them from naming-convention parsing and the "unmapped" list. */
export function claimedNames(registry: DeviceRegistry): { adapters: Set<string>; levers: Set<string> } {
  const adapters = new Set<string>()
  const levers = new Set<string>()
  for (const g of registry.gates) levers.add(g.lever)
  for (const s of registry.signals) adapters.add(s.adapter)
  for (const r of registry.reservoirs) for (const t of r.thresholds) adapters.add(t.adapter)
  return { adapters, levers }
}

/**
 * Extract the exact lever/adapter name from a URL pasted out of the game — e.g.
 * "http://localhost:8080/api/switch-on/HTTP%20Lever%201" → "HTTP Lever 1".
 * Handles switch-on/switch-off/levers/adapters paths. Returns null if it can't.
 */
export function nameFromUrl(url: string): string | null {
  try {
    const path = url.includes('://') ? new URL(url).pathname : url
    const m = path.match(/\/api\/(?:switch-on|switch-off|levers|adapters)\/([^/?#]+)\/?$/)
    if (m && m[1]) return decodeURIComponent(m[1])
    return null
  } catch {
    return null
  }
}
