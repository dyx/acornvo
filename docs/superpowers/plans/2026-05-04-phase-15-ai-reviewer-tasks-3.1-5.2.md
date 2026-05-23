# Phase 15 — AI Reviewer: Plan 2 (Prompts + Reviewer + Usage Log + IPC)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-15-ai-reviewer`
> **Task range:** OpenSpec tasks `3.1`–`5.2` (10 tasks)
> **Plan order:** 2 of 4. Depends on Plan 1 (`tasks-1.1-2.7`). Followed by Plan 3 (`tasks-6.1-9.1`).
> **Created:** 2026-05-04
> **Branch suggestion:** continue on `feat/phase-15-ai-reviewer`

---

## Goal

Build the prompt template (`prompts/review-clip.ts`) with Ajv-validated schema and 16K body truncation, the `reviewer.reviewClip(clipId, opts)` service that orchestrates LLM call + frontmatter writeback, the `ai_usage` DAO (`insert` / `summary` / `list`), and the `ai` IPC namespace exposing `ai.reviewClip` / `ai.usage.summary` / `ai.usage.list` to renderer.

## Architecture

- **`reviewer.reviewClip` is the only consumer of `llmClient.chatJson` for clip reviews.** No other handler calls the prompt directly. Plan 3's queue handler is a thin wrapper that just maps errors to `{ ok | retry | fail }`.
- **Frontmatter writeback uses phase 4 `file.writeParsed(rel, frontmatter, body, { expectedMtime })`** (not the lower-level `fs-atomic.writeWithVerify`). This keeps validation, FrontmatterSchema enforcement, and content_hash recomputation in one place.
- **mtime conflict** translates between layers: `fs-atomic` throws `IpcError('E_MTIME_MISMATCH', …, { remoteMtimeMs })`; the reviewer **catches** that and **rethrows** as `E_MTIME_CONFLICT` for the spec-defined surface.
- **`ai_usage` is written by the handler (Plan 3 Task 6.3), not the reviewer.** The reviewer returns `{ result, latencyMs, model, usage }` — its caller decides what to log. This keeps `reviewer.ts` testable without DB stubs.
- **IPC `ai` namespace** uses Pattern A (typed contract): export `aiHandlers` matching a new `ai` slice on `IpcContract`, register via existing `registerHandlers`. **Renderer payloads MUST NOT contain api keys** — verified by Plan 4 Task 10.19.

## Tech Stack

- Existing phase 4 codec: `electron/services/frontmatter.ts` (`parseFile` / `stringify`); `shared/frontmatter-schema.ts` (zod, `.passthrough()`).
- Existing phase 4 IPC: `electron/ipc/file.ts` (`fileHandlers.writeParsed`).
- Existing phase 12: `electron/ipc/clips.ts` (`getById`, `getByUrl`).
- Existing phase 14: `electron/queue/store.ts` (`enqueue`).
- Plan 1 deliverables: `llmClient`, `parseAndValidate`, `ajv`.

## Files Touched (this plan)

| Path                                      | Action                      | Owner task |
| ----------------------------------------- | --------------------------- | ---------- |
| `electron/ai/prompts/review-clip.ts`      | Create                      | 3.1, 3.2   |
| `electron/ai/prompts/review-clip.test.ts` | Create                      | 3.1, 3.2   |
| `electron/ai/reviewer.ts`                 | Create                      | 4.1–4.6    |
| `electron/ai/reviewer.test.ts`            | Create                      | 4.1–4.6    |
| `shared/frontmatter-schema.ts`            | Modify (add ai\_\* fields)  | 4.5        |
| `electron/ai/usage.ts`                    | Create                      | 5.1        |
| `electron/ai/usage.test.ts`               | Create                      | 5.1        |
| `electron/ipc/ai.ts`                      | Create                      | 5.2        |
| `electron/ipc/ai.test.ts`                 | Create                      | 5.2        |
| `shared/ipc-contract.ts`                  | Modify (add `ai` namespace) | 5.2        |

## Pre-flight

- Plan 1 is merged: `electron/ai/client.ts`, `electron/ai/parse-json.ts`, all four providers, `shared/ai-types.ts`, migration 008, ajv dep are all on the branch.
- `electron/ipc/clips.ts:117` exposes `getById(id) → Clip | null` via `createClipsHandlers`. The reviewer needs the **DAO**, not the IPC handler — read it directly via `db.prepare('SELECT * FROM clips WHERE id = ?').get(id)`.
- `electron/ipc/file.ts` exposes `fileHandlers.writeParsed(rel, frontmatter, body, { expectedMtime })`. Confirm signature before Task 7.

---

## Tasks

<!-- openspec-task: 3.1 -->

### Task 1: `prompts/review-clip.ts` — `render({ title, url, body })` with 16K truncation

**Files:**

- Create: `electron/ai/prompts/review-clip.ts`
- Create: `electron/ai/prompts/review-clip.test.ts`

- [ ] **Step 1: Write failing tests for `render`**

```ts
// electron/ai/prompts/review-clip.test.ts
import { describe, it, expect } from 'vitest'
import { reviewClip } from './review-clip'

describe('reviewClip.render', () => {
  it('returns { system, user } strings', () => {
    const r = reviewClip.render({ title: 'T', url: 'https://e.x/a', body: 'b' })
    expect(typeof r.system).toBe('string')
    expect(typeof r.user).toBe('string')
  })

  it('system prompt mentions strict JSON, kebab-case, no extra text', () => {
    const r = reviewClip.render({ title: 'T', url: 'u', body: 'b' })
    expect(r.system).toMatch(/严格的 JSON|严格 JSON/)
    expect(r.system).toMatch(/kebab-case/i)
    expect(r.system).toMatch(/不要包含任何额外文本|不要附加任何/)
  })

  it('user prompt embeds title, url, and body', () => {
    const r = reviewClip.render({ title: 'My Article', url: 'https://e.x/a', body: 'BODY_CONTENT' })
    expect(r.user).toContain('My Article')
    expect(r.user).toContain('https://e.x/a')
    expect(r.user).toContain('BODY_CONTENT')
  })

  it('does not append truncation marker when body ≤ 16000 chars', () => {
    const body = 'x'.repeat(16000)
    const r = reviewClip.render({ title: 'T', url: 'u', body })
    expect(r.user).not.toContain('内容过长已截断')
  })

  it('truncates body to 16000 chars and appends marker when longer', () => {
    const body = 'x'.repeat(16500)
    const r = reviewClip.render({ title: 'T', url: 'u', body })
    expect(r.user).toContain('内容过长已截断')
    // Find substring of 16000 x's between body markers
    expect(r.user.match(/x{16000}/)?.[0]).toBeDefined()
    expect(r.user.match(/x{16001}/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/prompts/review-clip.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `render` (schema added in Task 2)**

```ts
// electron/ai/prompts/review-clip.ts
const BODY_MAX = 16000

interface RenderVars {
  title: string
  url: string
  body: string
}

function truncateBody(body: string): string {
  if (body.length <= BODY_MAX) return body
  return body.slice(0, BODY_MAX) + '\n\n...(内容过长已截断)'
}

export const reviewClip = {
  // schema added in Task 2
  schema: undefined as unknown as object,

  render({ title, url, body }: RenderVars): { system: string; user: string } {
    const system = [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须是严格的 JSON 对象，匹配指定 schema，不要包含任何额外文本，不要使用 markdown code fence。',
      'tags 必须使用 kebab-case 英文短词。summary 使用原文主语言（若中英混合则以中文为主）。'
    ].join('\n')

    const user = [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${truncateBody(body)}`,
      '',
      '请生成：',
      '1. `summary`：150 字以内的摘要。',
      '2. `suggestedTitle`：一个更精炼、信息密度更高的标题（若原标题已足够好，可复用）。',
      '3. `tags`：3-8 个 kebab-case 英文短标签（如 "deep-learning", "transformer"）。',
      '4. `keyQuotes`：最重要的 1-3 句原文引用（保持原文语言）。',
      '',
      'JSON schema（自行遵守，勿输出 schema）：',
      '{ "summary": string, "suggestedTitle": string, "tags": string[], "keyQuotes": string[] }'
    ].join('\n')

    return { system, user }
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/prompts/review-clip.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/prompts/review-clip.ts electron/ai/prompts/review-clip.test.ts
git commit -m "feat(phase-15): review-clip prompt template — render + 16K body truncation"
```

---

<!-- openspec-task: 3.2 -->

### Task 2: `prompts/review-clip.ts` — JSON Schema definition

**Files:**

- Modify: `electron/ai/prompts/review-clip.ts`
- Modify: `electron/ai/prompts/review-clip.test.ts`

- [ ] **Step 1: Add failing schema tests**

Append to `electron/ai/prompts/review-clip.test.ts`:

```ts
import Ajv from 'ajv'

describe('reviewClip.schema', () => {
  const ajv = new Ajv({ allErrors: true })

  it('validates a complete result', () => {
    const data = {
      summary: 'a short summary',
      suggestedTitle: 'a title',
      tags: ['deep-learning', 'transformer', 'attention'],
      keyQuotes: ['Attention is all you need.']
    }
    expect(ajv.validate(reviewClip.schema, data)).toBe(true)
  })

  it('rejects when tags has fewer than 3 entries', () => {
    const data = {
      summary: 's',
      suggestedTitle: 't',
      tags: ['a', 'b'],
      keyQuotes: ['q']
    }
    expect(ajv.validate(reviewClip.schema, data)).toBe(false)
    expect(ajv.errorsText().toLowerCase()).toContain('tags')
  })

  it('rejects when tags has more than 8 entries', () => {
    const data = {
      summary: 's',
      suggestedTitle: 't',
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      keyQuotes: ['q']
    }
    expect(ajv.validate(reviewClip.schema, data)).toBe(false)
  })

  it('rejects empty summary', () => {
    const data = {
      summary: '',
      suggestedTitle: 't',
      tags: ['a', 'b', 'c'],
      keyQuotes: ['q']
    }
    expect(ajv.validate(reviewClip.schema, data)).toBe(false)
  })

  it('rejects keyQuotes with 0 or > 3 elements', () => {
    expect(
      ajv.validate(reviewClip.schema, {
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b', 'c'],
        keyQuotes: []
      })
    ).toBe(false)
    expect(
      ajv.validate(reviewClip.schema, {
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b', 'c'],
        keyQuotes: ['1', '2', '3', '4']
      })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run — fails (schema is undefined)**

Run: `npx vitest run electron/ai/prompts/review-clip.test.ts`
Expected: failures referencing schema.

- [ ] **Step 3: Implement schema**

In `electron/ai/prompts/review-clip.ts`, replace the `schema: undefined ...` line:

```ts
export const reviewClip = {
  schema: {
    type: 'object',
    required: ['summary', 'suggestedTitle', 'tags', 'keyQuotes'],
    additionalProperties: false,
    properties: {
      summary: { type: 'string', minLength: 1 },
      suggestedTitle: { type: 'string', minLength: 1 },
      tags: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }
      },
      keyQuotes: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string', minLength: 1 }
      }
    }
  } as const,

  render({ title, url, body }: RenderVars): { system: string; user: string } {
    /* ...unchanged from Task 1... */
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/prompts/review-clip.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/prompts/review-clip.ts electron/ai/prompts/review-clip.test.ts
git commit -m "feat(phase-15): review-clip schema — Ajv-validated AiReviewResult"
```

---

<!-- openspec-task: 4.1 -->

### Task 3: `electron/ai/reviewer.ts` — `reviewClip` skeleton

**Files:**

- Create: `electron/ai/reviewer.ts`
- Create: `electron/ai/reviewer.test.ts`

This task creates the function shape and exports the error type so subsequent tasks build incrementally.

- [ ] **Step 1: Write a contract test**

```ts
// electron/ai/reviewer.test.ts
import { describe, it, expect } from 'vitest'
import { reviewClip } from './reviewer'

describe('reviewer.reviewClip', () => {
  it('is an async function with arity 2', () => {
    expect(typeof reviewClip).toBe('function')
    expect(reviewClip.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run — fails (no module)**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement skeleton**

```ts
// electron/ai/reviewer.ts
import type { AiReviewResult } from '@shared/ai-types'

export interface ReviewClipOpts {
  force?: boolean
}

export interface ReviewClipOutput {
  result: AiReviewResult
  /** non-null when the LLM was actually invoked (cache hit returns null usage) */
  llmCall?: {
    model: string
    latencyMs: number
    promptTokens: number | null
    completionTokens: number | null
  }
  cacheHit: boolean
}

export async function reviewClip(
  _clipId: number,
  _opts: ReviewClipOpts = {}
): Promise<ReviewClipOutput> {
  throw new Error('E_NOT_IMPLEMENTED')
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/reviewer.ts electron/ai/reviewer.test.ts
git commit -m "feat(phase-15): reviewer.ts skeleton — reviewClip(clipId, opts) shape"
```

---

<!-- openspec-task: 4.2 -->

### Task 4: Read clip + read md + parse frontmatter

**Files:**

- Modify: `electron/ai/reviewer.ts`
- Modify: `electron/ai/reviewer.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the previous test file content with:

```ts
// electron/ai/reviewer.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'

// Mocks for collaborators
vi.mock('../services/db/connection', () => ({
  getDb: vi.fn()
}))
vi.mock('../services/grove', () => ({
  getCurrentVaultRoot: vi.fn()
}))
vi.mock('./client', () => ({
  llmClient: { chatJson: vi.fn() }
}))
vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) }
}))
vi.mock('../ipc/file', async () => {
  const actual = await vi.importActual<any>('../ipc/file')
  return { ...actual, fileHandlers: { ...actual.fileHandlers, writeParsed: vi.fn() } }
})

import { getDb } from '../services/db/connection'
import { getCurrentVaultRoot } from '../services/grove'
import { llmClient } from './client'
import { fileHandlers } from '../ipc/file'
import { reviewClip } from './reviewer'

const TMP = path.join(os.tmpdir(), 'phase15-reviewer-' + Date.now())
fs.mkdirSync(TMP, { recursive: true })

function setupDbWithClip(): { db: Database.Database; clipPath: string } {
  const db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  const clipPath = 'inbox/example.md'
  db.prepare(
    `
    INSERT INTO clips (id, url, path, title, excerpt, content_length, degraded, clipped_at, created_at)
    VALUES (1, 'https://e.x/a', ?, 'Example', 'an excerpt', 1234, 0, '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z')
  `
  ).run(clipPath)
  return { db, clipPath }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('reviewer.reviewClip — fixtures', () => {
  it('throws E_CLIP_NOT_FOUND when no row in clips', async () => {
    const { db } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    await expect(reviewClip(999)).rejects.toMatchObject({ code: 'E_CLIP_NOT_FOUND' })
  })

  it('throws E_FILE_NOT_FOUND when md is missing on disk', async () => {
    const { db } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_FILE_NOT_FOUND' })
  })
})
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement clip + md reading**

Replace `electron/ai/reviewer.ts` body:

```ts
import type { AiReviewResult, LlmError, LlmErrorCode } from '@shared/ai-types'
import path from 'node:path'
import fs from 'node:fs'
import { getDb } from '../services/db/connection'
import { getCurrentVaultRoot } from '../services/grove'
import { parseFile } from '../services/frontmatter'

export interface ReviewClipOpts {
  force?: boolean
}

export interface ReviewClipOutput {
  result: AiReviewResult
  llmCall?: {
    model: string
    latencyMs: number
    promptTokens: number | null
    completionTokens: number | null
  }
  cacheHit: boolean
}

interface ClipRow {
  id: number
  url: string
  path: string
  title: string | null
  excerpt: string | null
}

type ReviewerErrCode = 'E_CLIP_NOT_FOUND' | 'E_FILE_NOT_FOUND' | 'E_MTIME_CONFLICT' | LlmErrorCode

function rerr(code: ReviewerErrCode, message: string, extra: Record<string, unknown> = {}): Error {
  const e = new Error(message) as Error & { code: ReviewerErrCode }
  ;(e as any).code = code
  Object.assign(e, extra)
  return e
}

function loadClip(clipId: number): ClipRow {
  const db = getDb()
  const row = db
    .prepare('SELECT id, url, path, title, excerpt FROM clips WHERE id = ?')
    .get(clipId) as ClipRow | undefined
  if (!row) throw rerr('E_CLIP_NOT_FOUND', `clip ${clipId} not found`)
  return row
}

function loadMd(rel: string): {
  abs: string
  raw: string
  mtimeMs: number
  frontmatter: Record<string, unknown>
  body: string
} {
  const root = getCurrentVaultRoot()
  const abs = path.join(root, rel)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    throw rerr('E_FILE_NOT_FOUND', `file not found: ${rel}`)
  }
  const raw = fs.readFileSync(abs, 'utf8')
  const { frontmatter, body } = parseFile(raw)
  return {
    abs,
    raw,
    mtimeMs: stat.mtimeMs,
    frontmatter: frontmatter as Record<string, unknown>,
    body
  }
}

export async function reviewClip(
  clipId: number,
  _opts: ReviewClipOpts = {}
): Promise<ReviewClipOutput> {
  const clip = loadClip(clipId)
  const md = loadMd(clip.path)
  void md
  // continued in Task 5
  throw new Error('E_NOT_IMPLEMENTED')
}
```

- [ ] **Step 4: Run — failing tests now pass; the "happy" path still throws E_NOT_IMPLEMENTED, no test for it yet**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/reviewer.ts electron/ai/reviewer.test.ts
git commit -m "feat(phase-15): reviewer — load clip row + parse md frontmatter"
```

---

<!-- openspec-task: 4.3 -->

### Task 5: Idempotency check + `force` support

**Files:**

- Modify: `electron/ai/reviewer.ts`
- Modify: `electron/ai/reviewer.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `electron/ai/reviewer.test.ts`:

```ts
describe('reviewer.reviewClip — idempotency', () => {
  it('returns cached result and does not call LLM when ai_reviewed_at exists and force=false', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
title: Example
ai_summary: cached summary
ai_suggested_title: cached title
ai_tags: [a, b, c]
ai_key_quotes: ['cached quote']
ai_reviewed_at: '2026-05-04T00:00:00Z'
---
body
`
    )
    const out = await reviewClip(1)
    expect(out.cacheHit).toBe(true)
    expect(out.result.summary).toBe('cached summary')
    expect(out.result.suggestedTitle).toBe('cached title')
    expect(out.result.tags).toEqual(['a', 'b', 'c'])
    expect(out.result.keyQuotes).toEqual(['cached quote'])
    expect(out.llmCall).toBeUndefined()
    expect(llmClient.chatJson).not.toHaveBeenCalled()
  })

  it('bypasses cache when opts.force=true (still calls LLM)', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
ai_reviewed_at: '2026-05-04T00:00:00Z'
ai_summary: cached
ai_suggested_title: cached
ai_tags: [a,b,c]
ai_key_quotes: ['q']
---
body
`
    )
    ;(llmClient.chatJson as any).mockResolvedValue({
      data: {
        summary: 'fresh',
        suggestedTitle: 'fresh-title',
        tags: ['x', 'y', 'z'],
        keyQuotes: ['q']
      },
      rawText: '{}',
      model: 'gpt-4o-mini',
      latencyMs: 1200,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    })
    ;(fileHandlers.writeParsed as any).mockResolvedValue(undefined)
    const out = await reviewClip(1, { force: true })
    expect(out.cacheHit).toBe(false)
    expect(out.result.summary).toBe('fresh')
    expect(llmClient.chatJson).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement cache short-circuit**

In `electron/ai/reviewer.ts`, replace the body of `reviewClip`:

```ts
export async function reviewClip(
  clipId: number,
  opts: ReviewClipOpts = {}
): Promise<ReviewClipOutput> {
  const clip = loadClip(clipId)
  const md = loadMd(clip.path)

  if (md.frontmatter.ai_reviewed_at && !opts.force) {
    const cached: AiReviewResult = {
      summary: String(md.frontmatter.ai_summary ?? ''),
      suggestedTitle: String(md.frontmatter.ai_suggested_title ?? ''),
      tags: Array.isArray(md.frontmatter.ai_tags) ? (md.frontmatter.ai_tags as string[]) : [],
      keyQuotes: Array.isArray(md.frontmatter.ai_key_quotes)
        ? (md.frontmatter.ai_key_quotes as string[])
        : [],
      reviewedAt: String(md.frontmatter.ai_reviewed_at)
    }
    return { result: cached, cacheHit: true }
  }

  // continued in Task 6 — call LLM
  throw new Error('E_NOT_IMPLEMENTED')
}
```

- [ ] **Step 4: Run — first idempotency test passes; force test still fails (no LLM call yet) — that's expected, LLM wiring is Task 6.**

Run: `npx vitest run electron/ai/reviewer.test.ts -t "idempotency"`
Expected: cache-hit test PASS, force test FAIL (E_NOT_IMPLEMENTED). Move on.

- [ ] **Step 5: Commit**

```bash
git add electron/ai/reviewer.ts electron/ai/reviewer.test.ts
git commit -m "feat(phase-15): reviewer — idempotent cache hit on ai_reviewed_at"
```

---

<!-- openspec-task: 4.4 -->

### Task 6: Call `llmClient.chatJson` with the prompt template

**Files:**

- Modify: `electron/ai/reviewer.ts`

- [ ] **Step 1: Wire LLM call (no new tests; force test from Task 5 will be re-run)**

Replace the trailing `throw new Error('E_NOT_IMPLEMENTED')` in `reviewClip` with:

```ts
import { llmClient } from './client'
import { reviewClip as reviewClipPrompt } from './prompts/review-clip'

// inside reviewClip(...) — after the cache short-circuit:
const { system, user } = reviewClipPrompt.render({
  title: clip.title ?? '',
  url: clip.url,
  body: md.body
})

const llmResp = await llmClient.chatJson<{
  summary: string
  suggestedTitle: string
  tags: string[]
  keyQuotes: string[]
}>({
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ],
  schema: reviewClipPrompt.schema,
  maxTokens: 800
})

const result: AiReviewResult = {
  summary: llmResp.data.summary,
  suggestedTitle: llmResp.data.suggestedTitle,
  tags: llmResp.data.tags,
  keyQuotes: llmResp.data.keyQuotes,
  reviewedAt: new Date().toISOString()
}

// continued in Task 7 — write back
return {
  result,
  cacheHit: false,
  llmCall: {
    model: llmResp.model,
    latencyMs: llmResp.latencyMs,
    promptTokens: llmResp.usage?.promptTokens ?? null,
    completionTokens: llmResp.usage?.completionTokens ?? null
  }
}
```

> Add the `import` lines at the top of `electron/ai/reviewer.ts`. Until Task 7 the function returns without persisting; the `force` test from Task 5 should now pass (LLM is called and result returned), but persistence assertions are not yet exercised.

- [ ] **Step 2: Run — force test passes**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: PASS (4 tests; one of them was the failing force test).

- [ ] **Step 3: Commit**

```bash
git add electron/ai/reviewer.ts
git commit -m "feat(phase-15): reviewer — call llmClient.chatJson with reviewClip prompt"
```

---

<!-- openspec-task: 4.5 -->

### Task 7: Merge into frontmatter and atomic write with `expectedMtime`

**Files:**

- Modify: `electron/ai/reviewer.ts`
- Modify: `electron/ai/reviewer.test.ts`
- Modify: `shared/frontmatter-schema.ts`

- [ ] **Step 1: Extend FrontmatterSchema with `ai_*` fields**

In `shared/frontmatter-schema.ts`, add new optional fields to the zod schema (the schema is `.passthrough()` already, but adding them gives type-level visibility and i18n-friendly errors):

```ts
// shared/frontmatter-schema.ts — append to the FrontmatterSchema object
ai_summary: z.string().optional(),
ai_suggested_title: z.string().optional(),
ai_tags: z.array(z.string()).optional(),
ai_key_quotes: z.array(z.string()).optional(),
ai_reviewed_at: z.string().optional(),
ai_review_accepted_at: z.string().optional(),
```

(Place these next to other optional metadata fields — preserve alphabetic order if the file uses one.)

- [ ] **Step 2: Add failing test for writeback**

Append to `electron/ai/reviewer.test.ts`:

```ts
describe('reviewer.reviewClip — writeback', () => {
  it('calls writeParsed with merged frontmatter and expectedMtime', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(
      path.join(TMP, clipPath),
      `---
title: Example
tags: [existing]
---
the body
`
    )
    ;(llmClient.chatJson as any).mockResolvedValue({
      data: {
        summary: 's',
        suggestedTitle: 'st',
        tags: ['ai-tag-a', 'ai-tag-b', 'ai-tag-c'],
        keyQuotes: ['quote']
      },
      rawText: '{}',
      model: 'm',
      latencyMs: 1200,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    })
    ;(fileHandlers.writeParsed as any).mockResolvedValue(undefined)

    const out = await reviewClip(1)
    expect(out.cacheHit).toBe(false)
    expect(out.result.summary).toBe('s')

    expect(fileHandlers.writeParsed).toHaveBeenCalledOnce()
    const [rel, fm, body, opts] = (fileHandlers.writeParsed as any).mock.calls[0]
    expect(rel).toBe('inbox/example.md')
    expect(fm.title).toBe('Example')
    expect(fm.tags).toEqual(['existing']) // user's tags untouched at reviewer layer
    expect(fm.ai_summary).toBe('s')
    expect(fm.ai_suggested_title).toBe('st')
    expect(fm.ai_tags).toEqual(['ai-tag-a', 'ai-tag-b', 'ai-tag-c'])
    expect(fm.ai_key_quotes).toEqual(['quote'])
    expect(typeof fm.ai_reviewed_at).toBe('string')
    expect(body).toBe('the body\n')
    expect(opts).toMatchObject({ expectedMtime: expect.any(Number) })
  })

  it('rethrows E_MTIME_CONFLICT when writeParsed fails with E_MTIME_MISMATCH', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(path.join(TMP, clipPath), `---\n---\nbody\n`)
    ;(llmClient.chatJson as any).mockResolvedValue({
      data: { summary: 's', suggestedTitle: 'st', tags: ['a', 'b', 'c'], keyQuotes: ['q'] },
      rawText: '{}',
      model: 'm',
      latencyMs: 1
    })
    const e: any = new Error('mtime mismatch')
    e.code = 'E_MTIME_MISMATCH'
    ;(fileHandlers.writeParsed as any).mockRejectedValue(e)

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_MTIME_CONFLICT' })
  })
})
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 4: Implement writeback**

Replace the trailing return in `reviewClip` body with:

```ts
import { fileHandlers } from '../ipc/file'

// ... after computing `result`:
const nextFrontmatter = {
  ...md.frontmatter,
  ai_summary: result.summary,
  ai_suggested_title: result.suggestedTitle,
  ai_tags: result.tags,
  ai_key_quotes: result.keyQuotes,
  ai_reviewed_at: result.reviewedAt
}

try {
  await fileHandlers.writeParsed(clip.path, nextFrontmatter, md.body, { expectedMtime: md.mtimeMs })
} catch (e) {
  const code = (e as any)?.code
  if (code === 'E_MTIME_MISMATCH') {
    throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback')
  }
  throw e
}

return {
  result,
  cacheHit: false,
  llmCall: {
    model: llmResp.model,
    latencyMs: llmResp.latencyMs,
    promptTokens: llmResp.usage?.promptTokens ?? null,
    completionTokens: llmResp.usage?.completionTokens ?? null
  }
}
```

- [ ] **Step 5: Run — passes**

Run: `npx vitest run electron/ai/reviewer.test.ts shared/frontmatter-schema.test.ts`
Expected: PASS for the reviewer + frontmatter schema tests.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/reviewer.ts electron/ai/reviewer.test.ts shared/frontmatter-schema.ts
git commit -m "feat(phase-15): reviewer — merge ai_* fields into frontmatter and atomic write"
```

---

<!-- openspec-task: 4.6 -->

### Task 8: Error mapping (LLM errors flow through unchanged; surface via `code`)

The reviewer layer **does not** map LLM error codes — it lets them bubble. Mapping LLM codes to `{ ok | retry | fail }` is the queue handler's responsibility (Plan 3 Task 6.1). This task adds tests that verify the bubble-through behavior.

**Files:**

- Modify: `electron/ai/reviewer.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `electron/ai/reviewer.test.ts`:

```ts
describe('reviewer.reviewClip — error bubble', () => {
  it('rethrows E_AUTH from llmClient as-is', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n')
    const e: any = new Error('unauthorized')
    e.code = 'E_AUTH'
    ;(llmClient.chatJson as any).mockRejectedValue(e)

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_AUTH' })
  })

  it('rethrows E_RATE from llmClient', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n')
    const e: any = new Error('rate')
    e.code = 'E_RATE'
    ;(llmClient.chatJson as any).mockRejectedValue(e)

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RATE' })
  })

  it('rethrows E_RESPONSE (schema validation failure)', async () => {
    const { db, clipPath } = setupDbWithClip()
    ;(getDb as any).mockReturnValue(db)
    ;(getCurrentVaultRoot as any).mockReturnValue(TMP)
    fs.mkdirSync(path.join(TMP, 'inbox'), { recursive: true })
    fs.writeFileSync(path.join(TMP, clipPath), '---\n---\nbody\n')
    const e: any = new Error('bad json')
    e.code = 'E_RESPONSE'
    ;(llmClient.chatJson as any).mockRejectedValue(e)

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_RESPONSE' })
  })
})
```

- [ ] **Step 2: Run — they should pass already** (since the implementation does not catch these codes — they fall through). If they don't, the implementation is masking errors; fix and re-run.

Run: `npx vitest run electron/ai/reviewer.test.ts`
Expected: PASS (all tests, including the three new ones).

- [ ] **Step 3: Commit (test-only commit, documents the contract)**

```bash
git add electron/ai/reviewer.test.ts
git commit -m "test(phase-15): reviewer — assert E_AUTH/E_RATE/E_RESPONSE bubble unchanged"
```

---

<!-- openspec-task: 5.1 -->

### Task 9: `electron/ai/usage.ts` — `insert(row)` + `summary(opts)` + `list(opts)`

**Files:**

- Create: `electron/ai/usage.ts`
- Create: `electron/ai/usage.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/usage.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'

vi.mock('../services/db/connection', () => ({ getDb: vi.fn() }))
import { getDb } from '../services/db/connection'
import { aiUsage } from './usage'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(getDb as any).mockReturnValue(db)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-04T12:00:00Z'))
})

describe('aiUsage.insert', () => {
  it('inserts a success row', () => {
    aiUsage.insert({
      jobId: 'job-1',
      profileId: 'p1',
      model: 'gpt-4o-mini',
      promptTokens: 100,
      completionTokens: 50,
      latencyMs: 1200,
      ok: 1,
      error: null
    })
    const rows = db.prepare('SELECT * FROM ai_usage').all() as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      job_id: 'job-1',
      profile_id: 'p1',
      model: 'gpt-4o-mini',
      prompt_tokens: 100,
      completion_tokens: 50,
      latency_ms: 1200,
      ok: 1,
      error: null
    })
    expect(rows[0].created_at).toMatch(/2026-05-04T12:00:00/)
  })

  it('inserts a failure row with null tokens', () => {
    aiUsage.insert({
      jobId: 'job-1',
      profileId: 'p1',
      model: 'gpt-4o-mini',
      promptTokens: null,
      completionTokens: null,
      latencyMs: 30,
      ok: 0,
      error: 'E_AUTH'
    })
    const row = db.prepare('SELECT * FROM ai_usage').get() as any
    expect(row.ok).toBe(0)
    expect(row.error).toBe('E_AUTH')
    expect(row.prompt_tokens).toBeNull()
  })
})

describe('aiUsage.summary', () => {
  it('aggregates within sinceDays', () => {
    const seed = (ok: number, prompt: number, completion: number, daysAgo: number) => {
      const d = new Date('2026-05-04T12:00:00Z')
      d.setUTCDate(d.getUTCDate() - daysAgo)
      db.prepare(
        `INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'j',
        'p1',
        'gpt-4o-mini',
        prompt,
        completion,
        1000,
        ok,
        ok ? null : 'E_RATE',
        d.toISOString()
      )
    }
    seed(1, 100, 50, 1)
    seed(1, 200, 100, 5)
    seed(0, 0, 0, 10)
    seed(1, 999, 999, 40) // out of 30-day window

    const r = aiUsage.summary({ sinceDays: 30 })
    expect(r.totalCalls).toBe(3)
    expect(r.okCount).toBe(2)
    expect(r.errorRate).toBeCloseTo(1 / 3, 5)
    expect(r.totalTokens).toBe(100 + 50 + 200 + 100) // failed row contributed 0+0
    expect(r.byProvider['p1']).toMatchObject({ calls: 3 })
  })

  it('uses default sinceDays = 30', () => {
    const r = aiUsage.summary()
    expect(r.totalCalls).toBe(0)
    expect(r.errorRate).toBe(0)
  })
})

describe('aiUsage.list', () => {
  it('paginates DESC by created_at', () => {
    for (let i = 0; i < 5; i++) {
      const d = new Date('2026-05-04T12:00:00Z')
      d.setUTCMinutes(i)
      db.prepare(
        `INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(`j${i}`, 'p1', 'm', 1, 1, 1, 1, null, d.toISOString())
    }
    const r = aiUsage.list({ limit: 3, offset: 0 })
    expect(r.items).toHaveLength(3)
    expect(r.items[0].jobId).toBe('j4') // newest first
    expect(r.total).toBe(5)
  })

  it('filters by profileId and okOnly', () => {
    db.prepare(
      `INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p1','m',1,1,1,1,null,'2026-05-04T12:00:00Z')`
    ).run()
    db.prepare(
      `INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p2','m',1,1,1,1,null,'2026-05-04T12:00:01Z')`
    ).run()
    db.prepare(
      `INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p1','m',null,null,1,0,'E_AUTH','2026-05-04T12:00:02Z')`
    ).run()
    const r1 = aiUsage.list({ limit: 10, offset: 0, profileId: 'p1' })
    expect(r1.total).toBe(2)
    const r2 = aiUsage.list({ limit: 10, offset: 0, profileId: 'p1', okOnly: true })
    expect(r2.total).toBe(1)
  })
})
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/usage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// electron/ai/usage.ts
import type { AiUsageRow } from '@shared/ai-types'
import { getDb } from '../services/db/connection'

export interface AiUsageSummary {
  totalCalls: number
  okCount: number
  errorRate: number
  totalTokens: number
  byProvider: Record<string, { calls: number; tokens: number }>
}

export interface AiUsageListOpts {
  limit: number
  offset: number
  profileId?: string
  okOnly?: boolean
}

export interface AiUsageListResult {
  items: AiUsageRow[]
  total: number
}

function rowFromDb(r: any): AiUsageRow {
  return {
    id: r.id,
    jobId: r.job_id,
    profileId: r.profile_id,
    model: r.model,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    latencyMs: r.latency_ms,
    ok: r.ok,
    error: r.error,
    createdAt: r.created_at
  }
}

export const aiUsage = {
  insert(row: Omit<AiUsageRow, 'id' | 'createdAt'> & { createdAt?: string }): void {
    const db = getDb()
    db.prepare(
      `
      INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      row.jobId,
      row.profileId,
      row.model,
      row.promptTokens,
      row.completionTokens,
      row.latencyMs,
      row.ok,
      row.error,
      row.createdAt ?? new Date().toISOString()
    )
  },

  summary(opts: { sinceDays?: number } = {}): AiUsageSummary {
    const sinceDays = opts.sinceDays ?? 30
    const db = getDb()
    const since = new Date(Date.now() - sinceDays * 86400_000).toISOString()
    const rows = db
      .prepare(
        `
      SELECT profile_id, ok, prompt_tokens, completion_tokens
      FROM ai_usage WHERE created_at >= ?
    `
      )
      .all(since) as any[]
    const totalCalls = rows.length
    const okCount = rows.filter((r) => r.ok === 1).length
    const totalTokens = rows.reduce(
      (s, r) => s + (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0),
      0
    )
    const byProvider: Record<string, { calls: number; tokens: number }> = {}
    for (const r of rows) {
      const key = r.profile_id ?? 'unknown'
      byProvider[key] ??= { calls: 0, tokens: 0 }
      byProvider[key].calls += 1
      byProvider[key].tokens += (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0)
    }
    return {
      totalCalls,
      okCount,
      errorRate: totalCalls === 0 ? 0 : (totalCalls - okCount) / totalCalls,
      totalTokens,
      byProvider
    }
  },

  list(opts: AiUsageListOpts): AiUsageListResult {
    const db = getDb()
    const where: string[] = []
    const params: unknown[] = []
    if (opts.profileId) {
      where.push('profile_id = ?')
      params.push(opts.profileId)
    }
    if (opts.okOnly) {
      where.push('ok = 1')
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM ai_usage ${whereSql}`).get(...params) as { c: number }
    ).c
    const items = db
      .prepare(
        `
      SELECT * FROM ai_usage ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(...params, opts.limit, opts.offset) as any[]
    return { items: items.map(rowFromDb), total }
  }
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/usage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/usage.ts electron/ai/usage.test.ts
git commit -m "feat(phase-15): ai_usage DAO — insert + summary + list"
```

---

<!-- openspec-task: 5.2 -->

### Task 10: `electron/ipc/ai.ts` — IPC namespace

**Files:**

- Modify: `shared/ipc-contract.ts`
- Create: `electron/ipc/ai.ts`
- Create: `electron/ipc/ai.test.ts`

- [ ] **Step 1: Extend `IpcContract` with the `ai` namespace**

In `shared/ipc-contract.ts`, add:

```ts
// Append to the existing IpcContract interface (preserve the namespace style used by existing entries):
ai: {
  reviewClip(clipId: number, opts?: { force?: boolean }): Promise<{ jobId: string }>;
  'usage.summary'(opts?: { sinceDays?: number }): Promise<{
    totalCalls: number;
    okCount: number;
    errorRate: number;
    totalTokens: number;
    byProvider: Record<string, { calls: number; tokens: number }>;
  }>;
  'usage.list'(opts: { limit: number; offset: number; profileId?: string; okOnly?: boolean }): Promise<{
    items: Array<{
      id?: number; jobId: string | null; profileId: string | null; model: string | null;
      promptTokens: number | null; completionTokens: number | null; latencyMs: number | null;
      ok: 0 | 1; error: string | null; createdAt: string;
    }>;
    total: number;
  }>;
};
```

- [ ] **Step 2: Write failing tests**

```ts
// electron/ipc/ai.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'

vi.mock('../services/db/connection', () => ({ getDb: vi.fn() }))
vi.mock('../queue/store', () => ({
  jobsStore: { enqueue: vi.fn() }
}))

import { getDb } from '../services/db/connection'
import { jobsStore } from '../queue/store'
import { aiHandlers } from './ai'

let db: Database.Database
beforeEach(() => {
  vi.resetAllMocks()
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(getDb as any).mockReturnValue(db)
})

describe('ai IPC handlers', () => {
  it('ai.reviewClip enqueues an ai-review-clip job with force in payload', async () => {
    ;(jobsStore.enqueue as any).mockReturnValue({ id: 'job-42' })
    const r = await aiHandlers.reviewClip(7, { force: true })
    expect(r).toEqual({ jobId: 'job-42' })
    const [kind, payload, opts] = (jobsStore.enqueue as any).mock.calls[0]
    expect(kind).toBe('ai-review-clip')
    expect(payload).toMatchObject({ clipId: 7, force: true })
    expect(opts.dedupeKey).toMatch(/^clip:7:force:/)
  })

  it('ai.reviewClip without force uses non-force dedupe key', async () => {
    ;(jobsStore.enqueue as any).mockReturnValue({ id: 'j2' })
    await aiHandlers.reviewClip(7)
    const opts = (jobsStore.enqueue as any).mock.calls[0][2]
    expect(opts.dedupeKey).toBe('clip:7')
  })

  it('ai.usage.summary returns aggregates', async () => {
    db.prepare(
      `INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p','m',100,50,1,1,null,?)`
    ).run(new Date().toISOString())
    const r = await aiHandlers['usage.summary']({ sinceDays: 30 })
    expect(r.totalCalls).toBe(1)
    expect(r.totalTokens).toBe(150)
  })

  it('ai.usage.list paginates', async () => {
    db.prepare(
      `INSERT INTO ai_usage (profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, created_at)
                VALUES ('p','m',1,1,1,1,null,?)`
    ).run(new Date().toISOString())
    const r = await aiHandlers['usage.list']({ limit: 10, offset: 0 })
    expect(r.total).toBe(1)
    expect(r.items).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run — fails**

Run: `npx vitest run electron/ipc/ai.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement handlers**

```ts
// electron/ipc/ai.ts
import type { IpcContract } from '@shared/ipc-contract'
import { aiUsage } from '../ai/usage'
import { jobsStore } from '../queue/store'

export const aiHandlers: IpcContract['ai'] = {
  async reviewClip(clipId, opts) {
    const force = opts?.force === true
    const dedupeKey = force ? `clip:${clipId}:force:${Date.now()}` : `clip:${clipId}`
    const { id } = jobsStore.enqueue('ai-review-clip', { clipId, force }, { dedupeKey })
    return { jobId: id }
  },

  async ['usage.summary'](opts) {
    return aiUsage.summary(opts)
  },

  async ['usage.list'](opts) {
    return aiUsage.list(opts)
  }
}
```

- [ ] **Step 5: Run — passes**

Run: `npx vitest run electron/ipc/ai.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Register handlers in `electron/main.ts`**

Find the section where other IPC namespaces are registered (e.g. `registerHandlers({ file: fileHandlers, clips: clipsHandlers, ... })`) and add:

```ts
import { aiHandlers } from './ipc/ai'
// ... in the registration block:
registerHandlers({ /* existing entries */ ai: aiHandlers })
```

(The exact integration path depends on the existing main bootstrap. If `main.ts` uses the factory style, follow the existing pattern. Run `npm run dev` and confirm no TS errors.)

- [ ] **Step 7: Sanity test the typed contract**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add shared/ipc-contract.ts electron/ipc/ai.ts electron/ipc/ai.test.ts electron/main.ts
git commit -m "feat(phase-15): ipc/ai — reviewClip / usage.summary / usage.list handlers"
```

---

## Self-Review Checklist (filled in)

- ✅ Spec coverage:
  - `ai-prompts/spec.md` — Prompt 模板模型 / review-clip schema / body 截断 / 输出语言与风格 → Tasks 1, 2.
  - `ai-reviewer-service/spec.md` — reviewClip 服务 (clip-not-found / file-not-found / cache hit / force / mtime conflict) → Tasks 3-7. Reviewer handler → Plan 3 Task 1. 手动触发重审 IPC → Task 10.
  - `ai-usage-log/spec.md` — 记录 API / 查询聚合 / 查询明细 → Task 9 + Task 10.
- ✅ No placeholders.
- ✅ Type consistency: `ReviewClipOutput { result, llmCall?, cacheHit }` used in both reviewer.ts and the handler (Plan 3); `AiUsageRow` matches `shared/ai-types.ts`.
- ✅ Phase 4 integration: `fileHandlers.writeParsed(rel, fm, body, { expectedMtime })`; `E_MTIME_MISMATCH` → `E_MTIME_CONFLICT` translation captured.
- ✅ IPC pattern A (typed contract) followed; `IpcContract['ai']` extended.

## OpenSpec task mapping

- Task 1 → 3.1
- Task 2 → 3.2
- Task 3 → 4.1
- Task 4 → 4.2
- Task 5 → 4.3
- Task 6 → 4.4
- Task 7 → 4.5
- Task 8 → 4.6
- Task 9 → 5.1
- Task 10 → 5.2
