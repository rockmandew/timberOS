import { readFileSync, existsSync } from 'node:fs'

/**
 * Minimal .env loader for gateway secrets (Hue/Govee/Discord tokens). Values
 * already present in process.env win, so real environment variables override
 * the file. Credentials live here and in the gateway only — never the browser.
 */
export function loadEnv(path: string): void {
  if (!existsSync(path)) return
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && !(key in process.env)) process.env[key] = value
  }
}
