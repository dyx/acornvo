// phase-14: queue bootstrap barrel
import type Database from 'better-sqlite3'
import { createJobStore, type JobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'

export interface QueueBootstrap {
  store: JobStore
  runner: QueueRunner
}

let bootstrap: QueueBootstrap | null = null

export function bootstrapQueueRunner(
  db: Database.Database,
  opts: { opsLog?: (r: { op: string; path: string; meta?: Record<string, unknown> }) => void } = {}
): QueueRunner {
  const store = createJobStore(db)
  const runner = createQueueRunner({ store, opsLog: opts.opsLog })

  // Register index-retry handler
  runner.register({
    kind: 'index-retry',
    concurrency: 4,
    minGapMs: 0,
    handler: createIndexRetryHandler({
      upsertFromFs: async (path: string) => {
        // Dynamically import from indexer to avoid circular deps
        const { upsertFromFs } = await import('../services/indexer')
        return upsertFromFs(path)
      }
    })
  })
  // ai-review-clip registered in Task 6

  bootstrap = { store, runner }
  return runner
}

export function getQueueBootstrap(): QueueBootstrap | null {
  return bootstrap
}

export function disposeQueueBootstrap(): void {
  if (bootstrap) {
    bootstrap.runner.stop()
    bootstrap = null
  }
}
