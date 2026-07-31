import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { EventRecord } from './types.js'

/**
 * Append-only event store (SQLite via the Node 22+ built-in driver).
 * Every command, confirmed state change, alarm transition and mode change
 * lands here; Discord posting, trend charts and the beaver-times digest all
 * read from this log later.
 */
export class EventStore {
  private db: DatabaseSync
  private insert: ReturnType<DatabaseSync['prepare']>
  private insertSample: ReturnType<DatabaseSync['prepare']>

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        ts      INTEGER NOT NULL,
        kind    TEXT    NOT NULL,
        subject TEXT    NOT NULL,
        message TEXT    NOT NULL,
        data    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
      CREATE INDEX IF NOT EXISTS idx_events_subject ON events (subject, ts);

      CREATE TABLE IF NOT EXISTS samples (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        ts       INTEGER NOT NULL,
        sensor   TEXT    NOT NULL,
        lo       REAL,
        hi       REAL,
        fraction REAL
      );
      CREATE INDEX IF NOT EXISTS idx_samples_sensor_ts ON samples (sensor, ts);
    `)
    this.insert = this.db.prepare(
      'INSERT INTO events (ts, kind, subject, message, data) VALUES (?, ?, ?, ?, ?)',
    )
    this.insertSample = this.db.prepare(
      'INSERT INTO samples (ts, sensor, lo, hi, fraction) VALUES (?, ?, ?, ?, ?)',
    )
  }

  append(kind: string, subject: string, message: string, data?: unknown): void {
    this.insert.run(Date.now(), kind, subject, message, data === undefined ? null : JSON.stringify(data))
  }

  /** Record a band transition for trend charts (kept out of the human event log). */
  recordSample(sensorId: string, lo: number | null, hi: number | null, fraction: number | null): void {
    this.insertSample.run(Date.now(), sensorId, lo, hi, fraction)
  }

  /** Stepped band history since `sinceTs`, grouped by sensor id, ascending in time. */
  samplesSince(sinceTs: number): Map<string, Array<{ ts: number; lo: number | null; hi: number | null; fraction: number | null }>> {
    const rows = this.db
      .prepare('SELECT ts, sensor, lo, hi, fraction FROM samples WHERE ts >= ? ORDER BY ts ASC')
      .all(sinceTs) as Array<{ ts: number; sensor: string; lo: number | null; hi: number | null; fraction: number | null }>
    const bySensor = new Map<string, Array<{ ts: number; lo: number | null; hi: number | null; fraction: number | null }>>()
    for (const row of rows) {
      const list = bySensor.get(row.sensor) ?? []
      list.push({ ts: row.ts, lo: row.lo, hi: row.hi, fraction: row.fraction })
      bySensor.set(row.sensor, list)
    }
    return bySensor
  }

  recent(limit = 100): EventRecord[] {
    const rows = this.db
      .prepare('SELECT id, ts, kind, subject, message, data FROM events ORDER BY id DESC LIMIT ?')
      .all(limit) as Array<{ id: number; ts: number; kind: string; subject: string; message: string; data: string | null }>
    return rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      kind: row.kind,
      subject: row.subject,
      message: row.message,
      data: row.data === null ? undefined : JSON.parse(row.data),
    }))
  }

  close(): void {
    this.db.close()
  }
}
