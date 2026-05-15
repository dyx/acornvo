import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../ai/reviewer', () => ({
  reviewClip: vi.fn(),
}));

import { reviewClip } from '../../ai/reviewer';
import { clipSummaryTool } from './clip_summary';

beforeEach(() => {
  (reviewClip as unknown as ReturnType<typeof vi.fn>).mockReset();
});

describe('clip_summary tool', () => {
  it('returns summary + tags + reviewedAt + model + cacheHit when reviewClip succeeds', async () => {
    (reviewClip as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: { summary: 's', tags: ['a-b'], reviewedAt: 't', suggestedTitle: 'T', keyQuotes: [] },
      llmCall: { model: 'gpt-4o-mini', latencyMs: 1, promptTokens: 1, completionTokens: 1 },
      cacheHit: false,
    });
    const r = (await clipSummaryTool.invoke({ clipId: '1' })) as {
      ok: true;
      data: { summary: string; tags: string[]; reviewedAt: string; model: string | null; cacheHit: boolean };
    };
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      summary: 's',
      tags: ['a-b'],
      reviewedAt: 't',
      model: 'gpt-4o-mini',
      cacheHit: false,
    });
    expect(reviewClip).toHaveBeenCalledWith(1, { force: false });
  });

  it('returns E_INVALID_ARGS for non-numeric clipId', async () => {
    const r = (await clipSummaryTool.invoke({ clipId: 'abc' })) as {
      ok: false;
      error: string;
      detail?: string;
    };
    expect(r).toEqual({
      ok: false,
      error: 'E_INVALID_ARGS',
      detail: 'clipId must be a positive integer',
    });
  });

  it('returns E_INVALID_ARGS for negative clipId', async () => {
    const r = (await clipSummaryTool.invoke({ clipId: '-1' })) as { ok: false; error: string };
    expect(r.error).toBe('E_INVALID_ARGS');
  });

  it('maps reviewer errors via error.code', async () => {
    (reviewClip as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 'E_RATE' })
    );
    const r = (await clipSummaryTool.invoke({ clipId: '1' })) as { ok: false; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toBe('E_RATE');
  });

  it('passes force flag through to reviewClip', async () => {
    (reviewClip as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      result: { summary: 's', tags: [], reviewedAt: 't', suggestedTitle: 'T', keyQuotes: [] },
      cacheHit: false,
    });
    await clipSummaryTool.invoke({ clipId: '1', force: true });
    expect(reviewClip).toHaveBeenCalledWith(1, { force: true });
  });

  it('exposes LangChain tool shape', () => {
    expect(clipSummaryTool.name).toBe('clip_summary');
    expect(clipSummaryTool.schema).toBeDefined();
    expect(typeof clipSummaryTool.invoke).toBe('function');
  });
});
