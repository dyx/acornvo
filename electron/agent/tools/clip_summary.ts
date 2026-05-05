import type { Tool } from '../../../shared/agent-types';
import { reviewClip } from '../../ai/reviewer';

const tool: Tool<{ clipId: string; force?: boolean }, unknown> = {
  name: 'clip_summary',
  description: 'Generate (or re-fetch the cached) AI summary for a clipped article. Returns the summary, tags, and review timestamp. Pass `force: true` to re-run even if a recent review exists.',
  parameters: {
    type: 'object',
    properties: {
      clipId: { type: 'string', description: 'Clip ID — find these by searching files where frontmatter.kind === "clip".' },
      force: { type: 'boolean', description: 'Re-run review even if cached.' },
    },
    required: ['clipId'],
  },
  sideEffect: false,
  async execute(args) {
    const clipId = Number(args.clipId);
    if (!Number.isFinite(clipId) || clipId < 1) {
      return { ok: false as const, error: 'E_INVALID_ARGS', detail: 'clipId must be a positive integer' };
    }
    try {
      const r = await reviewClip(clipId, { force: !!args.force });
      return {
        ok: true as const,
        data: {
          summary: r.result.summary,
          tags: r.result.tags ?? [],
          reviewedAt: r.result.reviewedAt,
          model: r.llmCall?.model ?? null,
          cacheHit: r.cacheHit,
        },
      };
    } catch (e: any) {
      return { ok: false as const, error: e?.code ?? 'E_REVIEW_FAILED', detail: e?.message };
    }
  },
};
export default tool;
