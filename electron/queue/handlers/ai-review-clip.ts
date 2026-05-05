import type { JobHandler } from '../runner';
import { reviewClip } from '../../ai/reviewer';
import { aiUsage } from '../../ai/usage';
import { settingsStore } from '../../settings/store';

const FAIL_CODES = new Set([
  'E_MISSING_PROFILE', 'E_CONFIG', 'E_AUTH',
  'E_CLIP_NOT_FOUND', 'E_FILE_NOT_FOUND',
]);

const BACKOFF_MS = [1_000, 5_000, 30_000, 120_000, 900_000];
function nextDelay(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

export const aiReviewClipHandler: JobHandler = async (ctx) => {
  const { job, payload, log } = ctx;
  const clipId = payload.clipId as number;
  const force = payload.force as boolean | undefined;
  const profileId = settingsStore.get('ai').defaultProfileId;
  const t0 = Date.now();

  try {
    const out = await reviewClip(clipId, { force });
    aiUsage.insert({
      jobId: job.id,
      profileId: profileId ?? null,
      model: out.llmCall?.model ?? null,
      promptTokens: out.llmCall?.promptTokens ?? null,
      completionTokens: out.llmCall?.completionTokens ?? null,
      latencyMs: out.llmCall?.latencyMs ?? (Date.now() - t0),
      ok: 1,
      error: null,
    });
    log('info', `ai-review-clip ok clipId=${clipId} cacheHit=${out.cacheHit}`);
    return { kind: 'ok' };
  } catch (e) {
    const code = (e as any)?.code ?? 'E_UNKNOWN';
    aiUsage.insert({
      jobId: job.id,
      profileId: profileId ?? null,
      model: null,
      promptTokens: null,
      completionTokens: null,
      latencyMs: Date.now() - t0,
      ok: 0,
      error: code,
    });
    log('warn', `ai-review-clip ${code} clipId=${clipId}`);

    if (FAIL_CODES.has(code)) return { kind: 'fail', error: code };
    if (code === 'E_RATE') return { kind: 'retry', delayMs: 60_000, reason: 'rate-limited' };
    if (code === 'E_MTIME_CONFLICT') return { kind: 'retry', delayMs: 600_000, reason: 'mtime-conflict' };
    return { kind: 'retry', delayMs: nextDelay(job.attempts), reason: code };
  }
};
