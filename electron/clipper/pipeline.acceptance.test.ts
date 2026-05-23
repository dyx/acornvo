import { describe, it, expect, vi } from 'vitest'
import { buildSlug, sha6 } from './slug'
import { transformHtmlToMarkdown } from './transform'

const { mockStoreEnqueue } = vi.hoisted(() => ({
  mockStoreEnqueue: vi.fn().mockReturnValue({ id: 'job-1' })
}))

vi.mock('../queue', () => ({
  getQueueBootstrap: () => ({ store: { enqueue: mockStoreEnqueue }, runner: {} })
}))

import { createPipeline } from './pipeline'

// --- OpenSpec 9.6 — slug rules ---
describe('OpenSpec 9.6 — slug rules', () => {
  it('Chinese title → jieba-segmented words + sha6', () => {
    const slug = buildSlug({ title: '深度学习入门指南', url: 'https://example.com/a' })
    expect(slug).toMatch(/[一-龥]/)
    expect(slug.endsWith('-' + sha6('https://example.com/a'))).toBe(true)
  })
  it('English title → slugify result + sha6', () => {
    const slug = buildSlug({ title: 'Hello World, A Primer!', url: 'https://example.com/b' })
    expect(slug).toBe('hello-world-a-primer-' + sha6('https://example.com/b'))
  })
})

// --- OpenSpec 9.7 — extract timeout ---
describe('OpenSpec 9.7 — extract timeout', () => {
  it('pipeline.clip rejects on extract timeout', async () => {
    const p = createPipeline({
      extract: { extract: vi.fn(async () => ({ ok: false, error: 'E_EXTRACT_TIMEOUT' }) as any) },
      transform: vi.fn(),
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic: vi.fn(),
      indexUpsert: vi.fn(),
      clipsDao: { create: vi.fn(), getByUrl: vi.fn(async () => null) },
      opsLog: vi.fn(),
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => '2026-05-02',
      extractTimeoutMs: 5000
    } as any)
    await expect(
      p.clip({ isDestroyed: () => false, getURL: () => 'https://x/', getTitle: () => 't' } as any)
    ).rejects.toThrow(/E_EXTRACT_TIMEOUT/)
  })
})

// --- OpenSpec 9.8 — degraded ---
describe('OpenSpec 9.8 — degraded', () => {
  it('extract degraded=true → preview.degraded=true', async () => {
    const p = createPipeline({
      extract: {
        extract: vi.fn(
          async () =>
            ({
              ok: true,
              degraded: true,
              title: 'T',
              content: '<p>x</p>',
              url: 'https://x/',
              lang: 'en'
            }) as any
        )
      },
      transform: (h: string) => h,
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic: vi.fn(),
      indexUpsert: vi.fn(),
      clipsDao: { create: vi.fn(), getByUrl: vi.fn(async () => null) },
      opsLog: vi.fn(),
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => '2026-05-02',
      extractTimeoutMs: 5000
    } as any)
    const r = await p.clip({
      isDestroyed: () => false,
      getURL: () => 'https://x/',
      getTitle: () => 'T'
    } as any)
    expect(r.preview.degraded).toBe(true)
  })
})

// --- OpenSpec 9.9 — relative link ---
describe('OpenSpec 9.9 — relative link', () => {
  it('<a href="/x"> → absolute', () => {
    const md = transformHtmlToMarkdown('<a href="/x">go</a>', 'https://example.com/a/b')
    expect(md.trim()).toBe('[go](https://example.com/x)')
  })
})

// --- OpenSpec 9.10 — img srcset ---
describe('OpenSpec 9.10 — img srcset stripped', () => {
  it('keeps src + alt, drops srcset', () => {
    const md = transformHtmlToMarkdown(
      '<img src="https://cdn/a.png" srcset="https://cdn/a.png 1x" alt="A">',
      'https://x/'
    )
    expect(md.trim()).toBe('![A](https://cdn/a.png)')
    expect(md).not.toMatch(/srcset/)
  })
})

// --- OpenSpec 9.11 — fenced code ---
describe('OpenSpec 9.11 — fenced code block', () => {
  it('language-ts → ```ts', () => {
    const md = transformHtmlToMarkdown(
      '<pre><code class="language-ts">const a = 1;</code></pre>',
      'https://x/'
    )
    expect(md).toContain('```ts')
    expect(md).toContain('const a = 1;')
  })
})

// --- OpenSpec 9.12 — GFM table ---
describe('OpenSpec 9.12 — GFM table', () => {
  it('table → pipe-style markdown', () => {
    const html =
      '<table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>'
    const md = transformHtmlToMarkdown(html, 'https://x/')
    expect(md).toContain('| Name | Score |')
    expect(md).toContain('| --- | --- |')
    expect(md).toContain('| A | 1 |')
  })
})

// OpenSpec 9.17 — write failure tested in electron/clipper/pipeline.test.ts (task 4.4)

// --- OpenSpec 9.18 — ops_log + enqueue ---
describe('OpenSpec 9.18 — ops_log + enqueue', () => {
  it('saveClip success calls opsLog and enqueues ai-review-clip job', async () => {
    mockStoreEnqueue.mockClear()
    const opsLog = vi.fn()
    const p = createPipeline({
      extract: {
        extract: vi.fn(
          async () =>
            ({
              ok: true,
              title: 'X',
              content: '<p>x</p>',
              url: 'https://x/'
            }) as any
        )
      },
      transform: (h: string) => h,
      dedupe: { findExisting: vi.fn(async () => null) },
      writeAtomic: vi.fn(async () => {}),
      indexUpsert: vi.fn(),
      clipsDao: {
        create: vi.fn(async () => ({
          id: 7,
          url: 'x',
          path: 'p',
          title: 'X',
          site: 'x',
          author: null,
          publishedAt: null,
          clippedAt: '',
          excerpt: null,
          contentLength: null,
          degraded: false,
          createdAt: ''
        })),
        getByUrl: vi.fn(async () => null)
      },
      opsLog,
      nowIso: () => '2026-05-02T10:00:00+08:00',
      nowDate: () => '2026-05-02',
      extractTimeoutMs: 5000
    } as any)
    const start = await p.clip({
      isDestroyed: () => false,
      getURL: () => 'https://x/',
      getTitle: () => 'X'
    } as any)
    const r = await p.saveClip({ runId: start.runId, title: 'X', tags: [] })
    expect(r.id).toBe(7)
    expect(opsLog).toHaveBeenCalled()
    expect(mockStoreEnqueue).toHaveBeenCalledWith(
      'ai-review-clip',
      { clipId: 7, path: expect.stringContaining('.md') as string },
      { dedupeKey: 'clip:7' }
    )
  })
})
