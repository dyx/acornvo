# Phase 19 · AI LangChain Migration — Tasks 1.1–4.1 (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the dependency swap, build `model-factory` (4 providers + LRU + invalidation), build `normalize-errors`, and migrate `review-clip` prompt schema to Zod — without touching reviewer/runner/tools yet.

**Architecture:** Add 7 `@langchain/*` packages; replace bespoke provider HTTP clients with a single `buildChatModel(profile): BaseChatModel` factory backed by an 8-entry LRU keyed on profile identity; centralize LLM-error → `LlmErrorCode` mapping in `electron/ai/normalize-errors.ts`. Profile updates invalidate the LRU via `settings-effects`. After this plan, old `llmClient.*` still works; only the building blocks are added.

**Tech Stack:** TypeScript 5, Electron, `langchain@^1`, `@langchain/core`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-sqlite`, `zod@^4`, `vitest`, `better-sqlite3`.

**LangChain reference:** When in doubt about API signatures, query the `langchain-docs` MCP via `mcp__langchain-docs__search_docs_by_lang_chain` (e.g. `"ChatOpenAI constructor options"`) or `mcp__langchain-docs__query_docs_filesystem_docs_by_lang_chain` (e.g. file path under `/langchain/v1/` namespace). The MCP returns authoritative v1 documentation.

**Repo conventions to follow:**

- All tests use `vitest`; mocking with `vi.mock(...)` at top of file before imports.
- Migrations live in `electron/services/db/migrations/NNN_*.sql` (NOT `electron/db/migrations/` as `tasks.md` says).
- Tool files use **snake_case** (`search_files.ts`), not kebab-case as `tasks.md` references.
- Imports use TypeScript path aliases `@shared/*` for `shared/*` plus relative paths elsewhere.
- Commit messages follow Conventional Commits (`feat:`, `chore:`, `test:`, `refactor:`).

---

<!-- openspec-task: 1.1 -->

### Task 1: Add `@langchain/*` runtime dependencies to package.json

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Verify current state**

Run: `grep -n '"langchain"\|"@langchain' /Users/aaa/develop/workspace-ai/acornvo/package.json`
Expected: only `"@langchain/react": "^1.0.2"` and `"langchain": "^1.4.0"` present.

- [ ] **Step 2: Look up exact stable versions from langchain-docs MCP**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with query `"v1 install dependencies"`.
Note: capture the recommended caret ranges. The OpenSpec design pins to v1 stable — at the time of writing the v1 family lives at `^1.x` for `@langchain/core`, `^1.x` for `@langchain/openai`/`anthropic`/`ollama`, `^1.x` for `@langchain/langgraph`, and `^1.x` for `@langchain/langgraph-checkpoint-sqlite`.

- [ ] **Step 3: Edit `package.json` dependencies block**

Add the following keys, keeping alphabetical order between existing entries (insert between `"@langchain/react"` and `"@mozilla/readability"`):

```jsonc
"@langchain/anthropic": "^1.0.0",
"@langchain/core": "^1.0.0",
"@langchain/langgraph": "^1.0.0",
"@langchain/langgraph-checkpoint-sqlite": "^1.0.0",
"@langchain/ollama": "^1.0.0",
"@langchain/openai": "^1.0.0",
```

(Adjust the minor versions to match what `mcp__langchain-docs__search_docs_by_lang_chain` reports as stable.)

`"langchain": "^1.4.0"` is already present — leave it.

- [ ] **Step 4: Commit dependency additions**

```bash
git add package.json
git commit -m "chore(deps): add @langchain/* core+providers+langgraph+sqlite-checkpointer"
```

Do NOT run `pnpm install` yet — Task 3 batches install + lockfile.

---

<!-- openspec-task: 1.2 -->

### Task 2: Confirm AI link no longer needs `eventsource-parser`

**Files:**

- Inspect (no edit): `package.json`
- Grep across `electron/ai/**`, `electron/agent/**`

- [ ] **Step 1: Find all `eventsource-parser` imports**

Run: `grep -rn "eventsource-parser" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null`

Capture every result. Most likely they all live under `electron/ai/providers/{openai,anthropic,ollama}.ts` — those will be deleted in Plan 5/6.

- [ ] **Step 2: Decide retention**

If `eventsource-parser` is only used in `electron/ai/providers/**`, do NOT remove from package.json now — it would break the existing providers before they are replaced. Leave it for Plan 6 Task `9.5`/`9.6` cleanup phase. Just record the import sites in a note for the deletion plan.

If `eventsource-parser` is used outside `electron/ai/**`, leave it alone permanently.

- [ ] **Step 3: Note finding in commit-free record**

Append a line to `openspec/changes/phase-19-ai-langchain-migration/notes.md` (create if absent):

```markdown
## eventsource-parser usage (recorded by Task 1.2)

- <paste grep output here>
```

Then:

```bash
git add openspec/changes/phase-19-ai-langchain-migration/notes.md
git commit -m "chore: record eventsource-parser usage sites for later removal"
```

(Skip the commit if the notes file is exactly the same as already-committed content.)

- [ ] **Step 4: Verify `ajv` still needed**

Run: `grep -rln "from 'ajv'\|from \"ajv\"" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared 2>/dev/null`

Confirm at least one match exists OUTSIDE `electron/ai/**` — `shared/frontmatter-schema.ts` or `shared/schemas/` are likely consumers. If yes, `ajv` and `ajv-formats` stay in dependencies. Do not remove.

---

<!-- openspec-task: 1.3 -->

### Task 3: Install dependencies and verify Electron packaging

**Files:**

- Modify: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Install**

Run: `pnpm install`
Expected: no errors; postinstall runs `electron-builder install-app-deps` and `electron-rebuild -f -w better-sqlite3` cleanly.

If `electron-rebuild` fails: capture the error and stop. Most likely cause is `@langchain/langgraph-checkpoint-sqlite` requiring a different `better-sqlite3` version than what we pin. Resolve by adding a `pnpm.overrides` entry:

```jsonc
"pnpm": {
  "overrides": {
    "better-sqlite3": "12.9.0"
  }
}
```

Then re-run `pnpm install`.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck:node && pnpm run typecheck:web`
Expected: 0 errors. New packages are not yet imported, so this only verifies no transitive type breakage.

- [ ] **Step 3: Build to verify Electron packaging**

Run: `pnpm run build` (full build: typecheck + electron-vite build).
Expected: green build; bundled artifacts in `out/`.

If the build fails, investigate before continuing — `@langchain/core` and `@langchain/langgraph` have a few CJS/ESM edge cases.

- [ ] **Step 4: Commit lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: lock pnpm dependencies after adding @langchain/*"
```

---

<!-- openspec-task: 2.1 -->

### Task 4: Implement `buildChatModel(profile)` for 4 providers

**Files:**

- Create: `electron/ai/model-factory.ts`
- Test: `electron/ai/model-factory.test.ts` (later in Task 7)

- [ ] **Step 1: Write failing test stub first (TDD)**

Create `electron/ai/model-factory.test.ts` with just the first scenario — full coverage comes in Task 7. Keep this stub minimal to drive the API surface:

```typescript
// electron/ai/model-factory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation((opts) => ({ __kind: 'openai', opts }))
}))

import { buildChatModel } from './model-factory'

describe('buildChatModel', () => {
  beforeEach(() => {
    ;(buildChatModel as any).__clearCache?.()
  })

  it('builds ChatOpenAI for provider="openai" with model/apiKey/temperature/maxTokens', () => {
    const m: any = buildChatModel({
      id: 'p1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      temperature: 0.3,
      maxTokens: 800
    })
    expect(m.__kind).toBe('openai')
    expect(m.opts.model).toBe('gpt-4o-mini')
    expect(m.opts.apiKey).toBe('sk-test')
    expect(m.opts.temperature).toBe(0.3)
    expect(m.opts.maxTokens).toBe(800)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run electron/ai/model-factory.test.ts`
Expected: FAIL with `Cannot find module './model-factory'`.

- [ ] **Step 3: Look up exact ChatOpenAI / ChatAnthropic / ChatOllama option names**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with queries:

- `"ChatOpenAI options model apiKey baseURL configuration"`
- `"ChatAnthropic constructor options"`
- `"ChatOllama options baseUrl numPredict"`

Confirm that `ChatOpenAI` accepts `{ model, apiKey, temperature, maxTokens, configuration: { baseURL } }` (note: in some versions the key is `openAIApiKey` not `apiKey` — verify from docs). If signatures differ, adapt the code in Step 4.

- [ ] **Step 4: Implement `model-factory.ts`**

Create `electron/ai/model-factory.ts`:

```typescript
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOllama } from '@langchain/ollama'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { createHash } from 'node:crypto'

export interface ResolvedProfile {
  id: string
  provider: 'openai' | 'openai-compatible' | 'anthropic' | 'ollama'
  model: string
  apiKey: string | null
  baseUrl?: string
  temperature?: number
  maxTokens?: number
}

interface CacheEntry {
  key: string
  model: BaseChatModel
}

const MAX_CACHE = 8
const cache: CacheEntry[] = []

function cacheKey(p: ResolvedProfile): string {
  const apiKeyHash = p.apiKey
    ? createHash('sha256').update(p.apiKey).digest('hex').slice(0, 12)
    : 'noauth'
  return `${p.id}::${p.provider}::${p.model}::${p.baseUrl ?? ''}::${apiKeyHash}`
}

function lookup(key: string): BaseChatModel | undefined {
  const idx = cache.findIndex((e) => e.key === key)
  if (idx === -1) return undefined
  const [entry] = cache.splice(idx, 1)
  cache.push(entry)
  return entry.model
}

function insert(key: string, model: BaseChatModel): void {
  cache.push({ key, model })
  if (cache.length > MAX_CACHE) cache.shift()
}

export function invalidateByProfile(profileId: string): void {
  for (let i = cache.length - 1; i >= 0; i--) {
    if (cache[i].key.startsWith(`${profileId}::`)) cache.splice(i, 1)
  }
}

// Test helper — only used by model-factory.test.ts.
;(buildChatModel as any).__clearCache = () => {
  cache.length = 0
}

export function buildChatModel(profile: ResolvedProfile): BaseChatModel {
  const key = cacheKey(profile)
  const hit = lookup(key)
  if (hit) return hit

  const temperature = profile.temperature ?? 0.3
  const maxTokens = profile.maxTokens ?? 800

  let model: BaseChatModel
  switch (profile.provider) {
    case 'openai':
    case 'openai-compatible':
      model = new ChatOpenAI({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens,
        configuration: profile.baseUrl ? { baseURL: profile.baseUrl } : undefined
      }) as unknown as BaseChatModel
      break
    case 'anthropic':
      model = new ChatAnthropic({
        model: profile.model,
        apiKey: profile.apiKey ?? '',
        temperature,
        maxTokens
      }) as unknown as BaseChatModel
      break
    case 'ollama':
      model = new ChatOllama({
        model: profile.model,
        baseUrl: profile.baseUrl ?? 'http://localhost:11434',
        temperature,
        numPredict: maxTokens
      }) as unknown as BaseChatModel
      break
    default: {
      const _exhaust: never = profile.provider
      throw new Error(`unsupported provider: ${_exhaust as string}`)
    }
  }
  insert(key, model)
  return model
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run electron/ai/model-factory.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/model-factory.ts electron/ai/model-factory.test.ts
git commit -m "feat(ai): add model-factory.buildChatModel with 4-provider switch"
```

---

<!-- openspec-task: 2.2 -->

### Task 5: Verify LRU semantics

**Files:**

- Modify: `electron/ai/model-factory.test.ts` (extend)
- Inspect (no edit): `electron/ai/model-factory.ts`

The cache logic is already in Task 4 — this task only adds tests that lock in the semantics: hit returns same reference; LRU eviction order; key includes baseUrl + apiKey.

- [ ] **Step 1: Add LRU tests**

Append to `electron/ai/model-factory.test.ts`:

```typescript
describe('buildChatModel LRU cache', () => {
  beforeEach(() => {
    ;(buildChatModel as any).__clearCache()
  })

  it('returns same instance on cache hit', () => {
    const p = { id: 'p1', provider: 'openai' as const, model: 'gpt-4o', apiKey: 'k' }
    const a = buildChatModel(p)
    const b = buildChatModel(p)
    expect(a).toBe(b)
  })

  it('returns NEW instance when baseUrl changes', () => {
    const a = buildChatModel({
      id: 'p1',
      provider: 'openai-compatible',
      model: 'x',
      apiKey: 'k',
      baseUrl: 'http://a'
    })
    const b = buildChatModel({
      id: 'p1',
      provider: 'openai-compatible',
      model: 'x',
      apiKey: 'k',
      baseUrl: 'http://b'
    })
    expect(a).not.toBe(b)
  })

  it('returns NEW instance when apiKey changes', () => {
    const a = buildChatModel({ id: 'p1', provider: 'openai', model: 'x', apiKey: 'k1' })
    const b = buildChatModel({ id: 'p1', provider: 'openai', model: 'x', apiKey: 'k2' })
    expect(a).not.toBe(b)
  })

  it('evicts the oldest entry when cache exceeds 8', () => {
    const refs: any[] = []
    for (let i = 0; i < 9; i++) {
      refs.push(buildChatModel({ id: `p${i}`, provider: 'openai', model: 'x', apiKey: 'k' }))
    }
    // p0 should be evicted; re-building it returns a NEW reference.
    const reborn = buildChatModel({ id: 'p0', provider: 'openai', model: 'x', apiKey: 'k' })
    expect(reborn).not.toBe(refs[0])
    // p8 (the most recent) is still cached.
    const same = buildChatModel({ id: 'p8', provider: 'openai', model: 'x', apiKey: 'k' })
    expect(same).toBe(refs[8])
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run electron/ai/model-factory.test.ts`
Expected: all passing (5 total now).

- [ ] **Step 3: Commit**

```bash
git add electron/ai/model-factory.test.ts
git commit -m "test(ai): cover buildChatModel LRU eviction and key composition"
```

---

<!-- openspec-task: 2.3 -->

### Task 6: Wire profile-update invalidation in `settings-effects`

**Files:**

- Inspect: `electron/settings/**` for the existing profile-update effect
- Modify: whichever file owns profile-update side effects (search first)
- Test: extend that file's test or add `electron/settings/profile-effects.test.ts`

- [ ] **Step 1: Find the profile-update site**

Run: `grep -rn "ai_provider_profiles\|defaultProfileId\|profile.update\|updateProfile" /Users/aaa/develop/workspace-ai/acornvo/electron/settings --include='*.ts' 2>&1`

Expected: at least one of these patterns:

- A function like `updateProfile(id, patch)` in `electron/settings/profiles.ts` or similar
- An event emitter / effect wired to settings changes

If no `settings-effects.ts` file exists, the project may handle invalidation inline at the update call site. In that case modify the update function directly.

- [ ] **Step 2: Add an invalidation hook**

Wherever a profile is saved (typical signature: `await profiles.update(id, patch)`), append a call to `invalidateByProfile(id)`. Example diff (adapt to actual file):

```typescript
// electron/settings/profiles.ts (or equivalent)
import { invalidateByProfile } from '../ai/model-factory'

export async function updateProfile(id: string, patch: Partial<ProfileRecord>): Promise<void> {
  // ...existing update logic...
  invalidateByProfile(id)
}

export async function deleteProfile(id: string): Promise<void> {
  // ...existing delete logic...
  invalidateByProfile(id)
}
```

If the profile API also exposes "rotate api key" or "set default profile" methods, only the ones that change `model` / `baseUrl` / `apiKey` / `provider` need invalidation. Setting `temperature` / `maxTokens` ALSO requires invalidation because the cache key bakes those into the model instance via the constructor — be safe and invalidate on any update.

- [ ] **Step 3: Add test**

Add a test in the same `*.test.ts` file as the update function (or create `electron/settings/profile-effects.test.ts`):

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('../ai/model-factory', () => ({
  invalidateByProfile: vi.fn()
}))

import { invalidateByProfile } from '../ai/model-factory'
// import the update function under test, e.g.:
// import { updateProfile } from './profiles';

describe('profile update side-effects', () => {
  it('invalidates model-factory cache when a profile is updated', async () => {
    // (Stub DB/keychain as the existing tests in this file already do.)
    await updateProfile('p1', { model: 'gpt-4o' })
    expect(invalidateByProfile).toHaveBeenCalledWith('p1')
  })

  it('invalidates model-factory cache when a profile is deleted', async () => {
    await deleteProfile('p1')
    expect(invalidateByProfile).toHaveBeenCalledWith('p1')
  })
})
```

Adapt to actual stub patterns used in neighboring tests.

- [ ] **Step 4: Run typecheck + test**

Run:

```
pnpm vitest run electron/settings/
pnpm run typecheck:node
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add electron/settings/<changed-files>
git commit -m "feat(settings): invalidate model-factory cache on profile update/delete"
```

---

<!-- openspec-task: 2.4 -->

### Task 7: Round out `model-factory.test.ts` coverage (Anthropic, Ollama, openai-compatible)

**Files:**

- Modify: `electron/ai/model-factory.test.ts`

- [ ] **Step 1: Mock the remaining provider modules**

At the top of `electron/ai/model-factory.test.ts`, append these mocks (alongside the existing `@langchain/openai` mock):

```typescript
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation((opts) => ({ __kind: 'anthropic', opts }))
}))
vi.mock('@langchain/ollama', () => ({
  ChatOllama: vi.fn().mockImplementation((opts) => ({ __kind: 'ollama', opts }))
}))
```

- [ ] **Step 2: Add provider-coverage tests**

Append:

```typescript
describe('buildChatModel — provider coverage', () => {
  beforeEach(() => {
    ;(buildChatModel as any).__clearCache()
  })

  it('builds ChatAnthropic for provider="anthropic"', () => {
    const m: any = buildChatModel({
      id: 'p2',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000
    })
    expect(m.__kind).toBe('anthropic')
    expect(m.opts).toMatchObject({
      model: 'claude-3-5-sonnet-latest',
      apiKey: 'sk-ant-test',
      temperature: 0.2,
      maxTokens: 1000
    })
  })

  it('builds ChatOllama for provider="ollama" with default baseUrl when omitted', () => {
    const m: any = buildChatModel({
      id: 'p3',
      provider: 'ollama',
      model: 'llama3.1',
      apiKey: null
    })
    expect(m.__kind).toBe('ollama')
    expect(m.opts.baseUrl).toBe('http://localhost:11434')
    expect(m.opts.model).toBe('llama3.1')
  })

  it('builds ChatOllama using profile.baseUrl when set', () => {
    const m: any = buildChatModel({
      id: 'p4',
      provider: 'ollama',
      model: 'mistral',
      apiKey: null,
      baseUrl: 'http://10.0.0.5:11434'
    })
    expect(m.__kind).toBe('ollama')
    expect(m.opts.baseUrl).toBe('http://10.0.0.5:11434')
  })

  it('builds ChatOpenAI with configuration.baseURL for provider="openai-compatible"', () => {
    const m: any = buildChatModel({
      id: 'p5',
      provider: 'openai-compatible',
      model: 'qwen-max',
      apiKey: 'sk-x',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    })
    expect(m.__kind).toBe('openai')
    expect(m.opts.configuration?.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
  })

  it('uses default temperature=0.3 and maxTokens=800 when omitted', () => {
    const m: any = buildChatModel({ id: 'p6', provider: 'openai', model: 'x', apiKey: 'k' })
    expect(m.opts.temperature).toBe(0.3)
    expect(m.opts.maxTokens).toBe(800)
  })
})

describe('buildChatModel — invalidation', () => {
  it('invalidateByProfile clears entries matching the prefix', async () => {
    ;(buildChatModel as any).__clearCache()
    const a = buildChatModel({ id: 'pA', provider: 'openai', model: 'm', apiKey: 'k' })
    const b = buildChatModel({ id: 'pB', provider: 'openai', model: 'm', apiKey: 'k' })
    const { invalidateByProfile } = await import('./model-factory')
    invalidateByProfile('pA')
    expect(buildChatModel({ id: 'pA', provider: 'openai', model: 'm', apiKey: 'k' })).not.toBe(a)
    expect(buildChatModel({ id: 'pB', provider: 'openai', model: 'm', apiKey: 'k' })).toBe(b)
  })
})
```

- [ ] **Step 3: Run all tests**

Run: `pnpm vitest run electron/ai/model-factory.test.ts`
Expected: all passing (≈11 tests total).

- [ ] **Step 4: Commit**

```bash
git add electron/ai/model-factory.test.ts
git commit -m "test(ai): cover Anthropic/Ollama/compat providers, defaults, invalidation"
```

---

<!-- openspec-task: 3.1 -->

### Task 8: Implement `normalize-errors.ts`

**Files:**

- Create: `electron/ai/normalize-errors.ts`
- Test: `electron/ai/normalize-errors.test.ts` (Task 9)

Mapping required (from `design.md` §"错误归一化"):

- `AbortError` (name === 'AbortError' OR DOMException with name 'AbortError') → re-throw as-is (the runner converts to `canceled` event)
- LangChain `AuthenticationError` / `RateLimitError` / `APIError` → `E_AUTH` / `E_RATE` / `E_SERVER`
- HTTP `status`/`response.status` bucket: 401/403 → `E_AUTH`; 429 → `E_RATE`; ≥500 → `E_SERVER`
- `fetch` `TypeError` (network failure) → `E_NETWORK`
- Zod / structured-output parse failure (look for `ZodError` `name` or `code === 'ERR_PARSE'`) → `E_RESPONSE`
- `E_MISSING_PROFILE` / `E_CONFIG` already-coded errors → pass through
- Unknown → `E_UNKNOWN`

- [ ] **Step 1: Probe error-class names from langchain-docs MCP**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"OpenAI error classes AuthenticationError RateLimitError"`. Capture the actual class names exported by `@langchain/openai` / `@langchain/anthropic`. If LangChain reuses the underlying provider SDK error types, document the import path.

If LangChain v1 does NOT re-export named error classes (it may just propagate provider-native errors), rely on `error.status` / `error.response.status` for HTTP bucketing.

- [ ] **Step 2: Write the module**

Create `electron/ai/normalize-errors.ts`:

```typescript
import type { LlmError, LlmErrorCode } from '@shared/ai-types'

export type NormalizedLlmError = LlmError & Error

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(typeof e === 'string' ? e : JSON.stringify(e))
}

function build(
  code: LlmErrorCode,
  message: string,
  extra: Partial<LlmError> = {}
): NormalizedLlmError {
  const err = new Error(message) as NormalizedLlmError
  ;(err as any).code = code
  Object.assign(err, extra)
  return err
}

function isAbort(e: any): boolean {
  return (
    e?.name === 'AbortError' ||
    (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError')
  )
}

function bucketByStatus(status: number, providerMessage?: string): NormalizedLlmError {
  if (status === 401 || status === 403)
    return build('E_AUTH', `auth failed (HTTP ${status})`, { httpStatus: status, providerMessage })
  if (status === 429)
    return build('E_RATE', `rate limited (HTTP ${status})`, { httpStatus: status, providerMessage })
  if (status >= 500)
    return build('E_SERVER', `provider server error (HTTP ${status})`, {
      httpStatus: status,
      providerMessage
    })
  return build('E_UNKNOWN', `HTTP ${status}`, { httpStatus: status, providerMessage })
}

export function normalizeLLMError(raw: unknown): NormalizedLlmError {
  const e = asError(raw) as any

  // 1) AbortError — re-throw as-is (caller maps to `canceled`).
  if (isAbort(e)) throw e

  // 2) Pre-coded errors — pass through.
  if (e?.code && typeof e.code === 'string') {
    const passthrough = new Set<LlmErrorCode>([
      'E_AUTH',
      'E_RATE',
      'E_SERVER',
      'E_NETWORK',
      'E_RESPONSE',
      'E_CONFIG',
      'E_MISSING_PROFILE',
      'E_UNKNOWN'
    ])
    if (passthrough.has(e.code as LlmErrorCode)) {
      return build(e.code, e.message ?? e.code, {
        httpStatus: e.httpStatus,
        providerMessage: e.providerMessage ?? e.message
      })
    }
  }

  // 3) Named LangChain / provider error classes.
  const name = e?.name ?? ''
  if (name === 'AuthenticationError')
    return build('E_AUTH', e.message, { providerMessage: e.message })
  if (name === 'RateLimitError') return build('E_RATE', e.message, { providerMessage: e.message })
  if (name === 'APIError' || name === 'APIConnectionError') {
    const status = Number(e.status ?? e.response?.status ?? NaN)
    if (Number.isFinite(status)) return bucketByStatus(status, e.message)
    return build('E_SERVER', e.message, { providerMessage: e.message })
  }

  // 4) HTTP status bucket fallback (covers Anthropic/Ollama raw responses).
  const status = Number(e?.status ?? e?.response?.status ?? NaN)
  if (Number.isFinite(status) && status > 0) return bucketByStatus(status, e.message)

  // 5) Network errors (fetch TypeError).
  if (name === 'TypeError' && /fetch/i.test(e.message ?? '')) return build('E_NETWORK', e.message)

  // 6) Zod / structured-output parse failures.
  if (name === 'ZodError' || /zod|structured|parse/i.test(e.message ?? '')) {
    return build('E_RESPONSE', e.message, { providerMessage: e.message })
  }

  // 7) Unknown.
  return build('E_UNKNOWN', e.message ?? 'unknown LLM error', { providerMessage: e.message })
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ai/normalize-errors.ts
git commit -m "feat(ai): add normalize-errors with abort/auth/rate/server/network/zod buckets"
```

---

<!-- openspec-task: 3.2 -->

### Task 9: Test `normalize-errors`

**Files:**

- Create: `electron/ai/normalize-errors.test.ts`

- [ ] **Step 1: Write the test file**

Create `electron/ai/normalize-errors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeLLMError } from './normalize-errors'

describe('normalizeLLMError', () => {
  it('rethrows AbortError untouched', () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    expect(() => normalizeLLMError(abort)).toThrow(abort)
  })

  it('maps AuthenticationError → E_AUTH', () => {
    const e = Object.assign(new Error('invalid key'), { name: 'AuthenticationError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_AUTH', message: 'invalid key' })
  })

  it('maps RateLimitError → E_RATE', () => {
    const e = Object.assign(new Error('too many'), { name: 'RateLimitError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RATE' })
  })

  it('maps APIError with status 500 → E_SERVER with httpStatus', () => {
    const e = Object.assign(new Error('bad gateway'), { name: 'APIError', status: 502 })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_SERVER', httpStatus: 502 })
  })

  it('buckets bare HTTP 401 → E_AUTH', () => {
    const e = Object.assign(new Error('Unauthorized'), { status: 401 })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_AUTH', httpStatus: 401 })
  })

  it('buckets HTTP 429 → E_RATE', () => {
    const e = Object.assign(new Error('limited'), { response: { status: 429 } })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RATE', httpStatus: 429 })
  })

  it('buckets HTTP 503 → E_SERVER', () => {
    expect(normalizeLLMError({ status: 503, message: 'down' })).toMatchObject({
      code: 'E_SERVER',
      httpStatus: 503
    })
  })

  it('maps fetch TypeError → E_NETWORK', () => {
    const e = Object.assign(new TypeError('fetch failed'), {})
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_NETWORK' })
  })

  it('maps ZodError → E_RESPONSE', () => {
    const e = Object.assign(new Error('expected string'), { name: 'ZodError' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_RESPONSE' })
  })

  it('maps unknown error → E_UNKNOWN preserving providerMessage', () => {
    const e = new Error('mystery')
    const out = normalizeLLMError(e)
    expect(out.code).toBe('E_UNKNOWN')
    expect((out as any).providerMessage).toBe('mystery')
  })

  it('passes through pre-coded E_MISSING_PROFILE', () => {
    const e = Object.assign(new Error('no profile'), { code: 'E_MISSING_PROFILE' })
    expect(normalizeLLMError(e)).toMatchObject({ code: 'E_MISSING_PROFILE' })
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `pnpm vitest run electron/ai/normalize-errors.test.ts`
Expected: all passing (≥11 tests).

If `AuthenticationError`/`RateLimitError`/`APIError` class names don't match what LangChain v1 actually throws (from Task 8 Step 1 probe), update both `normalize-errors.ts` and the test to use the real class names.

- [ ] **Step 3: Commit**

```bash
git add electron/ai/normalize-errors.test.ts
git commit -m "test(ai): cover normalize-errors mapping for all LlmErrorCode buckets"
```

---

<!-- openspec-task: 4.1 -->

### Task 10: Migrate `review-clip` prompt schema from JSON-Schema to Zod

**Files:**

- Modify: `electron/ai/prompts/review-clip.ts`
- Modify: `electron/ai/prompts/review-clip.test.ts` (extend, do NOT delete existing assertions yet)

The reviewer rewrite happens in Plan 2 Task 1. This task only swaps the schema export to Zod and keeps `render({ ... })` returning `{ system, user }` exactly as before, so existing callers continue to compile.

- [ ] **Step 1: Read current prompt to confirm structure**

```bash
sed -n '1,80p' electron/ai/prompts/review-clip.ts
```

Expected: an exported object with `schema` (JSON Schema) and `render(vars)` returning `{ system, user }`.

- [ ] **Step 2: Replace schema with Zod**

Edit `electron/ai/prompts/review-clip.ts`. Replace the file content with:

```typescript
import { z } from 'zod'

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

export const AiReviewSchema = z.object({
  summary: z.string().min(1).describe('150 字以内的中文摘要'),
  suggestedTitle: z.string().min(1).describe('一个更精炼的标题；若原标题足够好可复用'),
  tags: z
    .array(z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case lowercase'))
    .min(3)
    .max(8),
  keyQuotes: z.array(z.string().min(1)).min(1).max(3)
})

export type AiReviewOutput = z.infer<typeof AiReviewSchema>

export const reviewClip = {
  schema: AiReviewSchema,
  render({ title, url, body }: RenderVars): { system: string; user: string } {
    const system = [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须匹配指定 schema，由 LangChain 结构化输出机制处理 —— 不要包含任何额外文本，不要使用 markdown code fence。',
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
      '4. `keyQuotes`：最重要的 1-3 句原文引用（保持原文语言）。'
    ].join('\n')

    return { system, user }
  }
}
```

Notes:

- Export `AiReviewSchema` as a named export so reviewer.ts can import it in Plan 2 without going through `reviewClip.schema`.
- Keep `reviewClip.schema` as an alias for back-compat during Plan 1 → Plan 2 handoff.
- The `additionalProperties: false` constraint is implicit in Zod (`.strict()` would enforce it but most LLM `withStructuredOutput` paths already filter). Add `.strict()` if test failures show extra fields slipping through.

- [ ] **Step 3: Update test file**

Edit `electron/ai/prompts/review-clip.test.ts`. Read existing tests first:

```bash
sed -n '1,80p' electron/ai/prompts/review-clip.test.ts
```

The existing tests likely assert on `reviewClip.schema.type === 'object'` and call `parseAndValidate(text, reviewClip.schema)`. Replace those JSON-Schema-style assertions with Zod assertions:

```typescript
import { describe, it, expect } from 'vitest'
import { reviewClip, AiReviewSchema } from './review-clip'

describe('reviewClip.render', () => {
  it('returns system + user strings', () => {
    const out = reviewClip.render({ title: 't', url: 'https://x', body: 'hello' })
    expect(out.system).toContain('双语')
    expect(out.user).toContain('# 标题\nt')
    expect(out.user).toContain('hello')
  })

  it('truncates long bodies past 16000 chars', () => {
    const body = 'a'.repeat(20000)
    const out = reviewClip.render({ title: 't', url: 'u', body })
    expect(out.user).toContain('已截断')
  })
})

describe('AiReviewSchema (Zod)', () => {
  it('parses a valid review object', () => {
    const parsed = AiReviewSchema.parse({
      summary: 's',
      suggestedTitle: 't',
      tags: ['deep-learning', 'transformers', 'ml-systems'],
      keyQuotes: ['quote 1']
    })
    expect(parsed.tags).toHaveLength(3)
  })

  it('rejects tags shorter than 3', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a', 'b'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects non-kebab-case tag', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['DeepLearning', 'a', 'b'],
        keyQuotes: ['q']
      })
    ).toThrow()
  })

  it('rejects empty keyQuotes', () => {
    expect(() =>
      AiReviewSchema.parse({
        summary: 's',
        suggestedTitle: 't',
        tags: ['a-x', 'b-x', 'c-x'],
        keyQuotes: []
      })
    ).toThrow()
  })
})
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run electron/ai/prompts/review-clip.test.ts`
Expected: green.

- [ ] **Step 5: Verify reviewer.ts still compiles**

Run: `pnpm run typecheck:node`
Expected: 0 errors. The current `reviewer.ts` consumes `reviewClipPrompt.schema` and passes it to `parse-json.ts` → Ajv. Ajv compiles a Zod object instance silently (it just iterates own enumerable properties) — this is intentional: we want `reviewer.ts` to still work in Plan 1, even if the validation is now a no-op (Zod schema isn't a valid Ajv input but Ajv's `compile` doesn't crash on it without `strict: true`). Plan 2 Task 1 replaces this path entirely with `withStructuredOutput`.

If typecheck fails because some consumer of `schema` expected a JSONSchema type, add a temporary back-compat shim by exporting `schema: AiReviewSchema as unknown as object`.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/prompts/review-clip.ts electron/ai/prompts/review-clip.test.ts
git commit -m "refactor(ai): migrate review-clip schema to Zod, keep back-compat alias"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: green. New files: `model-factory.ts`, `model-factory.test.ts`, `normalize-errors.ts`, `normalize-errors.test.ts`. Modified: `package.json`, `pnpm-lock.yaml`, `electron/settings/<file>.ts`, `electron/ai/prompts/review-clip.{ts,test.ts}`. Existing `client.ts` / `reviewer.ts` / `loop.ts` are still in use and untouched.

- [ ] **Run typecheck**

```bash
pnpm run typecheck
```

Expected: 0 errors across node + web tsconfigs.

- [ ] **Sync OpenSpec tasks**

`/opsx:executing-plans` will mark OpenSpec tasks 1.1–4.1 complete in `openspec/changes/phase-19-ai-langchain-migration/tasks.md` after this plan finishes. Do NOT edit tasks.md manually here.
