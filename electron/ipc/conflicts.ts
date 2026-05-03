import {
  listSnapshots,
  readSnapshot,
  deleteSnapshot,
  writeSnapshot as storeWriteSnapshot
} from '../services/conflicts/store'
import { IpcError } from '@shared/ipc-contract'
import type { ConflictResolvedBy } from '@shared/conflict-types'
import type {
  ConflictListResult,
  ConflictReadResult
} from '@shared/ipc-contract'

export const conflictHandlers = {
  async list(opts?: { limit?: number; offset?: number }): Promise<ConflictListResult> {
    const limit = opts?.limit
    const offset = opts?.offset
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      throw new IpcError('E_INVALID_ARGS', 'limit must be a non-negative integer')
    }
    if (offset !== undefined && (!Number.isInteger(offset) || offset < 0)) {
      throw new IpcError('E_INVALID_ARGS', 'offset must be a non-negative integer')
    }
    return listSnapshots({
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {})
    })
  },

  async read(id: string): Promise<ConflictReadResult> {
    if (!id || typeof id !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'id is required')
    }
    return readSnapshot(id)
  },

  async delete(id: string): Promise<{ ok: true }> {
    if (!id || typeof id !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'id is required')
    }
    await deleteSnapshot(id)
    return { ok: true }
  },

  async writeSnapshot(input: {
    path: string
    baseText: string
    localText: string
    remoteText: string
    resolvedBy: ConflictResolvedBy
    winnerPath?: string
  }): Promise<{ id: string }> {
    if (!input?.path) throw new IpcError('E_INVALID_ARGS', 'path required')
    if (!['keep_local', 'load_remote', 'load_remote_banner', 'save_as'].includes(input.resolvedBy)) {
      throw new IpcError('E_INVALID_ARGS', `invalid resolvedBy: ${input.resolvedBy}`)
    }
    return storeWriteSnapshot(input)
  }
}
