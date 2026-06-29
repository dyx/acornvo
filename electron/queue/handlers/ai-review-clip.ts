import type { JobHandler } from '../runner'
import { reviewClip } from '../../ai/reviewer'
import { writeUsage } from '../../ai/usage'
import { settingsStore } from '../../settings/store'
import { logger } from '../../obs/logger'

export const aiReviewClipHandler: JobHandler = async (ctx) => {
  const { job, payload, log } = ctx
  const clipId = payload.clipId as number
  const force = payload.force as boolean | undefined
  const modelId = settingsStore.get('ai').defaultReviewerModelId
  const t0 = Date.now()

  logger().info('queue', {
    msg: '[ai-review-clip] handler start',
    meta: {
      jobId: job.id,
      clipId,
      force,
      modelId,
      attempt: job.attempts
    }
  })

  try {
    const out = await reviewClip(clipId, { force })
    writeUsage({
      jobId: job.id,
      modelId: out.llmCall?.modelId ?? modelId ?? null,
      usage: out.llmCall?.usage,
      rawUsageJson: out.llmCall?.rawUsageJson ?? null,
      latencyMs: out.llmCall?.latencyMs ?? Date.now() - t0,
      ok: 1,
      error: null
    })
    logger().info('queue', {
      msg: '[ai-review-clip] handler ok',
      meta: {
        jobId: job.id,
        clipId,
        cacheHit: out.cacheHit,
        model: out.llmCall?.model ?? null,
        latencyMs: out.llmCall?.latencyMs ?? Date.now() - t0
      }
    })
    log('info', `ai-review-clip ok clipId=${clipId} cacheHit=${out.cacheHit}`)
    return { kind: 'ok' }
  } catch (e) {
    const err = e as { code?: string; message?: string; llmCall?: any }
    const code = err.code ?? 'E_UNKNOWN'
    const msg = err.message || code

    writeUsage({
      jobId: job.id,
      modelId: err.llmCall?.modelId ?? modelId ?? null,
      usage: err.llmCall?.usage,
      rawUsageJson: err.llmCall?.rawUsageJson ?? null,
      latencyMs: err.llmCall?.latencyMs ?? Date.now() - t0,
      ok: 0,
      error: code
    })
    log('warn', `ai-review-clip ${code} clipId=${clipId} msg=${msg}`)

    // Only 429 / 503 (both mapped to E_RATE) are retryable
    if (code === 'E_RATE') {
      logger().warn('queue', {
        msg: '[ai-review-clip] rate limited / server busy, will retry in 60s',
        meta: { jobId: job.id, clipId }
      })
      return { kind: 'retry', delayMs: 60_000, reason: 'rate-limited' }
    }
    if (code === 'E_MTIME_CONFLICT') {
      logger().warn('queue', {
        msg: '[ai-review-clip] mtime conflict, will retry in 60s',
        meta: { jobId: job.id, clipId }
      })
      return { kind: 'retry', delayMs: 60_000, reason: 'mtime-conflict' }
    }

    // All other errors are permanent failures (400/401/402/422/500 etc.)
    logger().error('queue', {
      msg: '[ai-review-clip] permanent failure',
      meta: {
        jobId: job.id,
        clipId,
        code,
        message: msg.slice(0, 500)
      }
    })
    return { kind: 'fail', error: code }
  }
}
