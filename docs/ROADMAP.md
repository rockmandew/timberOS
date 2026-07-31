# TimberOS Roadmap & Design Notes

This captures the build order and — more importantly — a set of **recommended
adjustments** to the original concept. The concept is strong; these notes are
about de-risking it and sequencing the work so each phase is usable on its own.

## Recommendations on the original plan

### 1. Verify the API surface before writing a line of integration — done first, on purpose
The single biggest unknown is the exact shape of Timberborn's HTTP API (paths,
payload JSON, whether `setLever` is GET or POST, auth). The plan assumes
list/read/switch/color; reality may differ by game version. `npm run probe`
(shipped in v0.1) hits a list of candidate endpoints and prints raw payloads so
you can set `config/endpoints` to match. **Do this before trusting anything
else.** The client's `normalizeSignals()` is deliberately tolerant of several
payload shapes so a wrong guess degrades gracefully instead of crashing.

### 2. Make the naming convention the contract, and lint it
The plan's biggest strength is the stable-identifier scheme. TimberOS leans on it
fully: the dashboard is *generated* from names (see `docs/NAMING.md`), so there's
no per-sensor code to write. Recommendation: add a **config linter** (planned,
Phase 2) that cross-checks the discovered adapters/levers against config and
warns on: a gate command with no matching `STATE.*` ack, an interlock referencing
a missing sensor, a threshold family with a gap. This turns wiring mistakes into
a dashboard warning instead of a silent wrong reading.

### 3. Treat the Boolean limit as a modeling choice, not a workaround
Band telemetry is genuinely good enough — but only if the UI never *implies*
false precision. Two rules baked into the code:
- Alarms fire on the band's **guaranteed ceiling** (`hi`), never on a guess. We
  only alarm when we *know* the value is that low.
- Interlocks check the band's **guaranteed floor/ceiling**, so a safety rule can
  never be satisfied by an optimistic estimate.
Recommendation: keep bands coarse (4–5) at first. You can always add thresholds;
you can't easily un-teach players to read a 20-segment bar as exact.

### 4. Separate "command sent" from "command confirmed" everywhere
The plan mentions highlighting unacknowledged commands; make it structural. Every
gate is `idle → pending → confirmed | failed`, driven by `STATE.*` acks with a
timeout. A gate with no ack family is explicitly labeled **no-ack** rather than
shown as if confirmed. This is what makes it feel like SCADA and not a remote.

### 5. Interlocks and modes belong in the gateway, never the UI
All safety logic (mutual exclusion, interlocks, confirm-required, mode state)
lives server-side in the engine. The React app only expresses *intent*. This
matters because you'll eventually have **three** command sources — dashboard,
Alexa macros, and rules — and they must all pass through the same safety gate.
The HTTP API is the one chokepoint; keep it that way.

### 6. Reframe the annunciators as one interface, added last
Hue, Govee, Discord, Alexa, and PC audio are all the **same kind of thing**: an
output that observes state and never commands a gate. v0.1 ships the
`Annunciator` interface with a console implementation; the hardware ones plug in
without touching the engine. Recommendation on ordering — the original plan's
"Discord last" instinct is right; generalize it to **all** annunciators. Get the
local supervisory loop trustworthy first, then decorate.

Because they're one interface, they also share one **live on/off control**: each
annunciator carries an `enabled` flag the engine checks before dispatching, and
the dashboard's *Integrations* panel flips it at runtime (`POST
/api/integrations/:id`) with no gateway restart. The state rides the snapshot's
`integrations` list, so every display stays in sync. PC audio is the one
annunciator that *plays* client-side (Web Audio on the supervisory PC, where the
speakers are), but it still registers as a normal integration so it shares the
same single toggle and enable-state plumbing as the LAN devices.

### 7. One thing to drop from v1: RGBIC segment-mapping on the Govee tower
The vertical five-zone status column is lovely but depends on per-model LAN
support for addressable segments, which varies. Recommendation: ship the Govee
tower first as **whole-lamp** status (solid/breathing/rotating color = overall
mode), and only attempt segment mapping once you've confirmed the Table Lamp 2
exposes it over LAN. Don't let an uncertain hardware feature gate the release.

### 8. Add a "safe by default" posture to Alexa/voice
The plan already says not to let a misheard phrase drain a reservoir. Encode it:
voice and any external trigger hit the **same** `commandGate` path, so
`confirmRequired` gates (diversion, contamination inlet) reject a bare voice
command and demand the confirm flag — which a voice macro simply won't send.
High-risk controls are therefore un-reachable by voice without an explicit,
separate confirm step. Good default; keep it.

## Build phases

| Phase | Deliverable | Status |
|------|-------------|--------|
| **0** | API probe; endpoint config; tolerant client | ✅ v0.1 |
| **1** | Gateway: discovery, band telemetry, trends, gates, interlocks, alarms, event store, WS | ✅ v0.1 |
| **1** | Dashboard: band gauges, gate controls, alarms, events, modes, unmapped signals | ✅ v0.1 |
| **1** | Simulator for game-free development | ✅ v0.1 |
| **2** | Config linter; sensor↔gate relationship engine ("North Fields drying *because* …") | ✅ v0.2 |
| **2** | Contamination network view (nodes + isolated-route animation) | ✅ v0.2 |
| **2** | Trend charts from the event store (SVG, no false precision) | ✅ v0.2 |
| **3** | Hue annunciator (whole-group status color; per-role split later) | ✅ v0.3 |
| **3** | Per-integration dashboard toggles (live enable/disable, no restart) | ✅ v0.3 |
| **3** | PC audio hydraulic-event cues (low latency, local; Web Audio in the dashboard) | ✅ v0.3 |
| **3** | Govee tower annunciator (whole-lamp first, segments if LAN allows) | ▢ |
| **4** | Discord: status embed, #waterworks log, #alerts, #engineering-log | ▢ |
| **4** | Alexa: announcement webhook + safe voice macros | ▢ |
| **5** | 49-inch transparent overlay (Electron/Tauri), #beaver-times digest | ▢ |

## Architectural guardrails (don't regress these)
- **The gateway is the only thing that talks to the game.** One chokepoint for
  every command source; all safety lives here.
- **Credentials never reach the browser.** Hue/Govee/Discord tokens stay in the
  gateway `.env`, never in the React bundle.
- **Names are the contract.** New telemetry = new adapters named per
  `docs/NAMING.md`, not new UI code.
- **Never imply precision the bands don't have.** Bands, ranges, and "~%" only.
- **Annunciators observe; they never command.**
