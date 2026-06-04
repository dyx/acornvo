
import { IpcError } from '@shared/ipc-contract'
import { logger } from '../obs/logger'
import { aiUsage } from '../ai/usage'
import { getQueueBootstrap } from '../queue'
import { dbService } from '../services/db'
import { settingsStore } from '../settings/store'

function requireStore() {
  const b = getQueueBootstrap()
  if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)')
  return b.store
}

export const aiHandlers = {
  async reviewClip(clipId: number, opts?: { force?: boolean }) {
    logger().info('ai', { msg: '[ai.reviewClip] called', meta: { clipId, opts } })

    const modelId = settingsStore.get('ai').defaultReviewerModelId
    logger().debug('ai', { msg: '[ai.reviewClip] defaultReviewerModelId resolved', meta: { modelId } })
    if (!modelId) {
      logger().error('ai', { msg: '[ai.reviewClip] no AI model configured' })
      throw new IpcError('E_MISSING_PROFILE', 'No AI provider model configured')
    }
    const row = dbService
      .requireCurrent()
      .prepare('SELECT path FROM files WHERE rowid = ?')
      .get(clipId) as { path: string } | undefined
    if (!row) {
      logger().error('ai', { msg: '[ai.reviewClip] clip not found', meta: { clipId } })
      throw new IpcError('E_NOT_FOUND', `clip ${clipId} not found`)
    }
    logger().debug('ai', { msg: '[ai.reviewClip] clip found', meta: { clipId, path: row.path } })

    const force = opts?.force === true
    const dedupeKey = `clip:${clipId}`
    const { id } = requireStore().enqueue(
      'ai-review-clip',
      { clipId, path: row.path, force },
      { dedupeKey }
    )
    logger().info('ai', { msg: '[ai.reviewClip] job enqueued', meta: { jobId: id, clipId, force, dedupeKey } })
    return { jobId: id }
  },

  async ['usage.summary'](opts?: { sinceDays?: number }) {
    return aiUsage.summary(opts)
  },

  async ['usage.list'](opts: { limit: number; offset: number; modelId?: string; okOnly?: boolean }) {
    return aiUsage.list(opts)
  }
}
