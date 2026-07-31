# TimberOS Naming Convention

TimberOS derives the entire dashboard from the **names** of your in-game HTTP
Adapters and Levers. Get the names right in the save and the reservoirs, gauges,
gates, bands, and trends appear automatically — no per-signal UI code.

The gateway parses names with `gateway/src/naming.ts`. Anything that doesn't
match a pattern below is still surfaced, under **Unmapped Signals**, so nothing
is ever silently dropped.

## Adapters (game → TimberOS)

### Threshold sensors — `<DOMAIN>.<SITE>.<MEASURE>.GT_<value>`

A *family* of these collapses into one band gauge. The `.GT_` prefix splits the
sensor id from the threshold; `_` is the decimal separator.

```
RES.UPPER.DEPTH.GT_0_5      →  sensor "RES.UPPER.DEPTH", threshold 0.5
RES.UPPER.DEPTH.GT_1_0      →  same sensor, threshold 1.0
RES.UPPER.DEPTH.GT_2_5      →  same sensor, threshold 2.5
WATER.TOTAL.GT_10000        →  sensor "WATER.TOTAL", threshold 10000
```

Wire each threshold to a water/soil/count sensor set at that level. The gateway
sorts the family, finds the highest ON threshold and lowest OFF threshold, and
reports the band between them (e.g. **2.0–2.5 m**). A higher threshold ON while a
lower one is OFF is physically impossible, so it's flagged as a **FAULT** (check
the sensor wiring).

Keep it to **4–5 meaningful bands** per measurement, not twenty. The bands should
mean something operationally (Emergency / Rationing / Safe / Stable / Surplus),
not mark arbitrary percentages.

The same convention covers **colony stocks** — wire `FOOD.TOTAL.GT_*` and
`WATER.TOTAL.GT_*` families to the food and water totals. Listing either under a
`provisions` block in config (see `config/timberos.example.json`) turns it into a
production-vs-consumption balance with a suggested action, on top of the band
gauge — no extra naming needed.

### Gate acknowledgment — `STATE.FG.<SITE>.<NAME>.<position>`

Optional but recommended: an adapter that reads back a gate's *actual* position,
so a command can be **confirmed** rather than merely sent.

```
STATE.FG.UPPER.SPILLWAY.2_0     →  spillway is confirmed at 2.0 m
STATE.FG.BADWATER.DIVERSION.OPEN → diversion is confirmed open
```

Gates without any `STATE.*` family show a **no-ack** chip and their position is
assumed from the command, never confirmed.

## Levers (TimberOS → game)

### Gate commands — `CMD.FG.<SITE>.<NAME>.<position>`

`<position>` is either `OPEN` (a binary gate) or a value like `1_5` (a discrete
position). The gateway enforces **mutual exclusion**: commanding one position
turns every other position lever for that gate OFF first.

```
CMD.FG.UPPER.SPILLWAY.0_0
CMD.FG.UPPER.SPILLWAY.0_5
CMD.FG.UPPER.SPILLWAY.1_0   … up to 3_0   → discrete segmented control
CMD.FG.BADWATER.DIVERSION.OPEN            → single OPEN/CLOSED toggle
```

In-game, wire each `CMD.*` lever to the logic that drives the floodgate to that
height (Approach B in the design), or a single `.OPEN` lever to an open/closed
gate (Approach A).

## Value token format

| Token      | Value | Notes                                   |
|------------|-------|-----------------------------------------|
| `0_0`      | 0.0   | decimals use `_`                        |
| `2_5`      | 2.5   |                                         |
| `10000`    | 10000 | integers ≥ 10 need no `_0`              |
| `OPEN`     | —     | binary gate marker (levers/state only)  |

## What config adds on top

Names carry structure; `config/timberos.json` carries the rest — display labels,
units, full-scale for the percentage estimate, alarm thresholds, safety
interlocks, and the operating-mode list. See `config/timberos.example.json`.
