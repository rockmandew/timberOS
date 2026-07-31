import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Engine } from './engine.js'

/**
 * HTTP + WebSocket surface of the gateway (localhost:8081 by default).
 * The React dashboard is the only intended client; credentials for Hue,
 * Govee and Discord never pass through here.
 */
export async function buildServer(engine: Engine): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  await app.register(cors, { origin: true })
  await app.register(websocket)

  app.get('/api/state', async () => engine.getSnapshot())

  app.get<{ Querystring: { limit?: string } }>('/api/events', async (req) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100) || 100)
    return engine.events.recent(limit)
  })

  app.get('/api/lint', async () => engine.getLint())

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
    socket.send(JSON.stringify({ type: 'snapshot', data: engine.getSnapshot() }))
    const unsubscribe = engine.onChange((snapshot) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'snapshot', data: snapshot }))
      }
    })
    socket.on('close', unsubscribe)
  })

  return app
}
