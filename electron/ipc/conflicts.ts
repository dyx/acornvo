import {
  listSnapshots,
  readSnapshot,
  deleteSnapshot,
  writeSnapshot as storeWriteSnapshot
} from '../services/conflicts/store'
import { computeDiff, parseSidesPair } from '../services/conflicts/diff'
import * as opsLog from '../services/ops/log'
import { IpcError } from '@shared/ipc-contract'
import type { ConflictResolvedBy } from '@shared/conflict-types'
import type {
  ConflictListResult,
  ConflictReadResult,
  DiffResult,
  DiffSidesPair
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
    let path: string | undefined
    try {
      const snapshot = await readSnapshot(id)
      path = snapshot.meta.path
    } catch {
      // Missing or corrupt snapshot — still delete, skip audit
    }
    await deleteSnapshot(id)
    if (path) {
      opsLog.record({ op: 'conflict_delete', path, meta: { id } })
    }
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
  },

  async diff(id: string, sides: DiffSidesPair): Promise<DiffResult> {
    if (!id || typeof id !== 'string') {
      throw new IpcError('E_INVALID_ARGS', 'id is required')
    }
    if (!['local-remote', 'local-base', 'remote-base'].includes(sides)) {
      throw new IpcError('E_INVALID_ARGS', `invalid sides pair: ${sides}`)
    }
    const snapshot = await readSnapshot(id)
    const { leftLabel, rightLabel, leftTextField, rightTextField } = parseSidesPair(sides)
    return computeDiff({
      a: snapshot[leftTextField],
      b: snapshot[rightTextField],
      leftLabel,
      rightLabel
    })
  },

  async deleteAll(): Promise<{ ok: true; deleted: number }> {
    const { items } = await listSnapshots()
    let deleted = 0
    for (const item of items) {
      let path: string | undefined
      try {
        const snapshot = await readSnapshot(item.id)
        path = snapshot.meta.path
      } catch {
        // Missing or corrupt — skip audit for this entry
      }
      try {
        await deleteSnapshot(item.id)
        deleted++
      } catch {
        // Delete failed — skip audit and don't count
        continue
      }
      if (path) {
        opsLog.record({ op: 'conflict_delete', path, meta: { id: item.id } })
      }
    }
    return { ok: true, deleted }
  }
}
