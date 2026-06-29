import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { reviewClip } from '../../ai/reviewer'

const ClipSummarySchema = z.object({
  clipId: z
    .string()
    .min(1)
    .describe('Clip ID — find these by searching files where frontmatter.kind === "clip".'),
  force: z
    .boolean()
    .describe('Re-run review even if cached. Pass false normally, pass true to force re-run.')
})

export const clipSummaryTool = tool(
  async ({ clipId, force }) => {
    const num = Number(clipId)
    if (!Number.isFinite(num) || num < 1) {
      return {
        ok: false as const,
        error: 'E_INVALID_ARGS',
        detail: 'clipId must be a positive integer'
      }
    }
    try {
      const r = await reviewClip(num, { force: !!force })
      return {
        ok: true as const,
        data: {
          summary: r.result.summary,
          tags: r.result.tags ?? [],
          reviewedAt: r.result.reviewedAt,
          model: r.llmCall?.model ?? null,
          cacheHit: r.cacheHit
        }
      }
    } catch (e) {
      const err = e as { code?: string; message?: string }
      return { ok: false as const, error: err.code ?? 'E_REVIEW_FAILED', detail: err.message }
    }
  },
  {
    name: 'clip_summary',
    description:
      'Generate (or re-fetch the cached) AI summary for a clipped article. Returns the summary, tags, and review timestamp. Pass `force: true` to re-run even if a recent review exists.',
    schema: ClipSummarySchema
  }
)

export default clipSummaryTool
