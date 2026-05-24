import type { IpcContract } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'
import { logger } from '../services/logger'
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
    logger.info('[ai.reviewClip] called', { clipId, opts })

    const profileId = settingsStore.get('ai').defaultProfileId
    logger.debug('[ai.reviewClip] defaultProfileId resolved', { profileId })
    if (!profileId) {
      logger.error('[ai.reviewClip] no AI profile configured')
      throw new IpcError('E_MISSING_PROFILE', 'No AI provider profile configured')
    }
    const row = dbService
      .requireCurrent()
      .prepare('SELECT path FROM clips WHERE id = ?')
      .get(clipId) as { path: string } | undefined
    if (!row) {
      logger.error('[ai.reviewClip] clip not found', { clipId })
      throw new IpcError('E_NOT_FOUND', `clip ${clipId} not found`)
    }
    logger.debug('[ai.reviewClip] clip found', { clipId, path: row.path })

    const force = opts?.force === true
    const dedupeKey = `clip:${clipId}`
    const { id } = requireStore().enqueue(
      'ai-review-clip',
      { clipId, path: row.path, force },
      { dedupeKey }
    )
    logger.info('[ai.reviewClip] job enqueued', { jobId: id, clipId, force, dedupeKey })
    return { jobId: id }
  },

  async ['usage.summary'](opts) {
    return aiUsage.summary(opts)
  },

  async ['usage.list'](opts) {
    return aiUsage.list(opts)
  }
}
