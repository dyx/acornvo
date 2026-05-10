import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { handleTelemetryAggregate } from './telemetry-aggregate'

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT,
      profile_id TEXT,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER,
      ok INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      path TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS perf_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      area TEXT NOT NULL,
      ok INTEGER NOT NULL,
      ms INTEGER NOT NULL,
      meta TEXT
    );
    CREATE TABLE IF NOT EXISTS telemetry_local (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      meta TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_telemetry_day_metric ON telemetry_local(day, metric);
  `)
}

describe('handleTelemetryAggregate', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    createSchema(db)
  })

  afterEach(() => db.close())

  it('inserts aggregated rows into telemetry_local', () => {
    const day = '2026-05-09'
    db.prepare(`INSERT INTO ai_usage (prompt_tokens, completion_tokens, created_at) VALUES (100, 50, '2026-05-09T12:00:00Z')`).run()
    db.prepare(`INSERT INTO ai_usage (prompt_tokens, completion_tokens, created_at) VALUES (20, 10, '2026-05-09T18:00:00Z')`).run()
    db.prepare(`INSERT INTO clips (url, created_at) VALUES ('http://a.com', '2026-05-09T08:00:00Z')`).run()
    db.prepare(`INSERT INTO perf_samples (ts, area, ok, ms) VALUES ('2026-05-09T09:00:00Z', 'search.query', 1, 120)`).run()

    handleTelemetryAggregate({ db, day })

    const rows = db.prepare('SELECT metric, value FROM telemetry_local WHERE day = ? ORDER BY metric').all(day) as { metric: string; value: number }[]
    expect(rows).toEqual([
      { metric: 'ai.requests', value: 2 },
      { metric: 'ai.tokens.total', value: 180 },
      { metric: 'clips.created', value: 1 },
      { metric: 'perf.samples', value: 1 }
    ])
  })

  it('handles empty data correctly', () => {
    const day = '2026-05-09'
    handleTelemetryAggregate({ db, day })
    const rows = db.prepare('SELECT metric, value FROM telemetry_local WHERE day = ? ORDER BY metric').all(day) as { metric: string; value: number }[]
    expect(rows).toEqual([
      { metric: 'ai.requests', value: 0 },
      { metric: 'ai.tokens.total', value: 0 },
      { metric: 'clips.created', value: 0 },
      { metric: 'perf.samples', value: 0 }
    ])
  })

  it('upserts on conflict (re-run for same day)', () => {
    const day = '2026-05-09'
    db.prepare(`INSERT INTO ai_usage (prompt_tokens, completion_tokens, created_at) VALUES (100, 50, '2026-05-09T12:00:00Z')`).run()

    handleTelemetryAggregate({ db, day })
    // Run a second time — should upsert, not duplicate
    handleTelemetryAggregate({ db, day })

    const count = (db.prepare('SELECT COUNT(*) AS n FROM telemetry_local WHERE day = ?').get(day) as { n: number }).n
    expect(count).toBe(4)
    const value = (db.prepare('SELECT value FROM telemetry_local WHERE day = ? AND metric = ?').get(day, 'ai.requests') as { value: number }).value
    expect(value).toBe(1)
  })
})
