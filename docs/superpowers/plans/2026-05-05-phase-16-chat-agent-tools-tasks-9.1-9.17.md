# Phase 16 — Chat Agent + Tools: Plan 4 (Acceptance Tests)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-16-chat-agent-tools`
> **Task range:** OpenSpec tasks `9.1`–`9.17` (17 tasks)
> **Plan order:** 4 of 4. Depends on Plans 1, 2, and 3.
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-16-chat-agent-tools`

---

## Goal

Run 17 black-box acceptance checks at the IPC boundary that prove the chat-agent backend works end-to-end: schema is in place, all 5 tools registered, full search→read→answer flow, approval-gated updates, error/cancel paths, concurrency caps, audit trail, and OpenSpec validation. These tests use a **fake LLM client** (so they don't hit the network) but exercise the real registry, real loop, real approval, real sessions DAO, real IPC handlers, and a real in-memory SQLite DB seeded with the migrations.

## Architecture

- A single helper module **`electron/__acceptance__/phase-16/_harness.ts`** sets up: in-memory DB + migrations, temp grove dir on disk, `dbService` mocked to point at both, a fake `llmClient` whose `chatWithTools` is a programmable `vi.fn()`, a real `createChatHandlers(...)` wired to real `registry`/`approval`/`concurrency`/`sessions`. Each acceptance test imports `setup()` and gets a fresh, isolated rig.
- Tests live under `electron/__acceptance__/phase-16/` — one file per `9.X` task, named `acceptance-9-N-<short-slug>.test.ts`. This co-locates the suite and makes it easy to grep for failing tests.
- The fake `llmClient` is a small queue: each test calls `llm.queue({ ... })` to push the next response. Multi-step flows enqueue several responses in order.
- For `9.14` (Ollama fallback), we don't run a real Ollama; we directly unit-test `providers/ollama.callProviderTools` with a content body containing the documented JSON-line and assert the loop's tool-call extraction (the streaming/native paths are already covered in Plan 1; this acceptance asserts the **end-to-end** path through the loop using the fallback shape).
- For `9.17`, the test runs the OpenSpec CLI as a child process and asserts exit code 0 + that the schema reports no errors.

## Tech Stack

- Plans 1, 2, 3 deliverables.
- `vitest@^2`, `better-sqlite3@^11`, `node:fs`, `node:os` (already deps).
- `child_process.execFileSync` for `openspec validate`.

## Files Touched (this plan)

| Path                                                                                 | Action | Owner task             |
| ------------------------------------------------------------------------------------ | ------ | ---------------------- |
| `electron/__acceptance__/phase-16/_harness.ts`                                       | Create | 9.1 (used by 9.2–9.16) |
| `electron/__acceptance__/phase-16/acceptance-9-1-schema.test.ts`                     | Create | 9.1                    |
| `electron/__acceptance__/phase-16/acceptance-9-2-registry.test.ts`                   | Create | 9.2                    |
| `electron/__acceptance__/phase-16/acceptance-9-3-search-flow.test.ts`                | Create | 9.3                    |
| `electron/__acceptance__/phase-16/acceptance-9-4-update-frontmatter-approve.test.ts` | Create | 9.4                    |
| `electron/__acceptance__/phase-16/acceptance-9-5-missing-reason.test.ts`             | Create | 9.5                    |
| `electron/__acceptance__/phase-16/acceptance-9-6-path-escape.test.ts`                | Create | 9.6                    |
| `electron/__acceptance__/phase-16/acceptance-9-7-reject-approval.test.ts`            | Create | 9.7                    |
| `electron/__acceptance__/phase-16/acceptance-9-8-approval-timeout.test.ts`           | Create | 9.8                    |
| `electron/__acceptance__/phase-16/acceptance-9-9-cancel-stream.test.ts`              | Create | 9.9                    |
| `electron/__acceptance__/phase-16/acceptance-9-10-busy.test.ts`                      | Create | 9.10                   |
| `electron/__acceptance__/phase-16/acceptance-9-11-global-busy.test.ts`               | Create | 9.11                   |
| `electron/__acceptance__/phase-16/acceptance-9-12-invalid-tool-call.test.ts`         | Create | 9.12                   |
| `electron/__acceptance__/phase-16/acceptance-9-13-step-limit.test.ts`                | Create | 9.13                   |
| `electron/__acceptance__/phase-16/acceptance-9-14-ollama-fallback.test.ts`           | Create | 9.14                   |
| `electron/__acceptance__/phase-16/acceptance-9-15-ai-usage-session-id.test.ts`       | Create | 9.15                   |
| `electron/__acceptance__/phase-16/acceptance-9-16-tool-calls-audit.test.ts`          | Create | 9.16                   |
| `electron/__acceptance__/phase-16/acceptance-9-17-openspec-validate.test.ts`         | Create | 9.17                   |

## Pre-flight

- Plans 1, 2, 3 are merged.
- `openspec` CLI is available in `node_modules/.bin` (already a dev dep — confirm with `npx openspec --version`).
- Vitest is configured to pick up `electron/**/*.test.ts` (already configured per phase-1 vitest.config.ts).

---

## Tasks

<!-- openspec-task: 9.1 -->

### Task 1: Schema — `9.1` migrations + `ai_usage.session_id` column exist

**Files:**

- Create: `electron/__acceptance__/phase-16/_harness.ts`
- Create: `electron/__acceptance__/phase-16/acceptance-9-1-schema.test.ts`

- [ ] **Step 1: Build the shared harness**

```ts
// electron/__acceptance__/phase-16/_harness.ts
import { vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runMigrations } from '../../services/db/migrations'
import { createSessions } from '../../agent/sessions'
import { createRegistry } from '../../agent/registry'
import { createApproval } from '../../agent/approval'
import { createConcurrencyGate } from '../../agent/concurrency'
import { bootstrapAgent } from '../../agent/bootstrap'
import { createChatHandlers } from '../../ipc/chat'
import type { ChatWithToolsResult } from '../../../shared/agent-types'

export interface Rig {
  db: Database.Database
  vaultRoot: string
  events: any[]
  llm: {
    chatWithTools: ReturnType<typeof vi.fn>
    queue(r: ChatWithToolsResult & { latencyMs?: number; model?: string; usage?: any }): void
  }
  handlers: ReturnType<typeof createChatHandlers>
  registry: ReturnType<typeof createRegistry>
  approval: ReturnType<typeof createApproval>
  concurrency: ReturnType<typeof createConcurrencyGate>
  sessions: ReturnType<typeof createSessions>
  cleanup(): void
  waitFor(pred: () => boolean, ms?: number): Promise<void>
}

export function setup(opts?: { globalCap?: number }): Rig {
  vi.doMock('../../services/db', () => ({
    dbService: {
      requireCurrent: () => db,
      getCurrent: () => ({ name: vaultRoot })
    }
  }))

  const db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'))
  const vaultRoot = mkdtempSync(join(tmpdir(), 'phase16-acc-'))

  const events: any[] = []
  const queue: any[] = []
  const llm = {
    chatWithTools: vi.fn(async () => {
      const next = queue.shift()
      if (!next) return { text: '(no fixture)', toolCalls: [], finishReason: 'stop' }
      if (typeof next === 'function') return await next()
      return next
    }),
    queue(r: any) {
      queue.push(r)
    }
  }

  const registry = createRegistry()
  bootstrapAgent(registry)
  const approval = createApproval()
  const concurrency = createConcurrencyGate({ globalCap: opts?.globalCap ?? 4 })
  const sessions = createSessions()
  const handlers = createChatHandlers({
    registry,
    approval,
    concurrency,
    sessions,
    getTargets: () =>
      [{ send: (_c: string, e: any) => events.push(e), isDestroyed: () => false }] as any,
    vaultRoot,
    llmClient: llm as any
  })

  return {
    db,
    vaultRoot,
    events,
    llm,
    handlers,
    registry,
    approval,
    concurrency,
    sessions,
    cleanup: () => {
      rmSync(vaultRoot, { recursive: true, force: true })
      db.close()
    },
    waitFor: async (pred, ms = 2000) => {
      const t0 = Date.now()
      while (!pred()) {
        if (Date.now() - t0 > ms) throw new Error('waitFor timeout')
        await new Promise((r) => setTimeout(r, 5))
      }
    }
  }
}
```

- [ ] **Step 2: Write the acceptance test**

```ts
// electron/__acceptance__/phase-16/acceptance-9-1-schema.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.1: migration 009 schema + ai_usage.session_id', () => {
  let rig: Rig
  afterEach(() => rig.cleanup())

  it('user_version is 9 and the three new tables exist', () => {
    rig = setup()
    expect(rig.db.pragma('user_version', { simple: true })).toBe(9)
    const tables = rig.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions','session_messages','tool_calls')"
      )
      .all() as { name: string }[]
    expect(tables.map((t) => t.name).sort()).toEqual(['session_messages', 'sessions', 'tool_calls'])
  })

  it('ai_usage has session_id column', () => {
    rig = setup()
    const cols = rig.db.prepare("PRAGMA table_info('ai_usage')").all() as { name: string }[]
    expect(cols.map((c) => c.name)).toContain('session_id')
  })
})
```

- [ ] **Step 3: Run — should PASS** (Plan 1 already shipped the migration)

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-1-schema.test.ts
```

Expected: all 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/phase-16/_harness.ts electron/__acceptance__/phase-16/acceptance-9-1-schema.test.ts
git commit -m "test(phase-16): acceptance 9.1 — migration 009 schema + ai_usage.session_id"
```

<!-- openspec-task: 9.2 -->

### Task 2: `9.2` Registry contains 5 tools after bootstrap

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-2-registry.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.2: registry has 5 builtin tools after bootstrap', () => {
  let rig: Rig
  afterEach(() => rig.cleanup())

  it('lists exactly 5 tools, each with description and parameters', () => {
    rig = setup()
    const tools = rig.registry.list()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'clip_summary',
      'list_tags',
      'read_file',
      'search_files',
      'update_frontmatter'
    ])
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(0)
      expect((t.parameters as any).type).toBe('object')
    }
  })

  it('exactly one tool declares sideEffect=true (update_frontmatter)', () => {
    rig = setup()
    const sideEffectful = rig.registry
      .list()
      .filter((t) => t.sideEffect)
      .map((t) => t.name)
    expect(sideEffectful).toEqual(['update_frontmatter'])
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-2-registry.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-2-registry.test.ts
git commit -m "test(phase-16): acceptance 9.2 — registry contains 5 builtin tools"
```

<!-- openspec-task: 9.3 -->

### Task 3: `9.3` End-to-end search-and-answer flow

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-3-search-flow.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.3: search → tool → answer flow with full session message log', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    // Seed a single hit in the FTS5 table so search_files returns something.
    rig.db
      .prepare(
        'INSERT INTO files (path, title, content_hash, mtime, size, summary, body) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        'notes/attn.md',
        'Attention',
        'h1',
        '2026-01-01T00:00:00Z',
        100,
        '',
        'Self-attention summary.'
      )
    rig.db
      .prepare(
        'INSERT INTO files_fts(rowid, path, title, body) SELECT rowid, path, title, body FROM files'
      )
      .run()

    // First LLM response: emit a search_files tool call.
    rig.llm.queue({
      toolCalls: [{ id: 'tc1', name: 'search_files', args: { query: 'attention', limit: 5 } }],
      finishReason: 'tool_calls'
    })
    // Second response (after tool result is fed back): final answer.
    rig.llm.queue({
      text: 'Yes — see notes/attn.md (Attention).',
      toolCalls: [],
      finishReason: 'stop'
    })
  })
  afterEach(() => rig.cleanup())

  it('persists user → assistant(tool_call) → tool → assistant in session_messages', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({
      sessionId: sess.id,
      text: 'Search my notes for attention',
      profileId: 'p1'
    })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))

    const all = await rig.handlers['sessions.getMessages'](sess.id)
    const roles = all.map((m) => m.role)
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant'])
    const toolMsg = all.find((m) => m.role === 'tool')!
    expect(JSON.parse(toolMsg.content!)).toMatchObject({
      ok: true,
      data: { items: expect.any(Array) }
    })
    expect(all[all.length - 1].content).toMatch(/notes\/attn\.md/)
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-3-search-flow.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-3-search-flow.test.ts
git commit -m "test(phase-16): acceptance 9.3 — end-to-end search-and-answer flow"
```

<!-- openspec-task: 9.4 -->

### Task 4: `9.4` `update_frontmatter` happy path with approval

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-4-update-frontmatter-approve.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setup, type Rig } from './_harness'

describe('acceptance 9.4: update_frontmatter approval flow', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    writeFileSync(join(rig.vaultRoot, 'notes-a.md'), '---\ntitle: A\nrating: 3\n---\nbody')
    const mtime = statSync(join(rig.vaultRoot, 'notes-a.md')).mtimeMs
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc1',
          name: 'update_frontmatter',
          args: {
            path: 'notes-a.md',
            patch: { rating: 5 },
            reason: 'user requested',
            expectedMtime: mtime
          }
        }
      ],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'Done — rating updated to 5.', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('emits approval-needed, runs after approve, and persists rating=5 to disk', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({
      sessionId: sess.id,
      text: 'set rating to 5',
      profileId: 'p1'
    })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'))
    const ev = rig.events.find((e) => e.type === 'tool.approval-needed')
    await rig.handlers.approveTool(ev.callId)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))

    const txt = readFileSync(join(rig.vaultRoot, 'notes-a.md'), 'utf8')
    expect(txt).toMatch(/rating: 5/)
    const last = (await rig.handlers['sessions.getMessages'](sess.id)).slice(-1)[0]
    expect(last.content).toMatch(/Done/)
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-4-update-frontmatter-approve.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-4-update-frontmatter-approve.test.ts
git commit -m "test(phase-16): acceptance 9.4 — update_frontmatter approve → write → confirm"
```

<!-- openspec-task: 9.5 -->

### Task 5: `9.5` `update_frontmatter` without `reason` → `E_MISSING_REASON` and LLM retry

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-5-missing-reason.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setup, type Rig } from './_harness'

describe('acceptance 9.5: update_frontmatter without reason returns E_MISSING_REASON', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\ntitle: A\n---\nb')
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs
    // Step 1: tool call with NO reason.
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc1',
          name: 'update_frontmatter',
          args: { path: 'a.md', patch: { rating: 5 }, expectedMtime: mtime }
        }
      ],
      finishReason: 'tool_calls'
    })
    // Step 2: tool call WITH reason (LLM "fixes" itself based on the error).
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc2',
          name: 'update_frontmatter',
          args: { path: 'a.md', patch: { rating: 5 }, reason: 'cleanup', expectedMtime: mtime }
        }
      ],
      finishReason: 'tool_calls'
    })
    // Step 3: final answer.
    rig.llm.queue({ text: 'OK done.', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('first tool result is E_MISSING_REASON; second call (with reason) succeeds after approval', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'set rating', profileId: 'p1' })
    // Approve the first call (sideEffect=true triggers approval BEFORE execution; the missing-reason check is inside execute()).
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'))
    await rig.handlers.approveTool(rig.events.find((e) => e.type === 'tool.approval-needed').callId)
    await rig.waitFor(() => rig.events.filter((e) => e.type === 'tool.result').length >= 1)
    const first = rig.events.filter((e) => e.type === 'tool.result')[0]
    expect(first.result).toMatchObject({ ok: false, error: 'E_MISSING_REASON' })

    // Now approve the corrective second call.
    await rig.waitFor(() => rig.events.filter((e) => e.type === 'tool.approval-needed').length >= 2)
    const ev2 = rig.events.filter((e) => e.type === 'tool.approval-needed')[1]
    await rig.handlers.approveTool(ev2.callId)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-5-missing-reason.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-5-missing-reason.test.ts
git commit -m "test(phase-16): acceptance 9.5 — E_MISSING_REASON triggers LLM retry with reason"
```

<!-- openspec-task: 9.6 -->

### Task 6: `9.6` Path escape via `read_file` returns `E_PATH_ESCAPE`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-6-path-escape.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.6: read_file refuses path escape with E_PATH_ESCAPE', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    rig.llm.queue({
      toolCalls: [{ id: 'tc1', name: 'read_file', args: { path: '../../etc/passwd' } }],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'sorry, cannot.', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('emits tool.result with ok:false E_PATH_ESCAPE; LLM gets a clean answer next', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({
      sessionId: sess.id,
      text: 'show me /etc/passwd',
      profileId: 'p1'
    })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))
    const result = rig.events.find((e) => e.type === 'tool.result')
    expect(result.result).toEqual({ ok: false, error: 'E_PATH_ESCAPE' })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-6-path-escape.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-6-path-escape.test.ts
git commit -m "test(phase-16): acceptance 9.6 — read_file path escape returns E_PATH_ESCAPE"
```

<!-- openspec-task: 9.7 -->

### Task 7: `9.7` Rejecting an approval surfaces `E_USER_REJECTED`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-7-reject-approval.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setup, type Rig } from './_harness'

describe('acceptance 9.7: rejecting approval → E_USER_REJECTED, no file change', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb')
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc1',
          name: 'update_frontmatter',
          args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime }
        }
      ],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'OK, will not change it.', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('produces tool result E_USER_REJECTED and leaves the file untouched', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'))
    await rig.handlers.rejectTool(rig.events.find((e) => e.type === 'tool.approval-needed').callId)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))

    const result = rig.events.find((e) => e.type === 'tool.result')
    expect(result.result).toEqual({ ok: false, error: 'E_USER_REJECTED' })
    expect(readFileSync(join(rig.vaultRoot, 'a.md'), 'utf8')).toMatch(/rating: 3/)
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-7-reject-approval.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-7-reject-approval.test.ts
git commit -m "test(phase-16): acceptance 9.7 — reject approval → E_USER_REJECTED, file unchanged"
```

<!-- openspec-task: 9.8 -->

### Task 8: `9.8` 30-minute approval timeout → `E_APPROVAL_TIMEOUT`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-8-approval-timeout.test.ts`

- [ ] **Step 1: Write test (uses fake timers to advance 30 min)**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setup, type Rig } from './_harness'

describe('acceptance 9.8: 30-min approval timeout → E_APPROVAL_TIMEOUT', () => {
  let rig: Rig
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    rig = setup()
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb')
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc1',
          name: 'update_frontmatter',
          args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime }
        }
      ],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'gave up.', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => {
    vi.useRealTimers()
    rig.cleanup()
  })

  it('after 30 min of no-response, tool result is E_APPROVAL_TIMEOUT', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'))
    vi.advanceTimersByTime(30 * 60 * 1000 + 1)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))
    const result = rig.events.find((e) => e.type === 'tool.result')
    expect(result.result).toEqual({ ok: false, error: 'E_APPROVAL_TIMEOUT' })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-8-approval-timeout.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-8-approval-timeout.test.ts
git commit -m "test(phase-16): acceptance 9.8 — 30min timeout → E_APPROVAL_TIMEOUT"
```

<!-- openspec-task: 9.9 -->

### Task 9: `9.9` `cancelStream` ends loop, emits `canceled`, persists prior messages

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-9-cancel-stream.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.9: cancelStream', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    rig.llm.chatWithTools.mockImplementationOnce(async (opts: any) => {
      // Hang until aborted.
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      })
    })
  })
  afterEach(() => rig.cleanup())

  it('emits canceled and keeps the user message in session_messages', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({
      sessionId: sess.id,
      text: 'hello, please think a long time',
      profileId: 'p1'
    })
    await rig.waitFor(() =>
      rig.events.some((e) => e.type === 'message.appended' && e.message.role === 'user')
    )
    await rig.handlers.cancelStream(sess.id)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'canceled'))

    const all = await rig.handlers['sessions.getMessages'](sess.id)
    expect(all[0]).toMatchObject({ role: 'user', content: expect.stringContaining('hello') })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-9-cancel-stream.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-9-cancel-stream.test.ts
git commit -m "test(phase-16): acceptance 9.9 — cancelStream emits canceled, retains user message"
```

<!-- openspec-task: 9.10 -->

### Task 10: `9.10` Same-session second `sendUserMessage` → `E_BUSY`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-10-busy.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.10: per-session busy lock', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    rig.llm.chatWithTools.mockImplementationOnce(async () => new Promise(() => {})) // never resolves
  })
  afterEach(() => rig.cleanup())

  it('second sendUserMessage on same session throws E_BUSY', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'first', profileId: 'p1' })
    await expect(
      rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'second', profileId: 'p1' })
    ).rejects.toMatchObject({ code: 'E_BUSY' })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-10-busy.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-10-busy.test.ts
git commit -m "test(phase-16): acceptance 9.10 — same-session second message → E_BUSY"
```

<!-- openspec-task: 9.11 -->

### Task 11: `9.11` 5th concurrent session → `E_GLOBAL_BUSY`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-11-global-busy.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.11: global concurrency cap of 4', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup({ globalCap: 4 })
    rig.llm.chatWithTools.mockImplementation(async () => new Promise(() => {}))
  })
  afterEach(() => rig.cleanup())

  it('5th concurrent loop is rejected with E_GLOBAL_BUSY', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const s = await rig.handlers['sessions.create']({ profileId: 'p1' })
      ids.push(s.id)
      await rig.handlers.sendUserMessage({ sessionId: s.id, text: `m${i}`, profileId: 'p1' })
    }
    const fifth = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await expect(
      rig.handlers.sendUserMessage({ sessionId: fifth.id, text: 'too many', profileId: 'p1' })
    ).rejects.toMatchObject({ code: 'E_GLOBAL_BUSY' })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-11-global-busy.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-11-global-busy.test.ts
git commit -m "test(phase-16): acceptance 9.11 — 5th concurrent loop → E_GLOBAL_BUSY"
```

<!-- openspec-task: 9.12 -->

### Task 12: `9.12` Invalid tool call (unknown name / malformed args) → loop retries

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-12-invalid-tool-call.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.12: hallucinated tool name → E_UNKNOWN_TOOL fed back, LLM corrects', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    rig.llm.queue({
      toolCalls: [{ id: 'tc1', name: 'mystery_tool', args: {} }],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({
      toolCalls: [{ id: 'tc2', name: 'list_tags', args: {} }],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'sorry, here is what I have', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('first result is E_UNKNOWN_TOOL; loop continues and finishes', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'help', profileId: 'p1' })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))
    const results = rig.events.filter((e) => e.type === 'tool.result')
    expect(results[0].result).toEqual({ ok: false, error: 'E_UNKNOWN_TOOL' })
    expect(results[1].result).toMatchObject({ ok: true, data: { items: expect.any(Array) } })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-12-invalid-tool-call.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-12-invalid-tool-call.test.ts
git commit -m "test(phase-16): acceptance 9.12 — unknown tool name surfaces E_UNKNOWN_TOOL and loop recovers"
```

<!-- openspec-task: 9.13 -->

### Task 13: `9.13` Step limit at 8 → `E_STEP_LIMIT`

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-13-step-limit.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.13: step limit', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    // The LLM relentlessly calls list_tags (which is sideEffect=false → no approval).
    rig.llm.chatWithTools.mockImplementation(async () => ({
      toolCalls: [{ id: 'tc' + Math.random(), name: 'list_tags', args: {} }],
      finishReason: 'tool_calls'
    }))
  })
  afterEach(() => rig.cleanup())

  it('emits error E_STEP_LIMIT after 8 LLM calls', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go forever', profileId: 'p1' })
    await rig.waitFor(
      () => rig.events.some((e) => e.type === 'error' && e.error === 'E_STEP_LIMIT'),
      5000
    )
    expect(rig.llm.chatWithTools).toHaveBeenCalledTimes(8)
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-13-step-limit.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-13-step-limit.test.ts
git commit -m "test(phase-16): acceptance 9.13 — step limit at 8 emits E_STEP_LIMIT"
```

<!-- openspec-task: 9.14 -->

### Task 14: `9.14` Ollama fallback path: plain-text JSON line → tool call

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-14-ollama-fallback.test.ts`

- [ ] **Step 1: Write test (mocks `fetch` to return Ollama-shaped response without native `tool_calls`)**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../../services/db/migrations'

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn(), getCurrent: vi.fn(() => ({ name: '/v' })) }
}))
import { dbService } from '../../services/db'
import { callProviderTools } from '../../ai/providers/ollama'

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  ;(global as any).fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      message: { content: '{"tool":"clip_summary","args":{"clipId":"c1"}}' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 1,
      eval_count: 5
    })
  }))
})
afterEach(() => {
  db.close()
})

describe('acceptance 9.14: Ollama plain-text JSON line is recognized as a tool call', () => {
  it('returns finishReason=tool_calls + parsed tool name + args', async () => {
    const r = await callProviderTools({
      profile: {
        id: 'p',
        provider: 'ollama',
        model: 'qwen2',
        apiKeyRef: '',
        baseURL: 'http://localhost:11434',
        decryptedKey: ''
      } as any,
      messages: [{ role: 'user', content: 'summarize clip c1' }],
      tools: [
        {
          name: 'clip_summary',
          description: 'd',
          parameters: {
            type: 'object',
            properties: { clipId: { type: 'string' } },
            required: ['clipId']
          }
        }
      ]
    })
    expect(r.finishReason).toBe('tool_calls')
    expect(r.toolCalls).toEqual([
      { id: expect.any(String), name: 'clip_summary', args: { clipId: 'c1' } }
    ])
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-14-ollama-fallback.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-14-ollama-fallback.test.ts
git commit -m "test(phase-16): acceptance 9.14 — Ollama plain-text JSON fallback parses tool call"
```

<!-- openspec-task: 9.15 -->

### Task 15: `9.15` `ai_usage.session_id` populated from chat-agent loop

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-15-ai-usage-session-id.test.ts`
- Modify: `electron/agent/loop.ts` (call `usage.insert` with `sessionId` after a successful LLM call)

- [ ] **Step 1: Add `usage.insert` from the loop**

In `electron/agent/loop.ts`, after a successful `llmClient.chatWithTools(...)` returns, log usage:

```ts
import { insert as insertAiUsage } from '../ai/usage'
// ...
// After `r = await deps.llmClient.chatWithTools(...)` and `if (cancel.aborted) ...`:
if (r.usage) {
  try {
    insertAiUsage({
      profileId,
      model: r.model ?? 'unknown',
      promptTokens: r.usage.promptTokens ?? 0,
      completionTokens: r.usage.completionTokens ?? 0,
      latencyMs: r.latencyMs ?? 0,
      ok: r.finishReason !== 'error',
      sessionId
    })
  } catch {
    /* logging best-effort */
  }
}
```

(`profileId` is in scope because it's a parameter of `runAgent`.)

- [ ] **Step 2: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setup, type Rig } from './_harness'

describe('acceptance 9.15: ai_usage.session_id populated', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    rig.llm.queue({
      text: 'hi',
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 3 },
      latencyMs: 12,
      model: 'gpt-x'
    })
  })
  afterEach(() => rig.cleanup())

  it('a row in ai_usage carries the session id', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'hi', profileId: 'p1' })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))
    const row: any = rig.db
      .prepare('SELECT session_id, profile_id, prompt_tokens, completion_tokens FROM ai_usage')
      .get()
    expect(row).toMatchObject({
      session_id: sess.id,
      profile_id: 'p1',
      prompt_tokens: 5,
      completion_tokens: 3
    })
  })
})
```

- [ ] **Step 3: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-15-ai-usage-session-id.test.ts electron/agent/loop.test.ts
```

(Confirm Plan-2 loop tests still pass.)

- [ ] **Step 4: Commit**

```bash
git add electron/agent/loop.ts electron/__acceptance__/phase-16/acceptance-9-15-ai-usage-session-id.test.ts
git commit -m "feat+test(phase-16): record ai_usage.session_id from agent loop; acceptance 9.15"
```

<!-- openspec-task: 9.16 -->

### Task 16: `9.16` `tool_calls` table records every call (args / result / timestamps / approved)

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-16-tool-calls-audit.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { setup, type Rig } from './_harness'

describe('acceptance 9.16: tool_calls audit trail', () => {
  let rig: Rig
  beforeEach(() => {
    rig = setup()
    writeFileSync(join(rig.vaultRoot, 'a.md'), '---\nrating: 3\n---\nb')
    const mtime = statSync(join(rig.vaultRoot, 'a.md')).mtimeMs

    // 1. read-only tool call (list_tags)
    rig.llm.queue({
      toolCalls: [{ id: 'tc1', name: 'list_tags', args: {} }],
      finishReason: 'tool_calls'
    })
    // 2. side-effect tool call (update_frontmatter)
    rig.llm.queue({
      toolCalls: [
        {
          id: 'tc2',
          name: 'update_frontmatter',
          args: { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: mtime }
        }
      ],
      finishReason: 'tool_calls'
    })
    rig.llm.queue({ text: 'done', toolCalls: [], finishReason: 'stop' })
  })
  afterEach(() => rig.cleanup())

  it('persists args/result/started_at/finished_at/approved per call', async () => {
    const sess = await rig.handlers['sessions.create']({ profileId: 'p1' })
    await rig.handlers.sendUserMessage({ sessionId: sess.id, text: 'go', profileId: 'p1' })
    await rig.waitFor(() => rig.events.some((e) => e.type === 'tool.approval-needed'))
    await rig.handlers.approveTool(rig.events.find((e) => e.type === 'tool.approval-needed').callId)
    await rig.waitFor(() => rig.events.some((e) => e.type === 'done'))

    const rows = rig.db
      .prepare(
        'SELECT tool_name, args_json, result_json, approved, started_at, finished_at FROM tool_calls WHERE session_id = ? ORDER BY started_at'
      )
      .all(sess.id) as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ tool_name: 'list_tags', approved: null })
    expect(JSON.parse(rows[0].result_json)).toMatchObject({ ok: true })
    expect(rows[0].started_at).toBeTruthy()
    expect(rows[0].finished_at).toBeTruthy()

    expect(rows[1]).toMatchObject({ tool_name: 'update_frontmatter', approved: 1 })
    expect(JSON.parse(rows[1].args_json)).toMatchObject({ path: 'a.md', patch: { rating: 5 } })
    expect(JSON.parse(rows[1].result_json)).toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-16-tool-calls-audit.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-16-tool-calls-audit.test.ts
git commit -m "test(phase-16): acceptance 9.16 — tool_calls audit trail (args/result/timestamps/approved)"
```

<!-- openspec-task: 9.17 -->

### Task 17: `9.17` `openspec validate phase-16-chat-agent-tools --strict` passes

**Files:**

- Create: `electron/__acceptance__/phase-16/acceptance-9-17-openspec-validate.test.ts`

- [ ] **Step 1: Write test (shells out to the OpenSpec CLI)**

```ts
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

describe('acceptance 9.17: openspec validate --strict', () => {
  it('exits 0 with no error output', () => {
    const out = execFileSync(
      'npx',
      ['openspec', 'validate', 'phase-16-chat-agent-tools', '--strict'],
      {
        cwd: __dirname.split('/electron/__acceptance__')[0] || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8'
      }
    )
    expect(out).toMatch(/(valid|passed|ok)/i)
  })
})
```

- [ ] **Step 2: Run — should PASS**

```bash
npx vitest run electron/__acceptance__/phase-16/acceptance-9-17-openspec-validate.test.ts
```

If validation fails, read the CLI output and fix any spec / proposal / task issues in `openspec/changes/phase-16-chat-agent-tools/`. Iterate until clean.

- [ ] **Step 3: Run the entire phase-16 acceptance suite as a final smoke test**

```bash
npx vitest run electron/__acceptance__/phase-16
```

Expected: all 17 tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/phase-16/acceptance-9-17-openspec-validate.test.ts
git commit -m "test(phase-16): acceptance 9.17 — openspec validate --strict passes"
```

---

## Self-Review

- **Spec coverage:** 17 OpenSpec tasks (9.1–9.17) → 17 plan tasks above with annotations. ✓
- **Single shared harness** (`_harness.ts`) keeps the 16 IPC-level acceptance tests DRY without coupling them; each test still has its own `setup()` call. ✓
- **Type consistency:** the harness re-exports types from `shared/agent-types.ts`; tests use the same `AgentEvent` discriminator strings as Plans 1–3. ✓
- **No placeholders:** every step contains either runnable test code or runnable shell commands. The single piece of plan-introduced code (Task 15's `usage.insert` call from `loop.ts`) is shown in full. ✓
- **OpenSpec validation** runs as the final acceptance check, ensuring the change artifacts stay coherent with the implementation. ✓
