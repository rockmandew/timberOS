import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { ColonyFeed } from './dataconsole/client.js'
import { normalizeRegistry, saveRegistry } from './devices/registry.js'
import type { Engine } from './engine.js'

/**
 * HTTP + WebSocket surface of the gateway (localhost:8081 by default).
 * The React dashboard is the only intended client; credentials for Hue,
 * Govee and Discord never pass through here.
 *
 * The optional `colonyFeed` carries live colony telemetry from the Data Console
 * mod. It rides the same `/api/state` payload and WebSocket snapshot (under
 * `colony`) so the dashboard sees waterworks + colony state in one place.
 */
export async function buildServer(
  engine: Engine,
  colonyFeed?: ColonyFeed,
  devicesPath?: string,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cors, { origin: true })
  await app.register(websocket)

  // Merge the optional colony feed into a snapshot without coupling it to the engine.
  const withColony = (snapshot: unknown): unknown =>
    colonyFeed ? { ...(snapshot as object), colony: colonyFeed.getState() } : snapshot

  app.get('/api/state', async () => withColony(engine.getSnapshot()))

  // Colony telemetry only (population, resources, weather, power) + feed status.
  app.get('/api/colony', async () =>
    colonyFeed?.getState() ?? { status: 'disabled', url: '', colony: null, lastUpdated: null, message: 'Colony feed not configured.' },
  )

  app.get<{ Querystring: { limit?: string } }>('/api/events', async (req) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100) || 100)
    return engine.events.recent(limit)
  })

  app.get('/api/lint', async () => engine.getLint())

  // ── Device registry (the dashboard Wiring panel) ──────────────────────
  // GET current registry; GET raw discovered devices for the picker; PUT to
  // replace the whole registry (applied live + persisted to config/devices.json).
  app.get('/api/devices', async () => engine.getRegistry())

  app.get('/api/discovery', async () => engine.getDiscovery())

  app.put('/api/devices', async (req) => {
    const registry = normalizeRegistry(req.body as Parameters<typeof normalizeRegistry>[0])
    engine.setRegistry(registry)
    if (devicesPath) {
      try {
        saveRegistry(devicesPath, registry)
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : 'Failed to persist devices', registry }
      }
    }
    return { ok: true, registry }
  })

  app.get('/api/integrations', async () => engine.getIntegrations())

  app.post<{ Params: { id: string }; Body: { enabled?: boolean } }>('/api/integrations/:id', async (req, reply) => {
    const enabled = req.body?.enabled
    if (typeof enabled !== 'boolean') {
      reply.code(400)
      return { ok: false, status: 'error', message: 'Body must include boolean "enabled"' }
    }
    const result = engine.setIntegrationEnabled(req.params.id, enabled)
    if (!result.ok) reply.code(result.status === 'error' ? 400 : 409)
    return result
  })

  app.get<{ Querystring: { sinceMs?: string } }>('/api/trends', async (req) => {
    const sinceMs = Math.min(24 * 3600_000, Math.max(60_000, Number(req.query.sinceMs ?? 1_800_000) || 1_800_000))
    return engine.getTrends(sinceMs)
  })

  app.post<{
    Params: { gateId: string }
    Body: { position?: number | 'OPEN' | 'CLOSED'; confirm?: boolean }
  }>('/api/gates/:gateId/position', async (req, reply) => {
    const { position, confirm } = req.body ?? {}
    if (position === undefined) {
      reply.code(400)
      return { ok: false, status: 'error', message: 'Body must include "position"' }
    }
    const result = await engine.commandGate(req.params.gateId, position, confirm ?? false)
    if (!result.ok) reply.code(result.status === 'error' ? 400 : 409)
    return result
  })

  app.post<{ Body: { mode?: string } }>('/api/mode', async (req, reply) => {
    const mode = req.body?.mode
    if (!mode) {
      reply.code(400)
      return { ok: false, status: 'error', message: 'Body must include "mode"' }
    }
    const result = engine.setMode(mode)
    if (!result.ok) reply.code(400)
    return result
  })

  app.get('/ws', { websocket: true }, (socket) => {
    const sendCurrent = (): void => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'snapshot', data: withColony(engine.getSnapshot()) }))
      }
    }
    sendCurrent()
    // Push on every engine change (waterworks), AND on a 1s heartbeat so the colony
    // feed refreshes live even when the waterworks engine is idle (e.g. the Data
    // Console mod is running but no HTTP adapters/levers are placed in-game).
    const unsubscribe = engine.onChange(() => sendCurrent())
    const heartbeat = setInterval(sendCurrent, 1000)
    socket.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  })

  return app
}
