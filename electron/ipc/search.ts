import { IpcError, type IpcContract } from '@shared/ipc-contract'
import { requireCurrent, getCurrentGrovePath } from '../services/db'
import { rebuildFts } from '../services/search/rebuild'
import { isRebuilding, _setRebuildingForTest } from '../services/search/index'
import type { FileSummary } from '@shared/file-types'

type SearchContract = IpcContract['search']

type SearchHandlers = {
  [M in keyof SearchContract]: SearchContract[M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

export const searchHandlers: SearchHandlers = {
  rebuild: async () => {
    const db = requireCurrent()
    const grove = getCurrentGrovePath()
    if (!grove) throw new IpcError('E_INVALID_ARGS', 'no grove opened')
    if (isRebuilding()) return { ok: true } as const
    _setRebuildingForTest(true)
    try {
      await rebuildFts(db, grove)
    } finally {
      _setRebuildingForTest(false)
    }
    return { ok: true } as const
  },
  fullText: async (
    _q: string,
    _opts?: { limit?: number; offset?: number }
  ): Promise<{ items: { summary: FileSummary; snippet: string }[]; total: number; pending: boolean }> => {
    // Plan 1 stub: only the pending branch is wired. Plan 2 task 4.3 swaps in the full
    // jieba + FTS5 MATCH implementation. Until then, callers always get an empty list.
    if (isRebuilding()) {
      return { items: [], total: 0, pending: true }
    }
    return { items: [], total: 0, pending: false }
  }
}
