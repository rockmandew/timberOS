import type { HueConfig } from '../config.js'
import type { Alarm, Snapshot } from '../types.js'
import type { Annunciator } from './annunciator.js'

/**
 * Philips Hue annunciator (docs/ROADMAP.md Phase 3). OUTPUT-ONLY: it colours a
 * Hue group to reflect overall waterworks status — never commands a gate.
 *
 * v1 drives one group as a whole-room status light (the roadmap's prudent
 * "whole-lamp first" posture, generalised from the Govee note): calm water-blue
 * in normal operations, amber on warnings, a red attention-flash on a critical
 * alarm, and mode-specific hues for drought / badtide / recovery. Credentials
 * come from the gateway .env; nothing here ever reaches the browser.
 */

interface Status {
  key: string
  hex: string
  /** Fire the bridge's attention blink (critical only). */
  alert?: boolean
}

export class HueAnnunciator implements Annunciator {
  readonly id = 'hue'
  private readonly base: string
  private readonly group: string
  private readonly transition: number
  private lastKey = ''
  private warned = false

  constructor(cfg: HueConfig, username: string) {
    this.base = `http://${cfg.bridgeIp}/api/${username}`
    this.group = cfg.group ?? '0'
    this.transition = Math.max(0, Math.round((cfg.transitionMs ?? 800) / 100))
  }

  onSnapshot(snapshot: Snapshot): void {
    const status = statusOf(snapshot)
    if (status.key === this.lastKey) return
    this.lastKey = status.key
    void this.apply(status)
  }

  onAlarm(alarm: Alarm, edge: 'raised' | 'cleared'): void {
    // A newly-raised critical alarm gets an immediate attention flash; the next
    // snapshot settles the group back to the steady status colour.
    if (edge === 'raised' && alarm.severity === 'critical') {
      void this.apply({ key: 'critical-flash', hex: '#e05252', alert: true })
    }
  }

  onMode(): void {
    // Mode is folded into the snapshot status; nothing extra to do here.
  }

  private async apply(status: Status): Promise<void> {
    const [x, y] = hexToXy(status.hex)
    const body: Record<string, unknown> = {
      on: true,
      bri: 200,
      xy: [x, y],
      transitiontime: this.transition,
    }
    if (status.alert) body['alert'] = 'lselect'
    try {
      const res = await fetch(`${this.base}/groups/${this.group}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      this.warned = false
    } catch (err) {
      if (!this.warned) {
        this.warned = true
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[hue] group ${this.group} update failed (${msg}); will keep trying on the next change.`)
      }
    }
  }
}

function statusOf(snapshot: Snapshot): Status {
  if (!snapshot.connected) return { key: 'offline', hex: '#5a5040' }
  if (snapshot.alarms.some((a) => a.severity === 'critical')) return { key: 'alarm-critical', hex: '#e05252' }
  if (snapshot.alarms.some((a) => a.severity === 'warning')) return { key: 'alarm-warning', hex: '#b9832f' }
  const hex = MODE_COLORS[snapshot.mode] ?? '#3e87c4'
  return { key: `mode-${snapshot.mode}`, hex }
}

const MODE_COLORS: Record<string, string> = {
  normal: '#3e87c4', // water blue
  drought_prep: '#c9a227', // brass amber
  drought_emergency: '#e07b2f', // deep orange
  badtide_isolation: '#a06fd6', // contaminated purple
  recovery: '#4a9d5c', // recovery green
  manual: '#cfc8b8', // neutral warm white
}

/** Convert #rrggbb to a Hue CIE xy pair (Philips gamma + wide-gamut matrix). */
export function hexToXy(hex: string): [number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return [0.3227, 0.329] // ~white fallback
  const toLinear = (c: number): number => {
    const s = c / 255
    return s > 0.04045 ? Math.pow((s + 0.055) / 1.055, 2.4) : s / 12.92
  }
  const r = toLinear(parseInt(m[1]!, 16))
  const g = toLinear(parseInt(m[2]!, 16))
  const b = toLinear(parseInt(m[3]!, 16))
  const X = r * 0.649926 + g * 0.103455 + b * 0.197109
  const Y = r * 0.234327 + g * 0.743075 + b * 0.022598
  const Z = r * 0.0 + g * 0.053077 + b * 1.035763
  const sum = X + Y + Z
  if (sum === 0) return [0.3227, 0.329]
  return [Number((X / sum).toFixed(4)), Number((Y / sum).toFixed(4))]
}
