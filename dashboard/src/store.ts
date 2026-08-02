import { create } from 'zustand'
import type { CommandResult, DeviceRegistry, Discovery, EventRecord, Snapshot, TrendSeries } from './types'

const TREND_WINDOW_MS = 1_800_000 // 30 minutes

interface TimberOSStore {
  snapshot: Snapshot | null
  events: EventRecord[]
  trends: TrendSeries[]
  /** Gateway (not game) connectivity — the WS to :8081. */
  gatewayOnline: boolean
  /** Transient result of the last command, for the toast strip. */
  lastCommand: CommandResult | null
  /** Device registry + live discovery for the Wiring panel. */
  devices: DeviceRegistry | null
  discovery: Discovery | null

  connect(): void
  refreshEvents(): Promise<void>
  refreshTrends(): Promise<void>
  fetchWiring(): Promise<void>
  scanDevices(): Promise<void>
  saveWiring(registry: DeviceRegistry): Promise<CommandResult>
  commandGate(gateId: string, position: number | 'OPEN' | 'CLOSED', confirm?: boolean): Promise<CommandResult>
  setMode(mode: string): Promise<CommandResult>
  setIntegration(id: string, enabled: boolean): Promise<CommandResult>
  dismissCommandResult(): void
}

export const useTimberOS = create<TimberOSStore>((set, get) => ({
  snapshot: null,
  events: [],
  trends: [],
  gatewayOnline: false,
  lastCommand: null,
  devices: null,
  discovery: null,

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${proto}://${location.host}/ws`)

    socket.onopen = () => {
      set({ gatewayOnline: true })
      void get().refreshEvents()
      void get().refreshTrends()
    }
    socket.onmessage = (msg) => {
      const parsed = JSON.parse(msg.data as string) as { type: string; data: Snapshot }
      if (parsed.type === 'snapshot') set({ snapshot: parsed.data })
    }
    socket.onclose = () => {
      set({ gatewayOnline: false })
      setTimeout(() => get().connect(), 2000)
    }
    socket.onerror = () => socket.close()
  },

  async refreshEvents() {
    try {
      const res = await fetch('/api/events?limit=100')
      if (res.ok) set({ events: (await res.json()) as EventRecord[] })
    } catch {
      // Gateway offline — the WS reconnect loop will retry.
    }
  },

  async refreshTrends() {
    try {
      const res = await fetch(`/api/trends?sinceMs=${TREND_WINDOW_MS}`)
      if (res.ok) set({ trends: (await res.json()) as TrendSeries[] })
    } catch {
      // Gateway offline — the WS reconnect loop will retry.
    }
  },

  async fetchWiring() {
    try {
      const [devRes, discRes] = await Promise.all([fetch('/api/devices'), fetch('/api/discovery')])
      if (devRes.ok) set({ devices: (await devRes.json()) as DeviceRegistry })
      if (discRes.ok) set({ discovery: (await discRes.json()) as Discovery })
    } catch {
      // Gateway offline — the Wiring panel shows its last-known state.
    }
  },

  async scanDevices() {
    try {
      const res = await fetch('/api/discovery/scan', { method: 'POST' })
      if (res.ok) set({ discovery: (await res.json()) as Discovery })
    } catch {
      // Gateway offline — Scan simply does nothing; the panel keeps last-known devices.
    }
  },

  async saveWiring(registry) {
    const res = await postJson<{ ok: boolean; registry?: DeviceRegistry; message?: string }>(
      '/api/devices',
      registry,
      'PUT',
    )
    if (res.registry) set({ devices: res.registry })
    const result: CommandResult = {
      ok: res.ok,
      status: res.ok ? 'accepted' : 'error',
      message: res.ok ? 'Wiring saved' : (res.message ?? 'Failed to save wiring'),
    }
    set({ lastCommand: result })
    return result
  },

  async commandGate(gateId, position, confirm = false) {
    const result = await postJson<CommandResult>(`/api/gates/${encodeURIComponent(gateId)}/position`, {
      position,
      confirm,
    })
    set({ lastCommand: result })
    void get().refreshEvents()
    return result
  },

  async setMode(mode) {
    const result = await postJson<CommandResult>('/api/mode', { mode })
    set({ lastCommand: result })
    void get().refreshEvents()
    return result
  },

  async setIntegration(id, enabled) {
    // The authoritative on/off state rides back on the next snapshot over the WS;
    // no optimistic local mutation needed.
    const result = await postJson<CommandResult>(`/api/integrations/${encodeURIComponent(id)}`, { enabled })
    set({ lastCommand: result })
    void get().refreshEvents()
    return result
  },

  dismissCommandResult() {
    set({ lastCommand: null })
  },
}))

async function postJson<T>(url: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await res.json()) as T
  } catch (err) {
    return {
      ok: false,
      status: 'error',
      message: err instanceof Error ? err.message : 'Gateway unreachable',
    } as T
  }
}
