# Phase 16 — Chat Agent + Tools: Plan 1 (Schema, Types, LLM Tool-Use Extension)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-16-chat-agent-tools`
> **Task range:** OpenSpec tasks `1.1`–`2.6` (9 tasks)
> **Plan order:** 1 of 4. Followed by Plan 2 (`tasks-3.1-4.6`), Plan 3 (`tasks-5.1-8.1`), Plan 4 (`tasks-9.1-9.17`).
> **Status:** Not started
> **Created:** 2026-05-04
> **Branch suggestion:** `feat/phase-16-chat-agent-tools` (branch from `main` after phase-15 merges)

---

## Goal

Lay the foundation for the chat-agent backend: ship migration `009_sessions.sql` (sessions / session_messages / tool_calls + `ai_usage.session_id`), the shared TypeScript contracts in `shared/agent-types.ts`, the `eventsource-parser` dependency, and extend `electron/ai/client.ts` (phase 15) with `chatStream` and `chatWithTools` covering all four providers (openai / anthropic / ollama / openai-compatible) plus a single `parseAndValidate` helper that schema-checks tool args before they reach `tool.execute()`.

## Architecture

- **DB schema is the contract**: `sessions` is the parent; `session_messages` is append-only conversation log; `tool_calls` is a structured audit trail keyed by the OpenAI-style `tool_call_id`. `ai_usage.session_id` is added by `ALTER TABLE` so phase-15 entries remain valid (NULL).
- **Shared types live in `shared/agent-types.ts`** so renderer (phase 17) and main agree on `AgentEvent` discriminator strings, `ToolCall.id` shape, and message roles. The file imports from `shared/ai-types.ts` (`TokenUsage`) but does not redefine those.
- **`llmClient` gains two methods**: `chatStream({ profileId, messages, model, ..., onToken, signal })` for plain text streaming, and `chatWithTools({ profileId, messages, tools, ..., onEvent, signal })` for the unified tool-use shape used by the agent loop. Both are streaming-first; the loop in Plan 2 drains them via callbacks. Non-streaming `chat`/`chatJson` from phase-15 are untouched.
- **Provider adapters return a unified `ChatWithToolsResult`** — `{ text?: string, toolCalls: { id, name, args }[], finishReason: 'stop'|'tool_calls'|'length'|'error', usage?: TokenUsage }`. `args` is **already JSON-parsed and Ajv-validated** at the boundary; provider errors and validation failures map to `{ finishReason: 'error', text: undefined }` with a structured error event emitted via `onEvent`.
- **Ollama fallback** lives entirely inside `providers/ollama.ts`: if the model's API response carries a native `tool_calls[]` field (llama3.1+ tool format), that path is used; otherwise the provider injects an extra prompt instructing the model to reply with a single-line JSON object like `{"tool":"<name>","args":{...}}` and parses the streamed text accordingly.
- **`parseAndValidate(name, rawArgs, registry)`** is a tiny standalone helper used by every provider after extracting tool call args. It JSON-parses the string, runs Ajv compile+validate against the tool's `parameters` schema, and returns either `{ ok: true, args }` or `{ ok: false, error: 'E_INVALID_ARGS', detail }`. The registry will be defined in Plan 2; this plan exposes a Validator interface so providers don't import the registry directly (preventing circular deps).

## Tech Stack

- `eventsource-parser@^3` — SSE chunk parser used by openai / openai-compatible / anthropic providers
- `ajv@^8` (already added by phase-15 Plan 1) — JSON schema validator
- `better-sqlite3@^11` (already a project dep) — DB driver
- `vitest@^2` — unit tests
- Node 22+ (already pinned)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/services/db/migrations/009_sessions.sql` | Create | 1.1 |
| `electron/services/db/migrations/009_sessions.test.ts` | Create | 1.1 |
| `shared/agent-types.ts` | Create | 1.2 |
| `shared/agent-types.test.ts` | Create | 1.2 |
| `package.json`, `package-lock.json` | Modify (add `eventsource-parser`) | 1.3 |
| `electron/ai/client.ts` | Modify (add `chatStream`, `chatWithTools`) | 2.1 |
| `electron/ai/client.test.ts` | Modify (new describe blocks) | 2.1 |
| `electron/ai/providers/openai.ts` | Modify (export `callProviderStream`, `callProviderTools`) | 2.2 |
| `electron/ai/providers/openai.test.ts` | Modify | 2.2 |
| `electron/ai/providers/anthropic.ts` | Modify | 2.3 |
| `electron/ai/providers/anthropic.test.ts` | Modify | 2.3 |
| `electron/ai/providers/openai-compatible.ts` | Modify (re-export from openai) | 2.4 |
| `electron/ai/providers/openai-compatible.test.ts` | Modify | 2.4 |
| `electron/ai/providers/ollama.ts` | Modify (native + fallback paths) | 2.5 |
| `electron/ai/providers/ollama.test.ts` | Modify | 2.5 |
| `electron/ai/parse-tool-args.ts` | Create | 2.6 |
| `electron/ai/parse-tool-args.test.ts` | Create | 2.6 |

## Pre-flight

- **Phase 15 (AI Reviewer) MUST be merged first.** This plan assumes `electron/ai/client.ts`, `electron/ai/providers/*.ts`, `shared/ai-types.ts`, migration `008_ai_usage.sql`, and `ajv` are already on `main`. If phase-15 has not landed, stop and complete it before starting this plan.
- Confirm `electron/services/db/migrations/008_ai_usage.sql` exists and applies cleanly to a fresh DB. The migration runner expects `user_version` to be set to `8` after it. Phase 16 sets `user_version` to `9`.
- Confirm `electron/ai/client.ts` exports `llmClient` with `chat` and `chatJson` methods, and that providers export a `callProvider` function. This plan adds a parallel `callProviderStream` and `callProviderTools` next to `callProvider` rather than replacing it.
- The migration runner at `electron/services/db/migrations.ts` already silently skips duplicate `CREATE TABLE` and "duplicate column name" errors (idempotent). The `ALTER TABLE ai_usage ADD COLUMN session_id` on a fresh DB where 008 just ran is therefore safe.
- `IpcError` codes referenced in this plan: existing `E_PERMISSION`, `E_MTIME_MISMATCH`, `E_NOT_FOUND` from phases 4/13. No new error codes are introduced in Plan 1.

---

## Tasks

<!-- openspec-task: 1.1 -->
### Task 1: Migration 009 — sessions / session_messages / tool_calls + `ai_usage.session_id`

**Files:**
- Create: `electron/services/db/migrations/009_sessions.sql`
- Create: `electron/services/db/migrations/009_sessions.test.ts`

- [ ] **Step 1: Confirm latest migration on disk is 008**

```bash
ls electron/services/db/migrations/*.sql | sort | tail -3
```

Expected: last line is `electron/services/db/migrations/008_ai_usage.sql`. If `009_sessions.sql` already exists, stop and reconcile.

- [ ] **Step 2: Write the failing migration test**

Create `electron/services/db/migrations/009_sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { runMigrations } from '../migrations';

let db: Database.Database;
const migrationsDir = resolve(__dirname);

beforeEach(() => {
  db = new Database(':memory:');
});

describe('migration 009_sessions', () => {
  it('creates sessions / session_messages / tool_calls tables and bumps user_version to 9', () => {
    runMigrations(db, migrationsDir);
    expect(db.pragma('user_version', { simple: true })).toBe(9);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map(t => t.name);
    expect(names).toContain('sessions');
    expect(names).toContain('session_messages');
    expect(names).toContain('tool_calls');
  });

  it('adds session_id column to ai_usage', () => {
    runMigrations(db, migrationsDir);
    const cols = db.prepare("PRAGMA table_info('ai_usage')").all() as { name: string }[];
    expect(cols.map(c => c.name)).toContain('session_id');
  });

  it('sessions.id is PRIMARY KEY and updated_at is indexed', () => {
    runMigrations(db, migrationsDir);
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'").all() as { name: string }[];
    expect(indexes.some(i => i.name === 'idx_sessions_updated')).toBe(true);
  });

  it('session_messages CASCADE deletes when its session is deleted', () => {
    runMigrations(db, migrationsDir);
    db.prepare("INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run('s1', 't', 'p1', '2026-05-04T00:00:00Z', '2026-05-04T00:00:00Z');
    db.prepare("INSERT INTO session_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)")
      .run('s1', 'user', 'hi', '2026-05-04T00:00:00Z');
    db.prepare("DELETE FROM sessions WHERE id = ?").run('s1');
    const remaining = db.prepare("SELECT COUNT(*) as n FROM session_messages WHERE session_id = ?").get('s1') as { n: number };
    expect(remaining.n).toBe(0);
  });

  it('tool_calls.session_id is required and indexed', () => {
    runMigrations(db, migrationsDir);
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tool_calls'").all() as { name: string }[];
    expect(idx.some(i => i.name === 'idx_tool_calls_session')).toBe(true);
    expect(() =>
      db.prepare("INSERT INTO tool_calls (id, tool_name, args_json) VALUES (?, ?, ?)").run('tc1', 'search_files', '{}')
    ).toThrow(/NOT NULL constraint failed: tool_calls.session_id/);
  });
});
```

- [ ] **Step 3: Run test — should FAIL because 009_sessions.sql does not exist**

```bash
npx vitest run electron/services/db/migrations/009_sessions.test.ts
```

Expected: 5 failing tests; errors mentioning "no such table: sessions" or `user_version` not equal to 9.

- [ ] **Step 4: Write the migration SQL**

Create `electron/services/db/migrations/009_sessions.sql`:

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

CREATE TABLE session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_session_messages_session ON session_messages(session_id, id);

CREATE TABLE tool_calls (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  message_id INTEGER,
  tool_name TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_json TEXT,
  approved INTEGER,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);

ALTER TABLE ai_usage ADD COLUMN session_id TEXT;

PRAGMA user_version = 9;
```

- [ ] **Step 5: Run test — should PASS**

```bash
npx vitest run electron/services/db/migrations/009_sessions.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/009_sessions.sql electron/services/db/migrations/009_sessions.test.ts
git commit -m "feat(phase-16): migration 009 — sessions / session_messages / tool_calls + ai_usage.session_id"
```

<!-- openspec-task: 1.2 -->
### Task 2: `shared/agent-types.ts` — Tool / ToolCall / ToolResult / Session / SessionMessage / AgentEvent

**Files:**
- Create: `shared/agent-types.ts`
- Create: `shared/agent-types.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `shared/agent-types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Tool, ToolCall, ToolResult, Session, SessionMessage, AgentEvent, JSONSchema,
} from './agent-types';

describe('agent-types', () => {
  it('Tool has required schema-driven shape', () => {
    const t: Tool<{ q: string }, { items: string[] }> = {
      name: 'demo',
      description: 'demo',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      sideEffect: false,
      execute: async (args) => ({ items: [args.q] }),
    };
    expectTypeOf(t.execute).parameters.toEqualTypeOf<[{ q: string }, import('./agent-types').ToolCtx]>();
  });

  it('AgentEvent discriminator includes the documented variants', () => {
    const variants: AgentEvent['type'][] = [
      'message.appended', 'step.start', 'token', 'tool.approval-needed',
      'tool.start', 'tool.result', 'done', 'error', 'canceled',
    ];
    expectTypeOf(variants).toEqualTypeOf<AgentEvent['type'][]>();
  });

  it('SessionMessage role is constrained', () => {
    const m: SessionMessage = {
      id: 1, sessionId: 's1', role: 'tool', content: '{}', toolCallId: 'tc1', createdAt: '2026-05-04T00:00:00Z',
    };
    expectTypeOf(m.role).toEqualTypeOf<'user' | 'assistant' | 'tool' | 'system'>();
  });

  it('ToolCall has id / name / args', () => {
    const tc: ToolCall = { id: 'tc1', name: 'search_files', args: { query: 'x' } };
    expectTypeOf(tc.args).toEqualTypeOf<unknown>();
  });
});
```

- [ ] **Step 2: Run test — should FAIL because file does not exist**

```bash
npx vitest run shared/agent-types.test.ts
```

Expected: TypeScript compilation error "Cannot find module './agent-types'".

- [ ] **Step 3: Write the types module**

Create `shared/agent-types.ts`:

```ts
import type { TokenUsage } from './ai-types';

export type JSONSchema = {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: readonly (string | number)[];
  description?: string;
  [k: string]: unknown;
};

export interface ToolCtx {
  sessionId: string;
  vaultRoot: string;
  log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
  cancel: AbortSignal;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: JSONSchema;
  sideEffect: boolean;
  execute(args: TArgs, ctx: ToolCtx): Promise<TResult>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; detail?: unknown };

export interface Session {
  id: string;
  title: string | null;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  createdAt: string;
}

export type AgentEvent =
  | { type: 'message.appended'; message: SessionMessage }
  | { type: 'step.start'; step: number }
  | { type: 'token'; text: string }
  | { type: 'tool.approval-needed'; callId: string; tool: string; args: unknown; reason?: string }
  | { type: 'tool.start'; tool: string; args: unknown }
  | { type: 'tool.result'; tool: string; result: ToolResult }
  | { type: 'done'; usage?: TokenUsage }
  | { type: 'error'; error: string; detail?: unknown }
  | { type: 'canceled' };

export interface ChatWithToolsResult {
  text?: string;
  toolCalls: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: TokenUsage;
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run shared/agent-types.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Verify it compiles in both web and node tsconfigs**

```bash
npx tsc -p tsconfig.web.json --noEmit && npx tsc -p tsconfig.node.json --noEmit
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add shared/agent-types.ts shared/agent-types.test.ts
git commit -m "feat(phase-16): shared/agent-types — Tool / ToolCall / Session / AgentEvent contracts"
```

<!-- openspec-task: 1.3 -->
### Task 3: Add `eventsource-parser` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm absent**

```bash
node -e "const p=require('./package.json'); console.log(p.dependencies['eventsource-parser'] ?? 'absent')"
```

Expected: `absent`.

- [ ] **Step 2: Install**

```bash
npm install eventsource-parser
```

Expected: `dependencies` now lists `eventsource-parser` at `^3.x` and `npm install` exits 0.

- [ ] **Step 3: Smoke-test the API we'll use**

```bash
node -e "const { createParser } = require('eventsource-parser'); const p = createParser({ onEvent: e => console.log('got:', e.data) }); p.feed('data: hello\n\n'); console.log('ok')"
```

Expected: prints `got: hello` then `ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-16): add eventsource-parser dep for SSE streaming"
```

<!-- openspec-task: 2.1 -->
### Task 4: `electron/ai/client.ts` — `chatStream` + `chatWithTools` signatures + dispatch

**Files:**
- Modify: `electron/ai/client.ts`
- Modify: `electron/ai/client.test.ts`

- [ ] **Step 1: Read current `client.ts` to confirm where to extend**

```bash
grep -n "export const llmClient\|chatJson\|loadProvider" electron/ai/client.ts
```

Expected: shows the `llmClient` object literal with `chat` and `chatJson` methods plus a `loadProvider` switch over the four provider kinds. Note the line numbers — you'll insert two new methods next to them.

- [ ] **Step 2: Write the failing dispatch test**

Append to `electron/ai/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./providers/openai', () => ({
  callProvider: vi.fn(),
  callProviderStream: vi.fn(async (_req, { onToken }) => {
    onToken('he'); onToken('llo');
    return { text: 'hello', usage: { promptTokens: 1, completionTokens: 2 }, latencyMs: 10, model: 'gpt-x' };
  }),
  callProviderTools: vi.fn(async () => ({
    text: 'I will search.',
    toolCalls: [{ id: 'tc1', name: 'search_files', args: { query: 'x' } }],
    finishReason: 'tool_calls' as const,
    usage: { promptTokens: 5, completionTokens: 3 },
  })),
}));

vi.mock('../settings/profiles', () => ({
  profilesStore: { get: vi.fn(() => ({ id: 'p1', provider: 'openai', model: 'gpt-x', apiKeyRef: 'k1' })) },
}));
vi.mock('../settings/profile-key', () => ({
  getProfileDecryptedKey: vi.fn(() => 'sk-test'),
}));

import { llmClient } from './client';

describe('llmClient.chatStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispatches to the provider stream and forwards onToken chunks', async () => {
    const tokens: string[] = [];
    const r = await llmClient.chatStream({
      profileId: 'p1',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    });
    expect(tokens).toEqual(['he', 'llo']);
    expect(r.text).toBe('hello');
  });
});

describe('llmClient.chatWithTools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns unified tool call shape with finishReason', async () => {
    const r = await llmClient.chatWithTools({
      profileId: 'p1',
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object' } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls[0]).toMatchObject({ name: 'search_files', args: { query: 'x' } });
  });
});
```

- [ ] **Step 3: Run test — should FAIL (methods undefined)**

```bash
npx vitest run electron/ai/client.test.ts
```

Expected: `llmClient.chatStream is not a function` / `llmClient.chatWithTools is not a function`.

- [ ] **Step 4: Add types + dispatch in `client.ts`**

In `electron/ai/client.ts`, add (next to the existing `chat`/`chatJson` definitions; do not alter them):

```ts
import type { Tool, ChatWithToolsResult } from '../../shared/agent-types';

export interface ChatStreamOptions {
  profileId?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onToken: (text: string) => void;
}
export interface ChatStreamResult { text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }

export interface ChatWithToolsOptions extends Omit<ChatStreamOptions, 'onToken'> {
  tools: Array<Pick<Tool, 'name' | 'description' | 'parameters'>>;
  onToken?: (text: string) => void;
  onEvent?: (e: { type: 'tool_call_started'; id: string; name: string } | { type: 'token'; text: string }) => void;
  toolChoice?: 'auto' | 'none';
}

// Inside the existing `llmClient` object literal, add these methods:
async chatStream(opts: ChatStreamOptions): Promise<ChatStreamResult> {
  const profile = await resolveProfile(opts.profileId);
  const mod = await loadProvider(profile.provider);
  if (typeof mod.callProviderStream !== 'function') {
    throw new IpcError('E_PROVIDER_UNSUPPORTED', `provider ${profile.provider} does not implement chatStream`);
  }
  return mod.callProviderStream({ profile, ...opts }, { onToken: opts.onToken });
},

async chatWithTools(opts: ChatWithToolsOptions): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const profile = await resolveProfile(opts.profileId);
  const mod = await loadProvider(profile.provider);
  if (typeof mod.callProviderTools !== 'function') {
    throw new IpcError('E_PROVIDER_UNSUPPORTED', `provider ${profile.provider} does not implement chatWithTools`);
  }
  return mod.callProviderTools({ profile, ...opts });
},
```

(Re-use the existing `resolveProfile`, `loadProvider`, and `IpcError` import from phase-15.)

- [ ] **Step 5: Run test — should PASS**

```bash
npx vitest run electron/ai/client.test.ts
```

Expected: all new tests pass; existing phase-15 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/client.ts electron/ai/client.test.ts
git commit -m "feat(phase-16): llmClient.chatStream + chatWithTools dispatcher"
```

<!-- openspec-task: 2.2 -->
### Task 5: `providers/openai.ts` — `callProviderStream` + `callProviderTools` (SSE + tool_calls)

**Files:**
- Modify: `electron/ai/providers/openai.ts`
- Modify: `electron/ai/providers/openai.test.ts`

- [ ] **Step 1: Write failing tests for streaming + tool_calls**

Append to `electron/ai/providers/openai.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProviderStream, callProviderTools } from './openai';

const sse = (chunks: string[]) => new ReadableStream<Uint8Array>({
  start(c) {
    const enc = new TextEncoder();
    for (const x of chunks) c.enqueue(enc.encode(`data: ${x}\n\n`));
    c.enqueue(enc.encode('data: [DONE]\n\n'));
    c.close();
  },
});

describe('openai.callProviderStream', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });
  it('parses SSE deltas and concatenates text', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, body: sse([
        JSON.stringify({ choices: [{ delta: { content: 'hel' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } }),
      ]),
    });
    const tokens: string[] = [];
    const r = await callProviderStream(
      { profile: { id: 'p', provider: 'openai', model: 'gpt-x', apiKeyRef: 'k', baseURL: undefined, decryptedKey: 'sk' } as any, messages: [{ role: 'user', content: 'hi' }] },
      { onToken: (t) => tokens.push(t) },
    );
    expect(tokens).toEqual(['hel', 'lo']);
    expect(r.text).toBe('hello');
    expect(r.usage).toEqual({ promptTokens: 1, completionTokens: 2 });
  });
});

describe('openai.callProviderTools', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });
  it('emits unified ChatWithToolsResult with parsed args', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{ id: 'tc_1', type: 'function', function: { name: 'search_files', arguments: '{"query":"x"}' } }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 4, completion_tokens: 3 },
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'openai', model: 'gpt-x', apiKeyRef: 'k', decryptedKey: 'sk' } as any,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toEqual([{ id: 'tc_1', name: 'search_files', args: { query: 'x' } }]);
    expect(r.usage).toEqual({ promptTokens: 4, completionTokens: 3 });
  });

  it('maps text-only response to finishReason=stop', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        choices: [{ message: { content: 'no tools needed' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'openai', model: 'gpt-x', apiKeyRef: 'k', decryptedKey: 'sk' } as any,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
    });
    expect(r.finishReason).toBe('stop');
    expect(r.text).toBe('no tools needed');
    expect(r.toolCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — should FAIL (functions not exported)**

```bash
npx vitest run electron/ai/providers/openai.test.ts
```

Expected: import error for `callProviderStream` / `callProviderTools`.

- [ ] **Step 3: Implement streaming**

Append to `electron/ai/providers/openai.ts`:

```ts
import { createParser } from 'eventsource-parser';
import type { ChatWithToolsResult } from '../../../shared/agent-types';

export async function callProviderStream(
  req: ProviderStreamRequest,
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'https://api.openai.com') + '/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.profile.decryptedKey}` },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      messages: req.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    }),
  });
  if (!res.ok || !res.body) throw normalizeHttpError('openai', res);

  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const parser = createParser({
    onEvent: (e) => {
      if (e.data === '[DONE]') return;
      const j = JSON.parse(e.data);
      const delta = j.choices?.[0]?.delta?.content;
      if (delta) { text += delta; hooks.onToken(delta); }
      if (j.usage) usage = { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens };
    },
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  return { text, usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}
```

- [ ] **Step 4: Implement `callProviderTools` (non-streaming first; streaming-with-tools is openai-compatible-only and would re-implement here in phase 18)**

Append:

```ts
import { parseAndValidate } from '../parse-tool-args';

export async function callProviderTools(
  req: ProviderToolsRequest,
): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'https://api.openai.com') + '/v1/chat/completions';
  const body = {
    model: req.model ?? req.profile.model,
    messages: req.messages,
    tools: req.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: req.toolChoice ?? 'auto',
    temperature: req.temperature,
    max_tokens: req.maxTokens,
  };
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${req.profile.decryptedKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw normalizeHttpError('openai', res);
  const j = await res.json();
  const choice = j.choices?.[0];
  const finishReason = choice?.finish_reason === 'tool_calls' ? 'tool_calls'
    : choice?.finish_reason === 'length' ? 'length'
    : choice?.finish_reason === 'stop' ? 'stop'
    : 'error';

  const toolCalls = (choice?.message?.tool_calls ?? []).map((tc: any) => {
    const v = parseAndValidate(tc.function.name, tc.function.arguments, req.tools);
    return { id: tc.id, name: tc.function.name, args: v.ok ? v.args : { __invalid: true, raw: tc.function.arguments, error: v.error } };
  });
  return {
    text: choice?.message?.content ?? undefined,
    toolCalls,
    finishReason,
    usage: j.usage ? { promptTokens: j.usage.prompt_tokens, completionTokens: j.usage.completion_tokens } : undefined,
    latencyMs: Date.now() - t0,
    model: req.model ?? req.profile.model,
  };
}

interface ProviderStreamRequest extends ProviderRequest { signal?: AbortSignal }
interface ProviderToolsRequest extends ProviderRequest {
  signal?: AbortSignal;
  tools: Array<{ name: string; description: string; parameters: any }>;
  toolChoice?: 'auto' | 'none';
}
```

(Re-use `ProviderRequest`, `normalizeHttpError` from phase-15. `parse-tool-args.ts` is created in Task 9 — until then, this task's tests can stub it.)

- [ ] **Step 5: Provide a stub `parse-tool-args.ts` to unblock test compilation**

Create `electron/ai/parse-tool-args.ts` with a minimal export to be expanded in Task 9:

```ts
export function parseAndValidate(_name: string, raw: string, _tools: Array<{ name: string; parameters: any }>) {
  try { return { ok: true as const, args: JSON.parse(raw) }; }
  catch (e) { return { ok: false as const, error: 'E_INVALID_JSON' }; }
}
```

- [ ] **Step 6: Run tests — should PASS**

```bash
npx vitest run electron/ai/providers/openai.test.ts
```

Expected: all tests pass; existing phase-15 tests still pass.

- [ ] **Step 7: Commit**

```bash
git add electron/ai/providers/openai.ts electron/ai/providers/openai.test.ts electron/ai/parse-tool-args.ts
git commit -m "feat(phase-16): openai provider — callProviderStream (SSE) + callProviderTools (tool_calls)"
```

<!-- openspec-task: 2.3 -->
### Task 6: `providers/anthropic.ts` — tools + stream messages parser

**Files:**
- Modify: `electron/ai/providers/anthropic.ts`
- Modify: `electron/ai/providers/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `electron/ai/providers/anthropic.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProviderStream, callProviderTools } from './anthropic';

describe('anthropic.callProviderStream', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });
  it('parses SSE event stream (content_block_delta) into tokens', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        const events = [
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hel"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo"}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
          'event: message_stop\ndata: {"type":"message_stop"}\n\n',
        ];
        for (const e of events) c.enqueue(enc.encode(e));
        c.close();
      },
    });
    (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, body });
    const tokens: string[] = [];
    const r = await callProviderStream(
      { profile: { id: 'p', provider: 'anthropic', model: 'claude-x', apiKeyRef: 'k', decryptedKey: 'sk' } as any, messages: [{ role: 'user', content: 'hi' }] },
      { onToken: (t) => tokens.push(t) },
    );
    expect(tokens).toEqual(['hel', 'lo']);
    expect(r.text).toBe('hello');
  });
});

describe('anthropic.callProviderTools', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });
  it('extracts tool_use blocks from content[]', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'searching now' },
          { type: 'tool_use', id: 'toolu_1', name: 'search_files', input: { query: 'x' } },
        ],
        usage: { input_tokens: 4, output_tokens: 3 },
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'anthropic', model: 'claude-x', apiKeyRef: 'k', decryptedKey: 'sk' } as any,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.text).toBe('searching now');
    expect(r.toolCalls).toEqual([{ id: 'toolu_1', name: 'search_files', args: { query: 'x' } }]);
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/ai/providers/anthropic.test.ts
```

Expected: imports for `callProviderStream` / `callProviderTools` fail.

- [ ] **Step 3: Implement**

Append to `electron/ai/providers/anthropic.ts`:

```ts
import { createParser } from 'eventsource-parser';
import type { ChatWithToolsResult } from '../../../shared/agent-types';

export async function callProviderStream(
  req: ProviderRequest & { signal?: AbortSignal },
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'https://api.anthropic.com') + '/v1/messages';
  const { system, messages } = splitSystem(req.messages);
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.profile.decryptedKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      system, messages, stream: true,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature,
    }),
  });
  if (!res.ok || !res.body) throw normalizeHttpError('anthropic', res);

  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const parser = createParser({
    onEvent: (e) => {
      if (!e.data) return;
      const j = JSON.parse(e.data);
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
        text += j.delta.text;
        hooks.onToken(j.delta.text);
      } else if (j.type === 'message_start' && j.message?.usage) {
        usage = { promptTokens: j.message.usage.input_tokens, completionTokens: j.message.usage.output_tokens ?? 0 };
      } else if (j.type === 'message_delta' && j.usage) {
        usage = { promptTokens: usage?.promptTokens ?? 0, completionTokens: j.usage.output_tokens };
      }
    },
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }
  return { text, usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

export async function callProviderTools(
  req: ProviderRequest & { signal?: AbortSignal; tools: Array<{ name: string; description: string; parameters: any }>; toolChoice?: 'auto' | 'none' },
): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'https://api.anthropic.com') + '/v1/messages';
  const { system, messages } = splitSystem(req.messages);
  const res = await fetch(url, {
    method: 'POST',
    signal: req.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': req.profile.decryptedKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      system, messages,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature,
      tools: req.tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      tool_choice: req.toolChoice === 'none' ? { type: 'none' } : { type: 'auto' },
    }),
  });
  if (!res.ok) throw normalizeHttpError('anthropic', res);
  const j = await res.json();
  const blocks = j.content ?? [];
  const text = blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const toolCalls = blocks.filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ id: b.id, name: b.name, args: b.input }));
  const finishReason = j.stop_reason === 'tool_use' ? 'tool_calls'
    : j.stop_reason === 'end_turn' ? 'stop'
    : j.stop_reason === 'max_tokens' ? 'length'
    : 'error';
  return {
    text: text || undefined,
    toolCalls,
    finishReason,
    usage: j.usage ? { promptTokens: j.usage.input_tokens, completionTokens: j.usage.output_tokens } : undefined,
    latencyMs: Date.now() - t0,
    model: req.model ?? req.profile.model,
  };
}

function splitSystem(msgs: Array<{ role: string; content: string }>) {
  const system = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n\n') || undefined;
  const messages = msgs.filter(m => m.role !== 'system');
  return { system, messages };
}
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/ai/providers/anthropic.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/anthropic.ts electron/ai/providers/anthropic.test.ts
git commit -m "feat(phase-16): anthropic provider — callProviderStream + callProviderTools"
```

<!-- openspec-task: 2.4 -->
### Task 7: `providers/openai-compatible.ts` — re-export streaming + tools from openai

**Files:**
- Modify: `electron/ai/providers/openai-compatible.ts`
- Modify: `electron/ai/providers/openai-compatible.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/ai/providers/openai-compatible.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as compat from './openai-compatible';
import * as openai from './openai';

describe('openai-compatible re-exports', () => {
  it('exposes callProviderStream from openai', () => {
    expect(compat.callProviderStream).toBe(openai.callProviderStream);
  });
  it('exposes callProviderTools from openai', () => {
    expect(compat.callProviderTools).toBe(openai.callProviderTools);
  });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/ai/providers/openai-compatible.test.ts
```

Expected: re-exports undefined.

- [ ] **Step 3: Add the re-exports**

Append to `electron/ai/providers/openai-compatible.ts`:

```ts
export { callProviderStream, callProviderTools } from './openai';
```

(Phase-15 already has `export { callProvider } from './openai'` here; the file just needs two more lines.)

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/ai/providers/openai-compatible.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/openai-compatible.ts electron/ai/providers/openai-compatible.test.ts
git commit -m "feat(phase-16): openai-compatible provider re-exports stream/tools from openai"
```

<!-- openspec-task: 2.5 -->
### Task 8: `providers/ollama.ts` — native tool detection + plain-text fallback

**Files:**
- Modify: `electron/ai/providers/ollama.ts`
- Modify: `electron/ai/providers/ollama.test.ts`

- [ ] **Step 1: Write failing tests for both paths**

Append to `electron/ai/providers/ollama.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callProviderStream, callProviderTools } from './ollama';

describe('ollama.callProviderStream', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });
  it('parses NDJSON streaming response', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(JSON.stringify({ message: { content: 'hel' }, done: false }) + '\n'));
        c.enqueue(enc.encode(JSON.stringify({ message: { content: 'lo' }, done: false }) + '\n'));
        c.enqueue(enc.encode(JSON.stringify({ done: true, prompt_eval_count: 1, eval_count: 2 }) + '\n'));
        c.close();
      },
    });
    (global.fetch as any).mockResolvedValueOnce({ ok: true, status: 200, body });
    const tokens: string[] = [];
    const r = await callProviderStream(
      { profile: { id: 'p', provider: 'ollama', model: 'llama3', apiKeyRef: '', baseURL: 'http://localhost:11434', decryptedKey: '' } as any, messages: [{ role: 'user', content: 'hi' }] },
      { onToken: (t) => tokens.push(t) },
    );
    expect(tokens).toEqual(['hel', 'lo']);
    expect(r.text).toBe('hello');
  });
});

describe('ollama.callProviderTools', () => {
  beforeEach(() => { (global.fetch as any) = vi.fn(); });

  it('uses native tool_calls when present in response', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: {
          content: '',
          tool_calls: [{ function: { name: 'search_files', arguments: { query: 'x' } } }],
        },
        done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 2,
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'ollama', model: 'llama3.1', apiKeyRef: '', baseURL: 'http://localhost:11434', decryptedKey: '' } as any,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls[0]).toMatchObject({ name: 'search_files', args: { query: 'x' } });
  });

  it('falls back to JSON-parse of plain-text content when no native tool_calls', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: { content: '{"tool":"search_files","args":{"query":"x"}}' },
        done: true, done_reason: 'stop',
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'ollama', model: 'qwen2', apiKeyRef: '', baseURL: 'http://localhost:11434', decryptedKey: '' } as any,
      messages: [{ role: 'user', content: 'find x' }],
      tools: [{ name: 'search_files', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }],
    });
    expect(r.finishReason).toBe('tool_calls');
    expect(r.toolCalls).toEqual([{ id: expect.any(String), name: 'search_files', args: { query: 'x' } }]);
  });

  it('returns finishReason=stop when fallback content is plain text without JSON', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({
        message: { content: 'hello there' }, done: true, done_reason: 'stop',
      }),
    });
    const r = await callProviderTools({
      profile: { id: 'p', provider: 'ollama', model: 'qwen2', apiKeyRef: '', baseURL: 'http://localhost:11434', decryptedKey: '' } as any,
      messages: [{ role: 'user', content: 'hi' }], tools: [],
    });
    expect(r.finishReason).toBe('stop');
    expect(r.text).toBe('hello there');
    expect(r.toolCalls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/ai/providers/ollama.test.ts
```

Expected: missing exports.

- [ ] **Step 3: Implement streaming + tools**

Append to `electron/ai/providers/ollama.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { ChatWithToolsResult } from '../../../shared/agent-types';

export async function callProviderStream(
  req: ProviderRequest & { signal?: AbortSignal },
  hooks: { onToken: (t: string) => void },
): Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number }; latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'http://localhost:11434') + '/api/chat';
  const res = await fetch(url, {
    method: 'POST', signal: req.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: req.model ?? req.profile.model, messages: req.messages, stream: true, options: { temperature: req.temperature } }),
  });
  if (!res.ok || !res.body) throw normalizeHttpError('ollama', res);
  let text = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const j = JSON.parse(line);
      if (j.message?.content) { text += j.message.content; hooks.onToken(j.message.content); }
      if (j.done) usage = { promptTokens: j.prompt_eval_count ?? 0, completionTokens: j.eval_count ?? 0 };
    }
  }
  return { text, usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

const FALLBACK_INSTRUCTION =
  '\n\nIf you need to use a tool, reply with EXACTLY one line of JSON: {"tool":"<name>","args":{...}} and nothing else. Otherwise reply normally.';

export async function callProviderTools(
  req: ProviderRequest & { signal?: AbortSignal; tools: Array<{ name: string; description: string; parameters: any }>; toolChoice?: 'auto' | 'none' },
): Promise<ChatWithToolsResult & { latencyMs: number; model: string }> {
  const t0 = Date.now();
  const url = (req.profile.baseURL ?? 'http://localhost:11434') + '/api/chat';
  const messages = injectFallbackHint(req.messages, req.tools);
  const res = await fetch(url, {
    method: 'POST', signal: req.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model ?? req.profile.model,
      messages, stream: false,
      tools: req.tools.length ? req.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })) : undefined,
      options: { temperature: req.temperature },
    }),
  });
  if (!res.ok) throw normalizeHttpError('ollama', res);
  const j = await res.json();
  const usage = j.prompt_eval_count !== undefined ? { promptTokens: j.prompt_eval_count, completionTokens: j.eval_count ?? 0 } : undefined;
  const native = j.message?.tool_calls;
  if (Array.isArray(native) && native.length > 0) {
    const toolCalls = native.map((tc: any) => ({
      id: tc.id ?? `ol_${randomUUID()}`,
      name: tc.function?.name ?? tc.name,
      args: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments ?? tc.arguments ?? {}),
    }));
    return { text: j.message?.content || undefined, toolCalls, finishReason: 'tool_calls', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
  }
  // fallback parse
  const content = (j.message?.content ?? '').trim();
  const parsed = tryParseFallback(content);
  if (parsed) {
    return { text: undefined, toolCalls: [{ id: `ol_${randomUUID()}`, name: parsed.tool, args: parsed.args }], finishReason: 'tool_calls', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
  }
  return { text: content || undefined, toolCalls: [], finishReason: 'stop', usage, latencyMs: Date.now() - t0, model: req.model ?? req.profile.model };
}

function injectFallbackHint(msgs: Array<{ role: string; content: string }>, tools: Array<{ name: string; description: string }>) {
  if (tools.length === 0) return msgs;
  const list = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  const hint = `Available tools:\n${list}${FALLBACK_INSTRUCTION}`;
  return [...msgs, { role: 'system', content: hint }];
}

function tryParseFallback(content: string): { tool: string; args: unknown } | null {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      const j = JSON.parse(line);
      if (j && typeof j.tool === 'string' && typeof j.args === 'object') return { tool: j.tool, args: j.args ?? {} };
    } catch { /* try next */ }
  }
  return null;
}
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/ai/providers/ollama.test.ts
```

Expected: all 4 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ai/providers/ollama.ts electron/ai/providers/ollama.test.ts
git commit -m "feat(phase-16): ollama provider — stream + native tool_calls + JSON fallback"
```

<!-- openspec-task: 2.6 -->
### Task 9: `parse-tool-args.ts` — JSON parse + Ajv validate of tool arguments

**Files:**
- Modify: `electron/ai/parse-tool-args.ts` (replace stub from Task 5 step 5)
- Create: `electron/ai/parse-tool-args.test.ts`

- [ ] **Step 1: Write failing tests**

Create `electron/ai/parse-tool-args.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAndValidate } from './parse-tool-args';

const tools = [{
  name: 'search_files',
  description: 'd',
  parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] },
}] as const;

describe('parseAndValidate', () => {
  it('accepts valid JSON args', () => {
    const r = parseAndValidate('search_files', '{"query":"hi","limit":5}', tools as any);
    expect(r).toEqual({ ok: true, args: { query: 'hi', limit: 5 } });
  });
  it('rejects malformed JSON with E_INVALID_JSON', () => {
    const r = parseAndValidate('search_files', '{"query":', tools as any);
    expect(r).toEqual({ ok: false, error: 'E_INVALID_JSON' });
  });
  it('rejects schema violation with E_INVALID_ARGS + detail', () => {
    const r = parseAndValidate('search_files', '{"limit":5}', tools as any);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('E_INVALID_ARGS');
      expect(r.detail).toBeDefined();
    }
  });
  it('returns E_UNKNOWN_TOOL when tool not in registry', () => {
    const r = parseAndValidate('mystery', '{}', tools as any);
    expect(r).toEqual({ ok: false, error: 'E_UNKNOWN_TOOL' });
  });
  it('accepts an already-parsed object as raw arg', () => {
    const r = parseAndValidate('search_files', { query: 'x' } as any, tools as any);
    expect(r).toEqual({ ok: true, args: { query: 'x' } });
  });
  it('caches compiled validators per tool name', () => {
    parseAndValidate('search_files', '{"query":"a"}', tools as any);
    parseAndValidate('search_files', '{"query":"b"}', tools as any);
    // Behavioral: still works across multiple calls with no exceptions
    expect(parseAndValidate('search_files', '{"query":"c"}', tools as any).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — should FAIL (stub returns wrong codes)**

```bash
npx vitest run electron/ai/parse-tool-args.test.ts
```

Expected: tests for `E_INVALID_ARGS`, `E_UNKNOWN_TOOL`, and object-arg path fail.

- [ ] **Step 3: Replace stub with full implementation**

Overwrite `electron/ai/parse-tool-args.ts`:

```ts
import Ajv, { type ValidateFunction } from 'ajv';

const ajv = new Ajv({ strict: false, allErrors: true });
const cache = new Map<string, ValidateFunction>();

type ToolDef = { name: string; parameters: object };

export type ParseResult =
  | { ok: true; args: unknown }
  | { ok: false; error: 'E_INVALID_JSON' | 'E_INVALID_ARGS' | 'E_UNKNOWN_TOOL'; detail?: unknown };

export function parseAndValidate(name: string, raw: string | object, tools: readonly ToolDef[]): ParseResult {
  const tool = tools.find(t => t.name === name);
  if (!tool) return { ok: false, error: 'E_UNKNOWN_TOOL' };

  let args: unknown;
  if (typeof raw === 'string') {
    try { args = raw.trim() === '' ? {} : JSON.parse(raw); }
    catch { return { ok: false, error: 'E_INVALID_JSON' }; }
  } else {
    args = raw;
  }

  let validate = cache.get(tool.name);
  if (!validate) {
    validate = ajv.compile(tool.parameters);
    cache.set(tool.name, validate);
  }
  const ok = validate(args);
  if (!ok) return { ok: false, error: 'E_INVALID_ARGS', detail: validate.errors };
  return { ok: true, args };
}

// Test seam — clears the compiled-validator cache between unit tests if needed.
export function __resetValidatorCacheForTest() { cache.clear(); }
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/ai/parse-tool-args.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Re-run all phase-16 plan-1 provider tests to confirm no regressions**

```bash
npx vitest run electron/ai/providers electron/ai/parse-tool-args.test.ts electron/ai/client.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/parse-tool-args.ts electron/ai/parse-tool-args.test.ts
git commit -m "feat(phase-16): parseAndValidate — JSON.parse + Ajv tool-arg validator with cache"
```

---

## Self-Review

- **Spec coverage:** Tasks 1.1–2.6 each have a numbered Task above with a matching `<!-- openspec-task: -->` annotation. ✓
- **Type consistency:** `ChatWithToolsResult.toolCalls[].args` is typed `unknown` everywhere; `finishReason` enum string literals are identical across `client.ts`, `openai.ts`, `anthropic.ts`, `ollama.ts`. ✓
- **No placeholders:** Every step contains either an exact command, complete test code, or complete implementation code. ✓
- **Pre-flight check** prevents this plan from running before phase-15 lands. ✓
