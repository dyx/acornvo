# Phase 19 · AI LangChain Migration — Tasks 6.8–7.9 (Acceptance + Checkpointer + HITL)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the new runner is K1-compliant by running the existing acceptance suite green; then add the migration + `SqliteSaver` checkpointer; install `humanInTheLoopMiddleware`; rewire `agent.approve` / `agent.reject` to `Command({ resume })`; map `__interrupt__` to `tool.approval-needed` in the translator; add `agent.cancel` behavior (abort + 24h retention); add the startup recovery hook; cascade-delete checkpointer rows when a session is deleted.

**Architecture:** This plan installs everything between the runner and the persistence layer needed for HITL. After this plan, `update_frontmatter` once again works end-to-end (it stopped working at the end of Plan 3). The SqliteSaver shares the existing `better-sqlite3` connection where possible; if not, it opens its own connection but on the same DB file. The `__interrupt__` payload is translated identically whether emitted during a fresh `agent.stream` call or replayed by the startup recovery hook.

**Tech Stack:** `@langchain/langgraph-checkpoint-sqlite` (SqliteSaver), `@langchain/langgraph` (`Command`, `interrupt`, `humanInTheLoopMiddleware`), `better-sqlite3`, `vitest`.

**Dependencies on Plan 3:** The runner, stream-translator, and IPC switch are all live. Acceptance test suite (`electron/__acceptance__/*`) exists and exercises chat flows end-to-end.

**LangChain reference:** Heavily consult `mcp__langchain-docs__search_docs_by_lang_chain` for:
- `"SqliteSaver fromConnString fromDb constructor better-sqlite3"`
- `"humanInTheLoopMiddleware interruptOn allowAccept allowEdit allowReject"`
- `"Command resume decisions thread_id configurable"`
- `"agent.getState interrupt tasks"`

---

<!-- openspec-task: 6.8 -->
### Task 1: Acceptance test sweep — confirm runner is K1-compliant

**Files:**
- Inspect: `electron/__acceptance__/**`
- Modify (if necessary): individual acceptance specs where mocks need adapting

- [ ] **Step 1: Catalog the acceptance tests**

Run: `ls electron/__acceptance__/` and `grep -ln 'chat\|agent\|tool' electron/__acceptance__/*.ts 2>&1`

Identify which tests exercise chat / agent flows. Note: `phase-16` directory likely holds chat acceptance suites.

- [ ] **Step 2: Run the relevant suites**

Run: `pnpm vitest run electron/__acceptance__/` (without `--coverage` to keep output focused).

Expected: 100% pass. If any chat test fails:
- **Cause A: mock shape changed.** The new runner calls `agent.stream` instead of `llmClient.chatWithTools`. If acceptance mocks the `llmClient`, they need to mock `agent.stream` instead. Update the test setup file to expose `mockAgentStream(entries)` and wire it through the chat handler.
- **Cause B: `step.warning` event absence.** The legacy `step.warning` is no longer emitted (per design "并行工具调用" decision). If any test asserts on `step.warning`, drop the assertion — it's an event removal documented in OpenSpec.
- **Cause C: tool ordering differences.** Legacy ran one tool at a time; new path runs in parallel. If tests assert event order across tool calls, relax the assertion to "events for both tool calls appear, in any order".

Fix each failing test individually. Keep each fix as a focused commit:

```bash
git add electron/__acceptance__/<file>.ts
git commit -m "test(acceptance): adapt <suite> mocks to new runner stream surface"
```

- [ ] **Step 3: Lock the 100% pass rate**

After all chat acceptance suites pass, capture a clean run output:

```bash
pnpm vitest run electron/__acceptance__/ 2>&1 | tail -20
```

Confirm `Tests N passed (N)` with no failures and no skips related to chat.

- [ ] **Step 4: Final acceptance commit (no code changes if all pass first try)**

```bash
git commit --allow-empty -m "test(acceptance): confirm chat suite passes 100% on new runner (K1)"
```

---

<!-- openspec-task: 7.1 -->
### Task 2: Create migration `002_langgraph_checkpoints.sql`

**Files:**
- Create: `electron/services/db/migrations/002_langgraph_checkpoints.sql`

Note: tasks.md says `electron/db/migrations/` but the real directory is `electron/services/db/migrations/` — use the real path. The migration runner (`electron/services/db/migrations.ts`) reads files matching `^(\d{3})_.*\.sql$` and sets `user_version = 2` after this runs.

- [ ] **Step 1: Look up the exact LangGraph table schemas**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"SqliteSaver schema checkpoints checkpoint_writes checkpoint_blobs columns"`. Capture the column lists and types.

Failing that, query the actual library source by:

```bash
node -e "console.log(require('@langchain/langgraph-checkpoint-sqlite').SqliteSaver.MIGRATIONS || 'no MIGRATIONS export')"
```

Or boot a quick fresh in-memory db, instantiate SqliteSaver, and `SELECT sql FROM sqlite_master WHERE type='table'` to capture the exact DDL.

The expected approximate shape per the OpenSpec design:

```sql
-- checkpoints
CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BLOB,
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- checkpoint_writes
CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- checkpoint_blobs
CREATE TABLE IF NOT EXISTS checkpoint_blobs (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT,
  blob BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);
```

**Adjust to match the actual library's DDL.** The `IF NOT EXISTS` guard ensures coexistence with SqliteSaver's own bootstrap.

- [ ] **Step 2: Write the SQL file**

Create `electron/services/db/migrations/002_langgraph_checkpoints.sql`:

```sql
-- Phase 19 · LangGraph SqliteSaver tables
-- Explicit DDL so backup / diagnostic-bundle tools can discover these tables.
-- SqliteSaver also creates these on first use (CREATE IF NOT EXISTS) — these
-- migrations are idempotent with that behavior.

CREATE TABLE IF NOT EXISTS checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,
  checkpoint BLOB,
  metadata BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread ON checkpoints(thread_id);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_writes_thread ON checkpoint_writes(thread_id);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL,
  version TEXT NOT NULL,
  type TEXT,
  blob BLOB,
  PRIMARY KEY (thread_id, checkpoint_ns, channel, version)
);

CREATE INDEX IF NOT EXISTS idx_checkpoint_blobs_thread ON checkpoint_blobs(thread_id);
```

- [ ] **Step 3: Make sure the copy-sql-migrations build step picks it up**

Inspect `scripts/copy-sql-migrations.mjs`. Confirm it copies every `*.sql` from `electron/services/db/migrations/` into `out/main/migrations/`. If yes, no change needed. If it hard-codes a filename, extend the glob.

- [ ] **Step 4: Commit**

```bash
git add electron/services/db/migrations/002_langgraph_checkpoints.sql
git commit -m "feat(db): add migration 002 for LangGraph checkpointer tables"
```

---

<!-- openspec-task: 7.2 -->
### Task 3: Test migration applies cleanly + preserves existing tables

**Files:**
- Modify: `electron/services/db/migrations.test.ts` (extend) or create `electron/services/db/migrations/002_langgraph_checkpoints.test.ts`

- [ ] **Step 1: Update the existing migration test (or add a new one)**

Edit `electron/services/db/migrations.test.ts`. Add tests:

```typescript
it('runs migration 002, creates checkpointer tables, preserves session_messages', () => {
  const db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  expect(db.pragma('user_version', { simple: true })).toBe(2);
  // Checkpointer tables exist
  const checkpointer = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('checkpoints', 'checkpoint_writes', 'checkpoint_blobs')`).all();
  expect(checkpointer.length).toBe(3);
  // Existing session tables intact
  const sessions = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions', 'session_messages', 'tool_calls')`).all();
  expect(sessions.length).toBe(3);
});

it('migration 002 is idempotent (CREATE IF NOT EXISTS coexists with SqliteSaver bootstrap)', () => {
  const db = new Database(':memory:');
  runMigrations(db, migrationsDir());
  // Re-run — should be a no-op even if SqliteSaver later runs CREATE IF NOT EXISTS.
  db.exec('CREATE TABLE IF NOT EXISTS checkpoints (thread_id TEXT NOT NULL, checkpoint_ns TEXT, checkpoint_id TEXT, PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id))');
  // Original migration's columns should still be present (no truncation).
  const cols = db.prepare("PRAGMA table_info(checkpoints)").all() as any[];
  expect(cols.find((c) => c.name === 'metadata')).toBeTruthy();
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run electron/services/db/migrations.test.ts
git add electron/services/db/migrations.test.ts
git commit -m "test(db): verify migration 002 creates checkpointer tables and is idempotent"
```

---

<!-- openspec-task: 7.3 -->
### Task 4: Instantiate `SqliteSaver` singleton in `agent-singleton.ts`

**Files:**
- Modify: `electron/agent/agent-singleton.ts`

- [ ] **Step 1: Look up `SqliteSaver` constructor options**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"SqliteSaver fromConnString fromDb better-sqlite3 instance"`.

In the JS port the constructor accepts a `better-sqlite3` Database instance or a connection string. Prefer reusing our existing `dbService.requireCurrent()` instance so all writes share the same connection / WAL behavior.

If the port only accepts a connection string, open a parallel handle to the same DB file:

```typescript
import Database from 'better-sqlite3';
const checkpointer = SqliteSaver.fromConnString(dbService.getCurrentDbPath());
```

Verify with `mcp__langchain-docs__search_docs_by_lang_chain` whether sharing one Database instance is supported. Plan 4 open question #3 in `design.md` asks the same.

- [ ] **Step 2: Replace MemorySaver with SqliteSaver**

Edit `electron/agent/agent-singleton.ts`. Update imports and body:

```diff
-import { MemorySaver } from '@langchain/langgraph';
+import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
+import { dbService } from '../services/db';
+import type { BaseCheckpointSaver } from '@langchain/langgraph';
 ...
-let handle: SingletonHandle | null = null;
+let handle: SingletonHandle | null = null;
+let checkpointer: BaseCheckpointSaver | null = null;
+
+function getCheckpointer(): BaseCheckpointSaver {
+  if (checkpointer) return checkpointer;
+  // Prefer sharing the existing better-sqlite3 instance to avoid lock contention.
+  // If the package only accepts a connection string, switch to:
+  //   checkpointer = SqliteSaver.fromConnString(dbService.getCurrentDbPath());
+  const db = dbService.requireCurrent();
+  checkpointer = new SqliteSaver(db as any);
+  return checkpointer;
+}
 ...
 export function getAgentBuilder(): SingletonHandle {
   if (handle) return handle;
-  const checkpointer = new MemorySaver();
+  const cp = getCheckpointer();
   handle = {
     buildForProfile: (profile: ResolvedProfile) => {
       const model = buildChatModel(profile) as unknown as BaseChatModel;
       return createAgent({
         model,
         tools: agentTools as any,
-        checkpointer,
+        checkpointer: cp,
       });
     },
   };
   return handle;
 }
+
+export function getCheckpointerInstance(): BaseCheckpointSaver {
+  return getCheckpointer();
+}
```

`getCheckpointerInstance` is exported because Tasks 8 (startup recovery) and 10 (cascade delete) need to read/write the checkpointer directly.

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors. If `SqliteSaver` doesn't accept a raw `better-sqlite3` instance, fall back to the `fromConnString` path documented in `dbService`.

- [ ] **Step 4: Commit**

```bash
git add electron/agent/agent-singleton.ts
git commit -m "feat(agent): replace MemorySaver with SqliteSaver checkpointer singleton"
```

---

<!-- openspec-task: 7.4 -->
### Task 5: Install `humanInTheLoopMiddleware` for `update_frontmatter`

**Files:**
- Modify: `electron/agent/agent-singleton.ts`

- [ ] **Step 1: Look up the middleware shape**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"humanInTheLoopMiddleware interruptOn allowAccept allowEdit allowReject"`.

Verify the v1 export path. Candidates:
```typescript
import { humanInTheLoopMiddleware } from 'langchain/middleware';
// or:
import { humanInTheLoopMiddleware } from '@langchain/langgraph/middleware';
```

- [ ] **Step 2: Add middleware to `createAgent` call**

Edit `electron/agent/agent-singleton.ts`:

```diff
+import { humanInTheLoopMiddleware } from 'langchain/middleware';
 ...
 export function getAgentBuilder(): SingletonHandle {
   if (handle) return handle;
   const cp = getCheckpointer();
+  const hitl = humanInTheLoopMiddleware({
+    interruptOn: {
+      update_frontmatter: { allowAccept: true, allowEdit: true, allowReject: true },
+    },
+  });
   handle = {
     buildForProfile: (profile: ResolvedProfile) => {
       const model = buildChatModel(profile) as unknown as BaseChatModel;
       return createAgent({
         model,
         tools: agentTools as any,
+        middleware: [hitl],
         checkpointer: cp,
       });
     },
   };
   return handle;
 }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors. If `middleware` is not on `CreateAgentOptions`, the prebuilt may not expose it under that key — consult MCP for v1's exact key. It might be `middlewares` (plural) or `interruptBefore`.

- [ ] **Step 4: Commit**

```bash
git add electron/agent/agent-singleton.ts
git commit -m "feat(agent): wire humanInTheLoopMiddleware for update_frontmatter"
```

---

<!-- openspec-task: 7.5 -->
### Task 6: Rewire `approveTool` / `rejectTool` IPC to `Command({ resume })`

**Files:**
- Modify: `electron/ipc/chat.ts`
- Modify: `electron/agent/runner.ts` (add `resumeAgent` export)

The external IPC signatures don't change. Internally we replace `approvalGate.approve(callId, editedArgs)` with `agent.invoke(new Command({ resume: { decisions: [...] } }), { configurable: { thread_id } })`.

- [ ] **Step 1: Look up the `Command` import and `resume` shape**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"Command resume decisions accept edit reject HITL"`.

The decision payload is approximately:
```typescript
new Command({
  resume: [
    { type: 'accept' },                             // approve as-is
    { type: 'edit', args: { /* new args */ } },     // approve with edits
    { type: 'reject' },                             // reject
  ],
});
```

Some versions accept a single `Command({ resume: { decisions: [...] } })` object. Confirm by reading the docs.

- [ ] **Step 2: Add a `resumeAgent` helper in `runner.ts`**

Append to `electron/agent/runner.ts`:

```typescript
import { Command } from '@langchain/langgraph';

export interface ResumeAgentArgs {
  sessionId: string;
  agent: RunnerDeps['agent'] & { invoke?: (cmd: any, cfg: any) => AsyncIterable<unknown> | Promise<any> };
  decisions: Array<{ type: 'accept' } | { type: 'edit'; args: unknown } | { type: 'reject' }>;
  cancel: AbortSignal;
  streamWriter: { write: (e: AgentEvent) => void };
  sessions: RunnerDeps['sessions'];
  recordUsage: RunnerDeps['recordUsage'];
  modelName: string;
}

export async function resumeAgent(args: ResumeAgentArgs): Promise<void> {
  const translatorDeps: TranslatorDeps = {
    emit: (e) => args.streamWriter.write(e),
    persist: {
      appendMessage: (m) => args.sessions.appendMessage(args.sessionId, m),
      recordToolCall: (tc, opts) => args.sessions.recordToolCall(args.sessionId, tc, opts),
      finishToolCall: (rowId, fields) => args.sessions.finishToolCall(rowId, fields),
    },
    recordUsage: args.recordUsage,
    seenAiMessageIds: new Set(),
    toolCallRowIdByCallId: new Map(),
  };

  let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined;

  try {
    // After resume, `agent.stream` continues from the interrupted state.
    const stream = args.agent.stream(
      new Command({ resume: args.decisions }) as any,
      { configurable: { thread_id: args.sessionId }, streamMode: ['updates', 'messages'], signal: args.cancel },
    );
    for await (const entry of stream) {
      if (args.cancel.aborted) { emitCanceled(translatorDeps); return; }
      await translateStreamEntry(translatorDeps, entry, args.modelName);
      const [mode, payload] = entry as [string, any];
      if (mode === 'updates' && payload?.model?.messages) {
        for (const m of payload.model.messages) {
          const u = (m as any)?.usage_metadata;
          if (u) lastUsage = u;
        }
      }
    }
    emitDone(translatorDeps, lastUsage, args.modelName);
  } catch (err: any) {
    if (err?.name === 'AbortError' || args.cancel.aborted) {
      emitCanceled(translatorDeps);
      return;
    }
    emitError(translatorDeps, err);
  }
}
```

- [ ] **Step 3: Update IPC handlers**

Edit `electron/ipc/chat.ts`. Replace `approveTool` / `rejectTool` bodies. The IPC takes `(callId, opts?)` — `opts.editedArgs` means "accept with edits". Convert to decisions:

```typescript
// inside createChatHandlers
approveTool: async (callId: string, opts?: { editedArgs?: unknown }) => {
  const sessionId = approval.peekSessionId(callId);
  if (!sessionId) throw new IpcError('E_NOT_FOUND', 'no pending approval for callId');

  const profile = resolveProfile(profileForSession(sessionId));
  const agent = getAgentBuilder().buildForProfile(profile);
  const ctl = aborts.get(sessionId) ?? new AbortController();
  aborts.set(sessionId, ctl);
  const writer = createStreamWriter(sessionId, deps.getTargets);

  void resumeAgent({
    sessionId,
    agent,
    decisions: opts?.editedArgs !== undefined
      ? [{ type: 'edit', args: opts.editedArgs }]
      : [{ type: 'accept' }],
    cancel: ctl.signal,
    streamWriter: writer,
    sessions: deps.sessions,
    recordUsage: (u, model) => recordUsageRow(profile, sessionId, u, model),
    modelName: profile.model,
  })
    .catch((err) => writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message }));

  return { ok: true } as const;
},

rejectTool: async (callId: string) => {
  const sessionId = approval.peekSessionId(callId);
  if (!sessionId) throw new IpcError('E_NOT_FOUND', 'no pending approval for callId');

  const profile = resolveProfile(profileForSession(sessionId));
  const agent = getAgentBuilder().buildForProfile(profile);
  const ctl = aborts.get(sessionId) ?? new AbortController();
  aborts.set(sessionId, ctl);
  const writer = createStreamWriter(sessionId, deps.getTargets);

  void resumeAgent({
    sessionId,
    agent,
    decisions: [{ type: 'reject' }],
    cancel: ctl.signal,
    streamWriter: writer,
    sessions: deps.sessions,
    recordUsage: () => {},
    modelName: profile.model,
  });
  return { ok: true } as const;
},
```

Notes:
- `approval.peekSessionId(callId)` needs to be added — or, since `approvalGate` is going away in Plan 6 Task 3, replace with a `pendingApprovals` Map maintained inside `createChatHandlers`. The interrupt → approval-needed emission (Task 7 below) is the natural place to add an entry into that Map.
- `profileForSession(sessionId)`: look up the session's profileId from `sessions.list()` or the existing `pendingApprovals` Map.

Recommended simpler approach: add `pendingInterrupts: Map<string, { sessionId, profileId }>` keyed by callId in the chat handler scope. Populate it from the runner's `tool.approval-needed` event (the event flows back through the writer → renderer; nothing prevents us from also intercepting it in the same process). Easiest implementation: when Task 7 emits `tool.approval-needed`, the runner's translator deps include a `pendingInterrupts` map that the chat handler shares.

Refactor `runner.ts` to take a `pendingInterrupts` Map as a dep, and write into it from the interrupt emitter. Then `approveTool` / `rejectTool` read from it.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:node`

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/chat.ts electron/agent/runner.ts
git commit -m "feat(agent): approve/reject IPC drives Command({ resume }) via resumeAgent"
```

---

<!-- openspec-task: 7.6 -->
### Task 7: Map `__interrupt__` → `tool.approval-needed` in stream-translator + runner

**Files:**
- Modify: `electron/agent/runner.ts`
- Modify: `electron/agent/stream-translator.ts` (only if needed; mostly the helper is already in place from Plan 3 Task 4)

- [ ] **Step 1: Detect interrupts during stream**

In LangGraph v1, an interrupt typically appears in the stream as a special entry — verify with MCP `mcp__langchain-docs__search_docs_by_lang_chain` query `"agent stream interrupt __interrupt__ payload"`. The payload structure usually looks like:

```typescript
['updates', { __interrupt__: [{ id: '...', value: { action_requests: [...] } }] }]
```

or it's surfaced via the agent's task state. Use whichever LangGraph v1 actually emits.

- [ ] **Step 2: Handle the interrupt in `runner.ts`**

Inside `runAgent`'s `for await (const entry of stream)`:

```typescript
const [mode, payload] = entry as [string, any];
if (mode === 'updates' && Array.isArray(payload?.__interrupt__)) {
  for (const ir of payload.__interrupt__) {
    emitInterrupt(translatorDeps, ir);
    // Record the pending interrupt for IPC approve/reject lookup.
    deps.pendingInterrupts?.set(String(ir.id), { sessionId, profileId: _profileId });
  }
  // Persist state; suspend the loop.
  return;
}
```

Add `pendingInterrupts?: Map<string, { sessionId: string; profileId: string }>` to `RunnerDeps`.

- [ ] **Step 3: Wire `pendingInterrupts` in `chat.ts`**

In `createChatHandlers`, declare:

```typescript
const pendingInterrupts = new Map<string, { sessionId: string; profileId: string }>();
```

Pass it into both `runAgent` and `resumeAgent` call sites. Use it from `approveTool`/`rejectTool` to look up `sessionId` and `profileId` for a `callId`.

- [ ] **Step 4: Run + commit**

```bash
pnpm run typecheck:node
git add electron/agent/runner.ts electron/ipc/chat.ts
git commit -m "feat(agent): emit tool.approval-needed when runner sees __interrupt__"
```

---

<!-- openspec-task: 7.7 -->
### Task 8: `agent.cancel` — abort + 24h retention metadata

**Files:**
- Modify: `electron/ipc/chat.ts` (cancelStream)
- Modify: `electron/agent/agent-singleton.ts` (add `markThreadActivity`)
- Migration: `electron/services/db/migrations/002_langgraph_checkpoints.sql` (add `last_active_at`)

The OpenSpec spec mandates: cancel does NOT immediately delete checkpointer rows. It marks the thread as inactive; a background sweeper (Plan 5 Task 1) deletes rows older than 24h.

- [ ] **Step 1: Extend the migration**

If migration 002 has not yet shipped to production users, extend it in place. Append to `002_langgraph_checkpoints.sql`:

```sql
-- Sidecar table for last-activity tracking (LangGraph's own tables don't store this).
CREATE TABLE IF NOT EXISTS checkpoint_meta (
  thread_id TEXT PRIMARY KEY,
  last_active_at INTEGER NOT NULL,
  canceled_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_checkpoint_meta_canceled ON checkpoint_meta(canceled_at);
```

If migration 002 has already shipped to users, create `003_checkpoint_meta.sql` instead and bump the migration test to expect `user_version = 3`. Default for this plan: still safe to extend 002, since Plan 4 is the first time the migration ever ships.

- [ ] **Step 2: Add helpers**

Edit `electron/agent/agent-singleton.ts`:

```typescript
import { dbService } from '../services/db';

export function markThreadActive(threadId: string): void {
  const db = dbService.requireCurrent();
  const now = Date.now();
  db.prepare(`
    INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at)
    VALUES (?, ?, NULL)
    ON CONFLICT(thread_id) DO UPDATE SET last_active_at = excluded.last_active_at, canceled_at = NULL
  `).run(threadId, now);
}

export function markThreadCanceled(threadId: string): void {
  const db = dbService.requireCurrent();
  const now = Date.now();
  db.prepare(`
    INSERT INTO checkpoint_meta (thread_id, last_active_at, canceled_at)
    VALUES (?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET canceled_at = excluded.canceled_at
  `).run(threadId, now, now);
}
```

- [ ] **Step 3: Call helpers from the runner and IPC**

In `runner.ts`, at the top of `runAgent` after appending the user message, call `markThreadActive(sessionId)`. After `emitDone` or `emitError`, the activity stamp remains as the "last completed" time, which is what we want.

In `electron/ipc/chat.ts`:

```diff
 cancelStream: async (sessionId: string) => {
   const ctl = aborts.get(sessionId);
   if (ctl) ctl.abort();
-  deps.approval.cancelSession(sessionId);
+  // approvalGate is going away in Plan 6 — until then, keep it in sync.
+  deps.approval.cancelSession(sessionId);
+  markThreadCanceled(sessionId);
   return { ok: true } as const;
 },
```

- [ ] **Step 4: Run + commit**

```bash
pnpm run typecheck:node
git add electron/services/db/migrations/002_langgraph_checkpoints.sql electron/agent/agent-singleton.ts electron/agent/runner.ts electron/ipc/chat.ts
git commit -m "feat(agent): mark thread activity + cancel timestamp (24h retention deferred to Plan 5 sweeper)"
```

---

<!-- openspec-task: 7.8 -->
### Task 9: Startup recovery hook — re-emit pending `tool.approval-needed`

**Files:**
- Modify: `electron/app-lifecycle.ts` (or create `electron/agent/startup-recovery.ts`)
- Modify: wherever the app's main entrypoint initializes services (likely `electron/main.ts`)

The recovery is: at app start, scan all threads that are checkpointer-persisted, call `agent.getState({ configurable: { thread_id } })`, and for each thread whose state has `tasks[*].interrupts[*]`, re-emit `tool.approval-needed` to that session's stream.

- [ ] **Step 1: Inspect `app-lifecycle.ts`**

Read: `cat electron/app-lifecycle.ts`. The file already has `onBeforeQuit` / `onWindowResume` hooks but no `onAppReady`. Add a new hook OR call the recovery directly from the main entrypoint.

- [ ] **Step 2: Add a startup-recovery module**

Create `electron/agent/startup-recovery.ts`:

```typescript
import { dbService } from '../services/db';
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory';
import { getAgentBuilder, getCheckpointerInstance } from './agent-singleton';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { createStreamWriter } from './streamWriter';
import { emitInterrupt } from './stream-translator';
import type { AgentEvent } from '../../shared/agent-types';

interface RecoveryTargets {
  getTargets: () => any[];
  pendingInterrupts: Map<string, { sessionId: string; profileId: string }>;
}

function listSessionsWithCheckpoints(): Array<{ sessionId: string; profileId: string }> {
  const db = dbService.requireCurrent();
  // Sessions with any checkpoint row.
  const rows = db.prepare(`
    SELECT s.id AS session_id, s.profile_id AS profile_id
    FROM sessions s
    WHERE EXISTS (SELECT 1 FROM checkpoints c WHERE c.thread_id = s.id)
  `).all() as Array<{ session_id: string; profile_id: string | null }>;
  return rows
    .filter((r) => r.profile_id)
    .map((r) => ({ sessionId: r.session_id, profileId: r.profile_id as string }));
}

async function recoverOne(target: RecoveryTargets, { sessionId, profileId }: { sessionId: string; profileId: string }): Promise<void> {
  const db = dbService.requireCurrent();
  const p = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(profileId) as any;
  if (!p) return; // Profile was deleted; nothing to recover.
  const profile: ResolvedProfile = {
    id: p.id, provider: p.provider, model: p.model,
    apiKey: p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id),
    baseUrl: p.base_url ?? undefined, temperature: p.temperature, maxTokens: p.max_tokens ?? undefined,
  };
  const agent = getAgentBuilder().buildForProfile(profile);
  const state: any = await (agent as any).getState({ configurable: { thread_id: sessionId } });
  if (!state) return;

  const writer = createStreamWriter(sessionId, target.getTargets);
  const events: AgentEvent[] = [];
  const translatorDeps = {
    emit: (e: AgentEvent) => { events.push(e); writer.write(e); },
    persist: { appendMessage: async () => ({ id: 0, sessionId, role: 'system', content: '', createdAt: '' }) as any, recordToolCall: async () => '', finishToolCall: async () => {} },
    recordUsage: () => {},
    seenAiMessageIds: new Set<string>(),
    toolCallRowIdByCallId: new Map<string, string>(),
  };

  for (const task of state.tasks ?? []) {
    for (const ir of task.interrupts ?? []) {
      emitInterrupt(translatorDeps as any, ir);
      target.pendingInterrupts.set(String(ir.id), { sessionId, profileId });
    }
  }
}

export async function recoverPendingApprovals(target: RecoveryTargets): Promise<{ recovered: number }> {
  const candidates = listSessionsWithCheckpoints();
  let recovered = 0;
  for (const c of candidates) {
    try {
      await recoverOne(target, c);
      recovered++;
    } catch (err) {
      // Best-effort — never block startup.
    }
  }
  return { recovered };
}
```

- [ ] **Step 3: Call from main process startup**

Find `electron/main.ts` (the Electron main entrypoint). After the IPC handlers register but before the window is fully visible, add:

```typescript
import { recoverPendingApprovals } from './agent/startup-recovery';
// after ipc handlers + grove + db init:
await recoverPendingApprovals({
  getTargets: () => (mainWindow && !mainWindow.isDestroyed()) ? [mainWindow.webContents] : [],
  pendingInterrupts: chatHandlersPendingInterruptsRef,
});
```

`chatHandlersPendingInterruptsRef` is the Map created inside `createChatHandlers` — expose it as an export from `createChatHandlers` (return alongside the handler functions).

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:node`

- [ ] **Step 5: Commit**

```bash
git add electron/agent/startup-recovery.ts electron/main.ts electron/ipc/chat.ts
git commit -m "feat(agent): startup recovery hook re-emits pending tool.approval-needed"
```

---

<!-- openspec-task: 7.9 -->
### Task 10: Cascade-delete checkpointer rows when a session is deleted

**Files:**
- Modify: `electron/agent/sessions.ts` (the `delete` method)
- Test: `electron/agent/sessions.test.ts`

- [ ] **Step 1: Update `sessions.delete`**

Edit `electron/agent/sessions.ts`:

```diff
 async delete(id) {
   const tx = db().transaction((sid: string) => {
     db().prepare("DELETE FROM tool_calls WHERE session_id = ?").run(sid);
+    db().prepare("DELETE FROM checkpoints WHERE thread_id = ?").run(sid);
+    db().prepare("DELETE FROM checkpoint_writes WHERE thread_id = ?").run(sid);
+    db().prepare("DELETE FROM checkpoint_blobs WHERE thread_id = ?").run(sid);
+    db().prepare("DELETE FROM checkpoint_meta WHERE thread_id = ?").run(sid);
     db().prepare("DELETE FROM sessions WHERE id = ?").run(sid);
   });
   tx(id);
 },
```

Note: also delete `session_messages` if not already cascaded. Check existing FK constraints.

- [ ] **Step 2: Test**

Add to `electron/agent/sessions.test.ts`:

```typescript
it('delete cascades into checkpointer tables', async () => {
  await sessions.createSession({ profileId: 'p1' });
  const list = await sessions.list();
  const sid = list[0].id;
  db.prepare("INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id) VALUES (?, '', 'cp-1')").run(sid);
  db.prepare("INSERT INTO checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel) VALUES (?, '', 'cp-1', 't', 0, 'c')").run(sid);
  db.prepare("INSERT INTO checkpoint_blobs (thread_id, checkpoint_ns, channel, version) VALUES (?, '', 'c', 'v1')").run(sid);

  await sessions.delete(sid);

  expect(db.prepare("SELECT COUNT(*) AS c FROM checkpoints WHERE thread_id = ?").get(sid)).toEqual({ c: 0 });
  expect(db.prepare("SELECT COUNT(*) AS c FROM checkpoint_writes WHERE thread_id = ?").get(sid)).toEqual({ c: 0 });
  expect(db.prepare("SELECT COUNT(*) AS c FROM checkpoint_blobs WHERE thread_id = ?").get(sid)).toEqual({ c: 0 });
});

it('delete on a session with no checkpointer rows still succeeds (0 affected)', async () => {
  await sessions.createSession({ profileId: 'p1' });
  const list = await sessions.list();
  const sid = list[0].id;
  await expect(sessions.delete(sid)).resolves.not.toThrow();
});
```

Make sure the test setup runs migrations so the checkpointer tables exist.

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run electron/agent/sessions.test.ts
git add electron/agent/sessions.ts electron/agent/sessions.test.ts
git commit -m "feat(agent): cascade-delete checkpointer rows when chat session is deleted"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Run full test suite**

```bash
pnpm test
```
Expected: green. Acceptance tests still pass; `update_frontmatter` HITL now functional.

- [ ] **Typecheck + build**

```bash
pnpm run typecheck && pnpm run build
```

- [ ] **Smoke test HITL**

`pnpm dev`. Send a chat message that asks the agent to "tag note X with tag 'todo'". Expect:
1. Agent emits `search_files` → finds note.
2. Agent emits `update_frontmatter` request → `tool.approval-needed` arrives.
3. Renderer shows approval UI; user clicks approve.
4. Renderer calls `chat.approveTool(callId)`.
5. Agent resumes, executes the tool, emits result, then `done`.

Then quit the app while the approval is pending. Restart. Expect the approval-needed event to be re-emitted on startup (Task 9).

- [ ] **OpenSpec progress will be synced by `/opsx:executing-plans`.**
