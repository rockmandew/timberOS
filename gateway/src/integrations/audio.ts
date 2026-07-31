import type { IntegrationKind } from '../types.js'
import type { Annunciator } from './annunciator.js'

/**
 * PC audio hydraulic-event cues (docs/ROADMAP.md Phase 3). OUTPUT-ONLY.
 *
 * Unlike Hue/Govee, the speakers live on the *dashboard PC* — the 32-inch
 * supervisory display — not on the headless gateway. The cues are therefore
 * synthesised and played in the browser with the Web Audio API, which is
 * genuinely low-latency, local, and needs no native audio dependency.
 *
 * This gateway-side entry exists so PC audio appears in the one integrations
 * registry alongside the others and shares a single source of truth for its
 * on/off state (mirrored to every client over the snapshot). The gateway has no
 * speakers, so the observer hooks are deliberately no-ops — the dashboard reads
 * `enabled` from the snapshot and does the actual sounding.
 */
export class AudioAnnunciator implements Annunciator {
  readonly id = 'audio'
  readonly label = 'PC audio cues'
  readonly kind: IntegrationKind = 'audio'
  readonly available = true
  readonly detail = 'Played on the dashboard PC (Web Audio)'

  constructor(public enabled: boolean) {}

  onSnapshot(): void {
    // No speakers on the gateway; the dashboard sounds the cues.
  }

  onAlarm(): void {
    // See onSnapshot — cues are browser-side.
  }

  onMode(): void {
    // See onSnapshot — cues are browser-side.
  }
}
