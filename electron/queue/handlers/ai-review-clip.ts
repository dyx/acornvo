import type { JobHandler } from '../runner'

interface ClipRow {
  id: number
  title: string | null
  path: string
}

export interface AiReviewClipDeps {
  readClipRow: (id: number) => ClipRow | null
  readMdFile: (path: string) => Promise<{ frontmatter: Record<string, unknown>; body: string }>
  reviewClip: (input: {
    clipId: number
    path: string
    body: string
    frontmatter: Record<string, unknown>
  }) => Promise<void>
}

interface Payload {
  clipId: number
  path: string
}

export function createAiReviewClipHandler(deps: AiReviewClipDeps): JobHandler {
  return async ({ payload }) => {
    const p = payload as Partial<Payload>
    if (typeof p.clipId !== 'number' || typeof p.path !== 'string') {
      return { kind: 'fail', error: 'E_INVALID_PAYLOAD' }
    }
    const clip = deps.readClipRow(p.clipId)
    if (!clip) return { kind: 'fail', error: 'E_CLIP_NOT_FOUND' }
    const { frontmatter, body } = await deps.readMdFile(p.path)
    try {
      await deps.reviewClip({ clipId: p.clipId, path: p.path, body, frontmatter })
      return { kind: 'ok' }
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'E_NOT_IMPLEMENTED') {
        return { kind: 'retry', delayMs: 60 * 60 * 1000, reason: 'E_NOT_IMPLEMENTED' }
      }
      throw e
    }
  }
}
