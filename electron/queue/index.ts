// phase-14: queue bootstrap barrel
import type Database from 'better-sqlite3'
import { createJobStore, type JobStore } from './store'
import { createQueueRunner, type QueueRunner } from './runner'
import { createIndexRetryHandler } from './handlers/index-retry'
import { createAiReviewClipHandler } from './handlers/ai-review-clip'

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

  // Register ai-review-clip handler (placeholder — defers to phase-15)
  runner.register({
    kind: 'ai-review-clip',
    concurrency: 2,
    minGapMs: 500,
    handler: createAiReviewClipHandler({
      readClipRow: (_id: number) => {
        // Phase-12 may not have a clip reader exposed yet; return null as placeholder.
        return null
      },
      readMdFile: async (_path: string) => {
        // Stub until phase-15 wires real markdown parsing.
        return { frontmatter: {}, body: '' }
      },
      reviewClip: async () => {
        const err = new Error('phase-15 ai reviewer not yet implemented') as Error & { code: string }
        err.code = 'E_NOT_IMPLEMENTED'
        throw err
      }
    })
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
