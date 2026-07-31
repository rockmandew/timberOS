import type { Alarm, IntegrationKind, Snapshot } from '../types.js'

/**
 * Annunciators are the physical/ambient outputs: Hue groups, the Govee
 * status tower, Discord channels, Alexa announcements, PC audio cues.
 *
 * v1 ships the console annunciator, the Hue light, and the PC-audio cues; the
 * interface is the seam every integration plugs into. Annunciators are
 * OUTPUT-ONLY — they observe state, they never command gates.
 *
 * Each carries its own live `enabled` flag so the operator can switch an
 * integration on or off from the dashboard without restarting the gateway. The
 * engine skips the observer hooks of any disabled annunciator; the on/off state
 * is mirrored to every client through the snapshot's `integrations` list.
 */
export interface Annunciator {
  readonly id: string
  /** Human name shown next to the dashboard toggle. */
  readonly label: string
  readonly kind: IntegrationKind
  /** Live on/off — flipped from the dashboard, honoured on the very next event. */
  enabled: boolean
  /** Configured and usable right now (credentials present, device addressable). */
  readonly available: boolean
  /** One-line status shown under the toggle. */
  readonly detail: string
  /** Called after every accepted state change (debounced upstream). */
  onSnapshot(snapshot: Snapshot): void | Promise<void>
  /** Called on alarm raise/clear edges only, never on steady state. */
  onAlarm(alarm: Alarm, edge: 'raised' | 'cleared'): void | Promise<void>
  /** Called when the operating mode changes. */
  onMode(mode: string): void | Promise<void>
}

export class ConsoleAnnunciator implements Annunciator {
  readonly id = 'console'
  readonly label = 'Console log'
  readonly kind: IntegrationKind = 'console'
  enabled = true
  readonly available = true
  readonly detail = 'Gateway stdout'

  onSnapshot(): void {
    // Steady-state snapshots stay quiet — ambient outputs shouldn't chatter.
  }

  onAlarm(alarm: Alarm, edge: 'raised' | 'cleared'): void {
    const badge = edge === 'raised' ? (alarm.severity === 'critical' ? '🔴' : '🟠') : '🟢'
    console.log(`${badge} [${edge.toUpperCase()}] ${alarm.message}`)
  }

  onMode(mode: string): void {
    console.log(`◈ Operating mode → ${mode}`)
  }
}
