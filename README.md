# TimberOS

A SCADA-style **waterworks command center** for [Timberborn](https://store.steampowered.com/app/1062090/Timberborn/).
TimberOS turns the game's built-in HTTP integration into a hydroelectric-control-room
dashboard: threshold-band gauges, discrete floodgate controls with safety
interlocks, operating modes, alarms, and an event log — with Hue / Govee /
Discord / Alexa annunciators layered on later.

> **Displays.** The 49-inch ultrawide stays on the game. TimberOS runs full-screen
> on the 32-inch as the supervisory display. A transparent game-overlay is a later
> phase (see the roadmap) — v1 deliberately doesn't cover the game.

## Why it looks the way it does

Timberborn's HTTP Adapters expose **booleans**, not numeric sensors. TimberOS
embraces that: you place several threshold sensors (`…GT_0_5`, `…GT_1_0`, …) and
TimberOS collapses each family into a **band** — "Upper Reservoir: 2.0–2.5 m,
~75%, falling" — honest about being a band, never faking a needle. See
[`docs/NAMING.md`](docs/NAMING.md).

## Ports

Timberborn owns `:8080`, so nothing else may bind it.

| Service            | URL                        |
|--------------------|----------------------------|
| Timberborn HTTP API | `http://localhost:8080`   |
| TimberOS gateway   | `http://localhost:8081`    |
| React dashboard    | `http://localhost:3000`    |

## Architecture

```
Timberborn (:8080)
  ├── HTTP Adapters ──┐  (game → out, boolean)
  └── HTTP Levers ◀───┤  (out → game, boolean)
                      │
             TimberOS Gateway (:8081)   Node + TypeScript + Fastify
             ├── discovery + naming parser
             ├── band telemetry + trends
             ├── gate state machine (idle→pending→confirmed/failed)
             ├── safety interlocks + mutual exclusion
             ├── alarms + operating modes
             ├── SQLite event store
             └── Annunciator interface  (Hue / Govee / Discord / Alexa — later)
                      │  REST + WebSocket
             React dashboard (:3000)   the 32-inch supervisory display
```

The **gateway is the only thing that talks to the game** — every command source
(dashboard, later Alexa/rules) funnels through one safety chokepoint. Integration
credentials live only in the gateway, never in the browser bundle.

**Colony data feed (optional).** The gateway also *reads* live colony telemetry from the
[timberOS Data Console](https://github.com/rockmandew/timberOSDataConsole) mod at
`http://localhost:8080/timberos/v1/snapshot` when it's available — population, resources, weather,
and power. It's read-only and never sends commands. The data is served at `GET /api/colony` and
rides the `/api/state` payload and WebSocket snapshot under `colony`. When the mod isn't present the
feed reports `unavailable` and everything else is unaffected. Configure it under `dataConsole` in
`config/timberos.json` (enabled by default).

## Setup & run — start here (zero experience needed)

Follow these in order, copy-pasting each command exactly. **You can run TimberOS entirely on its
own** — a built-in simulator stands in for the game, so you can see the whole dashboard working
before touching Timberborn.

> TimberOS and the **[timberOS Data Console](https://github.com/rockmandew/timberOSDataConsole)**
> mod are independent but better together. TimberOS runs fine without it; when the mod is installed
> and Timberborn is running, TimberOS automatically shows your **live colony data** too (see
> [Step 4](#step-4--optional-show-live-colony-data)).

### Step 1 — Install the free tools you need (one time)

1. **Node.js LTS (version 22.5 or newer)** — https://nodejs.org → click the **LTS** button, run the
   installer, accept defaults. (TimberOS uses Node's built-in database, which needs 22.5+.)
2. **Git** — https://git-scm.com/download/win → accept all defaults.

After both finish, **close and reopen** any terminal window.

### Step 2 — Download and install TimberOS

Open **PowerShell** (press Start, type `PowerShell`, hit Enter) and run these one at a time:

```powershell
cd $HOME\Downloads
git clone https://github.com/rockmandew/timberOS.git
cd timberOS
npm install
```

`npm install` takes a minute or two and downloads everything TimberOS needs.

### Step 3 — Run it (with the built-in simulator, no game required)

You need **two** PowerShell windows — one for the gateway (the brain), one for the dashboard (the
screen). In the **first** window:

```powershell
npm run gateway:sim
```

Leave that running. Open a **second** PowerShell window, `cd` back into the project, and start the
dashboard:

```powershell
cd $HOME\Downloads\timberOS
npm run dashboard
```

The dashboard prints a line like `Local:  http://localhost:3000/`. Open **http://localhost:3000** in
your browser — that's TimberOS, fully live against the simulator. To stop either piece, click its
window and press **Ctrl+C**.

### Step 4 — (Optional) Show live colony data

To replace the simulator's guesses with your **real** colony numbers (population, resources, weather,
power):

1. Install the **[timberOS Data Console](https://github.com/rockmandew/timberOSDataConsole)** mod by
   following that project's "Setup & run" section (it's a one-command install), then launch
   Timberborn and load a settlement.
2. Restart TimberOS pointing at the game instead of the simulator. In your first window press
   **Ctrl+C**, then run:
   ```powershell
   npm run gateway
   ```
   (No config editing needed — TimberOS looks for the mod at `http://localhost:8080` automatically.)

The dashboard now carries your live colony data alongside the waterworks view. If the mod isn't
running, TimberOS still works — it just marks colony data as unavailable. You can check the raw feed
any time at **http://localhost:8081/api/colony**.

> **Waterworks controls with the real game (advanced).** The floodgate/lever half of TimberOS talks
> to Timberborn's HTTP Adapters, whose exact paths vary. Verify them first with `npm run probe`,
> then `Copy-Item config/timberos.example.json config/timberos.json` and edit the `endpoints` block
> to match what probe reported. The colony data feed in Step 4 needs none of this.

The simulator models one water system (reservoir drains through spillway + irrigation, soil tracks
irrigation, weather cycles wet/drought) and acknowledges gate commands on `STATE.*` adapters just
like real in-game wiring would — enough to build and demo the entire supervisory loop offline.

## Configuration

- **Naming convention** ([`docs/NAMING.md`](docs/NAMING.md)) — how adapter/lever
  names become reservoirs, gauges, and gates. This is the contract.
- **`config/timberos.json`** — labels, units, alarm thresholds, safety
  interlocks, and operating modes. Copy from `config/timberos.example.json`.
  Unmatched signals are surfaced under *Unmapped Signals*, never dropped.

## Layout

```
gateway/     Node + TypeScript gateway (the brain)
  src/timberborn/   API client + offline simulator
  src/telemetry/    band derivation, trends, alarms
  src/rules/        safety interlocks
  src/integrations/ annunciator interface + console / Hue / PC-audio outputs
dashboard/   React + Vite + Zustand supervisory UI
config/      example config + naming-driven mappings
docs/        NAMING.md (the contract) + ROADMAP.md (recommendations & phases)
```

## Annunciators & integration toggles

Ambient outputs — Hue, PC audio, and (later) Govee / Discord / Alexa — are all
the same kind of thing: an output that *observes* state and never commands a
gate. Each is registered in one place and gets a live **toggle switch** in the
dashboard's *Integrations* panel, so you can turn any of them on or off at will
without restarting the gateway. The on/off state rides the snapshot, so flipping
a toggle on one display reflects on every other one within a tick. The
`enabled` flags in `config/timberos.json` are only the *initial* state.

- **PC audio cues** play in the dashboard browser via the Web Audio API — no
  audio files, genuinely low-latency and local to the supervisory PC. Distinct
  synthesised tones sound for the events you need to hear without looking:
  critical vs. warning alarm raised, all-clear, connection lost/restored,
  operating-mode change, and gate command confirmed/failed. (Browsers require a
  first click/keypress before audio can start — the cues arm on your first
  interaction with the dashboard.)
- **Philips Hue** colours a group to reflect overall status; its credential
  (`HUE_USERNAME`) lives only in the gateway `.env`, never the browser. The
  toggle shows it as *unavailable* until that key is set.

## Status

v0.3 — Phases 1–3 (in progress): the full local supervisory loop (discovery →
bands → gates → interlocks → alarms → events) plus the config linter, the
sensor↔gate relationship engine ("…drying *because* the irrigation gate is
closed"), the contamination network view, and event-store trend ribbons — all
working against the simulator, with a control-room dashboard whose status
palette is validated for color-blindness and contrast. Annunciators are landing:
the Hue status light, the PC-audio hydraulic-event cues, and per-integration
dashboard toggles are in; Govee / Discord / Alexa are next. See
[`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan and the design
recommendations behind it.
