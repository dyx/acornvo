import type { JobHandler } from '../runner'
import { reviewClip } from '../../ai/reviewer'
import { writeUsage } from '../../ai/usage'
import { settingsStore } from '../../settings/store'
import { getPerf } from '../../obs/perf'

const FAIL_CODES = new Set([
  'E_MISSING_PROFILE',
  'E_CONFIG',
  'E_AUTH',
  'E_CLIP_NOT_FOUND',
  'E_FILE_NOT_FOUND'
])

const BACKOFF_MS = [5_000, 30_000, 120_000]
function nextDelay(attempts: number): number | null {
  if (attempts >= BACKOFF_MS.length) return null
  return BACKOFF_MS[attempts]
}

export const aiReviewClipHandler: JobHandler = async (ctx) => {
  const { job, payload, log } = ctx
  const clipId = payload.clipId as number
  const force = payload.force as boolean | undefined
  const profileId = settingsStore.get('ai').defaultProfileId
  const t0 = Date.now()

  const p = getPerf()
  const end = p?.start('clipper.ai-review', { clipId, force })

  try {
    const out = await reviewClip(clipId, { force })
    writeUsage({
      jobId: job.id,
      profileId: profileId ?? null,
      model: out.llmCall?.model ?? null,
      promptTokens: out.llmCall?.promptTokens ?? null,
      completionTokens: out.llmCall?.completionTokens ?? null,
      latencyMs: out.llmCall?.latencyMs ?? Date.now() - t0,
      ok: 1,
      error: null
    })
    end?.({ ok: true, meta: { model: out.llmCall?.model ?? null, cacheHit: out.cacheHit } })
    log('info', `ai-review-clip ok clipId=${clipId} cacheHit=${out.cacheHit}`)
    return { kind: 'ok' }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    const code = err.code ?? 'E_UNKNOWN'
    const msg = err.message || code

    writeUsage({
      jobId: job.id,
      profileId: profileId ?? null,
      model: null,
      latencyMs: Date.now() - t0,
      ok: 0,
      error: code
    })
    end?.({ ok: false, meta: { error: code } })
    log('warn', `ai-review-clip ${code} clipId=${clipId} msg=${msg}`)

    if (FAIL_CODES.has(code)) {
      return { kind: 'fail', error: code }
    }

    if (code === 'E_RATE') return { kind: 'retry', delayMs: 60_000, reason: 'rate-limited' }
    if (code === 'E_MTIME_CONFLICT')
      return { kind: 'retry', delayMs: 60_000, reason: 'mtime-conflict' }
    return {
      kind: 'retry',
      delayMs: nextDelay(job.attempts),
      reason: code === 'E_UNKNOWN' ? code : msg
    }
  }
}
