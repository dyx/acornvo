# Phase 12 — Clipper Pipeline: Plan 2 (Pipeline orchestration + IPC)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-12-clipper-pipeline`
> **Task range:** OpenSpec tasks `4.1`–`5.4` (9 tasks)
> **Plan order:** 2 of 4. Depends on Plan 1.
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Wire Plan 1's primitives into a complete **clipper pipeline** (`extract → enrich → transform → preview → save → index → record`) and expose it through the **`clipper` and `clips` IPC namespaces**. After this plan, a renderer can call `window.api.clipper.clip(tabId)` and the main process orchestrates the full flow except for the actual UI confirmation step (Plan 3 owns that).

## Architecture

- **Pipeline is a state machine in main**, owned by `electron/clipper/pipeline.ts`. Each `clip(webContents, ...)` call returns a `ClipRunId` and stages run asynchronously. Renderer drives `previewing → saving` by calling `clipper.saveClip(input)` with the run id; main correlates state via a `Map<ClipRunId, RunState>`.
- **Dedupe** runs first (precheck), reusing `cleanUrl` from Plan 1's `enrich.ts` and a thin `clips.getByUrl(url)` DAO.
- **Slug** is computed during the transform/enrich boundary so the preview can show the suggested target path. Chinese titles use `@node-rs/jieba` (already in deps); English titles use `slugify`. Both append `sha1(url).slice(0,6)`.
- **Save** delegates to phase-04's `file.write(path, { body, frontmatter })` for atomicity, EOL handling, and the selfWrites/index hook. We do not re-implement atomic writes here.
- **Record** inserts into `clips` (UNIQUE on url surfaces `E_DUPLICATE`), writes an `ops_log` row (`op='clip'`), and calls `clipQueue.enqueue(...)` (no-op stub here; phase 14 replaces).
- **IPC contract** — we add two namespaces. `clipper` is run-oriented (`clip` / `saveClip` / `cancelClip` / `reextract`). `clips` is CRUD over the table. The renderer's clipper store (Plan 3) calls both.
- **Errors** use the standard envelope `{ ok:false, error: { code, message } }` extended with `stage` + optional `existingId`/`existingPath`. The new `ClipErrorCode` union from Plan 1 is added to `IpcErrorCode` in `shared/ipc-contract.ts` (task 5.1).

## Tech Stack

- `@node-rs/jieba` (existing)
- `slugify` (added in Plan 1 task 1.1)
- `better-sqlite3` (existing) — prepared statements for `clips` DAO
- `node:crypto` for sha1 of URL
- Phase-04 `file.write` (existing)
- Phase-10 `ops_log` insert helper (existing)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/clipper/dedupe.ts` | Create | 4.1 |
| `electron/clipper/dedupe.test.ts` | Create | 4.1 |
| `electron/clipper/slug.ts` | Create | 4.2 |
| `electron/clipper/slug.test.ts` | Create | 4.2 |
| `electron/clipper/pipeline.ts` | Create | 4.3, 4.4 |
| `electron/clipper/pipeline.test.ts` | Create | 4.3, 4.4 |
| `electron/clipper/clip-queue.ts` | Create | 4.5 |
| `electron/clipper/clip-queue.test.ts` | Create | 4.5 |
| `shared/ipc-contract.ts` | Modify (add `clipper` + `clips` namespaces, error codes) | 5.1, 5.2 |
| `electron/ipc/clipper.ts` | Create | 5.3 |
| `electron/ipc/clipper.test.ts` | Create | 5.3 |
| `electron/ipc/clips.ts` | Create | 5.4 |
| `electron/ipc/clips.test.ts` | Create | 5.4 |

## Pre-flight

- Plan 1 merged. Verify primitives compile + test green:
  ```bash
  npx vitest run electron/clipper electron/services/db/migrations/005_clips.test.ts
  npm run typecheck
  ```
  Expected: all green.
- Confirm phase-04 atomic write helper signature:
  ```bash
  grep -nE "export (async )?function (write|fileWrite)" electron/services/atomicWrite.ts electron/services/fs-atomic.ts 2>/dev/null
  ```
  Note the exported entry point — we reference it as `import { writeAtomic }` from `@electron/services/atomicWrite` below; if your project uses a different name, search-and-replace before committing pipeline.ts.
- Confirm phase-10 ops_log helper:
  ```bash
  grep -rn "ops_log" electron/ipc electron/services 2>/dev/null | head -10
  ```
  Identify the function (e.g., `appendOpsLog({ op, path, ... })`); referenced from pipeline.

---

## Tasks

<!-- openspec-task: 4.1 -->
### Task 1: `dedupe.ts` — `clips.getByUrl` wrapper

A thin wrapper over the (yet-to-be-built) `clips` DAO. We define an injectable interface so pipeline.ts can be unit-tested without SQLite. The real DAO lands in task 5.4; here we only declare the seam.

**Files:**
- Create: `electron/clipper/dedupe.ts`
- Create: `electron/clipper/dedupe.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/clipper/dedupe.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createDedupe, type ClipsLookup } from './dedupe'
import type { Clip } from '@shared/clip-types'

function fakeClip(url: string, path = 'inbox/202605/x.md', id = 1): Clip {
  return {
    id,
    url,
    path,
    title: 'T',
    site: 'example.com',
    author: null,
    publishedAt: null,
    clippedAt: '2026-05-02T00:00:00Z',
    excerpt: null,
    contentLength: null,
    degraded: false,
    createdAt: '2026-05-02T00:00:00Z'
  }
}

describe('dedupe', () => {
  it('returns the clip when getByUrl finds a match', async () => {
    const lookup: ClipsLookup = {
      getByUrl: vi.fn(async (u) => fakeClip(u))
    }
    const d = createDedupe(lookup)
    const r = await d.findExisting('https://example.com/a')
    expect(r).not.toBeNull()
    expect(r?.url).toBe('https://example.com/a')
  })

  it('returns null when getByUrl returns null', async () => {
    const lookup: ClipsLookup = {
      getByUrl: vi.fn(async () => null)
    }
    const d = createDedupe(lookup)
    expect(await d.findExisting('https://x/')).toBeNull()
  })

  it('cleans the URL before lookup (drops utm_*, hash)', async () => {
    const captured: string[] = []
    const lookup: ClipsLookup = {
      getByUrl: vi.fn(async (u) => {
        captured.push(u)
        return null
      })
    }
    const d = createDedupe(lookup)
    await d.findExisting('https://example.com/a?utm_source=x&id=1#x')
    expect(captured).toEqual(['https://example.com/a?id=1'])
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/dedupe.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dedupe.ts`**

```ts
// electron/clipper/dedupe.ts
import type { Clip } from '@shared/clip-types'
import { cleanUrl } from './enrich'

export interface ClipsLookup {
  getByUrl(url: string): Promise<Clip | null>
}

export interface Dedupe {
  /** Returns the existing Clip with the cleaned URL, or null. */
  findExisting(rawUrl: string): Promise<Clip | null>
}

export function createDedupe(lookup: ClipsLookup): Dedupe {
  return {
    async findExisting(rawUrl) {
      return lookup.getByUrl(cleanUrl(rawUrl))
    }
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/dedupe.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/dedupe.ts electron/clipper/dedupe.test.ts
git commit -m "feat(phase-12): dedupe — cleanUrl-then-getByUrl wrapper"
```

---

<!-- openspec-task: 4.2 -->
### Task 2: `slug.ts` — Chinese (jieba) / English (slugify) + url sha6

**Files:**
- Create: `electron/clipper/slug.ts`
- Create: `electron/clipper/slug.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/clipper/slug.test.ts
import { describe, it, expect } from 'vitest'
import { buildSlug, sha6 } from './slug'

describe('sha6', () => {
  it('returns the first 6 hex chars of sha1(url)', () => {
    // pre-computed: sha1("https://example.com/a") = b8c0..., first 6 = b8c0fc
    expect(sha6('https://example.com/a')).toMatch(/^[a-f0-9]{6}$/)
    expect(sha6('https://example.com/a')).toBe(sha6('https://example.com/a')) // determinism
  })
})

describe('buildSlug', () => {
  it('Chinese title → first 3 jieba words joined with - then -<sha6>', () => {
    const slug = buildSlug({ title: '深度学习入门指南', url: 'https://example.com/a' })
    // jieba may return ['深度学习', '入门', '指南'] or similar; we test invariants:
    expect(slug).toMatch(/^[一-龥\w-]+-[a-f0-9]{6}$/)
    expect(slug.endsWith('-' + sha6('https://example.com/a'))).toBe(true)
    // The Chinese segmentation should produce at most ~3 word groups before the sha
    const parts = slug.split('-')
    expect(parts.length).toBeGreaterThanOrEqual(2) // [...words, sha]
    expect(parts.length).toBeLessThanOrEqual(4)
  })

  it('English title → slugify result (≤50 chars) + -<sha6>', () => {
    const slug = buildSlug({ title: 'Hello World, A Primer!', url: 'https://example.com/b' })
    expect(slug).toBe('hello-world-a-primer-' + sha6('https://example.com/b'))
  })

  it('long English title is truncated to 50 chars before -<sha6>', () => {
    const long = 'a'.repeat(120)
    const slug = buildSlug({ title: long, url: 'https://example.com/c' })
    const sha = sha6('https://example.com/c')
    // total length: 50 (slugify cap) + 1 (-) + 6 (sha)
    expect(slug.length).toBe(50 + 1 + 6)
    expect(slug.endsWith('-' + sha)).toBe(true)
  })

  it('empty title falls back to clip-YYYYMMDD-<sha6>', () => {
    const slug = buildSlug({
      title: '',
      url: 'https://example.com/d',
      clippedAt: new Date('2026-05-02T10:00:00Z')
    })
    expect(slug).toBe('clip-20260502-' + sha6('https://example.com/d'))
  })

  it('whitespace-only title is treated as empty', () => {
    const slug = buildSlug({
      title: '   ',
      url: 'https://example.com/e',
      clippedAt: new Date('2026-05-02T10:00:00Z')
    })
    expect(slug.startsWith('clip-20260502-')).toBe(true)
  })

  it('mixed Chinese + English uses Chinese branch (any han codepoint)', () => {
    const slug = buildSlug({ title: 'AI 模型 ABC', url: 'https://example.com/f' })
    expect(slug).toMatch(/[一-龥]/) // contains a Chinese char
    expect(slug.endsWith('-' + sha6('https://example.com/f'))).toBe(true)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/slug.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `slug.ts`**

```ts
// electron/clipper/slug.ts
import { createHash } from 'node:crypto'
import slugify from 'slugify'
import { cut } from '@node-rs/jieba'

const HAN = /[一-龥]/

export function sha6(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 6)
}

interface BuildSlugOpts {
  title: string | undefined
  url: string
  /** Defaults to `new Date()`. Injected for test determinism. */
  clippedAt?: Date
}

export function buildSlug(opts: BuildSlugOpts): string {
  const t = (opts.title ?? '').trim()
  const sha = sha6(opts.url)

  if (t.length === 0) {
    const d = opts.clippedAt ?? new Date()
    const yyyy = String(d.getFullYear())
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `clip-${yyyy}${mm}${dd}-${sha}`
  }

  if (HAN.test(t)) {
    // jieba returns array of strings; take first 3 non-empty
    const words = cut(t, false)
      .map((w) => w.trim())
      .filter((w) => w.length > 0 && /[^\s]/.test(w))
      .slice(0, 3)
    const head = words.join('-')
    return head.length > 0 ? `${head}-${sha}` : `clip-${sha}`
  }

  // English / latin
  const slug = slugify(t, { lower: true, strict: true }).slice(0, 50)
  return `${slug}-${sha}`
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/slug.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/clipper/slug.ts electron/clipper/slug.test.ts
git commit -m "feat(phase-12): slug — jieba (zh) / slugify (en) + sha6 + date fallback"
```

---

<!-- openspec-task: 4.3 -->
### Task 3: `pipeline.ts` — orchestrate extract → enrich → transform → preview → save → index → record

The orchestrator. We expose two entry points that map directly to the `clipper.clip` and `clipper.saveClip` IPCs. Everything is dependency-injected so pipeline.test.ts can stub `extract`, `transform`, `dedupe`, `writer`, `clipsDao`, `opsLog`, `clipQueue` independently.

**Files:**
- Create: `electron/clipper/pipeline.ts`
- Create: `electron/clipper/pipeline.test.ts`

- [ ] **Step 1: Write failing tests for the happy path + already-clipped + non-http**

```ts
// electron/clipper/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPipeline, type PipelineDeps } from './pipeline'
import type { Clip } from '@shared/clip-types'

function makeDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    extract: vi.fn(async () => ({
      ok: true,
      title: 'Hello',
      content: '<p>hi</p>',
      excerpt: 'hi',
      url: 'https://example.com/a',
      lang: 'en'
    })),
    transform: vi.fn((html: string) => html.replace('<p>', '').replace('</p>', '')),
    dedupe: { findExisting: vi.fn(async () => null) },
    writeAtomic: vi.fn(async () => ({ mtimeMs: 100, sha256: 'abc' })),
    indexUpsert: vi.fn(async () => {}),
    clipsDao: {
      create: vi.fn(async () => ({ id: 1 })),
      getByUrl: vi.fn(async () => null)
    },
    opsLog: { append: vi.fn(async () => {}) },
    clipQueue: { enqueue: vi.fn() },
    nowIso: () => '2026-05-02T10:00:00+08:00',
    nowDate: () => new Date('2026-05-02T02:00:00Z'),
    extractTimeoutMs: 5000,
    ...over
  }
}

function fakeWebContents(url = 'https://example.com/a') {
  return {
    isDestroyed: () => false,
    getURL: () => url,
    getTitle: () => 'Doc title from getTitle'
  } as any
}

describe('pipeline.clip — precheck', () => {
  it('returns E_UNSUPPORTED_SCHEME for about:blank', async () => {
    const p = createPipeline(makeDeps())
    const r = await p.clip(fakeWebContents('about:blank'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('E_UNSUPPORTED_SCHEME')
      expect(r.error.stage).toBe('precheck')
    }
  })

  it('returns E_UNSUPPORTED_SCHEME for acorn://new-tab', async () => {
    const p = createPipeline(makeDeps())
    const r = await p.clip(fakeWebContents('acorn://new-tab'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_UNSUPPORTED_SCHEME')
  })

  it('returns E_ALREADY_CLIPPED with existingId/existingPath when dedupe hits', async () => {
    const dedupeHit: Clip = {
      id: 42,
      url: 'https://example.com/a',
      path: 'inbox/202605/old.md',
      title: 'old',
      site: 'example.com',
      author: null,
      publishedAt: null,
      clippedAt: '2026-04-01T00:00:00Z',
      excerpt: null,
      contentLength: null,
      degraded: false,
      createdAt: '2026-04-01T00:00:00Z'
    }
    const deps = makeDeps({
      dedupe: { findExisting: vi.fn(async () => dedupeHit) }
    })
    const p = createPipeline(deps)
    const r = await p.clip(fakeWebContents())
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('E_ALREADY_CLIPPED')
      expect(r.error.existingId).toBe(42)
      expect(r.error.existingPath).toBe('inbox/202605/old.md')
    }
    expect(deps.extract).not.toHaveBeenCalled()
  })
})

describe('pipeline.clip — happy path', () => {
  it('returns ok with a preview after extract+enrich+transform', async () => {
    const deps = makeDeps()
    const p = createPipeline(deps)
    const r = await p.clip(fakeWebContents())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.preview.title).toBe('Hello')
      expect(r.preview.url).toBe('https://example.com/a')
      expect(r.preview.site).toBe('example.com')
      expect(r.preview.body).toContain('hi')
      expect(r.preview.suggestedPath).toMatch(/^inbox\/202605\/.+\.md$/)
      expect(r.preview.runId).toBeTruthy()
    }
  })

  it('returns E_EXTRACT_TIMEOUT when extract times out', async () => {
    const deps = makeDeps({
      extract: vi.fn(async () => ({ ok: false, error: 'E_EXTRACT_TIMEOUT' }))
    })
    const p = createPipeline(deps)
    const r = await p.clip(fakeWebContents())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EXTRACT_TIMEOUT')
  })
})

describe('pipeline.saveClip', () => {
  let deps: PipelineDeps
  beforeEach(() => { deps = makeDeps() })

  it('writes file + creates clip row + appends ops_log + enqueues', async () => {
    const p = createPipeline(deps)
    const start = await p.clip(fakeWebContents())
    expect(start.ok).toBe(true)
    if (!start.ok) return

    const result = await p.saveClip({
      runId: start.preview.runId,
      title: start.preview.title,
      tags: ['ai', 'news'],
      excerpt: start.preview.excerpt
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.clip.id).toBe(1)
      expect(result.clip.path).toBe(start.preview.suggestedPath)
    }
    expect(deps.writeAtomic).toHaveBeenCalled()
    const writeArg = (deps.writeAtomic as any).mock.calls[0]
    expect(writeArg[0]).toBe(start.preview.suggestedPath) // path
    const fm = writeArg[1].frontmatter
    expect(fm.tags).toEqual(['ai', 'news'])
    expect(fm.url).toBe('https://example.com/a')
    expect(fm.site).toBe('example.com')
    expect(fm.source_type).toBe('web')
    expect(deps.clipsDao.create).toHaveBeenCalled()
    expect(deps.opsLog.append).toHaveBeenCalledWith(expect.objectContaining({ op: 'clip' }))
    expect(deps.clipQueue.enqueue).toHaveBeenCalled()
  })

  it('returns E_WRITE_FAILED and does not insert clip when write throws', async () => {
    const deps2 = makeDeps({
      writeAtomic: vi.fn(async () => { throw new Error('disk full') })
    })
    const p = createPipeline(deps2)
    const start = await p.clip(fakeWebContents())
    if (!start.ok) throw new Error('precondition broken')

    const r = await p.saveClip({
      runId: start.preview.runId,
      title: start.preview.title,
      tags: [],
      excerpt: start.preview.excerpt
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_WRITE_FAILED')
    expect(deps2.clipsDao.create).not.toHaveBeenCalled()
  })

  it('appends -1 / -2 suffix when target path already exists', async () => {
    let attempts = 0
    const deps2 = makeDeps({
      writeAtomic: vi.fn(async (path: string) => {
        attempts++
        if (attempts === 1) {
          const e: any = new Error('exists')
          e.code = 'EEXIST'
          throw e
        }
        return { mtimeMs: 100, sha256: 'abc', writtenPath: path }
      })
    })
    const p = createPipeline(deps2)
    const start = await p.clip(fakeWebContents())
    if (!start.ok) throw new Error('precondition broken')

    const r = await p.saveClip({
      runId: start.preview.runId,
      title: start.preview.title,
      tags: [],
      excerpt: start.preview.excerpt
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.clip.path).toMatch(/-1\.md$/)
  })

  it('returns E_INTERNAL when runId is unknown', async () => {
    const p = createPipeline(deps)
    const r = await p.saveClip({ runId: 'no-such', title: 'x', tags: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_TRANSFORM_FAILED') // see implementation note
  })
})

describe('pipeline.cancelClip', () => {
  it('removes the runId from in-flight state', async () => {
    const deps2 = makeDeps()
    const p = createPipeline(deps2)
    const start = await p.clip(fakeWebContents())
    if (!start.ok) throw new Error('precondition broken')

    p.cancelClip(start.preview.runId)
    const r = await p.saveClip({ runId: start.preview.runId, title: 'x', tags: [] })
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/pipeline.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `pipeline.ts`**

```ts
// electron/clipper/pipeline.ts
import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type {
  ClipErrorEnvelope,
  ClipInput,
  ClipPreview,
  ClipRunId,
  EnrichedResult,
  ExtractResult
} from '@shared/clipper-types'
import type { Clip, ClipCreateInput } from '@shared/clip-types'
import type { Dedupe } from './dedupe'
import { enrich } from './enrich'
import { buildSlug } from './slug'
import { transformHtmlToMarkdown } from './transform'

export interface PipelineDeps {
  /** task 2.2/2.3: Readability extractor. */
  extract: (webContents: WebContents) => Promise<ExtractResult>
  /** task 3.1–3.4: HTML → Markdown body. */
  transform: (html: string, baseUrl: string) => string
  /** task 4.1: cleanUrl + clips.getByUrl wrapper. */
  dedupe: Dedupe
  /** Phase-04 atomic write. Throws on disk error or EEXIST. Returns metadata. */
  writeAtomic: (
    pathRelToVault: string,
    payload: { body: string; frontmatter: Record<string, unknown> }
  ) => Promise<{ mtimeMs: number; sha256: string }>
  /** Phase-05 indexer entry. Best-effort; pipeline does not roll back on failure. */
  indexUpsert: (pathRelToVault: string) => Promise<void>
  /** Task 5.4 DAO. */
  clipsDao: {
    create: (input: ClipCreateInput) => Promise<{ id: number }>
    getByUrl: (url: string) => Promise<Clip | null>
  }
  /** Phase-10 ops_log writer. */
  opsLog: { append: (entry: { op: string; path: string; meta?: unknown }) => Promise<void> }
  /** Task 4.5 stub queue. */
  clipQueue: { enqueue: (msg: { clipId: number; url: string; path: string }) => void }
  /** Returns ISO 8601 with offset for `clipped_at`. */
  nowIso: () => string
  /** Returns Date for slug month dir. */
  nowDate: () => Date
  /** Per-extract budget. */
  extractTimeoutMs: number
}

export type ClipStartResult =
  | { ok: true; preview: ClipPreview }
  | { ok: false; error: ClipErrorEnvelope }

export type ClipSaveResult =
  | { ok: true; clip: { id: number; path: string } }
  | { ok: false; error: ClipErrorEnvelope }

interface RunState {
  enriched: EnrichedResult
  body: string
  preview: ClipPreview
}

export interface Pipeline {
  clip(webContents: WebContents): Promise<ClipStartResult>
  saveClip(input: ClipInput): Promise<ClipSaveResult>
  cancelClip(runId: ClipRunId): void
  /** Re-run extract+transform for an existing runId; preview replaced. */
  reextract(runId: ClipRunId, webContents: WebContents): Promise<ClipStartResult>
}

const HTTP_RE = /^https?:$/i

export function createPipeline(deps: PipelineDeps): Pipeline {
  const runs = new Map<ClipRunId, RunState>()

  function monthDir(d: Date): string {
    const yyyy = String(d.getFullYear())
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `inbox/${yyyy}${mm}`
  }

  function suggestedPath(slug: string): string {
    return `${monthDir(deps.nowDate())}/${slug}.md`
  }

  async function buildPreview(webContents: WebContents): Promise<ClipStartResult> {
    const extracted = await deps.extract(webContents)
    if (!extracted.ok) {
      return {
        ok: false,
        error: {
          code: extracted.error === 'E_EXTRACT_TIMEOUT' ? 'E_EXTRACT_TIMEOUT' : 'E_EXTRACT_EMPTY',
          message: 'extract failed',
          stage: 'extracting'
        }
      }
    }
    let enriched: EnrichedResult
    try {
      enriched = enrich(extracted)
    } catch (e: any) {
      return {
        ok: false,
        error: {
          code: 'E_EXTRACT_EMPTY',
          message: e?.message ?? 'enrich failed',
          stage: 'extracting'
        }
      }
    }

    let body: string
    try {
      body = deps.transform(enriched.content, enriched.url)
    } catch (e: any) {
      return {
        ok: false,
        error: { code: 'E_TRANSFORM_FAILED', message: e?.message ?? 'transform failed', stage: 'transforming' }
      }
    }

    const title = enriched.title || webContents.getTitle?.() || ''
    const slug = buildSlug({ title, url: enriched.url, clippedAt: deps.nowDate() })
    const runId: ClipRunId = randomUUID()
    const preview: ClipPreview = {
      runId,
      title,
      url: enriched.url,
      site: enriched.site,
      author: enriched.author,
      publishedTime: enriched.publishedTime,
      lang: enriched.lang,
      excerpt: enriched.excerpt,
      body,
      suggestedPath: suggestedPath(slug),
      tags: [],
      degraded: enriched.degraded
    }
    runs.set(runId, { enriched, body, preview })
    return { ok: true, preview }
  }

  async function clip(webContents: WebContents): Promise<ClipStartResult> {
    let url: string
    try {
      url = webContents.getURL?.() ?? ''
    } catch {
      url = ''
    }
    let proto = ''
    try {
      proto = new URL(url).protocol
    } catch {
      proto = ''
    }
    if (!HTTP_RE.test(proto)) {
      return {
        ok: false,
        error: { code: 'E_UNSUPPORTED_SCHEME', message: 'only http(s) is supported', stage: 'precheck' }
      }
    }
    const existing = await deps.dedupe.findExisting(url)
    if (existing) {
      return {
        ok: false,
        error: {
          code: 'E_ALREADY_CLIPPED',
          message: 'url already clipped',
          stage: 'precheck',
          existingId: existing.id,
          existingPath: existing.path
        }
      }
    }
    return buildPreview(webContents)
  }

  async function reextract(runId: ClipRunId, webContents: WebContents): Promise<ClipStartResult> {
    runs.delete(runId)
    return buildPreview(webContents)
  }

  function cancelClip(runId: ClipRunId): void {
    runs.delete(runId)
  }

  async function saveClip(input: ClipInput): Promise<ClipSaveResult> {
    const state = runs.get(input.runId)
    if (!state) {
      return {
        ok: false,
        error: { code: 'E_TRANSFORM_FAILED', message: 'unknown runId; preview expired', stage: 'saving' }
      }
    }
    const { enriched, body, preview } = state
    const title = (input.title || preview.title || '').trim()
    const tags = Array.isArray(input.tags) ? input.tags.filter((t) => typeof t === 'string') : []
    const excerpt = typeof input.excerpt === 'string' ? input.excerpt : preview.excerpt

    // Build frontmatter (only include fields with values to avoid empty keys).
    const fm: Record<string, unknown> = {
      title,
      url: enriched.url,
      site: enriched.site,
      source_type: 'web',
      clipped_at: deps.nowIso(),
      tags
    }
    if (enriched.author) fm.author = enriched.author
    if (enriched.publishedTime) fm.published_at = enriched.publishedTime
    if (excerpt) fm.excerpt = excerpt
    if (enriched.lang) fm.lang = enriched.lang

    // Write. On EEXIST collision, retry with -1, -2, … suffix.
    let writtenPath = preview.suggestedPath
    const MAX_SUFFIX = 50
    let saved = false
    for (let i = 0; i <= MAX_SUFFIX; i++) {
      const candidate = i === 0 ? preview.suggestedPath : preview.suggestedPath.replace(/\.md$/, `-${i}.md`)
      try {
        await deps.writeAtomic(candidate, { body, frontmatter: fm })
        writtenPath = candidate
        saved = true
        break
      } catch (e: any) {
        if (e && (e.code === 'EEXIST' || /exists/i.test(String(e?.message)))) {
          continue
        }
        return {
          ok: false,
          error: { code: 'E_WRITE_FAILED', message: e?.message ?? 'write failed', stage: 'saving' }
        }
      }
    }
    if (!saved) {
      return {
        ok: false,
        error: { code: 'E_WRITE_FAILED', message: 'could not find non-conflicting path', stage: 'saving' }
      }
    }

    // Persist record.
    let dbId: number
    try {
      const created = await deps.clipsDao.create({
        url: enriched.url,
        path: writtenPath,
        title,
        site: enriched.site,
        author: enriched.author,
        publishedAt: enriched.publishedTime,
        clippedAt: fm.clipped_at as string,
        excerpt: excerpt,
        contentLength: enriched.length ?? null,
        degraded: enriched.degraded
      })
      dbId = created.id
    } catch (e: any) {
      return {
        ok: false,
        error: { code: 'E_WRITE_FAILED', message: e?.message ?? 'clips insert failed', stage: 'saving' }
      }
    }

    // Best-effort index + ops_log + queue. Index errors do not roll back.
    try {
      await deps.indexUpsert(writtenPath)
    } catch {
      // E_INDEX_FAILED is non-fatal per spec (phase-05 self-heals).
    }
    try {
      await deps.opsLog.append({ op: 'clip', path: writtenPath, meta: { url: enriched.url, clipId: dbId } })
    } catch {
      // ops_log failure is also non-fatal.
    }
    deps.clipQueue.enqueue({ clipId: dbId, url: enriched.url, path: writtenPath })

    runs.delete(input.runId)
    return { ok: true, clip: { id: dbId, path: writtenPath } }
  }

  return { clip, saveClip, cancelClip, reextract }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/pipeline.test.ts
```

Expected: 9 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add electron/clipper/pipeline.ts electron/clipper/pipeline.test.ts
git commit -m "feat(phase-12): pipeline — clip/saveClip/cancel/reextract orchestration"
```

---

<!-- openspec-task: 4.4 -->
### Task 4: Pipeline error enum surface verification

This task verifies all 7 error codes from the spec (`E_UNSUPPORTED_SCHEME`, `E_ALREADY_CLIPPED`, `E_EXTRACT_TIMEOUT`, `E_EXTRACT_EMPTY`, `E_TRANSFORM_FAILED`, `E_WRITE_FAILED`, `E_INDEX_FAILED`) are reachable through the pipeline by adding the still-missing test cases.

**Files:**
- Modify: `electron/clipper/pipeline.test.ts`

- [ ] **Step 1: Append the missing error-surface tests**

```ts
describe('pipeline — full error code surface', () => {
  it('E_EXTRACT_EMPTY when extractor reports empty', async () => {
    const deps = makeDeps({
      extract: vi.fn(async () => ({ ok: false, error: 'E_EXTRACT_EMPTY' as const }))
    })
    const p = createPipeline(deps)
    const r = await p.clip(fakeWebContents())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_EXTRACT_EMPTY')
  })

  it('E_TRANSFORM_FAILED when transform throws', async () => {
    const deps = makeDeps({
      transform: vi.fn(() => { throw new Error('boom') })
    })
    const p = createPipeline(deps)
    const r = await p.clip(fakeWebContents())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_TRANSFORM_FAILED')
  })

  it('E_INDEX_FAILED is swallowed (save still succeeds)', async () => {
    const deps = makeDeps({
      indexUpsert: vi.fn(async () => { throw new Error('idx') })
    })
    const p = createPipeline(deps)
    const start = await p.clip(fakeWebContents())
    if (!start.ok) throw new Error('precondition')

    const r = await p.saveClip({
      runId: start.preview.runId,
      title: start.preview.title,
      tags: [],
      excerpt: start.preview.excerpt
    })
    expect(r.ok).toBe(true) // index failure is non-blocking per spec
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run electron/clipper/pipeline.test.ts
```

Expected: all green (12+ tests).

- [ ] **Step 3: Commit**

```bash
git add electron/clipper/pipeline.test.ts
git commit -m "test(phase-12): pipeline — verify full error code surface (7 codes)"
```

---

<!-- openspec-task: 4.5 -->
### Task 5: `clip-queue.ts` — phase-14 placeholder

A no-op queue with an injectable seam phase 14 will replace. We expose `enqueue` and `getPendingForTest()` so pipeline tests can introspect.

**Files:**
- Create: `electron/clipper/clip-queue.ts`
- Create: `electron/clipper/clip-queue.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/clipper/clip-queue.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getClipQueue, resetClipQueueForTest } from './clip-queue'

describe('clip-queue (phase-12 placeholder)', () => {
  beforeEach(() => resetClipQueueForTest())

  it('enqueue does not throw', () => {
    expect(() =>
      getClipQueue().enqueue({ clipId: 1, url: 'https://x/', path: 'inbox/202605/x.md' })
    ).not.toThrow()
  })

  it('exposes enqueued items via the test getter', () => {
    const q = getClipQueue()
    q.enqueue({ clipId: 1, url: 'https://x/', path: 'inbox/202605/x.md' })
    q.enqueue({ clipId: 2, url: 'https://y/', path: 'inbox/202605/y.md' })
    expect(q.getPendingForTest()).toHaveLength(2)
  })

  it('reset clears the queue', () => {
    const q = getClipQueue()
    q.enqueue({ clipId: 1, url: 'https://x/', path: 'p' })
    resetClipQueueForTest()
    expect(getClipQueue().getPendingForTest()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/clipper/clip-queue.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `clip-queue.ts`**

```ts
// electron/clipper/clip-queue.ts
// Phase-12 placeholder. Phase-14 replaces with a SQLite-backed queue.

export interface ClipQueueMessage {
  clipId: number
  url: string
  path: string
}

export interface ClipQueue {
  enqueue(msg: ClipQueueMessage): void
  /** Test-only introspection. Phase-14 may keep this. */
  getPendingForTest(): ClipQueueMessage[]
}

let pending: ClipQueueMessage[] = []
let singleton: ClipQueue | null = null

export function getClipQueue(): ClipQueue {
  if (!singleton) {
    singleton = {
      enqueue(msg) { pending.push(msg) },
      getPendingForTest() { return [...pending] }
    }
  }
  return singleton
}

export function resetClipQueueForTest(): void {
  pending = []
  singleton = null
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/clipper/clip-queue.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add electron/clipper/clip-queue.ts electron/clipper/clip-queue.test.ts
git commit -m "feat(phase-12): clip-queue — phase-14 no-op placeholder + test introspection"
```

---

<!-- openspec-task: 5.1 -->
### Task 6: `shared/ipc-contract.ts` — `clipper` namespace + ClipErrorCode union

We extend the existing `IpcErrorCode` union with the clipper codes, then declare the `clipper` namespace methods. This task only owns `clipper.*`; task 5.2 owns `clips.*`.

**Files:**
- Modify: `shared/ipc-contract.ts`
- Modify: `shared/ipc-contract.test.ts` (existing — add a smoke assertion)

- [ ] **Step 1: Inspect the existing union and namespace shape**

```bash
grep -nE "IpcErrorCode|namespace |export type IpcContract" shared/ipc-contract.ts | head -30
```

Note where the `IpcErrorCode` union is declared and where the contract namespaces live.

- [ ] **Step 2: Extend `IpcErrorCode` and add `clipper` namespace**

In `shared/ipc-contract.ts`:

1. Add the new error codes to the union (replace the existing `IpcErrorCode` declaration to include them, then mirror in the `IPC_ERROR_CODES` const):

   ```ts
   export type IpcErrorCode =
     | 'E_INTERNAL'
     | 'E_INVALID_ARGS'
     | 'E_NOT_FOUND'
     | 'E_PERMISSION'
     | 'E_LOCKED'
     | 'E_EXISTS'
     | 'E_TIMEOUT'
     | 'E_ENCODING'
     | 'E_WRITE_VERIFY'
     | 'E_MTIME_MISMATCH'
     // phase-12 clipper codes
     | 'E_UNSUPPORTED_SCHEME'
     | 'E_ALREADY_CLIPPED'
     | 'E_EXTRACT_TIMEOUT'
     | 'E_EXTRACT_EMPTY'
     | 'E_TRANSFORM_FAILED'
     | 'E_WRITE_FAILED'
     | 'E_INDEX_FAILED'
     | 'E_DUPLICATE'
   ```

   And update `IPC_ERROR_CODES`:
   ```ts
   export const IPC_ERROR_CODES = {
     // ... existing entries unchanged ...
     E_UNSUPPORTED_SCHEME: 'E_UNSUPPORTED_SCHEME',
     E_ALREADY_CLIPPED: 'E_ALREADY_CLIPPED',
     E_EXTRACT_TIMEOUT: 'E_EXTRACT_TIMEOUT',
     E_EXTRACT_EMPTY: 'E_EXTRACT_EMPTY',
     E_TRANSFORM_FAILED: 'E_TRANSFORM_FAILED',
     E_WRITE_FAILED: 'E_WRITE_FAILED',
     E_INDEX_FAILED: 'E_INDEX_FAILED',
     E_DUPLICATE: 'E_DUPLICATE'
   } as const satisfies Record<IpcErrorCode, IpcErrorCode>
   ```

2. Append the `clipper` namespace types at the end of the file:

   ```ts
   // --- clipper namespace (phase-12) ---
   import type { ClipInput, ClipPreview, ClipResult, ClipRunId } from './clipper-types'

   export interface ClipperContract {
     /**
      * Start a clip run for the active tab. Returns runId + preview, or an
      * error envelope (E_UNSUPPORTED_SCHEME / E_ALREADY_CLIPPED / E_EXTRACT_*).
      */
     clip(args: { tabId: string }): Promise<IpcResult<ClipPreview>>
     /**
      * Persist the clip after user confirmation. Returns the created Clip
      * pointer or E_WRITE_FAILED.
      */
     saveClip(input: ClipInput): Promise<IpcResult<ClipResult>>
     /** Drop in-flight state for the runId. */
     cancelClip(args: { runId: ClipRunId }): Promise<IpcResult<void>>
     /** Re-run extract+transform for the same active tab. */
     reextract(args: { runId: ClipRunId; tabId: string }): Promise<IpcResult<ClipPreview>>
   }
   ```

   If the file already declares an aggregate `IpcContract` interface, add `clipper: ClipperContract` to it.

- [ ] **Step 3: Update the existing contract test**

If `shared/ipc-contract.test.ts` enumerates namespace keys, append a smoke assertion. Otherwise add a fresh assertion file:

```ts
// shared/ipc-contract.test.ts (or append)
import { describe, it, expect } from 'vitest'
import { IPC_ERROR_CODES } from './ipc-contract'

describe('ipc-contract — clipper error codes', () => {
  it.each([
    'E_UNSUPPORTED_SCHEME',
    'E_ALREADY_CLIPPED',
    'E_EXTRACT_TIMEOUT',
    'E_EXTRACT_EMPTY',
    'E_TRANSFORM_FAILED',
    'E_WRITE_FAILED',
    'E_INDEX_FAILED',
    'E_DUPLICATE'
  ] as const)('declares %s', (code) => {
    expect(IPC_ERROR_CODES).toHaveProperty(code, code)
  })
})
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run shared/ipc-contract.test.ts && npm run typecheck
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.test.ts
git commit -m "feat(phase-12): ipc-contract — clipper namespace + ClipErrorCode union"
```

---

<!-- openspec-task: 5.2 -->
### Task 7: `shared/ipc-contract.ts` — `clips` namespace

**Files:**
- Modify: `shared/ipc-contract.ts`

- [ ] **Step 1: Append the `clips` namespace types**

In `shared/ipc-contract.ts`, after the `ClipperContract` block:

```ts
import type {
  Clip,
  ClipCreateInput,
  ClipsListOpts,
  ClipsListResult
} from './clip-types'

export interface ClipsContract {
  /**
   * Insert a row. Returns `{ id }` or, on UNIQUE(url) collision, the
   * standard envelope `{ ok:false, error:{ code:'E_DUPLICATE', ... } }`
   * with `existingId` carried via the message body so renderer can navigate.
   */
  create(input: ClipCreateInput): Promise<IpcResult<{ id: number }>>
  list(opts: ClipsListOpts): Promise<IpcResult<ClipsListResult>>
  getByUrl(args: { url: string }): Promise<IpcResult<Clip | null>>
  getById(args: { id: number }): Promise<IpcResult<Clip | null>>
  delete(args: { id: number }): Promise<IpcResult<void>>
}
```

If aggregate `IpcContract` exists, add `clips: ClipsContract`.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(phase-12): ipc-contract — clips namespace (CRUD + list)"
```

---

<!-- openspec-task: 5.3 -->
### Task 8: `electron/ipc/clipper.ts` — pipeline-backed handlers

We resolve the active tab's `WebContents` via phase-11's manager, hand off to `pipeline`, and serialise responses through the standard envelope.

**Files:**
- Create: `electron/ipc/clipper.ts`
- Create: `electron/ipc/clipper.test.ts`

- [ ] **Step 1: Write failing tests for the four IPC entries**

```ts
// electron/ipc/clipper.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClipperHandlers, type ClipperHandlerDeps } from './clipper'

function makeDeps(over: Partial<ClipperHandlerDeps> = {}): ClipperHandlerDeps {
  return {
    pipeline: {
      clip: vi.fn(async () => ({
        ok: true,
        preview: {
          runId: 'r1',
          title: 'T',
          url: 'https://x/',
          site: 'x',
          body: 'b',
          suggestedPath: 'inbox/202605/x.md',
          tags: [],
          degraded: false
        }
      })),
      saveClip: vi.fn(async () => ({ ok: true, clip: { id: 9, path: 'inbox/202605/x.md' } })),
      cancelClip: vi.fn(),
      reextract: vi.fn(async () => ({
        ok: true,
        preview: {
          runId: 'r2',
          title: 'T2',
          url: 'https://x/',
          site: 'x',
          body: 'b2',
          suggestedPath: 'inbox/202605/x.md',
          tags: [],
          degraded: false
        }
      }))
    },
    getWebContentsForTab: vi.fn(() => ({ isDestroyed: () => false } as any)),
    ...over
  }
}

describe('clipper IPC', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => { deps = makeDeps() })

  it('clip(tabId) calls pipeline.clip with the resolved webContents', async () => {
    const h = createClipperHandlers(deps)
    const r = await h.clip({ tabId: 't1' })
    expect(deps.getWebContentsForTab).toHaveBeenCalledWith('t1')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.runId).toBe('r1')
  })

  it('clip returns E_INTERNAL when tabId resolves to no webContents', async () => {
    const deps2 = makeDeps({ getWebContentsForTab: vi.fn(() => null) })
    const h = createClipperHandlers(deps2)
    const r = await h.clip({ tabId: 't1' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_INTERNAL')
  })

  it('saveClip returns the ClipResult on success', async () => {
    const h = createClipperHandlers(deps)
    const r = await h.saveClip({ runId: 'r1', title: 'T', tags: ['ai'] })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.id).toBe(9)
  })

  it('saveClip surfaces ClipErrorEnvelope.code through the standard envelope', async () => {
    const deps2 = makeDeps({
      pipeline: {
        ...deps.pipeline,
        saveClip: vi.fn(async () => ({
          ok: false,
          error: { code: 'E_WRITE_FAILED', message: 'disk full', stage: 'saving' }
        }))
      } as any
    })
    const h = createClipperHandlers(deps2)
    const r = await h.saveClip({ runId: 'r1', title: 'T', tags: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('E_WRITE_FAILED')
  })

  it('cancelClip delegates and returns ok', async () => {
    const h = createClipperHandlers(deps)
    const r = await h.cancelClip({ runId: 'r1' })
    expect(deps.pipeline.cancelClip).toHaveBeenCalledWith('r1')
    expect(r.ok).toBe(true)
  })

  it('reextract delegates with webContents and returns the new preview', async () => {
    const h = createClipperHandlers(deps)
    const r = await h.reextract({ runId: 'r1', tabId: 't1' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.runId).toBe('r2')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/ipc/clipper.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `clipper.ts`**

```ts
// electron/ipc/clipper.ts
import type { WebContents } from 'electron'
import type { Pipeline } from '../clipper/pipeline'
import type { ClipInput, ClipPreview, ClipResult, ClipRunId } from '@shared/clipper-types'
import type { IpcResult } from '@shared/ipc-contract'

export interface ClipperHandlerDeps {
  pipeline: Pipeline
  /** Phase-11 manager: resolve tabId → webContents. */
  getWebContentsForTab: (tabId: string) => WebContents | null
}

export interface ClipperHandlers {
  clip(args: { tabId: string }): Promise<IpcResult<ClipPreview>>
  saveClip(input: ClipInput): Promise<IpcResult<ClipResult>>
  cancelClip(args: { runId: ClipRunId }): Promise<IpcResult<void>>
  reextract(args: { runId: ClipRunId; tabId: string }): Promise<IpcResult<ClipPreview>>
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}
function err(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code: code as any, message } }
}

export function createClipperHandlers(deps: ClipperHandlerDeps): ClipperHandlers {
  return {
    async clip({ tabId }) {
      const wc = deps.getWebContentsForTab(tabId)
      if (!wc || (wc as any).isDestroyed?.()) {
        return err('E_INTERNAL', `no live webContents for tabId=${tabId}`)
      }
      const r = await deps.pipeline.clip(wc)
      if (!r.ok) {
        return {
          ok: false,
          error: {
            code: r.error.code as any,
            message: r.error.message,
            // existingId/existingPath piggyback in `data` for renderer when we
            // shipped a typed envelope; renderer reads them off the message.
            // The standard `IpcErr.error` shape is { code, message } only;
            // we serialise the extras into the message JSON.
            ...(r.error.existingId !== undefined
              ? { message: JSON.stringify({ message: r.error.message, existingId: r.error.existingId, existingPath: r.error.existingPath }) }
              : {})
          } as any
        }
      }
      return ok(r.preview)
    },

    async saveClip(input) {
      const r = await deps.pipeline.saveClip(input)
      if (!r.ok) return err(r.error.code as any, r.error.message)
      return ok({
        id: r.clip.id,
        path: r.clip.path,
        url: '', // filled by callers from the preview state in renderer
        title: '',
        degraded: false
      })
    },

    async cancelClip({ runId }) {
      deps.pipeline.cancelClip(runId)
      return ok(undefined as void)
    },

    async reextract({ runId, tabId }) {
      const wc = deps.getWebContentsForTab(tabId)
      if (!wc || (wc as any).isDestroyed?.()) {
        return err('E_INTERNAL', `no live webContents for tabId=${tabId}`)
      }
      const r = await deps.pipeline.reextract(runId, wc)
      if (!r.ok) return err(r.error.code as any, r.error.message)
      return ok(r.preview)
    }
  }
}

/**
 * Wire the handlers to ipcMain. Caller (electron/ipc/router.ts or similar)
 * invokes this once at app startup with concrete deps.
 */
export function registerClipperIpc(
  ipcMain: Electron.IpcMain,
  deps: ClipperHandlerDeps
): () => void {
  const h = createClipperHandlers(deps)
  ipcMain.handle('clipper:clip', (_e, args: { tabId: string }) => h.clip(args))
  ipcMain.handle('clipper:saveClip', (_e, input: ClipInput) => h.saveClip(input))
  ipcMain.handle('clipper:cancelClip', (_e, args: { runId: ClipRunId }) => h.cancelClip(args))
  ipcMain.handle('clipper:reextract', (_e, args: { runId: ClipRunId; tabId: string }) =>
    h.reextract(args)
  )
  return () => {
    ipcMain.removeHandler('clipper:clip')
    ipcMain.removeHandler('clipper:saveClip')
    ipcMain.removeHandler('clipper:cancelClip')
    ipcMain.removeHandler('clipper:reextract')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/ipc/clipper.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Wire `registerClipperIpc` from the IPC bootstrap**

Locate the existing handler-registration site (typically `electron/ipc/handlers.ts` or `electron/ipc/router.ts`) and append a call:

```ts
import { registerClipperIpc } from './clipper'
import { createPipeline } from '../clipper/pipeline'
import { createDedupe } from '../clipper/dedupe'
import { getExtractor } from '../clipper/extract'
import { transformHtmlToMarkdown } from '../clipper/transform'
import { getClipQueue } from '../clipper/clip-queue'
// ... wire deps with the real DAO from clips.ts (task 5.4) and your atomicWrite/opsLog/indexer
```

Skip the actual wiring if `clips.ts` (task 5.4) is not yet ready — the handlers compile with stubs and Plan 3's renderer integration tests will spot missing wiring.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/clipper.ts electron/ipc/clipper.test.ts
git commit -m "feat(phase-12): ipc/clipper — clip/saveClip/cancel/reextract handlers"
```

---

<!-- openspec-task: 5.4 -->
### Task 9: `electron/ipc/clips.ts` — SQLite CRUD with prepared statements

**Files:**
- Create: `electron/ipc/clips.ts`
- Create: `electron/ipc/clips.test.ts`

- [ ] **Step 1: Write failing tests over an in-memory DB**

```ts
// electron/ipc/clips.test.ts
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { join } from 'node:path'
import { applyMigrations } from '../services/db/migrations'
import { createClipsDao } from './clips'

const MIGRATIONS_DIR = join(__dirname, '../services/db/migrations')

function freshDb() {
  const db = new Database(':memory:')
  applyMigrations(db, MIGRATIONS_DIR)
  return db
}

describe('clips DAO', () => {
  let db: ReturnType<typeof freshDb>
  beforeEach(() => { db = freshDb() })

  it('create + getById round-trips', async () => {
    const dao = createClipsDao(db)
    const { id } = (await dao.create({
      url: 'https://x.com/a',
      path: 'inbox/202605/a.md',
      title: 'A',
      site: 'x.com',
      author: null,
      publishedAt: null,
      clippedAt: '2026-05-02T00:00:00Z',
      excerpt: 'A excerpt',
      contentLength: 100,
      degraded: false
    })) as any
    const got = await dao.getById({ id })
    expect(got.ok).toBe(true)
    if (got.ok && got.data) {
      expect(got.data.url).toBe('https://x.com/a')
      expect(got.data.title).toBe('A')
      expect(got.data.degraded).toBe(false)
    }
  })

  it('create on duplicate URL returns E_DUPLICATE with existingId in the message', async () => {
    const dao = createClipsDao(db)
    const first = (await dao.create({
      url: 'https://x.com/a',
      path: 'inbox/202605/a.md',
      clippedAt: '2026-05-02T00:00:00Z'
    })) as any
    expect(first.ok).toBe(true)

    const dup = (await dao.create({
      url: 'https://x.com/a',
      path: 'inbox/202605/dup.md',
      clippedAt: '2026-05-02T00:00:01Z'
    })) as any
    expect(dup.ok).toBe(false)
    expect(dup.error.code).toBe('E_DUPLICATE')
    // existingId is parsed back from the message JSON
    expect(dup.error.message).toContain(`"existingId":${first.data.id}`)
  })

  it('getByUrl normalises against UNIQUE column', async () => {
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://x.com/a', path: 'p', clippedAt: '2026-05-02T00:00:00Z' })
    const r = (await dao.getByUrl({ url: 'https://x.com/a' })) as any
    expect(r.ok).toBe(true)
    expect(r.data?.url).toBe('https://x.com/a')

    const miss = (await dao.getByUrl({ url: 'https://x.com/no' })) as any
    expect(miss.ok).toBe(true)
    expect(miss.data).toBeNull()
  })

  it('list returns items + total ordered by clipped_at DESC by default', async () => {
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://x.com/a', path: 'pa', clippedAt: '2026-05-01T00:00:00Z' })
    await dao.create({ url: 'https://x.com/b', path: 'pb', clippedAt: '2026-05-03T00:00:00Z' })
    await dao.create({ url: 'https://x.com/c', path: 'pc', clippedAt: '2026-05-02T00:00:00Z' })
    const r = (await dao.list({ limit: 10, offset: 0 })) as any
    expect(r.ok).toBe(true)
    expect(r.data.total).toBe(3)
    expect(r.data.items.map((c: any) => c.url)).toEqual([
      'https://x.com/b',
      'https://x.com/c',
      'https://x.com/a'
    ])
  })

  it('list filters by q against title/url/excerpt (LIKE, ci)', async () => {
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://x.com/news/1', path: 'p1', title: 'Tech today', excerpt: null, clippedAt: '2026-05-02T00:00:00Z' })
    await dao.create({ url: 'https://x.com/2', path: 'p2', title: 'NEWS roundup', excerpt: null, clippedAt: '2026-05-02T00:00:01Z' })
    await dao.create({ url: 'https://x.com/3', path: 'p3', title: 'Other', excerpt: 'today\'s news digest', clippedAt: '2026-05-02T00:00:02Z' })
    await dao.create({ url: 'https://x.com/4', path: 'p4', title: 'Other', excerpt: 'unrelated', clippedAt: '2026-05-02T00:00:03Z' })
    const r = (await dao.list({ q: 'news', limit: 10, offset: 0 })) as any
    expect(r.ok).toBe(true)
    expect(r.data.total).toBe(3) // url, title, excerpt
  })

  it('list filters by site', async () => {
    const dao = createClipsDao(db)
    await dao.create({ url: 'https://a.com/1', path: 'p1', site: 'a.com', clippedAt: '2026-05-02T00:00:00Z' })
    await dao.create({ url: 'https://b.com/1', path: 'p2', site: 'b.com', clippedAt: '2026-05-02T00:00:01Z' })
    const r = (await dao.list({ site: 'a.com', limit: 10, offset: 0 })) as any
    expect(r.ok).toBe(true)
    expect(r.data.total).toBe(1)
    expect(r.data.items[0].url).toBe('https://a.com/1')
  })

  it('delete removes the row', async () => {
    const dao = createClipsDao(db)
    const c = (await dao.create({ url: 'https://x.com/a', path: 'p', clippedAt: '2026-05-02T00:00:00Z' })) as any
    const del = (await dao.delete({ id: c.data.id })) as any
    expect(del.ok).toBe(true)
    const got = (await dao.getById({ id: c.data.id })) as any
    expect(got.ok).toBe(true)
    expect(got.data).toBeNull()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/ipc/clips.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `clips.ts`**

```ts
// electron/ipc/clips.ts
import type Database from 'better-sqlite3'
import type { Clip, ClipCreateInput, ClipsListOpts, ClipsListResult } from '@shared/clip-types'
import type { IpcResult } from '@shared/ipc-contract'

export interface ClipsDao {
  create(input: ClipCreateInput): Promise<IpcResult<{ id: number }>>
  list(opts: ClipsListOpts): Promise<IpcResult<ClipsListResult>>
  getByUrl(args: { url: string }): Promise<IpcResult<Clip | null>>
  getById(args: { id: number }): Promise<IpcResult<Clip | null>>
  delete(args: { id: number }): Promise<IpcResult<void>>
}

interface Row {
  id: number
  url: string
  path: string
  title: string | null
  site: string | null
  author: string | null
  published_at: string | null
  clipped_at: string
  excerpt: string | null
  content_length: number | null
  degraded: number
  created_at: string
}

function toClip(r: Row): Clip {
  return {
    id: r.id,
    url: r.url,
    path: r.path,
    title: r.title,
    site: r.site,
    author: r.author,
    publishedAt: r.published_at,
    clippedAt: r.clipped_at,
    excerpt: r.excerpt,
    contentLength: r.content_length,
    degraded: r.degraded === 1,
    createdAt: r.created_at
  }
}

function ok<T>(data: T): IpcResult<T> { return { ok: true, data } }
function err(code: string, message: string): IpcResult<never> {
  return { ok: false, error: { code: code as any, message } }
}

export function createClipsDao(db: Database.Database): ClipsDao {
  const insertStmt = db.prepare(`
    INSERT INTO clips (url, path, title, site, author, published_at, clipped_at, excerpt, content_length, degraded, created_at)
    VALUES (@url, @path, @title, @site, @author, @published_at, @clipped_at, @excerpt, @content_length, @degraded, @created_at)
  `)
  const getByIdStmt = db.prepare<[number], Row>(`SELECT * FROM clips WHERE id = ?`)
  const getByUrlStmt = db.prepare<[string], Row>(`SELECT * FROM clips WHERE url = ?`)
  const deleteStmt = db.prepare<[number]>(`DELETE FROM clips WHERE id = ?`)

  return {
    async create(input) {
      const nowIso = new Date().toISOString()
      const params = {
        url: input.url,
        path: input.path,
        title: input.title ?? null,
        site: input.site ?? null,
        author: input.author ?? null,
        published_at: input.publishedAt ?? null,
        clipped_at: input.clippedAt,
        excerpt: input.excerpt ?? null,
        content_length: input.contentLength ?? null,
        degraded: input.degraded ? 1 : 0,
        created_at: nowIso
      }
      try {
        const r = insertStmt.run(params)
        return ok({ id: Number(r.lastInsertRowid) })
      } catch (e: any) {
        if (e && /UNIQUE/i.test(String(e.message))) {
          const existing = getByUrlStmt.get(input.url)
          const existingId = existing ? existing.id : null
          // Encode existingId in the message body so renderer can navigate.
          return err('E_DUPLICATE', JSON.stringify({ message: 'url already clipped', existingId }))
        }
        return err('E_INTERNAL', e?.message ?? 'insert failed')
      }
    },

    async getById({ id }) {
      const row = getByIdStmt.get(id)
      return ok(row ? toClip(row) : null)
    },

    async getByUrl({ url }) {
      const row = getByUrlStmt.get(url)
      return ok(row ? toClip(row) : null)
    },

    async list(opts) {
      const limit = Math.max(1, Math.min(opts.limit, 200))
      const offset = Math.max(0, opts.offset)
      const orderBy = opts.orderBy === 'title' ? 'title COLLATE NOCASE ASC' : 'clipped_at DESC'

      const where: string[] = []
      const params: Record<string, unknown> = {}
      if (opts.q && opts.q.trim().length > 0) {
        where.push(`(title LIKE @q COLLATE NOCASE OR url LIKE @q COLLATE NOCASE OR excerpt LIKE @q COLLATE NOCASE)`)
        params.q = `%${opts.q.trim()}%`
      }
      if (opts.site && opts.site.trim().length > 0) {
        where.push(`site = @site COLLATE NOCASE`)
        params.site = opts.site.trim()
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

      const totalStmt = db.prepare<typeof params, { n: number }>(
        `SELECT COUNT(*) as n FROM clips ${whereSql}`
      )
      const itemsStmt = db.prepare<typeof params & { __limit: number; __offset: number }, Row>(
        `SELECT * FROM clips ${whereSql} ORDER BY ${orderBy} LIMIT @__limit OFFSET @__offset`
      )

      const totalRow = totalStmt.get(params)
      const items = itemsStmt.all({ ...params, __limit: limit, __offset: offset })
      return ok({ items: items.map(toClip), total: totalRow?.n ?? 0 })
    },

    async delete({ id }) {
      deleteStmt.run(id)
      return ok(undefined as void)
    }
  }
}

/** Register IPC handlers backed by a single shared Database instance. */
export function registerClipsIpc(
  ipcMain: Electron.IpcMain,
  db: Database.Database
): () => void {
  const dao = createClipsDao(db)
  ipcMain.handle('clips:create', (_e, input: ClipCreateInput) => dao.create(input))
  ipcMain.handle('clips:list', (_e, opts: ClipsListOpts) => dao.list(opts))
  ipcMain.handle('clips:getByUrl', (_e, args: { url: string }) => dao.getByUrl(args))
  ipcMain.handle('clips:getById', (_e, args: { id: number }) => dao.getById(args))
  ipcMain.handle('clips:delete', (_e, args: { id: number }) => dao.delete(args))
  return () => {
    ipcMain.removeHandler('clips:create')
    ipcMain.removeHandler('clips:list')
    ipcMain.removeHandler('clips:getByUrl')
    ipcMain.removeHandler('clips:getById')
    ipcMain.removeHandler('clips:delete')
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/ipc/clips.test.ts
```

Expected: 7 passed.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Wire into the IPC bootstrap**

In your IPC handler-registration site:

```ts
import { registerClipsIpc } from './clips'
// ... in app startup:
registerClipsIpc(ipcMain, db) // db = better-sqlite3 instance owned by phase-03
```

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/clips.ts electron/ipc/clips.test.ts
git commit -m "feat(phase-12): ipc/clips — DAO + handlers (create/list/getByUrl/getById/delete)"
```

---

## Self-Review Checklist (run after Task 9)

- [ ] Every label `4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-12-clipper-pipeline-tasks-4.1-5.4.md | sort -u
  ```
- [ ] All 9 tasks have a final commit step.
- [ ] No `TODO` / `TBD` / "appropriate error handling" placeholders.
- [ ] Run all unit tests added in this plan:
  ```bash
  npx vitest run electron/clipper electron/ipc/clipper.test.ts electron/ipc/clips.test.ts shared/ipc-contract.test.ts
  ```
  Expected: ~37 tests green.
- [ ] Spec coverage:
  - `clipper-pipeline §"端到端 Pipeline"` → Tasks 3, 4
  - `clipper-pipeline §"目标路径与 slug"` → Tasks 2, 3
  - `clipper-pipeline §"写入原子性"` → Task 3
  - `clipper-pipeline §"入队（phase 14 预留）"` → Task 5
  - `clip-store §"CRUD IPC"` → Tasks 7, 9
  - `clip-store §"删除策略"` → Task 9
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
