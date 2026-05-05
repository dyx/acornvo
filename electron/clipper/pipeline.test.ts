import { describe, it, expect, vi } from 'vitest'
import { createPipeline, type PipelineDeps } from './pipeline'
import type {
  Extractor,
  ExtractorDeps
} from './extract'
import type { Dedupe } from './dedupe'

import type { ExtractResult, EnrichedResult } from '@shared/clipper-types'
import type { ClipInput, ClipErrorCode } from '@shared/clipper-types'
import type { Clip } from '@shared/clip-types'

// --- helpers ---

function makeExtractOk(over: Partial<ExtractResult> = {}): ExtractResult {
  return {
    ok: true,
    title: 'Test Article',
    content: '<p>Hello</p>',
    textContent: 'Hello',
    length: 5,
    excerpt: 'Hello',
    url: 'https://example.com/article',
    ...over
  }
}

function makeExtractErr(error: ClipErrorCode): ExtractResult {
  return { ok: false, error }
}

function makeExtractor(result: ExtractResult): Extractor {
  return {
    extract: vi.fn<Extractor['extract']>().mockResolvedValue(result)
  }
}

function makeDedupe(existing: Clip | null = null): Dedupe {
  return {
    findExisting: vi.fn<Dedupe['findExisting']>().mockResolvedValue(existing)
  }
}

function makeClip(over: Partial<Clip> = {}): Clip {
  return {
    id: 1,
    url: 'https://example.com/article',
    path: 'inbox/test-abc123.md',
    title: 'Test Article',
    site: 'example.com',
    author: null,
    publishedAt: null,
    clippedAt: '2026-05-03T00:00:00Z',
    excerpt: null,
    contentLength: 5,
    degraded: false,
    createdAt: '2026-05-03T00:00:00Z',
    ...over
  }
}

function makeDefaultDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    extract: makeExtractor(makeExtractOk()),
    transform: vi.fn().mockReturnValue('# Test Article\n\nHello'),
    dedupe: makeDedupe(null),
    writeAtomic: vi.fn().mockResolvedValue(undefined),
    indexUpsert: vi.fn().mockResolvedValue(undefined),
    clipsDao: {
      create: vi.fn().mockResolvedValue(makeClip()),
      getByUrl: vi.fn().mockResolvedValue(null)
    },
    opsLog: vi.fn(),
    nowIso: vi.fn().mockReturnValue('2026-05-03T10:00:00Z'),
    nowDate: vi.fn().mockReturnValue('2026-05-03'),
    extractTimeoutMs: 5000,
    ...over
  }
}

// --- tests ---

describe('pipeline.clip', () => {
  it('returns preview on successful extract + transform (happy path)', async () => {
    const deps = makeDefaultDeps()
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const result = await pipeline.clip(wc)

    expect(result.runId).toBeTruthy()
    expect(typeof result.runId).toBe('string')
    expect(result.preview.title).toBe('Test Article')
    expect(result.preview.url).toBe('https://example.com/article')
    expect(result.preview.site).toBe('example.com')
    expect(result.preview.body).toBe('# Test Article\n\nHello')
    expect(result.preview.tags).toEqual([])
    expect(result.preview.degraded).toBe(false)
  })

  it('rejects non-http URL with E_UNSUPPORTED_SCHEME', async () => {
    const deps = makeDefaultDeps()
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'chrome://settings', isDestroyed: () => false } as any

    await expect(pipeline.clip(wc)).rejects.toMatchObject({
      code: 'E_UNSUPPORTED_SCHEME'
    })
  })

  it('rejects already-clipped URL with E_ALREADY_CLIPPED', async () => {
    const existing = makeClip()
    const deps = makeDefaultDeps({ dedupe: makeDedupe(existing) })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    await expect(pipeline.clip(wc)).rejects.toMatchObject({
      code: 'E_ALREADY_CLIPPED',
      context: expect.objectContaining({ existingId: existing.id })
    })
  })

  it('rejects E_EXTRACT_TIMEOUT from extractor', async () => {
    const deps = makeDefaultDeps({
      extract: makeExtractor(makeExtractErr('E_EXTRACT_TIMEOUT'))
    })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    await expect(pipeline.clip(wc)).rejects.toMatchObject({
      code: 'E_EXTRACT_TIMEOUT'
    })
  })

  it('rejects E_EXTRACT_EMPTY from extractor', async () => {
    const deps = makeDefaultDeps({
      extract: makeExtractor(makeExtractErr('E_EXTRACT_EMPTY'))
    })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    await expect(pipeline.clip(wc)).rejects.toMatchObject({
      code: 'E_EXTRACT_EMPTY'
    })
  })

  it('rejects E_TRANSFORM_FAILED when transform throws', async () => {
    const deps = makeDefaultDeps({
      transform: vi.fn().mockImplementation(() => {
        throw new Error('transform error')
      })
    })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    await expect(pipeline.clip(wc)).rejects.toMatchObject({
      code: 'E_TRANSFORM_FAILED'
    })
  })
})

describe('pipeline.saveClip', () => {
  it('writes file, creates DB row, and returns ClipResult on success', async () => {
    const deps = makeDefaultDeps()
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    // First: clip to get runId + in-flight state
    const start = await pipeline.clip(wc)

    // Then: saveClip with the runId
    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: ['ai'] }
    const result = await pipeline.saveClip(input)

    expect(result.id).toBe(1)
    expect(result.path).toContain('.md')
    expect(result.url).toBe('https://example.com/article')
    expect(deps.writeAtomic).toHaveBeenCalled()
    expect(deps.clipsDao.create).toHaveBeenCalled()
  })

  it('tries -1 and -2 suffixes when atomic write fails with EEXIST', async () => {
    let callCount = 0
    const writtenPaths: string[] = []
    const writeAtomic = vi.fn().mockImplementation(async (path: string) => {
      writtenPaths.push(path)
      callCount++
      if (callCount <= 2) {
        const err = new Error('EEXIST: file already exists') as NodeJS.ErrnoException
        err.code = 'EEXIST'
        throw err
      }
    })
    // create mock that returns the path it received
    const clipsDao = {
      create: vi.fn().mockImplementation(async (input: any) =>
        makeClip({ path: input.path })
      ),
      getByUrl: vi.fn().mockResolvedValue(null)
    }
    const deps = makeDefaultDeps({ writeAtomic, clipsDao })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: [] }

    const result = await pipeline.saveClip(input)
    expect(callCount).toBe(3) // first attempt + -1 + -2
    expect(result.path).toContain('-2')
    expect(result.id).toBe(1)
    // Verify suffixes were tried
    expect(writtenPaths[0]).toMatch(/^inbox\/.+-\w{6}\.md$/)
    expect(writtenPaths[1]).toContain('-1.md')
    expect(writtenPaths[2]).toContain('-2.md')
  })

  it('throws E_WRITE_FAILED after exhausting EEXIST retries', async () => {
    const writeAtomic = vi.fn().mockRejectedValue(Object.assign(
      new Error('EEXIST: file already exists'),
      { code: 'EEXIST' }
    ))
    const deps = makeDefaultDeps({ writeAtomic })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: [] }

    await expect(pipeline.saveClip(input)).rejects.toMatchObject({
      code: 'E_WRITE_FAILED'
    })
  })

  it('still succeeds when indexUpsert throws (best-effort)', async () => {
    const indexUpsert = vi.fn().mockRejectedValue(new Error('index failed'))
    const deps = makeDefaultDeps({ indexUpsert })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: [] }

    const result = await pipeline.saveClip(input)
    expect(result.id).toBe(1)
    expect(indexUpsert).toHaveBeenCalled()
  })

  it('still succeeds when opsLog throws (best-effort)', async () => {
    const opsLog = vi.fn().mockImplementation(() => {
      throw new Error('ops log failed')
    })
    const deps = makeDefaultDeps({ opsLog })
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: [] }

    const result = await pipeline.saveClip(input)
    expect(result.id).toBe(1)
    expect(opsLog).toHaveBeenCalled()
  })
})

describe('pipeline.cancelClip', () => {
  it('removes in-flight state so saveClip rejects', async () => {
    const deps = makeDefaultDeps()
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    pipeline.cancelClip(start.runId)

    const input: ClipInput = { runId: start.runId, title: 'Test Article', tags: [] }
    await expect(pipeline.saveClip(input)).rejects.toMatchObject({
      code: 'E_INTERNAL'
    })
  })
})

describe('pipeline.reextract', () => {
  it('re-runs extract+transform and updates in-flight preview', async () => {
    const deps = makeDefaultDeps()
    const pipeline = createPipeline(deps)
    const wc = { getURL: () => 'https://example.com/article', isDestroyed: () => false } as any

    const start = await pipeline.clip(wc)
    const originalBody = start.preview.body

    // Change the extractor result for reextract
    const reExtractResult = makeExtractOk({
      title: 'Updated Article',
      content: '<p>Updated content</p>',
      textContent: 'Updated content',
      length: 15
    })
    deps.extract = makeExtractor(reExtractResult)
    ;(deps.transform as ReturnType<typeof vi.fn>).mockReturnValue('# Updated Article\n\nUpdated content')

    const updated = await pipeline.reextract(start.runId, wc)
    expect(updated.preview.title).toBe('Updated Article')
    expect(updated.preview.body).toBe('# Updated Article\n\nUpdated content')
  })
})
