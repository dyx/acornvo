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
