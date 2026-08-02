import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { Engine } from './engine.js'
import { EventStore } from './events.js'
import { loadEnv } from './env.js'
import { type Annunciator, ConsoleAnnunciator } from './integrations/annunciator.js'
import { AudioAnnunciator } from './integrations/audio.js'
import { HueAnnunciator } from './integrations/hue.js'
import { buildServer } from './server.js'
import { ColonyFeed } from './dataconsole/client.js'
import { HttpTimberbornClient, type TimberbornApi } from './timberborn/client.js'
import { SimulatedTimberborn } from './timberborn/simulator.js'

const DEFAULT_DATA_CONSOLE_URL = 'http://localhost:8080/timberos/v1/snapshot'

const HERE = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const simulate = process.argv.includes('--simulate') || process.env['TIMBEROS_SIMULATE'] === '1'
  const configFlagIndex = process.argv.indexOf('--config')
  const configPath = configFlagIndex >= 0 ? process.argv[configFlagIndex + 1] : process.env['TIMBEROS_CONFIG']

  loadEnv(resolve(HERE, '../.env'))

  const { config, path } = loadConfig(configPath)
  console.log(`TimberOS gateway · config: ${path}`)

  const api: TimberbornApi = simulate ? new SimulatedTimberborn() : new HttpTimberbornClient(config.endpoints)
  if (simulate) console.log('Running against the SIMULATOR — no game connection will be made.')
  else console.log(`Timberborn API: ${config.endpoints.baseUrl}`)

  // Every integration is registered so it shows a dashboard toggle; the config
  // `enabled` flags are only the initial state. Toggling is live at runtime.
  const annunciators: Annunciator[] = [new ConsoleAnnunciator()]

  // PC audio cues — the tones play in the dashboard browser; this entry carries
  // the shared on/off state (see integrations/audio.ts).
  const audioEnabled = config.annunciators?.audio?.enabled ?? true
  annunciators.push(new AudioAnnunciator(audioEnabled))
  console.log(`PC audio cues → dashboard browser (${audioEnabled ? 'enabled' : 'disabled'})`)

  const hue = config.annunciators?.hue
  if (hue?.bridgeIp) {
    const username = process.env['HUE_USERNAME']
    const available = Boolean(username)
    annunciators.push(new HueAnnunciator(hue, username ?? '', hue.enabled ?? false, available))
    if (available) {
      console.log(`Hue annunciator → bridge ${hue.bridgeIp} group ${hue.group ?? '0'} (${hue.enabled ? 'enabled' : 'disabled'})`)
    } else {
      console.warn('Hue configured but HUE_USERNAME is not set in .env — the dashboard toggle will show it as unavailable.')
    }
  }

  const events = new EventStore(resolve(HERE, '../..', config.gateway.eventStore))
  const engine = new Engine(config, api, events, annunciators)
  engine.start()

  // Colony telemetry from the Data Console mod (optional; graceful when absent).
  const dc = config.dataConsole ?? {}
  const colonyFeed = new ColonyFeed({
    enabled: dc.enabled ?? true,
    url: dc.url ?? DEFAULT_DATA_CONSOLE_URL,
    pollMs: dc.pollMs ?? 2000,
  })
  colonyFeed.start()
  if (dc.enabled === false) {
    console.log('Colony feed (Data Console) disabled in config.')
  } else {
    console.log(`Colony feed → ${dc.url ?? DEFAULT_DATA_CONSOLE_URL} (optional; fine if the mod isn't installed)`)
  }

  const server = await buildServer(engine, colonyFeed)
  await server.listen({ port: config.gateway.port, host: '127.0.0.1' })
  console.log(`Gateway listening on http://127.0.0.1:${config.gateway.port} (REST + /ws)`)

  const shutdown = async (): Promise<void> => {
    engine.stop()
    colonyFeed.stop()
    await server.close()
    events.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown())
  process.on('SIGTERM', () => void shutdown())
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
