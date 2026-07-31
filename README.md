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

## Quick start

```bash
npm install

# 1. Develop with no game running — a small colony simulator drives everything:
npm run gateway:sim      # gateway on :8081 against the simulator
npm run dashboard        # dashboard on :3000  (open it)

# 2. Against the real game — verify the API shape FIRST:
npm run probe                 # discover Timberborn's endpoint paths & payloads
cp config/timberos.example.json config/timberos.json
#   …edit config/timberos.json "endpoints" to match what probe reported…
npm run gateway
npm run dashboard
```

The simulator models one water system (reservoir drains through spillway +
irrigation, soil tracks irrigation, weather cycles wet/drought) and acknowledges
gate commands on `STATE.*` adapters just like real in-game wiring would — enough
to build and demo the entire supervisory loop offline.

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
  src/integrations/ annunciator interface (console impl in v1)
dashboard/   React + Vite + Zustand supervisory UI
config/      example config + naming-driven mappings
docs/        NAMING.md (the contract) + ROADMAP.md (recommendations & phases)
```

## Status

v0.2 — Phases 1 & 2 complete: the full local supervisory loop (discovery → bands →
gates → interlocks → alarms → events) plus the config linter, the sensor↔gate
relationship engine ("…drying *because* the irrigation gate is closed"), the
contamination network view, and event-store trend ribbons — all working against
the simulator, with a control-room dashboard whose status palette is validated
for color-blindness and contrast. Hardware annunciators (Hue / Govee / PC audio)
are next. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the phased plan and the
design recommendations behind it.
