import { create } from 'zustand'
import type { CommandResult, EventRecord, Snapshot, TrendSeries } from './types'

const TREND_WINDOW_MS = 1_800_000 // 30 minutes

interface TimberOSStore {
  snapshot: Snapshot | null
  events: EventRecord[]
  trends: TrendSeries[]
  /** Gateway (not game) connectivity — the WS to :8081. */
  gatewayOnline: boolean
  /** Transient result of the last command, for the toast strip. */
  lastCommand: CommandResult | null

  connect(): void
  refreshEvents(): Promise<void>
  refreshTrends(): Promise<void>
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

async function postJson<T>(url: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(url, {
      method: 'POST',
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
