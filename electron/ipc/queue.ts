import { IpcError } from '@shared/ipc-contract'
import type { JobStore } from '../queue/store'
import { list as opsLogList } from '../services/ops/log'

export interface QueueHandlerDeps {
  getStore: () => JobStore
}

export function createQueueHandlers(deps: QueueHandlerDeps) {
  return {
    health(): { pending: number; running: number; failed: number } {
      const store = deps.getStore()
      const pending = store.list({ status: 'pending', limit: 0, offset: 0 }).total
      const running = store.list({ status: 'running', limit: 0, offset: 0 }).total
      const failed = store.list({ status: 'failed', limit: 0, offset: 0 }).total
      return { pending, running, failed }
    },

    recent(): {
      failed: { id: string; kind: string; last_error: string; updated_at: string }[]
      opsLog: { ts: string; area: string; message: string }[]
    } {
      const store = deps.getStore()
      const failedList = store.list({ status: 'failed', limit: 20, offset: 0 })
      const logResult = opsLogList({ limit: 20, offset: 0 })
      return {
        failed: failedList.items.map((j) => ({
          id: j.id,
          kind: j.kind,
          last_error: j.lastError ?? '',
          updated_at: j.updatedAt
        })),
        opsLog: logResult.items.map((r) => ({
          ts: r.ts,
          area: r.op,
          message: r.path
        }))
      }
    },

    retry(id: string): void {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      const store = deps.getStore()
      const job = store.getById(id)
      if (!job) throw new IpcError('E_NOT_FOUND', `job ${id} not found`)
      if (job.status !== 'failed') {
        throw new IpcError('E_INVALID_ARGS', 'only failed jobs can be retried')
      }
      store.resetForManualRetry(id)
    },

    discard(id: string): void {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      const store = deps.getStore()
      const job = store.getById(id)
      if (!job) throw new IpcError('E_NOT_FOUND', `job ${id} not found`)
      store.markCanceled(id)
    }
  }
}
