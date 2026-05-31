import type Database from 'better-sqlite3'
import type { JobHandler } from '../runner'
import { dbService } from '../../services/db'
import { getGlobalDb } from '../../services/global-db'

export interface TelemetryAggregateInput {
  db: Database.Database
  day: string // 'YYYY-MM-DD' UTC
}

export async function handleTelemetryAggregate(input: TelemetryAggregateInput): Promise<void> {
  const { db, day } = input
  const dayStart = `${day}T00:00:00Z`
  const dayEnd = `${day}T23:59:59Z`

  const globalDb = getGlobalDb()

  const aiAgg = globalDb
    .prepare(
      `SELECT COUNT(*) AS requests, COALESCE(SUM(prompt_tokens), 0) + COALESCE(SUM(completion_tokens), 0) AS total_tokens
     FROM ai_usage WHERE created_at >= ? AND created_at <= ?`
    )
    .get(dayStart, dayEnd) as { requests: number; total_tokens: number }

  const clipsCount = db
    .prepare(`SELECT COUNT(*) AS n FROM files WHERE created_at >= ? AND created_at <= ?`)
    .get(dayStart, dayEnd) as { n: number } | undefined

  const perfCount = globalDb
    .prepare(`SELECT COUNT(*) AS n FROM perf_samples WHERE ts >= ? AND ts <= ?`)
    .get(dayStart, dayEnd) as { n: number }

  const ups = globalDb.prepare(
    `INSERT INTO telemetry_local (day, metric, value) VALUES (?, ?, ?)
     ON CONFLICT (day, metric) DO UPDATE SET value = excluded.value`
  )

  globalDb.transaction(() => {
    ups.run(day, 'ai.requests', aiAgg.requests)
    ups.run(day, 'ai.tokens.total', aiAgg.total_tokens)
    ups.run(day, 'clips.created', clipsCount?.n ?? 0)
    ups.run(day, 'perf.samples', perfCount.n)
  })()
}

export function createTelemetryAggregateHandler(): JobHandler {
  return async ({ payload, log }) => {
    const day = (payload as { day?: unknown }).day
    if (typeof day !== 'string' || day.length === 0) {
      throw new Error('telemetry-aggregate handler: payload.day is required')
    }
    const db = dbService.requireCurrent()
    await handleTelemetryAggregate({ db, day })
    log('info', `telemetry-aggregate ok day=${day}`)
    return { kind: 'ok' }
  }
}
