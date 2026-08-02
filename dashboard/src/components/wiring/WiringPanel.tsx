import { useEffect, useMemo, useState } from 'react'
import { useTimberOS } from '../../store'
import type { DeviceRegistry, GateDevice, ReservoirDevice, SignalDevice } from '../../types'

/**
 * In-app device wiring — the alternative to the naming convention. The operator
 * registers each placed HTTP Lever / HTTP Adapter here (picked from live game
 * discovery or by pasting a switch-on URL), gives it a nickname, and TimberOS
 * configures itself: levers become working on/off gates, adapters become named
 * signals, and grouped threshold adapters become reservoir % gauges. Persisted
 * to config/devices.json via PUT /api/devices; applied live.
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
    let base = slug(label)
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

export function WiringPanel() {
  const { devices, discovery, fetchWiring, saveWiring } = useTimberOS()
  const [draft, setDraft] = useState<DeviceRegistry | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void fetchWiring()
  }, [fetchWiring])

  // Seed the editable draft the first time the saved registry arrives.
  useEffect(() => {
    if (devices && draft === null) setDraft(structuredClone(devices))
  }, [devices, draft])

  const reg = draft ?? empty
  const levers = discovery?.levers ?? []
  const adapters = discovery?.adapters ?? []

  // Names already claimed, so the pickers can flag "unused" discovered devices.
  const claimed = useMemo(() => {
    const a = new Set<string>()
    const l = new Set<string>()
    reg.gates.forEach((g) => g.lever && l.add(g.lever))
    reg.signals.forEach((s) => s.adapter && a.add(s.adapter))
    reg.reservoirs.forEach((r) => r.thresholds.forEach((t) => t.adapter && a.add(t.adapter)))
    return { adapters: a, levers: l }
  }, [reg])

  const update = (next: DeviceRegistry) => setDraft(next)

  const save = async () => {
    if (!draft) return
    setSaving(true)
    await saveWiring(withIds(draft))
    setSaving(false)
  }

  const dirty = draft !== null && devices !== null && JSON.stringify(withIds(draft)) !== JSON.stringify(withIds(devices))

  return (
    <div className="panel-body wiring">
      <p className="wiring-intro">
        Register the HTTP Levers and Adapters you place in-game — no naming convention. Levers become gate
        controls, adapters become signals, and grouped thresholds become reservoir gauges.
        {discovery && (
          <>
            {' '}
            Discovered now: <strong>{levers.length}</strong> lever(s), <strong>{adapters.length}</strong> adapter(s).
          </>
        )}
      </p>

      <GateEditor gates={reg.gates} levers={levers} claimed={claimed.levers} onChange={(gates) => update({ ...reg, gates })} />
      <ReservoirEditor
        reservoirs={reg.reservoirs}
        adapters={adapters}
        onChange={(reservoirs) => update({ ...reg, reservoirs })}
      />
      <SignalEditor
        signals={reg.signals}
        adapters={adapters}
        claimed={claimed.adapters}
        onChange={(signals) => update({ ...reg, signals })}
      />

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
  const addBlank = () =>
    onChange([...gates, { id: '', label: '', lever: levers[0]?.name ?? '', method: 'GET' }])

  return (
    <section className="wiring-section">
      <h3 className="wiring-h3">Gates — HTTP Levers</h3>
      {gates.map((g, i) => (
        <div className="wiring-row" key={i}>
          <input
            className="wiring-nick"
            placeholder="Nickname (e.g. Spillway)"
            value={g.label}
            onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <DevicePicker
            options={levers}
            value={g.lever}
            claimed={claimed}
            placeholder="pick lever"
            onChange={(lever) => onChange(gates.map((x, j) => (j === i ? { ...x, lever } : x)))}
          />
          <select
            className="wiring-method"
            value={g.method ?? 'GET'}
            onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, method: e.target.value as 'GET' | 'POST' } : x)))}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
          <label className="wiring-confirm" title="Require a two-step confirm before commanding">
            <input
              type="checkbox"
              checked={g.confirmRequired ?? false}
              onChange={(e) => onChange(gates.map((x, j) => (j === i ? { ...x, confirmRequired: e.target.checked } : x)))}
            />
            confirm
          </label>
          <button type="button" className="wiring-remove" aria-label="Remove gate" onClick={() => onChange(gates.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="wiring-add">
        <button type="button" onClick={addBlank}>
          + Add gate
        </button>
        <span className="wiring-or">or paste a Switch-on URL:</span>
        <input
          className="wiring-url"
          placeholder="http://localhost:8080/api/switch-on/HTTP%20Lever%201"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addFromUrl()}
        />
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
  onChange,
}: {
  reservoirs: ReservoirDevice[]
  adapters: Array<{ name: string; state: boolean }>
  onChange: (reservoirs: ReservoirDevice[]) => void
}) {
  const setR = (i: number, patch: Partial<ReservoirDevice>) =>
    onChange(reservoirs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <section className="wiring-section">
      <h3 className="wiring-h3">Reservoirs — grouped threshold Adapters</h3>
      {reservoirs.map((r, i) => (
        <div className="wiring-reservoir" key={i}>
          <div className="wiring-row">
            <input
              className="wiring-nick"
              placeholder="Nickname (e.g. Upper Reservoir)"
              value={r.label}
              onChange={(e) => setR(i, { label: e.target.value })}
            />
            <input
              className="wiring-unit"
              placeholder="unit (m)"
              value={r.unit ?? ''}
              onChange={(e) => setR(i, { unit: e.target.value })}
            />
            <button type="button" className="wiring-remove" aria-label="Remove reservoir" onClick={() => onChange(reservoirs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
          {r.thresholds.map((t, k) => (
            <div className="wiring-threshold" key={k}>
              <DevicePicker
                options={adapters}
                value={t.adapter}
                claimed={new Set()}
                placeholder="pick adapter"
                onChange={(adapter) => setR(i, { thresholds: r.thresholds.map((x, m) => (m === k ? { ...x, adapter } : x)) })}
              />
              <span className="wiring-gt">above</span>
              <input
                className="wiring-value"
                type="number"
                step="0.1"
                value={Number.isFinite(t.value) ? t.value : ''}
                onChange={(e) => setR(i, { thresholds: r.thresholds.map((x, m) => (m === k ? { ...x, value: Number(e.target.value) } : x)) })}
              />
              <button type="button" className="wiring-remove" aria-label="Remove threshold" onClick={() => setR(i, { thresholds: r.thresholds.filter((_, m) => m !== k) })}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="wiring-add-threshold" onClick={() => setR(i, { thresholds: [...r.thresholds, { adapter: adapters[0]?.name ?? '', value: 0 }] })}>
            + threshold
          </button>
        </div>
      ))}
      <div className="wiring-add">
        <button type="button" onClick={() => onChange([...reservoirs, { id: '', label: '', unit: 'm', thresholds: [] }])}>
          + Add reservoir
        </button>
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
          <input
            className="wiring-nick"
            placeholder="Nickname (e.g. Drought active)"
            value={s.label}
            onChange={(e) => onChange(signals.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <DevicePicker
            options={adapters}
            value={s.adapter}
            claimed={claimed}
            placeholder="pick adapter"
            onChange={(adapter) => onChange(signals.map((x, j) => (j === i ? { ...x, adapter } : x)))}
          />
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

/**
 * Select a device by name from live discovery, tolerating a value that isn't
 * currently discovered (device offline / not placed yet) by keeping it as an option.
 */
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
