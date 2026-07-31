import type { Snapshot } from './types'

/**
 * PC audio hydraulic-event cues (docs/ROADMAP.md Phase 3).
 *
 * Distinct, synthesised tones for the events an operator needs to hear without
 * looking: alarm raise/clear, connection loss/restore, mode change, and gate
 * command confirm/fail. Everything is generated with the Web Audio API — no
 * audio files to ship, genuinely low-latency, entirely local to this PC.
 *
 * Edges are detected by diffing successive snapshots. The first snapshot only
 * establishes a baseline (silent) so a page load never dumps a backlog of cues.
 * While the integration is disabled the baseline is still advanced, so a later
 * re-enable doesn't replay everything that happened in between.
 */

type CueName = 'critical' | 'warning' | 'clear' | 'mode' | 'confirmed' | 'failed' | 'offline' | 'online'

interface Note {
  freq: number
  type: OscillatorType
  /** Offset from cue start, seconds. */
  at: number
  dur: number
  gain: number
  /** Optional glide target frequency by note end. */
  to?: number
}

// Each cue is a short motif. Kept deliberately terse and distinct so they read
// as a control-room annunciator, not a jingle.
const RECIPES: Record<CueName, Note[]> = {
  // Urgent, insistent triple beep.
  critical: [
    { freq: 988, type: 'square', at: 0, dur: 0.12, gain: 0.16 },
    { freq: 988, type: 'square', at: 0.16, dur: 0.12, gain: 0.16 },
    { freq: 988, type: 'square', at: 0.32, dur: 0.18, gain: 0.16 },
  ],
  // Attention double beep, softer than critical.
  warning: [
    { freq: 660, type: 'triangle', at: 0, dur: 0.14, gain: 0.13 },
    { freq: 660, type: 'triangle', at: 0.2, dur: 0.14, gain: 0.13 },
  ],
  // Reassuring rising two-tone — all clear.
  clear: [
    { freq: 523, type: 'sine', at: 0, dur: 0.14, gain: 0.12 },
    { freq: 784, type: 'sine', at: 0.12, dur: 0.2, gain: 0.12 },
  ],
  // Soft neutral blip for a mode change.
  mode: [{ freq: 587, type: 'sine', at: 0, dur: 0.11, gain: 0.1 }],
  // Pleasant confirming rise — command acknowledged.
  confirmed: [
    { freq: 659, type: 'sine', at: 0, dur: 0.1, gain: 0.11 },
    { freq: 988, type: 'sine', at: 0.1, dur: 0.15, gain: 0.11 },
  ],
  // Low buzz — command not confirmed.
  failed: [{ freq: 196, type: 'sawtooth', at: 0, dur: 0.3, gain: 0.13 }],
  // Descending glide — connection lost.
  offline: [{ freq: 440, type: 'sine', at: 0, dur: 0.24, gain: 0.12, to: 196 }],
  // Ascending glide — connection restored.
  online: [{ freq: 330, type: 'sine', at: 0, dur: 0.24, gain: 0.12, to: 660 }],
}

interface Baseline {
  alarms: Map<string, 'warning' | 'critical'>
  mode: string
  connected: boolean
  gates: Map<string, string>
}

export class AudioCues {
  private ctx: AudioContext | null = null
  private prev: Baseline | null = null
  private enabled = false
  /** Master gain; keeps cues present but not startling on a control-room display. */
  private readonly volume = 0.8

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (enabled) void this.ensureContext()
  }

  /** Call from a user gesture once so the browser lets us make sound (autoplay policy). */
  resume(): void {
    void this.ensureContext()
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // Still locked until the next user gesture — resume() will retry.
      }
    }
    return this.ctx
  }

  /** Diff this snapshot against the previous one and sound any resulting cues. */
  handle(snapshot: Snapshot): void {
    const next: Baseline = {
      alarms: new Map(snapshot.alarms.map((a) => [a.id, a.severity])),
      mode: snapshot.mode,
      connected: snapshot.connected,
      gates: new Map(snapshot.gates.map((g) => [g.id, g.status])),
    }
    const prev = this.prev
    this.prev = next
    if (!prev || !this.enabled) return // baseline only, or muted — advance state, stay silent

    let newCritical = false
    let newWarning = false
    for (const [id, severity] of next.alarms) {
      if (!prev.alarms.has(id)) {
        if (severity === 'critical') newCritical = true
        else newWarning = true
      }
    }
    let anyCleared = false
    for (const id of prev.alarms.keys()) if (!next.alarms.has(id)) anyCleared = true

    if (newCritical) this.play('critical')
    else if (newWarning) this.play('warning')
    else if (anyCleared && next.alarms.size === 0) this.play('clear')

    if (next.connected !== prev.connected) this.play(next.connected ? 'online' : 'offline')
    if (next.mode !== prev.mode) this.play('mode')

    for (const [id, status] of next.gates) {
      const before = prev.gates.get(id)
      if (before && before !== status) {
        if (status === 'confirmed') this.play('confirmed')
        else if (status === 'failed') this.play('failed')
      }
    }
  }

  private play(cue: CueName): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') {
      void this.ensureContext()
      return
    }
    const start = ctx.currentTime
    for (const note of RECIPES[cue]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = note.type
      const t0 = start + note.at
      const t1 = t0 + note.dur
      osc.frequency.setValueAtTime(note.freq, t0)
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, t1)
      const peak = Math.max(0.0002, note.gain * this.volume)
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, t1)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t1 + 0.03)
    }
  }
}
