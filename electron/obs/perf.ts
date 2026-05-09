import type Database from 'better-sqlite3'

export interface PerfStartMeta {
  [k: string]: unknown
}

export interface PerfEndArgs {
  ok: boolean
  meta?: PerfStartMeta
}

export interface PerfDeps {
  db: Database.Database
  now?: () => number
}

export interface Perf {
  start: (area: string, meta?: PerfStartMeta) => (args: PerfEndArgs) => void
}

export function createPerf(deps: PerfDeps): Perf {
  const now = deps.now ?? (() => Date.now())
  const ins = deps.db.prepare(
    `INSERT INTO perf_samples (ts, area, ok, ms, meta) VALUES (?, ?, ?, ?, ?)`
  )

  return {
    start(area, startMeta = {}) {
      const t0 = now()
      return ({ ok, meta = {} }) => {
        const t1 = now()
        const ms = Math.max(0, t1 - t0)
        const merged = { ...startMeta, ...meta }
        ins.run(new Date().toISOString(), area, ok ? 1 : 0, ms, JSON.stringify(merged))
      }
    }
  }
}

let cached: Perf | null = null

export function setPerfInstance(p: Perf): void {
  cached = p
}

export function perf(): Perf {
  if (!cached) throw new Error('perf not initialized — call setPerfInstance during boot')
  return cached
}

/** Safe getter that returns null when perf has not been initialised (e.g. in tests). */
export function getPerf(): Perf | null {
  return cached
}

const PERF_HARD_CAP = 100_000
const PERF_SOFT_CAP = 80_000

export function trimPerfSamples(deps: { db: Database.Database }): void {
  const { db } = deps
  const row = db.prepare(`SELECT COUNT(*) AS n FROM perf_samples`).get() as { n: number }
  if (row.n <= PERF_HARD_CAP) return
  // Keep newest PERF_SOFT_CAP rows.
  db.prepare(
    `DELETE FROM perf_samples WHERE id IN (
       SELECT id FROM perf_samples ORDER BY id ASC LIMIT ?
     )`
  ).run(row.n - PERF_SOFT_CAP)
}

export interface AggDeps {
  db: Database.Database
  area: string
  windowMs: number
  now?: () => Date
}

export interface Aggregates {
  count: number
  p50: number
  p95: number
  successRate: number
}

export function getAggregates(deps: AggDeps): Aggregates {
  const now = (deps.now ?? (() => new Date()))()
  const since = new Date(now.getTime() - deps.windowMs).toISOString()
  const rows = deps.db
    .prepare(`SELECT ms, ok FROM perf_samples WHERE area = ? AND ts >= ? ORDER BY ms ASC`)
    .all(deps.area, since) as { ms: number; ok: number }[]

  if (rows.length === 0) return { count: 0, p50: 0, p95: 0, successRate: 0 }

  const ms = rows.map((r) => r.ms)
  const okCount = rows.reduce((s, r) => s + (r.ok ? 1 : 0), 0)
  return {
    count: rows.length,
    p50: percentile(ms, 0.5),
    p95: percentile(ms, 0.95),
    successRate: okCount / rows.length
  }
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length))
  return sortedAsc[idx]
}
