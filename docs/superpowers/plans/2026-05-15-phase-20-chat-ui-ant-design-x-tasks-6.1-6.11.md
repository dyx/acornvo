# Phase 20 · Chat UI Ant Design X — Tasks 6.1–6.11 (Store Slimming)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-20-chat-ui-ant-design-x` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `streamingBuffer` + `flushedLength` from `SessionState`, formalize `ChatMessage.status`, rewire the token / message.appended / done / tool.start / tool.result reducers so the streaming assistant message is **lazily created** in the messages array (no more side-channel buffer), consume the phase-19 K1 `callId` field on `tool.start` / `tool.result`, default-on 16ms token batching with a `__chatTokenBatching` global escape hatch, update `chat.test.ts`, and finally delete `src/hooks/useStreamingText.{ts,test.ts}` after grep-confirming no remaining references. After this plan: the store is the single source of truth; `Bubble.streaming` + `XMarkdown` render directly from `messages[i].text` with no DOM-side animation.

**Architecture:**

1. **Remove**: `SessionState.streamingBuffer: string` and `SessionState.flushedLength: number`; also remove from `emptySession()` and from `sendUserMessage` reducer. Public store action shapes do NOT change.
2. **Add**: `ChatMessage.status?: 'pending' | 'streaming' | 'done' | 'error'` (Plan 2 added it as a soft field; this task makes it official). `toChatMessage(m)` from DB-loaded messages sets `status: 'done'`.
3. **token reducer (rewritten)**:
   - If the last message is `role==='assistant' && status==='streaming'`, append `event.text` to its `.text`.
   - Else push a fresh `{ id: nextMsgId(), role: 'assistant', text: event.text, status: 'streaming', createdAt: Date.now() }`.
   - Also flip `cur.status` to `'streaming'`.
4. **message.appended reducer (rewritten)**:
   - If `event.message.role === 'assistant'` AND the last store message is the streaming assistant placeholder (status='streaming'), **merge**: keep `text` (already accumulated), set new `id = event.message.id`, set `toolCalls = event.message.toolCalls`, and mark `status: 'done'` IF event implies completion (the actual final-status flip happens on the `done` event, not here — keep `status: 'streaming'` until then unless event indicates otherwise).
   - Else push as a new message via `toChatMessage(event.message)`.
5. **done reducer (rewritten)**:
   - Set the latest assistant message's `status = 'done'`.
   - Flip `cur.status` to `'awaiting-approval'` if `pendingApprovals.length > 0`, else `'idle'`.
   - Delete the old `streamingBuffer → push new message` logic entirely.
6. **tool.start reducer**:
   - Consume `event.callId` (Plan 1 verified phase-19 K1 has it). Push tool message with `toolCallId = event.callId`.
   - Additionally, if the last assistant message has `toolCalls` and one of them has `id === event.callId` already, do nothing extra. If not (translator wrote tool.start before assistant message.appended landed; uncommon under phase-19 but defensive), defer — selector handles fallback.
7. **tool.result reducer**: Consume `event.callId`; push tool message with `toolCallId = event.callId` and JSON-serialize the result for storage; the existing `E_APPROVAL_TIMEOUT` branch stays.
8. **Token batching**:
   - Introduce a module-private `pendingTokenBuckets: Map<sessionId, string>`.
   - Introduce a 16ms timer keyed per session (`setTimeout(flush, 16)` if not already scheduled).
   - `flush(sid)` runs the actual `setState` that appends the bucket content to the streaming message.
   - Global escape hatch: `const __chatTokenBatching = true` exported; tests may set it `false` to bypass and call the synchronous reducer path.
9. **Test rewrites**: `chat.test.ts` deletes `streamingBuffer` / `flushedLength` assertions, adds new assertions for: status field on streaming/done, lazy creation of streaming assistant, message.appended merging, tool.start/result callId propagation, and a `__chatTokenBatching=false` path covering per-token assertions.
10. **`useStreamingText.{ts,test.ts}` deletion**: Plan 3 already stopped importing the hook (the new BubbleListAdapter does not use it). After confirming via grep, delete both files.

**Tech Stack:** TypeScript 5, Zustand, `vitest`, no UI deps in this plan.

**Repo conventions:** as in earlier plans.

---

<!-- openspec-task: 6.1 -->

### Task 1: Remove streamingBuffer & flushedLength from SessionState

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Edit the SessionState interface**

Open `/Users/aaa/develop/workspace-ai/acornvo/src/stores/chat.ts`. Locate the `SessionState` interface (around line 35–47) and delete the two lines:

```ts
streamingBuffer: string
flushedLength: number
```

The interface becomes:

```ts
export interface SessionState {
  loaded: boolean
  messages: ChatMessage[]
  pendingApprovals: PendingApproval[]
  pendingAttachments: Attachment[]
  pendingPromptText: string
  status: SessionStatus
  error: string | null
  lastUserText: string
  lastUserAttachments: Attachment[]
}
```

- [x] **Step 2: Edit emptySession()**

Locate `emptySession()` (around line 100). Delete the two corresponding lines:

```ts
  streamingBuffer: '',
  flushedLength: 0,
```

The factory becomes:

```ts
const emptySession = (): SessionState => ({
  loaded: false,
  messages: [],
  pendingApprovals: [],
  pendingAttachments: [],
  pendingPromptText: '',
  status: 'idle',
  error: null,
  lastUserText: '',
  lastUserAttachments: []
})
```

- [x] **Step 3: Edit sendUserMessage reducer**

Locate `sendUserMessage` (around line 230). Inside the `set((s) => ({...}))` body, delete the two lines:

```ts
          streamingBuffer: '',
          flushedLength: 0,
```

- [x] **Step 4: Do NOT typecheck or commit yet**

The token / done / tool.start / tool.result reducers still reference `streamingBuffer`. They'll be rewritten in Tasks 4–7. Build is intentionally broken between Tasks 1 and 7.

---

<!-- openspec-task: 6.2 -->

### Task 2: Formalize ChatMessage.status field

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Add the status field**

Locate `ChatMessage` interface (around line 13). Plan 2 may have added `status?:` already. Confirm it exists and reads:

```ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  toolCalls?: { id: string; name: string; args: unknown }[]
  toolCallId?: string
  attachments?: Attachment[]
  createdAt: number
  error?: string
  status?: 'pending' | 'streaming' | 'done' | 'error'
}
```

If Plan 2 did not add the field, add it now.

- [x] **Step 2: Update toChatMessage() to set status='done'**

Locate `toChatMessage()` (around line 59). Change to:

```ts
function toChatMessage(m: SessionMessage): ChatMessage {
  return {
    id: String(m.id),
    role: m.role,
    text: m.content ?? '',
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    createdAt: new Date(m.createdAt).getTime(),
    status: 'done'
  }
}
```

- [x] **Step 3: Do NOT commit yet — bundle with rest of store rewrite**

---

<!-- openspec-task: 6.3 -->

### Task 3: Rewrite the token reducer for lazy streaming assistant + batching prep

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Add the batching infrastructure (above the subscribe function)**

In `/Users/aaa/develop/workspace-ai/acornvo/src/stores/chat.ts`, locate the section just before `subscribeSessionStream` (around line 393). Insert:

```ts
// ── token batching ───────────────────────────────────────────────────

export let __chatTokenBatching = true

/** Test hook to force synchronous token reducer paths. */
export function __setChatTokenBatching(enabled: boolean): void {
  __chatTokenBatching = enabled
}

const pendingTokenBucket = new Map<string, string>()
const pendingFlushTimer = new Map<string, ReturnType<typeof setTimeout>>()

function flushTokenBucket(sid: string): void {
  const txt = pendingTokenBucket.get(sid) ?? ''
  pendingTokenBucket.delete(sid)
  pendingFlushTimer.delete(sid)
  if (!txt) return
  applyToken(sid, txt)
}

function applyToken(sid: string, txt: string): void {
  useChatStore.setState((s) => {
    const cur = s.bySession[sid] ?? emptySession()
    const lastIdx = cur.messages.length - 1
    const last = cur.messages[lastIdx]
    const isStreamingAssistant = last && last.role === 'assistant' && last.status === 'streaming'
    let nextMessages: ChatMessage[]
    if (isStreamingAssistant) {
      nextMessages = cur.messages.map((m, i) => (i === lastIdx ? { ...m, text: m.text + txt } : m))
    } else {
      nextMessages = [
        ...cur.messages,
        {
          id: nextMsgId(),
          role: 'assistant' as const,
          text: txt,
          status: 'streaming' as const,
          createdAt: Date.now()
        }
      ]
    }
    return {
      bySession: {
        ...s.bySession,
        [sid]: { ...cur, messages: nextMessages, status: 'streaming' }
      }
    }
  })
}

function enqueueToken(sid: string, txt: string): void {
  if (!__chatTokenBatching) {
    applyToken(sid, txt)
    return
  }
  pendingTokenBucket.set(sid, (pendingTokenBucket.get(sid) ?? '') + txt)
  if (!pendingFlushTimer.has(sid)) {
    const tid = setTimeout(() => flushTokenBucket(sid), 16)
    pendingFlushTimer.set(sid, tid)
  }
}
```

- [x] **Step 2: Replace the case 'token' branch in subscribeSessionStream**

Locate the `subscribeSessionStream` function (around line 395) and find the `case 'token':` branch (around line 401). Replace it with a call to `enqueueToken`:

```ts
        case 'token':
          enqueueToken(sid, event.text)
          return s
```

Note: returning `s` unchanged is correct because `enqueueToken` triggers its own `setState` later (or immediately if batching is off).

- [x] **Step 3: Do NOT commit yet**

---

<!-- openspec-task: 6.4 -->

### Task 4: Rewrite message.appended reducer to merge with streaming placeholder

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Replace the case 'message.appended' branch**

In `subscribeSessionStream`, locate `case 'message.appended':` (around line 485). Before mutating state, flush any pending token bucket so the streaming text is up-to-date:

```ts
        case 'message.appended': {
          flushTokenBucket(sid)
          const incoming = toChatMessage(event.message)
          if (incoming.role !== 'assistant') {
            return {
              bySession: {
                ...s.bySession,
                [sid]: { ...cur, messages: [...cur.messages, incoming] },
              },
            }
          }
          // Assistant — try to merge with the latest streaming assistant placeholder.
          const lastIdx = cur.messages.length - 1
          const last = cur.messages[lastIdx]
          if (last && last.role === 'assistant' && last.status === 'streaming') {
            const merged: ChatMessage = {
              ...last,
              id: incoming.id,
              toolCalls: incoming.toolCalls ?? last.toolCalls,
              // Preserve the accumulated streaming text; backend's incoming.text
              // is also the final text — prefer incoming if non-empty AND placeholder
              // had no tokens, else keep accumulated.
              text: last.text || incoming.text,
              status: last.status, // stays 'streaming' until 'done' event flips it
            }
            return {
              bySession: {
                ...s.bySession,
                [sid]: {
                  ...cur,
                  messages: cur.messages.map((m, i) => (i === lastIdx ? merged : m)),
                },
              },
            }
          }
          return {
            bySession: {
              ...s.bySession,
              [sid]: { ...cur, messages: [...cur.messages, incoming] },
            },
          }
        }
```

- [x] **Step 2: Do NOT commit yet**

---

<!-- openspec-task: 6.5 -->

### Task 5: Rewrite done reducer (no more streamingBuffer→message push)

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Replace the case 'done' branch**

In `subscribeSessionStream`, locate `case 'done':` (around line 412) and replace the entire block with:

```ts
        case 'done': {
          flushTokenBucket(sid)
          // Find the latest streaming assistant message and mark it done.
          const idx = (() => {
            for (let i = cur.messages.length - 1; i >= 0; i--) {
              const m = cur.messages[i]
              if (m.role === 'assistant' && m.status === 'streaming') return i
            }
            return -1
          })()
          const nextMessages =
            idx === -1
              ? cur.messages
              : cur.messages.map((m, i) => (i === idx ? { ...m, status: 'done' as const } : m))
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                messages: nextMessages,
                status: cur.pendingApprovals.length > 0 ? 'awaiting-approval' : 'idle',
              },
            },
          }
        }
```

Note: the old code constructed a brand-new assistant message from `streamingBuffer`. The new code does not — message has been accumulating in-place since the first token (Task 3). The `done` event only flips status.

- [x] **Step 2: Do NOT commit yet**

---

<!-- openspec-task: 6.6 -->

### Task 6: Rewrite tool.start reducer to consume event.callId

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Replace the case 'tool.start' branch**

In `subscribeSessionStream`, locate `case 'tool.start':` (around line 433). Replace with:

```ts
        case 'tool.start': {
          flushTokenBucket(sid)
          const callId = (event as { callId?: string }).callId
          // Optionally promote callId onto the latest assistant message's toolCalls[i].id
          // (if translator emitted tool.start before backfilling assistant.toolCalls).
          let nextMessages: ChatMessage[] = cur.messages
          if (callId) {
            for (let i = cur.messages.length - 1; i >= 0; i--) {
              const m = cur.messages[i]
              if (m.role === 'assistant' && m.toolCalls?.length) {
                const matches = m.toolCalls.some((tc) => tc.id === callId)
                if (!matches) {
                  // promote: find first toolCall with name === event.tool whose id placeholder
                  const promoted = m.toolCalls.map((tc) =>
                    tc.id === '' && tc.name === event.tool ? { ...tc, id: callId } : tc,
                  )
                  nextMessages = cur.messages.map((mm, j) =>
                    j === i ? { ...mm, toolCalls: promoted } : mm,
                  )
                }
                break
              }
            }
          }
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                messages: [
                  ...nextMessages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text: event.tool, // placeholder until result arrives
                    toolCallId: callId,
                    toolCalls: [
                      { id: callId ?? nextMsgId(), name: event.tool, args: event.args },
                    ],
                    createdAt: Date.now(),
                    status: 'pending' as const,
                  },
                ],
              },
            },
          }
        }
```

- [x] **Step 2: Do NOT commit yet**

---

<!-- openspec-task: 6.7 -->

### Task 7: Rewrite tool.result reducer to consume event.callId

**Files:**

- Modify: `src/stores/chat.ts`

- [x] **Step 1: Replace the case 'tool.result' branch**

In `subscribeSessionStream`, locate `case 'tool.result':` (around line 454). Replace with:

```ts
        case 'tool.result': {
          flushTokenBucket(sid)
          const callId = (event as { callId?: string }).callId
          const isApprovalTimeout =
            event.result.ok === false && event.result.error === 'E_APPROVAL_TIMEOUT'
          const text =
            event.result.ok === true
              ? JSON.stringify(event.result)
              : `error: ${event.result.error}`
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                pendingApprovals: isApprovalTimeout
                  ? cur.pendingApprovals.map((a) =>
                      a.toolName === event.tool && !a.timedOut
                        ? { ...a, timedOut: true }
                        : a,
                    )
                  : cur.pendingApprovals,
                messages: [
                  ...cur.messages,
                  {
                    id: nextMsgId(),
                    role: 'tool' as const,
                    text,
                    toolCallId: callId,
                    createdAt: Date.now(),
                    status: 'done' as const,
                  },
                ],
              },
            },
          }
        }
```

Note: tool message `text` now stores the full `{ok, data}` or `error: ...` form. The selector in Plan 2 parses this back. If the selector was written to expect bare `JSON.stringify(event.result.data)` (the old shape), update `parseToolResultText` in `src/components/chat/bubbleSelectors.ts` to handle either shape (see Plan 2 Task 2 — it already handles both `{ok, data}` shape via `JSON.parse` and `error: ...` fallback, so this matches).

- [x] **Step 2: Do NOT commit yet**

---

<!-- openspec-task: 6.8 -->

### Task 8: Verify token batching wires through and typecheck the store

**Files:**

- No file change in this task — validation pass.

- [x] **Step 1: Run typecheck**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web 2>&1 | tail -50`
Expected: pass. If errors point to leftover `streamingBuffer`/`flushedLength` references in other modules, list them — Task 11 cleans them up; but if the store itself fails to compile, fix it now.

Common pitfalls:

- `ChatMessage.status === 'streaming'` requires `status` field present on the type (Task 2).
- The case branches all return either `s` unchanged or a new state shape — keep TypeScript narrowing happy by NOT mixing return shapes within a switch arm.

- [x] **Step 2: Run the existing chat.test.ts to see which assertions break**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/stores/chat.test.ts 2>&1 | tail -30`
Expected: many failures referencing `streamingBuffer` / `flushedLength` / message id shape changes. List them — Task 9 rewrites the test file.

- [x] **Step 3: Do NOT commit yet — bundle with Task 9 changes**

---

<!-- openspec-task: 6.9 -->

### Task 9: Rewrite src/stores/chat.test.ts for the new reducers

**Files:**

- Modify: `src/stores/chat.test.ts`

- [x] **Step 1: Open the file and identify legacy assertions**

Run: `grep -n "streamingBuffer\|flushedLength" /Users/aaa/develop/workspace-ai/acornvo/src/stores/chat.test.ts`

For each match, either delete (assertion about a removed field) or replace (assertion that should now check `messages[i].text` or `messages[i].status` instead).

- [x] **Step 2: Add new test cases**

Append the following `describe('store streaming reducers', () => { ... })` block (or merge into the existing one). Replace the file as needed. Key new cases:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore, __setChatTokenBatching } from './chat'

describe('store streaming reducers (Plan 4 rewrite)', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        }
      }
    } as any)
    __setChatTokenBatching(false) // synchronous path for assertion determinism
  })

  function emit(event: any) {
    // Reach into the subscriber directly. The test must call the same
    // setState transition the subscriber would. Easiest: replicate the
    // dispatch by calling a helper exported for tests.
    // If chat.ts does not export a dispatch helper, simulate via the
    // store's existing onStream subscriber wiring: the test setup should
    // mock ipc.chat.onStream to capture the callback.
    // See chat.test.ts existing helpers for the established pattern; reuse.
    throw new Error('use the existing onStream-capture helper from this file')
  }

  it('first token lazily creates a streaming assistant message', () => {
    emit({ type: 'token', text: 'he' })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.messages).toHaveLength(1)
    expect(slot.messages[0]).toMatchObject({
      role: 'assistant',
      text: 'he',
      status: 'streaming'
    })
    expect(slot.status).toBe('streaming')
  })

  it('subsequent tokens append to the same streaming message', () => {
    emit({ type: 'token', text: 'he' })
    emit({ type: 'token', text: 'llo' })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.messages).toHaveLength(1)
    expect(slot.messages[0].text).toBe('hello')
  })

  it('message.appended (assistant) merges into the streaming placeholder', () => {
    emit({ type: 'token', text: 'hello' })
    emit({
      type: 'message.appended',
      message: {
        id: 'real-id',
        role: 'assistant',
        content: 'hello',
        toolCalls: [{ id: 'A', name: 'fa', args: {} }],
        createdAt: new Date().toISOString()
      }
    })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.messages).toHaveLength(1)
    expect(slot.messages[0]).toMatchObject({
      id: 'real-id',
      role: 'assistant',
      text: 'hello',
      status: 'streaming',
      toolCalls: [{ id: 'A', name: 'fa', args: {} }]
    })
  })

  it('done flips status to done and idle', () => {
    emit({ type: 'token', text: 'hi' })
    emit({ type: 'done' })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.messages[0].status).toBe('done')
    expect(slot.status).toBe('idle')
  })

  it('done with pendingApprovals flips status to awaiting-approval', () => {
    emit({ type: 'token', text: 'hi' })
    useChatStore.setState((s) => ({
      bySession: {
        ...s.bySession,
        s1: {
          ...s.bySession.s1,
          pendingApprovals: [{ callId: 'A', toolName: 'fa', args: {}, reason: '', receivedAt: 0 }]
        }
      }
    }))
    emit({ type: 'done' })
    expect(useChatStore.getState().bySession.s1.status).toBe('awaiting-approval')
  })

  it('tool.start consumes callId and stores it on toolCallId', () => {
    emit({ type: 'tool.start', callId: 'X1', tool: 'search', args: { q: 'x' } })
    const msgs = useChatStore.getState().bySession.s1.messages
    const toolMsg = msgs.find((m) => m.role === 'tool')!
    expect(toolMsg.toolCallId).toBe('X1')
  })

  it('tool.result consumes callId and stores it on toolCallId', () => {
    emit({ type: 'tool.result', callId: 'X1', tool: 'search', result: { ok: true, data: [1] } })
    const msgs = useChatStore.getState().bySession.s1.messages
    const toolMsg = msgs.find((m) => m.role === 'tool')!
    expect(toolMsg.toolCallId).toBe('X1')
    expect(toolMsg.text).toBe(JSON.stringify({ ok: true, data: [1] }))
  })

  it('token batching off — each token is a separate setState', () => {
    __setChatTokenBatching(false)
    const spy = vi.spyOn(useChatStore, 'setState')
    emit({ type: 'token', text: 'a' })
    emit({ type: 'token', text: 'b' })
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('token batching on — multiple tokens within 16ms collapse to one setState', async () => {
    __setChatTokenBatching(true)
    const spy = vi.spyOn(useChatStore, 'setState')
    emit({ type: 'token', text: 'a' })
    emit({ type: 'token', text: 'b' })
    emit({ type: 'token', text: 'c' })
    await new Promise((r) => setTimeout(r, 30))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(useChatStore.getState().bySession.s1.messages[0].text).toBe('abc')
    spy.mockRestore()
  })
})
```

Replace the placeholder `emit(...)` stub with the actual subscriber-callback helper used elsewhere in `chat.test.ts`. Run `grep -n "onStream\|emit\|capture" /Users/aaa/develop/workspace-ai/acornvo/src/stores/chat.test.ts` to find it.

- [x] **Step 3: Run tests to verify all pass**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/stores/chat.test.ts`
Expected: PASS. Iterate on any failing assertion — the new reducer logic must match the new tests.

- [x] **Step 4: Commit the entire store rewrite (Tasks 1–7 + 9 + theme test stable)**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts
git commit -m "refactor(chat-store): lazy streaming assistant + status field + callId propagation + 16ms batching"
```

---

<!-- openspec-task: 6.10 -->

### Task 10: Delete src/hooks/useStreamingText.ts and useStreamingText.test.ts

**Files:**

- Delete: `src/hooks/useStreamingText.ts`
- Delete: `src/hooks/useStreamingText.test.ts`

- [x] **Step 1: Verify no remaining imports**

Run: `grep -rn "useStreamingText" /Users/aaa/develop/workspace-ai/acornvo/src /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared 2>/dev/null`
Expected: no results (Plan 3's `Chat.tsx` rewrite removed the last import).

If any reference remains, STOP and re-read Plan 3 Task 12. Either Plan 3 missed a hook reference, or a non-chat file uses it (unlikely — the hook was chat-only). Fix the caller before deleting.

- [x] **Step 2: Delete the files**

```bash
rm /Users/aaa/develop/workspace-ai/acornvo/src/hooks/useStreamingText.ts
rm /Users/aaa/develop/workspace-ai/acornvo/src/hooks/useStreamingText.test.ts
```

- [x] **Step 3: Run tests to confirm no fallout**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run`
Expected: pass.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(chat-store): delete useStreamingText hook + test (replaced by store-driven streaming)"
```

---

<!-- openspec-task: 6.11 -->

### Task 11: Grep and clean any lingering useStreamingText / streamingBuffer / flushedLength references

**Files:**

- Modify: any source files still referencing the removed identifiers (expected: none after Task 10).

- [x] **Step 1: Final grep sweep**

Run each command and confirm zero results across `src/`, `electron/`, `shared/`:

```bash
grep -rn "useStreamingText" /Users/aaa/develop/workspace-ai/acornvo/src /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared 2>/dev/null
grep -rn "streamingBuffer" /Users/aaa/develop/workspace-ai/acornvo/src /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared 2>/dev/null
grep -rn "flushedLength" /Users/aaa/develop/workspace-ai/acornvo/src /Users/aaa/develop/workspace-ai/acornvo/electron /Users/aaa/develop/workspace-ai/acornvo/shared 2>/dev/null
```

- [x] **Step 2: If grep returns results, clean each one**

Likely candidates:

- `src/__acceptance__/chat-acceptance.test.tsx` — its `mkSlot()` helper probably still seeds the two fields. Plan 5 Task 7 (`tasks 7.7`) rewrites this file fully — defer cleanup there if it shows up.
- Any leftover comment block in `chat.ts`.

If the only remaining hits are in `chat-acceptance.test.tsx`, leave them; Plan 5 Task 7 handles. Document this in the commit.

- [x] **Step 3: Run full test suite**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run`
Expected: all pass (chat-acceptance.test.tsx may still fail; that's Plan 5's job).

- [x] **Step 4: Commit completion marker**

```bash
git commit --allow-empty -m "chore(chat-store): grep clean — useStreamingText/streamingBuffer/flushedLength removed from non-acceptance code paths

Remaining hits in src/__acceptance__/chat-acceptance.test.tsx — handled by Plan 5 task 7.7."
```

---

## Plan completion checklist

After all 11 tasks pass, before moving to Plan 5:

- [x] `SessionState` no longer declares `streamingBuffer` or `flushedLength`.
- [x] `ChatMessage` declares `status?: 'pending' | 'streaming' | 'done' | 'error'`.
- [x] `subscribeSessionStream` token reducer lazily creates / appends the streaming assistant.
- [x] `message.appended` reducer merges with the streaming placeholder when present.
- [x] `done` reducer flips status without re-creating the message.
- [x] `tool.start` and `tool.result` reducers consume `event.callId` and stamp it onto `toolCallId`.
- [x] `__setChatTokenBatching(boolean)` exported for tests; default-on 16ms batching active in production.
- [x] `src/hooks/useStreamingText.{ts,test.ts}` deleted.
- [x] Grep shows zero references to `useStreamingText` / `streamingBuffer` / `flushedLength` outside the acceptance test (acceptance handled in Plan 5).
- [x] `npx vitest run src/stores/chat.test.ts` passes (with new + retained assertions).
- [x] `npm run typecheck` passes.
