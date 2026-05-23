# Phase 19 · AI LangChain Migration — Tasks 5.7–6.7 (Tool Cleanup + Stream Translator + Runner Core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-19-ai-langchain-migration` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the legacy registry and `parse-tool-args`; add per-tool unit tests covering schema rejection paths; extend `shared/agent-types.ts` with `callId?: string` (K1 exception #2); implement `stream-translator.ts` mapping LangGraph events → AgentEvent (8 scenarios); implement `runner.ts` (`runAgent`) that drives `agent.stream` and persists messages via the translator; flip the IPC `chat.sendUserMessage` entry to the new runner behind a feature flag.

**Architecture:** After this plan, two parallel agent paths exist in code:

1. The new path: `chat.sendUserMessage → runner.runAgent → agent.stream(...) → stream-translator → AgentEvent → IPC` (default ON).
2. The legacy path: `chat.sendUserMessage → loop.runAgent` (preserved as fallback via `process.env.AGENT_USE_LEGACY=1` for emergency rollback in same session).

HITL middleware + SqliteSaver come in Plan 4. In this plan, `createAgent` is wired with a **no-op middleware** placeholder and **no checkpointer** (or an in-memory one), so HITL-requiring tools (`update_frontmatter`) cannot reach approval flow yet — that's expected; Plan 4 closes the gap. Plan 3 still ships the IPC switch because chat sessions that never touch `update_frontmatter` work end-to-end.

**Tech Stack:** TypeScript, `@langchain/langgraph` (`createAgent`, `MemorySaver` placeholder), `@langchain/core` (`AIMessage`, `ToolMessage`, `HumanMessage`, `SystemMessage`), `vitest`.

**Dependencies on Plans 1 & 2:**

- Plan 1: `buildChatModel`, `normalize-errors`.
- Plan 2: `agentTools` array, rewritten reviewer.

**LangChain reference:** Query the `langchain-docs` MCP heavily in this plan — `createAgent`, `agent.stream({ streamMode })`, `usage_metadata`, and `Command({ resume })` semantics are easy to mis-remember. Use `mcp__langchain-docs__search_docs_by_lang_chain` with queries:

- `"createAgent langgraph systemPrompt middleware"`
- `"agent stream streamMode updates messages tuples"`
- `"AIMessage tool_calls ToolMessage tool_call_id"`
- `"Command resume thread_id configurable"`

---

<!-- openspec-task: 5.7 -->

### Task 1: Delete `electron/agent/registry.ts` + `registry.test.ts` + `bootstrap.ts`

**Files:**

- Delete: `electron/agent/registry.ts`
- Delete: `electron/agent/registry.test.ts`
- Modify: `electron/agent/bootstrap.ts` (or delete if it has no remaining responsibility)
- Modify: `electron/agent/bootstrap.test.ts` (delete if it only tested registry-coupled bootstrap)

- [ ] **Step 1: Find consumers**

Run: `grep -rn "from '.*agent/registry'\|registry\.register\|createRegistry\|bootstrapAgent" /Users/aaa/develop/workspace-ai/acornvo/electron --include='*.ts' 2>&1`

Expected: `agent/bootstrap.ts`, `ipc/handlers.ts`, `ipc/chat.ts`, `agent/loop.ts`. Each must lose its registry import before this task can complete.

- [ ] **Step 2: Detach `ipc/handlers.ts` from `registry`**

Edit `electron/ipc/handlers.ts`. Remove the import of `registry` and the `registry` key from `createChatHandlers` deps. Replace with `agentTools` (we'll drive everything through Task 3's `runAgent` which doesn't need a registry — it takes `agentTools` directly):

```diff
-import { registry } from '../agent/registry'
-import { approvalGate } from '../agent/approval'
 ...
 const chatHandlers = createChatHandlers({
-  registry,
-  approval: approvalGate,
+  // registry removed — runner consumes agentTools directly
+  // approval still wired via approvalGate UNTIL Plan 4 deletes it
+  approval: approvalGate,
   ...
 })
```

NOTE: `approvalGate` remains until Plan 4 wires HITL middleware. Don't remove it here.

- [ ] **Step 3: Detach `ipc/chat.ts` from `registry`**

Edit `electron/ipc/chat.ts`. Remove the `registry: Registry` field from `ChatDeps` and its import. The `runAgent` from Plan 3 Task 7 will take `tools` directly. For now, until Task 7 lands, the chat handler can hold an array of tools imported from `../agent/tools` directly. Update `ChatDeps`:

```diff
-import type { Registry } from '../agent/registry';
 import type { ApprovalGate } from '../agent/approval';
 ...
 export interface ChatDeps {
-  registry: Registry;
   approval: ApprovalGate;
   ...
 }
```

The current `runAgent(legacy)` call site reads `deps.registry.list()` — temporarily replace that with an empty array `[]` until Task 6 in this plan flips the call to the new runner. Note: this temporarily breaks chat for legacy code path. That is acceptable because Plan 3 ends with the runner switch.

- [ ] **Step 4: Delete the registry files**

```bash
git rm electron/agent/registry.ts electron/agent/registry.test.ts
```

If `bootstrap.ts` only existed to register tools into the legacy registry, delete it too:

```bash
git rm electron/agent/bootstrap.ts electron/agent/bootstrap.test.ts
```

If `bootstrap.ts` has other responsibilities (check first), trim out only the registry-related lines.

- [ ] **Step 5: Verify everything still compiles (loop.ts not yet deleted; will fail at runtime but should typecheck once we type-assert deps)**

Run: `pnpm run typecheck:node`

If `electron/agent/loop.ts` still imports `Registry` type, leave the import as a `type-only import` reference but inject `null`/empty list. Since `loop.ts` is deleted in Plan 6, accepting this surgical workaround now is fine. Example:

```typescript
// electron/agent/loop.ts (temporary type quiet)
import type { Tool } from '../../shared/agent-types'
type LocalRegistry = { list: () => Tool[]; get: (n: string) => Tool | undefined }
// then in chat.ts pass: registry: { list: () => [], get: () => undefined } as LocalRegistry
```

This is the minimum surgery to keep the legacy path syntactically alive until Plan 6 deletes it.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/handlers.ts electron/ipc/chat.ts electron/agent/loop.ts
git commit -m "refactor(agent): remove legacy registry + bootstrap (consumers stubbed for Plan 6 deletion)"
```

---

<!-- openspec-task: 5.8 -->

### Task 2: Delete `electron/ai/parse-tool-args.ts` + test

**Files:**

- Delete: `electron/ai/parse-tool-args.ts`
- Delete: `electron/ai/parse-tool-args.test.ts`

- [ ] **Step 1: Find consumers**

Run: `grep -rn "parse-tool-args\|parseToolArgs" /Users/aaa/develop/workspace-ai/acornvo/electron --include='*.ts' 2>&1`

Expected: only `electron/ai/providers/*.ts` reference it. Those files are deleted in Plan 5 Tasks 7–10.

- [ ] **Step 2: Decide**

If only providers use it, leave the file in place for now (deletion lands with providers in Plan 5). Mark this task complete with an empty commit:

```bash
git commit --allow-empty -m "chore(ai): defer parse-tool-args.ts deletion until provider removal (Plan 5)"
```

If nothing else uses it (e.g. after Plan 5 already finished out-of-order), proceed with deletion:

```bash
git rm electron/ai/parse-tool-args.ts electron/ai/parse-tool-args.test.ts
git commit -m "refactor(ai): remove parse-tool-args.ts (Zod tool schemas replace it)"
```

---

<!-- openspec-task: 5.9 -->

### Task 3: Add cross-tool edge-case tests (schema rejection + path safety)

**Files:**

- Modify: each tool's `*.test.ts` (search_files, read_file, list_tags, update_frontmatter, clip_summary)

Plan 2 already added basic coverage. This task adds:

- A "Zod rejects invalid args" case to each tool.
- For path-aware tools (`read_file`, `update_frontmatter`): a "path escape" + "missing vaultRoot configurable" case.

- [ ] **Step 1: Audit existing coverage**

Run: `pnpm vitest run --coverage electron/agent/tools/ 2>&1 | head -80`
Identify gaps. The most common gaps after Plan 2:

- `search_files`: limit > 20 still returns capped result, but Zod schema also rejects limit > 20 — need a "Zod path" assertion that bypasses schema (calling `.invoke` with raw args might still trigger Zod).
- `read_file`: missing `vaultRoot` from configurable throws (not returned as ok:false).
- `clip_summary`: `force` defaulting.

- [ ] **Step 2: Add the missing tests**

For `search_files.test.ts`, append:

```typescript
it('rejects limit > 20 via Zod schema', async () => {
  await expect(searchFilesTool.invoke({ query: 'q', limit: 50 } as any)).rejects.toThrow()
})
```

Wait — Plan 2 set `limit: z.number().int().min(1).max(20).optional()` so Zod rejects out-of-range at schema parse. But Plan 2's "caps limit" test passed `limit: 100`. That test will fail under the strict schema. Reconcile: either remove the `.max(20)` from the schema and rely on runtime clamp (matches the OLD JSON-Schema behavior more closely), OR keep the strict schema and update tests. Recommendation: keep strict schema, since the OpenSpec design favors Zod-first; update Plan 2's test by removing the `limit: 100` case. Verify by re-running Plan 2's `search_files.test.ts` if it fails.

For `read_file.test.ts`, append:

```typescript
it('throws when vaultRoot is missing from configurable', async () => {
  await expect(readFileTool.invoke({ path: 'a.md' }, { configurable: {} })).rejects.toThrow(
    /vaultRoot missing/
  )
})
```

For `update_frontmatter.test.ts`, append:

```typescript
it('throws when vaultRoot is missing from configurable', async () => {
  await expect(
    updateFrontmatterTool.invoke({ path: 'a.md', patch: {}, reason: 'r' }, { configurable: {} })
  ).rejects.toThrow(/vaultRoot missing/)
})

it('returns E_MISSING_REASON for missing reason (Zod rejects empty)', async () => {
  await expect(
    updateFrontmatterTool.invoke({ path: 'a.md', patch: {}, reason: '' } as any, {
      configurable: { vaultRoot: '/tmp' }
    })
  ).rejects.toThrow() // Zod schema rejects before our runtime check fires
})
```

For `list_tags.test.ts`, append:

```typescript
it('rejects limit > 200 via Zod', async () => {
  await expect(listTagsTool.invoke({ limit: 999 } as any)).rejects.toThrow()
})
```

For `clip_summary.test.ts`, append:

```typescript
it('defaults force to undefined (treated as falsy by reviewer)', async () => {
  ;(reviewClip as any).mockResolvedValueOnce({ result: { summary: '' }, cacheHit: true })
  await clipSummaryTool.invoke({ clipId: '1' })
  expect(reviewClip).toHaveBeenCalledWith(1, { force: false })
})
```

- [ ] **Step 3: Run all tool tests + commit**

```bash
pnpm vitest run electron/agent/tools/
git add electron/agent/tools/*.test.ts
git commit -m "test(agent): add cross-tool Zod rejection + missing-configurable cases"
```

---

<!-- openspec-task: 6.1 -->

### Task 4: Extend `shared/agent-types.ts` (K1 exception #2: optional `callId`) and implement `stream-translator.ts`

**Files:**

- Modify: `shared/agent-types.ts`
- Modify: `shared/agent-types.test.ts` (if it exists — add 1 assertion)
- Create: `electron/agent/stream-translator.ts`

The 8 mapping scenarios are listed in `design.md`'s "Stream Translator 事件映射表":

| LangGraph output                                                       | AgentEvent                                  |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| 1. `["updates", { model: { messages: [AIMessage] } }]` no tool_calls   | `message.appended` + persist                |
| 2. `["updates", { model: { messages: [AIMessage with tool_calls] } }]` | `message.appended` + N×`tool.start{callId}` |
| 3. `["updates", { tools: { messages: [ToolMessage] } }]`               | `tool.result{callId}` + persist             |
| 4. `["messages", [AIMessageChunk, metadata]]`                          | `token{text}` (model node only)             |
| 5. `result.__interrupt__` with action_requests                         | `tool.approval-needed{callId, tool, args}`  |
| 6. LangChain non-Abort error                                           | `error{ error: normalize(...) }`            |
| 7. `AbortError` / signal aborted                                       | `canceled`                                  |
| 8. Final message → aggregate usage                                     | `done{usage}` + `aiUsage.insert(...)`       |

- [ ] **Step 1: Extend `shared/agent-types.ts`**

Edit `shared/agent-types.ts`. Add the `callId` field to `tool.start` and `tool.result`:

```diff
 export type AgentEvent =
   | { type: 'message.appended'; message: SessionMessage }
   | { type: 'step.start'; step: number }
   | { type: 'token'; text: string }
   | { type: 'tool.approval-needed'; callId: string; tool: string; args: unknown; reason?: string }
-  | { type: 'tool.start'; tool: string; args: unknown }
-  | { type: 'tool.result'; tool: string; result: ToolResult }
+  | { type: 'tool.start'; tool: string; args: unknown; callId?: string }
+  | { type: 'tool.result'; tool: string; result: ToolResult; callId?: string }
   | { type: 'done'; usage?: TokenUsage }
   | { type: 'error'; error: string; detail?: unknown }
   | { type: 'canceled' };
```

- [ ] **Step 2: Lock the additive change in tests**

Edit `shared/agent-types.test.ts` (or create one):

```typescript
import { describe, it, expect } from 'vitest'
import type { AgentEvent } from './agent-types'

describe('AgentEvent — K1 exception #2 (additive callId)', () => {
  it('tool.start accepts an optional callId', () => {
    const e: AgentEvent = { type: 'tool.start', tool: 'x', args: {}, callId: 'cid-1' }
    expect(e.callId).toBe('cid-1')
  })

  it('tool.start works without callId (back-compat for old renderers)', () => {
    const e: AgentEvent = { type: 'tool.start', tool: 'x', args: {} }
    expect((e as any).callId).toBeUndefined()
  })

  it('tool.result accepts an optional callId', () => {
    const e: AgentEvent = {
      type: 'tool.result',
      tool: 'x',
      result: { ok: true, data: 1 },
      callId: 'cid-1'
    }
    expect(e.callId).toBe('cid-1')
  })
})
```

- [ ] **Step 3: Look up exact `AIMessage` / `ToolMessage` import paths and `usage_metadata` shape**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with:

- `"AIMessage tool_calls usage_metadata input_tokens output_tokens"`
- `"ToolMessage tool_call_id name content"`
- `"AIMessageChunk streaming text content"`
- `"agent.stream streamMode updates messages tuple shape"`

Document the import paths in a comment at top of `stream-translator.ts`. Likely:

```typescript
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  isAIMessage,
  isAIMessageChunk,
  isToolMessage
} from '@langchain/core/messages'
```

- [ ] **Step 4: Implement `stream-translator.ts`**

Create `electron/agent/stream-translator.ts`:

```typescript
import type { AgentEvent, SessionMessage, ToolCall, ToolResult } from '../../shared/agent-types'
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
  isAIMessage,
  isAIMessageChunk,
  isToolMessage
} from '@langchain/core/messages'
import { normalizeLLMError } from '../ai/normalize-errors'

const TOOL_RESULT_BUDGET = 8000

export interface TranslatorPersistence {
  appendMessage: (
    m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
  ) => Promise<SessionMessage>
  recordToolCall: (
    tc: ToolCall,
    opts: { sideEffect: boolean; messageId?: number }
  ) => Promise<string>
  finishToolCall: (rowId: string, fields: { result: ToolResult }) => Promise<void>
}

export interface TranslatorDeps {
  emit: (e: AgentEvent) => void
  persist: TranslatorPersistence
  recordUsage: (
    usage: { input_tokens?: number; output_tokens?: number } | undefined,
    model: string
  ) => void
  /** AIMessage.id values already persisted; used to skip duplicates after HITL resume. */
  seenAiMessageIds: Set<string>
  /** Map from LangGraph tool_call_id → DB tool_calls row id (for finishing). */
  toolCallRowIdByCallId: Map<string, string>
}

/** Helper: did we persist this AI message yet? */
function alreadySeen(seen: Set<string>, msg: AIMessage): boolean {
  const id = (msg as any).id ?? ''
  if (!id) return false
  if (seen.has(id)) return true
  seen.add(id)
  return false
}

function aiMessageToolCalls(msg: AIMessage): ToolCall[] {
  return ((msg as any).tool_calls ?? []).map((tc: any) => ({
    id: String(tc.id ?? ''),
    name: String(tc.name ?? ''),
    args: tc.args ?? {}
  }))
}

/** Scenario 1 + 2: assistant message from "model" node. */
async function handleAssistantMessage(deps: TranslatorDeps, msg: AIMessage): Promise<void> {
  if (alreadySeen(deps.seenAiMessageIds, msg)) return

  const toolCalls = aiMessageToolCalls(msg)
  const sessionMsg = await deps.persist.appendMessage({
    role: 'assistant',
    content: typeof (msg as any).content === 'string' ? (msg as any).content : null,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined
  })
  deps.emit({ type: 'message.appended', message: sessionMsg })

  for (const tc of toolCalls) {
    deps.emit({ type: 'tool.start', tool: tc.name, args: tc.args, callId: tc.id })
    const rowId = await deps.persist.recordToolCall(tc, {
      sideEffect: tc.name === 'update_frontmatter',
      messageId: sessionMsg.id
    })
    deps.toolCallRowIdByCallId.set(tc.id, rowId)
  }
}

/** Scenario 3: tool result from "tools" node. */
async function handleToolMessage(deps: TranslatorDeps, msg: ToolMessage): Promise<void> {
  const callId = String((msg as any).tool_call_id ?? '')
  const toolName = String((msg as any).name ?? '')
  let result: ToolResult
  const raw = (msg as any).content

  // Tool functions in this codebase return { ok, data } / { ok:false, error }.
  // When LangGraph serializes the tool's return value into a ToolMessage,
  // content is either a stringified version of the return or the raw value.
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      result =
        parsed && typeof parsed === 'object' && 'ok' in parsed
          ? (parsed as ToolResult)
          : { ok: true, data: parsed }
    } catch {
      result = { ok: true, data: raw }
    }
  } else if (raw && typeof raw === 'object' && 'ok' in raw) {
    result = raw as ToolResult
  } else {
    result = { ok: true, data: raw }
  }

  const persisted = await deps.persist.appendMessage({
    role: 'tool',
    content: JSON.stringify(result).slice(0, TOOL_RESULT_BUDGET),
    toolCallId: callId
  })
  deps.emit({ type: 'message.appended', message: persisted })
  deps.emit({ type: 'tool.result', tool: toolName, result, callId })

  const rowId = deps.toolCallRowIdByCallId.get(callId)
  if (rowId) {
    await deps.persist.finishToolCall(rowId, { result })
    deps.toolCallRowIdByCallId.delete(callId)
  }
}

/** Scenario 5: interrupt resume needed. */
function handleInterrupt(deps: TranslatorDeps, interrupt: any): void {
  for (const action of interrupt.action_requests ?? interrupt.requests ?? []) {
    deps.emit({
      type: 'tool.approval-needed',
      callId: String(interrupt.id ?? action.id ?? ''),
      tool: String(action.action ?? action.tool ?? ''),
      args: action.args ?? {},
      reason: typeof action.args?.reason === 'string' ? action.args.reason : undefined
    })
  }
}

/**
 * Translate one LangGraph stream entry. `streamMode` was set to
 * ['updates', 'messages'] so each entry is a tuple `[mode, payload]`.
 *
 * Scenarios 1, 2, 3, 4 covered here. Scenarios 5, 6, 7, 8 are wired by the
 * runner (interrupt detection, error catch, abort signal, final usage).
 */
export async function translateStreamEntry(
  deps: TranslatorDeps,
  entry: unknown,
  modelName: string
): Promise<void> {
  if (!Array.isArray(entry) || entry.length < 2) return
  const [mode, payload] = entry as [string, any]

  if (mode === 'updates') {
    // Possible payload shapes:
    //   { model: { messages: [AIMessage] }, ... }   ← scenarios 1 + 2
    //   { tools: { messages: [ToolMessage] }, ... } ← scenario 3
    const nodes = payload ?? {}
    for (const nodeKey of Object.keys(nodes)) {
      const node = nodes[nodeKey]
      const messages: unknown[] = node?.messages ?? []
      for (const m of messages) {
        if (isAIMessage(m as any)) await handleAssistantMessage(deps, m as AIMessage)
        else if (isToolMessage(m as any)) await handleToolMessage(deps, m as ToolMessage)
      }
    }
    return
  }

  if (mode === 'messages') {
    // payload is [AIMessageChunk, metadata]; metadata.langgraph_node tells us which node
    // the chunk came from. Only emit tokens for the model node.
    const [chunk, metadata] = payload as [AIMessageChunk, { langgraph_node?: string }]
    if (metadata?.langgraph_node !== 'model') return
    if (!isAIMessageChunk(chunk as any)) return
    const text = typeof (chunk as any).content === 'string' ? (chunk as any).content : ''
    if (text) deps.emit({ type: 'token', text })
    return
  }
}

/** Scenario 5 standalone entry point. The runner calls this after `agent.stream` completes
 *  if `result.__interrupt__` is present (it short-circuits the loop). */
export function emitInterrupt(deps: TranslatorDeps, interrupt: any): void {
  handleInterrupt(deps, interrupt)
}

/** Scenario 6: runner caught a non-Abort error. */
export function emitError(deps: TranslatorDeps, err: unknown): void {
  try {
    const norm = normalizeLLMError(err) // throws for AbortError; runner handles that separately
    deps.emit({ type: 'error', error: norm.code, detail: norm.message })
  } catch (e) {
    // AbortError fell through normalizeLLMError's throw — runner should call emitCanceled instead.
    deps.emit({ type: 'canceled' })
  }
}

/** Scenario 7: aborted. */
export function emitCanceled(deps: TranslatorDeps): void {
  deps.emit({ type: 'canceled' })
}

/** Scenario 8: final message + done. */
export function emitDone(
  deps: TranslatorDeps,
  finalUsage: { input_tokens?: number; output_tokens?: number } | undefined,
  modelName: string
): void {
  deps.recordUsage(finalUsage, modelName)
  deps.emit({
    type: 'done',
    usage: finalUsage
      ? {
          promptTokens: finalUsage.input_tokens ?? 0,
          completionTokens: finalUsage.output_tokens ?? 0
        }
      : undefined
  })
}
```

Notes:

- `isAIMessage` / `isToolMessage` / `isAIMessageChunk` are LangChain typeguards from `@langchain/core/messages`. If they're not exported in v1, use `m instanceof AIMessage` / `instanceof ToolMessage` / `instanceof AIMessageChunk` instead.
- The `sideEffect` flag for `update_frontmatter` is hardcoded here — it could be moved into the tool itself if we want a cleaner API later.
- `TokenUsage` shape (`promptTokens` / `completionTokens`) matches the existing `shared/ai-types.ts`. Verify by reading that file.

- [ ] **Step 5: Run typecheck**

Run: `pnpm run typecheck:node && pnpm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add shared/agent-types.ts shared/agent-types.test.ts electron/agent/stream-translator.ts
git commit -m "feat(agent): add stream-translator + agent-types callId field (K1 exception #2)"
```

---

<!-- openspec-task: 6.2 -->

### Task 5: Test `stream-translator.ts` against all 8 scenarios

**Files:**

- Create: `electron/agent/stream-translator.test.ts`

- [ ] **Step 1: Write the test file**

Create `electron/agent/stream-translator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages'
import {
  translateStreamEntry,
  emitInterrupt,
  emitError,
  emitCanceled,
  emitDone,
  type TranslatorDeps
} from './stream-translator'

function makeDeps(): TranslatorDeps & { events: any[]; persisted: any[]; tcRows: any[] } {
  const events: any[] = []
  const persisted: any[] = []
  const tcRows: any[] = []
  return {
    events,
    persisted,
    tcRows,
    emit: (e) => events.push(e),
    persist: {
      appendMessage: async (m) => {
        persisted.push(m)
        return { id: persisted.length, sessionId: 's1', createdAt: 't', ...m } as any
      },
      recordToolCall: async (tc, opts) => {
        tcRows.push({ tc, opts })
        return `row-${tcRows.length}`
      },
      finishToolCall: async (rowId, fields) => {
        tcRows.push({ finished: rowId, fields })
      }
    },
    recordUsage: vi.fn(),
    seenAiMessageIds: new Set(),
    toolCallRowIdByCallId: new Map()
  } as any
}

describe('translateStreamEntry — scenario 1: assistant text only', () => {
  it('emits message.appended (no tool_calls) for an AIMessage with content', async () => {
    const deps = makeDeps()
    const msg = new AIMessage({ content: 'hello', id: 'ai-1' })
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x')
    expect(deps.events).toEqual([
      expect.objectContaining({
        type: 'message.appended',
        message: expect.objectContaining({ role: 'assistant', content: 'hello' })
      })
    ])
    expect(deps.persisted[0]).toMatchObject({ role: 'assistant', content: 'hello' })
  })
})

describe('translateStreamEntry — scenario 2: assistant with tool_calls', () => {
  it('emits message.appended + N×tool.start with callId', async () => {
    const deps = makeDeps()
    const msg = new AIMessage({
      content: '',
      tool_calls: [
        { id: 'cid-1', name: 'search_files', args: { query: 'x' } },
        { id: 'cid-2', name: 'read_file', args: { path: 'a.md' } }
      ],
      id: 'ai-2'
    } as any)
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x')
    expect(deps.events[0]).toMatchObject({ type: 'message.appended' })
    expect(deps.events[1]).toMatchObject({
      type: 'tool.start',
      tool: 'search_files',
      callId: 'cid-1'
    })
    expect(deps.events[2]).toMatchObject({ type: 'tool.start', tool: 'read_file', callId: 'cid-2' })
    expect(deps.toolCallRowIdByCallId.get('cid-1')).toBe('row-1')
  })
})

describe('translateStreamEntry — scenario 3: ToolMessage with tool_call_id', () => {
  it('emits tool.result + persists tool message with callId', async () => {
    const deps = makeDeps()
    deps.toolCallRowIdByCallId.set('cid-1', 'row-99')
    const tm = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { items: [] } }),
      tool_call_id: 'cid-1',
      name: 'search_files'
    } as any)
    await translateStreamEntry(deps, ['updates', { tools: { messages: [tm] } }], 'gpt-x')
    expect(deps.events.some((e) => e.type === 'tool.result' && e.callId === 'cid-1')).toBe(true)
    expect(deps.tcRows.some((r) => r.finished === 'row-99')).toBe(true)
  })
})

describe('translateStreamEntry — scenario 4: streaming tokens', () => {
  it('emits token events for AIMessageChunk from the model node', async () => {
    const deps = makeDeps()
    const chunk = new AIMessageChunk({ content: 'hel' })
    await translateStreamEntry(deps, ['messages', [chunk, { langgraph_node: 'model' }]], 'gpt-x')
    expect(deps.events).toEqual([{ type: 'token', text: 'hel' }])
  })

  it('ignores chunks from other nodes', async () => {
    const deps = makeDeps()
    const chunk = new AIMessageChunk({ content: 'x' })
    await translateStreamEntry(deps, ['messages', [chunk, { langgraph_node: 'tools' }]], 'gpt-x')
    expect(deps.events).toEqual([])
  })
})

describe('emitInterrupt — scenario 5: HITL request', () => {
  it('emits tool.approval-needed with callId from interrupt id', () => {
    const deps = makeDeps()
    emitInterrupt(deps, {
      id: 'int-1',
      action_requests: [
        { action: 'update_frontmatter', args: { path: 'a.md', patch: {}, reason: 'do it' } }
      ]
    })
    expect(deps.events).toEqual([
      {
        type: 'tool.approval-needed',
        callId: 'int-1',
        tool: 'update_frontmatter',
        args: { path: 'a.md', patch: {}, reason: 'do it' },
        reason: 'do it'
      }
    ])
  })
})

describe('emitError — scenario 6: non-Abort error', () => {
  it('emits error with normalized code', () => {
    const deps = makeDeps()
    emitError(deps, Object.assign(new Error('Unauthorized'), { status: 401 }))
    expect(deps.events[0]).toMatchObject({ type: 'error', error: 'E_AUTH' })
  })
})

describe('emitCanceled — scenario 7', () => {
  it('emits a canceled event', () => {
    const deps = makeDeps()
    emitCanceled(deps)
    expect(deps.events).toEqual([{ type: 'canceled' }])
  })
})

describe('emitDone — scenario 8: final usage', () => {
  it('emits done with usage and calls recordUsage', () => {
    const deps = makeDeps()
    emitDone(deps, { input_tokens: 100, output_tokens: 50 }, 'gpt-x')
    expect(deps.events).toEqual([
      { type: 'done', usage: { promptTokens: 100, completionTokens: 50 } }
    ])
    expect(deps.recordUsage).toHaveBeenCalledWith({ input_tokens: 100, output_tokens: 50 }, 'gpt-x')
  })
})

describe('translateStreamEntry — idempotency', () => {
  it('skips assistant messages with already-seen AIMessage.id', async () => {
    const deps = makeDeps()
    deps.seenAiMessageIds.add('ai-x')
    const msg = new AIMessage({ content: 'duplicate', id: 'ai-x' })
    await translateStreamEntry(deps, ['updates', { model: { messages: [msg] } }], 'gpt-x')
    expect(deps.events).toEqual([])
    expect(deps.persisted).toEqual([])
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run electron/agent/stream-translator.test.ts
git add electron/agent/stream-translator.test.ts
git commit -m "test(agent): cover stream-translator across all 8 LangGraph→AgentEvent scenarios"
```

---

<!-- openspec-task: 6.3 -->

### Task 6: Implement `electron/agent/runner.ts`

**Files:**

- Create: `electron/agent/runner.ts`

- [ ] **Step 1: Look up `createAgent` signature**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with:

- `"createAgent from langchain agents systemPrompt tools middleware checkpointer"`
- `"agent.stream messages configurable thread_id streamMode signal"`

Confirm:

- `createAgent` lives at `langchain/agents` (or `@langchain/langgraph/prebuilt`) — check exact import.
- `agent.stream(input, config)` returns an async iterable of `[streamMode, payload]` tuples when `streamMode` is `['updates', 'messages']`.
- `config.configurable.thread_id` is the checkpoint key.
- `config.signal` is honored.

- [ ] **Step 2: Write the runner**

Create `electron/agent/runner.ts`:

```typescript
import type {
  AgentEvent,
  RunAgentArgs,
  SessionMessage,
  ToolCall,
  ToolResult,
  Attachment
} from '../../shared/agent-types'
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { collectAttachmentContext } from './attachments'
import {
  translateStreamEntry,
  emitInterrupt,
  emitError,
  emitCanceled,
  emitDone,
  type TranslatorDeps
} from './stream-translator'
import { getPerf } from '../obs/perf'

export interface RunnerDeps {
  /** Built once at app start in `agent/runner.ts` consumer; passed in for testability. */
  agent: {
    stream(
      input: { messages: any[] },
      config: {
        configurable: { thread_id: string }
        streamMode: ['updates', 'messages']
        signal: AbortSignal
      }
    ): AsyncIterable<unknown>
  }
  sessions: {
    appendMessage: (
      sessionId: string,
      m: Omit<SessionMessage, 'id' | 'sessionId' | 'createdAt'>
    ) => Promise<SessionMessage>
    recordToolCall: (
      sessionId: string,
      tc: ToolCall,
      opts: { sideEffect: boolean; messageId?: number }
    ) => Promise<string>
    finishToolCall: (rowId: string, fields: { result: ToolResult }) => Promise<void>
  }
  systemPrompt: string
  vaultRoot: string
  cancel: AbortSignal
  clipsGet?: (id: number) => Promise<{ body: string } | null>
  /** Records token usage; reviewer and other paths share this. */
  recordUsage: (
    usage: { input_tokens?: number; output_tokens?: number } | undefined,
    model: string
  ) => void
  /** Profile.model — used for usage row's `model` column. */
  modelName: string
}

type RunAgentArgsInternal = Omit<RunAgentArgs, 'deps'> & { deps: RunnerDeps }

function toLangChainMessages(
  systemPrompt: string,
  history: SessionMessage[],
  preUser: string | null,
  userText: string
): any[] {
  const out: any[] = [new SystemMessage(systemPrompt)]
  if (preUser) out.push(new HumanMessage(preUser))
  for (const m of history) {
    if (m.role === 'user') out.push(new HumanMessage(m.content ?? ''))
    else if (m.role === 'assistant') {
      out.push(
        new AIMessage({
          content: m.content ?? '',
          tool_calls:
            m.toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args ?? {} })) ?? []
        } as any)
      )
    } else if (m.role === 'tool') {
      out.push(
        new ToolMessage({
          content: m.content ?? '',
          tool_call_id: m.toolCallId ?? ''
        } as any)
      )
    } else if (m.role === 'system') {
      // Skip: we already prepended the canonical system prompt.
    }
  }
  out.push(new HumanMessage(userText))
  return out
}

export async function runAgent({
  sessionId,
  userText,
  profileId: _profileId,
  history,
  deps,
  streamWriter,
  attachments
}: RunAgentArgsInternal): Promise<void> {
  const emit = (e: AgentEvent) => streamWriter.write(e)
  const cancel = deps.cancel
  const perf = getPerf()
  const end = perf?.start('agent.run', { sessionId })

  // Append + emit the user message immediately (truth source).
  const userMsg = await deps.sessions.appendMessage(sessionId, { role: 'user', content: userText })
  emit({ type: 'message.appended', message: userMsg })
  const fullHistory = [...history, userMsg]

  // Collect attachments → synthesize a pre-user block (NOT persisted in session_messages).
  let preUserBlock: string | null = null
  if (attachments && attachments.length > 0 && deps.clipsGet) {
    const result = await collectAttachmentContext(attachments, {
      groveRoot: deps.vaultRoot,
      clipsGet: deps.clipsGet
    })
    if (result.blocks.length > 0) {
      preUserBlock = '以下是我附加的内容供你参考：\n' + result.blocks.join('')
    }
  }

  const translatorDeps: TranslatorDeps = {
    emit,
    persist: {
      appendMessage: (m) => deps.sessions.appendMessage(sessionId, m),
      recordToolCall: (tc, opts) => deps.sessions.recordToolCall(sessionId, tc, opts),
      finishToolCall: (rowId, fields) => deps.sessions.finishToolCall(rowId, fields)
    },
    recordUsage: deps.recordUsage,
    seenAiMessageIds: new Set(),
    toolCallRowIdByCallId: new Map()
  }

  // Note: the user message we just persisted is included in `fullHistory`; we do NOT
  // pass it AGAIN at the end of toLangChainMessages because `fullHistory` already
  // contains it. The legacy loop did the same — verify by re-reading the code below
  // before shipping.
  const messages = toLangChainMessages(
    deps.systemPrompt,
    fullHistory.slice(0, -1), // history before the new user message
    preUserBlock,
    userText
  )

  let lastUsage: { input_tokens?: number; output_tokens?: number } | undefined
  let lastAiMessageContent: string | undefined

  try {
    const stream = deps.agent.stream(
      { messages },
      {
        configurable: { thread_id: sessionId },
        streamMode: ['updates', 'messages'],
        signal: cancel
      }
    )

    for await (const entry of stream) {
      if (cancel.aborted) {
        emitCanceled(translatorDeps)
        end?.({ ok: true, meta: { canceled: true } })
        return
      }
      await translateStreamEntry(translatorDeps, entry, deps.modelName)

      // Capture last usage_metadata from any AIMessage we see (Scenario 8 needs it).
      const [mode, payload] = entry as [string, any]
      if (mode === 'updates' && payload?.model?.messages) {
        for (const m of payload.model.messages) {
          const u = (m as any)?.usage_metadata
          if (u) lastUsage = u
          if (typeof (m as any)?.content === 'string') lastAiMessageContent = (m as any).content
        }
      }
    }

    // After the stream completes, check whether the agent paused at an interrupt.
    // LangGraph stream-mode does NOT yield __interrupt__ in `updates`; we must
    // inspect the state via the agent's get_state() — or wait: in v1 the interrupt
    // appears directly in the stream as a dedicated payload. Verify with MCP and
    // adapt this block accordingly. Common pattern:
    //
    //   const state = await deps.agent.getState({ configurable: { thread_id: sessionId } });
    //   if (state?.tasks?.some(t => t.interrupts?.length)) {
    //     for (const t of state.tasks) for (const ir of t.interrupts ?? []) {
    //       emitInterrupt(translatorDeps, ir);
    //     }
    //     // Don't emit done — we're suspended.
    //     end?.({ ok: true, meta: { interrupted: true } });
    //     return;
    //   }
    //
    // For Plan 3 we don't have HITL enabled yet, so this block is a no-op placeholder.

    emitDone(translatorDeps, lastUsage, deps.modelName)
    end?.({ ok: true })
  } catch (err: any) {
    if (err?.name === 'AbortError' || cancel.aborted) {
      emitCanceled(translatorDeps)
      end?.({ ok: true, meta: { canceled: true } })
      return
    }
    emitError(translatorDeps, err)
    end?.({ ok: false, meta: { error: err?.code ?? 'E_UNKNOWN' } })
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors.

If `getState` isn't on the createAgent prebuilt's surface, drop the interrupt-checking comment block and document that Plan 4 wires it.

- [ ] **Step 4: Commit**

```bash
git add electron/agent/runner.ts
git commit -m "feat(agent): add runner.ts driving agent.stream + stream-translator"
```

---

<!-- openspec-task: 6.4 -->

### Task 7: Change `chat-agent.ts` to export a string (not a message object)

**Files:**

- Modify: `electron/ai/prompts/chat-agent.ts`
- Modify: `electron/ai/prompts/chat-agent.test.ts`
- Modify: every consumer of the old `{ role:'system', content }` export

- [ ] **Step 1: Find consumers**

Run: `grep -rn "chatAgentSystemPrompt\b" /Users/aaa/develop/workspace-ai/acornvo --include='*.ts' 2>&1`

Expected: `electron/ipc/chat.ts` and `electron/agent/loop.ts` (legacy). The new runner takes `systemPrompt: string` directly.

- [ ] **Step 2: Rewrite the prompt module**

Replace `electron/ai/prompts/chat-agent.ts`:

```typescript
export interface ChatAgentPromptCtx {
  vaultName: string
  locale?: 'zh' | 'en'
}

export function chatAgentSystemPrompt(ctx: ChatAgentPromptCtx): string {
  const isZh = (ctx.locale ?? 'zh') === 'zh'
  return isZh
    ? `你是 Acornvo 的内置助手"松语"，正在帮助用户管理他们的"树林" \`${ctx.vaultName}\`。你的原则：
- 尽量用工具验证事实，不要凭空猜测文件内容。
- 修改文件前必须说明原因 (reason)，并接受用户确认。
- 回答简洁；引用文件时使用相对路径。
- 只处理用户树林内的内容；拒绝越界请求 (../ 等绝对路径要拒绝)。`
    : `You are "Sōngyǔ", Acornvo's built-in assistant for the user's grove \`${ctx.vaultName}\`.
- Verify facts with tools — do not guess file contents.
- Before modifying any file you MUST include a "reason" and wait for the user's approval.
- Be concise; cite files by their relative path.
- Stay inside the grove; refuse path-escape attempts (../, absolute paths).`
}
```

- [ ] **Step 3: Update consumers**

In `electron/ipc/chat.ts`, replace:

```diff
-      systemPrompt: () =>
-        chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot()), locale: 'zh' }),
+      systemPrompt: chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot()), locale: 'zh' }),
```

(This becomes Task 9's full IPC wiring; for now just rewrite the prompt module + test.)

In `electron/agent/loop.ts` (legacy, still in repo), update its system-prompt usage to wrap the string back into the message-object form it expects:

```diff
-      const llmMessages: { role: string; content: string; toolCalls?: any; toolCallId?: string }[] = [
-        deps.systemPrompt(),
-      ];
+      const sysContent = typeof deps.systemPrompt === 'function' ? deps.systemPrompt() : deps.systemPrompt;
+      const llmMessages: { role: string; content: string; toolCalls?: any; toolCallId?: string }[] = [
+        typeof sysContent === 'string' ? { role: 'system', content: sysContent } : sysContent,
+      ];
```

This keeps the legacy path alive through Plan 6.

- [ ] **Step 4: Update test**

Replace `electron/ai/prompts/chat-agent.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { chatAgentSystemPrompt } from './chat-agent'

describe('chatAgentSystemPrompt', () => {
  it('returns a Chinese system prompt by default', () => {
    const s = chatAgentSystemPrompt({ vaultName: 'my-grove' })
    expect(typeof s).toBe('string')
    expect(s).toContain('my-grove')
    expect(s).toContain('松语')
  })

  it('returns an English prompt when locale is en', () => {
    const s = chatAgentSystemPrompt({ vaultName: 'g', locale: 'en' })
    expect(s).toContain('Sōngyǔ')
    expect(s).toContain('g')
  })
})
```

- [ ] **Step 5: Run + commit**

```bash
pnpm vitest run electron/ai/prompts/chat-agent.test.ts
pnpm run typecheck:node
git add electron/ai/prompts/chat-agent.ts electron/ai/prompts/chat-agent.test.ts electron/ipc/chat.ts electron/agent/loop.ts
git commit -m "refactor(ai): chatAgentSystemPrompt returns a string for createAgent({ systemPrompt })"
```

---

<!-- openspec-task: 6.5 -->

### Task 8: Construct the `createAgent` singleton at app start (placeholder HITL + checkpointer)

**Files:**

- Create: `electron/agent/agent-singleton.ts`
- Modify: `electron/ipc/handlers.ts` (or wherever app init runs)

- [ ] **Step 1: Look up `createAgent` import path**

Run via MCP: `mcp__langchain-docs__search_docs_by_lang_chain` with `"createAgent v1 import path tools systemPrompt"`. In LangChain v1 it's typically:

```typescript
import { createAgent } from 'langchain/agents'
// or:
import { createReactAgent } from '@langchain/langgraph/prebuilt'
```

The OpenSpec design uses `createAgent` — favor that name if both exist; the `langchain` package is already a dep.

- [ ] **Step 2: Create the singleton module**

Create `electron/agent/agent-singleton.ts`:

```typescript
import { createAgent } from 'langchain/agents'
import { MemorySaver } from '@langchain/langgraph'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { agentTools } from './tools'
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory'

interface SingletonHandle {
  buildForProfile: (profile: ResolvedProfile) => ReturnType<typeof createAgent>
}

let handle: SingletonHandle | null = null

/**
 * Returns a function that produces an agent for a given profile. The model is
 * provider/profile-specific so we re-bind on each call; the tools array and
 * middleware/checkpointer placeholders are stable across profiles.
 *
 * In Plan 4 Task 3 the MemorySaver placeholder is swapped for SqliteSaver.
 * In Plan 4 Task 4 a real humanInTheLoopMiddleware joins the array.
 */
export function getAgentBuilder(): SingletonHandle {
  if (handle) return handle
  const checkpointer = new MemorySaver()
  handle = {
    buildForProfile: (profile: ResolvedProfile) => {
      const model = buildChatModel(profile) as unknown as BaseChatModel
      return createAgent({
        model,
        tools: agentTools as any,
        // systemPrompt is injected per-call by the runner via the messages array.
        // middleware: [], // Plan 4 wires humanInTheLoopMiddleware here.
        checkpointer
      })
    }
  }
  return handle
}

/** Test helper — reset the singleton. */
export function __resetAgentSingleton(): void {
  handle = null
}
```

- [ ] **Step 3: No test file in this task** — the wiring is integration-level. Plan 3 Task 10 covers it via the runner test, and Plan 4 Task 1 (acceptance) exercises end-to-end.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:node`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/agent-singleton.ts
git commit -m "feat(agent): add createAgent singleton (MemorySaver placeholder for Plan 4 swap)"
```

---

<!-- openspec-task: 6.6 -->

### Task 9: Switch IPC `chat.sendUserMessage` to the new runner

**Files:**

- Modify: `electron/ipc/chat.ts`
- Modify: `electron/ipc/handlers.ts` (deps wiring)

- [ ] **Step 1: Add a feature-flag gate**

The new runner is default-ON. Add an env-variable kill switch so we can fall back to legacy without redeploying. In `electron/ipc/chat.ts`:

```typescript
const USE_LEGACY_AGENT = process.env.AGENT_USE_LEGACY === '1'
```

- [ ] **Step 2: Rewrite `chat.ts` to call the new runner**

Replace `electron/ipc/chat.ts`'s `sendUserMessage` body:

```typescript
import { runAgent as runAgentNew } from '../agent/runner';
import { runAgent as runAgentLegacy } from '../agent/loop';
import { getAgentBuilder } from '../agent/agent-singleton';
import { buildChatModel, type ResolvedProfile } from '../ai/model-factory';
import { aiUsage } from '../ai/usage';
import { dbService } from '../services/db';
import { getProfileDecryptedKey } from '../settings/profile-key';
import { IpcError } from '../../shared/ipc-contract';

// (existing imports kept)

const USE_LEGACY_AGENT = process.env.AGENT_USE_LEGACY === '1';

function resolveProfile(profileId: string): ResolvedProfile {
  const db = dbService.requireCurrent();
  const p = db
    .prepare('SELECT * FROM ai_provider_profiles WHERE id = ?')
    .get(profileId) as {
      id: string; provider: string; model: string; base_url: string | null;
      temperature: number; max_tokens: number | null;
    } | undefined;
  if (!p) throw new IpcError('E_MISSING_PROFILE', `profile not found: ${profileId}`);
  const apiKey = p.provider === 'ollama' ? null : getProfileDecryptedKey(p.id);
  return {
    id: p.id,
    provider: p.provider as ResolvedProfile['provider'],
    model: p.model,
    apiKey,
    baseUrl: p.base_url ?? undefined,
    temperature: p.temperature,
    maxTokens: p.max_tokens ?? undefined,
  };
}

// inside createChatHandlers:
sendUserMessage: async (opts) => {
  // ... existing pre-conditions (concurrency, profile id, AbortController) unchanged ...

  if (USE_LEGACY_AGENT) {
    void runAgentLegacy({ /* legacy deps as before */ })
      .catch((err) => writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message }))
      .finally(() => { aborts.delete(opts.sessionId); deps.concurrency.release(opts.sessionId); });
    return { ok: true } as const;
  }

  const profile = resolveProfile(profileId);
  const agent = getAgentBuilder().buildForProfile(profile);

  void runAgentNew({
    sessionId: opts.sessionId,
    userText: opts.text,
    profileId,
    history,
    deps: {
      agent,
      sessions: deps.sessions,
      systemPrompt: chatAgentSystemPrompt({ vaultName: basenameOf(deps.vaultRoot()), locale: 'zh' }),
      vaultRoot: deps.vaultRoot(),
      cancel: ctl.signal,
      clipsGet: deps.clipsGet,
      recordUsage: (u, model) => {
        try {
          aiUsage.insert({
            profileId: profile.id, model,
            promptTokens: u?.input_tokens ?? 0,
            completionTokens: u?.output_tokens ?? 0,
            latencyMs: 0,
            ok: 1, error: null,
            sessionId: opts.sessionId,
          });
        } catch { /* best effort */ }
      },
      modelName: profile.model,
    },
    streamWriter: writer,
    attachments: opts.attachments,
  })
    .catch((err: any) => writer.write({ type: 'error', error: err?.code ?? 'E_AGENT_FAILURE', detail: err?.message }))
    .finally(() => { aborts.delete(opts.sessionId); deps.concurrency.release(opts.sessionId); });

  return { ok: true } as const;
},
```

`runAgent` is also imported from `loop` under the alias `runAgentLegacy` only when `USE_LEGACY_AGENT` is set. Keep the legacy import behind a runtime conditional so tree-shaking doesn't kill it.

- [ ] **Step 3: Wire deps in `electron/ipc/handlers.ts`**

The `clipsGet` and `vaultRoot` deps already exist. The runner needs `sessions` (already passed). Confirm `chatHandlers` constructor still receives `sessions` and `concurrency`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck:node && pnpm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 5: Smoke test (manual)**

Run `pnpm run dev`. Open a chat session. Send a message that triggers `search_files` and `read_file`. Watch console — should see `tool.start` / `tool.result` events with non-empty `callId`. If `update_frontmatter` is requested, expect a runtime error (HITL not yet wired) — that's Plan 4 territory.

If the manual smoke test fails or the renderer cannot connect to the new runner, gate ON the legacy path with `AGENT_USE_LEGACY=1 pnpm dev` and investigate.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/chat.ts electron/ipc/handlers.ts
git commit -m "feat(ipc): chat.sendUserMessage drives new agent runner (legacy fallback via env flag)"
```

---

<!-- openspec-task: 6.7 -->

### Task 10: Test `runner.ts` against the K1 contract

**Files:**

- Create: `electron/agent/runner.test.ts`

- [ ] **Step 1: Write the test**

Create `electron/agent/runner.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { runAgent } from './runner'

function asyncIter<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const it of items) yield it
    }
  }
}

function makeSessions() {
  const appended: any[] = []
  const tcRows: any[] = []
  return {
    appendMessage: vi.fn(async (sid: string, m: any) => {
      appended.push({ sid, ...m })
      return { id: appended.length, sessionId: sid, createdAt: 'now', ...m }
    }),
    recordToolCall: vi.fn(async (sid, tc, opts) => {
      tcRows.push({ sid, tc, opts })
      return `row-${tcRows.length}`
    }),
    finishToolCall: vi.fn(async () => {}),
    __appended: appended,
    __tcRows: tcRows
  }
}

const baseDeps = (stream: AsyncIterable<unknown>) => ({
  agent: { stream: vi.fn(() => stream) },
  sessions: makeSessions(),
  systemPrompt: 'you are Sōngyǔ',
  vaultRoot: '/grove',
  cancel: new AbortController().signal,
  recordUsage: vi.fn(),
  modelName: 'gpt-4o-mini'
})

describe('runAgent — single-turn no tool calls', () => {
  it('emits message.appended (user) → message.appended (assistant) → done', async () => {
    const events: any[] = []
    const ai = new AIMessage({
      content: 'hello',
      id: 'ai-1',
      usage_metadata: { input_tokens: 10, output_tokens: 5 }
    } as any)
    const stream = asyncIter([['updates', { model: { messages: [ai] } }]])
    const deps = baseDeps(stream)
    await runAgent({
      sessionId: 's1',
      userText: 'hi',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) }
    })
    const types = events.map((e) => e.type)
    expect(types).toEqual(['message.appended', 'message.appended', 'done'])
    expect(events[2].usage).toEqual({ promptTokens: 10, completionTokens: 5 })
  })
})

describe('runAgent — tool roundtrip', () => {
  it('emits message.appended(user) → message.appended(assistant+toolCalls) → tool.start → tool.result → message.appended(final) → done', async () => {
    const events: any[] = []
    const aiToolCall = new AIMessage({
      content: '',
      tool_calls: [{ id: 'cid-1', name: 'search_files', args: { query: 'x' } }],
      id: 'ai-1'
    } as any)
    const tool = new ToolMessage({
      content: JSON.stringify({ ok: true, data: { items: [] } }),
      tool_call_id: 'cid-1',
      name: 'search_files'
    } as any)
    const aiFinal = new AIMessage({
      content: 'ok',
      id: 'ai-2',
      usage_metadata: { input_tokens: 50, output_tokens: 10 }
    } as any)
    const stream = asyncIter([
      ['updates', { model: { messages: [aiToolCall] } }],
      ['updates', { tools: { messages: [tool] } }],
      ['updates', { model: { messages: [aiFinal] } }]
    ])
    const deps = baseDeps(stream)
    await runAgent({
      sessionId: 's1',
      userText: 'find x',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) }
    })
    const types = events.map((e) => e.type)
    expect(types).toEqual([
      'message.appended', // user
      'message.appended', // assistant + tool_calls
      'tool.start',
      'message.appended', // tool result message
      'tool.result',
      'message.appended', // final assistant
      'done'
    ])
    const start = events.find((e) => e.type === 'tool.start')
    const result = events.find((e) => e.type === 'tool.result')
    expect(start.callId).toBe('cid-1')
    expect(result.callId).toBe('cid-1')
  })
})

describe('runAgent — cancellation', () => {
  it('emits canceled when AbortError surfaces from stream', async () => {
    const events: any[] = []
    const ctrl = new AbortController()
    const stream: AsyncIterable<unknown> = {
      async *[Symbol.asyncIterator]() {
        const e = new Error('aborted')
        ;(e as any).name = 'AbortError'
        throw e
      }
    }
    const deps = { ...baseDeps(stream), cancel: ctrl.signal }
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p',
      history: [],
      deps,
      streamWriter: { write: (e) => events.push(e) }
    })
    expect(events.some((e) => e.type === 'canceled')).toBe(true)
  })
})

describe('runAgent — error mapping', () => {
  it('emits error with normalized code on non-Abort throws', async () => {
    const events: any[] = []
    const stream: AsyncIterable<unknown> = {
      async *[Symbol.asyncIterator]() {
        throw Object.assign(new Error('Unauthorized'), { status: 401 })
      }
    }
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p',
      history: [],
      deps: baseDeps(stream),
      streamWriter: { write: (e) => events.push(e) }
    })
    const err = events.find((e) => e.type === 'error')
    expect(err).toBeTruthy()
    expect(err.error).toBe('E_AUTH')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
pnpm vitest run electron/agent/runner.test.ts
git add electron/agent/runner.test.ts
git commit -m "test(agent): cover runner emit sequence for text, tool roundtrip, cancel, error"
```

---

## Plan-level checkpoint

After all 10 tasks above:

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: green. `electron/agent/loop.test.ts` may still pass (legacy code intact); if it breaks because tools changed shape, accept this — the loop test gets deleted in Plan 6 Task 4.

- [ ] **Typecheck**

```bash
pnpm run typecheck
```

Expected: 0 errors.

- [ ] **Smoke test E2E**

Run `pnpm dev`. Send a chat message that exercises `search_files` and `read_file`. Confirm:

- Tool events have `callId` populated (check console / electron log).
- `done` event has `usage` populated.

If anything breaks, fall back via `AGENT_USE_LEGACY=1 pnpm dev`.

- [ ] **OpenSpec progress will be synced by `/opsx:executing-plans`.**
