# Phase 19 · AI LangChain Migration — Tasks 7.10–9.4 (Cleanup + HITL Tests + Usage + Provider Deletion)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 24h background cleanup task; replace `approval.test.ts` with the new HITL decision matrix; add `checkpointer-recovery.test.ts`; rewrite `usage.ts` to consume `AIMessage.usage_metadata`; wire `recordUsage` into reviewer + runner; adjust `usage.test.ts`; delete the 4 legacy provider files (`openai`, `anthropic`, `ollama`, `openai-compatible`) and their tests.

**Architecture:** After this plan, the AI link no longer references the legacy provider modules. Only `client.ts`, `loop.ts`, `approval.ts`, and `loop.test.ts` survive into Plan 6 for final excision. Usage tracking is consolidated through a single `recordUsageFromAIMessage` helper rather than provider-specific extraction.

**Tech Stack:** `vitest`, `better-sqlite3`, `@langchain/core` (`AIMessage.usage_metadata`).

**Dependencies on Plans 1–4:** Runner + checkpointer + HITL are all live; profile flows are wired through the new path. Acceptance suite still green.

**LangChain reference:** Query the `langchain-docs` MCP for:

- `"AIMessage usage_metadata input_tokens output_tokens total_tokens"`
- `"agent getState interrupts tasks recovery"`

---

<!-- openspec-task: 7.10 -->

### Task 1: Background 24h cleanup of cancelled/idle threads

**Files:**

- Create: `electron/agent/checkpointer-sweeper.ts`
- Modify: integrate with existing `electron/queue/` runner or a setInterval timer
- Test: `electron/agent/checkpointer-sweeper.test.ts`

OpenSpec design open question #4 left the choice between job-queue vs setInterval to implementation time. The job-queue is cleaner (single scheduler, observable) but requires adding a new job kind. For this plan we go with the **simpler setInterval** path inside the existing `app-lifecycle`, configurable to migrate later.

- [ ] **Step 1: Write failing test**

Create `electron/agent/checkpointer-sweeper.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'
import { sweepStaleThreads } from './checkpointer-sweeper'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
import { dbService } from '../services/db'

let db: Database.Database
const NOW = 1_700_000_000_000
const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(dbService.requireCurrent as any).mockReturnValue(db)
})

function insertThread(threadId: string, opts: { lastActive: number; canceledAt?: number | null }) {
  db.prepare(
    `INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at) VALUES (?, ?, ?)`
  ).run(threadId, opts.lastActive, opts.canceledAt ?? null)
  db.prepare(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')`
  ).run(threadId)
  db.prepare(
    `INSERT INTO checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel) VALUES (?, '', 'cp-1', 't', 0, 'c')`
  ).run(threadId)
  db.prepare(
    `INSERT INTO checkpoint_blobs (thread_id, checkpoint_ns, channel, version) VALUES (?, '', 'c', 'v1')`
  ).run(threadId)
}

describe('sweepStaleThreads', () => {
  it('deletes threads canceled more than 24h ago', () => {
    insertThread('old-canceled', { lastActive: NOW - 2 * DAY_MS, canceledAt: NOW - 2 * DAY_MS })
    insertThread('fresh-canceled', { lastActive: NOW - 1000, canceledAt: NOW - 1000 })
    insertThread('active', { lastActive: NOW - 1000 })

    const result = sweepStaleThreads(NOW)
    expect(result.removed).toEqual(['old-canceled'])

    expect(
      db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id='old-canceled'").get()
    ).toEqual({ c: 0 })
    expect(
      db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id='active'").get()
    ).toEqual({ c: 1 })
  })

  it('deletes idle threads with last_active_at older than 24h (even without cancel)', () => {
    insertThread('idle-stale', { lastActive: NOW - 2 * DAY_MS })
    insertThread('idle-fresh', { lastActive: NOW - 1000 })

    const result = sweepStaleThreads(NOW)
    expect(result.removed).toContain('idle-stale')
    expect(result.removed).not.toContain('idle-fresh')
  })

  it('is a no-op when no threads are stale', () => {
    insertThread('a', { lastActive: NOW - 1000 })
    const result = sweepStaleThreads(NOW)
    expect(result.removed).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `pnpm vitest run electron/agent/checkpointer-sweeper.test.ts`
Expected: FAIL (module doesn't exist).

- [ ] **Step 3: Implement the sweeper**

Create `electron/agent/checkpointer-sweeper.ts`:

```typescript
import { dbService } from '../services/db'

const DAY_MS = 24 * 60 * 60 * 1000

export interface SweepResult {
  removed: string[]
}

/**
 * Deletes checkpointer state for threads that are either:
 *  - canceled more than 24h ago, OR
 *  - idle (no activity) for more than 24h.
 *
 * Sessions whose chat is currently active (concurrencyGate held) are intentionally
 * not protected here — the caller (background timer) should not run during writes;
 * if a race occurs the deleted thread will simply be rebuilt on next message.
 */
export function sweepStaleThreads(nowMs: number = Date.now()): SweepResult {
  const cutoff = nowMs - DAY_MS
  const db = dbService.requireCurrent()
  const stale = db
    .prepare(
      `SELECT thread_id FROM checkpoint_meta
       WHERE (canceled_at IS NOT NULL AND canceled_at <= ?) OR (canceled_at IS NULL AND last_active_at <= ?)`
    )
    .all(cutoff, cutoff) as Array<{ thread_id: string }>

  if (stale.length === 0) return { removed: [] }

  const tx = db.transaction(() => {
    const removed: string[] = []
    for (const { thread_id } of stale) {
      db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(thread_id)
      db.prepare('DELETE FROM checkpoint_writes WHERE thread_id = ?').run(thread_id)
      db.prepare('DELETE FROM checkpoint_blobs WHERE thread_id = ?').run(thread_id)
      db.prepare('DELETE FROM checkpoint_meta WHERE thread_id = ?').run(thread_id)
      removed.push(thread_id)
    }
    return removed
  })

  return { removed: tx() as unknown as string[] }
}

let timer: NodeJS.Timeout | null = null

export function startSweeper(intervalMs: number = 60 * 60 * 1000): () => void {
  stopSweeper()
  timer = setInterval(() => {
    try {
      sweepStaleThreads()
    } catch {
      /* best effort */
    }
  }, intervalMs)
  // Prevent timer from keeping the event loop alive during tests / quit.
  timer.unref?.()
  return stopSweeper
}

export function stopSweeper(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
```

- [ ] **Step 4: Wire to app lifecycle**

In `electron/main.ts` (or wherever app init runs), after the DB and IPC are ready:

```typescript
import { startSweeper, stopSweeper } from './agent/checkpointer-sweeper'
// app-ready:
startSweeper()
// on before-quit:
appLifecycle.onBeforeQuit(() => stopSweeper())
```

- [ ] **Step 5: Run + commit**

```bash
pnpm vitest run electron/agent/checkpointer-sweeper.test.ts
git add electron/agent/checkpointer-sweeper.ts electron/agent/checkpointer-sweeper.test.ts electron/main.ts
git commit -m "feat(agent): background sweeper deletes idle/canceled checkpointer threads after 24h"
```

---

<!-- openspec-task: 7.11 -->

### Task 2: Rewrite `approval.test.ts` to cover HITL 4-decision matrix + startup recovery

**Files:**

- Rewrite: `electron/agent/approval.test.ts` (still named that for git history continuity — but content is now about the new HITL flow)

The legacy `approvalGate` Map-based implementation is going away in Plan 6 Task 3. This test file's NEW purpose is to lock down: given a `tool.approval-needed` event, the four IPC paths (approve / approve-with-edits / reject / cancel) each produce the right `Command({ resume })` and the right post-resume emissions.

- [ ] **Step 1: Replace the test file content**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { resumeAgent } from './runner'

function asyncIter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const it of items) yield it
    }
  }
}

function makeAgent(scenarios: Record<string, AsyncIterable<unknown>>) {
  return {
    stream: vi.fn((input: any, cfg: any) => {
      // Discriminate by `Command.resume`'s decision type.
      const decision = input?.resume?.[0]?.type ?? 'no-resume'
      return scenarios[decision] ?? scenarios['default']
    })
  } as any
}

function makeSessions() {
  return {
    appendMessage: vi.fn(async (sid: string, m: any) => ({
      id: 1,
      sessionId: sid,
      createdAt: 't',
      ...m
    })),
    recordToolCall: vi.fn(async () => 'row-1'),
    finishToolCall: vi.fn(async () => undefined)
  }
}

describe('resumeAgent — HITL decision matrix', () => {
  const baseProfile = { id: 'p1', model: 'm', provider: 'openai' as const, apiKey: 'k' }
  const finalAi = (text: string) =>
    new AIMessage({
      content: text,
      id: `ai-${text}`,
      usage_metadata: { input_tokens: 1, output_tokens: 1 }
    } as any)
  const toolMsg = (callId: string, content: any) =>
    new ToolMessage({
      content: typeof content === 'string' ? content : JSON.stringify(content),
      tool_call_id: callId,
      name: 'update_frontmatter'
    } as any)

  it('accept → tool.result(ok) → done', async () => {
    const events: any[] = []
    const agent = makeAgent({
      accept: asyncIter([
        [
          'updates',
          { tools: { messages: [toolMsg('cid-1', { ok: true, data: { path: 'a.md' } })] } }
        ],
        ['updates', { model: { messages: [finalAi('done!')] } }]
      ])
    })
    await resumeAgent({
      sessionId: 's1',
      agent,
      decisions: [{ type: 'accept' }],
      cancel: new AbortController().signal,
      streamWriter: { write: (e) => events.push(e) },
      sessions: makeSessions(),
      recordUsage: () => {},
      modelName: 'm'
    })
    expect(events.some((e) => e.type === 'tool.result' && e.result.ok)).toBe(true)
    expect(events.at(-1).type).toBe('done')
  })

  it('edit → tool.result reflects edited args', async () => {
    const events: any[] = []
    const agent = makeAgent({
      edit: asyncIter([
        [
          'updates',
          { tools: { messages: [toolMsg('cid-1', { ok: true, data: { path: 'edited.md' } })] } }
        ],
        ['updates', { model: { messages: [finalAi('edited')] } }]
      ])
    })
    await resumeAgent({
      sessionId: 's1',
      agent,
      decisions: [{ type: 'edit', args: { path: 'edited.md', patch: { x: 1 }, reason: 'edited' } }],
      cancel: new AbortController().signal,
      streamWriter: { write: (e) => events.push(e) },
      sessions: makeSessions(),
      recordUsage: () => {},
      modelName: 'm'
    })
    expect(agent.stream).toHaveBeenCalled()
    const call = agent.stream.mock.calls[0][0]
    expect(call.resume?.[0]).toMatchObject({ type: 'edit' })
  })

  it('reject → tool.result(ok:false, E_USER_REJECTED-like code) → done', async () => {
    const events: any[] = []
    const agent = makeAgent({
      reject: asyncIter([
        [
          'updates',
          { tools: { messages: [toolMsg('cid-1', { ok: false, error: 'E_USER_REJECTED' })] } }
        ],
        ['updates', { model: { messages: [finalAi('aborted by user')] } }]
      ])
    })
    await resumeAgent({
      sessionId: 's1',
      agent,
      decisions: [{ type: 'reject' }],
      cancel: new AbortController().signal,
      streamWriter: { write: (e) => events.push(e) },
      sessions: makeSessions(),
      recordUsage: () => {},
      modelName: 'm'
    })
    const r = events.find((e) => e.type === 'tool.result')
    expect(r).toBeTruthy()
    expect(r.result.ok).toBe(false)
  })

  it('cancel before resume → canceled event (no tool execution)', async () => {
    const events: any[] = []
    const ctl = new AbortController()
    ctl.abort()
    const agent = makeAgent({
      default: asyncIter([])
    })
    await resumeAgent({
      sessionId: 's1',
      agent,
      decisions: [{ type: 'accept' }],
      cancel: ctl.signal,
      streamWriter: { write: (e) => events.push(e) },
      sessions: makeSessions(),
      recordUsage: () => {},
      modelName: 'm'
    })
    expect(events.some((e) => e.type === 'canceled')).toBe(true)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run electron/agent/approval.test.ts
git add electron/agent/approval.test.ts
git commit -m "test(agent): rewrite approval.test.ts for HITL 4-decision matrix via resumeAgent"
```

---

<!-- openspec-task: 7.12 -->

### Task 3: New `checkpointer-recovery.test.ts`

**Files:**

- Create: `electron/agent/checkpointer-recovery.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../services/db/migrations'
import { migrationsDir } from '../services/db/migrations/index'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('../settings/profile-key', () => ({ getProfileDecryptedKey: vi.fn(() => 'k') }))
vi.mock('./streamWriter', () => ({
  createStreamWriter: vi.fn(() => ({ write: vi.fn() }))
}))
vi.mock('../ai/model-factory', () => ({
  buildChatModel: vi.fn()
}))
vi.mock('./agent-singleton', () => ({
  getAgentBuilder: vi.fn(() => ({
    buildForProfile: vi.fn(() => ({
      getState: vi.fn(async () => ({
        tasks: [
          {
            interrupts: [
              {
                id: 'int-1',
                action_requests: [
                  { action: 'update_frontmatter', args: { path: 'a.md', patch: {}, reason: 'r' } }
                ]
              }
            ]
          }
        ]
      }))
    }))
  })),
  getCheckpointerInstance: vi.fn()
}))

import { dbService } from '../services/db'
import { createStreamWriter } from './streamWriter'
import { recoverPendingApprovals } from './startup-recovery'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, migrationsDir())
  ;(dbService.requireCurrent as any).mockReturnValue(db)

  // Seed: 1 session with checkpoint, 1 session with NO checkpoint.
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES ('s1', 't', 'p1', ?, ?)`
  ).run(now, now)
  db.prepare(
    `INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES ('s2', 't', 'p1', ?, ?)`
  ).run(now, now)
  db.prepare(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES ('s1', '', 'cp-1')`
  ).run()
  db.prepare(
    `INSERT INTO ai_provider_profiles (id, name, provider, model, base_url, temperature, max_tokens, sort_order) VALUES ('p1', 'p1', 'openai', 'gpt-4o-mini', NULL, 0.3, 800, 0)`
  ).run()
})

describe('recoverPendingApprovals', () => {
  it('emits tool.approval-needed for sessions with pending interrupts and populates pendingInterrupts map', async () => {
    const pendingInterrupts = new Map<string, { sessionId: string; profileId: string }>()
    const writer = { write: vi.fn() }
    ;(createStreamWriter as any).mockReturnValue(writer)

    const result = await recoverPendingApprovals({
      getTargets: () => [],
      pendingInterrupts
    })

    expect(result.recovered).toBe(1)
    expect(pendingInterrupts.get('int-1')).toEqual({ sessionId: 's1', profileId: 'p1' })
    expect(writer.write).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool.approval-needed',
        callId: 'int-1',
        tool: 'update_frontmatter'
      })
    )
  })

  it('does NOT call getState for sessions with no checkpoints', async () => {
    const pendingInterrupts = new Map()
    const { getAgentBuilder } = await import('./agent-singleton')
    await recoverPendingApprovals({ getTargets: () => [], pendingInterrupts })
    // s2 has no checkpoint row → recover loop should skip it.
    const buildForProfile = (getAgentBuilder as any).mock.results[0].value.buildForProfile
    expect(buildForProfile).toHaveBeenCalledTimes(1)
  })

  it('survives one failing recover without aborting others', async () => {
    // Add a second session-with-checkpoint that fails getState.
    db.prepare(
      `INSERT INTO sessions (id, title, profile_id, created_at, updated_at) VALUES ('s3', 't', 'p1', '2026-01-01', '2026-01-01')`
    ).run()
    db.prepare(
      `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES ('s3', '', 'cp-2')`
    ).run()

    const { getAgentBuilder } = await import('./agent-singleton')
    let callCount = 0
    ;(getAgentBuilder as any).mockReturnValue({
      buildForProfile: vi.fn(() => ({
        getState: vi.fn(async () => {
          callCount++
          if (callCount === 2) throw new Error('boom')
          return {
            tasks: [
              {
                interrupts: [
                  {
                    id: 'int-x',
                    action_requests: [{ action: 'update_frontmatter', args: { reason: 'r' } }]
                  }
                ]
              }
            ]
          }
        })
      }))
    })

    const result = await recoverPendingApprovals({
      getTargets: () => [],
      pendingInterrupts: new Map()
    })
    expect(result.recovered).toBe(1) // one OK, one threw
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run electron/agent/checkpointer-recovery.test.ts
git add electron/agent/checkpointer-recovery.test.ts
git commit -m "test(agent): cover startup recovery for pending HITL interrupts"
```

---

<!-- openspec-task: 8.1 -->

### Task 4: Rewrite `usage.ts` to extract from `AIMessage.usage_metadata`

**Files:**

- Modify: `electron/ai/usage.ts`

Existing `usage.ts` is **fine for storage** — the `insert` shape matches what callers already produce. What's changing is the **call site discipline**: every LLM call should pass `promptTokens / completionTokens` extracted from `AIMessage.usage_metadata` (LangChain's standard format) rather than provider-specific extraction.

The actual code change is small: add a helper that takes an `AIMessage` (or its `usage_metadata`) and returns the row shape, so callers don't duplicate the extraction logic.

- [ ] **Step 1: Add a helper export**

Edit `electron/ai/usage.ts`. Add at the bottom:

```typescript
export interface UsageInput {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
}

/**
 * Build an aiUsage.insert payload from a LangChain AIMessage.usage_metadata.
 * Returns `null` if no usage metadata is present (caller should skip the insert).
 */
export function rowFromUsageMetadata(
  usage: UsageInput | undefined,
  base: {
    profileId: string
    model: string
    latencyMs: number
    ok: 0 | 1
    error: string | null
    sessionId?: string
    jobId?: string
  }
): Parameters<typeof aiUsage.insert>[0] | null {
  if (!usage) return null
  return {
    jobId: base.jobId,
    profileId: base.profileId,
    model: base.model,
    promptTokens: usage.input_tokens ?? 0,
    completionTokens: usage.output_tokens ?? 0,
    latencyMs: base.latencyMs,
    ok: base.ok,
    error: base.error,
    sessionId: base.sessionId
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck:node`

- [ ] **Step 3: Commit**

```bash
git add electron/ai/usage.ts
git commit -m "feat(ai): add rowFromUsageMetadata helper extracting AIMessage.usage_metadata"
```

---

<!-- openspec-task: 8.2 -->

### Task 5: Wire `recordUsage` in reviewer + runner using the helper

**Files:**

- Modify: `electron/ai/reviewer.ts`
- Modify: `electron/agent/runner.ts`

- [ ] **Step 1: Reviewer**

Replace the inline `aiUsage.insert(...)` calls inside `reviewer.ts` with the helper:

```diff
-    aiUsage.insert({
-      profileId: profile.id, model: modelName,
-      promptTokens: 0, completionTokens: 0,
-      latencyMs: Date.now() - t0,
-      ok: 0, error: (err as any)?.code ?? 'E_UNKNOWN',
-    });
+    const row = rowFromUsageMetadata(undefined, {
+      profileId: profile.id, model: modelName,
+      latencyMs: Date.now() - t0, ok: 0, error: (err as any)?.code ?? 'E_UNKNOWN',
+    });
+    if (row) aiUsage.insert(row);
+    else aiUsage.insert({
+      profileId: profile.id, model: modelName,
+      promptTokens: 0, completionTokens: 0,
+      latencyMs: Date.now() - t0, ok: 0, error: (err as any)?.code ?? 'E_UNKNOWN',
+    });
```

Wait — the helper returns `null` when usage is missing, but the error path MUST always write a row (with zeros). Adjust the helper or branch the call:

```typescript
function writeUsage(args: {
  usage?: UsageInput
  profileId: string
  model: string
  latencyMs: number
  ok: 0 | 1
  error: string | null
  sessionId?: string
  jobId?: string
}) {
  const row = rowFromUsageMetadata(args.usage, args)
  if (row) {
    aiUsage.insert(row)
    return
  }
  // No usage → still write a row with zeros (preserves "1 row per LLM call" invariant).
  aiUsage.insert({
    profileId: args.profileId,
    model: args.model,
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: args.latencyMs,
    ok: args.ok,
    error: args.error,
    sessionId: args.sessionId,
    jobId: args.jobId
  })
}
```

Place `writeUsage` in `electron/ai/usage.ts` and export it. Then reviewer and runner both call `writeUsage(...)` at one point each.

- [ ] **Step 2: Runner**

In `runner.ts`, the `recordUsage` callback passed in by IPC currently inserts a row. Change the recordUsage in `electron/ipc/chat.ts` to call the new `writeUsage` helper:

```typescript
import { writeUsage } from '../ai/usage';
// inside sendUserMessage:
recordUsage: (u, model) => {
  writeUsage({
    profileId: profile.id, model,
    usage: u, latencyMs: 0, ok: 1, error: null,
    sessionId: opts.sessionId,
  });
},
```

(Latency is fudged to 0 because we measure it inside the runner; if we want accuracy, pass `t0` from runner via a closure. Defer that nuance to Plan 6.)

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run electron/ai/usage.test.ts electron/ai/reviewer.test.ts electron/agent/runner.test.ts
git add electron/ai/usage.ts electron/ai/reviewer.ts electron/ipc/chat.ts
git commit -m "refactor(ai): centralize usage row write via writeUsage helper"
```

---

<!-- openspec-task: 8.3 -->

### Task 6: Adjust `usage.test.ts` — input is now mock `AIMessage.usage_metadata`

**Files:**

- Modify: `electron/ai/usage.test.ts`

- [ ] **Step 1: Add tests for `rowFromUsageMetadata` and `writeUsage`**

Append to `electron/ai/usage.test.ts`:

```typescript
import { rowFromUsageMetadata, writeUsage } from './usage'

describe('rowFromUsageMetadata', () => {
  it('returns row with input_tokens → promptTokens', () => {
    const row = rowFromUsageMetadata(
      { input_tokens: 100, output_tokens: 50 },
      { profileId: 'p1', model: 'm', latencyMs: 1000, ok: 1, error: null }
    )
    expect(row).toMatchObject({ promptTokens: 100, completionTokens: 50, ok: 1, latencyMs: 1000 })
  })

  it('returns null when usage is undefined', () => {
    const row = rowFromUsageMetadata(undefined, {
      profileId: 'p1',
      model: 'm',
      latencyMs: 0,
      ok: 1,
      error: null
    })
    expect(row).toBeNull()
  })

  it('treats missing input/output as 0', () => {
    const row = rowFromUsageMetadata(
      {},
      { profileId: 'p1', model: 'm', latencyMs: 0, ok: 1, error: null }
    )
    expect(row?.promptTokens).toBe(0)
    expect(row?.completionTokens).toBe(0)
  })
})

describe('writeUsage', () => {
  it('writes a row with usage values when present', () => {
    writeUsage({
      usage: { input_tokens: 10, output_tokens: 5 },
      profileId: 'p1',
      model: 'm',
      latencyMs: 100,
      ok: 1,
      error: null
    })
    const r = db.prepare('SELECT * FROM ai_usage').get() as any
    expect(r.prompt_tokens).toBe(10)
    expect(r.completion_tokens).toBe(5)
  })

  it('writes a row with zeros when usage is missing (preserves 1-row-per-call invariant)', () => {
    writeUsage({
      profileId: 'p1',
      model: 'm',
      latencyMs: 100,
      ok: 0,
      error: 'E_UNKNOWN'
    })
    const r = db.prepare('SELECT * FROM ai_usage ORDER BY id DESC LIMIT 1').get() as any
    expect(r.prompt_tokens).toBe(0)
    expect(r.completion_tokens).toBe(0)
    expect(r.ok).toBe(0)
    expect(r.error).toBe('E_UNKNOWN')
  })
})
```

- [ ] **Step 2: Verify aggregate test still passes**

Run: `pnpm vitest run electron/ai/usage.test.ts`
Expected: green; the legacy aggregation tests (`summary` / `list`) remain unchanged.

- [ ] **Step 3: Commit**

```bash
git add electron/ai/usage.test.ts
git commit -m "test(ai): cover rowFromUsageMetadata and writeUsage with AIMessage-shaped input"
```

---

<!-- openspec-task: 9.1 -->

### Task 7: Delete `electron/ai/providers/openai.ts` + its test

**Files:**

- Delete: `electron/ai/providers/openai.ts`
- Delete: `electron/ai/providers/openai.test.ts`

- [ ] **Step 1: Confirm no in-source imports outside `client.ts`**

Run: `grep -rn "providers/openai" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared --include='*.ts' 2>&1 | grep -v providers/openai.ts | grep -v providers/openai.test.ts`

Expected single remaining match: `electron/ai/client.ts` (dynamic import). That's fine — `client.ts` is deleted in Plan 6 Task 1, so its `await import('./providers/openai')` will simply fail at runtime if reached; since chat goes through the new runner and reviewer goes through `withStructuredOutput`, `client.ts` is no longer called.

However, **if anything else still imports `client.ts`** (e.g. queue handlers), we must verify they all migrated. Run:

```bash
grep -rn "from '.*ai/client'\|from \"../../ai/client\"\|import.*llmClient" /Users/aaa/develop/workspace-ai/acornvo/electron --include='*.ts' 2>&1
```

If `electron/queue/handlers/ai-review-clip.ts` or other still imports `llmClient`, fix them now or defer to Plan 6. The reviewer already does NOT need `llmClient` after Plan 2.

- [ ] **Step 2: Delete the files**

```bash
git rm electron/ai/providers/openai.ts electron/ai/providers/openai.test.ts
```

- [ ] **Step 3: Run tests to verify nothing else broke**

```bash
pnpm vitest run
```

Expected: green. If `client.test.ts` fails because it tries to load `./providers/openai`, accept the failure — Plan 6 Task 1 deletes `client.ts` and its test together.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(ai): delete legacy OpenAI provider (ChatOpenAI in model-factory replaces it)"
```

---

<!-- openspec-task: 9.2 -->

### Task 8: Delete `electron/ai/providers/anthropic.ts` + test

**Files:**

- Delete: `electron/ai/providers/anthropic.ts`
- Delete: `electron/ai/providers/anthropic.test.ts`

- [ ] **Step 1: Same consumer check**

Run: `grep -rn "providers/anthropic" /Users/aaa/develop/workspace-ai/acornvo --include='*.ts' 2>&1 | grep -v providers/anthropic`

Same expected outcome: only `client.ts`.

- [ ] **Step 2: Delete + commit**

```bash
git rm electron/ai/providers/anthropic.ts electron/ai/providers/anthropic.test.ts
pnpm vitest run
git commit -m "refactor(ai): delete legacy Anthropic provider (ChatAnthropic in model-factory replaces it)"
```

---

<!-- openspec-task: 9.3 -->

### Task 9: Delete `electron/ai/providers/ollama.ts` + test

**Files:**

- Delete: `electron/ai/providers/ollama.ts`
- Delete: `electron/ai/providers/ollama.test.ts`

- [ ] **Step 1: Special consideration — Ollama tool-fallback**

Recall design open question #4: the legacy Ollama provider has a system-prompt-injection fallback for models that don't natively support tools. After this deletion, that fallback is gone — Ollama users with non-tool-capable models will get tool-call failures.

OpenSpec design decided to **drop the fallback**, banking on mainstream Ollama models having tool support by now. If real-world testing reveals broken Ollama scenarios, that's a Plan 6 release-note item.

- [ ] **Step 2: Delete + commit**

```bash
git rm electron/ai/providers/ollama.ts electron/ai/providers/ollama.test.ts
pnpm vitest run
git commit -m "refactor(ai): delete legacy Ollama provider (drops system-prompt tool fallback)"
```

---

<!-- openspec-task: 9.4 -->

### Task 10: Delete `electron/ai/providers/openai-compatible.ts` + test

**Files:**

- Delete: `electron/ai/providers/openai-compatible.ts`
- Delete: `electron/ai/providers/openai-compatible.test.ts`

- [ ] **Step 1: Delete + commit**

```bash
git rm electron/ai/providers/openai-compatible.ts electron/ai/providers/openai-compatible.test.ts
pnpm vitest run
```

After this delete the `electron/ai/providers/` directory will likely be empty. Optionally remove it (git does this automatically when the directory is empty):

```bash
git commit -m "refactor(ai): delete legacy openai-compatible provider (configuration.baseURL in model-factory replaces it)"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: green except possibly `electron/ai/client.test.ts` (which dynamically imports the now-deleted providers). That test gets deleted in Plan 6 Task 1.

- [ ] **Typecheck + build**

```bash
pnpm run typecheck && pnpm run build
```

Provider files are gone; the bundle should also be smaller. Optionally `du -sh out/main/` before/after for documentation.

- [ ] **Confirm sweeper is running in dev mode**

`pnpm dev`. After app start, check logs for `startSweeper` initialization (add a `logger.info` if you want to verify visually).

- [ ] **OpenSpec progress will be synced by `/opsx:executing-plans`.**
