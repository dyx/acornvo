import { IpcError } from '@shared/ipc-contract'
import type {
  JobsListResult,
  JobsRetryResult,
  JobsCancelResult,
  JobsClearDoneResult,
  JobListFilter
} from '@shared/ipc-contract'
import type { JobStore } from '../queue/store'

export interface JobsHandlerDeps {
  getStore: () => JobStore
  cancelInRunner: (id: string) => { ok: true } | { error: 'E_NOT_FOUND' | 'E_STATUS_NOT_ALLOWED' }
}

export function createJobsHandlers(deps: JobsHandlerDeps) {
  return {
    async list(filter: JobListFilter): Promise<JobsListResult> {
      if (!Number.isInteger(filter.limit) || filter.limit < 0) {
        throw new IpcError('E_INVALID_ARGS', 'E_INVALID_ARGS: limit must be a non-negative integer')
      }
      if (!Number.isInteger(filter.offset) || filter.offset < 0) {
        throw new IpcError('E_INVALID_ARGS', 'E_INVALID_ARGS: offset must be a non-negative integer')
      }
      return deps.getStore().list(filter)
    },

    async retry(id: string): Promise<JobsRetryResult> {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      const store = deps.getStore()
      const job = store.getById(id)
      if (!job) return { error: 'E_NOT_FOUND' }
      if (job.status !== 'failed') return { error: 'E_STATUS_NOT_ALLOWED' }
      store.resetForManualRetry(id)
      return { ok: true }
    },

    async cancel(id: string): Promise<JobsCancelResult> {
      if (!id || typeof id !== 'string') {
        throw new IpcError('E_INVALID_ARGS', 'id is required')
      }
      return deps.cancelInRunner(id)
    },

    async clearDone(): Promise<JobsClearDoneResult> {
      return deps.getStore().clearDone()
    }
  }
}
