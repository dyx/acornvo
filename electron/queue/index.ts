// phase-14: queue bootstrap barrel
import type Database from 'better-sqlite3'
import { createJobStore, type JobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'
import { aiReviewClipHandler } from './handlers/ai-review-clip'

export interface QueueBootstrap {
  store: JobStore
  runner: QueueRunner
}

let bootstrap: QueueBootstrap | null = null

export function bootstrapQueueRunner(
  db: Database.Database,
  opts: {
    opsLog?: (r: { op: string; path: string; meta?: Record<string, unknown> }) => void
    /** Returns WebContents to broadcast state changes to. Required because importing
     *  BrowserWindow from 'electron' breaks vitest (node environment). */
    getRenderers: () => Electron.WebContents[]
  }
): QueueRunner {
  const store = createJobStore(db)
  const runner = createQueueRunner({ store, opsLog: opts.opsLog })

  // Broadcast state changes to all renderer windows
  store.events.on('stateChanged', ({ job }) => {
    for (const wc of opts.getRenderers()) {
      try {
        wc.send('jobs:changed', job)
      } catch {
        /* renderer may have been destroyed; safe to ignore */
      }
    }
  })

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

  // Register ai-review-clip handler (phase-15 real implementation)
  runner.register({
    kind: 'ai-review-clip',
    concurrency: 2,
    minGapMs: 500,
    handler: aiReviewClipHandler
  })

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
