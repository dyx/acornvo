import type { IpcContract } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'
import { aiUsage } from '../ai/usage'
import { getQueueBootstrap } from '../queue'
import { dbService } from '../services/db'
import { settingsStore } from '../settings/store'

function requireStore() {
  const b = getQueueBootstrap()
  if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)')
  return b.store
}

export const aiHandlers: IpcContract['ai'] = {
  async reviewClip(clipId, opts) {
    const profileId = settingsStore.get('ai').defaultProfileId
    if (!profileId) {
      throw new IpcError('E_MISSING_PROFILE', 'No AI provider profile configured')
    }
    const row = dbService
      .requireCurrent()
      .prepare('SELECT path FROM clips WHERE id = ?')
      .get(clipId) as { path: string } | undefined
    if (!row) throw new IpcError('E_NOT_FOUND', `clip ${clipId} not found`)
    const force = opts?.force === true
    const dedupeKey = `clip:${clipId}`
    const { id } = requireStore().enqueue(
      'ai-review-clip',
      { clipId, path: row.path, force },
      { dedupeKey }
    )
    return { jobId: id }
  },

  async ['usage.summary'](opts) {
    return aiUsage.summary(opts)
  },

  async ['usage.list'](opts) {
    return aiUsage.list(opts)
  }
}
