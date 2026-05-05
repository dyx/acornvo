import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../ai/reviewer', () => ({
  reviewClip: vi.fn(async (clipId: number, opts: any) => ({
    result: {
      summary: `summary for ${clipId}`,
      suggestedTitle: 'Suggested Title',
      tags: ['t1'],
      keyQuotes: ['quote'],
      reviewedAt: '2026-05-04T00:00:00Z',
    },
    cacheHit: false,
    llmCall: {
      model: 'gpt-x',
      latencyMs: 100,
      promptTokens: 10,
      completionTokens: 5,
    },
  })),
}));
import { reviewClip } from '../../ai/reviewer';
import clipSummary from './clip_summary';

beforeEach(() => { (reviewClip as any).mockClear(); });

describe('clip_summary', () => {
  it('calls reviewer.reviewClip and returns summary', async () => {
    const r: any = await clipSummary.execute({ clipId: '1' } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    expect(r.ok).toBe(true);
    expect(r.data.summary).toBe('summary for 1');
    expect(r.data.reviewedAt).toBe('2026-05-04T00:00:00Z');
    expect(r.data.model).toBe('gpt-x');
    expect(reviewClip).toHaveBeenCalledWith(1, { force: false });
  });

  it('forwards force=true', async () => {
    await clipSummary.execute({ clipId: '2', force: true } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    expect(reviewClip).toHaveBeenCalledWith(2, { force: true });
  });

  it('declares sideEffect=false', () => {
    expect(clipSummary.sideEffect).toBe(false);
    expect((clipSummary.parameters as any).required).toEqual(['clipId']);
  });

  it('returns E_INVALID_ARGS for non-numeric clipId', async () => {
    const r: any = await clipSummary.execute({ clipId: 'abc' } as any, { sessionId: 's', vaultRoot: '/v', signal: new AbortController().signal, log: () => {} });
    expect(r).toEqual({ ok: false, error: 'E_INVALID_ARGS', detail: 'clipId must be a positive integer' });
  });
});
