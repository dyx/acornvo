import { IpcError, type IpcContract } from '@shared/ipc-contract'
import { requireCurrent, getCurrentGrovePath } from '../services/db'
import { rebuildFts } from '../services/search/rebuild'
import { isRebuilding, _setRebuildingForTest } from '../services/search/index'
import { quickSwitch, fullText, suggest } from '../services/search/queries'
import { stats } from '../services/search/stats'
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
  quickSwitch: (q: string, opts?: { limit?: number }): FileSummary[] => {
    const db = requireCurrent()
    return quickSwitch(db, q, opts ?? {})
  },
  fullText: (
    q: string,
    opts?: { limit?: number; offset?: number }
  ): { items: { summary: FileSummary; body: string; heading_path: string }[]; total: number; pending: boolean } => {
    if (isRebuilding()) {
      return { items: [], total: 0, pending: true }
    }
    const db = requireCurrent()
    return fullText(db, q, opts ?? {})
  },
  suggest: (q: string): FileSummary[] => {
    const db = requireCurrent()
    return suggest(db, q)
  },
  stats: (): { fts_rows: number; last_rebuild_at: string | null } => {
    const db = requireCurrent()
    const grove = getCurrentGrovePath()
    if (!grove) throw new IpcError('E_INVALID_ARGS', 'no grove opened')
    return stats(db, grove)
  }
}
