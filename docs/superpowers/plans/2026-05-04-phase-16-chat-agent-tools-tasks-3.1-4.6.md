# Phase 16 — Chat Agent + Tools: Plan 2 (Agent Core + 5 Built-in Tools)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-16-chat-agent-tools`
> **Task range:** OpenSpec tasks `3.1`–`4.6` (10 tasks)
> **Plan order:** 2 of 4. Depends on Plan 1 (`tasks-1.1-2.6`). Followed by Plan 3 (`tasks-5.1-8.1`).
> **Created:** 2026-05-04
> **Branch suggestion:** continue on `feat/phase-16-chat-agent-tools`

---

## Goal

Build the in-process agent: the tool `registry`, the human-in-the-loop `approval` gate, the `runAgent` loop (≤8 steps, single tool per step), the chat-agent system prompt, and the five built-in tools (`search_files`, `read_file`, `list_tags`, `update_frontmatter`, `clip_summary`) — including the startup self-check that registers all five and verifies their `description` and `parameters` are non-empty.

## Architecture

- **Registry is a process-global singleton** (`electron/agent/registry.ts`) keyed by tool name. Tools are registered once at app boot in Plan 3 Task 4.6 (the wiring step). The registry exposes `openApiDefinitions()` and `anthropicDefinitions()` to convert the JSONSchema-flavoured `parameters` into each provider's expected shape.
- **Approval is a Map of pending promises** (`electron/agent/approval.ts`). `register(sessionId, toolCall, reason?)` returns a `callId` (UUID) and a Promise that resolves when the renderer calls `approveTool(callId)` or rejects when 30 minutes elapse. The Map is process-resident — if the app restarts, all pending approvals are forgotten and the loop sees `E_APPROVAL_TIMEOUT` (no recovery; design D10).
- **Agent loop** (`electron/agent/loop.ts`) is the only consumer of `llmClient.chatWithTools`. It maintains an in-memory `history` initialized from `sessions.getMessages` (Plan 3 task 5.1) and emits `AgentEvent`s through a `streamWriter`. Each iteration: call LLM → if `finishReason !== 'tool_calls'`, persist + emit `done`; else execute the first tool call (gated by `tool.sideEffect → approval`), persist the tool result message, continue. Hard cap of 8 steps.
- **Tools live under `electron/agent/tools/`** with one file per tool. Each file `export default` a `Tool` object. The 5 in this plan:
  - `search_files` — wraps `electron/services/search/queries.ts::fullText`
  - `read_file` — `safeResolve` + `readFileDetect` + `parseFile`; truncates body to 60_000 chars and reports `truncated: true`
  - `list_tags` — reads the `tags` table directly with optional prefix filter
  - `update_frontmatter` — `sideEffect: true`; refuses without `reason`; merges `patch` into existing frontmatter (a property set to `null` deletes that key); writes via `fs-atomic.writeWithVerify` with `expectedMtime`
  - `clip_summary` — calls `electron/ai/reviewer.ts::reviewClip` from phase 15; treats it as a query (returns existing frontmatter when already reviewed unless `force: true`)
- **Startup self-check** (Task 4.6) lives in `electron/agent/bootstrap.ts` and is called from app `bootstrap.ts`. It registers the 5 tools and asserts each has a non-empty `description` and a `parameters` schema with at least `type: 'object'`.

## Tech Stack

- Plan-1 deliverables: `shared/agent-types.ts`, `electron/ai/parse-tool-args.ts`, `chatWithTools` on all providers
- Phase 4: `electron/services/fs-atomic.ts` (`readFileDetect`, `writeWithVerify`), `electron/services/frontmatter.ts` (`parseFile`, `stringify`), `electron/services/path-safety.ts` (`safeResolve`)
- Phase 5: `electron/services/db/migrations/001_init.sql` (`tags` table)
- Phase 8: `electron/services/search/queries.ts` (`fullText`)
- Phase 12: `electron/ipc/clips.ts` DAO helpers (read clip by id)
- Phase 15: `electron/ai/reviewer.ts` (`reviewClip(clipId, opts)`)
- Phase 13: `electron/services/db.ts::dbService.requireCurrent()`, grove root accessor

## Files Touched (this plan)

| Path                                              | Action                                                                                                                                                                  | Owner task    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `electron/agent/registry.ts`                      | Create                                                                                                                                                                  | 3.1           |
| `electron/agent/registry.test.ts`                 | Create                                                                                                                                                                  | 3.1           |
| `electron/agent/approval.ts`                      | Create                                                                                                                                                                  | 3.2           |
| `electron/agent/approval.test.ts`                 | Create                                                                                                                                                                  | 3.2           |
| `electron/agent/loop.ts`                          | Create                                                                                                                                                                  | 3.3           |
| `electron/agent/loop.test.ts`                     | Create                                                                                                                                                                  | 3.3           |
| `electron/ai/prompts/chat-agent.ts`               | Create                                                                                                                                                                  | 3.4           |
| `electron/ai/prompts/chat-agent.test.ts`          | Create                                                                                                                                                                  | 3.4           |
| `electron/agent/tools/search_files.ts`            | Create                                                                                                                                                                  | 4.1           |
| `electron/agent/tools/search_files.test.ts`       | Create                                                                                                                                                                  | 4.1           |
| `electron/agent/tools/read_file.ts`               | Create                                                                                                                                                                  | 4.2           |
| `electron/agent/tools/read_file.test.ts`          | Create                                                                                                                                                                  | 4.2           |
| `electron/agent/tools/list_tags.ts`               | Create                                                                                                                                                                  | 4.3           |
| `electron/agent/tools/list_tags.test.ts`          | Create                                                                                                                                                                  | 4.3           |
| `electron/agent/tools/update_frontmatter.ts`      | Create                                                                                                                                                                  | 4.4           |
| `electron/agent/tools/update_frontmatter.test.ts` | Create                                                                                                                                                                  | 4.4           |
| `electron/agent/tools/clip_summary.ts`            | Create                                                                                                                                                                  | 4.5           |
| `electron/agent/tools/clip_summary.test.ts`       | Create                                                                                                                                                                  | 4.5           |
| `electron/agent/bootstrap.ts`                     | Create                                                                                                                                                                  | 4.6           |
| `electron/agent/bootstrap.test.ts`                | Create                                                                                                                                                                  | 4.6           |
| `shared/ipc-contract.ts`                          | Modify (add `E_PATH_ESCAPE`, `E_USER_REJECTED`, `E_APPROVAL_TIMEOUT`, `E_MISSING_REASON`, `E_STEP_LIMIT`, `E_BUSY`, `E_GLOBAL_BUSY` error codes to the documented list) | 3.2, 3.3, 4.4 |

## Pre-flight

- Plan 1 of this phase is merged.
- Phase 15 reviewer is merged: `electron/ai/reviewer.ts` exposes `reviewClip(clipId: string, opts?: { force?: boolean }): Promise<{ result: AiReviewResult; latencyMs: number; model: string; usage?: TokenUsage }>` and writes `ai_review_*` frontmatter via `fileHandlers.writeParsed`.
- The grove root is reachable via `dbService.getCurrent()?.name` or a similar accessor — confirm by reading `electron/services/db.ts`. If no helper exists, this plan adds one in Task 4.6 step 5.
- New `IpcError` codes added to `shared/ipc-contract.ts` are documented but not enforced as a closed enum — the existing pattern uses string codes.

---

## Tasks

<!-- openspec-task: 3.1 -->

### Task 1: `electron/agent/registry.ts` — register / get / list / openApi & anthropic definitions

**Files:**

- Create: `electron/agent/registry.ts`
- Create: `electron/agent/registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/agent/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createRegistry } from './registry'
import type { Tool } from '../../shared/agent-types'

const dummy = (name: string, sideEffect = false): Tool => ({
  name,
  description: `does ${name}`,
  parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
  sideEffect,
  execute: async (args) => ({ echoed: args })
})

describe('agent registry', () => {
  let r: ReturnType<typeof createRegistry>
  beforeEach(() => {
    r = createRegistry()
  })

  it('register / get / list', () => {
    r.register(dummy('a'))
    r.register(dummy('b', true))
    expect(
      r
        .list()
        .map((t) => t.name)
        .sort()
    ).toEqual(['a', 'b'])
    expect(r.get('a')?.name).toBe('a')
    expect(r.get('zzz')).toBeUndefined()
  })

  it('rejects duplicate registration', () => {
    r.register(dummy('a'))
    expect(() => r.register(dummy('a'))).toThrow(/already registered/)
  })

  it('rejects tools with empty description or parameters', () => {
    expect(() => r.register({ ...dummy('x'), description: '' })).toThrow(/description/)
    expect(() => r.register({ ...dummy('y'), parameters: {} as any })).toThrow(/parameters/)
  })

  it('openApiDefinitions wraps tools as { type:"function", function:{name,description,parameters} }', () => {
    r.register(dummy('a'))
    expect(r.openApiDefinitions()).toEqual([
      {
        type: 'function',
        function: { name: 'a', description: 'does a', parameters: dummy('a').parameters }
      }
    ])
  })

  it('anthropicDefinitions wraps tools as { name, description, input_schema }', () => {
    r.register(dummy('a'))
    expect(r.anthropicDefinitions()).toEqual([
      { name: 'a', description: 'does a', input_schema: dummy('a').parameters }
    ])
  })
})
```

- [ ] **Step 2: Run test — should FAIL (no module)**

```bash
npx vitest run electron/agent/registry.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement registry**

```ts
// electron/agent/registry.ts
import type { Tool } from '../../shared/agent-types'

export interface Registry {
  register(t: Tool): void
  get(name: string): Tool | undefined
  list(): Tool[]
  openApiDefinitions(): Array<{
    type: 'function'
    function: { name: string; description: string; parameters: object }
  }>
  anthropicDefinitions(): Array<{ name: string; description: string; input_schema: object }>
}

export function createRegistry(): Registry {
  const tools = new Map<string, Tool>()
  return {
    register(t) {
      if (!t.description?.trim()) throw new Error(`tool ${t.name}: description is required`)
      if (!t.parameters || typeof (t.parameters as any).type !== 'string') {
        throw new Error(`tool ${t.name}: parameters must be a JSON schema object`)
      }
      if (tools.has(t.name)) throw new Error(`tool ${t.name} already registered`)
      tools.set(t.name, t)
    },
    get(name) {
      return tools.get(name)
    },
    list() {
      return [...tools.values()]
    },
    openApiDefinitions() {
      return [...tools.values()].map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }))
    },
    anthropicDefinitions() {
      return [...tools.values()].map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters
      }))
    }
  }
}

// Process-global singleton — populated at bootstrap (Task 4.6).
export const registry = createRegistry()
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/registry.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/registry.ts electron/agent/registry.test.ts
git commit -m "feat(phase-16): agent tool registry — register/get/list + provider definitions"
```

<!-- openspec-task: 3.2 -->

### Task 2: `electron/agent/approval.ts` — pending Map + 30-min timeout + event bridge

**Files:**

- Create: `electron/agent/approval.ts`
- Create: `electron/agent/approval.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/approval.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApproval } from './approval'

describe('approval gate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('register returns a callId and a pending promise', async () => {
    const a = createApproval()
    const events: any[] = []
    a.onRequested((e) => events.push(e))
    const callId = a.register(
      's1',
      { id: 'tc1', name: 'update_frontmatter', args: { path: 'a.md' } },
      'why'
    )
    expect(callId).toMatch(/^[a-f0-9-]+$/)
    expect(events).toEqual([
      { sessionId: 's1', callId, tool: 'update_frontmatter', args: { path: 'a.md' }, reason: 'why' }
    ])
  })

  it('await(callId) resolves on approve with possibly edited args', async () => {
    const a = createApproval()
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: { v: 1 } })
    const p = a.await(callId)
    a.approve(callId, { v: 2 })
    await expect(p).resolves.toEqual({ ok: true, args: { v: 2 } })
  })

  it('await(callId) resolves with E_USER_REJECTED on reject', async () => {
    const a = createApproval()
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: {} })
    const p = a.await(callId)
    a.reject(callId)
    await expect(p).resolves.toEqual({ ok: false, error: 'E_USER_REJECTED' })
  })

  it('times out after 30 minutes with E_APPROVAL_TIMEOUT', async () => {
    const a = createApproval()
    const callId = a.register('s1', { id: 'tc1', name: 'x', args: {} })
    const p = a.await(callId)
    vi.advanceTimersByTime(30 * 60 * 1000 + 1)
    await expect(p).resolves.toEqual({ ok: false, error: 'E_APPROVAL_TIMEOUT' })
  })

  it('approve unknown callId throws', () => {
    const a = createApproval()
    expect(() => a.approve('nope')).toThrow(/unknown callId/)
  })

  it('cancelSession rejects all pending in that session', async () => {
    const a = createApproval()
    const c1 = a.register('s1', { id: 'tc1', name: 'x', args: {} })
    const c2 = a.register('s1', { id: 'tc2', name: 'y', args: {} })
    const c3 = a.register('s2', { id: 'tc3', name: 'z', args: {} })
    const p1 = a.await(c1)
    const p2 = a.await(c2)
    const p3 = a.await(c3)
    a.cancelSession('s1')
    await expect(p1).resolves.toEqual({ ok: false, error: 'E_CANCELED' })
    await expect(p2).resolves.toEqual({ ok: false, error: 'E_CANCELED' })
    expect(a.peek(c3)).toBeDefined()
    a.approve(c3)
    await expect(p3).resolves.toEqual({ ok: true, args: {} })
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/approval.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/approval.ts
import { randomUUID } from 'node:crypto'
import type { ToolCall } from '../../shared/agent-types'

const TIMEOUT_MS = 30 * 60 * 1000

interface Pending {
  callId: string
  sessionId: string
  toolCall: ToolCall
  reason?: string
  resolve: (
    r:
      | { ok: true; args: unknown }
      | { ok: false; error: 'E_USER_REJECTED' | 'E_APPROVAL_TIMEOUT' | 'E_CANCELED' }
  ) => void
  timer: NodeJS.Timeout
  createdAt: number
}

export interface ApprovalGate {
  register(sessionId: string, toolCall: ToolCall, reason?: string): string
  await(
    callId: string
  ): Promise<
    | { ok: true; args: unknown }
    | { ok: false; error: 'E_USER_REJECTED' | 'E_APPROVAL_TIMEOUT' | 'E_CANCELED' }
  >
  approve(callId: string, editedArgs?: unknown): void
  reject(callId: string): void
  cancelSession(sessionId: string): void
  peek(callId: string): { sessionId: string; toolCall: ToolCall; reason?: string } | undefined
  onRequested(
    cb: (e: {
      sessionId: string
      callId: string
      tool: string
      args: unknown
      reason?: string
    }) => void
  ): () => void
}

export function createApproval(): ApprovalGate {
  const pending = new Map<string, Pending>()
  const promises = new Map<string, Promise<any>>()
  const subscribers = new Set<(e: any) => void>()

  function emit(e: any) {
    for (const s of subscribers) s(e)
  }

  return {
    register(sessionId, toolCall, reason) {
      const callId = randomUUID()
      const p = new Promise<any>((resolve) => {
        const timer = setTimeout(() => {
          if (pending.has(callId)) {
            pending.delete(callId)
            resolve({ ok: false, error: 'E_APPROVAL_TIMEOUT' })
          }
        }, TIMEOUT_MS)
        pending.set(callId, {
          callId,
          sessionId,
          toolCall,
          reason,
          resolve,
          timer,
          createdAt: Date.now()
        })
      })
      promises.set(callId, p)
      emit({ sessionId, callId, tool: toolCall.name, args: toolCall.args, reason })
      return callId
    },
    await(callId) {
      const p = promises.get(callId)
      if (!p) return Promise.resolve({ ok: false as const, error: 'E_CANCELED' })
      return p
    },
    approve(callId, editedArgs) {
      const e = pending.get(callId)
      if (!e) throw new Error(`unknown callId: ${callId}`)
      pending.delete(callId)
      clearTimeout(e.timer)
      e.resolve({ ok: true, args: editedArgs ?? e.toolCall.args })
    },
    reject(callId) {
      const e = pending.get(callId)
      if (!e) throw new Error(`unknown callId: ${callId}`)
      pending.delete(callId)
      clearTimeout(e.timer)
      e.resolve({ ok: false, error: 'E_USER_REJECTED' })
    },
    cancelSession(sessionId) {
      for (const e of [...pending.values()]) {
        if (e.sessionId !== sessionId) continue
        pending.delete(e.callId)
        clearTimeout(e.timer)
        e.resolve({ ok: false, error: 'E_CANCELED' })
      }
    },
    peek(callId) {
      const e = pending.get(callId)
      return e ? { sessionId: e.sessionId, toolCall: e.toolCall, reason: e.reason } : undefined
    },
    onRequested(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    }
  }
}

export const approvalGate = createApproval()
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/approval.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/approval.ts electron/agent/approval.test.ts
git commit -m "feat(phase-16): approval gate — pending map + 30min timeout + cancel by session"
```

<!-- openspec-task: 3.3 -->

### Task 3: `electron/agent/loop.ts` — `runAgent` (≤8 steps, single tool per step, error/cancel paths)

**Files:**

- Create: `electron/agent/loop.ts`
- Create: `electron/agent/loop.test.ts`

- [ ] **Step 1: Write failing tests covering happy path + error paths**

```ts
// electron/agent/loop.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAgent } from './loop'
import { createRegistry } from './registry'
import { createApproval } from './approval'

const STREAM = () => {
  const events: any[] = []
  return { events, write: (e: any) => events.push(e) }
}

const session = {
  appendMessage: vi.fn(async () => ({
    id: 1,
    sessionId: 's1',
    role: 'user',
    content: 'hi',
    createdAt: 't'
  })),
  recordToolCall: vi.fn(async () => 'tc-row-1'),
  finishToolCall: vi.fn(async () => undefined)
}

const llm = {
  chatWithTools: vi.fn()
}

const baseDeps = (registry: any, approval: any) => ({
  llmClient: llm,
  sessions: session,
  registry,
  approval,
  systemPrompt: () => ({ role: 'system' as const, content: 'you are sōngyǔ' }),
  vaultRoot: '/vault',
  cancel: new AbortController().signal
})

beforeEach(() => {
  llm.chatWithTools.mockReset()
  session.appendMessage.mockClear()
  session.recordToolCall.mockClear()
})

describe('runAgent', () => {
  it('completes in one step when LLM returns finishReason=stop', async () => {
    const r = createRegistry()
    const a = createApproval()
    llm.chatWithTools.mockResolvedValueOnce({
      text: 'hello',
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1 }
    })
    const stream = STREAM()
    await runAgent({
      sessionId: 's1',
      userText: 'hi',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    expect(stream.events.find((e) => e.type === 'done')).toBeDefined()
    expect(llm.chatWithTools).toHaveBeenCalledTimes(1)
  })

  it('executes a non-side-effect tool, feeds result back, then completes', async () => {
    const r = createRegistry()
    const a = createApproval()
    r.register({
      name: 'echo',
      description: 'd',
      sideEffect: false,
      parameters: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] },
      execute: async (args: any) => ({ ok: true, data: { echoed: args.v } })
    })
    llm.chatWithTools.mockResolvedValueOnce({
      toolCalls: [{ id: 'tc1', name: 'echo', args: { v: 'x' } }],
      finishReason: 'tool_calls'
    })
    llm.chatWithTools.mockResolvedValueOnce({ text: 'done', toolCalls: [], finishReason: 'stop' })
    const stream = STREAM()
    await runAgent({
      sessionId: 's1',
      userText: 'echo x',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    const types = stream.events.map((e) => e.type)
    expect(types).toContain('tool.start')
    expect(types).toContain('tool.result')
    expect(types[types.length - 1]).toBe('done')
    expect(llm.chatWithTools).toHaveBeenCalledTimes(2)
  })

  it('side-effect tool waits for approval, then runs with edited args', async () => {
    const r = createRegistry()
    const a = createApproval()
    r.register({
      name: 'write',
      description: 'd',
      sideEffect: true,
      parameters: { type: 'object', properties: { v: { type: 'string' } }, required: ['v'] },
      execute: async (args: any) => ({ ok: true, data: { wrote: args.v } })
    })
    llm.chatWithTools.mockResolvedValueOnce({
      toolCalls: [{ id: 'tc1', name: 'write', args: { v: 'old' } }],
      finishReason: 'tool_calls'
    })
    llm.chatWithTools.mockResolvedValueOnce({ text: 'done', toolCalls: [], finishReason: 'stop' })
    const stream = STREAM()
    const p = runAgent({
      sessionId: 's1',
      userText: 'write',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    // Wait for the approval-needed event, then approve with edited args
    await new Promise<void>((res) => {
      const i = setInterval(() => {
        const e = stream.events.find((ev) => ev.type === 'tool.approval-needed')
        if (e) {
          clearInterval(i)
          a.approve(e.callId, { v: 'new' })
          res()
        }
      }, 5)
    })
    await p
    const result = stream.events.find((e) => e.type === 'tool.result')
    expect(result).toMatchObject({ result: { ok: true, data: { wrote: 'new' } } })
  })

  it('reject of approval feeds E_USER_REJECTED back as tool result', async () => {
    const r = createRegistry()
    const a = createApproval()
    r.register({
      name: 'write',
      description: 'd',
      sideEffect: true,
      parameters: { type: 'object' },
      execute: async () => ({ ok: true, data: 'should not run' })
    })
    llm.chatWithTools.mockResolvedValueOnce({
      toolCalls: [{ id: 'tc1', name: 'write', args: {} }],
      finishReason: 'tool_calls'
    })
    llm.chatWithTools.mockResolvedValueOnce({
      text: 'ok i wont',
      toolCalls: [],
      finishReason: 'stop'
    })
    const stream = STREAM()
    const p = runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    await new Promise<void>((res) => {
      const i = setInterval(() => {
        const e = stream.events.find((ev) => ev.type === 'tool.approval-needed')
        if (e) {
          clearInterval(i)
          a.reject(e.callId)
          res()
        }
      }, 5)
    })
    await p
    const result = stream.events.find((e) => e.type === 'tool.result')
    expect(result?.result).toEqual({ ok: false, error: 'E_USER_REJECTED' })
  })

  it('emits E_STEP_LIMIT when LLM keeps calling tools past 8 steps', async () => {
    const r = createRegistry()
    const a = createApproval()
    r.register({
      name: 'echo',
      description: 'd',
      sideEffect: false,
      parameters: { type: 'object' },
      execute: async () => ({ ok: true, data: {} })
    })
    llm.chatWithTools.mockResolvedValue({
      toolCalls: [{ id: 'tc', name: 'echo', args: {} }],
      finishReason: 'tool_calls'
    })
    const stream = STREAM()
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    expect(
      stream.events.find((e) => e.type === 'error' && e.error === 'E_STEP_LIMIT')
    ).toBeDefined()
    expect(llm.chatWithTools).toHaveBeenCalledTimes(8)
  })

  it('feeds back E_UNKNOWN_TOOL when LLM hallucinates a tool name', async () => {
    const r = createRegistry()
    const a = createApproval()
    llm.chatWithTools.mockResolvedValueOnce({
      toolCalls: [{ id: 'tc1', name: 'mystery', args: {} }],
      finishReason: 'tool_calls'
    })
    llm.chatWithTools.mockResolvedValueOnce({ text: 'sorry', toolCalls: [], finishReason: 'stop' })
    const stream = STREAM()
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p1',
      history: [],
      deps: baseDeps(r, a),
      streamWriter: stream
    })
    const result = stream.events.find((e) => e.type === 'tool.result')
    expect(result?.result).toEqual({ ok: false, error: 'E_UNKNOWN_TOOL' })
  })

  it('aborts mid-loop when AbortSignal fires; emits canceled', async () => {
    const r = createRegistry()
    const a = createApproval()
    const ctl = new AbortController()
    llm.chatWithTools.mockImplementationOnce(async () => {
      ctl.abort()
      return { toolCalls: [], text: 'late', finishReason: 'stop' }
    })
    const stream = STREAM()
    const deps = { ...baseDeps(r, a), cancel: ctl.signal }
    await runAgent({
      sessionId: 's1',
      userText: 'go',
      profileId: 'p1',
      history: [],
      deps,
      streamWriter: stream
    })
    expect(stream.events.some((e) => e.type === 'canceled')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/loop.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/loop.ts
import type {
  AgentEvent,
  Tool,
  ToolCall,
  ToolResult,
  SessionMessage
} from '../../shared/agent-types'
import type { Registry } from './registry'
import type { ApprovalGate } from './approval'

const MAX_STEPS = 8
const TOOL_RESULT_BUDGET = 8000

export interface RunAgentDeps {
  llmClient: { chatWithTools: (opts: any) => Promise<any> }
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
    finishToolCall: (
      rowId: string,
      fields: { result?: ToolResult; approved?: boolean | null; error?: string }
    ) => Promise<void>
  }
  registry: Registry
  approval: ApprovalGate
  systemPrompt: () => { role: 'system'; content: string }
  vaultRoot: string
  cancel: AbortSignal
}

export interface RunAgentArgs {
  sessionId: string
  userText: string
  profileId: string
  history: SessionMessage[]
  deps: RunAgentDeps
  streamWriter: { write: (e: AgentEvent) => void }
}

export async function runAgent({
  sessionId,
  userText,
  profileId,
  history,
  deps,
  streamWriter
}: RunAgentArgs): Promise<void> {
  const emit = (e: AgentEvent) => streamWriter.write(e)
  const cancel = deps.cancel

  // 1. Append user message + emit
  const userMsg = await deps.sessions.appendMessage(sessionId, { role: 'user', content: userText })
  emit({ type: 'message.appended', message: userMsg })
  history = [...history, userMsg]

  for (let step = 0; step < MAX_STEPS; step++) {
    if (cancel.aborted) {
      emit({ type: 'canceled' })
      return
    }
    emit({ type: 'step.start', step })

    let r: any
    try {
      r = await deps.llmClient.chatWithTools({
        profileId,
        messages: [deps.systemPrompt(), ...messagesForLlm(history)],
        tools: deps.registry
          .list()
          .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
        signal: cancel,
        onToken: (t: string) => emit({ type: 'token', text: t })
      })
    } catch (err: any) {
      if (cancel.aborted || err?.name === 'AbortError') {
        emit({ type: 'canceled' })
        return
      }
      emit({ type: 'error', error: err?.code ?? 'E_LLM_ERROR', detail: err?.message })
      return
    }
    if (cancel.aborted) {
      emit({ type: 'canceled' })
      return
    }

    if (r.finishReason !== 'tool_calls') {
      const msg = await deps.sessions.appendMessage(sessionId, {
        role: 'assistant',
        content: r.text ?? ''
      })
      emit({ type: 'message.appended', message: msg })
      emit({ type: 'done', usage: r.usage })
      return
    }

    const tc: ToolCall = r.toolCalls[0]
    const assistantMsg = await deps.sessions.appendMessage(sessionId, {
      role: 'assistant',
      content: r.text ?? null,
      toolCalls: [tc]
    })
    emit({ type: 'message.appended', message: assistantMsg })

    const tool = deps.registry.get(tc.name)
    if (!tool) {
      const result: ToolResult = { ok: false, error: 'E_UNKNOWN_TOOL' }
      await pushToolResult(deps, sessionId, tc, result, emit)
      history = await reloadHistory(history, deps, sessionId)
      continue
    }

    let argsToRun: unknown = tc.args
    let approved: boolean | null = null

    if (tool.sideEffect) {
      const reason = (tc.args as any)?.reason
      const callId = deps.approval.register(
        sessionId,
        tc,
        typeof reason === 'string' ? reason : undefined
      )
      const rowId = await deps.sessions.recordToolCall(sessionId, tc, {
        sideEffect: true,
        messageId: assistantMsg.id
      })
      emit({ type: 'tool.approval-needed', callId, tool: tc.name, args: tc.args, reason })
      const decision = await deps.approval.await(callId)
      if (!decision.ok) {
        await deps.sessions.finishToolCall(rowId, {
          result: { ok: false, error: decision.error },
          approved: false
        })
        await pushToolResult(deps, sessionId, tc, { ok: false, error: decision.error }, emit)
        history = await reloadHistory(history, deps, sessionId)
        continue
      }
      argsToRun = decision.args
      approved = true
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun })
      try {
        const data = await tool.execute(argsToRun, {
          sessionId,
          vaultRoot: deps.vaultRoot,
          cancel,
          log: () => {}
        })
        const result: ToolResult = { ok: true, data }
        await deps.sessions.finishToolCall(rowId, { result, approved })
        await pushToolResult(deps, sessionId, tc, result, emit)
      } catch (err: any) {
        const result: ToolResult = {
          ok: false,
          error: err?.code ?? 'E_TOOL_FAILURE',
          detail: err?.message
        }
        await deps.sessions.finishToolCall(rowId, { result, approved, error: result.error })
        await pushToolResult(deps, sessionId, tc, result, emit)
      }
    } else {
      const rowId = await deps.sessions.recordToolCall(sessionId, tc, {
        sideEffect: false,
        messageId: assistantMsg.id
      })
      emit({ type: 'tool.start', tool: tc.name, args: argsToRun })
      try {
        const data = await tool.execute(argsToRun as any, {
          sessionId,
          vaultRoot: deps.vaultRoot,
          cancel,
          log: () => {}
        })
        const result: ToolResult = { ok: true, data }
        await deps.sessions.finishToolCall(rowId, { result })
        await pushToolResult(deps, sessionId, tc, result, emit)
      } catch (err: any) {
        const result: ToolResult = {
          ok: false,
          error: err?.code ?? 'E_TOOL_FAILURE',
          detail: err?.message
        }
        await deps.sessions.finishToolCall(rowId, { result, error: result.error })
        await pushToolResult(deps, sessionId, tc, result, emit)
      }
    }

    history = await reloadHistory(history, deps, sessionId)
  }

  emit({ type: 'error', error: 'E_STEP_LIMIT' })
}

async function pushToolResult(
  deps: RunAgentDeps,
  sessionId: string,
  tc: ToolCall,
  result: ToolResult,
  emit: (e: AgentEvent) => void
) {
  emit({ type: 'tool.result', tool: tc.name, result })
  const sliced = JSON.stringify(result).slice(0, TOOL_RESULT_BUDGET)
  const msg = await deps.sessions.appendMessage(sessionId, {
    role: 'tool',
    content: sliced,
    toolCallId: tc.id
  })
  emit({ type: 'message.appended', message: msg })
}

async function reloadHistory(prev: SessionMessage[], _deps: RunAgentDeps, _sessionId: string) {
  // History is augmented in-memory by appendMessage emitting; for robustness future tasks may reload from DB.
  return prev
}

function messagesForLlm(history: SessionMessage[]) {
  return history.map((m) => {
    if (m.role === 'tool')
      return { role: 'tool' as const, content: m.content ?? '', toolCallId: m.toolCallId }
    if (m.role === 'assistant' && m.toolCalls?.length)
      return { role: 'assistant' as const, content: m.content ?? '', toolCalls: m.toolCalls }
    return { role: m.role, content: m.content ?? '' }
  })
}
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/loop.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/loop.ts electron/agent/loop.test.ts
git commit -m "feat(phase-16): runAgent loop — tool dispatch, approval gate, step limit, cancel"
```

<!-- openspec-task: 3.4 -->

### Task 4: `electron/ai/prompts/chat-agent.ts` — system prompt template

**Files:**

- Create: `electron/ai/prompts/chat-agent.ts`
- Create: `electron/ai/prompts/chat-agent.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/ai/prompts/chat-agent.test.ts
import { describe, it, expect } from 'vitest'
import { chatAgentSystemPrompt } from './chat-agent'

describe('chatAgentSystemPrompt', () => {
  it('returns a role:system message with the documented bullet list', () => {
    const m = chatAgentSystemPrompt({ vaultName: 'my-grove', locale: 'zh' })
    expect(m.role).toBe('system')
    expect(m.content).toContain('松语')
    expect(m.content).toContain('my-grove')
    expect(m.content).toMatch(/工具|tool/i)
    expect(m.content).toMatch(/确认/)
  })

  it('falls back to English-leaning text when locale=en', () => {
    const m = chatAgentSystemPrompt({ vaultName: 'my-grove', locale: 'en' })
    expect(m.role).toBe('system')
    expect(m.content).toMatch(/Sōngyǔ|songyu|sōngyǔ/i)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/ai/prompts/chat-agent.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/ai/prompts/chat-agent.ts
export interface ChatAgentPromptCtx {
  vaultName: string
  locale?: 'zh' | 'en'
}

export function chatAgentSystemPrompt(ctx: ChatAgentPromptCtx) {
  const isZh = (ctx.locale ?? 'zh') === 'zh'
  const content = isZh
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
  return { role: 'system' as const, content }
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/ai/prompts/chat-agent.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/ai/prompts/chat-agent.ts electron/ai/prompts/chat-agent.test.ts
git commit -m "feat(phase-16): chat-agent system prompt (zh + en variants)"
```

<!-- openspec-task: 4.1 -->

### Task 5: Tool — `search_files` (FTS5 wrapper)

**Files:**

- Create: `electron/agent/tools/search_files.ts`
- Create: `electron/agent/tools/search_files.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/agent/tools/search_files.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../../services/db/migrations'

vi.mock('../../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
import { dbService } from '../../services/db'
import searchFiles from './search_files'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  // Seed two files into FTS5 (this assumes the phase-5/8 fts virtual table is `files_fts`)
  db.prepare(
    'INSERT INTO files (path, title, content_hash, mtime, size, summary, body) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'notes/a.md',
    'Attention is All You Need',
    'h1',
    '2026-01-01T00:00:00Z',
    100,
    '',
    'Discusses self-attention mechanisms.'
  )
  db.prepare(
    'INSERT INTO files (path, title, content_hash, mtime, size, summary, body) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run('notes/b.md', 'Cooking', 'h2', '2026-01-02T00:00:00Z', 100, '', 'Pasta recipes.')
  db.prepare(
    'INSERT INTO files_fts(rowid, path, title, body) SELECT rowid, path, title, body FROM files'
  ).run()
})

describe('search_files tool', () => {
  it('returns FTS5 hits with snippet', async () => {
    const r = await searchFiles.execute({ query: 'attention', limit: 5 } as any, {
      sessionId: 's1',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect((r as any).items).toHaveLength(1)
    expect((r as any).items[0]).toMatchObject({
      path: 'notes/a.md',
      title: expect.any(String),
      snippet: expect.any(String)
    })
  })

  it('respects limit', async () => {
    const r = await searchFiles.execute({ query: 'a', limit: 1 } as any, {
      sessionId: 's1',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect((r as any).items.length).toBeLessThanOrEqual(1)
  })

  it('parameters JSON schema requires "query"', () => {
    expect(searchFiles.parameters).toMatchObject({ type: 'object', required: ['query'] })
    expect(searchFiles.sideEffect).toBe(false)
  })
})
```

(If the actual FTS5 column / table names differ from `files_fts`, adjust the SEED step to match phase-5/8's schema by reading `migrations/00X_search.sql`.)

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/agent/tools/search_files.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/tools/search_files.ts
import type { Tool } from '../../../shared/agent-types'
import { dbService } from '../../services/db'
import { fullText } from '../../services/search/queries'

const tool: Tool<
  { query: string; limit?: number },
  { items: Array<{ path: string; title: string; snippet: string }> }
> = {
  name: 'search_files',
  description:
    "Full-text search the user's grove. Returns matching markdown files with a highlighted snippet. Use this BEFORE answering questions about the user's notes.",
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          "FTS5 query — use words from the user's question; for phrases use double quotes."
      },
      limit: { type: 'number', description: 'Max number of hits (1–20).' }
    },
    required: ['query']
  },
  sideEffect: false,
  async execute(args) {
    const db = dbService.requireCurrent()
    const limit = Math.max(1, Math.min(20, args.limit ?? 8))
    const r = fullText(db, args.query, { limit, offset: 0 })
    return {
      items: r.items.map((i) => ({
        path: i.summary.path,
        title: i.summary.title ?? i.summary.path,
        snippet: i.snippet
      }))
    }
  }
}
export default tool
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/tools/search_files.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/search_files.ts electron/agent/tools/search_files.test.ts
git commit -m "feat(phase-16): tool search_files — FTS5 wrapper (sideEffect=false)"
```

<!-- openspec-task: 4.2 -->

### Task 6: Tool — `read_file` (safeResolve + 60k truncate + structured not-found)

**Files:**

- Create: `electron/agent/tools/read_file.ts`
- Create: `electron/agent/tools/read_file.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/tools/read_file.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import readFile from './read_file'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phase16-read-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const ctx = (vault = root) => ({
  sessionId: 's1',
  vaultRoot: vault,
  cancel: new AbortController().signal,
  log: () => {}
})

describe('read_file tool', () => {
  it('reads frontmatter + body', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 4\n---\nbody text\n')
    const r: any = await readFile.execute({ path: 'a.md' } as any, ctx())
    expect(r.ok).toBe(true)
    expect(r.data.frontmatter.title).toBe('A')
    expect(r.data.body).toContain('body text')
  })

  it('returns ok:false E_NOT_FOUND for missing file', async () => {
    const r: any = await readFile.execute({ path: 'missing.md' } as any, ctx())
    expect(r).toEqual({ ok: false, error: 'E_NOT_FOUND' })
  })

  it('returns E_PATH_ESCAPE on ../ traversal', async () => {
    const r: any = await readFile.execute({ path: '../etc/passwd' } as any, ctx())
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' })
  })

  it('truncates body > 60k and reports truncated:true', async () => {
    writeFileSync(join(root, 'big.md'), '---\ntitle: B\n---\n' + 'x'.repeat(70_000))
    const r: any = await readFile.execute({ path: 'big.md' } as any, ctx())
    expect(r.ok).toBe(true)
    expect(r.data.body.length).toBe(60_000)
    expect(r.data.truncated).toBe(true)
  })

  it('parameters require path', () => {
    expect(readFile.parameters).toMatchObject({ type: 'object', required: ['path'] })
    expect(readFile.sideEffect).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/tools/read_file.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/tools/read_file.ts
import type { Tool } from '../../../shared/agent-types'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect } from '../../services/fs-atomic'
import { parseFile } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const MAX_BODY = 60_000

const tool: Tool<{ path: string }, unknown> = {
  name: 'read_file',
  description:
    'Read a markdown file from the grove. Returns parsed frontmatter and body. Body is truncated to 60_000 chars; check `truncated` to know if more exists.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the grove, e.g. "notes/a.md".' }
    },
    required: ['path']
  },
  sideEffect: false,
  async execute(args, ctx) {
    let abs: string
    try {
      abs = safeResolve(ctx.vaultRoot, args.path)
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
        path: args.path,
        frontmatter: parsed.frontmatter,
        body,
        truncated: parsed.body.length > MAX_BODY,
        mtimeMs: read.mtimeMs
      }
    }
  }
}
export default tool
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/tools/read_file.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/read_file.ts electron/agent/tools/read_file.test.ts
git commit -m "feat(phase-16): tool read_file — safeResolve + 60k truncate + structured failures"
```

<!-- openspec-task: 4.3 -->

### Task 7: Tool — `list_tags` (with optional prefix)

**Files:**

- Create: `electron/agent/tools/list_tags.ts`
- Create: `electron/agent/tools/list_tags.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/agent/tools/list_tags.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../../services/db/migrations'

vi.mock('../../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
import { dbService } from '../../services/db'
import listTags from './list_tags'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db, resolve(__dirname, '../../services/db/migrations'))
  ;(dbService.requireCurrent as any).mockReturnValue(db)
  for (const [name, n] of [
    ['ml', 9],
    ['music', 4],
    ['movie', 7],
    ['blog', 1]
  ] as const) {
    db.prepare('INSERT INTO tags (name, usage_count) VALUES (?, ?)').run(name, n)
  }
})

describe('list_tags', () => {
  it('returns all tags sorted by usage desc when no prefix', async () => {
    const r: any = await listTags.execute({ limit: 10 } as any, {
      sessionId: 's',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect(r.items.map((t: any) => t.name)).toEqual(['ml', 'movie', 'music', 'blog'])
  })

  it('filters by prefix', async () => {
    const r: any = await listTags.execute({ prefix: 'm' } as any, {
      sessionId: 's',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    const names = r.items.map((t: any) => t.name)
    expect(names).toContain('ml')
    expect(names).toContain('music')
    expect(names).not.toContain('blog')
  })

  it('clamps limit to 1..200, default 50', async () => {
    expect(listTags.parameters).toMatchObject({ type: 'object' })
    const r: any = await listTags.execute({ limit: 9999 } as any, {
      sessionId: 's',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect(r.items.length).toBeLessThanOrEqual(200)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/agent/tools/list_tags.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/tools/list_tags.ts
import type { Tool } from '../../../shared/agent-types'
import { dbService } from '../../services/db'

const tool: Tool<
  { prefix?: string; limit?: number },
  { items: Array<{ name: string; usage_count: number }> }
> = {
  name: 'list_tags',
  description:
    'List tags used in the grove, ordered by usage count descending. Optional prefix filter for autocomplete-style lookups.',
  parameters: {
    type: 'object',
    properties: {
      prefix: { type: 'string', description: 'Case-sensitive prefix to filter tag names.' },
      limit: { type: 'number', description: 'Max tags to return (1–200, default 50).' }
    }
  },
  sideEffect: false,
  async execute(args) {
    const db = dbService.requireCurrent()
    const limit = Math.max(1, Math.min(200, args.limit ?? 50))
    const prefix = args.prefix ?? ''
    const rows = prefix
      ? db
          .prepare(
            'SELECT name, usage_count FROM tags WHERE name LIKE ? ORDER BY usage_count DESC LIMIT ?'
          )
          .all(prefix.replace(/[%_]/g, '\\$&') + '%', limit)
      : db
          .prepare('SELECT name, usage_count FROM tags ORDER BY usage_count DESC LIMIT ?')
          .all(limit)
    return { items: rows as Array<{ name: string; usage_count: number }> }
  }
}
export default tool
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/tools/list_tags.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/list_tags.ts electron/agent/tools/list_tags.test.ts
git commit -m "feat(phase-16): tool list_tags — usage-sorted with optional prefix filter"
```

<!-- openspec-task: 4.4 -->

### Task 8: Tool — `update_frontmatter` (sideEffect, reason required, null→delete)

**Files:**

- Create: `electron/agent/tools/update_frontmatter.ts`
- Create: `electron/agent/tools/update_frontmatter.test.ts`
- Modify: `shared/ipc-contract.ts` (add new error codes to documentation block / `IpcError` const list if any; otherwise leave as-is)

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/tools/update_frontmatter.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import updateFm from './update_frontmatter'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'phase16-uf-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})
const ctx = () => ({
  sessionId: 's1',
  vaultRoot: root,
  cancel: new AbortController().signal,
  log: () => {}
})

describe('update_frontmatter', () => {
  it('rejects without reason → E_MISSING_REASON', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r: any = await updateFm.execute(
      { path: 'a.md', patch: { rating: 5 }, expectedMtime: mtime } as any,
      ctx()
    )
    expect(r).toEqual({ ok: false, error: 'E_MISSING_REASON' })
  })

  it('merges patch into existing frontmatter and writes atomically', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r: any = await updateFm.execute(
      {
        path: 'a.md',
        patch: { rating: 5, status: 'reviewed' },
        reason: 'user asked',
        expectedMtime: mtime
      } as any,
      ctx()
    )
    expect(r.ok).toBe(true)
    const txt = readFileSync(join(root, 'a.md'), 'utf8')
    expect(txt).toMatch(/rating: 5/)
    expect(txt).toMatch(/status: reviewed/)
    expect(txt).toMatch(/title: A/)
  })

  it('null in patch deletes the key', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\nrating: 3\nstatus: draft\n---\nbody')
    const mtime = statSync(join(root, 'a.md')).mtimeMs
    const r: any = await updateFm.execute(
      { path: 'a.md', patch: { status: null }, reason: 'cleanup', expectedMtime: mtime } as any,
      ctx()
    )
    expect(r.ok).toBe(true)
    const txt = readFileSync(join(root, 'a.md'), 'utf8')
    expect(txt).not.toMatch(/^status:/m)
    expect(txt).toMatch(/title: A/)
  })

  it('returns E_MTIME_CONFLICT when expectedMtime is stale', async () => {
    writeFileSync(join(root, 'a.md'), '---\ntitle: A\n---\n')
    const r: any = await updateFm.execute(
      { path: 'a.md', patch: { rating: 5 }, reason: 'r', expectedMtime: 0 } as any,
      ctx()
    )
    expect(r).toMatchObject({ ok: false, error: 'E_MTIME_CONFLICT' })
  })

  it('returns E_PATH_ESCAPE on ../', async () => {
    const r: any = await updateFm.execute(
      { path: '../x', patch: {}, reason: 'r', expectedMtime: 0 } as any,
      ctx()
    )
    expect(r).toEqual({ ok: false, error: 'E_PATH_ESCAPE' })
  })

  it('declares sideEffect=true and reason in parameters', () => {
    expect(updateFm.sideEffect).toBe(true)
    expect((updateFm.parameters as any).required).toEqual(
      expect.arrayContaining(['path', 'patch', 'reason'])
    )
  })
})
```

- [ ] **Step 2: Run tests — should FAIL**

```bash
npx vitest run electron/agent/tools/update_frontmatter.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/tools/update_frontmatter.ts
import type { Tool } from '../../../shared/agent-types'
import { safeResolve } from '../../services/path-safety'
import { readFileDetect, writeWithVerify, normalizeForDisk } from '../../services/fs-atomic'
import { parseFile, stringify } from '../../services/frontmatter'
import { IpcError } from '../../../shared/ipc-contract'

const tool: Tool<
  { path: string; patch: Record<string, unknown>; reason: string; expectedMtime?: number },
  unknown
> = {
  name: 'update_frontmatter',
  description:
    "Merge a JSON patch into a markdown file's YAML frontmatter. Setting a key to null deletes that key. ALWAYS provide a `reason`. The user will be asked to approve before this runs.",
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path within the grove.' },
      patch: {
        type: 'object',
        description:
          'Object whose keys will be merged into existing frontmatter; null values delete the key.'
      },
      reason: { type: 'string', description: 'Why this change is being made (shown to the user).' },
      expectedMtime: {
        type: 'number',
        description:
          'Last-known file mtimeMs for optimistic locking. Get this from a prior read_file.'
      }
    },
    required: ['path', 'patch', 'reason']
  },
  sideEffect: true,
  async execute(args, ctx) {
    if (!args.reason || typeof args.reason !== 'string' || !args.reason.trim()) {
      return { ok: false as const, error: 'E_MISSING_REASON' }
    }
    let abs: string
    try {
      abs = safeResolve(ctx.vaultRoot, args.path)
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
      if (e?.code === 'ENOENT') return { ok: false as const, error: 'E_NOT_FOUND' }
      return { ok: false as const, error: e?.code ?? 'E_READ_FAILED', detail: e?.message }
    }
    const parsed = parseFile(read.content)
    const merged = mergePatch(parsed.frontmatter ?? {}, args.patch)
    const newContent = normalizeForDisk(stringify(merged, parsed.body), read.eol)
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
  }
}
export default tool

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
```

- [ ] **Step 4: Run tests — should PASS**

```bash
npx vitest run electron/agent/tools/update_frontmatter.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/update_frontmatter.ts electron/agent/tools/update_frontmatter.test.ts
git commit -m "feat(phase-16): tool update_frontmatter — sideEffect, reason required, null→delete"
```

<!-- openspec-task: 4.5 -->

### Task 9: Tool — `clip_summary` (re-uses phase-15 `reviewClip`)

**Files:**

- Create: `electron/agent/tools/clip_summary.ts`
- Create: `electron/agent/tools/clip_summary.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// electron/agent/tools/clip_summary.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../ai/reviewer', () => ({
  reviewClip: vi.fn(async (clipId: string, opts: any) => ({
    result: {
      summary: `summary for ${clipId}`,
      tags: ['t1'],
      ai_review_model: 'gpt-x',
      ai_review_at: '2026-05-04T00:00:00Z'
    },
    latencyMs: 100,
    model: 'gpt-x',
    usage: { promptTokens: 10, completionTokens: 5 }
  }))
}))
import { reviewClip } from '../../ai/reviewer'
import clipSummary from './clip_summary'

beforeEach(() => {
  ;(reviewClip as any).mockClear()
})

describe('clip_summary', () => {
  it('calls reviewer.reviewClip and returns summary', async () => {
    const r: any = await clipSummary.execute({ clipId: 'c1' } as any, {
      sessionId: 's',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect(r.ok).toBe(true)
    expect(r.data.summary).toBe('summary for c1')
    expect(reviewClip).toHaveBeenCalledWith('c1', { force: false })
  })

  it('forwards force=true', async () => {
    await clipSummary.execute({ clipId: 'c2', force: true } as any, {
      sessionId: 's',
      vaultRoot: '/v',
      cancel: new AbortController().signal,
      log: () => {}
    })
    expect(reviewClip).toHaveBeenCalledWith('c2', { force: true })
  })

  it('declares sideEffect=false', () => {
    expect(clipSummary.sideEffect).toBe(false)
    expect((clipSummary.parameters as any).required).toEqual(['clipId'])
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/agent/tools/clip_summary.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/tools/clip_summary.ts
import type { Tool } from '../../../shared/agent-types'
import { reviewClip } from '../../ai/reviewer'

const tool: Tool<{ clipId: string; force?: boolean }, unknown> = {
  name: 'clip_summary',
  description:
    'Generate (or re-fetch the cached) AI summary for a clipped article. Returns the summary, tags, and review timestamp. Pass `force: true` to re-run even if a recent review exists.',
  parameters: {
    type: 'object',
    properties: {
      clipId: {
        type: 'string',
        description: 'Clip ID — find these by searching files where frontmatter.kind === "clip".'
      },
      force: { type: 'boolean', description: 'Re-run review even if cached.' }
    },
    required: ['clipId']
  },
  sideEffect: false, // reviewer's frontmatter writeback is internal and mtime-locked
  async execute(args) {
    try {
      const r = await reviewClip(args.clipId, { force: !!args.force })
      return {
        ok: true as const,
        data: {
          summary: r.result.summary,
          tags: r.result.tags ?? [],
          reviewedAt: r.result.ai_review_at,
          model: r.model
        }
      }
    } catch (e: any) {
      return { ok: false as const, error: e?.code ?? 'E_REVIEW_FAILED', detail: e?.message }
    }
  }
}
export default tool
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/tools/clip_summary.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/tools/clip_summary.ts electron/agent/tools/clip_summary.test.ts
git commit -m "feat(phase-16): tool clip_summary — wraps phase-15 reviewer.reviewClip"
```

<!-- openspec-task: 4.6 -->

### Task 10: Bootstrap — register all 5 tools at startup + self-check

**Files:**

- Create: `electron/agent/bootstrap.ts`
- Create: `electron/agent/bootstrap.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// electron/agent/bootstrap.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { bootstrapAgent } from './bootstrap'
import { createRegistry } from './registry'

describe('bootstrapAgent', () => {
  it('registers exactly the 5 documented tools and self-check passes', () => {
    const r = createRegistry()
    bootstrapAgent(r)
    const names = r
      .list()
      .map((t) => t.name)
      .sort()
    expect(names).toEqual([
      'clip_summary',
      'list_tags',
      'read_file',
      'search_files',
      'update_frontmatter'
    ])
    for (const t of r.list()) {
      expect(t.description).toBeTruthy()
      expect((t.parameters as any).type).toBe('object')
    }
  })

  it('throws on a duplicate registration attempt', () => {
    const r = createRegistry()
    bootstrapAgent(r)
    expect(() => bootstrapAgent(r)).toThrow(/already registered/)
  })
})
```

- [ ] **Step 2: Run test — should FAIL**

```bash
npx vitest run electron/agent/bootstrap.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement**

```ts
// electron/agent/bootstrap.ts
import type { Registry } from './registry'
import searchFiles from './tools/search_files'
import readFile from './tools/read_file'
import listTags from './tools/list_tags'
import updateFrontmatter from './tools/update_frontmatter'
import clipSummary from './tools/clip_summary'

export function bootstrapAgent(registry: Registry): void {
  for (const tool of [searchFiles, readFile, listTags, updateFrontmatter, clipSummary]) {
    registry.register(tool)
  }
  for (const t of registry.list()) {
    if (!t.description?.trim())
      throw new Error(`agent self-check: tool ${t.name} has empty description`)
    if (!(t.parameters as any)?.type)
      throw new Error(`agent self-check: tool ${t.name} parameters missing type`)
  }
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
npx vitest run electron/agent/bootstrap.test.ts
```

Expected: all 2 tests pass.

- [ ] **Step 5: Wire into app bootstrap**

Find the app-level `bootstrap.ts` (typically `electron/bootstrap.ts` or similar). Add an import and a call inside the existing `init` / `bootstrap` function, after DB is opened:

```ts
import { bootstrapAgent } from './agent/bootstrap'
import { registry } from './agent/registry'
// ... after dbService.openForGrove(...):
bootstrapAgent(registry)
```

If no central bootstrap file exists yet, document this as a TODO comment in `electron/agent/bootstrap.ts` referencing OpenSpec task 6.1 (Plan 3) where the IPC handler will be wired up alongside.

- [ ] **Step 6: Run all phase-16 plan-2 tests**

```bash
npx vitest run electron/agent shared/agent-types electron/ai/prompts/chat-agent
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add electron/agent/bootstrap.ts electron/agent/bootstrap.test.ts electron/bootstrap.ts
git commit -m "feat(phase-16): bootstrap registers 5 builtin tools + startup self-check"
```

---

## Self-Review

- **Spec coverage:** 10 OpenSpec tasks (3.1–4.6) → 10 plan tasks above with annotations. ✓
- **Type consistency:** `Tool<TArgs, TResult>` signatures match `shared/agent-types.ts`. `sideEffect: false` for read-only tools, `true` only on `update_frontmatter`. ✓
- **No placeholders:** Every step has runnable test code or implementation; the wiring step in Task 10 documents the exact import lines. ✓
- **Approval gate vs loop test cohesion:** `loop.test.ts` polls `stream.events` for the approval-needed event (rather than assuming a synchronous order); this matches the real promise-suspend behavior in `approval.ts`. ✓
- **`registry` exported as singleton AND `createRegistry` factory** so tests can isolate without leaking. ✓
