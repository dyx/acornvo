import type { JobHandler } from '../runner'

export interface IndexRetryDeps {
  upsertFromFs: (path: string) => Promise<void>
}

interface IndexRetryPayload {
  path: string
  reason?: string
}

export function createIndexRetryHandler(deps: IndexRetryDeps): JobHandler {
  return async ({ payload }) => {
    const p = payload as Partial<IndexRetryPayload>
    if (typeof p.path !== 'string' || p.path.length === 0) {
      throw new Error('index-retry handler: payload.path is required')
    }
    try {
      await deps.upsertFromFs(p.path)
      return { kind: 'ok' }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException | { code?: string })?.code
      if (code === 'ENOENT') {
        return { kind: 'ok' }
      }
      const msg = e instanceof Error ? e.message : String(e)
      return { kind: 'retry', delayMs: 0, reason: msg }
    }
  }
}
