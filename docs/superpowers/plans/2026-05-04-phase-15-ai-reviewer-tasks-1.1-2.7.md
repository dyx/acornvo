# Phase 15 — AI Reviewer: Plan 1 (Schema + LLM Client)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-15-ai-reviewer`
> **Task range:** OpenSpec tasks `1.1`–`2.7` (10 tasks)
> **Plan order:** 1 of 4. Subsequent plans (`tasks-3.1-5.2`, `6.1-9.1`, `10.1-10.20`) build on this one.
> **Created:** 2026-05-04
> **Branch suggestion:** `feat/phase-15-ai-reviewer` (branch from `main` after phase 13 + phase 14 land)

---

## Goal

Land the SQLite migration `008_ai_usage.sql`, the shared TS types (`shared/ai-types.ts`), the `ajv` dependency, and a fully-tested `llmClient` (`electron/ai/client.ts`) that supports four providers (`openai` / `anthropic` / `ollama` / `openai-compatible`) over raw `fetch` with normalized error codes, a 60s `AbortController` timeout, and a four-stage `chatJson` parsing pipeline.

## Architecture

- `llmClient` is the **single entry point** for any LLM call in the main process. Renderer code MUST NOT call it directly — only via IPC handlers (added in Plan 2). API keys never cross the IPC boundary.
- Each provider lives in its own file under `electron/ai/providers/`. They share a common `ProviderRequest` shape and return `{ text, usage }` (or rethrow normalized errors). `client.ts` does the dispatch.
- JSON parsing reliability is layered: prompt instruction → provider `response_format`/`format` flag → text-level rescue (code-fence strip + brace regex) → Ajv schema validation. Each layer fails forward to the next; only the union failing throws `E_RESPONSE`.
- Errors are normalized to a closed enum (`LlmErrorCode`); the handler in Plan 3 reads `error.code` to decide retry vs. fail. No raw HTTP statuses leak above this layer.

## Tech Stack

- `ajv@^8` + `ajv-formats@^3` (JSON Schema runtime validation; new dep)
- Native global `fetch` + `AbortController` from Electron 39 (no polyfill needed)
- `better-sqlite3@^12` (existing) for migration 008
- `vitest@^2` (existing) — co-located unit tests, in-memory DB pattern from `electron/ipc/clips.test.ts`

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/db/migrations/008_ai_usage.sql` | Create | 1.1 |
| `electron/services/db/migrations/008_ai_usage.test.ts` | Create | 1.1 |
| `shared/ai-types.ts` | Create | 1.2 |
| `package.json`, `package-lock.json` | Modify (add ajv, ajv-formats) | 1.3 |
| `electron/ai/client.ts` | Create | 2.1, 2.6, 2.7 |
| `electron/ai/client.test.ts` | Create | 2.1, 2.6, 2.7 |
| `electron/ai/providers/openai.ts` | Create | 2.2 |
| `electron/ai/providers/openai.test.ts` | Create | 2.2 |
| `electron/ai/providers/anthropic.ts` | Create | 2.3 |
| `electron/ai/providers/anthropic.test.ts` | Create | 2.3 |
| `electron/ai/providers/ollama.ts` | Create | 2.4 |
| `electron/ai/providers/ollama.test.ts` | Create | 2.4 |
| `electron/ai/providers/openai-compatible.ts` | Create | 2.5 |
| `electron/ai/providers/openai-compatible.test.ts` | Create | 2.5 |
| `electron/ai/parse-json.ts` | Create | 2.6 |
| `electron/ai/parse-json.test.ts` | Create | 2.6 |

## Pre-flight

This plan assumes:
- **phase 13 (secure storage / settings) has merged.** That brings `electron/settings/store.ts`, `electron/settings/profile-key.ts` (`getProfileDecryptedKey`), `ai_provider_profiles` table, `shared/settings-types.ts` (`AiProviderKind`, `AiSettings`, `AiProviderProfile`), and `migrations/007_settings.sql`.
- **phase 14 (queue persistence) has merged.** That brings `electron/queue/runner.ts`, the placeholder `ai-review-clip` handler, and `migrations/007_jobs.sql` (note: phase 13 and phase 14 both used 007 in their drafts; whichever lands second should be renumbered to 008. Phase 15's migration **MUST** therefore become `009_ai_usage.sql` if both 007s are kept distinct — confirm before Task 1 by running `ls electron/services/db/migrations/`).
- Phase 12 clips DAO (`electron/ipc/clips.ts`) and phase 4 atomic write (`electron/services/fs-atomic.ts`, `electron/ipc/file.ts`) are already on `main`.

If migration numbering is occupied, **stop and reconcile**: rename `008_ai_usage.sql` → next free number, update `user_version = <n>`, and update Task 1 references throughout this plan.

---

## Tasks

<!-- openspec-task: 1.1 -->
### Task 1: Migration 008 — `ai_usage` table

**Files:**
- Create: `electron/services/db/migrations/008_ai_usage.sql`
- Create: `electron/services/db/migrations/008_ai_usage.test.ts`

- [ ] **Step 1: Confirm next migration number is free**

```bash
ls electron/services/db/migrations/ | grep -E '^[0-9]{3}_' | sort
```

Expected: latest entry is `007_*.sql`. If `008_*.sql` already exists, stop and reconcile (rename this migration to the next free integer, update `user_version` and test file accordingly).

- [ ] **Step 2: Write the failing migration test**

```ts
// electron/services/db/migrations/008_ai_usage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { migrationsDir } from './index';

describe('migration 008_ai_usage', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = new Database(':memory:');
  });

  it('creates ai_usage table with expected columns', () => {
    runMigrations(db, migrationsDir());
    const cols = db.prepare("PRAGMA table_info('ai_usage')").all() as Array<{ name: string; type: string; notnull: number }>;
    const byName = Object.fromEntries(cols.map(c => [c.name, c]));
    expect(byName.id).toMatchObject({ type: 'INTEGER' });
    expect(byName.job_id).toMatchObject({ type: 'TEXT' });
    expect(byName.profile_id).toMatchObject({ type: 'TEXT' });
    expect(byName.model).toMatchObject({ type: 'TEXT' });
    expect(byName.prompt_tokens).toMatchObject({ type: 'INTEGER' });
    expect(byName.completion_tokens).toMatchObject({ type: 'INTEGER' });
    expect(byName.latency_ms).toMatchObject({ type: 'INTEGER' });
    expect(byName.ok).toMatchObject({ type: 'INTEGER', notnull: 1 });
    expect(byName.error).toMatchObject({ type: 'TEXT' });
    expect(byName.created_at).toMatchObject({ type: 'TEXT', notnull: 1 });
  });

  it('creates the two indexes', () => {
    runMigrations(db, migrationsDir());
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ai_usage'").all() as Array<{ name: string }>;
    const names = new Set(idx.map(i => i.name));
    expect(names.has('idx_ai_usage_created')).toBe(true);
    expect(names.has('idx_ai_usage_profile')).toBe(true);
  });

  it('sets user_version to 8', () => {
    runMigrations(db, migrationsDir());
    const v = db.pragma('user_version', { simple: true });
    expect(v).toBe(8);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run electron/services/db/migrations/008_ai_usage.test.ts`
Expected: FAIL — table does not exist.

- [ ] **Step 4: Create the migration**

```sql
-- electron/services/db/migrations/008_ai_usage.sql
-- migration: 008_ai_usage
-- Phase 15 — record per-LLM-call usage and errors.

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  profile_id TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_profile ON ai_usage(profile_id);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run electron/services/db/migrations/008_ai_usage.test.ts`
Expected: PASS (3 tests).

Also run `npx vitest run tests/regression/copy-sql-migrations.test.ts` to confirm the build copy step picks up the new file. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/008_ai_usage.sql electron/services/db/migrations/008_ai_usage.test.ts
git commit -m "feat(phase-15): migration 008 — ai_usage table + indexes"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: `shared/ai-types.ts` — typed surface

**Files:**
- Create: `shared/ai-types.ts`
- Create: `shared/ai-types.test.ts`

- [ ] **Step 1: Write a placeholder type-shape test**

```ts
// shared/ai-types.test.ts
import { describe, it, expectTypeOf, expect } from 'vitest';
import type {
  LlmMessage,
  ChatOptions,
  ChatJsonOptions,
  ChatTextResult,
  ChatJsonResult,
  TokenUsage,
  AiReviewResult,
  AiUsageRow,
  LlmErrorCode,
  LlmError,
} from './ai-types';

describe('ai-types', () => {
  it('LlmMessage allows the three roles', () => {
    const m: LlmMessage = { role: 'system', content: 's' };
    const u: LlmMessage = { role: 'user', content: 'u' };
    const a: LlmMessage = { role: 'assistant', content: 'a' };
    expect([m, u, a]).toHaveLength(3);
  });

  it('AiReviewResult has the five required fields', () => {
    const r: AiReviewResult = {
      summary: 's',
      suggestedTitle: 't',
      tags: ['a', 'b', 'c'],
      keyQuotes: ['q'],
      reviewedAt: '2026-05-04T00:00:00Z',
    };
    expect(r.tags.length).toBe(3);
  });

  it('LlmErrorCode is a closed string union', () => {
    expectTypeOf<LlmErrorCode>().toEqualTypeOf<
      | 'E_CONFIG'
      | 'E_MISSING_PROFILE'
      | 'E_AUTH'
      | 'E_RATE'
      | 'E_NETWORK'
      | 'E_SERVER'
      | 'E_RESPONSE'
      | 'E_UNKNOWN'
    >();
  });

  it('LlmError has code and optional fields', () => {
    const e: LlmError = { code: 'E_AUTH', message: 'unauthorized', httpStatus: 401 };
    expect(e.code).toBe('E_AUTH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (file does not exist)**

Run: `npx vitest run shared/ai-types.test.ts`
Expected: FAIL — cannot find module `./ai-types`.

- [ ] **Step 3: Implement the types**

```ts
// shared/ai-types.ts
export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatOptions {
  profileId?: string;
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatJsonOptions extends ChatOptions {
  schema: object;
}

export interface ChatTextResult {
  text: string;
  model: string;
  usage?: TokenUsage;
  latencyMs: number;
}

export interface ChatJsonResult<T = unknown> {
  data: T;
  rawText: string;
  model: string;
  usage?: TokenUsage;
  latencyMs: number;
}

export interface AiReviewResult {
  summary: string;
  suggestedTitle: string;
  tags: string[];
  keyQuotes: string[];
  reviewedAt: string;
}

export interface AiUsageRow {
  id?: number;
  jobId: string | null;
  profileId: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  ok: 0 | 1;
  error: string | null;
  createdAt: string;
}

export type LlmErrorCode =
  | 'E_CONFIG'
  | 'E_MISSING_PROFILE'
  | 'E_AUTH'
  | 'E_RATE'
  | 'E_NETWORK'
  | 'E_SERVER'
  | 'E_RESPONSE'
  | 'E_UNKNOWN';

export interface LlmError {
  code: LlmErrorCode;
  message: string;
  httpStatus?: number;
  providerMessage?: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/ai-types.test.ts`
Expected: PASS (4 tests).

Also run `npx tsc --noEmit` from repo root. Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add shared/ai-types.ts shared/ai-types.test.ts
git commit -m "feat(phase-15): shared/ai-types.ts — LlmMessage / ChatOptions / AiReviewResult / LlmError"
```

---

<!-- openspec-task: 1.3 -->
### Task 3: Add `ajv` and `ajv-formats` deps

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm ajv is not already a dep**

```bash
node -e "const p=require('./package.json');console.log('ajv:',p.dependencies?.ajv||'absent','ajv-formats:',p.dependencies?.['ajv-formats']||'absent')"
```

Expected: `ajv: absent ajv-formats: absent`. If a version prints, skip Step 2.

- [ ] **Step 2: Install**

```bash
npm install ajv ajv-formats
```

Expected: exit 0; `package.json` `dependencies.ajv` is `^8.x` and `dependencies.ajv-formats` is `^3.x`. Postinstall (`electron-rebuild`) completes.

- [ ] **Step 3: Smoke-load**

```bash
node -e "const Ajv=require('ajv').default??require('ajv'); const a=new Ajv(); console.log('ok', typeof a.compile)"
```

Expected: `ok function`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-15): add ajv + ajv-formats for LLM JSON schema validation"
```

---

<!-- openspec-task: 2.1 -->
### Task 4: `electron/ai/client.ts` — dispatcher skeleton + `chat`/`chatJson` shape

**Files:**
- Create: `electron/ai/client.ts`
- Create: `electron/ai/client.test.ts`

This task wires the entry point and dispatches to a provider stub by reading the profile. It does NOT yet implement any provider — those come in Tasks 5-8. The provider modules referenced here will be filled in by their own tasks; for now we use a fakeable interface.

- [ ] **Step 1: Write failing test for missing-profile path**

```ts
// electron/ai/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../settings/store', () => ({
  settingsStore: { get: vi.fn() },
}));
vi.mock('../settings/profiles', () => ({
  profilesStore: { get: vi.fn() },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(),
}));

import { settingsStore } from '../settings/store';
import { profilesStore } from '../settings/profiles';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { llmClient } from './client';

describe('llmClient.chat — profile resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('throws E_MISSING_PROFILE when defaultProfileId is null and no profileId passed', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: null });
    await expect(
      llmClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'E_MISSING_PROFILE' });
  });

  it('throws E_CONFIG when openai-compatible profile lacks baseUrl', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    (profilesStore.get as any).mockReturnValue({
      id: 'p1', provider: 'openai-compatible', model: 'm', baseUrl: '',
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');
    await expect(
      llmClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'E_CONFIG' });
  });
});
```

- [ ] **Step 2: Run test — should fail because file does not exist**

Run: `npx vitest run electron/ai/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Implement `client.ts` skeleton**

```ts
// electron/ai/client.ts
import type {
  ChatOptions,
  ChatJsonOptions,
  ChatTextResult,
  ChatJsonResult,
  LlmError,
  LlmErrorCode,
} from '@shared/ai-types';
import { settingsStore } from '../settings/store';
import { profilesStore } from '../settings/profiles';
import { getProfileDecryptedKey } from '../settings/profile-key';

function llmErr(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const err = new Error(message) as LlmError & Error;
  (err as any).code = code;
  Object.assign(err, extra);
  return err;
}

interface ResolvedProfile {
  id: string;
  provider: 'openai' | 'anthropic' | 'ollama' | 'openai-compatible';
  model: string;
  baseUrl?: string;
  apiKey: string | null;
  maxTokens?: number;
  temperature?: number;
}

function resolveProfile(profileId?: string): ResolvedProfile {
  let id = profileId;
  if (!id) {
    const ai = settingsStore.get('ai');
    id = ai?.defaultProfileId ?? undefined;
  }
  if (!id) throw llmErr('E_MISSING_PROFILE', 'no profileId provided and settings.ai.defaultProfileId is null');
  const p = profilesStore.get(id);
  if (!p) throw llmErr('E_MISSING_PROFILE', `profile not found: ${id}`);
  if (!p.model) throw llmErr('E_CONFIG', `profile ${id} has empty model`);
  if (p.provider === 'openai-compatible' && !p.baseUrl) {
    throw llmErr('E_CONFIG', `provider 'openai-compatible' requires baseUrl on profile ${id}`);
  }
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id);
  return { id: p.id, provider: p.provider, model: p.model, baseUrl: p.baseUrl, apiKey, maxTokens: p.maxTokens, temperature: p.temperature };
}

// Provider modules export `callProvider({ profile, messages, model, temperature, maxTokens, signal, jsonMode? })`
// Plan 1 fills these in tasks 5-8; chatJson parsing/validation is task 9.
export const llmClient = {
  async chat(opts: ChatOptions): Promise<ChatTextResult> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    return callProvider({ profile, ...opts });
  },
  async chatJson<T = unknown>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    const { text, model, usage, latencyMs } = await callProvider({ profile, ...opts, jsonMode: true });
    // Plan 1 / Task 9 wires parseAndValidate
    const { parseAndValidate } = await import('./parse-json');
    const data = parseAndValidate<T>(text, opts.schema);
    return { data, rawText: text, model, usage, latencyMs };
  },
};

async function loadProvider(p: ResolvedProfile['provider']) {
  switch (p) {
    case 'openai': return await import('./providers/openai');
    case 'anthropic': return await import('./providers/anthropic');
    case 'ollama': return await import('./providers/ollama');
    case 'openai-compatible': return await import('./providers/openai-compatible');
  }
}
```

> Note: this file imports four provider modules and `parse-json.ts` that don't exist yet. The two tests in Step 1 don't reach that code path (they fail before dispatch), so they pass. Subsequent tasks add the dependencies before any test that exercises them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ai/client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/client.ts electron/ai/client.test.ts
git commit -m "feat(phase-15): llmClient skeleton with profile resolution and dispatcher"
```

---

<!-- openspec-task: 2.2 -->
### Task 5: `electron/ai/providers/openai.ts` — OpenAI provider

**Files:**
- Create: `electron/ai/providers/openai.ts`
- Create: `electron/ai/providers/openai.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/providers/openai.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './openai';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p1', provider: 'openai' as const, model: 'gpt-4o-mini',
  baseUrl: undefined, apiKey: 'sk-test',
};

describe('openai provider', () => {
  it('hits /v1/chat/completions with Bearer auth and chat shape', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'gpt-4o-mini',
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(r.text).toBe('hello');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });
  });

  it('passes response_format json_object when jsonMode=true', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ model: 'm', choices: [{ message: { content: '{}' } }] }),
    });
    await callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }], jsonMode: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('maps 401 to E_AUTH', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'invalid key' } }),
      text: async () => '{"error":{"message":"invalid key"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_AUTH', httpStatus: 401 });
  });

  it('maps 429 to E_RATE', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 429,
      json: async () => ({ error: { message: 'rate' } }),
      text: async () => '{"error":{"message":"rate"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_RATE', httpStatus: 429 });
  });

  it('maps 500 to E_SERVER', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 500, json: async () => ({}), text: async () => 'oops',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_SERVER', httpStatus: 500 });
  });
});
```

- [ ] **Step 2: Run test — should fail (no module)**

Run: `npx vitest run electron/ai/providers/openai.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement provider**

```ts
// electron/ai/providers/openai.ts
import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';

interface ProviderRequest {
  profile: {
    id: string;
    provider: 'openai' | 'openai-compatible' | string;
    model: string;
    baseUrl?: string;
    apiKey: string | null;
    temperature?: number;
    maxTokens?: number;
  };
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
}

function err(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  Object.assign(e, extra);
  return e;
}

function statusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'E_AUTH';
  if (status === 429) return 'E_RATE';
  if (status >= 500) return 'E_SERVER';
  return 'E_UNKNOWN';
}

export async function callProvider(req: ProviderRequest): Promise<ChatTextResult> {
  const baseUrl = req.profile.baseUrl ?? 'https://api.openai.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
  const model = req.model ?? req.profile.model;
  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
  };
  if (req.jsonMode) body.response_format = { type: 'json_object' };

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${req.profile.apiKey ?? ''}`,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw err('E_NETWORK', 'timeout');
    throw err('E_NETWORK', (e as Error).message);
  }
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let providerMessage = text;
    try {
      const j = JSON.parse(text);
      providerMessage = j.error?.message ?? text;
    } catch { /* keep raw */ }
    throw err(statusToCode(resp.status), `openai ${resp.status}: ${providerMessage}`, {
      httpStatus: resp.status,
      providerMessage,
    });
  }

  const json = await resp.json() as {
    model?: string;
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  const text = json.choices[0]?.message?.content ?? '';
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: json.usage ? {
      promptTokens: json.usage.prompt_tokens,
      completionTokens: json.usage.completion_tokens,
      totalTokens: json.usage.total_tokens,
    } : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/ai/providers/openai.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/openai.ts electron/ai/providers/openai.test.ts
git commit -m "feat(phase-15): openai provider — fetch + Bearer + json_object response_format"
```

---

<!-- openspec-task: 2.3 -->
### Task 6: `electron/ai/providers/anthropic.ts` — Anthropic provider

**Files:**
- Create: `electron/ai/providers/anthropic.ts`
- Create: `electron/ai/providers/anthropic.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/providers/anthropic.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './anthropic';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p1', provider: 'anthropic' as const, model: 'claude-haiku-3.5',
  baseUrl: undefined, apiKey: 'sk-ant-test',
};

describe('anthropic provider', () => {
  it('extracts system message and posts to /v1/messages with x-api-key', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'claude-haiku-3.5',
        content: [{ type: 'text', text: 'hi back' }],
        usage: { input_tokens: 10, output_tokens: 7 },
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [
        { role: 'system', content: 'be helpful' },
        { role: 'user', content: 'hi' },
      ],
    });
    expect(r.text).toBe('hi back');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 7, totalTokens: 17 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body.system).toBe('be helpful');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('concatenates multiple text blocks in response.content', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        content: [
          { type: 'text', text: 'part 1 ' },
          { type: 'text', text: 'part 2' },
        ],
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(r.text).toBe('part 1 part 2');
  });

  it('maps 401 to E_AUTH', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 401,
      text: async () => '{"error":{"message":"bad key"}}',
    });
    await expect(
      callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toMatchObject({ code: 'E_AUTH', httpStatus: 401 });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/providers/anthropic.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// electron/ai/providers/anthropic.ts
import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';

interface ProviderRequest {
  profile: { id: string; model: string; baseUrl?: string; apiKey: string | null; temperature?: number; maxTokens?: number };
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  jsonMode?: boolean; // ignored — Anthropic relies on prompt + parser
}

function err(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  Object.assign(e, extra);
  return e;
}

function statusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'E_AUTH';
  if (status === 429) return 'E_RATE';
  if (status >= 500) return 'E_SERVER';
  return 'E_UNKNOWN';
}

export async function callProvider(req: ProviderRequest): Promise<ChatTextResult> {
  const baseUrl = req.profile.baseUrl ?? 'https://api.anthropic.com';
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages';
  const model = req.model ?? req.profile.model;

  const sys = req.messages.find(m => m.role === 'system')?.content;
  const nonSys = req.messages.filter(m => m.role !== 'system');

  const body: Record<string, unknown> = {
    model,
    max_tokens: req.maxTokens ?? req.profile.maxTokens ?? 800,
    temperature: req.temperature ?? req.profile.temperature ?? 0.3,
    messages: nonSys,
  };
  if (sys) body.system = sys;

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': req.profile.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw err('E_NETWORK', 'timeout');
    throw err('E_NETWORK', (e as Error).message);
  }
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let providerMessage = text;
    try { providerMessage = JSON.parse(text).error?.message ?? text; } catch { /* */ }
    throw err(statusToCode(resp.status), `anthropic ${resp.status}: ${providerMessage}`, {
      httpStatus: resp.status, providerMessage,
    });
  }

  const json = await resp.json() as {
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: json.usage ? {
      promptTokens: json.usage.input_tokens,
      completionTokens: json.usage.output_tokens,
      totalTokens: json.usage.input_tokens + json.usage.output_tokens,
    } : undefined,
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/providers/anthropic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/anthropic.ts electron/ai/providers/anthropic.test.ts
git commit -m "feat(phase-15): anthropic provider — system extraction + content concat"
```

---

<!-- openspec-task: 2.4 -->
### Task 7: `electron/ai/providers/ollama.ts` — Ollama provider

**Files:**
- Create: `electron/ai/providers/ollama.ts`
- Create: `electron/ai/providers/ollama.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/providers/ollama.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './ollama';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const baseProfile = {
  id: 'p-local', provider: 'ollama' as const, model: 'llama3',
  baseUrl: undefined, apiKey: null,
};

describe('ollama provider', () => {
  it('posts to localhost:11434/api/chat with stream:false', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        model: 'llama3',
        message: { content: 'hi' },
        prompt_eval_count: 12, eval_count: 8,
      }),
    });
    const r = await callProvider({
      profile: baseProfile,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(r.text).toBe('hi');
    expect(r.usage).toMatchObject({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect((init.headers as any).Authorization).toBeUndefined();
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBeGreaterThan(0);
  });

  it('adds format:"json" when jsonMode=true', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ message: { content: '{}' } }),
    });
    await callProvider({ profile: baseProfile, messages: [{ role: 'user', content: 'x' }], jsonMode: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.format).toBe('json');
  });

  it('honors profile.baseUrl override', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: { content: '' } }) });
    await callProvider({
      profile: { ...baseProfile, baseUrl: 'http://10.0.0.1:11434' },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('http://10.0.0.1:11434/api/chat');
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/providers/ollama.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// electron/ai/providers/ollama.ts
import type { LlmMessage, ChatTextResult, LlmError, LlmErrorCode } from '@shared/ai-types';

interface ProviderRequest {
  profile: { id: string; model: string; baseUrl?: string; apiKey: string | null; temperature?: number; maxTokens?: number };
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  jsonMode?: boolean;
}

function err(code: LlmErrorCode, message: string, extra: Partial<LlmError> = {}): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  Object.assign(e, extra);
  return e;
}

function statusToCode(status: number): LlmErrorCode {
  if (status === 401 || status === 403) return 'E_AUTH';
  if (status === 429) return 'E_RATE';
  if (status >= 500) return 'E_SERVER';
  return 'E_UNKNOWN';
}

export async function callProvider(req: ProviderRequest): Promise<ChatTextResult> {
  const baseUrl = req.profile.baseUrl ?? 'http://localhost:11434';
  const url = baseUrl.replace(/\/$/, '') + '/api/chat';
  const model = req.model ?? req.profile.model;

  const body: Record<string, unknown> = {
    model,
    messages: req.messages,
    stream: false,
    options: {
      temperature: req.temperature ?? req.profile.temperature ?? 0.3,
      num_predict: req.maxTokens ?? req.profile.maxTokens ?? 800,
    },
  };
  if (req.jsonMode) body.format = 'json';

  const t0 = Date.now();
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw err('E_NETWORK', 'timeout');
    throw err('E_NETWORK', (e as Error).message);
  }
  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw err(statusToCode(resp.status), `ollama ${resp.status}: ${text}`, { httpStatus: resp.status, providerMessage: text });
  }

  const json = await resp.json() as {
    model?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };
  const text = json.message?.content ?? '';
  return {
    text,
    model: json.model ?? model,
    latencyMs,
    usage: (json.prompt_eval_count != null || json.eval_count != null) ? {
      promptTokens: json.prompt_eval_count ?? 0,
      completionTokens: json.eval_count ?? 0,
      totalTokens: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
    } : undefined,
  };
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/providers/ollama.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/ollama.ts electron/ai/providers/ollama.test.ts
git commit -m "feat(phase-15): ollama provider — /api/chat + format:json"
```

---

<!-- openspec-task: 2.5 -->
### Task 8: `electron/ai/providers/openai-compatible.ts`

**Files:**
- Create: `electron/ai/providers/openai-compatible.ts`
- Create: `electron/ai/providers/openai-compatible.test.ts`

The implementation reuses OpenAI's call shape but **requires** `profile.baseUrl`. (`client.ts` Task 4 already enforces baseUrl → `E_CONFIG` at resolution time, but this module re-checks defensively in case it's invoked through a different path.)

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/providers/openai-compatible.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callProvider } from './openai-compatible';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('openai-compatible provider', () => {
  it('uses profile.baseUrl + /v1/chat/completions', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ model: 'm', choices: [{ message: { content: 'ok' } }] }),
    });
    await callProvider({
      profile: { id: 'p', provider: 'openai-compatible', model: 'm', baseUrl: 'https://api.groq.com/openai', apiKey: 'k' },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('throws E_CONFIG if baseUrl missing', async () => {
    await expect(
      callProvider({
        profile: { id: 'p', provider: 'openai-compatible', model: 'm', baseUrl: undefined as any, apiKey: 'k' },
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'E_CONFIG' });
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/providers/openai-compatible.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// electron/ai/providers/openai-compatible.ts
import type { LlmError, LlmErrorCode } from '@shared/ai-types';
import { callProvider as callOpenai } from './openai';

function err(code: LlmErrorCode, message: string): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = code;
  return e;
}

export async function callProvider(req: Parameters<typeof callOpenai>[0]) {
  if (!req.profile.baseUrl) {
    throw err('E_CONFIG', 'openai-compatible requires profile.baseUrl');
  }
  return callOpenai(req);
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/providers/openai-compatible.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/openai-compatible.ts electron/ai/providers/openai-compatible.test.ts
git commit -m "feat(phase-15): openai-compatible provider — reuse openai impl with custom baseUrl"
```

---

<!-- openspec-task: 2.6 -->
### Task 9: `parse-json.ts` — four-layer JSON parser + Ajv validation

**Files:**
- Create: `electron/ai/parse-json.ts`
- Create: `electron/ai/parse-json.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/ai/parse-json.test.ts
import { describe, it, expect } from 'vitest';
import { parseAndValidate, stripCodeFence, extractFirstJsonObject } from './parse-json';

const schema = {
  type: 'object',
  required: ['a'],
  properties: { a: { type: 'number' } },
  additionalProperties: false,
};

describe('parseAndValidate', () => {
  it('parses raw JSON', () => {
    expect(parseAndValidate('{"a":1}', schema)).toEqual({ a: 1 });
  });

  it('strips ```json fence', () => {
    const text = '```json\n{"a":2}\n```';
    expect(parseAndValidate(text, schema)).toEqual({ a: 2 });
  });

  it('strips bare ``` fence', () => {
    expect(parseAndValidate('```\n{"a":3}\n```', schema)).toEqual({ a: 3 });
  });

  it('extracts JSON when surrounded by text', () => {
    expect(parseAndValidate('Here is the result:\n{"a":4}\nThanks', schema)).toEqual({ a: 4 });
  });

  it('throws E_RESPONSE on schema mismatch', () => {
    expect(() => parseAndValidate('{"b":5}', schema)).toThrowError(
      expect.objectContaining({ code: 'E_RESPONSE' }),
    );
  });

  it('throws E_RESPONSE when no JSON object can be located', () => {
    expect(() => parseAndValidate('totally not json', schema)).toThrowError(
      expect.objectContaining({ code: 'E_RESPONSE' }),
    );
  });

  it('handles balanced-braces inner objects', () => {
    expect(parseAndValidate('prelude {"a": 6, "nested": {"x": 1}} extra', {
      type: 'object', required: ['a'], properties: { a: { type: 'number' }, nested: { type: 'object' } },
    })).toMatchObject({ a: 6 });
  });
});

describe('helpers', () => {
  it('stripCodeFence removes ```json wrappers', () => {
    expect(stripCodeFence('```json\n{}\n```')).toBe('{}');
  });
  it('extractFirstJsonObject finds balanced braces', () => {
    expect(extractFirstJsonObject('text {"a":1} tail')).toBe('{"a":1}');
    expect(extractFirstJsonObject('text {"a": {"b":2}} tail')).toBe('{"a": {"b":2}}');
    expect(extractFirstJsonObject('no braces')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `npx vitest run electron/ai/parse-json.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// electron/ai/parse-json.ts
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { LlmError } from '@shared/ai-types';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

function err(message: string, providerMessage?: string): LlmError & Error {
  const e = new Error(message) as LlmError & Error;
  (e as any).code = 'E_RESPONSE';
  if (providerMessage) (e as any).providerMessage = providerMessage;
  return e;
}

export function stripCodeFence(input: string): string {
  let s = input.trim();
  // ```json\n...\n``` or ```\n...\n```
  const fenceRe = /^```(?:json|JSON)?\s*\n([\s\S]*?)\n```$/m;
  const m = s.match(fenceRe);
  if (m) return m[1].trim();
  return s;
}

export function extractFirstJsonObject(input: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

export function parseAndValidate<T = unknown>(rawText: string, schema: object): T {
  const stripped = stripCodeFence(rawText);

  const tryParse = (s: string): unknown | undefined => {
    try { return JSON.parse(s); } catch { return undefined; }
  };

  let obj = tryParse(stripped);
  if (obj === undefined) {
    const extracted = extractFirstJsonObject(stripped);
    if (extracted) obj = tryParse(extracted);
  }
  if (obj === undefined) {
    throw err('invalid JSON from LLM: no parseable object found', rawText.slice(0, 500));
  }

  const validate = ajv.compile(schema);
  if (!validate(obj)) {
    const msg = (validate.errors ?? []).map(e => `${e.instancePath} ${e.message}`).join('; ');
    throw err(`invalid JSON from LLM: schema validation failed — ${msg}`, JSON.stringify(obj).slice(0, 500));
  }
  return obj as T;
}
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/parse-json.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add electron/ai/parse-json.ts electron/ai/parse-json.test.ts
git commit -m "feat(phase-15): chatJson parsing — code-fence strip + brace extraction + Ajv validate"
```

---

<!-- openspec-task: 2.7 -->
### Task 10: 60s `AbortController` timeout + integration test

The provider modules already accept `signal`; this task wires a default 60s timeout in `client.ts` and adds an integration test that verifies the wiring.

**Files:**
- Modify: `electron/ai/client.ts`
- Modify: `electron/ai/client.test.ts`

- [ ] **Step 1: Write failing test for default timeout wiring**

Add to `electron/ai/client.test.ts`:

```ts
describe('llmClient.chat — default timeout', () => {
  it('passes an AbortSignal to the provider that aborts after the configured timeout', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    (profilesStore.get as any).mockReturnValue({
      id: 'p1', provider: 'openai', model: 'gpt-4o-mini', baseUrl: undefined,
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');

    let receivedSignal: AbortSignal | undefined;
    vi.doMock('./providers/openai', () => ({
      callProvider: vi.fn(async (req: any) => {
        receivedSignal = req.signal;
        return { text: 'ok', model: 'm', latencyMs: 1 };
      }),
    }));

    // Re-import to pick up the mock
    const { llmClient: freshClient } = await import('./client');
    await freshClient.chat({ messages: [{ role: 'user', content: 'x' }] });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal!.aborted).toBe(false);
  });

  it('uses caller-provided signal when given (no default timeout layered on top)', async () => {
    (settingsStore.get as any).mockReturnValue({ defaultProfileId: 'p1' });
    (profilesStore.get as any).mockReturnValue({
      id: 'p1', provider: 'openai', model: 'gpt-4o-mini', baseUrl: undefined,
    });
    (getProfileDecryptedKey as any).mockReturnValue('k');

    const ac = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    vi.doMock('./providers/openai', () => ({
      callProvider: vi.fn(async (req: any) => {
        receivedSignal = req.signal;
        return { text: 'ok', model: 'm', latencyMs: 1 };
      }),
    }));

    const { llmClient: freshClient } = await import('./client');
    await freshClient.chat({ messages: [{ role: 'user', content: 'x' }], signal: ac.signal });
    expect(receivedSignal).toBe(ac.signal);
  });
});
```

- [ ] **Step 2: Run — fails (default signal not yet attached)**

Run: `npx vitest run electron/ai/client.test.ts`
Expected: at least one of the new tests fails because `llmClient.chat` does not currently create an AbortController.

- [ ] **Step 3: Add timeout wiring to `client.ts`**

In `electron/ai/client.ts`, replace the body of `chat` and `chatJson` to layer in a default timeout when no signal is supplied:

```ts
const DEFAULT_TIMEOUT_MS = 60_000;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  if (signal) return { signal, cleanup: () => {} };
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeoutMs);
  return { signal: ac.signal, cleanup: () => clearTimeout(id) };
}

export const llmClient = {
  async chat(opts: ChatOptions): Promise<ChatTextResult> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    const { signal, cleanup } = withTimeout(opts.signal, DEFAULT_TIMEOUT_MS);
    try {
      return await callProvider({ profile, ...opts, signal });
    } finally {
      cleanup();
    }
  },
  async chatJson<T = unknown>(opts: ChatJsonOptions): Promise<ChatJsonResult<T>> {
    const profile = resolveProfile(opts.profileId);
    const { callProvider } = await loadProvider(profile.provider);
    const { signal, cleanup } = withTimeout(opts.signal, DEFAULT_TIMEOUT_MS);
    try {
      const { text, model, usage, latencyMs } = await callProvider({ profile, ...opts, signal, jsonMode: true });
      const { parseAndValidate } = await import('./parse-json');
      const data = parseAndValidate<T>(text, opts.schema);
      return { data, rawText: text, model, usage, latencyMs };
    } finally {
      cleanup();
    }
  },
};
```

- [ ] **Step 4: Run — passes**

Run: `npx vitest run electron/ai/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Sanity-run all of Plan 1's tests**

```bash
npx vitest run electron/services/db/migrations/008_ai_usage.test.ts \
  shared/ai-types.test.ts \
  electron/ai
```

Expected: PASS for everything in scope.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/client.ts electron/ai/client.test.ts
git commit -m "feat(phase-15): llmClient default 60s timeout via AbortController"
```

---

## Self-Review Checklist (filled in)

- ✅ Spec coverage: every requirement in `specs/llm-client/spec.md` (Provider 抽象 / Anthropic / Ollama / openai-compatible / chatJson 解析鲁棒 / 错误归一化 / 请求超时 / key 仅 main) and `ai-usage-log/spec.md` (`ai_usage` table) is touched by Tasks 1, 2, 4-10. Manual `key 仅 main` proof is in Plan 4 acceptance task 10.19.
- ✅ Placeholders: each step has runnable code or commands; no TODOs.
- ✅ Type consistency: `ProviderRequest.profile` shape consistent across all four providers; `ChatTextResult { text, model, usage, latencyMs }` consistent; `LlmError { code, message, httpStatus?, providerMessage? }` matches `shared/ai-types.ts`.
- ✅ Migration numbering Pre-flight gate noted.

## OpenSpec task mapping

- Task 1 → 1.1
- Task 2 → 1.2
- Task 3 → 1.3
- Task 4 → 2.1
- Task 5 → 2.2
- Task 6 → 2.3
- Task 7 → 2.4
- Task 8 → 2.5
- Task 9 → 2.6
- Task 10 → 2.7
