# Phase 17 — Chat UI & Sessions: Plan 1 (Foundation: Types, Store, Page Skeleton)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-17-chat-ui-sessions`
> **Task range:** OpenSpec tasks `1.1`–`2.4` (8 tasks)
> **Plan order:** 1 of 5. Followed by Plan 2 (`tasks-3.1-4.7`), Plan 3 (`tasks-5.1-6.7`), Plan 4 (`tasks-7.1-9.4`), Plan 5 (`tasks-10.1-11.18`).
> **Status:** Not started
> **Created:** 2026-05-05
> **Branch suggestion:** `feat/phase-17-chat-ui-sessions` (branch from `main` after phase-16 merges)

---

## Goal

Land the renderer foundation for "松语" chat: extend `shared/agent-types.ts` with the `Attachment` union and the optional `runAgent({ attachments })` signature, build `src/stores/chat.ts` (per-session state, streaming buffer, approval queue, attachments, status), wire it to the `chat.*` IPC stream channel, and replace the `/chat` placeholder route with a real `Chat.tsx` shell — three-pane flex layout with a top bar (title + profile chip + ? icon) and an empty-state with 4 prompt cards. **No SessionList / MessageList / ChatInput interactivity yet** — those are Plans 2–3. This plan unblocks every later plan in the phase.

## Architecture

- **`shared/agent-types.ts` is the contract.** Phase 16 created it with `AgentEvent`, `ToolCall`, role types, and a `runAgent` signature. This plan **extends** the file by adding the `Attachment` discriminated union (`{ type: 'file' } | { type: 'clip' }`) and adds `attachments?: Attachment[]` to `RunAgentArgs`. No breaking change — existing callers omit `attachments`.
- **`src/stores/chat.ts` is the renderer single source of truth** for everything chat-related. It is a Zustand store that holds: `sessions: ChatSession[]`, `activeSessionId: string | null`, and `bySession: Record<string, SessionState>`. `SessionState` includes `messages`, `streamingBuffer`, `flushedLength`, `pendingApprovals`, `pendingAttachments`, `status`, and `error`. Per-session state is keyed by id so that switching sessions doesn't lose buffers (acceptance 11.10 — A streams in background while user is on B).
- **One chat-stream subscription per app, dispatched to per-session state.** The store installs a single `window.api.on('chat:stream', handler)` subscription on first action; the handler routes events by `event.sessionId` to the right `bySession[id]` slot. This avoids leaking listeners across re-renders (an issue we hit with browser-port in earlier phases) and matches the pattern used by `installSettingsSubscriber()`.
- **`Chat.tsx` is a layout shell only in this plan.** It composes three vertical regions: left column (placeholder div sized 300px / collapsible to 48px below 960px), middle column (top bar + main area), right column (zero width by default; reserved for `ApprovalPanel` in Plan 3). Empty-state cards show only when the active session has zero messages — clicks fill a placeholder ChatInput slot but do not send.
- **Routing change is one line in `src/main.tsx`** — replace `<Placeholder name="chat" />` with `<Chat />`. No new route; phase 1 already reserved `/chat`.

## Tech Stack

- `zustand@^5` — state store (already a dep)
- `react-router-dom@^7` — `Outlet` / `useNavigate` (already a dep)
- `react-i18next@^17` — `useTranslation` for label keys (already a dep)
- `lucide-react` — icons (`MessagesSquare`, `Plus`, `HelpCircle`) (already a dep)
- `@testing-library/react`, `vitest`, `jsdom` — UI tests
- Tailwind v4 + shadcn/ui patterns matching the rest of the app

## Files Touched (this plan)

| Path                          | Action                                           | Owner task    |
| ----------------------------- | ------------------------------------------------ | ------------- |
| `shared/agent-types.ts`       | Modify (add `Attachment`, extend `RunAgentArgs`) | 1.1           |
| `shared/agent-types.test.ts`  | Modify (add type-test for `Attachment`)          | 1.1           |
| `src/stores/chat.ts`          | Create                                           | 1.2, 1.3, 1.4 |
| `src/stores/chat.test.ts`     | Create                                           | 1.2, 1.3, 1.4 |
| `src/pages/Chat.tsx`          | Create                                           | 2.1, 2.2, 2.4 |
| `src/pages/Chat.test.tsx`     | Create                                           | 2.1, 2.2, 2.4 |
| `src/main.tsx`                | Modify (route swap)                              | 2.3           |
| `src/i18n/locales/zh-CN.json` | Modify (add `chat.*` minimal keys for this plan) | 2.2, 2.4      |
| `src/i18n/locales/en-US.json` | Modify (parity)                                  | 2.2, 2.4      |

## Pre-flight

- **Phase 16 (Chat Agent + Tools) MUST be merged.** This plan assumes `shared/agent-types.ts` exports `AgentEvent`, `ToolCall`, `MessageRole`, `RunAgentArgs`, `ChatStreamEvent`; that the IPC contract has a `chat` namespace with `sessions.list / create / rename / delete`, `sendUserMessage`, `cancelStream`, `approveTool`, `rejectTool`, and an `onChatStream(sessionId, cb)` event subscriber; that `electron/agent/loop.ts` exports `runAgent`. If phase-16 has not landed, stop and complete it before starting this plan.
- **Phase 13 settings + AI profiles are merged.** This plan reads `useProfilesStore` (already in `src/stores/profiles.ts`) and the bootstrap payload's `defaultProfileId`.
- Confirm `src/main.tsx:40` still reads `{ path: 'chat', element: <Placeholder name="chat" /> }`. If the route already renders something else, reconcile before proceeding.
- Confirm `src/i18n/locales/zh-CN.json` already contains `nav.chat` (`"松语"`). It does — `AppRail` reads it.
- This plan does **not** modify `AppRail.tsx` (the entry is still `disabled: true` from phase 1). Plan 5 will flip the toggle as part of acceptance task 11.2 setup; until then, navigation to `/chat` happens via address bar / tests only.

---

## Tasks

<!-- openspec-task: 1.1 -->

### Task 1: Extend `shared/agent-types.ts` — `Attachment` union + `RunAgentArgs.attachments`

**Files:**

- Modify: `shared/agent-types.ts`
- Modify: `shared/agent-types.test.ts`

- [ ] **Step 1: Read current `shared/agent-types.ts`**

```bash
cat shared/agent-types.ts
```

Expected: file exists; exports include `AgentEvent`, `ToolCall`, `MessageRole`, `ChatMessage`, `RunAgentArgs`. Note the exact name and shape of `RunAgentArgs` — this task adds an optional field to it.

- [ ] **Step 2: Write a failing type-test for `Attachment`**

Append to `shared/agent-types.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { Attachment, RunAgentArgs } from './agent-types'

describe('Attachment', () => {
  it('accepts file shape', () => {
    const a: Attachment = { type: 'file', path: 'notes/a.md', title: 'A' }
    expectTypeOf(a).toEqualTypeOf<Attachment>()
  })

  it('accepts clip shape', () => {
    const a: Attachment = { type: 'clip', clipId: 12, url: 'https://x.com', title: 'X' }
    expectTypeOf(a).toEqualTypeOf<Attachment>()
  })

  it('rejects unknown type at compile time', () => {
    // @ts-expect-error unknown discriminator
    const a: Attachment = { type: 'web', url: 'https://x.com' }
    void a
  })

  it('RunAgentArgs accepts optional attachments', () => {
    const a: RunAgentArgs = {
      sessionId: 's1',
      userText: 'hi',
      attachments: [{ type: 'file', path: 'a.md', title: 'A' }]
    } as RunAgentArgs
    expectTypeOf(a.attachments).toEqualTypeOf<Attachment[] | undefined>()
  })

  it('RunAgentArgs without attachments still typechecks', () => {
    const a: RunAgentArgs = { sessionId: 's1', userText: 'hi' } as RunAgentArgs
    void a
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run shared/agent-types.test.ts
```

Expected: TypeScript errors — `Attachment` not exported, `attachments` not on `RunAgentArgs`.

- [ ] **Step 4: Add `Attachment` and extend `RunAgentArgs` in `shared/agent-types.ts`**

Add near the top (after existing type imports), before `RunAgentArgs`:

```ts
export type Attachment =
  | { type: 'file'; path: string; title: string }
  | { type: 'clip'; clipId: number; url: string; title: string }
```

Locate the existing `RunAgentArgs` type/interface and add `attachments?: Attachment[]`:

```ts
export interface RunAgentArgs {
  sessionId: string
  userText: string
  attachments?: Attachment[]
  // ...existing fields (streamWriter, cancel, etc.) preserved
}
```

If `RunAgentArgs` is a `type` alias (not interface) in phase-16, intersect it instead:

```ts
// e.g. if phase-16 wrote: export type RunAgentArgs = { ... }
// modify in place:
export type RunAgentArgs = {
  sessionId: string
  userText: string
  attachments?: Attachment[]
  // ...existing fields preserved
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run shared/agent-types.test.ts
```

Expected: PASS — all five `it` blocks green.

- [ ] **Step 6: Run typecheck across both project trees**

```bash
npm run typecheck
```

Expected: 0 errors. If `electron/agent/loop.ts` references `RunAgentArgs` and breaks because it didn't list `attachments`, that is fine as long as `attachments` is optional — TS won't complain. If it does fail, re-confirm the field is `?:` optional.

- [ ] **Step 7: Commit**

```bash
git add shared/agent-types.ts shared/agent-types.test.ts
git commit -m "feat(phase-17): add Attachment type and RunAgentArgs.attachments"
```

---

<!-- openspec-task: 1.2 -->

### Task 2: Create `src/stores/chat.ts` — per-session state shape + `loadSessions` / `selectSession`

**Files:**

- Create: `src/stores/chat.ts`
- Create: `src/stores/chat.test.ts`

- [ ] **Step 1: Write the failing store-shape test**

Create `src/stores/chat.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useChatStore } from './chat'

const mockApi = {
  chat: {
    sessions: {
      list: vi.fn().mockResolvedValue([
        { id: 's1', title: '会话 A', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's2', title: '会话 B', createdAt: 3, updatedAt: 4, profileId: 'p1' }
      ]),
      messages: vi.fn().mockResolvedValue([])
    },
    onChatStream: vi.fn(() => () => {})
  }
}

beforeEach(() => {
  // @ts-expect-error injected for test
  globalThis.window = globalThis.window ?? {}
  // @ts-expect-error
  globalThis.window.api = mockApi
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    bySession: {}
  })
  vi.clearAllMocks()
})

describe('chat store — sessions', () => {
  it('loadSessions populates sessions list and selects first by default', async () => {
    await useChatStore.getState().loadSessions()
    const s = useChatStore.getState()
    expect(s.sessions).toHaveLength(2)
    expect(s.activeSessionId).toBe('s1')
    expect(mockApi.chat.sessions.list).toHaveBeenCalledOnce()
  })

  it('selectSession switches activeSessionId and lazy-loads messages', async () => {
    mockApi.chat.sessions.messages.mockResolvedValueOnce([
      { id: 'm1', role: 'user', text: 'hi', createdAt: 5 }
    ])
    await useChatStore.getState().loadSessions()
    await useChatStore.getState().selectSession('s2')
    const s = useChatStore.getState()
    expect(s.activeSessionId).toBe('s2')
    expect(s.bySession.s2?.messages).toHaveLength(1)
    expect(s.bySession.s2?.messages[0].text).toBe('hi')
  })

  it('selectSession is idempotent — re-selecting same id does not refetch', async () => {
    await useChatStore.getState().loadSessions()
    await useChatStore.getState().selectSession('s1')
    await useChatStore.getState().selectSession('s1')
    expect(mockApi.chat.sessions.messages).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/stores/chat.test.ts
```

Expected: FAIL — `Cannot find module './chat'`.

- [ ] **Step 3: Create `src/stores/chat.ts` with minimal store**

```ts
// src/stores/chat.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { Attachment } from '@shared/agent-types'

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profileId: string | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  text: string
  toolCalls?: { id: string; name: string; args: unknown }[]
  toolCallId?: string
  attachments?: Attachment[]
  createdAt: number
  error?: string
}

export interface PendingApproval {
  callId: string
  toolName: string
  args: unknown
  reason: string
  receivedAt: number
}

export type SessionStatus = 'idle' | 'streaming' | 'awaiting-approval' | 'error'

export interface SessionState {
  loaded: boolean
  messages: ChatMessage[]
  streamingBuffer: string
  flushedLength: number
  pendingApprovals: PendingApproval[]
  pendingAttachments: Attachment[]
  status: SessionStatus
  error: string | null
}

interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  bySession: Record<string, SessionState>
  loadSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
}

const emptySession = (): SessionState => ({
  loaded: false,
  messages: [],
  streamingBuffer: '',
  flushedLength: 0,
  pendingApprovals: [],
  pendingAttachments: [],
  status: 'idle',
  error: null
})

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  bySession: {},

  async loadSessions() {
    const list = await ipc.chat.sessions.list()
    set((s) => ({
      sessions: list,
      activeSessionId: s.activeSessionId ?? list[0]?.id ?? null
    }))
  },

  async selectSession(id) {
    const cur = get()
    if (cur.activeSessionId === id && cur.bySession[id]?.loaded) {
      return
    }
    set({ activeSessionId: id })
    if (!cur.bySession[id]?.loaded) {
      const messages = await ipc.chat.sessions.messages(id)
      set((s) => ({
        bySession: {
          ...s.bySession,
          [id]: { ...emptySession(), ...s.bySession[id], messages, loaded: true }
        }
      }))
    }
  }
}))
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/stores/chat.test.ts
```

Expected: PASS — all three `it` blocks green. If `ipc.chat` types are missing, ensure phase-16 added the `chat` namespace to `IpcContract`. If unsure, cast in this plan: `(ipc as any).chat`. The store test uses an injected mock so it doesn't depend on the contract.

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts
git commit -m "feat(phase-17): chat store shape + loadSessions / selectSession"
```

---

<!-- openspec-task: 1.3 -->

### Task 3: Add CRUD + send / cancel / approval / profile actions to `src/stores/chat.ts`

**Files:**

- Modify: `src/stores/chat.ts`
- Modify: `src/stores/chat.test.ts`

- [ ] **Step 1: Write failing tests for CRUD + send + approval actions**

Append to `src/stores/chat.test.ts` (inside or after existing describe):

```ts
describe('chat store — actions', () => {
  beforeEach(async () => {
    Object.assign(mockApi.chat, {
      sessions: {
        list: vi
          .fn()
          .mockResolvedValue([
            { id: 's1', title: '会话 A', createdAt: 1, updatedAt: 2, profileId: null }
          ]),
        messages: vi.fn().mockResolvedValue([]),
        create: vi
          .fn()
          .mockResolvedValue({
            id: 'snew',
            title: '未命名对话',
            createdAt: 100,
            updatedAt: 100,
            profileId: null
          }),
        rename: vi.fn().mockResolvedValue({ ok: true }),
        delete: vi.fn().mockResolvedValue({ ok: true }),
        updateProfile: vi.fn().mockResolvedValue({ ok: true })
      },
      sendUserMessage: vi.fn().mockResolvedValue({ ok: true }),
      cancelStream: vi.fn().mockResolvedValue({ ok: true }),
      approveTool: vi.fn().mockResolvedValue({ ok: true }),
      rejectTool: vi.fn().mockResolvedValue({ ok: true })
    })
    await useChatStore.getState().loadSessions()
  })

  it('createSession appends + activates', async () => {
    await useChatStore.getState().createSession()
    const s = useChatStore.getState()
    expect(s.sessions[0].id).toBe('snew')
    expect(s.activeSessionId).toBe('snew')
  })

  it('renameSession updates title locally', async () => {
    await useChatStore.getState().renameSession('s1', '旅行计划')
    const s = useChatStore.getState()
    expect(s.sessions.find((x) => x.id === 's1')?.title).toBe('旅行计划')
    expect(mockApi.chat.sessions.rename).toHaveBeenCalledWith('s1', '旅行计划')
  })

  it('deleteSession removes from list and re-selects', async () => {
    await useChatStore.getState().createSession()
    await useChatStore.getState().deleteSession('s1')
    const s = useChatStore.getState()
    expect(s.sessions.find((x) => x.id === 's1')).toBeUndefined()
    expect(s.activeSessionId).toBe('snew')
  })

  it('sendUserMessage rejects when session is streaming (E_BUSY)', async () => {
    useChatStore.setState((cur) => ({
      bySession: {
        ...cur.bySession,
        s1: {
          ...(cur.bySession.s1 ?? {}),
          loaded: true,
          messages: [],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          status: 'streaming',
          error: null
        }
      }
    }))
    await expect(useChatStore.getState().sendUserMessage({ text: 'hi' })).rejects.toMatchObject({
      code: 'E_BUSY'
    })
    expect(mockApi.chat.sendUserMessage).not.toHaveBeenCalled()
  })

  it('approveTool calls IPC with editedArgs when provided', async () => {
    await useChatStore.getState().approveTool('s1', 'call_1', { foo: 1 })
    expect(mockApi.chat.approveTool).toHaveBeenCalledWith({
      sessionId: 's1',
      callId: 'call_1',
      editedArgs: { foo: 1 }
    })
  })

  it('updateSessionProfile patches sessions and calls IPC', async () => {
    await useChatStore.getState().updateSessionProfile('s1', 'p2')
    expect(mockApi.chat.sessions.updateProfile).toHaveBeenCalledWith('s1', 'p2')
    expect(useChatStore.getState().sessions.find((x) => x.id === 's1')?.profileId).toBe('p2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/stores/chat.test.ts
```

Expected: FAIL — `createSession is not a function`, etc.

- [ ] **Step 3: Implement the actions in `src/stores/chat.ts`**

Replace the `ChatStore` interface and store body, keeping `loadSessions` / `selectSession` from Task 2:

```ts
interface ChatStore {
  sessions: ChatSession[]
  activeSessionId: string | null
  bySession: Record<string, SessionState>
  loadSessions: () => Promise<void>
  selectSession: (id: string) => Promise<void>
  createSession: () => Promise<string>
  renameSession: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  sendUserMessage: (args: { text: string; attachments?: Attachment[] }) => Promise<void>
  cancelStream: () => Promise<void>
  approveTool: (sessionId: string, callId: string, editedArgs?: unknown) => Promise<void>
  rejectTool: (sessionId: string, callId: string) => Promise<void>
  updateSessionProfile: (id: string, profileId: string | null) => Promise<void>
  pushAttachment: (att: Attachment) => void
  removeAttachment: (index: number) => void
}

class BusyError extends Error {
  code = 'E_BUSY' as const
  constructor() {
    super('session is streaming')
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  bySession: {},

  async loadSessions() {
    const list = await ipc.chat.sessions.list()
    set((s) => ({
      sessions: list,
      activeSessionId: s.activeSessionId ?? list[0]?.id ?? null
    }))
  },

  async selectSession(id) {
    const cur = get()
    if (cur.activeSessionId === id && cur.bySession[id]?.loaded) return
    set({ activeSessionId: id })
    if (!cur.bySession[id]?.loaded) {
      const messages = await ipc.chat.sessions.messages(id)
      set((s) => ({
        bySession: {
          ...s.bySession,
          [id]: { ...emptySession(), ...s.bySession[id], messages, loaded: true }
        }
      }))
    }
  },

  async createSession() {
    const created = await ipc.chat.sessions.create()
    set((s) => ({
      sessions: [created, ...s.sessions],
      activeSessionId: created.id,
      bySession: { ...s.bySession, [created.id]: { ...emptySession(), loaded: true } }
    }))
    return created.id
  },

  async renameSession(id, title) {
    await ipc.chat.sessions.rename(id, title)
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x))
    }))
  },

  async deleteSession(id) {
    await ipc.chat.sessions.delete(id)
    set((s) => {
      const remaining = s.sessions.filter((x) => x.id !== id)
      const nextActive = s.activeSessionId === id ? (remaining[0]?.id ?? null) : s.activeSessionId
      const { [id]: _, ...rest } = s.bySession
      return { sessions: remaining, activeSessionId: nextActive, bySession: rest }
    })
  },

  async sendUserMessage({ text, attachments }) {
    const sid = get().activeSessionId
    if (!sid) throw new Error('no active session')
    const slot = get().bySession[sid]
    if (slot?.status === 'streaming') throw new BusyError()
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...(s.bySession[sid] ?? emptySession()),
          status: 'streaming',
          error: null,
          streamingBuffer: '',
          flushedLength: 0,
          pendingAttachments: []
        }
      }
    }))
    await ipc.chat.sendUserMessage({ sessionId: sid, text, attachments: attachments ?? [] })
  },

  async cancelStream() {
    const sid = get().activeSessionId
    if (!sid) return
    await ipc.chat.cancelStream({ sessionId: sid })
  },

  async approveTool(sessionId, callId, editedArgs) {
    await ipc.chat.approveTool({ sessionId, callId, editedArgs })
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: {
          ...(s.bySession[sessionId] ?? emptySession()),
          pendingApprovals: (s.bySession[sessionId]?.pendingApprovals ?? []).filter(
            (a) => a.callId !== callId
          )
        }
      }
    }))
  },

  async rejectTool(sessionId, callId) {
    await ipc.chat.rejectTool({ sessionId, callId })
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sessionId]: {
          ...(s.bySession[sessionId] ?? emptySession()),
          pendingApprovals: (s.bySession[sessionId]?.pendingApprovals ?? []).filter(
            (a) => a.callId !== callId
          )
        }
      }
    }))
  },

  async updateSessionProfile(id, profileId) {
    await ipc.chat.sessions.updateProfile(id, profileId)
    set((s) => ({
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, profileId } : x))
    }))
  },

  pushAttachment(att) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => ({
      bySession: {
        ...s.bySession,
        [sid]: {
          ...(s.bySession[sid] ?? emptySession()),
          pendingAttachments: [...(s.bySession[sid]?.pendingAttachments ?? []), att]
        }
      }
    }))
  },

  removeAttachment(index) {
    const sid = get().activeSessionId
    if (!sid) return
    set((s) => {
      const cur = s.bySession[sid]?.pendingAttachments ?? []
      return {
        bySession: {
          ...s.bySession,
          [sid]: {
            ...(s.bySession[sid] ?? emptySession()),
            pendingAttachments: cur.filter((_, i) => i !== index)
          }
        }
      }
    })
  }
}))
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/stores/chat.test.ts
```

Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts
git commit -m "feat(phase-17): chat store CRUD + send/cancel/approval/profile actions"
```

---

<!-- openspec-task: 1.4 -->

### Task 4: Subscribe to `chat:stream` events — dispatch to per-session state

**Files:**

- Modify: `src/stores/chat.ts`
- Modify: `src/stores/chat.test.ts`

- [ ] **Step 1: Write failing tests for stream-event dispatch**

Append to `src/stores/chat.test.ts`:

```ts
import { installChatStreamSubscriber } from './chat'

describe('chat stream subscriber', () => {
  let handler: ((evt: any) => void) | null = null

  beforeEach(async () => {
    handler = null
    mockApi.chat.onChatStream = vi.fn((cb: (evt: any) => void) => {
      handler = cb
      return () => {
        handler = null
      }
    })
    await useChatStore.getState().loadSessions()
    installChatStreamSubscriber()
  })

  it('appends streaming token to buffer for the matching session', () => {
    handler!({ sessionId: 's1', type: 'token', text: '你' })
    handler!({ sessionId: 's1', type: 'token', text: '好' })
    expect(useChatStore.getState().bySession.s1.streamingBuffer).toBe('你好')
  })

  it('does not leak token into other session buffer', () => {
    handler!({ sessionId: 's2', type: 'token', text: 'X' })
    expect(useChatStore.getState().bySession.s1?.streamingBuffer ?? '').toBe('')
  })

  it('on done event commits message and resets buffer + status', () => {
    handler!({ sessionId: 's1', type: 'token', text: 'hello' })
    handler!({
      sessionId: 's1',
      type: 'done',
      message: { id: 'm1', role: 'assistant', text: 'hello', createdAt: 99 }
    })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.streamingBuffer).toBe('')
    expect(slot.flushedLength).toBe(0)
    expect(slot.status).toBe('idle')
    expect(slot.messages.find((m) => m.id === 'm1')).toBeTruthy()
  })

  it('approval-needed pushes onto queue and sets status', () => {
    handler!({
      sessionId: 's1',
      type: 'tool.approval-needed',
      callId: 'c1',
      toolName: 'update_frontmatter',
      args: { file: 'a.md' },
      reason: '需要批准'
    })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.pendingApprovals).toHaveLength(1)
    expect(slot.pendingApprovals[0].callId).toBe('c1')
    expect(slot.status).toBe('awaiting-approval')
  })

  it('error event sets status to error and stores message', () => {
    handler!({ sessionId: 's1', type: 'error', error: 'E_NETWORK', message: '网络错误' })
    const slot = useChatStore.getState().bySession.s1
    expect(slot.status).toBe('error')
    expect(slot.error).toBe('E_NETWORK')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/stores/chat.test.ts -t "chat stream subscriber"
```

Expected: FAIL — `installChatStreamSubscriber` is not exported.

- [ ] **Step 3: Implement `installChatStreamSubscriber` in `src/stores/chat.ts`**

Append to `src/stores/chat.ts`:

```ts
type StreamEvent =
  | { sessionId: string; type: 'token'; text: string }
  | { sessionId: string; type: 'done'; message: ChatMessage }
  | { sessionId: string; type: 'tool.call'; message: ChatMessage }
  | { sessionId: string; type: 'tool.result'; message: ChatMessage }
  | {
      sessionId: string
      type: 'tool.approval-needed'
      callId: string
      toolName: string
      args: unknown
      reason: string
    }
  | { sessionId: string; type: 'error'; error: string; message?: string }

let unsubscribe: (() => void) | null = null

export function installChatStreamSubscriber(): void {
  if (unsubscribe) unsubscribe()
  unsubscribe = ipc.chat.onChatStream((evt: StreamEvent) => {
    const sid = evt.sessionId
    useChatStore.setState((s) => {
      const cur = s.bySession[sid] ?? emptySession()
      switch (evt.type) {
        case 'token':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                streamingBuffer: cur.streamingBuffer + evt.text,
                status: 'streaming'
              }
            }
          }
        case 'done':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                streamingBuffer: '',
                flushedLength: 0,
                status: cur.pendingApprovals.length > 0 ? 'awaiting-approval' : 'idle',
                messages: [...cur.messages, evt.message]
              }
            }
          }
        case 'tool.call':
        case 'tool.result':
          return {
            bySession: {
              ...s.bySession,
              [sid]: { ...cur, messages: [...cur.messages, evt.message] }
            }
          }
        case 'tool.approval-needed':
          return {
            bySession: {
              ...s.bySession,
              [sid]: {
                ...cur,
                status: 'awaiting-approval',
                pendingApprovals: [
                  ...cur.pendingApprovals,
                  {
                    callId: evt.callId,
                    toolName: evt.toolName,
                    args: evt.args,
                    reason: evt.reason,
                    receivedAt: Date.now()
                  }
                ]
              }
            }
          }
        case 'error':
          return {
            bySession: {
              ...s.bySession,
              [sid]: { ...cur, status: 'error', error: evt.error }
            }
          }
        default:
          return s
      }
    })
  })
}

export function uninstallChatStreamSubscriber(): void {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/stores/chat.test.ts
```

Expected: PASS — all five new `it` blocks green; previous tests still green.

- [ ] **Step 5: Wire `installChatStreamSubscriber()` into `src/main.tsx` boot**

Modify `src/main.tsx` — add to the boot section near `installSettingsSubscriber()`:

```ts
import { installChatStreamSubscriber } from '@/stores/chat'
// ...
installSettingsEffects()
installGroveSubscriber()
installSettingsSubscriber()
installChatStreamSubscriber()
setBrowserPort(browserPort)
setBrowserEventPort(browserEventPort)
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts src/main.tsx
git commit -m "feat(phase-17): chat:stream subscriber dispatches events to per-session state"
```

---

<!-- openspec-task: 2.1 -->

### Task 5: Create `src/pages/Chat.tsx` — three-pane flex layout + window-width auto-collapse

**Files:**

- Create: `src/pages/Chat.tsx`
- Create: `src/pages/Chat.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json` (add `chat.untitled`, `chat.newSession`)
- Modify: `src/i18n/locales/en-US.json` (parity)

- [ ] **Step 1: Write the failing layout test**

Create `src/pages/Chat.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { Chat } from './Chat'
import { useChatStore } from '@/stores/chat'

const mockApi = {
  chat: {
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      messages: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockResolvedValue({
          id: 's1',
          title: '未命名对话',
          createdAt: 1,
          updatedAt: 1,
          profileId: null
        })
    },
    onChatStream: vi.fn(() => () => {})
  }
}

describe('Chat page', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })

  beforeEach(() => {
    // @ts-expect-error
    globalThis.window.api = mockApi
    useChatStore.setState({ sessions: [], activeSessionId: null, bySession: {} })
    vi.clearAllMocks()
  })

  afterEach(() => cleanup())

  it('renders three regions: session-list, main, approval', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('chat-session-list')).toBeTruthy()
    expect(screen.getByTestId('chat-main')).toBeTruthy()
    expect(screen.getByTestId('chat-approval')).toBeTruthy()
  })

  it('auto-creates a session if list is empty', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    expect(mockApi.chat.sessions.create).toHaveBeenCalledOnce()
  })

  it('session-list collapses below 960px (icon-only)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const left = await screen.findByTestId('chat-session-list')
    expect(left.getAttribute('data-collapsed')).toBe('true')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/pages/Chat.test.tsx
```

Expected: FAIL — `Cannot find module './Chat'`.

- [ ] **Step 3: Add minimal `chat.untitled` and `chat.newSession` keys**

Open `src/i18n/locales/zh-CN.json`. Add a top-level `"chat": { ... }` block (place after `"nav": { ... }` block):

```json
  "chat": {
    "untitled": "未命名对话",
    "newSession": "新对话",
    "topbar": {
      "helpAria": "快捷键帮助"
    }
  },
```

Open `src/i18n/locales/en-US.json` and add the parity entries:

```json
  "chat": {
    "untitled": "Untitled chat",
    "newSession": "New chat",
    "topbar": {
      "helpAria": "Keyboard shortcuts help"
    }
  },
```

- [ ] **Step 4: Create `src/pages/Chat.tsx` with three-pane shell**

```tsx
// src/pages/Chat.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle } from 'lucide-react'
import { useChatStore } from '@/stores/chat'

export function Chat(): JSX.Element {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeId = useChatStore((s) => s.activeSessionId)
  const loadSessions = useChatStore((s) => s.loadSessions)
  const createSession = useChatStore((s) => s.createSession)

  const [collapsed, setCollapsed] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 960 : false
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await loadSessions()
      if (cancelled) return
      const after = useChatStore.getState()
      if (after.sessions.length === 0) {
        await createSession()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadSessions, createSession])

  useEffect(() => {
    function onResize(): void {
      setCollapsed(window.innerWidth < 960)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const activeSession = sessions.find((s) => s.id === activeId) ?? null

  return (
    <div className="flex h-full">
      <aside
        data-testid="chat-session-list"
        data-collapsed={collapsed ? 'true' : 'false'}
        style={{ width: collapsed ? 48 : 300 }}
        className="shrink-0 border-r border-border bg-muted/20 transition-[width] duration-150"
      >
        {/* SessionList placeholder — Plan 2 fills this in */}
      </aside>
      <main data-testid="chat-main" className="flex flex-1 min-w-0 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <h1 className="truncate text-sm font-medium">
            {activeSession?.title ?? t('chat.untitled')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={t('chat.topbar.helpAria')}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
            >
              <HelpCircle size={16} />
            </button>
          </div>
        </header>
        <section className="flex flex-1 min-h-0 flex-col">
          {/* MessageList + ChatInput placeholders — Plans 2 and 3 */}
        </section>
      </main>
      <aside
        data-testid="chat-approval"
        style={{ width: 0 }}
        className="shrink-0 overflow-hidden border-l border-border bg-muted/20 transition-[width] duration-200"
      >
        {/* ApprovalPanel placeholder — Plan 3 */}
      </aside>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/pages/Chat.test.tsx
```

Expected: PASS — all three `it` blocks green.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Chat.tsx src/pages/Chat.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): Chat page three-pane shell + width-based collapse"
```

---

<!-- openspec-task: 2.2 -->

### Task 6: Top bar — session title + profile chip dropdown + ? icon

**Files:**

- Modify: `src/pages/Chat.tsx`
- Modify: `src/pages/Chat.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`

- [ ] **Step 1: Write failing tests for the profile chip**

Append to `src/pages/Chat.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event'
import { useProfilesStore } from '@/stores/profiles'

describe('Chat top bar — profile chip', () => {
  beforeEach(() => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'OpenAI',
          provider: 'openai',
          model: 'gpt-4o',
          baseUrl: null,
          secretRef: null,
          default: true
        },
        {
          id: 'p2',
          name: 'Local',
          provider: 'ollama',
          model: 'llama3.1',
          baseUrl: 'http://localhost:11434',
          secretRef: null,
          default: false
        }
      ]
    } as any)
    mockApi.chat.sessions.list = vi
      .fn()
      .mockResolvedValue([
        { id: 's1', title: '会话 A', createdAt: 1, updatedAt: 2, profileId: 'p1' }
      ])
    mockApi.chat.sessions.updateProfile = vi.fn().mockResolvedValue({ ok: true })
  })

  it('renders profile name + model', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    expect(await screen.findByText(/OpenAI/)).toBeTruthy()
    expect(screen.getByText(/gpt-4o/)).toBeTruthy()
  })

  it('clicking profile chip opens dropdown listing alternatives', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const chip = await screen.findByTestId('chat-profile-chip')
    await userEvent.click(chip)
    expect(screen.getByText(/Local/)).toBeTruthy()
  })

  it('selecting alt profile calls updateSessionProfile', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const chip = await screen.findByTestId('chat-profile-chip')
    await userEvent.click(chip)
    await userEvent.click(screen.getByRole('menuitem', { name: /Local/ }))
    expect(mockApi.chat.sessions.updateProfile).toHaveBeenCalledWith('s1', 'p2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/pages/Chat.test.tsx -t "profile chip"
```

Expected: FAIL — `chat-profile-chip` testid not found.

- [ ] **Step 3: Add additional `chat.topbar` keys**

Open `src/i18n/locales/zh-CN.json`, extend `chat.topbar`:

```json
  "chat": {
    "untitled": "未命名对话",
    "newSession": "新对话",
    "topbar": {
      "helpAria": "快捷键帮助",
      "noProfile": "未配置 AI",
      "switchProfile": "切换 AI",
      "modelSeparator": "·"
    }
  },
```

Open `src/i18n/locales/en-US.json`, extend `chat.topbar`:

```json
  "chat": {
    "untitled": "Untitled chat",
    "newSession": "New chat",
    "topbar": {
      "helpAria": "Keyboard shortcuts help",
      "noProfile": "No AI configured",
      "switchProfile": "Switch AI",
      "modelSeparator": "·"
    }
  },
```

- [ ] **Step 4: Add `ProfileChip` to `Chat.tsx`**

Insert into `src/pages/Chat.tsx` (above the `Chat` component):

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useProfilesStore } from '@/stores/profiles'

interface ProfileChipProps {
  sessionId: string
  profileId: string | null
}

function ProfileChip({ sessionId, profileId }: ProfileChipProps): JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const refresh = useProfilesStore((s) => s.refresh)
  const updateSessionProfile = useChatStore((s) => s.updateSessionProfile)
  const current = profiles.find((p) => p.id === profileId) ?? null

  useEffect(() => {
    if (profiles.length === 0) void refresh()
  }, [profiles.length, refresh])

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="chat-profile-chip"
        className="rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
      >
        {current ? (
          <span>
            {current.name}{' '}
            <span className="text-muted-foreground">
              {t('chat.topbar.modelSeparator')} {current.model}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">{t('chat.topbar.noProfile')}</span>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 text-sm shadow">
          <DropdownMenu.Label className="px-2 py-1 text-xs text-muted-foreground">
            {t('chat.topbar.switchProfile')}
          </DropdownMenu.Label>
          {profiles.map((p) => (
            <DropdownMenu.Item
              key={p.id}
              role="menuitem"
              onSelect={() => void updateSessionProfile(sessionId, p.id)}
              className="cursor-pointer rounded px-2 py-1 hover:bg-muted"
            >
              {p.name} <span className="text-muted-foreground">· {p.model}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

- [ ] **Step 5: Render `ProfileChip` in the top bar of `Chat.tsx`**

Replace the `<header>` block:

```tsx
<header className="flex h-12 items-center justify-between border-b border-border px-4">
  <h1 className="truncate text-sm font-medium">{activeSession?.title ?? t('chat.untitled')}</h1>
  <div className="flex items-center gap-3">
    {activeSession && (
      <ProfileChip sessionId={activeSession.id} profileId={activeSession.profileId} />
    )}
    <button
      type="button"
      aria-label={t('chat.topbar.helpAria')}
      className="rounded p-1 text-muted-foreground hover:bg-muted"
    >
      <HelpCircle size={16} />
    </button>
  </div>
</header>
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/pages/Chat.test.tsx
```

Expected: PASS — all profile chip tests green; existing layout tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Chat.tsx src/pages/Chat.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): Chat top bar profile chip + dropdown to switch"
```

---

<!-- openspec-task: 2.3 -->

### Task 7: Activate `/chat` route — swap Placeholder for `Chat`

**Files:**

- Modify: `src/main.tsx`

- [ ] **Step 1: Read current router config**

```bash
grep -n "chat" src/main.tsx
```

Expected: line `{ path: 'chat', element: <Placeholder name="chat" /> },`.

- [ ] **Step 2: Replace the route**

Modify `src/main.tsx`:

- Add import: `import { Chat } from './pages/Chat'`
- Replace the route line:

```tsx
{ path: 'chat', element: <Chat /> },
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Run all tests to verify nothing broke**

```bash
npm run test -- src/pages/Chat.test.tsx src/components/AppRail.test.tsx src/stores/chat.test.ts
```

Expected: PASS in all three suites.

- [ ] **Step 5: Smoke-test in dev**

```bash
npm run dev
```

In the running app, manually:

- type `chat` into the dev tools URL bar (or click `松语` in AppRail — note: the entry is still `disabled` until Plan 5; you can navigate by editing the URL or by `useNavigate` in dev tools console)
- verify the three-pane layout renders, top bar shows the title + profile chip, and an empty session is auto-created

If unable to navigate via UI, this manual step can be skipped — the `Chat.test.tsx` covers the rendering. Stop the dev server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx
git commit -m "feat(phase-17): activate /chat route — replace Placeholder with Chat"
```

---

<!-- openspec-task: 2.4 -->

### Task 8: Empty-state — 4 prompt cards visible only when session has no messages

**Files:**

- Modify: `src/pages/Chat.tsx`
- Modify: `src/pages/Chat.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`

- [ ] **Step 1: Write the failing empty-state test**

Append to `src/pages/Chat.test.tsx`:

```tsx
describe('Chat empty-state', () => {
  beforeEach(() => {
    mockApi.chat.sessions.list = vi
      .fn()
      .mockResolvedValue([
        { id: 's1', title: '会话 A', createdAt: 1, updatedAt: 2, profileId: null }
      ])
    mockApi.chat.sessions.messages = vi.fn().mockResolvedValue([])
  })

  it('renders 4 onboarding prompt cards when active session has no messages', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const cards = await screen.findAllByTestId('chat-empty-card')
    expect(cards).toHaveLength(4)
  })

  it('clicking a card sets pendingPromptText (does not auto-send)', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    const cards = await screen.findAllByTestId('chat-empty-card')
    await userEvent.click(cards[0])
    const text = useChatStore.getState().bySession.s1?.pendingPromptText ?? ''
    expect(text.length).toBeGreaterThan(0)
  })

  it('hides empty-state once session has messages', async () => {
    mockApi.chat.sessions.messages = vi
      .fn()
      .mockResolvedValue([{ id: 'm1', role: 'user', text: 'hi', createdAt: 5 }])
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    expect(screen.queryAllByTestId('chat-empty-card')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/pages/Chat.test.tsx -t "empty-state"
```

Expected: FAIL — testid `chat-empty-card` missing; `pendingPromptText` not on session state.

- [ ] **Step 3: Extend `SessionState` with `pendingPromptText`**

Modify `src/stores/chat.ts`:

In `interface SessionState` add:

```ts
pendingPromptText: string
```

In `emptySession()` add:

```ts
pendingPromptText: '',
```

In `ChatStore` interface add:

```ts
setPendingPromptText: (text: string) => void;
```

In the store implementation add:

```ts
setPendingPromptText(text) {
  const sid = get().activeSessionId;
  if (!sid) return;
  set((s) => ({
    bySession: {
      ...s.bySession,
      [sid]: { ...(s.bySession[sid] ?? emptySession()), pendingPromptText: text }
    }
  }));
}
```

- [ ] **Step 4: Add the i18n keys for empty-state cards**

Open `src/i18n/locales/zh-CN.json`. Extend `chat`:

```json
  "chat": {
    "untitled": "未命名对话",
    "newSession": "新对话",
    "topbar": {
      "helpAria": "快捷键帮助",
      "noProfile": "未配置 AI",
      "switchProfile": "切换 AI",
      "modelSeparator": "·"
    },
    "empty": {
      "heading": "今天想聊点什么？",
      "subheading": "试试这些常用想法",
      "card1": "帮我在笔记里找关于注意力机制的内容",
      "card2": "总结最近 10 篇剪藏",
      "card3": "把 a.md 的 tags 改成 [\"读书\", \"散文\"]",
      "card4": "列出 tags 出现频率前 10"
    }
  },
```

Open `src/i18n/locales/en-US.json`. Extend `chat`:

```json
  "chat": {
    "untitled": "Untitled chat",
    "newSession": "New chat",
    "topbar": {
      "helpAria": "Keyboard shortcuts help",
      "noProfile": "No AI configured",
      "switchProfile": "Switch AI",
      "modelSeparator": "·"
    },
    "empty": {
      "heading": "What's on your mind?",
      "subheading": "Try one of these",
      "card1": "Find notes about attention mechanism",
      "card2": "Summarize the last 10 clips",
      "card3": "Set a.md tags to [\"reading\", \"essay\"]",
      "card4": "Top 10 most frequent tags"
    }
  },
```

- [ ] **Step 5: Add `EmptyState` component to `Chat.tsx`**

Add above `Chat`:

```tsx
function EmptyState(): JSX.Element {
  const { t } = useTranslation()
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const cards = [
    t('chat.empty.card1'),
    t('chat.empty.card2'),
    t('chat.empty.card3'),
    t('chat.empty.card4')
  ]
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <div className="text-center">
        <h2 className="serif text-xl font-semibold">{t('chat.empty.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('chat.empty.subheading')}</p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
        {cards.map((label) => (
          <button
            key={label}
            type="button"
            data-testid="chat-empty-card"
            onClick={() => setPendingPromptText(label)}
            className="rounded-md border border-border bg-background p-3 text-left text-sm transition-colors hover:bg-muted"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Render empty-state conditionally inside `<section>`**

In `Chat.tsx` replace the placeholder `<section>...</section>` with:

```tsx
<section className="flex flex-1 min-h-0 flex-col">
  {(() => {
    const slot = activeSession ? useChatStore.getState().bySession[activeSession.id] : null
    const isEmpty = !slot || slot.messages.length === 0
    return isEmpty ? <EmptyState /> : null
  })()}
</section>
```

Note: this reads via `getState()` to avoid an additional subscription in this minimal shell. Plan 2 will replace this region with `MessageList` which subscribes properly.

- [ ] **Step 7: Run all Chat-related tests**

```bash
npx vitest run src/pages/Chat.test.tsx src/stores/chat.test.ts
```

Expected: PASS — all suites green.

- [ ] **Step 8: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Chat.tsx src/pages/Chat.test.tsx src/stores/chat.ts src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): empty-state with 4 onboarding prompt cards"
```

---

## Plan 1 verification

After all 8 tasks complete:

- [ ] **Run the full test suite**: `npm run test`
- [ ] **Typecheck both trees**: `npm run typecheck`
- [ ] **Lint**: `npm run lint`
- [ ] Manual smoke: `npm run dev`, navigate to `/chat`, confirm three-pane shell + auto-created session + 4 empty cards + profile chip dropdown.

If any check fails, fix before declaring Plan 1 complete. The next plan (Plan 2 — SessionList + MessageList) starts on top of this foundation.
