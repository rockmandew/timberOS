import { type DragEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTimberOS } from '../../store'
import type { DeviceRegistry, GateDevice, ReservoirDevice, SignalDevice } from '../../types'

/**
 * In-app device wiring — the alternative to the naming convention. Scan the game
 * for placed HTTP Levers/Adapters, then either drag the discovered chips into
 * groups (a lever → a gate, an adapter → a signal or a reservoir threshold) or
 * use the click/paste controls (the keyboard-accessible path). Persisted to
 * config/devices.json via PUT /api/devices; applied live.
 */

export const slug = (s: string): string =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'device'

/** Extract a lever/adapter name from a URL pasted out of the game. */
export function nameFromUrl(url: string): string | null {
  try {
    const path = url.includes('://') ? new URL(url).pathname : url
    const m = path.match(/\/api\/(?:switch-on|switch-off|levers|adapters)\/([^/?#]+)\/?$/)
    return m && m[1] ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

const empty: DeviceRegistry = { gates: [], signals: [], reservoirs: [] }

/** Assign stable slug ids from labels (deduped) just before saving. */
export function withIds(reg: DeviceRegistry): DeviceRegistry {
  const used = new Set<string>()
  const uid = (label: string): string => {
    const base = slug(label)
    let id = base
    let n = 2
    while (used.has(id)) id = `${base}-${n++}`
    used.add(id)
    return id
  }
  return {
    gates: reg.gates.filter((g) => g.lever).map((g) => ({ ...g, id: uid(g.label || g.lever) })),
    signals: reg.signals.filter((s) => s.adapter).map((s) => ({ ...s, id: uid(s.label || s.adapter) })),
    reservoirs: reg.reservoirs
      .map((r) => ({ ...r, thresholds: r.thresholds.filter((t) => t.adapter && Number.isFinite(t.value)) }))
      .filter((r) => r.thresholds.length > 0)
      .map((r) => ({ ...r, id: uid(r.label || 'reservoir') })),
  }
}

// ── Drag and drop plumbing ────────────────────────────────────────────────

const DND = 'application/timberos-device'
type Dragged = { kind: 'lever' | 'adapter'; name: string }

function startDrag(e: DragEvent, d: Dragged): void {
  e.dataTransfer.setData(DND, JSON.stringify(d))
  e.dataTransfer.effectAllowed = 'copy'
}
function readDrag(e: DragEvent): Dragged | null {
  try {
    const s = e.dataTransfer.getData(DND)
    return s ? (JSON.parse(s) as Dragged) : null
  } catch {
    return null
  }
}
function allowDrop(e: DragEvent): void {
  if (e.dataTransfer.types.includes(DND)) e.preventDefault()
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function WiringPanel() {
  const { devices, discovery, fetchWiring, scanDevices, saveWiring } = useTimberOS()
  const [draft, setDraft] = useState<DeviceRegistry | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [dragging, setDragging] = useState<Dragged | null>(null)

  useEffect(() => {
    void fetchWiring()
  }, [fetchWiring])

  useEffect(() => {
    if (devices && draft === null) setDraft(structuredClone(devices))
  }, [devices, draft])

  const reg = draft ?? empty
  const levers = discovery?.levers ?? []
  const adapters = discovery?.adapters ?? []

  const claimed = useMemo(() => {
    const a = new Set<string>()
    const l = new Set<string>()
    reg.gates.forEach((g) => g.lever && l.add(g.lever))
    reg.signals.forEach((s) => s.adapter && a.add(s.adapter))
    reg.reservoirs.forEach((r) => r.thresholds.forEach((t) => t.adapter && a.add(t.adapter)))
    return { adapters: a, levers: l }
  }, [reg])

  const update = (next: DeviceRegistry) => setDraft(next)

  // Add operations (shared by drag-drop and the click/pick controls).
  const addGate = (lever: string) => update({ ...reg, gates: [...reg.gates, { id: '', label: lever, lever, method: 'GET' }] })
  const addSignal = (adapter: string) => update({ ...reg, signals: [...reg.signals, { id: '', label: adapter, adapter }] })
  const nextThreshold = (r: ReservoirDevice) => Number((0.5 * (r.thresholds.length + 1)).toFixed(1))
  const addThreshold = (i: number, adapter: string) =>
    update({
      ...reg,
      reservoirs: reg.reservoirs.map((r, j) =>
        j === i ? { ...r, thresholds: [...r.thresholds, { adapter, value: nextThreshold(r) }] } : r,
      ),
    })
  const newReservoirFrom = (adapter: string) =>
    update({ ...reg, reservoirs: [...reg.reservoirs, { id: '', label: '', unit: 'm', thresholds: [{ adapter, value: 0.5 }] }] })

  const scan = async () => {
    setScanning(true)
    await scanDevices()
    setScanning(false)
  }
  const save = async () => {
    if (!draft) return
    setSaving(true)
    await saveWiring(withIds(draft))
    setSaving(false)
  }
  const dirty = draft !== null && devices !== null && JSON.stringify(withIds(draft)) !== JSON.stringify(withIds(devices))

  return (
    <div className="panel-body wiring" onDragEnd={() => setDragging(null)}>
      <p className="wiring-intro">
        Register the HTTP Levers and Adapters you place in-game — no naming convention. <strong>Scan</strong> the game,
        then drag a chip into a group (or use the buttons below). Levers become gate controls, adapters become signals,
        and grouped thresholds become reservoir gauges.
      </p>

      {/* Discovered devices tray */}
      <section className="wiring-section wiring-discovered">
        <div className="wiring-discovered-head">
          <h3 className="wiring-h3">Discovered devices</h3>
          <button type="button" className="wiring-scan" onClick={() => void scan()} disabled={scanning}>
            {scanning ? 'Scanning…' : '⟳ Scan game'}
          </button>
          <span className="wiring-count">
            {levers.length} lever(s) · {adapters.length} adapter(s)
          </span>
        </div>
        {levers.length === 0 && adapters.length === 0 ? (
          <div className="unmapped">
            None found yet. Place HTTP Levers/Adapters in-game and press <em>Scan</em>. (The game's HTTP server must be
            running — the Data Console mod starts it automatically.)
          </div>
        ) : (
          <div className="wiring-trays">
            <ChipTray label="Levers → gates">
              {levers.map((l) => (
                <Chip
                  key={l.name}
                  kind="lever"
                  name={l.name}
                  state={l.state}
                  used={claimed.levers.has(l.name)}
                  onDragStart={setDragging}
                  actions={[{ label: '+ gate', onClick: () => addGate(l.name) }]}
                />
              ))}
            </ChipTray>
            <ChipTray label="Adapters → signals / reservoir thresholds">
              {adapters.map((a) => (
                <Chip
                  key={a.name}
                  kind="adapter"
                  name={a.name}
                  state={a.state}
                  used={claimed.adapters.has(a.name)}
                  onDragStart={setDragging}
                  actions={[
                    { label: '+ signal', onClick: () => addSignal(a.name) },
                    { label: '+ reservoir', onClick: () => newReservoirFrom(a.name) },
                  ]}
                />
              ))}
            </ChipTray>
          </div>
        )}
      </section>

      {/* Gates — drop a lever here */}
      <DropZone active={dragging?.kind === 'lever'} onDrop={(e) => { const d = readDrag(e); if (d?.kind === 'lever') addGate(d.name) }}>
        <GateEditor gates={reg.gates} levers={levers} claimed={claimed.levers} onChange={(gates) => update({ ...reg, gates })} />
      </DropZone>

      {/* Reservoirs — drop an adapter onto a card or the "new" zone */}
      <ReservoirEditor
        reservoirs={reg.reservoirs}
        adapters={adapters}
        dragging={dragging}
        onDropToReservoir={addThreshold}
        onDropNew={newReservoirFrom}
        onChange={(reservoirs) => update({ ...reg, reservoirs })}
      />

      {/* Signals — drop an adapter here */}
      <DropZone active={dragging?.kind === 'adapter'} onDrop={(e) => { const d = readDrag(e); if (d?.kind === 'adapter') addSignal(d.name) }}>
        <SignalEditor signals={reg.signals} adapters={adapters} claimed={claimed.adapters} onChange={(signals) => update({ ...reg, signals })} />
      </DropZone>

      <div className="wiring-actions">
        <button type="button" className="wiring-save" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : dirty ? 'Save wiring' : 'Saved'}
        </button>
        {dirty && (
          <button type="button" className="wiring-reset" onClick={() => setDraft(devices ? structuredClone(devices) : empty)}>
            Discard changes
          </button>
        )}
      </div>
    </div>
  )
}

// ── Discovered chips ───────────────────────────────────────────────────────

function ChipTray({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wiring-tray">
      <div className="wiring-tray-label">{label}</div>
      <div className="wiring-chips">{children}</div>
    </div>
  )
}

function Chip({
  kind,
  name,
  state,
  used,
  onDragStart,
  actions,
}: {
  kind: 'lever' | 'adapter'
  name: string
  state: boolean
  used: boolean
  onDragStart: (d: Dragged) => void
  actions: Array<{ label: string; onClick: () => void }>
}) {
  return (
    <div
      className={`wiring-chip${used ? ' used' : ''}`}
      draggable
      onDragStart={(e) => {
        startDrag(e, { kind, name })
        onDragStart({ kind, name })
      }}
      title={used ? `${name} (already used — drag/add again to reuse)` : `Drag ${name} into a group, or use the buttons`}
    >
      <span className="wiring-chip-grip" aria-hidden="true">
        ⠿
      </span>
      <span className={`sig-dot ${state ? 'on' : 'off'}`} aria-hidden="true" />
      <span className="wiring-chip-name">{name}</span>
      {used && <span className="wiring-chip-used">used</span>}
      <span className="wiring-chip-actions">
        {actions.map((a) => (
          <button key={a.label} type="button" onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </span>
    </div>
  )
}

/** A section wrapper that accepts a drop and highlights while a compatible drag is in progress. */
function DropZone({ active, onDrop, children }: { active: boolean; onDrop: (e: DragEvent) => void; children: ReactNode }) {
  return (
    <div
      className={`wiring-drop${active ? ' can-drop' : ''}`}
      onDragOver={allowDrop}
      onDrop={(e) => {
        onDrop(e)
        e.preventDefault()
      }}
    >
      {children}
    </div>
  )
}

// ── Gates ────────────────────────────────────────────────────────────────

function GateEditor({
  gates,
  levers,
  claimed,
  onChange,
}: {
  gates: GateDevice[]
  levers: Array<{ name: string; state: boolean }>
  claimed: Set<string>
  onChange: (gates: GateDevice[]) => void
}) {
  const [url, setUrl] = useState('')
  const addFromUrl = () => {
    const name = nameFromUrl(url.trim())
    if (!name) return
    onChange([...gates, { id: '', label: name, lever: name, method: 'GET' }])
    setUrl('')
  }
  return (
    <section className="wiring-section">
      <h3 className="wiring-h3">Gates — HTTP Levers</h3>
      {gates.map((g, i) => (
        <div className="wiring-row" key={i}>
          <input className="wiring-nick" placeholder="Nickname (e.g. Spillway)" value={g.label} onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <DevicePicker options={levers} value={g.lever} claimed={claimed} placeholder="pick lever" onChange={(lever) => onChange(gates.map((x, j) => (j === i ? { ...x, lever } : x)))} />
          <select className="wiring-method" value={g.method ?? 'GET'} onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, method: e.target.value as 'GET' | 'POST' } : x)))}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <label className="wiring-confirm" title="Require a two-step confirm before commanding">
            <input type="checkbox" checked={g.confirmRequired ?? false} onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, confirmRequired: e.target.checked } : x)))} />
            confirm
          </label>
          <button type="button" className="wiring-remove" aria-label="Remove gate" onClick={() => onChange(gates.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="wiring-add">
        <button type="button" onClick={() => onChange([...gates, { id: '', label: '', lever: levers[0]?.name ?? '', method: 'GET' }])}>
          + Add gate
        </button>
        <span className="wiring-or">or paste a Switch-on URL:</span>
        <input className="wiring-url" placeholder="http://localhost:8080/api/switch-on/HTTP%20Lever%201" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFromUrl()} />
        <button type="button" onClick={addFromUrl} disabled={!nameFromUrl(url.trim())}>
          Add
        </button>
      </div>
    </section>
  )
}

// ── Reservoirs ───────────────────────────────────────────────────────────

function ReservoirEditor({
  reservoirs,
  adapters,
  dragging,
  onDropToReservoir,
  onDropNew,
  onChange,
}: {
  reservoirs: ReservoirDevice[]
  adapters: Array<{ name: string; state: boolean }>
  dragging: Dragged | null
  onDropToReservoir: (index: number, adapter: string) => void
  onDropNew: (adapter: string) => void
  onChange: (reservoirs: ReservoirDevice[]) => void
}) {
  const setR = (i: number, patch: Partial<ReservoirDevice>) => onChange(reservoirs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const dropActive = dragging?.kind === 'adapter'

  return (
    <section className="wiring-section">
      <h3 className="wiring-h3">Reservoirs — grouped threshold Adapters</h3>
      {reservoirs.map((r, i) => (
        <div
          className={`wiring-reservoir${dropActive ? ' can-drop' : ''}`}
          key={i}
          onDragOver={allowDrop}
          onDrop={(e) => {
            const d = readDrag(e)
            if (d?.kind === 'adapter') onDropToReservoir(i, d.name)
            e.preventDefault()
          }}
        >
          <div className="wiring-row">
            <input className="wiring-nick" placeholder="Nickname (e.g. Upper Reservoir)" value={r.label} onChange={(e) => setR(i, { label: e.target.value })} />
            <input className="wiring-unit" placeholder="unit (m)" value={r.unit ?? ''} onChange={(e) => setR(i, { unit: e.target.value })} />
            <button type="button" className="wiring-remove" aria-label="Remove reservoir" onClick={() => onChange(reservoirs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {r.thresholds.map((t, k) => (
            <div className="wiring-threshold" key={k}>
              <DevicePicker options={adapters} value={t.adapter} claimed={new Set()} placeholder="pick adapter" onChange={(adapter) => setR(i, { thresholds: r.thresholds.map((x, m) => (m === k ? { ...x, adapter } : x)) })} />
              <span className="wiring-gt">above</span>
              <input className="wiring-value" type="number" step="0.1" value={Number.isFinite(t.value) ? t.value : ''} onChange={(e) => setR(i, { thresholds: r.thresholds.map((x, m) => (m === k ? { ...x, value: Number(e.target.value) } : x)) })} />
              <button type="button" className="wiring-remove" aria-label="Remove threshold" onClick={() => setR(i, { thresholds: r.thresholds.filter((_, m) => m !== k) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="wiring-add-threshold" onClick={() => setR(i, { thresholds: [...r.thresholds, { adapter: adapters[0]?.name ?? '', value: 0.5 }] })}>
            + threshold {dropActive && <span className="wiring-drophint">or drop an adapter here</span>}
          </button>
        </div>
      ))}
      <div
        className={`wiring-newreservoir${dropActive ? ' can-drop' : ''}`}
        onDragOver={allowDrop}
        onDrop={(e) => {
          const d = readDrag(e)
          if (d?.kind === 'adapter') onDropNew(d.name)
          e.preventDefault()
        }}
      >
        <button type="button" onClick={() => onChange([...reservoirs, { id: '', label: '', unit: 'm', thresholds: [] }])}>
          + Add reservoir
        </button>
        <span className="wiring-or">or drop an adapter to start one</span>
      </div>
    </section>
  )
}

// ── Signals ──────────────────────────────────────────────────────────────

function SignalEditor({
  signals,
  adapters,
  claimed,
  onChange,
}: {
  signals: SignalDevice[]
  adapters: Array<{ name: string; state: boolean }>
  claimed: Set<string>
  onChange: (signals: SignalDevice[]) => void
}) {
  return (
    <section className="wiring-section">
      <h3 className="wiring-h3">Signals — plain HTTP Adapters</h3>
      {signals.map((s, i) => (
        <div className="wiring-row" key={i}>
          <input className="wiring-nick" placeholder="Nickname (e.g. Drought active)" value={s.label} onChange={(e) => onChange(signals.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <DevicePicker options={adapters} value={s.adapter} claimed={claimed} placeholder="pick adapter" onChange={(adapter) => onChange(signals.map((x, j) => (j === i ? { ...x, adapter } : x)))} />
          <button type="button" className="wiring-remove" aria-label="Remove signal" onClick={() => onChange(signals.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="wiring-add">
        <button type="button" onClick={() => onChange([...signals, { id: '', label: '', adapter: adapters[0]?.name ?? '' }])}>
          + Add signal
        </button>
      </div>
    </section>
  )
}

function DevicePicker({
  options,
  value,
  claimed,
  placeholder,
  onChange,
}: {
  options: Array<{ name: string; state: boolean }>
  value: string
  claimed: Set<string>
  placeholder: string
  onChange: (name: string) => void
}) {
  const names = options.map((o) => o.name)
  const missing = value && !names.includes(value)
  return (
    <select className="wiring-picker" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}…</option>
      {options.map((o) => (
        <option key={o.name} value={o.name}>
          {o.name} {o.state ? '● on' : '○ off'}
          {claimed.has(o.name) && o.name !== value ? ' (used)' : ''}
        </option>
      ))}
      {missing && <option value={value}>{value} (offline)</option>}
    </select>
  )
}
