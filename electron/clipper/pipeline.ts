import { randomUUID } from 'node:crypto'
import { IpcError } from '@shared/ipc-contract'
import type {
  ClipRunId,
  ClipInput,
  ClipResult,
  ClipPreview,
  ClipErrorCode,
  EnrichedResult
} from '@shared/clipper-types'
import type { Clip, ClipCreateInput } from '@shared/clip-types'
import type { Extractor } from './extract'
import type { Dedupe } from './dedupe'
import { getQueueBootstrap } from '../queue'
import { logger } from '../obs/logger'
import { enrich } from './enrich'
import { buildSlug } from './slug'
import type { WebContents } from 'electron'

// --- types ---

export interface PipelineDeps {
  extract: Extractor
  transform: (html: string, baseUrl: string) => string
  dedupe: Dedupe
  writeAtomic: (path: string, data: string) => Promise<void>
  indexUpsert: (path: string, content: string) => Promise<void>
  clipsDao: {
    create: (input: ClipCreateInput) => Promise<Clip>
    getByUrl: (url: string) => Promise<Clip | null>
  }
  opsLog: (opts: { op: string; path: string; meta?: Record<string, unknown> }) => void
  nowIso: () => string
  nowDate: () => string
  extractTimeoutMs: number
}

interface InFlightState {
  url: string
  enriched: EnrichedResult
  markdown: string
  preview: ClipPreview
  runId: ClipRunId
}

interface ClipStartResult {
  runId: ClipRunId
  preview: ClipPreview
}

const HTTP_RE = /^https?:\/\//i

const PREVIEW_EXCERPT_LEN = 200

function buildFrontmatter(preview: ClipPreview, tags: string[], isoDate: string): string {
  const lines: string[] = ['---']
  lines.push(`title: "${escapeYaml(preview.title)}"`)
  lines.push(`source: ${preview.url}`)
  lines.push(`site: ${preview.site}`)
  if (preview.author) lines.push(`author: "${escapeYaml(preview.author)}"`)
  if (preview.publishedTime) lines.push(`published: ${preview.publishedTime}`)
  if (preview.lang) lines.push(`lang: ${preview.lang}`)
  lines.push(`clipped: ${isoDate}`)
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`)
  lines.push('---')
  lines.push('')
  return lines.join('\n')
}

function escapeYaml(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildPreview(
  enriched: EnrichedResult,
  markdown: string,
  suggestedPath: string,
  runId: string
): ClipPreview {
  return {
    runId,
    title: enriched.title || '',
    url: enriched.url,
    site: enriched.site,
    author: enriched.author,
    publishedTime: enriched.publishedTime,
    lang: enriched.lang,
    excerpt: enriched.excerpt
      ? enriched.excerpt.length > PREVIEW_EXCERPT_LEN
        ? enriched.excerpt.slice(0, PREVIEW_EXCERPT_LEN)
        : enriched.excerpt
      : undefined,
    body: markdown,
    suggestedPath,
    tags: [],
    degraded: enriched.degraded
  }
}

function rootName(path: string): string {
  const dot = path.lastIndexOf('.md')
  return dot > 0 ? path.slice(0, dot) : path
}

/**
 * Create a clip pipeline. All IO dependencies are injected so tests can
 * replace them without touching the filesystem, database, or browser.
 */
export function createPipeline(deps: PipelineDeps) {
  const flights = new Map<ClipRunId, InFlightState>()

  function clipError(code: ClipErrorCode, message: string, context?: Record<string, unknown>): IpcError {
    return new IpcError(code as any, message, context)
  }

  async function clip(webContents: WebContents): Promise<ClipStartResult> {
    const rawUrl = webContents.isDestroyed() ? '' : (webContents.getURL() || '')
    if (!HTTP_RE.test(rawUrl)) {
      throw clipError('E_UNSUPPORTED_SCHEME', `cannot clip non-http URL: ${rawUrl || '(empty)'}`)
    }

    const existing = await deps.dedupe.findExisting(rawUrl)
    if (existing) {
      throw clipError(
        'E_ALREADY_CLIPPED',
        `URL already clipped as id=${existing.id}`,
        { existingId: existing.id, existingPath: existing.path }
      )
    }

    // Extract
    const extractResult = await deps.extract.extract(webContents)
    if (!extractResult.ok) {
      throw clipError(
        (extractResult.error || 'E_EXTRACT_EMPTY') as ClipErrorCode,
        extractResult.error || 'extraction returned no article'
      )
    }

    // Enrich
    const enriched = enrich(extractResult)

    // Transform
    let markdown: string
    try {
      markdown = deps.transform(enriched.content, enriched.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw clipError('E_TRANSFORM_FAILED', `markdown transform failed: ${msg}`)
    }

    // Build preview + suggested path
    const runId: ClipRunId = randomUUID()
    const slug = buildSlug({ title: enriched.title || '', url: enriched.url })
    const suggestedPath = `inbox/${slug}.md`

    const preview = buildPreview(enriched, markdown, suggestedPath, runId)

    flights.set(runId, {
      url: enriched.url,
      enriched,
      markdown,
      preview,
      runId
    })

    return { runId, preview }
  }

  async function saveClip(input: ClipInput): Promise<ClipResult> {
    const state = flights.get(input.runId)
    if (!state) {
      throw new IpcError('E_INTERNAL', `no in-flight clip for runId=${input.runId}`)
    }

    // Merge user edits into the preview
    const finalPreview: ClipPreview = {
      ...state.preview,
      title: input.title,
      tags: input.tags,
      excerpt: input.excerpt ?? state.preview.excerpt
    }

    const isoDate = deps.nowIso()
    const frontmatter = buildFrontmatter(finalPreview, input.tags, isoDate)
    const fileContent = frontmatter + state.markdown

    // Build path with EEXIST retry logic
    let path = finalPreview.suggestedPath
    let writeErr: unknown
    for (let suffix = 0; suffix <= 2; suffix++) {
      if (suffix > 0) {
        const base = rootName(finalPreview.suggestedPath)
        path = `${base}-${suffix}.md`
      }
      try {
        await deps.writeAtomic(path, fileContent)
        writeErr = null
        break
      } catch (err) {
        writeErr = err
        if (!isEexist(err)) throw err
      }
    }
    if (writeErr) {
      // All retries exhausted
      throw clipError('E_WRITE_FAILED', `atomic write failed after retries: ${path}`)
    }

    // Create DB row
    const clippedAt = isoDate
    const clipRow: ClipCreateInput = {
      url: state.url,
      path,
      title: finalPreview.title || null,
      site: state.enriched.site || null,
      author: state.enriched.author || null,
      publishedAt: state.enriched.publishedTime || null,
      clippedAt,
      excerpt: finalPreview.excerpt || null,
      contentLength: state.enriched.length ?? null,
      degraded: state.enriched.degraded
    }

    let clipResult: Clip
    try {
      clipResult = await deps.clipsDao.create(clipRow)
    } catch (err) {
      if (err instanceof IpcError && err.code === 'E_DUPLICATE') {
        throw clipError('E_DUPLICATE', err.message, err.context)
      }
      throw err
    }

    // Index (best-effort)
    try {
      await deps.indexUpsert(path, fileContent)
    } catch {
      // non-blocking
    }

    // Ops log (best-effort)
    try {
      deps.opsLog({ op: 'clip', path, meta: { url: state.url, id: clipResult.id } })
    } catch {
      // non-blocking
    }

    // Enqueue ai-review-clip job (phase-14)
    const queue = getQueueBootstrap()
    if (queue) {
      try {
        queue.store.enqueue(
          'ai-review-clip',
          { clipId: clipResult.id, path },
          { dedupeKey: `clip:${clipResult.id}` }
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        logger().error('clipper', { op: 'enqueue-review', ok: false, msg: 'ai-review-clip enqueue failed; clip already saved', meta: { clipId: clipResult.id, error: msg } })
      }
    } else {
      logger().warn('clipper', { op: 'enqueue-review', ok: false, msg: 'queue bootstrap unavailable; ai-review-clip not enqueued', meta: { clipId: clipResult.id } })
    }

    flights.delete(input.runId)

    return {
      id: clipResult.id,
      path: clipResult.path,
      url: clipResult.url,
      title: clipResult.title || '',
      degraded: clipResult.degraded
    }
  }

  function cancelClip(runId: ClipRunId): void {
    flights.delete(runId)
  }

  async function reextract(runId: ClipRunId, webContents: WebContents): Promise<ClipStartResult> {
    const state = flights.get(runId)
    if (!state) {
      throw new IpcError('E_INTERNAL', `no in-flight clip for runId=${runId}`)
    }

    const extractResult = await deps.extract.extract(webContents)
    if (!extractResult.ok) {
      throw clipError(
        (extractResult.error || 'E_EXTRACT_EMPTY') as ClipErrorCode,
        extractResult.error || 'extraction returned no article'
      )
    }

    const enriched = enrich(extractResult)

    let markdown: string
    try {
      markdown = deps.transform(enriched.content, enriched.url)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw clipError('E_TRANSFORM_FAILED', `markdown transform failed: ${msg}`)
    }

    const preview = buildPreview(enriched, markdown, state.preview.suggestedPath, runId)

    // Update in-flight state
    flights.set(runId, {
      url: enriched.url,
      enriched,
      markdown,
      preview,
      runId
    })

    return { runId, preview }
  }

  function _getFlightForTest(id: ClipRunId): InFlightState | undefined {
    return flights.get(id)
  }

  return { clip, saveClip, cancelClip, reextract, _getFlightForTest }
}

function isEexist(err: unknown): boolean {
  if (err instanceof Error) {
    return (err as NodeJS.ErrnoException).code === 'EEXIST'
  }
  return false
}
