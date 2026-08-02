import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { ColonyFeed } from './dataconsole/client.js'
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
export async function buildServer(engine: Engine, colonyFeed?: ColonyFeed): Promise<FastifyInstance> {
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
    socket.send(JSON.stringify({ type: 'snapshot', data: withColony(engine.getSnapshot()) }))
    const unsubscribe = engine.onChange((snapshot) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'snapshot', data: withColony(snapshot) }))
      }
    })
    socket.on('close', unsubscribe)
  })

  return app
}
