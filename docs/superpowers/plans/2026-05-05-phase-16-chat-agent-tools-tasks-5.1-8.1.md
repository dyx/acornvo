# Phase 16 — Chat Agent + Tools: Plan 3 (Sessions, IPC, Streaming, i18n)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-16-chat-agent-tools`
> **Task range:** OpenSpec tasks `5.1`–`8.1` (8 tasks)
> **Plan order:** 3 of 4. Depends on Plans 1 & 2. Followed by Plan 4 (`tasks-9.1-9.17`).
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-16-chat-agent-tools`

---

## Goal

Persist sessions to SQLite, expose the chat-agent over IPC with per-session locks + a global ≤4 concurrency cap, stream `AgentEvent`s to the renderer over a session-specific channel, hook the `cancelStream` AbortController end-to-end (loop + `fetch`), thread the new `session_id` column into `ai_usage` writes, and ship the `chat.*` i18n keys (en-US + zh-CN with parity test).

## Architecture

- **`sessions.ts` is a thin DAO** over `dbService.requireCurrent()`. It owns `INSERT`/`SELECT` for `sessions`, `session_messages`, and `tool_calls` and is the only module that translates between the in-memory `SessionMessage` shape and the on-disk row shape (`tool_calls_json` for assistant tool calls, `tool_call_id` for tool messages).
- **Auto-title:** when `appendMessage` writes the first `role: 'user'` message of a session whose `title` is `NULL`, it back-fills `title` with the trimmed first 40 graphemes of `content`.
- **`ai_usage.session_id` plumbing** is two-line: phase-15's existing `usage.insert(...)` call site (in the reviewer IPC) gets `session_id: null`; phase-16's loop call site (Task 6.1) passes the active sessionId. Add the column to the existing `usage.insert` signature with a default of `null` for backwards compat.
- **`electron/ipc/chat.ts`** exports `chatHandlers` matching a new `chat` namespace on `IpcContract`. `sendUserMessage` is a _fire-and-forget_ IPC: it kicks off `runAgent` on a worker promise, returns `{ ok: true }` immediately, and the renderer subscribes via the streaming channel for events. `approveTool` / `rejectTool` are simple proxies onto `approvalGate`.
- **Per-session lock + global cap** (`electron/agent/concurrency.ts`): a `Set<sessionId>` of in-flight loops + a global counter (max 4). `tryAcquire(sessionId)` returns `'busy'` if the same sessionId is in flight, `'global-busy'` if the global cap is hit, or `'ok'` otherwise. The lock is released in a `finally` block in `sendUserMessage`'s worker, so even `runAgent` errors release it.
- **Stream channel naming**: `chat:stream:<sessionId>`. Renderer registers via `chat.subscribeStream(sessionId)` (which is just a no-op IPC for symmetry / future authorization checks). Each `AgentEvent` is shipped via `webContents.send('chat:stream:<sid>', event)`. Multiple renderer windows are supported by broadcasting to every active `BrowserWindow` (Plan 3 Task 7.1).
- **AbortController plumbing**: a `Map<sessionId, AbortController>` lives in `electron/ipc/chat.ts`. `sendUserMessage` creates one and passes its `signal` into `runAgent` (which itself forwards it into `llmClient.chatWithTools` → `fetch`). `cancelStream(sessionId)` aborts that controller; the loop catches `AbortError` and emits `{ type: 'canceled' }`.
- **i18n** introduces a single new top-level key `chat` in `src/i18n/locales/{en-US,zh-CN}.json`. A new test `src/i18n/chat-keys.test.ts` enforces 1:1 parity (mirrors `library-keys.test.ts`).

## Tech Stack

- Plans 1 & 2 deliverables.
- Phase 13: `dbService.requireCurrent()`, `IpcContract`, `IpcError`, `registerHandlers`.
- Phase 1 router: `electron/ipc/router.ts`, `electron/ipc/handlers.ts`.
- Phase 1 preload: `preload/preload.ts`, `preload/preload.test.ts`.
- Phase 13 i18n harness: `src/i18n/index.ts`, `src/i18n/locales/{en-US,zh-CN}.json`.

## Files Touched (this plan)

| Path                                  | Action                                                        | Owner task    |
| ------------------------------------- | ------------------------------------------------------------- | ------------- |
| `electron/agent/sessions.ts`          | Create                                                        | 5.1           |
| `electron/agent/sessions.test.ts`     | Create                                                        | 5.1           |
| `electron/ai/usage.ts`                | Modify (add `sessionId` param to `insert`)                    | 5.2           |
| `electron/ai/usage.test.ts`           | Modify                                                        | 5.2           |
| `electron/ai/reviewer.ts`             | Modify (call sites pass `null`)                               | 5.2           |
| `electron/agent/concurrency.ts`       | Create                                                        | 6.2           |
| `electron/agent/concurrency.test.ts`  | Create                                                        | 6.2           |
| `electron/ipc/chat.ts`                | Create                                                        | 6.1, 6.2, 7.2 |
| `electron/ipc/chat.test.ts`           | Create                                                        | 6.1, 6.2, 7.2 |
| `electron/agent/streamWriter.ts`      | Create                                                        | 7.1           |
| `electron/agent/streamWriter.test.ts` | Create                                                        | 7.1           |
| `electron/ipc/handlers.ts`            | Modify (register `chatHandlers`)                              | 6.1           |
| `shared/ipc-contract.ts`              | Modify (add `chat` namespace + `chat:stream:*` event channel) | 6.1, 7.1      |
| `preload/preload.ts`                  | Modify (`window.api.chat.*` + `onChatStream`)                 | 6.3           |
| `preload/preload.test.ts`             | Modify                                                        | 6.3           |
| `src/i18n/locales/en-US.json`         | Modify (add `chat.*`)                                         | 8.1           |
| `src/i18n/locales/zh-CN.json`         | Modify (add `chat.*`)                                         | 8.1           |
| `src/i18n/chat-keys.test.ts`          | Create                                                        | 8.1           |

## Pre-flight

- Plans 1 + 2 are merged: `chatWithTools`, `agent/registry`, `agent/approval`, `agent/loop`, all 5 builtin tools, and `agent/bootstrap` are on the branch.
- `electron/ai/reviewer.ts` (phase-15) calls `usage.insert` exactly once. Confirm via `grep -n "usage.insert" electron/ai/`.
- The grove's vault root is reachable via `dbService.getCurrent()?.name` returning the absolute path. If the helper exists under a different name (e.g., `groveStore.getRoot()`), substitute as appropriate.

---

## Tasks

<!-- openspec-task: 5.1 -->

### Task 1: `electron/agent/sessions.ts` — DAO + auto-title

**Files:**

- Create: `electron/agent/sessions.ts`
- Create: `electron/agent/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/sessions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
import { dbService } from '../services/db'
import { createSessions } from './sessions'

let db: Database.Database
let s: ReturnType<typeof createSessions>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  s = createSessions()
})

describe('sessions DAO', () => {
  it('createSession + list', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const b = await s.createSession({ profileId: 'p1' })
    const list = await s.list()
    expect(list.map((x) => x.id).sort()).toEqual([a.id, b.id].sort())
    expect(list[0].updatedAt >= list[1].updatedAt).toBe(true)
  })

  it('rename updates title and updatedAt', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await new Promise((r) => setTimeout(r, 5))
    await s.rename(a.id, 'My Chat')
    const fetched = (await s.list()).find((x) => x.id === a.id)
    expect(fetched?.title).toBe('My Chat')
  })

  it('delete cascades to messages + tool_calls', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, { role: 'user', content: 'hi' })
    await s.recordToolCall(
      a.id,
      { id: 'tc1', name: 'search_files', args: {} },
      { sideEffect: false }
    )
    await s.delete(a.id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM session_messages').get()).toEqual({ n: 0 })
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM tool_calls WHERE session_id = ?').get(a.id)
    ).toEqual({ n: 0 })
  })

  it('appendMessage auto-titles with first user message (≤40 chars, trimmed)', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, {
      role: 'user',
      content: '  Hello, please help me find that note about attention mechanisms in transformers.'
    })
    const got = (await s.list()).find((x) => x.id === a.id)
    expect(got?.title?.length).toBeLessThanOrEqual(40)
    expect(got?.title?.trim()).toBe(got?.title)
    expect(got?.title).toContain('Hello')
  })

  it('appendMessage stores tool_calls_json for assistant role', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const m = await s.appendMessage(a.id, {
      role: 'assistant',
      content: '...',
      toolCalls: [{ id: 'tc1', name: 'x', args: { a: 1 } }]
    })
    const all = await s.getMessages(a.id)
    const found = all.find((x) => x.id === m.id)
    expect(found?.toolCalls).toEqual([{ id: 'tc1', name: 'x', args: { a: 1 } }])
  })

  it('appendMessage stores tool_call_id for role=tool', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    await s.appendMessage(a.id, { role: 'tool', content: '{}', toolCallId: 'tc1' })
    const [m] = await s.getMessages(a.id)
    expect(m.role).toBe('tool')
    expect(m.toolCallId).toBe('tc1')
  })

  it('recordToolCall + finishToolCall round-trip', async () => {
    const a = await s.createSession({ profileId: 'p1' })
    const rowId = await s.recordToolCall(
      a.id,
      { id: 'tc1', name: 'update_frontmatter', args: { x: 1 } },
      { sideEffect: true }
    )
    await s.finishToolCall(rowId, { result: { ok: true, data: { wrote: true } }, approved: true })
    const row: any = db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(rowId)
    expect(row.approved).toBe(1)
    expect(JSON.parse(row.result_json)).toEqual({ ok: true, data: { wrote: true } })
    expect(row.finished_at).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/sessions.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/sessions.ts
import { randomUUID } from 'node:crypto'
import type { Session, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types'
import { dbService } from '../services/db'

const TITLE_LIMIT = 40

export interface SessionsDao {
  createSession(opts: { profileId: string | null; title?: string | null }): Promise<Session>
  list(): Promise<Session[]>
  delete(id: string): Promise<void>
  rename(id: string, title: string): Promise<void>
  getMessages(id: string): Promise<SessionMessage[]>
  appendMessage(
    sessionId: string,
    m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
  ): Promise<SessionMessage>
  recordToolCall(
    sessionId: string,
    tc: ToolCall,
    opts: { sideEffect: boolean; messageId?: number }
  ): Promise<string>
  finishToolCall(
    rowId: string,
    fields: { result?: ToolResult; approved?: boolean | null; error?: string }
  ): Promise<void>
}

export function createSessions(): SessionsDao {
  function db() {
    return dbService.requireCurrent()
  }
  function nowIso() {
    return new Date().toISOString()
  }

  return {
    async createSession({ profileId, title = null }) {
      const id = randomUUID()
      const t = nowIso()
      db()
        .prepare(
          'INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        )
        .run(id, title, profileId ?? null, t, t)
      return { id, title, profileId, createdAt: t, updatedAt: t }
    },

    async list() {
      const rows = db()
        .prepare(
          'SELECT id, title, profile_id, created_at, updated_at FROM sessions ORDER BY updated_at DESC'
        )
        .all() as any[]
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        profileId: r.profile_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    },

    async delete(id) {
      const tx = db().transaction((sid: string) => {
        db().prepare('DELETE FROM tool_calls WHERE session_id = ?').run(sid)
        db().prepare('DELETE FROM sessions WHERE id = ?').run(sid)
      })
      tx(id)
    },

    async rename(id, title) {
      db()
        .prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
        .run(title, nowIso(), id)
    },

    async getMessages(sessionId) {
      const rows = db()
        .prepare(
          'SELECT id, session_id, role, content, tool_calls_json, tool_call_id, created_at FROM session_messages WHERE session_id = ? ORDER BY id ASC'
        )
        .all(sessionId) as any[]
      return rows.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        role: r.role,
        content: r.content,
        toolCalls: r.tool_calls_json ? JSON.parse(r.tool_calls_json) : undefined,
        toolCallId: r.tool_call_id ?? undefined,
        createdAt: r.created_at
      }))
    },

    async appendMessage(sessionId, m) {
      const t = nowIso()
      const tx = db().transaction(() => {
        const info = db()
          .prepare(
            'INSERT INTO session_messages (session_id, role, content, tool_calls_json, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            sessionId,
            m.role,
            m.content ?? null,
            m.toolCalls ? JSON.stringify(m.toolCalls) : null,
            m.toolCallId ?? null,
            t
          )
        db().prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(t, sessionId)
        if (m.role === 'user') {
          const cur = db().prepare('SELECT title FROM sessions WHERE id = ?').get(sessionId) as
            | { title: string | null }
            | undefined
          if (cur && (cur.title === null || cur.title === '')) {
            const title = (m.content ?? '').trim().slice(0, TITLE_LIMIT) || null
            if (title)
              db().prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId)
          }
        }
        return info.lastInsertRowid
      })
      const id = Number(tx())
      return {
        id,
        sessionId,
        role: m.role,
        content: m.content ?? null,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCallId,
        createdAt: t
      }
    },

    async recordToolCall(sessionId, tc, opts) {
      const id = randomUUID()
      const t = nowIso()
      db()
        .prepare(
          'INSERT INTO tool_calls (id, session_id, message_id, tool_name, args_json, approved, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          id,
          sessionId,
          opts.messageId ?? null,
          tc.name,
          JSON.stringify(tc.args ?? {}),
          opts.sideEffect ? null : null,
          t
        )
      return id
    },

    async finishToolCall(rowId, fields) {
      const t = nowIso()
      db()
        .prepare(
          'UPDATE tool_calls SET result_json = ?, approved = ?, finished_at = ?, error = ? WHERE id = ?'
        )
        .run(
          fields.result === undefined ? null : JSON.stringify(fields.result),
          fields.approved === undefined ? null : fields.approved ? 1 : 0,
          t,
          fields.error ?? null,
          rowId
        )
    }
  }
}

export const sessions = createSessions()
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/sessions.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/sessions.ts electron/agent/sessions.test.ts
git commit -m "feat(phase-16): sessions DAO — CRUD + appendMessage + auto-title + tool_calls round-trip"
```

<!-- openspec-task: 5.2 -->

### Task 2: `ai_usage.session_id` plumbing

**Files:**

- Modify: `electron/ai/usage.ts`
- Modify: `electron/ai/usage.test.ts`
- Modify: `electron/ai/reviewer.ts` (1 call site)

- [ ] **Step 1: Locate phase-15 `usage.insert` signature and call site**

```bash
grep -n "usage.insert\|export function insert\|sessionId" electron/ai/usage.ts electron/ai/reviewer.ts
```

Confirm `insert` currently takes `{ jobId, profileId, model, promptTokens, completionTokens, latencyMs, ok, error? }` and that `reviewer.ts` calls it without a `sessionId` field.

- [ ] **Step 2: Add a failing test**

Append to `electron/ai/usage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'
import { dbService } from '../services/db'
import { vi } from 'vitest'
import { insert } from './usage'

vi.mock('../services/db', async () => ({ dbService: { requireCurrent: vi.fn() } }))

describe('ai_usage.session_id column', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, resolve(__dirname, '../services/db/migrations'))
    ;(dbService.requireCurrent as any).mockReturnValue(db)
  })

  it('persists sessionId when provided', () => {
    insert({
      profileId: 'p1',
      model: 'gpt-x',
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 10,
      ok: true,
      sessionId: 'sess1'
    })
    const row: any = db.prepare('SELECT session_id FROM ai_usage').get()
    expect(row.session_id).toBe('sess1')
  })

  it('persists null when omitted (back-compat with phase-15 callers)', () => {
    insert({
      profileId: 'p1',
      model: 'gpt-x',
      promptTokens: 1,
      completionTokens: 1,
      latencyMs: 10,
      ok: true
    })
    const row: any = db.prepare('SELECT session_id FROM ai_usage').get()
    expect(row.session_id).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests — should FAIL (insert ignores sessionId)**

```bash
npx vitest run electron/ai/usage.test.ts
```

Expected: 1st test fails (`session_id` is null even when supplied).

- [ ] **Step 4: Update `usage.ts`**

In `electron/ai/usage.ts`, locate the `insert` function. Add `sessionId?: string | null` to its options type and to the `INSERT` statement:

```ts
export function insert(opts: {
  jobId?: string
  profileId: string
  model: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
  ok: boolean
  error?: string
  sessionId?: string | null
}): void {
  const db = dbService.requireCurrent()
  db.prepare(
    'INSERT INTO ai_usage (job_id, profile_id, model, prompt_tokens, completion_tokens, latency_ms, ok, error, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    opts.jobId ?? null,
    opts.profileId,
    opts.model,
    opts.promptTokens,
    opts.completionTokens,
    opts.latencyMs,
    opts.ok ? 1 : 0,
    opts.error ?? null,
    opts.sessionId ?? null,
    new Date().toISOString()
  )
}
```

(Keep all other exports unchanged. The phase-15 reviewer call site does **not** need to be edited because `sessionId` is optional.)

- [ ] **Step 5: Run tests — should PASS; phase-15 tests still pass**

```bash
npx vitest run electron/ai/usage.test.ts electron/ai/reviewer.test.ts
```

Expected: green.

- [ ] **Step 6: Commit**

```bash
git add electron/ai/usage.ts electron/ai/usage.test.ts
git commit -m "feat(phase-16): ai_usage.insert accepts optional sessionId for chat-agent attribution"
```

<!-- openspec-task: 6.2 -->

### Task 3: `electron/agent/concurrency.ts` — per-session lock + global cap

**Files:**

- Create: `electron/agent/concurrency.ts`
- Create: `electron/agent/concurrency.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/concurrency.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createConcurrencyGate } from './concurrency'

describe('concurrencyGate', () => {
  let g: ReturnType<typeof createConcurrencyGate>
  beforeEach(() => {
    g = createConcurrencyGate({ globalCap: 4 })
  })

  it('first acquire returns ok', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
  })

  it('same session twice returns busy', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    expect(g.tryAcquire('s1')).toBe('busy')
  })

  it('beyond cap returns global-busy', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    expect(g.tryAcquire('s2')).toBe('ok')
    expect(g.tryAcquire('s3')).toBe('ok')
    expect(g.tryAcquire('s4')).toBe('ok')
    expect(g.tryAcquire('s5')).toBe('global-busy')
  })

  it('release frees the slot', () => {
    expect(g.tryAcquire('s1')).toBe('ok')
    g.release('s1')
    expect(g.tryAcquire('s1')).toBe('ok')
  })

  it('release of unknown session is a no-op', () => {
    expect(() => g.release('nope')).not.toThrow()
  })

  it('snapshot reports active count and ids', () => {
    g.tryAcquire('s1')
    g.tryAcquire('s2')
    expect(g.snapshot()).toEqual({ active: 2, sessions: ['s1', 's2'].sort(), globalCap: 4 })
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/concurrency.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/concurrency.ts
export interface ConcurrencyGate {
  tryAcquire(sessionId: string): 'ok' | 'busy' | 'global-busy'
  release(sessionId: string): void
  snapshot(): { active: number; sessions: string[]; globalCap: number }
}

export function createConcurrencyGate(opts: { globalCap?: number } = {}): ConcurrencyGate {
  const globalCap = opts.globalCap ?? 4
  const active = new Set<string>()
  return {
    tryAcquire(sessionId) {
      if (active.has(sessionId)) return 'busy'
      if (active.size >= globalCap) return 'global-busy'
      active.add(sessionId)
      return 'ok'
    },
    release(sessionId) {
      active.delete(sessionId)
    },
    snapshot() {
      return { active: active.size, sessions: [...active].sort(), globalCap }
    }
  }
}

export const concurrencyGate = createConcurrencyGate()
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/concurrency.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/concurrency.ts electron/agent/concurrency.test.ts
git commit -m "feat(phase-16): concurrencyGate — per-session lock + global cap (default 4)"
```

<!-- openspec-task: 7.1 -->

### Task 4: `electron/agent/streamWriter.ts` — broadcast `AgentEvent`s on `chat:stream:<sid>`

**Files:**

- Create: `electron/agent/streamWriter.ts`
- Create: `electron/agent/streamWriter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/agent/streamWriter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStreamWriter } from './streamWriter'

describe('streamWriter', () => {
  it('broadcasts AgentEvent to every supplied webContents on the session-specific channel', () => {
    const w1 = { send: vi.fn(), isDestroyed: () => false }
    const w2 = { send: vi.fn(), isDestroyed: () => false }
    const dead = { send: vi.fn(), isDestroyed: () => true }
    const writer = createStreamWriter('s1', () => [w1, w2, dead] as any)
    writer.write({ type: 'token', text: 'hi' })
    expect(w1.send).toHaveBeenCalledWith('chat:stream:s1', { type: 'token', text: 'hi' })
    expect(w2.send).toHaveBeenCalledWith('chat:stream:s1', { type: 'token', text: 'hi' })
    expect(dead.send).not.toHaveBeenCalled()
  })

  it('returns the channel name for testability', () => {
    const writer = createStreamWriter('s2', () => [] as any)
    expect(writer.channel).toBe('chat:stream:s2')
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/agent/streamWriter.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/streamWriter.ts
import type { AgentEvent } from '../../shared/agent-types'

export interface RendererTarget {
  send(channel: string, payload: unknown): void
  isDestroyed(): boolean
}

export interface StreamWriter {
  readonly channel: string
  write(e: AgentEvent): void
}

export function createStreamWriter(
  sessionId: string,
  getTargets: () => RendererTarget[]
): StreamWriter {
  const channel = `chat:stream:${sessionId}`
  return {
    channel,
    write(e) {
      for (const w of getTargets()) {
        if (w.isDestroyed()) continue
        w.send(channel, e)
      }
    }
  }
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/streamWriter.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/streamWriter.ts electron/agent/streamWriter.test.ts
git commit -m "feat(phase-16): streamWriter — per-session broadcast channel for AgentEvents"
```

<!-- openspec-task: 6.1 -->

### Task 5: `electron/ipc/chat.ts` — IPC namespace + register handlers

**Files:**

- Create: `electron/ipc/chat.ts`
- Create: `electron/ipc/chat.test.ts`
- Modify: `electron/ipc/handlers.ts`
- Modify: `shared/ipc-contract.ts` (add `chat` namespace)

- [ ] **Step 1: Add `chat` namespace to the IPC contract**

In `shared/ipc-contract.ts`, append a new namespace stanza next to existing ones:

```ts
export interface ChatHandlers {
  'sessions.list': () => Promise<Session[]>
  'sessions.create': (opts: { profileId: string | null; title?: string | null }) => Promise<Session>
  'sessions.delete': (id: string) => Promise<{ ok: true }>
  'sessions.rename': (id: string, title: string) => Promise<{ ok: true }>
  'sessions.getMessages': (id: string) => Promise<SessionMessage[]>
  sendUserMessage: (opts: {
    sessionId: string
    text: string
    profileId?: string
  }) => Promise<{ ok: true }>
  cancelStream: (sessionId: string) => Promise<{ ok: true }>
  approveTool: (callId: string, opts?: { editedArgs?: unknown }) => Promise<{ ok: true }>
  rejectTool: (callId: string) => Promise<{ ok: true }>
  subscribeStream: (sessionId: string) => Promise<{ ok: true; channel: string }>
}

// Update IpcContract to include `chat: ChatHandlers`
// and IpcEventContract to include `chat:stream:<id>` (typed as `${string}` since the id is dynamic).
```

Import `Session` and `SessionMessage` from `./agent-types`. If the existing contract uses a different style (e.g. methods inside a single object literal), match the existing pattern and inject the same eight methods.

- [ ] **Step 2: Write failing IPC tests**

```ts
// electron/ipc/chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/vault' })) }
}))
vi.mock('../ai/client', () => ({ llmClient: { chatWithTools: vi.fn() } }))

import { dbService } from '../services/db'
import { llmClient } from '../ai/client'
import { createChatHandlers } from './chat'
import { createApproval } from '../agent/approval'
import { createRegistry } from '../agent/registry'
import { createConcurrencyGate } from '../agent/concurrency'
import { createSessions } from '../agent/sessions'
import { bootstrapAgent } from '../agent/bootstrap'

let db: Database.Database
let handlers: ReturnType<typeof createChatHandlers>
let captured: any[]

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  ;(llmClient.chatWithTools as any).mockReset()

  captured = []
  const registry = createRegistry()
  bootstrapAgent(registry)
  const approval = createApproval()
  const gate = createConcurrencyGate({ globalCap: 4 })
  const sessionsDao = createSessions()
  handlers = createChatHandlers({
    registry,
    approval,
    concurrency: gate,
    sessions: sessionsDao,
    getTargets: () =>
      [{ send: (_c: string, e: any) => captured.push(e), isDestroyed: () => false }] as any,
    vaultRoot: '/vault',
    llmClient: llmClient as any
  })
})

describe('chat IPC', () => {
  it('sessions.create + sessions.list round-trip', async () => {
    const a = await handlers['sessions.create']({ profileId: 'p1' })
    const list = await handlers['sessions.list']()
    expect(list.find((x) => x.id === a.id)).toBeDefined()
  })

  it('sendUserMessage on missing session throws E_NOT_FOUND', async () => {
    await expect(
      handlers.sendUserMessage({ sessionId: 'nope', text: 'hi', profileId: 'p1' })
    ).rejects.toThrow(/E_NOT_FOUND/)
  })

  it('sendUserMessage starts a loop and emits done event on the stream channel', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' })
    ;(llmClient.chatWithTools as any).mockResolvedValueOnce({
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop'
    })
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' })
    await waitFor(() => captured.some((e) => e.type === 'done'))
    expect(captured.some((e) => e.type === 'message.appended')).toBe(true)
  })

  it('sendUserMessage twice in same session → second throws E_BUSY', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' })
    ;(llmClient.chatWithTools as any).mockImplementationOnce(() => new Promise(() => {})) // never resolves
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' })
    await expect(
      handlers.sendUserMessage({ sessionId: sess.id, text: 'again', profileId: 'p1' })
    ).rejects.toThrow(/E_BUSY/)
  })

  it('cancelStream aborts and emits canceled', async () => {
    const sess = await handlers['sessions.create']({ profileId: 'p1' })
    ;(llmClient.chatWithTools as any).mockImplementationOnce(async (opts: any) => {
      await new Promise((res, rej) =>
        opts.signal.addEventListener('abort', () =>
          rej(Object.assign(new Error('abort'), { name: 'AbortError' }))
        )
      )
      return { toolCalls: [], finishReason: 'stop' }
    })
    await handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' })
    await new Promise((r) => setTimeout(r, 5))
    await handlers.cancelStream(sess.id)
    await waitFor(() => captured.some((e) => e.type === 'canceled'))
  })

  it('subscribeStream returns the documented channel name', async () => {
    const r = await handlers.subscribeStream('abc')
    expect(r).toEqual({ ok: true, channel: 'chat:stream:abc' })
  })
})

async function waitFor(pred: () => boolean, ms = 1000) {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout')
    await new Promise((r) => setTimeout(r, 5))
  }
}
```

- [ ] **Step 3: Run tests — should FAIL**

```bash
npx vitest run electron/ipc/chat.test.ts
```

Expected: import error.

- [ ] **Step 4: Implement `chat.ts`**

```ts
// electron/ipc/chat.ts
import type { Registry } from '../agent/registry'
import type { ApprovalGate } from '../agent/approval'
import type { ConcurrencyGate } from '../agent/concurrency'
import type { SessionsDao } from '../agent/sessions'
import type { RendererTarget } from '../agent/streamWriter'
import { createStreamWriter } from '../agent/streamWriter'
import { runAgent } from '../agent/loop'
import { chatAgentSystemPrompt } from '../ai/prompts/chat-agent'
import { IpcError } from '../../shared/ipc-contract'

export interface ChatDeps {
  registry: Registry
  approval: ApprovalGate
  concurrency: ConcurrencyGate
  sessions: SessionsDao
  getTargets: () => RendererTarget[]
  vaultRoot: string
  llmClient: { chatWithTools: (opts: any) => Promise<any> }
}

export function createChatHandlers(deps: ChatDeps) {
  const aborts = new Map<string, AbortController>()

  return {
    'sessions.list': () => deps.sessions.list(),
    'sessions.create': (opts: { profileId: string | null; title?: string | null }) =>
      deps.sessions.createSession(opts),
    'sessions.delete': async (id: string) => {
      await deps.sessions.delete(id)
      deps.approval.cancelSession(id)
      return { ok: true } as const
    },
    'sessions.rename': async (id: string, title: string) => {
      await deps.sessions.rename(id, title)
      return { ok: true } as const
    },
    'sessions.getMessages': (id: string) => deps.sessions.getMessages(id),

    sendUserMessage: async (opts: { sessionId: string; text: string; profileId?: string }) => {
      const list = await deps.sessions.list()
      const sess = list.find((s) => s.id === opts.sessionId)
      if (!sess) throw new IpcError('E_NOT_FOUND', 'session not found')
      const profileId = opts.profileId ?? sess.profileId ?? undefined
      if (!profileId) throw new IpcError('E_MISSING_PROFILE', 'no profile bound to session')

      const ack = deps.concurrency.tryAcquire(opts.sessionId)
      if (ack === 'busy') throw new IpcError('E_BUSY', 'a loop is already running for this session')
      if (ack === 'global-busy')
        throw new IpcError('E_GLOBAL_BUSY', 'too many concurrent agent loops')

      const ctl = new AbortController()
      aborts.set(opts.sessionId, ctl)
      const writer = createStreamWriter(opts.sessionId, deps.getTargets)
      const history = await deps.sessions.getMessages(opts.sessionId)

      // Fire-and-forget — renderer subscribes for events.
      void runAgent({
        sessionId: opts.sessionId,
        userText: opts.text,
        profileId,
        history,
        deps: {
          llmClient: deps.llmClient,
          sessions: deps.sessions,
          registry: deps.registry,
          approval: deps.approval,
          systemPrompt: () =>
            chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot), locale: 'zh' }),
          vaultRoot: deps.vaultRoot,
          cancel: ctl.signal
        },
        streamWriter: writer
      })
        .catch((err: any) => {
          writer.write({
            type: 'error',
            error: err?.code ?? 'E_AGENT_FAILURE',
            detail: err?.message
          })
        })
        .finally(() => {
          aborts.delete(opts.sessionId)
          deps.concurrency.release(opts.sessionId)
        })

      return { ok: true } as const
    },

    cancelStream: async (sessionId: string) => {
      const ctl = aborts.get(sessionId)
      if (ctl) ctl.abort()
      deps.approval.cancelSession(sessionId)
      return { ok: true } as const
    },

    approveTool: async (callId: string, opts?: { editedArgs?: unknown }) => {
      deps.approval.approve(callId, opts?.editedArgs)
      return { ok: true } as const
    },
    rejectTool: async (callId: string) => {
      deps.approval.reject(callId)
      return { ok: true } as const
    },
    subscribeStream: async (sessionId: string) => ({
      ok: true as const,
      channel: `chat:stream:${sessionId}`
    })
  }
}

function basenameOf(p: string) {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}
```

- [ ] **Step 5: Wire into `electron/ipc/handlers.ts`**

Read `electron/ipc/handlers.ts` and add a new export entry alongside the existing handler maps:

```ts
import { createChatHandlers } from './chat'
import { registry } from '../agent/registry'
import { approvalGate } from '../agent/approval'
import { concurrencyGate } from '../agent/concurrency'
import { sessions } from '../agent/sessions'
import { llmClient } from '../ai/client'
import { BrowserWindow } from 'electron'
import { dbService } from '../services/db'

const chatHandlers = createChatHandlers({
  registry,
  approval: approvalGate,
  concurrency: concurrencyGate,
  sessions,
  getTargets: () => BrowserWindow.getAllWindows().map((w) => w.webContents),
  vaultRoot: dbService.getCurrent()?.name ?? '',
  llmClient
})

// Add `chat: chatHandlers` to the existing handlers map.
export const ipcHandlers = {
  // existing namespaces…
  chat: chatHandlers
}
```

(If the existing handlers file uses a flat `chat.sessions.list` style, expand the chat handlers to that shape; the test file targets the methods directly so it's resilient to both shapes.)

- [ ] **Step 6: Run tests — should PASS**

```bash
npx vitest run electron/ipc/chat.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/chat.ts electron/ipc/chat.test.ts electron/ipc/handlers.ts shared/ipc-contract.ts
git commit -m "feat(phase-16): chat IPC namespace — sessions CRUD, sendUserMessage, cancel, approve/reject"
```

<!-- openspec-task: 7.2 -->

### Task 6: Abort chain end-to-end (loop + provider fetch)

**Files:**

- Modify: `electron/ai/providers/openai.ts`, `anthropic.ts`, `ollama.ts` (already accept `signal`; verify it's forwarded into `fetch` for the streaming path)
- Modify: `electron/ipc/chat.test.ts` (add stronger abort assertion)

- [ ] **Step 1: Add a regression test asserting fetch receives the signal**

Append to `electron/ai/providers/openai.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { callProviderTools } from './openai'

describe('openai signal propagation', () => {
  it('forwards req.signal to fetch options', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'x' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 }
      })
    }))
    ;(global as any).fetch = fetchSpy
    const ctl = new AbortController()
    await callProviderTools({
      profile: {
        id: 'p',
        provider: 'openai',
        model: 'gpt-x',
        apiKeyRef: 'k',
        decryptedKey: 'sk'
      } as any,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      signal: ctl.signal
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][1].signal).toBe(ctl.signal)
  })
})
```

- [ ] **Step 2: Run test — should PASS already** (Plan 1 already wires `signal: req.signal`)

```bash
npx vitest run electron/ai/providers/openai.test.ts
```

If it fails, edit `callProviderTools` and `callProviderStream` in each provider so the `fetch(...)` call includes `signal: req.signal`.

- [ ] **Step 3: Verify the abort path through `chat.cancelStream`**

The `chat.test.ts` `cancelStream` test from Task 5 already exercises this; just re-run:

```bash
npx vitest run electron/ipc/chat.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/ai/providers/openai.test.ts
git commit -m "test(phase-16): assert AbortSignal flows from chat.cancelStream → loop → fetch"
```

<!-- openspec-task: 6.3 -->

### Task 7: Preload bindings — `window.api.chat.*` + `onChatStream`

**Files:**

- Modify: `preload/preload.ts`
- Modify: `preload/preload.test.ts`

- [ ] **Step 1: Write failing test**

Append to `preload/preload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ipcRenderer = { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_n: string, v: any) => {
      ;(globalThis as any).__exposed = v
    }
  },
  ipcRenderer
}))

beforeEach(async () => {
  vi.resetModules()
  await import('./preload')
})

describe('preload window.api.chat', () => {
  it('exposes sessions/get/create/delete/rename/getMessages + sendUserMessage + approveTool', () => {
    const api = (globalThis as any).__exposed as any
    expect(typeof api.chat.sessions.list).toBe('function')
    expect(typeof api.chat.sessions.create).toBe('function')
    expect(typeof api.chat.sessions.delete).toBe('function')
    expect(typeof api.chat.sessions.rename).toBe('function')
    expect(typeof api.chat.sessions.getMessages).toBe('function')
    expect(typeof api.chat.sendUserMessage).toBe('function')
    expect(typeof api.chat.cancelStream).toBe('function')
    expect(typeof api.chat.approveTool).toBe('function')
    expect(typeof api.chat.rejectTool).toBe('function')
    expect(typeof api.chat.onStream).toBe('function')
  })

  it('onStream registers per-session listener and returns unsubscribe', () => {
    const api = (globalThis as any).__exposed as any
    const cb = vi.fn()
    const off = api.chat.onStream('sess-1', cb)
    expect(ipcRenderer.on).toHaveBeenCalled()
    const channel = ipcRenderer.on.mock.calls[0][0]
    expect(channel).toBe('chat:stream:sess-1')
    off()
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, expect.any(Function))
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run preload/preload.test.ts
```

Expected: `api.chat is undefined`.

- [ ] **Step 3: Add `chat` to the exposed API**

In `preload/preload.ts`, append to the `api` object literal (next to existing namespaces):

```ts
chat: {
  sessions: {
    list: () => invoke('chat.sessions.list'),
    create: (opts: { profileId: string | null; title?: string | null }) => invoke('chat.sessions.create', opts),
    delete: (id: string) => invoke('chat.sessions.delete', id),
    rename: (id: string, title: string) => invoke('chat.sessions.rename', id, title),
    getMessages: (id: string) => invoke('chat.sessions.getMessages', id),
  },
  sendUserMessage: (opts: { sessionId: string; text: string; profileId?: string }) => invoke('chat.sendUserMessage', opts),
  cancelStream: (sessionId: string) => invoke('chat.cancelStream', sessionId),
  approveTool: (callId: string, opts?: { editedArgs?: unknown }) => invoke('chat.approveTool', callId, opts),
  rejectTool: (callId: string) => invoke('chat.rejectTool', callId),
  onStream: (sessionId: string, cb: (e: import('../shared/agent-types').AgentEvent) => void) => {
    const channel = `chat:stream:${sessionId}`;
    const listener = (_evt: any, payload: any) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
},
```

(If the existing IPC handler routing flattens namespaced channels into `chat.sessions.list` etc., the `invoke()` strings already match. If routing is `chat:sessions:list` style, swap `.` for `:` consistently.)

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run preload/preload.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add preload/preload.ts preload/preload.test.ts
git commit -m "feat(phase-16): preload window.api.chat.* + onStream subscriber"
```

<!-- openspec-task: 8.1 -->

### Task 8: i18n — `chat.*` keys (en-US + zh-CN + parity test)

**Files:**

- Modify: `src/i18n/locales/en-US.json`
- Modify: `src/i18n/locales/zh-CN.json`
- Create: `src/i18n/chat-keys.test.ts`

- [ ] **Step 1: Write failing parity test**

```ts
// src/i18n/chat-keys.test.ts
import { describe, it, expect } from 'vitest'
import en from './locales/en-US.json'
import zh from './locales/zh-CN.json'

function flatten(obj: any, prefix = ''): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatten(v, key))
    else out.push(key)
  }
  return out
}

describe('chat.* i18n key parity', () => {
  it('chat namespace exists in both locales', () => {
    expect((en as any).chat).toBeDefined()
    expect((zh as any).chat).toBeDefined()
  })

  it('en-US and zh-CN contain identical chat.* key sets', () => {
    const enKeys = flatten((en as any).chat).sort()
    const zhKeys = flatten((zh as any).chat).sort()
    expect(zhKeys).toEqual(enKeys)
  })

  it('contains the documented core keys', () => {
    const enKeys = flatten((en as any).chat)
    const required = [
      'approval.title',
      'approval.reason',
      'approval.args',
      'approval.approve',
      'approval.cancel',
      'approval.edit',
      'tool.search_files',
      'tool.read_file',
      'tool.list_tags',
      'tool.update_frontmatter',
      'tool.clip_summary',
      'error.step_limit',
      'error.missing_profile',
      'error.busy',
      'error.global_busy',
      'error.user_rejected',
      'error.approval_timeout',
      'error.path_escape',
      'error.missing_reason'
    ]
    for (const k of required) expect(enKeys).toContain(k)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run src/i18n/chat-keys.test.ts
```

Expected: `chat` undefined.

- [ ] **Step 3: Add `chat` to `src/i18n/locales/en-US.json`** (insert as a new top-level key; keep existing keys untouched)

```json
"chat": {
  "approval": {
    "title": "Approve tool call",
    "reason": "Reason",
    "args": "Arguments",
    "approve": "Approve",
    "cancel": "Cancel",
    "edit": "Edit arguments"
  },
  "tool": {
    "search_files": "Search files",
    "read_file": "Read file",
    "list_tags": "List tags",
    "update_frontmatter": "Update frontmatter",
    "clip_summary": "Summarize clip"
  },
  "error": {
    "step_limit": "Reached the 8-step thinking limit.",
    "missing_profile": "No AI profile is bound to this session.",
    "busy": "This conversation is already running.",
    "global_busy": "Too many chats are running. Please cancel one and try again.",
    "user_rejected": "You cancelled this tool call.",
    "approval_timeout": "Approval timed out after 30 minutes.",
    "path_escape": "The path leaves the grove and cannot be accessed.",
    "missing_reason": "A reason is required for this change."
  }
}
```

- [ ] **Step 4: Add the same key set to `src/i18n/locales/zh-CN.json`** with translations:

```json
"chat": {
  "approval": {
    "title": "批准工具调用",
    "reason": "原因",
    "args": "参数",
    "approve": "同意",
    "cancel": "取消",
    "edit": "编辑参数"
  },
  "tool": {
    "search_files": "搜索文件",
    "read_file": "读取文件",
    "list_tags": "列出标签",
    "update_frontmatter": "更新 frontmatter",
    "clip_summary": "总结剪藏"
  },
  "error": {
    "step_limit": "已达 8 步思考上限。",
    "missing_profile": "本会话尚未绑定 AI Profile。",
    "busy": "本会话已在运行。",
    "global_busy": "并发会话已满,请先取消其它会话。",
    "user_rejected": "你取消了这次工具调用。",
    "approval_timeout": "审批超时(30 分钟)。",
    "path_escape": "路径越出树林范围,无法访问。",
    "missing_reason": "本次修改必须提供原因。"
  }
}
```

- [ ] **Step 5: Run tests — should PASS**

```bash
npx vitest run src/i18n/chat-keys.test.ts src/i18n/library-keys.test.ts src/i18n/settings-keys.test.ts
```

Expected: green; existing key-parity tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/locales/en-US.json src/i18n/locales/zh-CN.json src/i18n/chat-keys.test.ts
git commit -m "feat(phase-16): i18n chat.* keys (en-US + zh-CN) with parity test"
```

---

## Self-Review

- **Spec coverage:** 8 OpenSpec tasks (5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 7.2, 8.1) → 8 plan tasks above with annotations. ✓
- **Task ordering:** sessions DAO (Task 1) precedes IPC (Task 5), concurrency gate (Task 3) precedes IPC, streamWriter (Task 4) precedes IPC. ✓
- **Type consistency:** `Session` and `SessionMessage` come from `shared/agent-types.ts` everywhere. The IPC contract additions reference those same types. `AgentEvent` flows from main → preload → renderer unchanged. ✓
- **Abort chain** is verified twice: a unit test for `fetch.signal` propagation in providers + the integration test in `chat.test.ts` that aborts mid-flight. ✓
- **i18n parity** test mirrors phase-13's existing `library-keys.test.ts` pattern. ✓
