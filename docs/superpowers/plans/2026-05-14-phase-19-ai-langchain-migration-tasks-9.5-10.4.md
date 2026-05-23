# Phase 19 · AI LangChain Migration — Tasks 9.5–10.4 (Final Cleanup + Docs + Verify)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the last 4 legacy modules (`client.ts`, `loop.ts`, `approval.ts`, `loop.test.ts`); grep-verify no orphan imports; rerun acceptance; update docs; write release notes; run the full test suite green; verify + archive the OpenSpec change.

**Architecture:** This is the cleanup pass. After this plan, `electron/ai/` contains only `model-factory.ts`, `normalize-errors.ts`, `reviewer.ts`, `usage.ts`, and `prompts/*`. `electron/agent/` contains only `runner.ts`, `stream-translator.ts`, `agent-singleton.ts`, `startup-recovery.ts`, `checkpointer-sweeper.ts`, `sessions.ts`, `streamWriter.ts`, `attachments.ts`, `concurrency.ts`, and `tools/*`. The legacy `eventsource-parser` dependency can finally be removed from `package.json` (tasks.md 1.2 was deferred).

**Tech Stack:** No new tooling. Just deletes, doc edits, and `openspec` CLI.

**Dependencies on Plans 1–5:** All. Plan 6 is purely additive of removals.

---

<!-- openspec-task: 9.5 -->

### Task 1: Delete `electron/ai/client.ts` + test

**Files:**

- Delete: `electron/ai/client.ts`
- Delete: `electron/ai/client.test.ts`

- [ ] **Step 1: Check for remaining imports**

Run: `grep -rn "from '.*ai/client'\|llmClient" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared --include='*.ts' 2>&1`

Expected: only `electron/ipc/chat.ts` and `electron/ipc/handlers.ts` may still reference `llmClient` from `client.ts`. Both are now plumbed through the new runner — drop the imports.

If `electron/queue/handlers/ai-review-clip.ts` (or any other) still references `llmClient`, audit and switch them to the reviewer / model-factory path.

- [ ] **Step 2: Remove residual imports**

Edit `electron/ipc/handlers.ts`:

```diff
-import { llmClient } from '../ai/client'
 ...
 const chatHandlers = createChatHandlers({
   ...
-  llmClient: llmClient as any,
   ...
 })
```

Edit `electron/ipc/chat.ts`:

```diff
-import type { ChatDeps } from '../agent/loop'  // if present
-export interface ChatDeps {
-  ...
-  llmClient: { chatWithTools: (opts: any) => Promise<any> };
-}
+export interface ChatDeps {
+  ...
+}
```

Also remove `llmClient` from the `RunnerDeps` parameter type if still listed.

- [ ] **Step 3: Delete the files**

```bash
git rm electron/ai/client.ts electron/ai/client.test.ts
```

- [ ] **Step 4: Drop now-orphan `parse-json.ts` (Plan 2 Task 3 was deferred)**

```bash
git rm electron/ai/parse-json.ts electron/ai/parse-json.test.ts
```

Confirm with grep: `grep -rn "parse-json\|parseAndValidate" /Users/aaa/develop/workspace-ai/acornvo --include='*.ts' 2>&1`. Expected: no matches (or only matches inside files we are about to delete).

- [ ] **Step 5: Drop now-orphan `parse-tool-args.ts` (Plan 3 Task 2 was deferred)**

```bash
git rm electron/ai/parse-tool-args.ts electron/ai/parse-tool-args.test.ts
```

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm run typecheck:node
git add electron/ipc/handlers.ts electron/ipc/chat.ts
git commit -m "refactor(ai): delete client.ts, parse-json.ts, parse-tool-args.ts (model-factory replaces them)"
```

---

<!-- openspec-task: 9.6 -->

### Task 2: Delete `electron/agent/loop.ts`

**Files:**

- Delete: `electron/agent/loop.ts`

- [ ] **Step 1: Confirm `chat.ts` no longer imports it (legacy fallback gone)**

Run: `grep -rn "from '.*agent/loop'\|runAgent.*loop" /Users/aaa/develop/workspace-ai/acornvo --include='*.ts' 2>&1`

If `electron/ipc/chat.ts` still has the `USE_LEGACY_AGENT` flag and a fallback import from `./loop`, remove it now — by this point the new runner is proven (we ran acceptance in Plan 4 Task 1 and Plan 5 cleanups).

Edit `electron/ipc/chat.ts`:

```diff
-import { runAgent as runAgentLegacy } from '../agent/loop';
-
-const USE_LEGACY_AGENT = process.env.AGENT_USE_LEGACY === '1';
 ...
-  if (USE_LEGACY_AGENT) {
-    void runAgentLegacy({ /* legacy deps */ })
-      ...
-    return { ok: true } as const;
-  }
```

- [ ] **Step 2: Delete the file**

```bash
git rm electron/agent/loop.ts
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm run typecheck:node
git add electron/ipc/chat.ts
git commit -m "refactor(agent): delete loop.ts and legacy fallback (runner.ts is canonical)"
```

---

<!-- openspec-task: 9.7 -->

### Task 3: Delete `electron/agent/approval.ts`

**Files:**

- Delete: `electron/agent/approval.ts`
- Modify: `electron/ipc/handlers.ts` (drop `approvalGate` import)
- Modify: `electron/ipc/chat.ts` (drop `approval` from deps; HITL middleware replaces it)

- [ ] **Step 1: Drop `approvalGate` usage**

Edit `electron/ipc/handlers.ts`:

```diff
-import { approvalGate } from '../agent/approval'
 ...
 const chatHandlers = createChatHandlers({
   ...
-  approval: approvalGate,
   ...
 })
```

Edit `electron/ipc/chat.ts`. The `approval: ApprovalGate` field on `ChatDeps` was used by:

1. `cancelStream` → `deps.approval.cancelSession(sessionId)`. This is no longer needed; cancellation is via `AbortController.abort()` + `markThreadCanceled`.
2. `sessions.delete` handler → `deps.approval.cancelSession(id)`. Also removed; checkpointer cascade-delete (Plan 4 Task 10) handles cleanup.

Remove both references. Also remove `approval: ApprovalGate` from `ChatDeps` and its import.

- [ ] **Step 2: Delete the file**

```bash
git rm electron/agent/approval.ts
```

- [ ] **Step 3: Typecheck + run chat tests**

Run: `pnpm vitest run electron/ipc/chat.test.ts electron/agent/`
Expected: green. Any remaining test of `approvalGate` was already replaced in Plan 5 Task 2 — verify `electron/agent/approval.test.ts` no longer imports the deleted module (it shouldn't; it imports `resumeAgent`).

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/handlers.ts electron/ipc/chat.ts
git commit -m "refactor(agent): delete approval.ts (humanInTheLoopMiddleware + Command(resume) replace it)"
```

---

<!-- openspec-task: 9.8 -->

### Task 4: Delete `electron/agent/loop.test.ts`

**Files:**

- Delete: `electron/agent/loop.test.ts`

- [ ] **Step 1: Verify replacement**

Confirm `electron/agent/runner.test.ts` (Plan 3 Task 10) covers all the scenarios `loop.test.ts` covered:

- One-step completion
- Multi-step tool roundtrip
- Cancellation
- Error mapping

Read `electron/agent/loop.test.ts` line-by-line and assert each `it(...)` has a counterpart in `runner.test.ts`. If a scenario is missing (e.g. `step.warning` legacy test), it does NOT need a counterpart — that event is gone per design.

- [ ] **Step 2: Delete**

```bash
git rm electron/agent/loop.test.ts
git commit -m "test(agent): delete legacy loop.test.ts (runner.test.ts is the replacement)"
```

---

<!-- openspec-task: 9.9 -->

### Task 5: Grep verify zero imports of deleted modules

**Files:**

- Inspect-only across the entire repo

- [ ] **Step 1: Run the grep audit**

```bash
grep -rn \
  -e "from '.*ai/providers/" \
  -e "from '.*ai/client'" \
  -e "from '.*ai/parse-json'" \
  -e "from '.*ai/parse-tool-args'" \
  -e "from '.*agent/loop'" \
  -e "from '.*agent/approval'" \
  -e "from '.*agent/registry'" \
  -e "from '.*agent/bootstrap'" \
  /Users/aaa/develop/workspace-ai/acornvo/electron \
  /Users/aaa/develop/workspace-ai/acornvo/shared \
  /Users/aaa/develop/workspace-ai/acornvo/src \
  --include='*.ts' 2>&1
```

Expected output: empty.

If anything matches:

- It's a leftover import that the deletion missed; fix the file, re-run, re-grep.

- [ ] **Step 2: Also check for runtime `require` patterns**

```bash
grep -rn "require('.*ai/client'\|require('.*agent/loop'" /Users/aaa/develop/workspace-ai/acornvo --include='*.ts' 2>&1
```

Expected: empty.

- [ ] **Step 3: Drop `eventsource-parser` from `package.json`**

The Plan 1 note deferred this. Run:

```bash
grep -rn "eventsource-parser" /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared /Users/aaa/develop/workspace-ai/acornvo/src --include='*.ts' 2>&1
```

If empty, edit `package.json` and remove `"eventsource-parser": "^3.0.8"`. Then:

```bash
pnpm install
pnpm run typecheck
```

If still referenced from any file outside the AI link (browser tabs / clipper?), leave the dependency in place and document in the release note.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): drop eventsource-parser (no longer used after provider removal)"
```

If no dependency removal happens, mark with empty commit:

```bash
git commit --allow-empty -m "chore: confirm no orphan imports of deleted AI modules (grep audit clean)"
```

---

<!-- openspec-task: 9.10 -->

### Task 6: Final acceptance + smoke

**Files:**

- Inspect: `electron/__acceptance__/**`

- [ ] **Step 1: Run all acceptance tests**

```bash
pnpm vitest run electron/__acceptance__/
```

Expected: 100% pass; same suite that passed in Plan 4 Task 1.

- [ ] **Step 2: Run full unit test suite**

```bash
pnpm test
```

Expected: green.

- [ ] **Step 3: Smoke test interactively**

`pnpm dev`. Exercise:

1. Single-turn chat (no tools)
2. Tool roundtrip (`search_files` + `read_file`)
3. HITL approve flow (`update_frontmatter` accept)
4. HITL reject flow (`update_frontmatter` reject)
5. Cancel mid-stream
6. Quit + restart with pending approval → recovery emits approval-needed
7. Long idle session (mock 24h+) → sweeper cleans

If any scenario regresses, fix and rerun the full pipeline. Do NOT proceed to docs/release until all green.

- [ ] **Step 4: Commit (empty if no fixes)**

```bash
git commit --allow-empty -m "test: full acceptance + manual smoke pass on new AI runtime"
```

---

<!-- openspec-task: 10.1 -->

### Task 7: Update README / docs to reflect the new AI link

**Files:**

- Modify: `README.md` (if it mentions providers/loop)
- Modify: `docs/AI.md` or similar (if exists; create if absent and explicitly requested by user)

- [ ] **Step 1: Search current docs**

```bash
grep -rn "OpenAI\|Anthropic\|Ollama\|provider\|llmClient\|chatWithTools\|approvalGate" /Users/aaa/develop/workspace-ai/acornvo/README.md /Users/aaa/develop/workspace-ai/acornvo/docs --include='*.md' 2>&1 | head -50
```

- [ ] **Step 2: Edit any section that describes the old architecture**

For each match, edit the file. The narrative becomes:

> Acornvo's AI link is built on **LangChain v1 + LangGraph v1**.
>
> - Provider adapters: `@langchain/openai` / `@langchain/anthropic` / `@langchain/ollama` via `electron/ai/model-factory.ts`.
> - Agent runtime: `createAgent` + `agent.stream` in `electron/agent/runner.ts`.
> - Human-in-the-loop: `humanInTheLoopMiddleware` + LangGraph `SqliteSaver` checkpointer.
> - Structured output: `model.withStructuredOutput(zodSchema)`.
> - Custom tools are written with `tool(fn, { schema: z.object(...) })` and listed in `electron/agent/tools/index.ts`.

Only edit existing AI / architecture docs — **do NOT create new top-level docs unless the user explicitly asks**.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/
git commit -m "docs: refresh AI link description for LangChain v1 + LangGraph v1 migration"
```

If no doc changes were needed:

```bash
git commit --allow-empty -m "docs: no README/docs sections referenced old AI link (no changes needed)"
```

---

<!-- openspec-task: 10.2 -->

### Task 8: Write release notes

**Files:**

- Modify: `CHANGELOG.md` (if exists) or `docs/release-notes/<version>.md`

- [ ] **Step 1: Identify release note location**

```bash
ls /Users/aaa/develop/workspace-ai/acornvo/CHANGELOG.md 2>&1
ls /Users/aaa/develop/workspace-ai/acornvo/docs/release-notes 2>&1
```

Whichever exists, append to it. If neither exists, append to the OpenSpec change archive's notes file (it will be archived in Task 10):

```bash
mkdir -p docs/release-notes
```

- [ ] **Step 2: Write the entry**

```markdown
## Phase 19 — AI runtime migration to LangChain v1 + LangGraph v1

### New capabilities

- **Restart recovery for pending approvals**: when the app is closed with an `update_frontmatter` approval pending, restarting the app re-emits `tool.approval-needed` so the user can complete the decision.

### Behavior changes

- **Tool calls now run in parallel by default**. The legacy single-tool-per-step constraint is removed; "read 3 files then list tags" now completes in one round-trip. The internal `step.warning` event is no longer triggered (the type is kept in the protocol for back-compat).
- **`callId` is propagated to `tool.start` / `tool.result` events** (additive). New renderers can fold tool calls + results by callId into the originating assistant message's ThoughtChain. Existing renderers ignoring the field are unaffected.

### Internals (no user-visible impact)

- 4 provider HTTP clients (~600 LOC) replaced by `@langchain/openai` / `@langchain/anthropic` / `@langchain/ollama`.
- Hand-rolled ReAct loop replaced by `createAgent` + `agent.stream`.
- In-process approval Map replaced by `humanInTheLoopMiddleware` + `SqliteSaver` checkpointer (3 new SQLite tables: `checkpoints`, `checkpoint_writes`, `checkpoint_blobs`, plus our sidecar `checkpoint_meta`).
- Reviewer JSON path simplified to `model.withStructuredOutput(zodSchema)`; Ajv code-fence stripping removed.
- 5 built-in tools now use Zod schemas via `tool(fn, { schema })`.

### Migration / data

- Existing chat sessions / messages / tool calls are preserved (no data migration).
- Approvals pending at upgrade time are LOST (the previous implementation did not persist them — same behavior as a normal app restart on the old version).
- Ollama models without native tool support no longer get a system-prompt fallback; use a tool-capable model (e.g. recent Llama 3.x / Qwen 2.5) or upgrade Ollama.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/release-notes/
git commit -m "docs(release): note LangChain v1 migration behavior changes + new recovery capability"
```

---

<!-- openspec-task: 10.3 -->

### Task 9: Run the full test suite — final green

**Files:**

- Inspect-only

- [ ] **Step 1: Full unit test sweep**

```bash
pnpm test 2>&1 | tee /tmp/phase-19-final-test.log
```

Expected: zero failures, zero skips related to the AI/agent code.

- [ ] **Step 2: Full acceptance sweep**

```bash
pnpm vitest run electron/__acceptance__/ 2>&1 | tee -a /tmp/phase-19-final-test.log
```

Expected: 100% pass.

- [ ] **Step 3: Full typecheck**

```bash
pnpm run typecheck 2>&1 | tee -a /tmp/phase-19-final-test.log
```

Expected: 0 errors across node + web tsconfigs.

- [ ] **Step 4: Production build**

```bash
pnpm run build 2>&1 | tee -a /tmp/phase-19-final-test.log
```

Expected: clean build; bundle produced in `out/`.

- [ ] **Step 5: Final empty commit marking the verification**

```bash
git commit --allow-empty -m "test: full suite green; build clean — phase 19 ready for archive"
```

---

<!-- openspec-task: 10.4 -->

### Task 10: OpenSpec verify + archive

**Files:**

- Modify (via CLI): `openspec/changes/phase-19-ai-langchain-migration/` → archived

- [ ] **Step 1: Run OpenSpec verification**

```bash
openspec verify --change 'phase-19-ai-langchain-migration' --json
```

The verifier should report all artifacts present and all tasks completed. If any task in `tasks.md` is still unchecked, that's because `/opsx:executing-plans` did not sync it back. Investigate by running:

```bash
openspec status --change 'phase-19-ai-langchain-migration' --json
```

If a task should be done but is unchecked, manually flip the box in `openspec/changes/phase-19-ai-langchain-migration/tasks.md` before archiving.

- [ ] **Step 2: Run `/opsx:archive phase-19-ai-langchain-migration`**

In the Claude Code session, invoke:

```
/opsx:archive phase-19-ai-langchain-migration
```

The archive skill moves the change directory into `openspec/archived/<date>-phase-19-ai-langchain-migration/` and updates the project spec deltas listed in `openspec/changes/phase-19-ai-langchain-migration/specs/**`.

- [ ] **Step 3: Verify archive**

```bash
ls openspec/archived/ | grep phase-19
```

Expected: at least one entry. The original `openspec/changes/phase-19-ai-langchain-migration/` should no longer exist.

- [ ] **Step 4: Final commit (if archive added uncommitted files)**

```bash
git add openspec/
git commit -m "chore(openspec): archive phase-19-ai-langchain-migration"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Final-final verification**

```bash
pnpm run typecheck && pnpm test && pnpm run build && pnpm vitest run electron/__acceptance__/
```

Expected: all green.

- [ ] **Branch shape**

```bash
git log --oneline --since=$(date -v-7d +%Y-%m-%d) | head -40
```

Confirm the commit graph tells a clear migration story: deps → model-factory → reviewer → tools → runner → checkpointer/HITL → cleanup → docs → archive.

- [ ] **OpenSpec sync done.**
