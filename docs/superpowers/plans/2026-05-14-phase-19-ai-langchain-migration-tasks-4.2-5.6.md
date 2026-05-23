# Phase 19 · AI LangChain Migration — Tasks 4.2–5.6 (Reviewer + Tool Rewrites)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch `reviewer.ts` from `llmClient.chatJson` + Ajv to `buildChatModel(profile).withStructuredOutput(AiReviewSchema).invoke(messages)`; delete `parse-json.ts`; rewrite all 5 built-in tools as `tool(fn, { schema: z.object(...) })`; export them as an array.

**Architecture:** After this plan, `reviewer.ts` and each tool consume only LangChain primitives. The legacy `llmClient` (in `electron/ai/client.ts`) still exists and is referenced by `electron/agent/loop.ts` — the runner switch happens in Plan 3. The `registry` (`electron/agent/registry.ts`) still exposes JSON-Schema definitions and is still used by `loop.ts`; in Plan 3 we delete the registry and feed the new array directly to `createAgent({ tools })`. Tool files keep their existing snake_case names (`search_files.ts`, etc.).

**Tech Stack:** TypeScript, `@langchain/core` (`tool`, `BaseChatModel.withStructuredOutput`), `zod@^4`, `vitest`.

**Dependencies on Plan 1:** Plan 1 added `buildChatModel`, `normalize-errors`, and migrated `review-clip` schema to Zod. This plan consumes all three.

**LangChain reference:** Query the `langchain-docs` MCP via `mcp__langchain-docs__search_docs_by_lang_chain` whenever you need exact `tool()`, `withStructuredOutput`, or Zod-passing signatures.

---

<!-- openspec-task: 4.2 -->

### Task 1: Rewrite `reviewer.ts` to use `withStructuredOutput`

**Files:**

- Modify: `electron/ai/reviewer.ts`

- [ ] **Step 1: Look up `withStructuredOutput` API**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with query `"withStructuredOutput zod schema invoke messages"`.

Confirm the signature is `model.withStructuredOutput(zodSchema).invoke(messages)` and that messages can be the LangChain `MessageInput` array form (objects with `role` and `content`). Some versions require `HumanMessage` / `SystemMessage` wrapper classes — check.

- [ ] **Step 2: Replace `reviewer.ts` body**

Edit `electron/ai/reviewer.ts`. Replace the file content with:

```typescript
import type { AiReviewResult, LlmErrorCode } from '@shared/ai-types'
import path from 'node:path'
import fs from 'node:fs'
import { dbService } from '../services/db'
import { getCurrent } from '../services/grove'
import { parseFile } from '../services/frontmatter'
import { reviewClip as reviewClipPrompt, AiReviewSchema } from './prompts/review-clip'
import { fileHandlers } from '../ipc/file'
import { buildChatModel, type ResolvedProfile } from './model-factory'
import { normalizeLLMError } from './normalize-errors'
import { settingsStore } from '../settings/store'
import { getProfileDecryptedKey } from '../settings/profile-key'
import { aiUsage } from './usage'

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
  const db = dbService.requireCurrent()
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
  const grove = getCurrent()
  if (!grove) throw rerr('E_FILE_NOT_FOUND', 'no grove opened')
  const root = grove.vaultRoot
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

function resolveProfile(profileId?: string): ResolvedProfile {
  const db = dbService.requireCurrent()
  let id = profileId
  if (!id) {
    const ai = settingsStore.get('ai')
    id = ai?.defaultProfileId ?? undefined
  }
  if (!id) throw rerr('E_MISSING_PROFILE', 'no profileId; settings.ai.defaultProfileId is null')

  const p = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(id) as
    | {
        id: string
        provider: string
        model: string
        base_url: string | null
        temperature: number
        max_tokens: number | null
      }
    | undefined
  if (!p) throw rerr('E_MISSING_PROFILE', `profile not found: ${id}`)
  if (!p.model) throw rerr('E_CONFIG', `profile ${id} has empty model`)
  if (p.provider === 'openai-compatible' && !p.base_url) {
    throw rerr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on profile ${id}`)
  }
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id)
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    baseUrl: p.base_url ?? undefined,
    apiKey,
    maxTokens: p.max_tokens ?? undefined,
    temperature: p.temperature
  }
}

export async function reviewClip(
  clipId: number,
  opts: ReviewClipOpts = {}
): Promise<ReviewClipOutput> {
  const clip = loadClip(clipId)
  const md = loadMd(clip.path)

  // Cache short-circuit (unchanged).
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

  const profile = resolveProfile()

  const { system, user } = reviewClipPrompt.render({
    title: clip.title ?? '',
    url: clip.url,
    body: md.body
  })

  const t0 = Date.now()
  let parsed: ReturnType<typeof AiReviewSchema.parse>
  let usage: { input_tokens?: number; output_tokens?: number } | undefined
  let modelName = profile.model

  try {
    const chatModel = buildChatModel(profile)
    const structured = chatModel.withStructuredOutput(AiReviewSchema)
    const ai = await structured.invoke([
      { role: 'system', content: system },
      { role: 'user', content: user }
    ])
    // `ai` is the validated Zod object. usage_metadata is attached to the underlying AIMessage,
    // surfaced via `response_metadata`. Some versions expose it via the bound `_llmType`'s
    // last `AIMessage`. Defensive read:
    parsed = ai
    usage = (ai as any).usage_metadata ?? (ai as any).response_metadata?.usage ?? undefined
  } catch (err) {
    aiUsage.insert({
      profileId: profile.id,
      model: modelName,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: Date.now() - t0,
      ok: 0,
      error: (err as any)?.code ?? 'E_UNKNOWN'
    })
    const norm = normalizeLLMError(err)
    throw norm
  }

  const result: AiReviewResult = {
    summary: parsed.summary,
    suggestedTitle: parsed.suggestedTitle,
    tags: parsed.tags,
    keyQuotes: parsed.keyQuotes,
    reviewedAt: new Date().toISOString()
  }

  // Write back to frontmatter (unchanged behavior).
  const nextFrontmatter = {
    ...md.frontmatter,
    ai_summary: result.summary,
    ai_suggested_title: result.suggestedTitle,
    ai_tags: result.tags,
    ai_key_quotes: result.keyQuotes,
    ai_reviewed_at: result.reviewedAt
  }

  try {
    await fileHandlers.writeParsed(clip.path, nextFrontmatter, md.body, {
      expectedMtime: md.mtimeMs
    })
  } catch (e) {
    const code = (e as any)?.code
    if (code === 'E_MTIME_MISMATCH') throw rerr('E_MTIME_CONFLICT', 'mtime conflict on writeback')
    throw e
  }

  const latencyMs = Date.now() - t0
  aiUsage.insert({
    profileId: profile.id,
    model: modelName,
    promptTokens: usage?.input_tokens ?? 0,
    completionTokens: usage?.output_tokens ?? 0,
    latencyMs,
    ok: 1,
    error: null
  })

  return {
    result,
    cacheHit: false,
    llmCall: {
      model: modelName,
      latencyMs,
      promptTokens: usage?.input_tokens ?? null,
      completionTokens: usage?.output_tokens ?? null
    }
  }
}
```

Notes:

- The `usage_metadata` extraction here is defensive; Task 4.4 in Plan 5 codifies it in `usage.ts`. We duplicate temporarily so this Plan ships independently.
- We deliberately drop the import of `./client` (`llmClient`) — `reviewer.ts` is now provider-independent.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors.

If typecheck complains about `chatModel.withStructuredOutput`'s return type vs Zod 4 type inference, ensure `@langchain/core` and `zod` versions are compatible. Patch via `as any` only as last resort and document the cause.

- [ ] **Step 4: Commit**

```bash
git add electron/ai/reviewer.ts
git commit -m "refactor(ai): reviewer uses buildChatModel + withStructuredOutput + Zod"
```

(Tests will fail until Task 2 — that's expected.)

---

<!-- openspec-task: 4.3 -->

### Task 2: Rewrite `reviewer.test.ts`

**Files:**

- Modify: `electron/ai/reviewer.test.ts`

- [ ] **Step 1: Read existing test setup**

```bash
sed -n '1,60p' electron/ai/reviewer.test.ts
```

Note the mocks: `dbService`, `getCurrent`, `llmClient.chatJson`, `settingsStore`, `fileHandlers.writeParsed`. The new test replaces the `llmClient` mock with a `buildChatModel` mock.

- [ ] **Step 2: Replace mock setup + scenarios**

Replace `electron/ai/reviewer.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
vi.mock('../services/grove', () => ({
  getCurrent: vi.fn(() => ({ vaultRoot: '/tmp/grove' }))
}))
vi.mock('./model-factory', () => ({
  buildChatModel: vi.fn()
}))
vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn(() => ({ defaultProfileId: 'p1' })) }
}))
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test')
}))
vi.mock('../ipc/file', () => ({
  fileHandlers: { writeParsed: vi.fn().mockResolvedValue(undefined) }
}))

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dbService } from '../services/db'
import { buildChatModel } from './model-factory'
import { fileHandlers } from '../ipc/file'
import { reviewClip } from './reviewer'

let db: Database.Database
let tmpDir: string

function seedProfile() {
  db.prepare(
    `INSERT INTO ai_provider_profiles (id, name, provider, model, base_url, temperature, max_tokens, sort_order)
              VALUES ('p1', 'p1', 'openai', 'gpt-4o-mini', NULL, 0.3, 800, 0)`
  ).run()
}

function seedClip(p: string) {
  db.prepare(
    `INSERT INTO clips (id, url, path, title, excerpt, created_at, captured_at, source_kind)
              VALUES (1, 'https://x', ?, 't', null, '2026-05-14T00:00:00Z', '2026-05-14T00:00:00Z', 'browser')`
  ).run(p)
}

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-clip-'))
  ;(require('../services/grove') as any).getCurrent.mockReturnValue({ vaultRoot: tmpDir })
  ;(buildChatModel as any).mockReset()
  ;(fileHandlers.writeParsed as any).mockReset()
  ;(fileHandlers.writeParsed as any).mockResolvedValue(undefined)
  seedProfile()
})

const validReview = {
  summary: '中文摘要',
  suggestedTitle: '更好的标题',
  tags: ['deep-learning', 'transformers', 'ml-systems'],
  keyQuotes: ['原文重要引用']
}

function fakeModel(returnValue: any, opts: { throws?: any; usage?: any } = {}) {
  return {
    withStructuredOutput: () => ({
      invoke: vi.fn(async () => {
        if (opts.throws) throw opts.throws
        if (opts.usage) Object.assign(returnValue, { usage_metadata: opts.usage })
        return returnValue
      })
    })
  }
}

describe('reviewClip — happy path', () => {
  it('calls model.withStructuredOutput(AiReviewSchema), writes back frontmatter, returns result', async () => {
    const rel = 'a.md'
    const abs = path.join(tmpDir, rel)
    fs.writeFileSync(abs, '---\n---\nbody content\n', 'utf8')
    seedClip(rel)
    ;(buildChatModel as any).mockReturnValue(
      fakeModel(validReview, { usage: { input_tokens: 100, output_tokens: 50 } })
    )

    const out = await reviewClip(1)

    expect(out.result.summary).toBe('中文摘要')
    expect(out.result.tags).toHaveLength(3)
    expect(out.cacheHit).toBe(false)
    expect(out.llmCall?.promptTokens).toBe(100)
    expect(out.llmCall?.completionTokens).toBe(50)

    expect(fileHandlers.writeParsed).toHaveBeenCalledWith(
      'a.md',
      expect.objectContaining({ ai_summary: '中文摘要', ai_tags: validReview.tags }),
      'body content\n',
      expect.objectContaining({ expectedMtime: expect.any(Number) })
    )
  })
})

describe('reviewClip — cache hit', () => {
  it('returns cached result without calling LLM when ai_reviewed_at is present', async () => {
    const rel = 'a.md'
    const abs = path.join(tmpDir, rel)
    fs.writeFileSync(
      abs,
      `---\nai_reviewed_at: 2026-05-13T00:00:00Z\nai_summary: cached\nai_suggested_title: t\nai_tags: [a-b, c-d, e-f]\nai_key_quotes: [q]\n---\n`,
      'utf8'
    )
    seedClip(rel)

    const out = await reviewClip(1)

    expect(out.cacheHit).toBe(true)
    expect(out.result.summary).toBe('cached')
    expect(buildChatModel).not.toHaveBeenCalled()
  })
})

describe('reviewClip — error paths', () => {
  it('maps LLM throws via normalize-errors to LlmErrorCode', async () => {
    const rel = 'a.md'
    const abs = path.join(tmpDir, rel)
    fs.writeFileSync(abs, '---\n---\nbody\n', 'utf8')
    seedClip(rel)
    const httpErr = Object.assign(new Error('Unauthorized'), { status: 401 })
    ;(buildChatModel as any).mockReturnValue(fakeModel(null, { throws: httpErr }))

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_AUTH' })
  })

  it('maps writeParsed E_MTIME_MISMATCH to E_MTIME_CONFLICT', async () => {
    const rel = 'a.md'
    const abs = path.join(tmpDir, rel)
    fs.writeFileSync(abs, '---\n---\nbody\n', 'utf8')
    seedClip(rel)
    ;(buildChatModel as any).mockReturnValue(fakeModel(validReview))
    ;(fileHandlers.writeParsed as any).mockRejectedValueOnce(
      Object.assign(new Error('mtime'), { code: 'E_MTIME_MISMATCH' })
    )

    await expect(reviewClip(1)).rejects.toMatchObject({ code: 'E_MTIME_CONFLICT' })
  })

  it('throws E_CLIP_NOT_FOUND when clip row is missing', async () => {
    await expect(reviewClip(999)).rejects.toMatchObject({ code: 'E_CLIP_NOT_FOUND' })
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `pnpm vitest run electron/ai/reviewer.test.ts`
Expected: all passing.

If any test fails because `withStructuredOutput`'s `usage_metadata` attachment differs from the mock, adjust the mock to mirror the actual LangChain runtime behavior (consult MCP `mcp__langchain-docs__search_docs_by_lang_chain` `"AIMessage usage_metadata structured output"`).

- [ ] **Step 4: Commit**

```bash
git add electron/ai/reviewer.test.ts
git commit -m "test(ai): reviewer drives mocked buildChatModel.withStructuredOutput"
```

---

<!-- openspec-task: 4.4 -->

### Task 3: Delete `parse-json.ts` and its test

**Files:**

- Delete: `electron/ai/parse-json.ts`
- Delete: `electron/ai/parse-json.test.ts`

- [ ] **Step 1: Confirm no remaining consumers**

Run: `grep -rn "from '.*parse-json'\|from '.*parse-json/'" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared --include='*.ts' 2>&1`

Expected output: only `electron/ai/client.ts` references it (the legacy chatJson path). `client.ts` is deleted in Plan 6; until then it still uses `parse-json.ts`.

**If `client.ts` is the only consumer**: defer deletion to Plan 6 Task 1 (`9.5 delete client.ts`). Mark this task as N/A by:

```bash
git commit --allow-empty -m "chore(ai): defer parse-json.ts deletion until client.ts removal (Plan 6 Task 1)"
```

**If NO consumers remain** (e.g. you've already finished Plan 6 ahead of schedule): proceed with delete:

```bash
git rm electron/ai/parse-json.ts electron/ai/parse-json.test.ts
git commit -m "refactor(ai): remove parse-json.ts (replaced by withStructuredOutput)"
```

The empty commit is the expected outcome of this task during normal sequential execution.

---

<!-- openspec-task: 4.5 -->

### Task 4: Adjust `ai-review-clip.ts` handler error mapping

**Files:**

- Modify: `electron/queue/handlers/ai-review-clip.ts`
- Modify: `electron/queue/handlers/ai-review-clip.test.ts` if assertions reference `E_RESPONSE` / Ajv-specific outputs

- [ ] **Step 1: Read the handler**

```bash
cat electron/queue/handlers/ai-review-clip.ts
```

Find the `catch` branch that maps reviewer errors. The current code likely treats `E_RESPONSE` (Ajv validation failure) as retryable or terminal — check whether the FAIL_CODES set needs updating to include `E_RATE` or similar.

- [ ] **Step 2: Update catch branch to consume normalized errors**

Edit the handler. The reviewer now throws errors with `code` already in `LlmErrorCode` form (via `normalizeLLMError`), so the handler should only need to read `(err as any).code` — which it almost certainly already does. The change is mostly verification.

Replace any explicit string-matching like `if (err?.message?.includes('Ajv'))` with code-based mapping:

```typescript
// Before (if present):
//   if (/Ajv|schema validation/i.test(err?.message)) return { ok: false, error: 'E_RESPONSE' };
// After:
const code = (err as any)?.code as LlmErrorCode | undefined
if (code) return { ok: false, error: code, retryable: !FAIL_CODES.has(code) }
```

Use the existing `FAIL_CODES` set to decide retry behavior.

- [ ] **Step 3: Run handler tests**

Run: `pnpm vitest run electron/queue/handlers/ai-review-clip.test.ts`
Expected: green. If a test asserts on a specific error code that no longer fires (e.g. Ajv-flavored messages), update the assertion to match the normalized `E_RESPONSE` code.

- [ ] **Step 4: Commit**

```bash
git add electron/queue/handlers/ai-review-clip.ts electron/queue/handlers/ai-review-clip.test.ts
git commit -m "refactor(queue): consume normalized LlmErrorCode in ai-review-clip handler"
```

---

<!-- openspec-task: 5.1 -->

### Task 5: Rewrite `search_files.ts` as `tool(fn, { schema })`

**Files:**

- Modify: `electron/agent/tools/search_files.ts`
- Modify: `electron/agent/tools/search_files.test.ts` (if assertions reference old Tool shape)

- [ ] **Step 1: Look up `tool()` factory signature**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with query `"tool factory function name description schema zod"`.

Confirm signature is approximately:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const myTool = tool(
  async (args, runManager) => {
    /* returns serializable result */
  },
  {
    name: 'my_tool',
    description: '...',
    schema: z.object({
      /* ... */
    })
  }
)
```

- [ ] **Step 2: Rewrite `search_files.ts`**

Replace `electron/agent/tools/search_files.ts` with:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'

const SearchFilesSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("FTS5 query — use words from the user's question; for phrases use double quotes."),
  limit: z.number().int().min(1).max(20).optional().describe('Max number of hits (1–20).')
})

export const searchFilesTool = tool(
  async ({ query, limit }) => {
    const db = dbService.requireCurrent()
    const cappedLimit = Math.max(1, Math.min(20, limit ?? 8))
    const r = fullText(db, query, { limit: cappedLimit, offset: 0 })
    return {
      items: r.items.map((i) => ({
        path: i.summary.path,
        title: i.summary.title ?? i.summary.path,
        snippet: i.snippet
      }))
    }
  },
  {
    name: 'search_files',
    description:
      "Full-text search the user's grove. Returns matching markdown files with a highlighted snippet. Use this BEFORE answering questions about the user's notes.",
    schema: SearchFilesSchema
  }
)

export default searchFilesTool
```

Notes:

- The default export is preserved for any existing import paths.
- `sideEffect` flag from the old `Tool` interface is no longer attached to the tool object — LangChain expresses approval intent via `humanInTheLoopMiddleware` config. We will list the tool name in the HITL interrupt config in Plan 4 Task 4.
- `ctx.vaultRoot` and `ctx.sessionId` are now passed via `runManager.config.configurable` if needed. `search_files` doesn't read those, but `read_file` / `update_frontmatter` do (next tasks).

- [ ] **Step 3: Update test**

Read existing test: `cat electron/agent/tools/search_files.test.ts`

Adjust to test the new tool by invoking `.invoke({ query: '...' })`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
vi.mock('../../services/search/queries', () => ({
  fullText: vi.fn()
}))

import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'
import { searchFilesTool } from './search_files'

beforeEach(() => {
  ;(dbService.requireCurrent as any).mockReturnValue({})
  ;(fullText as any).mockReset()
})

describe('search_files tool', () => {
  it('returns items mapped to {path,title,snippet}', async () => {
    ;(fullText as any).mockReturnValue({
      items: [
        { summary: { path: 'a.md', title: 'A' }, snippet: '...hit...' },
        { summary: { path: 'b.md', title: null }, snippet: 'x' }
      ]
    })
    const out = await searchFilesTool.invoke({ query: 'foo' })
    expect(out).toEqual({
      items: [
        { path: 'a.md', title: 'A', snippet: '...hit...' },
        { path: 'b.md', title: 'b.md', snippet: 'x' }
      ]
    })
    expect(fullText).toHaveBeenCalledWith({}, 'foo', { limit: 8, offset: 0 })
  })

  it('caps limit between 1 and 20', async () => {
    ;(fullText as any).mockReturnValue({ items: [] })
    await searchFilesTool.invoke({ query: 'q', limit: 100 })
    expect(fullText).toHaveBeenCalledWith({}, 'q', { limit: 20, offset: 0 })
    await searchFilesTool.invoke({ query: 'q', limit: 0 })
    expect((fullText as any).mock.calls[1][2]).toEqual({ limit: 1, offset: 0 })
  })

  it('rejects empty query via Zod schema', async () => {
    await expect(searchFilesTool.invoke({ query: '' } as any)).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run the tool tests**

Run: `pnpm vitest run electron/agent/tools/search_files.test.ts`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/search_files.ts electron/agent/tools/search_files.test.ts
git commit -m "refactor(agent): rewrite search_files as @langchain/core tool with Zod"
```

---

<!-- openspec-task: 5.2 -->

### Task 6: Rewrite `read_file.ts` as `tool()` with embedded `safeResolve`

**Files:**

- Modify: `electron/agent/tools/read_file.ts`
- Modify: `electron/agent/tools/read_file.test.ts`

- [ ] **Step 1: Look up how to read `configurable` from inside a `tool()` callback**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with query `"tool function getCurrentTaskInput config configurable runManager"`.

In LangChain v1 the second argument to the tool function is a `RunnableConfig` object containing `configurable` (where we will inject `vaultRoot` and `sessionId`). Confirm exact field name.

- [ ] **Step 2: Rewrite `read_file.ts`**

Replace `electron/agent/tools/read_file.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { RunnableConfig } from '@langchain/core/runnables'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect } from '../../services/fs-atomic'
import { parseFile } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const MAX_BODY = 60_000

const ReadFileSchema = z.object({
  path: z.string().min(1).describe('Relative path within the grove, e.g. "notes/a.md".')
})

function vaultRootFromConfig(config?: RunnableConfig): string {
  const root = (config?.configurable as any)?.vaultRoot
  if (typeof root !== 'string' || !root) throw new Error('vaultRoot missing from configurable')
  return root
}

export const readFileTool = tool(
  async ({ path: rel }, config) => {
    const vaultRoot = vaultRootFromConfig(config)
    let abs: string
    try {
      abs = safeResolve(vaultRoot, rel, { realpath: true })
    } catch (e: any) {
      const code =
        e instanceof IpcError && e.code === 'E_PERMISSION'
          ? 'E_PATH_ESCAPE'
          : (e?.code ?? 'E_PATH_ESCAPE')
      return { ok: false as const, error: code }
    }
    let read
    try {
      read = await readFileDetect(abs)
    } catch (e: any) {
      if (e?.code === 'ENOENT' || e?.code === 'E_NOT_FOUND')
        return { ok: false as const, error: 'E_NOT_FOUND' }
      return { ok: false as const, error: e?.code ?? 'E_READ_FAILED', detail: e?.message }
    }
    const parsed = parseFile(read.content)
    const body = parsed.body.length > MAX_BODY ? parsed.body.slice(0, MAX_BODY) : parsed.body
    return {
      ok: true as const,
      data: {
        path: rel,
        frontmatter: parsed.frontmatter,
        body,
        truncated: parsed.body.length > MAX_BODY,
        mtimeMs: read.mtimeMs
      }
    }
  },
  {
    name: 'read_file',
    description:
      'Read a markdown file from the grove. Returns parsed frontmatter and body. Body is truncated to 60_000 chars; check `truncated` to know if more exists.',
    schema: ReadFileSchema
  }
)

export default readFileTool
```

- [ ] **Step 3: Update test**

Replace `electron/agent/tools/read_file.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { readFileTool } from './read_file'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'read-file-tool-'))
})

function configurable() {
  return { configurable: { vaultRoot: tmpRoot, sessionId: 's1' } }
}

describe('read_file tool', () => {
  it('reads frontmatter + body for an existing file', async () => {
    const rel = 'note.md'
    fs.writeFileSync(path.join(tmpRoot, rel), '---\ntitle: T\n---\nhello\n', 'utf8')
    const out: any = await readFileTool.invoke({ path: rel }, configurable())
    expect(out.ok).toBe(true)
    expect(out.data.frontmatter.title).toBe('T')
    expect(out.data.body).toContain('hello')
    expect(out.data.truncated).toBe(false)
  })

  it('truncates body to MAX_BODY=60000', async () => {
    const rel = 'big.md'
    fs.writeFileSync(path.join(tmpRoot, rel), '---\n---\n' + 'a'.repeat(70000), 'utf8')
    const out: any = await readFileTool.invoke({ path: rel }, configurable())
    expect(out.ok).toBe(true)
    expect(out.data.body.length).toBe(60000)
    expect(out.data.truncated).toBe(true)
  })

  it('returns E_NOT_FOUND for missing file', async () => {
    const out: any = await readFileTool.invoke({ path: 'nope.md' }, configurable())
    expect(out).toEqual({ ok: false, error: 'E_NOT_FOUND' })
  })

  it('returns E_PATH_ESCAPE for ../ traversal', async () => {
    const out: any = await readFileTool.invoke({ path: '../escape.md' }, configurable())
    expect(out.ok).toBe(false)
    expect(out.error).toBe('E_PATH_ESCAPE')
  })

  it('throws zod error for empty path', async () => {
    await expect(readFileTool.invoke({ path: '' } as any, configurable())).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm vitest run electron/agent/tools/read_file.test.ts
git add electron/agent/tools/read_file.ts electron/agent/tools/read_file.test.ts
git commit -m "refactor(agent): rewrite read_file as Zod tool reading vaultRoot from configurable"
```

---

<!-- openspec-task: 5.3 -->

### Task 7: Rewrite `list_tags.ts` as Zod tool

**Files:**

- Modify: `electron/agent/tools/list_tags.ts`
- Modify: `electron/agent/tools/list_tags.test.ts`

- [ ] **Step 1: Rewrite `list_tags.ts`**

Replace `electron/agent/tools/list_tags.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'

const ListTagsSchema = z.object({
  prefix: z.string().optional().describe('Case-sensitive prefix to filter tag names.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe('Max tags to return (1–200, default 50).')
})

export const listTagsTool = tool(
  async ({ prefix, limit }) => {
    const db = dbService.requireCurrent()
    const cappedLimit = Math.max(1, Math.min(200, limit ?? 50))
    const safePrefix = prefix ?? ''
    const rows = safePrefix
      ? db
          .prepare(
            "SELECT name, usage_count FROM tags WHERE name LIKE ? ESCAPE '\\' ORDER BY usage_count DESC LIMIT ?"
          )
          .all(safePrefix.replace(/[%_]/g, '\\$&') + '%', cappedLimit)
      : db
          .prepare('SELECT name, usage_count FROM tags ORDER BY usage_count DESC LIMIT ?')
          .all(cappedLimit)
    return { items: rows as Array<{ name: string; usage_count: number }> }
  },
  {
    name: 'list_tags',
    description:
      'List tags used in the grove, ordered by usage count descending. Optional prefix filter for autocomplete-style lookups.',
    schema: ListTagsSchema
  }
)

export default listTagsTool
```

- [ ] **Step 2: Update test (mirror old test, adapt invoke shape)**

Replace `electron/agent/tools/list_tags.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))

import Database from 'better-sqlite3'
import { dbService } from '../../services/db'
import { listTagsTool } from './list_tags'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec('CREATE TABLE tags (name TEXT PRIMARY KEY, usage_count INTEGER DEFAULT 0)')
  db.prepare('INSERT INTO tags (name, usage_count) VALUES (?, ?)').run('rust', 9)
  db.prepare('INSERT INTO tags (name, usage_count) VALUES (?, ?)').run('react', 5)
  db.prepare('INSERT INTO tags (name, usage_count) VALUES (?, ?)').run('python', 8)
  ;(dbService.requireCurrent as any).mockReturnValue(db)
})

describe('list_tags tool', () => {
  it('returns tags ordered by usage_count desc', async () => {
    const out: any = await listTagsTool.invoke({})
    expect(out.items.map((t: any) => t.name)).toEqual(['rust', 'python', 'react'])
  })

  it('filters by prefix', async () => {
    const out: any = await listTagsTool.invoke({ prefix: 'r' })
    expect(out.items.map((t: any) => t.name).sort()).toEqual(['react', 'rust'])
  })

  it('caps limit at 200', async () => {
    const out: any = await listTagsTool.invoke({ limit: 9999 })
    expect(out.items.length).toBeLessThanOrEqual(200)
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run electron/agent/tools/list_tags.test.ts
git add electron/agent/tools/list_tags.ts electron/agent/tools/list_tags.test.ts
git commit -m "refactor(agent): rewrite list_tags as Zod tool"
```

---

<!-- openspec-task: 5.4 -->

### Task 8: Rewrite `update_frontmatter.ts` as Zod tool with `reason: z.string().min(1)`

**Files:**

- Modify: `electron/agent/tools/update_frontmatter.ts`
- Modify: `electron/agent/tools/update_frontmatter.test.ts`

Special note: this is the only tool with `sideEffect: true`. Approval gating moves from the old loop's branch logic to `humanInTheLoopMiddleware` config in Plan 4 Task 4. The tool itself becomes "always-runs-when-invoked" — by the time `agent.stream` reaches it, the user already approved (or the middleware bypassed approval for low-risk variants).

The old `mergePatch` helper with `null` semantics MUST be preserved.

- [ ] **Step 1: Rewrite the tool**

Replace `electron/agent/tools/update_frontmatter.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { RunnableConfig } from '@langchain/core/runnables'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect, writeWithVerify, normalizeForDisk } from '../../services/fs-atomic'
import { parseFile, stringify } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const UpdateFrontmatterSchema = z.object({
  path: z.string().min(1).describe('Relative path within the grove.'),
  patch: z
    .record(z.unknown())
    .describe(
      'Object whose keys will be merged into existing frontmatter; null values delete the key.'
    ),
  reason: z.string().min(1).describe('Why this change is being made (shown to the user).'),
  expectedMtime: z
    .number()
    .optional()
    .describe('Last-known file mtimeMs for optimistic locking. Get this from a prior read_file.')
})

function vaultRootFromConfig(config?: RunnableConfig): string {
  const root = (config?.configurable as any)?.vaultRoot
  if (typeof root !== 'string' || !root) throw new Error('vaultRoot missing from configurable')
  return root
}

function mergePatch(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...prev }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k]
    else out[k] = v
  }
  return out
}

export const updateFrontmatterTool = tool(
  async (args, config) => {
    const vaultRoot = vaultRootFromConfig(config)
    if (!args.reason || !args.reason.trim()) {
      return { ok: false as const, error: 'E_MISSING_REASON' }
    }
    let abs: string
    try {
      abs = safeResolve(vaultRoot, args.path)
    } catch (e: any) {
      const code =
        e instanceof IpcError && e.code === 'E_PERMISSION'
          ? 'E_PATH_ESCAPE'
          : (e?.code ?? 'E_PATH_ESCAPE')
      return { ok: false as const, error: code }
    }

    let read
    try {
      read = await readFileDetect(abs)
    } catch (e: any) {
      if (e?.code === 'ENOENT' || e?.code === 'E_NOT_FOUND')
        return { ok: false as const, error: 'E_NOT_FOUND' }
      return { ok: false as const, error: e?.code ?? 'E_READ_FAILED', detail: e?.message }
    }
    const parsed = parseFile(read.content)
    const merged = mergePatch(parsed.frontmatter as Record<string, unknown>, args.patch)
    const newContent = normalizeForDisk(stringify(merged, parsed.body), { eol: read.eol })
    try {
      const w = await writeWithVerify(abs, newContent, {
        expectedMtime: args.expectedMtime,
        eol: read.eol
      })
      return {
        ok: true as const,
        data: { path: args.path, mtimeMs: w.mtimeMs, sha256: w.sha256, frontmatter: merged }
      }
    } catch (e: any) {
      if (e instanceof IpcError && e.code === 'E_MTIME_MISMATCH') {
        return { ok: false as const, error: 'E_MTIME_CONFLICT', detail: e.context }
      }
      return { ok: false as const, error: e?.code ?? 'E_WRITE_FAILED', detail: e?.message }
    }
  },
  {
    name: 'update_frontmatter',
    description:
      "Merge a JSON patch into a markdown file's YAML frontmatter. Setting a key to null deletes that key. ALWAYS provide a `reason`. The user will be asked to approve before this runs.",
    schema: UpdateFrontmatterSchema
  }
)

export default updateFrontmatterTool
```

- [ ] **Step 2: Update test (use existing scenarios as inspiration)**

Replace `electron/agent/tools/update_frontmatter.test.ts` with adapted scenarios. Read the current file first to preserve all behavior asserts (especially `null` deletion, `E_MTIME_CONFLICT`, `E_PATH_ESCAPE`, `E_MISSING_REASON`):

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { updateFrontmatterTool } from './update_frontmatter'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'update-fm-tool-'))
})

function config() {
  return { configurable: { vaultRoot: tmpRoot, sessionId: 's1' } }
}

describe('update_frontmatter tool', () => {
  it('merges patch into existing frontmatter', async () => {
    const rel = 'a.md'
    fs.writeFileSync(path.join(tmpRoot, rel), '---\ntags: [old]\n---\nbody\n', 'utf8')
    const out: any = await updateFrontmatterTool.invoke(
      { path: rel, patch: { tags: ['new'], rating: 5 }, reason: 'bump rating' },
      config()
    )
    expect(out.ok).toBe(true)
    expect(out.data.frontmatter).toMatchObject({ tags: ['new'], rating: 5 })
  })

  it('deletes a key when patch value is null', async () => {
    const rel = 'a.md'
    fs.writeFileSync(path.join(tmpRoot, rel), '---\nrating: 5\ncategory: x\n---\nbody\n', 'utf8')
    const out: any = await updateFrontmatterTool.invoke(
      { path: rel, patch: { rating: null }, reason: 'remove rating' },
      config()
    )
    expect(out.ok).toBe(true)
    expect(out.data.frontmatter).not.toHaveProperty('rating')
    expect(out.data.frontmatter.category).toBe('x')
  })

  it('returns E_MISSING_REASON for empty reason', async () => {
    const rel = 'a.md'
    fs.writeFileSync(path.join(tmpRoot, rel), '---\n---\nbody\n', 'utf8')
    const out: any = await updateFrontmatterTool.invoke(
      { path: rel, patch: { x: 1 }, reason: '   ' },
      config()
    )
    expect(out).toEqual({ ok: false, error: 'E_MISSING_REASON' })
  })

  it('returns E_PATH_ESCAPE for ../', async () => {
    const out: any = await updateFrontmatterTool.invoke(
      { path: '../escape.md', patch: { x: 1 }, reason: 'r' },
      config()
    )
    expect(out.ok).toBe(false)
    expect(out.error).toBe('E_PATH_ESCAPE')
  })

  it('returns E_NOT_FOUND for missing file', async () => {
    const out: any = await updateFrontmatterTool.invoke(
      { path: 'gone.md', patch: { x: 1 }, reason: 'r' },
      config()
    )
    expect(out).toEqual({ ok: false, error: 'E_NOT_FOUND' })
  })

  it('returns E_MTIME_CONFLICT when expectedMtime is stale', async () => {
    const rel = 'a.md'
    const abs = path.join(tmpRoot, rel)
    fs.writeFileSync(abs, '---\n---\nbody\n', 'utf8')
    const out: any = await updateFrontmatterTool.invoke(
      { path: rel, patch: { x: 1 }, reason: 'r', expectedMtime: 0 },
      config()
    )
    expect(out.ok).toBe(false)
    expect(out.error).toBe('E_MTIME_CONFLICT')
  })
})
```

If `writeWithVerify` lives in `services/fs-atomic.ts` and uses different `expectedMtime: 0` semantics, adapt the last test to mock-stub the mtime check appropriately. Refer to existing test file before this rewrite for the exact pattern.

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run electron/agent/tools/update_frontmatter.test.ts
git add electron/agent/tools/update_frontmatter.ts electron/agent/tools/update_frontmatter.test.ts
git commit -m "refactor(agent): rewrite update_frontmatter as Zod tool with reason.min(1)"
```

---

<!-- openspec-task: 5.5 -->

### Task 9: Rewrite `clip_summary.ts` as Zod tool

**Files:**

- Modify: `electron/agent/tools/clip_summary.ts`
- Modify: `electron/agent/tools/clip_summary.test.ts`

- [ ] **Step 1: Rewrite the tool**

Replace `electron/agent/tools/clip_summary.ts`:

```typescript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { reviewClip } from '../../ai/reviewer'

const ClipSummarySchema = z.object({
  clipId: z
    .string()
    .min(1)
    .describe('Clip ID — find these by searching files where frontmatter.kind === "clip".'),
  force: z.boolean().optional().describe('Re-run review even if cached.')
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
    } catch (e: any) {
      return { ok: false as const, error: e?.code ?? 'E_REVIEW_FAILED', detail: e?.message }
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
```

- [ ] **Step 2: Update test**

Replace `electron/agent/tools/clip_summary.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ai/reviewer', () => ({
  reviewClip: vi.fn()
}))

import { reviewClip } from '../../ai/reviewer'
import { clipSummaryTool } from './clip_summary'

beforeEach(() => {
  ;(reviewClip as any).mockReset()
})

describe('clip_summary tool', () => {
  it('returns summary + tags + reviewedAt + cacheHit when reviewClip succeeds', async () => {
    ;(reviewClip as any).mockResolvedValueOnce({
      result: { summary: 's', tags: ['a-b'], reviewedAt: 't' },
      llmCall: { model: 'gpt-4o-mini' },
      cacheHit: false
    })
    const out: any = await clipSummaryTool.invoke({ clipId: '1' })
    expect(out.ok).toBe(true)
    expect(out.data).toMatchObject({
      summary: 's',
      tags: ['a-b'],
      reviewedAt: 't',
      model: 'gpt-4o-mini',
      cacheHit: false
    })
  })

  it('returns E_INVALID_ARGS for non-numeric clipId', async () => {
    const out: any = await clipSummaryTool.invoke({ clipId: 'abc' })
    expect(out).toEqual({
      ok: false,
      error: 'E_INVALID_ARGS',
      detail: 'clipId must be a positive integer'
    })
  })

  it('returns E_INVALID_ARGS for negative clipId', async () => {
    const out: any = await clipSummaryTool.invoke({ clipId: '-1' })
    expect(out.error).toBe('E_INVALID_ARGS')
  })

  it('maps reviewer errors via error.code', async () => {
    ;(reviewClip as any).mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'E_RATE' }))
    const out: any = await clipSummaryTool.invoke({ clipId: '1' })
    expect(out.ok).toBe(false)
    expect(out.error).toBe('E_RATE')
  })

  it('passes force flag through to reviewClip', async () => {
    ;(reviewClip as any).mockResolvedValueOnce({ result: { summary: 's' }, cacheHit: false })
    await clipSummaryTool.invoke({ clipId: '1', force: true })
    expect(reviewClip).toHaveBeenCalledWith(1, { force: true })
  })
})
```

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run electron/agent/tools/clip_summary.test.ts
git add electron/agent/tools/clip_summary.ts electron/agent/tools/clip_summary.test.ts
git commit -m "refactor(agent): rewrite clip_summary as Zod tool"
```

---

<!-- openspec-task: 5.6 -->

### Task 10: Create `electron/agent/tools/index.ts` exporting the 5-tool array

**Files:**

- Create: `electron/agent/tools/index.ts`
- Test: `electron/agent/tools/index.test.ts`

- [ ] **Step 1: Write failing test**

Create `electron/agent/tools/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { agentTools } from './index'

describe('agentTools', () => {
  it('exports exactly 5 tools', () => {
    expect(agentTools).toHaveLength(5)
  })

  it('exposes each tool with name + description + schema (LangChain tool shape)', () => {
    for (const t of agentTools) {
      expect(typeof t.name).toBe('string')
      expect(t.name.length).toBeGreaterThan(0)
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(0)
      expect(t.schema).toBeDefined()
      expect(typeof t.invoke).toBe('function')
    }
  })

  it('contains the 5 expected tool names', () => {
    const names = agentTools.map((t) => t.name).sort()
    expect(names).toEqual([
      'clip_summary',
      'list_tags',
      'read_file',
      'search_files',
      'update_frontmatter'
    ])
  })

  it('exports no duplicate names', () => {
    const names = agentTools.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `pnpm vitest run electron/agent/tools/index.test.ts`
Expected: FAIL (no `./index` module yet).

- [ ] **Step 3: Create `index.ts`**

```typescript
import { searchFilesTool } from './search_files'
import { readFileTool } from './read_file'
import { listTagsTool } from './list_tags'
import { updateFrontmatterTool } from './update_frontmatter'
import { clipSummaryTool } from './clip_summary'

export const agentTools = [
  searchFilesTool,
  readFileTool,
  listTagsTool,
  updateFrontmatterTool,
  clipSummaryTool
] as const

export type AgentTool = (typeof agentTools)[number]
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm vitest run electron/agent/tools/index.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/index.ts electron/agent/tools/index.test.ts
git commit -m "feat(agent): add tools/index.ts exporting all 5 Zod tools"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: green except for `electron/agent/loop.test.ts` and `electron/agent/registry.test.ts` (still in use). They should still pass — registry just consumes the old `Tool` shape from `shared/agent-types.ts` for `tools` other than the ones we rewrote. If they break, investigate.

Possible breakage: `bootstrap.ts` calls `registry.register(tool)` for each of the 5 tools we rewrote, but those tools no longer match the old `Tool` interface. Fix in this plan by either:

1. Updating `bootstrap.ts` to do nothing for now (registry already has these tools loaded at import time? No — bootstrap.ts iterates default imports and registers them).
2. Keeping a temporary back-compat wrapper that adapts a LangChain tool to the old `Tool` interface.

Recommended fix (clean): replace `electron/agent/bootstrap.ts` content with a no-op stub until Plan 3 Task 1 deletes the registry. This keeps `loop.ts` happy with whatever tools are already registered from a prior session start, but loop.ts also calls `registry.list()` so an empty registry will break it. Best path: keep `bootstrap.ts` working by wrapping each new tool with a minimal `Tool`-shape adapter ONLY for the legacy registry. Add this adapter in a final commit if test runs reveal the breakage:

```typescript
// electron/agent/bootstrap.ts (temporary back-compat through Plan 3)
import type { Registry } from './registry'
import type { Tool } from '../../shared/agent-types'
import { agentTools } from './tools'

function adapt(t: (typeof agentTools)[number]): Tool {
  // Convert Zod schema to JSON Schema for the legacy registry.
  // zodToJsonSchema returns the JSONSchema7-ish object; safe to cast.
  const { zodToJsonSchema } = require('zod-to-json-schema')
  return {
    name: t.name,
    description: t.description,
    parameters: zodToJsonSchema(t.schema as any) as any,
    sideEffect: t.name === 'update_frontmatter',
    execute: async (args, ctx) => {
      const out = await t.invoke(args as any, {
        configurable: { vaultRoot: ctx.vaultRoot, sessionId: ctx.sessionId }
      })
      return out
    }
  } as Tool
}

export function bootstrapAgent(registry: Registry): void {
  for (const t of agentTools) registry.register(adapt(t))
}
```

`zod-to-json-schema` is widely used and listed as a peer of `@langchain/core`. Verify it's already installed; if not:

```bash
pnpm add zod-to-json-schema
```

Commit the bootstrap fix separately:

```bash
git add electron/agent/bootstrap.ts package.json pnpm-lock.yaml
git commit -m "fix(agent): adapt new Zod tools to legacy registry until Plan 3 deletes it"
```

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: 0 errors.

- [ ] **OpenSpec progress will be synced by `/opsx:executing-plans` — do NOT edit `tasks.md` directly.**
