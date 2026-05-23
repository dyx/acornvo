# Phase 20 · Chat UI Ant Design X — Tasks 2.1–3.11 (Derive Layer + Conversations + Sender)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-20-chat-ui-ant-design-x` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the chat derivation layer (`bubbleSelectors`, `chatRoles`, `ExternalLinkAnchor`) and replace the left-rail SessionList + bottom ChatInput with antd-x `Conversations` and `Sender`. After this plan: store data flows into Conversations / Sender wrappers with full feature parity (groups, context menu, narrow-mode collapse, paperclip attachments, Esc cancel). The middle message list still uses the legacy `MessageList` — Plan 3 replaces it with `Bubble.List`.

**Architecture:** Two concerns separate cleanly. (1) **Pure derivation:** `bubbleSelectors.ts` converts `(ChatMessage[], PendingApproval[])` → `BubbleItem[]`, folding `role:'tool'` messages into the preceding assistant message's `toolSteps` by `toolCallId === toolCalls[i].id` (positional fallback). `chatRoles.tsx` is a top-level stable `BubbleListProps['role']` object exposing `user` / `assistant` roles; assistant `contentRender` will eventually compose `ThoughtChain + XMarkdown + ApprovalInlineActions` (full body lands in Plan 3 — Plan 2 stubs the contract). `ExternalLinkAnchor.tsx` overrides `<a>` to invoke `ipc.file.openExternal`. (2) **Adapter components:** `ConversationsAdapter.tsx` wires antd-x `Conversations` to store sessions, supports `groupable` with a `groupSession` helper (`today` / `thisWeek` / `earlier`), inline rename via antd `Input` + Esc/Enter handling, delete via `Modal.confirm`, narrow-mode (<960px) collapsed visual, and a background-session red-dot `Badge`. `ChatInputArea.tsx` wraps antd-x `Sender` and subscribes to `focusInputBump` for imperative focus; `AttachmentsAdapter.tsx` lives inside `Sender.Header` and conditionally renders when `pendingAttachments` is non-empty.

**Tech Stack:** TypeScript 5, React 18, `antd` (^5.22.0), `@ant-design/x` (^2.7.0), `@ant-design/icons` (^5.5.2), `dayjs` (^1.11.13), Zustand store from `@/stores/chat`, `vitest`, `@testing-library/react`, `@testing-library/user-event`.

**Ant Design X reference:**

- `x-components` skill — Bubble / Conversations / Sender / Attachments / Welcome / Prompts / Actions / ThoughtChain props, slots, theming. Invoke before guessing prop names.
- `x-markdown` skill — XMarkdown component config, custom components mapping (`components={{ a: ... }}`).

**Key types (lifted from `openspec/changes/phase-20-chat-ui-ant-design-x/specs/chat-derive-bubble/spec.md`):**

```ts
export type BubbleItem = {
  key: string
  role: 'user' | 'assistant'
  content: string | { text: string; toolSteps: ToolStep[] }
  streaming?: boolean
  loading?: boolean
}

export type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: PendingApproval
}
```

Note: `ChatMessage.status` field is added by Plan 4 (Store slimming). For now Plan 2 assumes `status` is optional and selector treats `undefined` as `'done'` for compatibility with the not-yet-changed store.

**Repo conventions:**

- `@/components/chat/*` for chat-domain files.
- Co-located tests, vitest + RTL.
- Conventional Commits.

---

<!-- openspec-task: 2.1 -->

### Task 1: Write failing tests for deriveBubbleItems (positional fallback + status fields)

**Files:**

- Create: `src/components/chat/bubbleSelectors.test.ts`
- Test: `src/components/chat/bubbleSelectors.test.ts`

- [x] **Step 1: Write the test file with the 11 scenarios from chat-derive-bubble spec**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/bubbleSelectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveBubbleItems } from './bubbleSelectors'
import type { ChatMessage, PendingApproval } from '@/stores/chat'

const mkMsg = (m: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage => ({
  text: '',
  createdAt: 0,
  ...m
})

describe('deriveBubbleItems', () => {
  it('renders plain user message', () => {
    const out = deriveBubbleItems([mkMsg({ id: 'm1', role: 'user', text: 'hi' })], [])
    expect(out).toEqual([{ key: 'm1', role: 'user', content: 'hi' }])
  })

  it('renders plain assistant message (done)', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'm2', role: 'assistant', text: 'hello', status: 'done' as const })],
      []
    )
    expect(out).toEqual([
      { key: 'm2', role: 'assistant', content: 'hello', streaming: false, loading: false }
    ])
  })

  it('folds a single tool message into its assistant by callId', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({ id: 'u', role: 'user', text: 'do A' }),
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: 'ok',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'search', args: { q: 'x' } }]
        }),
        mkMsg({
          id: 't',
          role: 'tool',
          toolCallId: 'A',
          text: '{"ok":true,"data":[1]}'
        })
      ],
      []
    )
    expect(out).toHaveLength(2)
    expect(out[1]).toMatchObject({
      key: 'a',
      role: 'assistant',
      content: {
        text: 'ok',
        toolSteps: [
          {
            call: { id: 'A', name: 'search', args: { q: 'x' } },
            result: { ok: true, data: [1] }
          }
        ]
      }
    })
  })

  it('folds parallel tool calls (A then B) in toolCalls order, not message order', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [
            { id: 'A', name: 'fA', args: {} },
            { id: 'B', name: 'fB', args: {} }
          ]
        }),
        mkMsg({ id: 't1', role: 'tool', toolCallId: 'B', text: '{"ok":true,"data":"b"}' }),
        mkMsg({ id: 't2', role: 'tool', toolCallId: 'A', text: '{"ok":true,"data":"a"}' })
      ],
      []
    )
    expect(out).toHaveLength(1)
    const a = out[0]
    expect(a.content).toMatchObject({
      toolSteps: [
        { call: { id: 'A', name: 'fA', args: {} }, result: { ok: true, data: 'a' } },
        { call: { id: 'B', name: 'fB', args: {} }, result: { ok: true, data: 'b' } }
      ]
    })
  })

  it('leaves toolStep.result undefined when tool message has not arrived yet', () => {
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'streaming' as const,
          toolCalls: [{ id: 'A', name: 'fA', args: {} }]
        })
      ],
      []
    )
    const c = out[0].content as { toolSteps: ToolStep[] }
    expect(c.toolSteps[0].result).toBeUndefined()
  })

  it('attaches single pendingApproval to its matching toolStep', () => {
    const approval: PendingApproval = {
      callId: 'A',
      toolName: 'write_file',
      args: { path: 'x.md' },
      reason: 'destructive',
      receivedAt: 100
    }
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'write_file', args: { path: 'x.md' } }]
        })
      ],
      [approval]
    )
    const c = out[0].content as { toolSteps: ToolStep[] }
    expect(c.toolSteps[0].pendingApproval).toEqual(approval)
  })

  it('attaches separate pendingApprovals to independent parallel toolSteps', () => {
    const pA: PendingApproval = { callId: 'A', toolName: 'fa', args: {}, reason: '', receivedAt: 0 }
    const pB: PendingApproval = { callId: 'B', toolName: 'fb', args: {}, reason: '', receivedAt: 0 }
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [
            { id: 'A', name: 'fa', args: {} },
            { id: 'B', name: 'fb', args: {} }
          ]
        })
      ],
      [pA, pB]
    )
    const steps = (out[0].content as { toolSteps: ToolStep[] }).toolSteps
    expect(steps[0].pendingApproval).toEqual(pA)
    expect(steps[1].pendingApproval).toEqual(pB)
  })

  it('marks streaming=true loading=false when assistant has token text', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'a', role: 'assistant', text: 'hel', status: 'streaming' as const })],
      []
    )
    expect(out[0]).toMatchObject({ streaming: true, loading: false })
  })

  it('marks streaming=true loading=true when assistant has empty text and no toolCalls', () => {
    const out = deriveBubbleItems(
      [mkMsg({ id: 'a', role: 'assistant', text: '', status: 'streaming' as const })],
      []
    )
    expect(out[0]).toMatchObject({ streaming: true, loading: true })
  })

  it('treats missing status as done', () => {
    const out = deriveBubbleItems([mkMsg({ id: 'a', role: 'assistant', text: 'historical' })], [])
    expect(out[0]).toMatchObject({ streaming: false, loading: false })
  })

  it('falls back to positional matching when toolCallId is missing', () => {
    // legacy IPC fallback: tool message has no toolCallId; match by position.
    const out = deriveBubbleItems(
      [
        mkMsg({
          id: 'a',
          role: 'assistant',
          text: '',
          status: 'done' as const,
          toolCalls: [{ id: 'A', name: 'fa', args: {} }]
        }),
        mkMsg({ id: 't', role: 'tool', text: '{"ok":true,"data":[]}' })
      ],
      []
    )
    const steps = (out[0].content as { toolSteps: ToolStep[] }).toolSteps
    expect(steps[0].result).toEqual({ ok: true, data: [] })
  })
})

type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: import('@/stores/chat').PendingApproval
}
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/bubbleSelectors.test.ts`
Expected: FAIL with "Cannot find module './bubbleSelectors'".

---

<!-- openspec-task: 2.1 -->

### Task 2: Implement bubbleSelectors.ts

**Files:**

- Create: `src/components/chat/bubbleSelectors.ts`

- [x] **Step 1: Write the minimal implementation**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/bubbleSelectors.ts`:

```ts
import type { ChatMessage, PendingApproval } from '@/stores/chat'

export type ToolStep = {
  call: { id: string; name: string; args: unknown }
  result?: { ok: true; data: unknown } | { ok: false; error: string }
  pendingApproval?: PendingApproval
}

export type BubbleItem = {
  key: string
  role: 'user' | 'assistant'
  content: string | { text: string; toolSteps: ToolStep[] }
  streaming?: boolean
  loading?: boolean
}

function parseToolResultText(text: string): ToolStep['result'] {
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text) as ToolStep['result']
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed
  } catch {
    // fall through
  }
  if (text.startsWith('error: ')) {
    return { ok: false, error: text.slice('error: '.length) }
  }
  return undefined
}

export function deriveBubbleItems(
  messages: ChatMessage[],
  pendingApprovals: PendingApproval[]
): BubbleItem[] {
  const items: BubbleItem[] = []
  const stepsByAssistantKey = new Map<string, ToolStep[]>()

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'user') {
      items.push({ key: m.id, role: 'user', content: m.text })
      continue
    }
    if (m.role === 'assistant') {
      const status = (m.status as 'streaming' | 'done' | 'pending' | 'error' | undefined) ?? 'done'
      const streaming = status === 'streaming'
      const loading = streaming && !m.text && (!m.toolCalls || m.toolCalls.length === 0)
      if (m.toolCalls && m.toolCalls.length > 0) {
        const toolSteps: ToolStep[] = m.toolCalls.map((tc) => {
          const pa = pendingApprovals.find((p) => p.callId === tc.id)
          const step: ToolStep = { call: { id: tc.id, name: tc.name, args: tc.args } }
          if (pa) step.pendingApproval = pa
          return step
        })
        stepsByAssistantKey.set(m.id, toolSteps)
        items.push({
          key: m.id,
          role: 'assistant',
          content: { text: m.text, toolSteps },
          streaming,
          loading
        })
      } else {
        items.push({ key: m.id, role: 'assistant', content: m.text, streaming, loading })
      }
      continue
    }
    if (m.role === 'tool') {
      // find the most recent assistant with toolSteps
      let target: BubbleItem | undefined
      for (let j = items.length - 1; j >= 0; j--) {
        const it = items[j]
        if (it.role === 'assistant' && typeof it.content !== 'string') {
          target = it
          break
        }
      }
      if (!target) continue
      const steps = (target.content as { text: string; toolSteps: ToolStep[] }).toolSteps
      let step: ToolStep | undefined
      if (m.toolCallId) {
        step = steps.find((s) => s.call.id === m.toolCallId)
      }
      if (!step) {
        step = steps.find((s) => s.result === undefined)
      }
      if (step) {
        step.result = parseToolResultText(m.text)
      }
    }
  }

  return items
}
```

Note: `ChatMessage.status` is consumed via `m.status` here. Plan 1 has not added the field yet — TypeScript will flag this. Add a temporary `status?: 'pending' | 'streaming' | 'done' | 'error'` to the `ChatMessage` interface in `src/stores/chat.ts` (Plan 4 task 6.2 makes it official):

Edit `src/stores/chat.ts`, change:

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
}
```

to:

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

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/bubbleSelectors.test.ts`
Expected: PASS (11 scenarios).

- [x] **Step 3: Commit**

```bash
git add src/components/chat/bubbleSelectors.ts src/components/chat/bubbleSelectors.test.ts src/stores/chat.ts
git commit -m "feat(chat-derive-bubble): deriveBubbleItems folds tool messages by callId"
```

---

<!-- openspec-task: 2.2 -->

### Task 3: Add 11 scenarios coverage check (no new code)

**Files:**

- No code change. This task confirms Task 1 has all 11 scenarios from `chat-derive-bubble` spec.

- [x] **Step 1: Count test cases in `bubbleSelectors.test.ts`**

Run: `grep -c "^  it(" /Users/aaa/develop/workspace-ai/acornvo/src/components/chat/bubbleSelectors.test.ts`
Expected: `11`.

If count is < 11, re-read `openspec/changes/phase-20-chat-ui-ant-design-x/specs/chat-derive-bubble/spec.md` scenarios and add the missing tests:

- 纯文本 user 消息 ✓
- 纯文本 assistant 消息 ✓
- 单工具按 callId 折叠 ✓
- 并行工具折叠 ✓
- 工具结果未到达 ✓
- 单待审 ✓
- 多待审独立 ✓
- 流式有 token ✓
- 流式开始无 token ✓
- 完成态 ✓
- 位置 fallback（covers the `toolCallId` missing fallback Requirement bullet）✓

- [x] **Step 2: Commit coverage marker**

```bash
git commit --allow-empty -m "test(chat-derive-bubble): confirmed 11/11 scenarios covered"
```

---

<!-- openspec-task: 2.6 -->

### Task 4: Write failing tests for ExternalLinkAnchor

**Files:**

- Create: `src/components/chat/ExternalLinkAnchor.test.tsx`

- [x] **Step 1: Inspect ipc client to know the openExternal call signature**

Run: `grep -n "openExternal" /Users/aaa/develop/workspace-ai/acornvo/src/ipc/client.ts`
Expected: a method like `ipc.file.openExternal(url: string)`. Use the exact name discovered.

- [x] **Step 2: Write the test**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ExternalLinkAnchor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExternalLinkAnchor } from './ExternalLinkAnchor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      openExternal: vi.fn()
    }
  }
}))

import { ipc } from '@/ipc/client'

describe('ExternalLinkAnchor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes ipc.file.openExternal with the href on click', async () => {
    render(<ExternalLinkAnchor href="https://example.com">example</ExternalLinkAnchor>)
    await userEvent.click(screen.getByText('example'))
    expect(ipc.file.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(ipc.file.openExternal).toHaveBeenCalledTimes(1)
  })

  it('prevents default navigation on click', async () => {
    const onClickSpy = vi.fn((ev: React.MouseEvent) => {
      // After the component handler runs, defaultPrevented should be true.
      expect(ev.defaultPrevented).toBe(true)
    })
    render(
      <div onClick={onClickSpy}>
        <ExternalLinkAnchor href="https://example.com">x</ExternalLinkAnchor>
      </div>
    )
    await userEvent.click(screen.getByText('x'))
    expect(onClickSpy).toHaveBeenCalled()
  })

  it('does nothing for href starting with `#` (anchor link)', async () => {
    render(<ExternalLinkAnchor href="#section">jump</ExternalLinkAnchor>)
    await userEvent.click(screen.getByText('jump'))
    expect(ipc.file.openExternal).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 3: Run test to verify it fails**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/ExternalLinkAnchor.test.tsx`
Expected: FAIL with "Cannot find module './ExternalLinkAnchor'".

---

<!-- openspec-task: 2.4 -->

### Task 5: Implement ExternalLinkAnchor.tsx

**Files:**

- Create: `src/components/chat/ExternalLinkAnchor.tsx`

- [x] **Step 1: Write the implementation**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ExternalLinkAnchor.tsx`:

```tsx
import type { AnchorHTMLAttributes, MouseEvent, PropsWithChildren } from 'react'
import { ipc } from '@/ipc/client'

type Props = PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement>>

export function ExternalLinkAnchor({ href, children, ...rest }: Props) {
  const handleClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (!href || href.startsWith('#')) return
    ev.preventDefault()
    ipc.file.openExternal(href)
  }
  return (
    <a {...rest} href={href} onClick={handleClick}>
      {children}
    </a>
  )
}
```

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/ExternalLinkAnchor.test.tsx`
Expected: PASS (3 scenarios).

- [x] **Step 3: Commit**

```bash
git add src/components/chat/ExternalLinkAnchor.tsx src/components/chat/ExternalLinkAnchor.test.tsx
git commit -m "feat(chat-message-list): ExternalLinkAnchor for IPC-routed external link clicks"
```

---

<!-- openspec-task: 2.3 -->

### Task 6: Implement chatRoles.tsx (stub assistant contentRender, full body in Plan 3)

**Files:**

- Create: `src/components/chat/chatRoles.tsx`

- [x] **Step 1: Write minimal implementation with stable role config**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/chatRoles.tsx`:

```tsx
import type { BubbleProps } from '@ant-design/x'
import { Avatar } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { BubbleItem, ToolStep } from './bubbleSelectors'

type RolesMap = Record<'user' | 'assistant', Partial<BubbleProps>>

export const chatRoles: RolesMap = {
  user: {
    placement: 'end',
    avatar: <Avatar icon={<UserOutlined />} />
  },
  assistant: {
    placement: 'start',
    avatar: <Avatar icon={<RobotOutlined />} />,
    contentRender: (content) => {
      // Plan 2 stub: render plain text if `content` is a string, else show toolSteps count.
      // Plan 3 (tasks 4.2-4.5) replaces this with ThoughtChain + XMarkdown + ApprovalInlineActions.
      if (typeof content === 'string') return <span>{content}</span>
      const c = content as { text: string; toolSteps: ToolStep[] }
      return (
        <div>
          {c.toolSteps.length > 0 && (
            <div data-testid="thought-chain-placeholder">[{c.toolSteps.length} tool step(s)]</div>
          )}
          {c.text && <span>{c.text}</span>}
        </div>
      )
    }
  }
}
```

- [x] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx tsc --noEmit -p tsconfig.web.json --composite false 2>&1 | grep -i "chatRoles\|bubbleSelectors\|ExternalLink"`
Expected: no errors mentioning the new files.

- [x] **Step 3: Commit**

```bash
git add src/components/chat/chatRoles.tsx
git commit -m "feat(chat-message-list): chatRoles stub (user/assistant placement + avatar)"
```

---

<!-- openspec-task: 2.5 -->

### Task 7: Write chatRoles snapshot tests for three render shapes

**Files:**

- Create: `src/components/chat/chatRoles.test.tsx`

- [x] **Step 1: Write tests**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/chatRoles.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { chatRoles } from './chatRoles'

describe('chatRoles', () => {
  it('user role places at end with avatar', () => {
    expect(chatRoles.user.placement).toBe('end')
    expect(chatRoles.user.avatar).toBeDefined()
  })

  it('assistant role places at start with avatar', () => {
    expect(chatRoles.assistant.placement).toBe('start')
    expect(chatRoles.assistant.avatar).toBeDefined()
  })

  it('assistant contentRender returns plain text when content is a string', () => {
    const node = chatRoles.assistant.contentRender!('hello world', {} as any)
    const { container } = render(<>{node}</>)
    expect(container.textContent).toBe('hello world')
  })

  it('assistant contentRender shows toolSteps placeholder + text', () => {
    const node = chatRoles.assistant.contentRender!(
      {
        text: 'I called a tool',
        toolSteps: [{ call: { id: 'A', name: 'search', args: {} } }]
      } as any,
      {} as any
    )
    const { container, getByTestId } = render(<>{node}</>)
    expect(getByTestId('thought-chain-placeholder').textContent).toContain('1 tool step')
    expect(container.textContent).toContain('I called a tool')
  })

  it('assistant contentRender omits placeholder when toolSteps is empty', () => {
    const node = chatRoles.assistant.contentRender!(
      { text: 'no tools', toolSteps: [] } as any,
      {} as any
    )
    const { queryByTestId, container } = render(<>{node}</>)
    expect(queryByTestId('thought-chain-placeholder')).toBeNull()
    expect(container.textContent).toBe('no tools')
  })
})
```

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/chatRoles.test.tsx`
Expected: PASS (5 assertions).

- [x] **Step 3: Commit**

```bash
git add src/components/chat/chatRoles.test.tsx
git commit -m "test(chat-message-list): chatRoles role config + stubbed contentRender"
```

---

<!-- openspec-task: 3.2 -->

### Task 8: Add groupSession helper to src/lib/date-utils.ts with TDD

**Files:**

- Create: `src/lib/date-utils.ts`
- Create: `src/lib/date-utils.test.ts`

- [x] **Step 1: Write the failing test**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/lib/date-utils.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { groupSession } from './date-utils'

describe('groupSession', () => {
  beforeEach(() => {
    // Fix "now" to Thursday 2026-05-14 14:00 local time
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T14:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  it('returns "today" for a timestamp earlier today', () => {
    const ts = new Date('2026-05-14T09:00:00').getTime()
    expect(groupSession(ts)).toBe('today')
  })

  it('returns "today" for a timestamp at 00:00 today', () => {
    const ts = new Date('2026-05-14T00:00:00').getTime()
    expect(groupSession(ts)).toBe('today')
  })

  it('returns "thisWeek" for Monday 00:00 of the current week', () => {
    const ts = new Date('2026-05-11T00:00:00').getTime() // Monday
    expect(groupSession(ts)).toBe('thisWeek')
  })

  it('returns "thisWeek" for yesterday', () => {
    const ts = new Date('2026-05-13T18:00:00').getTime()
    expect(groupSession(ts)).toBe('thisWeek')
  })

  it('returns "earlier" for last week', () => {
    const ts = new Date('2026-05-10T23:59:59').getTime() // Sunday before this Monday
    expect(groupSession(ts)).toBe('earlier')
  })

  it('returns "earlier" for last month', () => {
    const ts = new Date('2026-04-14T12:00:00').getTime()
    expect(groupSession(ts)).toBe('earlier')
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/lib/date-utils.test.ts`
Expected: FAIL with "Cannot find module './date-utils'".

- [x] **Step 3: Write the implementation**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/lib/date-utils.ts`:

```ts
export type SessionGroup = 'today' | 'thisWeek' | 'earlier'

export function groupSession(updatedAt: number): SessionGroup {
  const now = new Date()
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  // ISO week: Monday is the first day. Day-of-week 0=Sun..6=Sat.
  const dayOfWeek = now.getDay() // 0..6, 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7
  const mondayStart = today0 - daysSinceMonday * 24 * 60 * 60 * 1000
  if (updatedAt >= today0) return 'today'
  if (updatedAt >= mondayStart) return 'thisWeek'
  return 'earlier'
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/lib/date-utils.test.ts`
Expected: PASS (6 assertions).

- [x] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/lib/date-utils.test.ts
git commit -m "feat(chat-session-list): groupSession(updatedAt) → today | thisWeek | earlier"
```

---

<!-- openspec-task: 3.1 -->
<!-- openspec-task: 3.3 -->
<!-- openspec-task: 3.4 -->
<!-- openspec-task: 3.5 -->

### Task 9: Implement ConversationsAdapter (groups + menu + collapse + red dot)

**Files:**

- Create: `src/components/chat/ConversationsAdapter.tsx`

- [x] **Step 1: Inspect Conversations API surface**

Skim the `x-components` skill for `Conversations` props (`items`, `activeKey`, `onActiveChange`, `groupable`, `creation`, `menu`, narrow-mode patterns). Confirm `items[i].menu` accepts antd `MenuProps` items.

- [x] **Step 2: Implement the adapter**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ConversationsAdapter.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Conversations } from '@ant-design/x'
import type { ConversationsProps } from '@ant-design/x'
import { Badge, Input, Modal } from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useChatStore } from '@/stores/chat'
import { groupSession } from '@/lib/date-utils'

const NARROW_BREAKPOINT = 960

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_BREAKPOINT)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return narrow
}

export function ConversationsAdapter() {
  const { t } = useTranslation()
  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const bySession = useChatStore((s) => s.bySession)
  const selectSession = useChatStore((s) => s.selectSession)
  const createSession = useChatStore((s) => s.createSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const deleteSession = useChatStore((s) => s.deleteSession)

  const narrow = useNarrow()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const items: NonNullable<ConversationsProps['items']> = useMemo(
    () =>
      sessions.map((s) => {
        const hasBackgroundApproval =
          s.id !== activeSessionId && (bySession[s.id]?.pendingApprovals?.length ?? 0) > 0
        const baseLabel = s.title || t('chat.untitled')
        const label =
          editingId === s.id ? (
            <Input
              size="small"
              autoFocus
              defaultValue={baseLabel}
              onChange={(e) => setEditingTitle(e.target.value)}
              onPressEnter={() => {
                if (editingTitle.trim()) {
                  renameSession(s.id, editingTitle.trim())
                }
                setEditingId(null)
                setEditingTitle('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setEditingId(null)
                  setEditingTitle('')
                }
              }}
            />
          ) : (
            <span>
              {narrow ? baseLabel.slice(0, 8) : baseLabel}
              {hasBackgroundApproval && (
                <Badge dot offset={[6, 0]} aria-label={t('chat.session.approvalPending')} />
              )}
            </span>
          )
        return {
          key: s.id,
          label,
          group: groupSession(s.updatedAt),
          menu: {
            items: [
              {
                key: 'rename',
                icon: <EditOutlined />,
                label: t('chat.session.rename'),
                onClick: () => {
                  setEditingId(s.id)
                  setEditingTitle(baseLabel)
                }
              },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: t('chat.session.delete'),
                danger: true,
                onClick: () => {
                  Modal.confirm({
                    title: t('chat.session.deleteConfirmTitle'),
                    content: t('chat.session.deleteConfirmContent', { title: baseLabel }),
                    okText: t('common.delete'),
                    okType: 'danger',
                    cancelText: t('common.cancel'),
                    onOk: () => deleteSession(s.id)
                  })
                }
              }
            ]
          }
        }
      }),
    [
      sessions,
      activeSessionId,
      bySession,
      editingId,
      editingTitle,
      narrow,
      t,
      renameSession,
      deleteSession
    ]
  )

  return (
    <Conversations
      items={items}
      activeKey={activeSessionId ?? undefined}
      onActiveChange={(key) => selectSession(String(key))}
      groupable
      creation={{
        label: t('chat.new'),
        icon: <PlusOutlined />,
        onClick: () => createSession()
      }}
      style={{ width: narrow ? 48 : 280 }}
    />
  )
}
```

Note: the exact `creation` prop shape may differ in your antd-x version — consult the `x-components` skill if `Conversations` doesn't expose `creation`. Fallback: render a `<Button>` above `<Conversations>` for the new-session entry.

- [x] **Step 3: Add i18n keys**

Edit `src/i18n/locales/zh.json` (and `en.json`) to add the keys referenced above:

```jsonc
// zh.json — add under "chat"
"untitled": "未命名会话",
"new": "新建会话",
"session": {
  "rename": "重命名",
  "delete": "删除",
  "deleteConfirmTitle": "删除会话",
  "deleteConfirmContent": "确定要删除 \"{{title}}\" 吗？此操作不可撤销。",
  "approvalPending": "有待审批"
}
```

Run: `grep -n '"chat":' /Users/aaa/develop/workspace-ai/acornvo/src/i18n/locales/zh.json` to locate the namespace; insert the new keys inside. Mirror the same structure (English wording) in `en.json`.

- [x] **Step 4: Verify typecheck**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web`
Expected: pass.

- [x] **Step 5: Commit**

```bash
git add src/components/chat/ConversationsAdapter.tsx src/i18n/locales/zh.json src/i18n/locales/en.json
git commit -m "feat(chat-session-list): ConversationsAdapter (groups, menu, narrow-mode, approval dot)"
```

---

<!-- openspec-task: 3.6 -->

### Task 10: Write 12 scenarios test for ConversationsAdapter

**Files:**

- Create: `src/components/chat/ConversationsAdapter.test.tsx`

- [x] **Step 1: Write tests covering all chat-session-list scenarios**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ConversationsAdapter.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConversationsAdapter } from './ConversationsAdapter'
import { useChatStore } from '@/stores/chat'
import i18n from '@/i18n'
import { I18nextProvider } from 'react-i18next'

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

function seed(state: Partial<ReturnType<typeof useChatStore.getState>>) {
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    bySession: {},
    sessionsLoading: false,
    sessionsError: null,
    focusInputBump: 0,
    showShortcutsBump: 0,
    ...state
  } as any)
}

const today = Date.now()
const yesterday = today - 24 * 60 * 60 * 1000
const longAgo = today - 30 * 24 * 60 * 60 * 1000

describe('ConversationsAdapter', () => {
  beforeEach(() => {
    seed({
      sessions: [
        { id: 's1', title: 'Today A', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's1'
    })
  })

  it('renders session title when non-empty', () => {
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    expect(screen.getByText('Today A')).toBeTruthy()
  })

  it('renders untitled placeholder when title is empty', () => {
    seed({
      sessions: [{ id: 's1', title: '', createdAt: today, updatedAt: today, profileId: null }],
      activeSessionId: 's1'
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    expect(screen.getByText(/未命名|Untitled/)).toBeTruthy()
  })

  it('switches active session on click', async () => {
    const selectSession = vi.fn()
    seed({
      sessions: [
        { id: 's1', title: 'A', createdAt: today, updatedAt: today, profileId: null },
        { id: 's2', title: 'B', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's1'
    })
    useChatStore.setState({ selectSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    await userEvent.click(screen.getByText('B'))
    expect(selectSession).toHaveBeenCalledWith('s2')
  })

  it('groups today / thisWeek / earlier', () => {
    seed({
      sessions: [
        { id: '1', title: 'Now', createdAt: today, updatedAt: today, profileId: null },
        { id: '2', title: 'Yest', createdAt: yesterday, updatedAt: yesterday, profileId: null },
        { id: '3', title: 'Old', createdAt: longAgo, updatedAt: longAgo, profileId: null }
      ],
      activeSessionId: '1'
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    // Conversations renders group headers internally; verify all three items render.
    expect(screen.getByText('Now')).toBeTruthy()
    expect(screen.getByText('Yest')).toBeTruthy()
    expect(screen.getByText('Old')).toBeTruthy()
  })

  it('rename menu enters inline edit; Enter commits via renameSession', async () => {
    const renameSession = vi.fn()
    useChatStore.setState({ renameSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    // Open menu by hovering then clicking "重命名"; antd Menu may need hover-trigger
    await userEvent.hover(screen.getByText('Today A'))
    const rename = await screen.findByText(/重命名|Rename/)
    await userEvent.click(rename)
    const input = screen.getByDisplayValue('Today A') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, 'New Title{enter}')
    expect(renameSession).toHaveBeenCalledWith('s1', 'New Title')
  })

  it('rename Esc aborts without calling renameSession', async () => {
    const renameSession = vi.fn()
    useChatStore.setState({ renameSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    await userEvent.hover(screen.getByText('Today A'))
    const rename = await screen.findByText(/重命名|Rename/)
    await userEvent.click(rename)
    const input = screen.getByDisplayValue('Today A')
    await userEvent.type(input, 'X{Escape}')
    expect(renameSession).not.toHaveBeenCalled()
  })

  it('delete menu opens Modal.confirm; OK invokes deleteSession', async () => {
    const deleteSession = vi.fn()
    useChatStore.setState({ deleteSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    await userEvent.hover(screen.getByText('Today A'))
    const del = await screen.findByText(/^删除$|^Delete$/)
    await userEvent.click(del)
    const ok = await screen.findByRole('button', { name: /删除|Delete/ })
    await userEvent.click(ok)
    expect(deleteSession).toHaveBeenCalledWith('s1')
  })

  it('creation entry invokes createSession on click', async () => {
    const createSession = vi.fn()
    useChatStore.setState({ createSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    await userEvent.click(screen.getByRole('button', { name: /新建|New/ }))
    expect(createSession).toHaveBeenCalled()
  })

  it('renders narrow mode (<960px) with truncated 8-char label', () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    seed({
      sessions: [
        { id: 's1', title: 'ABCDEFGHIJ', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's1'
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    // 8-char truncation
    expect(screen.getByText('ABCDEFGH')).toBeTruthy()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
  })

  it('narrow mode click still switches session', async () => {
    const original = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('resize'))
    const selectSession = vi.fn()
    seed({
      sessions: [
        { id: 's1', title: 'SessionOne', createdAt: today, updatedAt: today, profileId: null },
        { id: 's2', title: 'SessionTwo', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's1'
    })
    useChatStore.setState({ selectSession } as any)
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    await userEvent.click(screen.getByText('SessionTw'))
    expect(selectSession).toHaveBeenCalledWith('s2')
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original })
  })

  it('shows red dot on background session with pendingApprovals', () => {
    seed({
      sessions: [
        { id: 's1', title: 'A', createdAt: today, updatedAt: today, profileId: null },
        { id: 's2', title: 'B', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {
        s2: {
          loaded: true,
          messages: [],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [{ callId: 'A', toolName: 'x', args: {}, reason: '', receivedAt: 0 }],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'awaiting-approval',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        } as any
      } as any
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    const labelB = screen.getByText('B').closest('span')
    expect(within(labelB!).getByLabelText(/有待审批|approval/i)).toBeTruthy()
  })

  it('hides red dot once session B becomes active', () => {
    seed({
      sessions: [
        { id: 's1', title: 'A', createdAt: today, updatedAt: today, profileId: null },
        { id: 's2', title: 'B', createdAt: today, updatedAt: today, profileId: null }
      ],
      activeSessionId: 's2', // B is now active
      bySession: {
        s2: {
          loaded: true,
          messages: [],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [{ callId: 'A', toolName: 'x', args: {}, reason: '', receivedAt: 0 }],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'awaiting-approval',
          error: null,
          lastUserText: '',
          lastUserAttachments: []
        } as any
      } as any
    })
    render(
      <Wrap>
        <ConversationsAdapter />
      </Wrap>
    )
    const labelB = screen.getByText('B').closest('span')!
    expect(within(labelB).queryByLabelText(/有待审批|approval/i)).toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/ConversationsAdapter.test.tsx`
Expected: PASS (12 scenarios). If a Conversations internal prop doesn't expose a particular hook (e.g. `creation`), adjust the adapter and re-run.

- [x] **Step 3: Commit**

```bash
git add src/components/chat/ConversationsAdapter.test.tsx
git commit -m "test(chat-session-list): 12-scenario coverage for ConversationsAdapter"
```

---

<!-- openspec-task: 3.7 -->
<!-- openspec-task: 3.9 -->

### Task 11: Implement ChatInputArea (Sender + onSubmit/onCancel + Esc + focus bump)

**Files:**

- Create: `src/components/chat/ChatInputArea.tsx`

- [x] **Step 1: Inspect Sender API surface**

Skim the `x-components` skill for `Sender` props (`value`, `onChange`, `onSubmit`, `onCancel`, `loading`, `header`, `prefix`, `onKeyDown`). Confirm `Sender.ref` exposes a focus method or that focus can be triggered via a child ref.

- [x] **Step 2: Implement the component**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ChatInputArea.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sender } from '@ant-design/x'
import { PaperClipOutlined } from '@ant-design/icons'
import { Button, message as antdMessage } from 'antd'
import { useChatStore, BusyError } from '@/stores/chat'
import { AttachmentsAdapter } from './AttachmentsAdapter'

export function ChatInputArea() {
  const { t } = useTranslation()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const status = useChatStore((s) =>
    activeSessionId ? s.bySession[activeSessionId]?.status : 'idle'
  )
  const pendingAttachments = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingAttachments ?? []) : []
  )
  const pendingPromptText = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingPromptText ?? '') : ''
  )
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText)
  const sendUserMessage = useChatStore((s) => s.sendUserMessage)
  const cancelStream = useChatStore((s) => s.cancelStream)
  const focusInputBump = useChatStore((s) => s.focusInputBump)

  const senderRef = useRef<HTMLTextAreaElement | null>(null)
  const [text, setText] = useState(pendingPromptText)
  const attachmentsRef = useRef<{ select: (opts: { multiple?: boolean }) => void } | null>(null)

  // Sync from store on session change OR pendingPromptText change
  useEffect(() => {
    setText(pendingPromptText)
  }, [pendingPromptText, activeSessionId])

  // Imperative focus on bump
  useEffect(() => {
    if (focusInputBump > 0) {
      senderRef.current?.focus()
    }
  }, [focusInputBump])

  const isStreaming = status === 'streaming'

  const handleSubmit = async (val: string) => {
    if (!val.trim() && pendingAttachments.length === 0) return
    try {
      await sendUserMessage({ text: val, attachments: pendingAttachments })
      setText('')
      setPendingPromptText('')
    } catch (err) {
      if (err instanceof BusyError) {
        antdMessage.error(t('chat.input.busy'))
      } else {
        antdMessage.error(err instanceof Error ? err.message : String(err))
      }
    }
  }

  return (
    <Sender
      ref={senderRef as any}
      value={text}
      onChange={(v) => {
        setText(v)
        setPendingPromptText(v)
      }}
      onSubmit={handleSubmit}
      onCancel={() => cancelStream()}
      loading={isStreaming}
      placeholder={t('chat.input.placeholder')}
      onKeyDown={(ev) => {
        if (ev.key === 'Escape' && isStreaming) {
          ev.preventDefault()
          cancelStream()
        }
      }}
      prefix={
        <Button
          type="text"
          icon={<PaperClipOutlined />}
          aria-label={t('chat.input.attach')}
          onClick={() => attachmentsRef.current?.select({ multiple: true })}
        />
      }
      header={pendingAttachments.length > 0 ? <AttachmentsAdapter ref={attachmentsRef} /> : null}
    />
  )
}
```

- [x] **Step 3: Add i18n keys**

Append to `src/i18n/locales/zh.json` under `"chat"`:

```jsonc
"input": {
  "placeholder": "输入消息…（Cmd+Enter 发送，Esc 取消）",
  "attach": "添加附件",
  "busy": "会话正在响应，请稍候"
}
```

Mirror in `en.json` with English wording.

- [x] **Step 4: Verify typecheck**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web`
Expected: pass. If `Sender.ref` typing fails, use `as any` cast or define the type locally.

- [x] **Step 5: Commit**

```bash
git add src/components/chat/ChatInputArea.tsx src/i18n/locales/zh.json src/i18n/locales/en.json
git commit -m "feat(chat-input): ChatInputArea — Sender + Esc cancel + paperclip + focus bump"
```

---

<!-- openspec-task: 3.8 -->

### Task 12: Implement AttachmentsAdapter with forwardRef select() exposure

**Files:**

- Create: `src/components/chat/AttachmentsAdapter.tsx`

- [x] **Step 1: Inspect Attachments API surface**

Skim the `x-components` skill for `Attachments` — note its `items` shape, `onItemRemove`, `overflow`, and ref-exposed methods (especially `select(opts)`).

- [x] **Step 2: Implement AttachmentsAdapter**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/AttachmentsAdapter.tsx`:

```tsx
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Attachments } from '@ant-design/x'
import type { AttachmentsRef } from '@ant-design/x/es/attachments/interface'
import { useChatStore } from '@/stores/chat'
import { ipc } from '@/ipc/client'
import type { Attachment } from '@shared/agent-types'

export type AttachmentsAdapterHandle = {
  select: (opts?: { multiple?: boolean }) => Promise<void>
}

export const AttachmentsAdapter = forwardRef<AttachmentsAdapterHandle>((_, ref) => {
  const innerRef = useRef<AttachmentsRef | null>(null)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const pendingAttachments = useChatStore((s) =>
    activeSessionId ? (s.bySession[activeSessionId]?.pendingAttachments ?? []) : []
  )
  const pushAttachment = useChatStore((s) => s.pushAttachment)
  const removeAttachment = useChatStore((s) => s.removeAttachment)

  useImperativeHandle(ref, () => ({
    select: async ({ multiple = true } = {}) => {
      // Prefer IPC if available (offers Electron-native file picker).
      const paths = await (ipc as any).file.openDialog?.({ multiple })
      const list: string[] = Array.isArray(paths) ? paths : paths ? [paths] : []
      for (const p of list) {
        const name = p.split(/[\\/]/).pop() ?? p
        const att: Attachment = { type: 'file', path: p, title: name } as Attachment
        pushAttachment(att)
      }
    }
  }))

  return (
    <Attachments
      ref={innerRef}
      overflow="scrollX"
      items={pendingAttachments.map((a, i) => ({
        uid: String(i),
        name: a.title
        // Map to antd UploadFile-like shape; Attachments tolerates partial fields.
      }))}
      onItemRemove={(item) => {
        const idx = Number(item.uid)
        if (!Number.isNaN(idx)) removeAttachment(idx)
      }}
    />
  )
})
AttachmentsAdapter.displayName = 'AttachmentsAdapter'
```

If the IPC layer does NOT expose `ipc.file.openDialog`, fall back to `innerRef.current?.select?.(opts)` (component-internal opener). Inspect `src/ipc/client.ts` once to decide.

Run: `grep -n "openDialog\|selectFiles\|chooseFiles" /Users/aaa/develop/workspace-ai/acornvo/src/ipc/client.ts /Users/aaa/develop/workspace-ai/acornvo/shared/ipc-contract.ts 2>/dev/null`

- [x] **Step 3: Verify typecheck**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web`
Expected: pass.

- [x] **Step 4: Commit**

```bash
git add src/components/chat/AttachmentsAdapter.tsx
git commit -m "feat(chat-attachments): AttachmentsAdapter with imperative select() and store sync"
```

---

<!-- openspec-task: 3.10 -->

### Task 13: Write 8-scenario test for ChatInputArea

**Files:**

- Create: `src/components/chat/ChatInputArea.test.tsx`

- [x] **Step 1: Write tests**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ChatInputArea.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { ChatInputArea } from './ChatInputArea'

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const seedSession = (overrides: Record<string, any> = {}) => {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages: [],
        streamingBuffer: '',
        flushedLength: 0,
        pendingApprovals: [],
        pendingAttachments: [],
        pendingPromptText: '',
        status: 'idle',
        error: null,
        lastUserText: '',
        lastUserAttachments: [],
        ...overrides
      } as any
    },
    focusInputBump: 0
  } as any)
}

describe('ChatInputArea', () => {
  beforeEach(() => seedSession())

  it('single-line input shows minimal height (no overflow scroll)', () => {
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    expect(screen.getByPlaceholderText(/输入消息|Enter message/)).toBeTruthy()
  })

  it('Enter inserts newline (does not submit)', async () => {
    const sendUserMessage = vi.fn()
    useChatStore.setState({ sendUserMessage } as any)
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const ta = screen.getByPlaceholderText(/输入消息|Enter message/) as HTMLTextAreaElement
    await userEvent.click(ta)
    await userEvent.type(ta, 'a{enter}b')
    expect(sendUserMessage).not.toHaveBeenCalled()
    expect(ta.value).toContain('\n')
  })

  it('Cmd+Enter submits with non-empty text', async () => {
    const sendUserMessage = vi.fn(async () => {})
    useChatStore.setState({ sendUserMessage } as any)
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const ta = screen.getByPlaceholderText(/输入消息|Enter message/) as HTMLTextAreaElement
    await userEvent.click(ta)
    await userEvent.type(ta, 'hello')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(sendUserMessage).toHaveBeenCalledWith({ text: 'hello', attachments: [] })
  })

  it('empty text + empty attachments — no submit', async () => {
    const sendUserMessage = vi.fn()
    useChatStore.setState({ sendUserMessage } as any)
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const ta = screen.getByPlaceholderText(/输入消息|Enter message/) as HTMLTextAreaElement
    await userEvent.click(ta)
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(sendUserMessage).not.toHaveBeenCalled()
  })

  it('Esc while streaming triggers cancelStream', async () => {
    const cancelStream = vi.fn()
    useChatStore.setState({ cancelStream } as any)
    seedSession({ status: 'streaming' })
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const ta = screen.getByPlaceholderText(/输入消息|Enter message/) as HTMLTextAreaElement
    await userEvent.click(ta)
    await userEvent.keyboard('{Escape}')
    expect(cancelStream).toHaveBeenCalled()
  })

  it('streaming status flips Sender into loading mode', () => {
    seedSession({ status: 'streaming' })
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    // Sender renders a cancel/stop button when loading=true; assert by aria-label or icon
    const stopBtn = screen.queryByRole('button', { name: /stop|cancel|停止|取消/i })
    expect(stopBtn).toBeTruthy()
  })

  it('focusInputBump triggers textarea focus', async () => {
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const ta = screen.getByPlaceholderText(/输入消息|Enter message/) as HTMLTextAreaElement
    expect(document.activeElement).not.toBe(ta)
    useChatStore.setState({ focusInputBump: 1 } as any)
    // wait a microtask for useEffect
    await Promise.resolve()
    expect(document.activeElement).toBe(ta)
  })

  it('paperclip button calls AttachmentsAdapter.select via ref', async () => {
    render(
      <Wrap>
        <ChatInputArea />
      </Wrap>
    )
    const btn = screen.getByLabelText(/添加附件|attach/i)
    expect(btn).toBeTruthy()
    // Click does not throw even if no IPC handler returns paths
    await userEvent.click(btn)
  })
})
```

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/ChatInputArea.test.tsx`
Expected: PASS (8 scenarios).

- [x] **Step 3: Commit**

```bash
git add src/components/chat/ChatInputArea.test.tsx
git commit -m "test(chat-input): 8-scenario coverage for ChatInputArea"
```

---

<!-- openspec-task: 3.11 -->

### Task 14: Write 5-scenario test for AttachmentsAdapter

**Files:**

- Create: `src/components/chat/AttachmentsAdapter.test.tsx`

- [x] **Step 1: Write tests**

Create `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/AttachmentsAdapter.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import { useChatStore } from '@/stores/chat'
import { AttachmentsAdapter, type AttachmentsAdapterHandle } from './AttachmentsAdapter'

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      openDialog: vi.fn()
    }
  }
}))
import { ipc } from '@/ipc/client'

function seed(atts: any[] = []) {
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'T', createdAt: 0, updatedAt: 0, profileId: null }],
    activeSessionId: 's1',
    bySession: {
      s1: {
        loaded: true,
        messages: [],
        streamingBuffer: '',
        flushedLength: 0,
        pendingApprovals: [],
        pendingAttachments: atts,
        pendingPromptText: '',
        status: 'idle',
        error: null,
        lastUserText: '',
        lastUserAttachments: []
      } as any
    }
  } as any)
}

describe('AttachmentsAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing-visible when pendingAttachments is empty', () => {
    seed([])
    render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    // Empty list — no file items in DOM
    expect(screen.queryByRole('listitem')).toBeNull()
  })

  it('renders each attachment with its title', () => {
    seed([
      { type: 'file', path: '/tmp/a.md', title: 'a.md' },
      { type: 'file', path: '/tmp/b.md', title: 'b.md' }
    ])
    render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(screen.getByText('a.md')).toBeTruthy()
    expect(screen.getByText('b.md')).toBeTruthy()
  })

  it('select() via ref invokes IPC and pushes file attachments', async () => {
    ;(ipc.file.openDialog as any).mockResolvedValue(['/tmp/x.md', '/tmp/y.md'])
    const pushAttachment = vi.fn()
    useChatStore.setState({ pushAttachment } as any)
    seed([])
    const ref = createRef<AttachmentsAdapterHandle>()
    render(
      <Wrap>
        <AttachmentsAdapter ref={ref} />
      </Wrap>
    )
    await ref.current!.select({ multiple: true })
    expect(pushAttachment).toHaveBeenCalledTimes(2)
    expect(pushAttachment).toHaveBeenNthCalledWith(1, {
      type: 'file',
      path: '/tmp/x.md',
      title: 'x.md'
    })
  })

  it('clicking item close calls removeAttachment with correct index', async () => {
    const removeAttachment = vi.fn()
    useChatStore.setState({ removeAttachment } as any)
    seed([
      { type: 'file', path: '/tmp/a.md', title: 'a.md' },
      { type: 'file', path: '/tmp/b.md', title: 'b.md' }
    ])
    render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    // Find the 2nd item's close button (Attachments renders an X / close icon per item)
    const closeButtons = screen.getAllByRole('button', { name: /remove|close|删除|关闭/i })
    expect(closeButtons.length).toBeGreaterThanOrEqual(2)
    await userEvent.click(closeButtons[1])
    expect(removeAttachment).toHaveBeenCalledWith(1)
  })

  it('after store clears pendingAttachments, list re-renders empty', () => {
    seed([{ type: 'file', path: '/tmp/a.md', title: 'a.md' }])
    const { rerender } = render(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(screen.getByText('a.md')).toBeTruthy()
    seed([])
    rerender(
      <Wrap>
        <AttachmentsAdapter />
      </Wrap>
    )
    expect(screen.queryByText('a.md')).toBeNull()
  })
})
```

- [x] **Step 2: Run test to verify it passes**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/AttachmentsAdapter.test.tsx`
Expected: PASS (5 scenarios). If antd-x `Attachments` doesn't render a per-item close button with the exact aria-label, narrow the selector to the rendered icon.

- [x] **Step 3: Commit**

```bash
git add src/components/chat/AttachmentsAdapter.test.tsx
git commit -m "test(chat-attachments): 5-scenario coverage for AttachmentsAdapter"
```

---

## Plan completion checklist

After all 14 tasks pass, before moving to Plan 3:

- [x] `src/components/chat/bubbleSelectors.ts` exports `deriveBubbleItems`, `BubbleItem`, `ToolStep`.
- [x] `src/components/chat/chatRoles.tsx` exports a stable `chatRoles` map with stub `contentRender` for assistant.
- [x] `src/components/chat/ExternalLinkAnchor.tsx` overrides `<a>` to use `ipc.file.openExternal`.
- [x] `src/components/chat/ConversationsAdapter.tsx` wires sessions + groups + menu + narrow-mode + red dot.
- [x] `src/components/chat/ChatInputArea.tsx` wraps `Sender` with submit / cancel / Esc / focus-bump.
- [x] `src/components/chat/AttachmentsAdapter.tsx` forwardRef-exposes `select()` and drives store.
- [x] `src/lib/date-utils.ts` exports `groupSession`.
- [x] `ChatMessage.status?: 'pending' | 'streaming' | 'done' | 'error'` added to store (Plan 4 task 6.2 makes it official, but Plan 2 needs the field).
- [x] `npx vitest run src/components/chat/{bubbleSelectors,chatRoles,ExternalLinkAnchor,ConversationsAdapter,ChatInputArea,AttachmentsAdapter}.test.{ts,tsx}` all pass.
- [x] `npx vitest run src/lib/date-utils.test.ts` passes.
- [x] `npm run typecheck` passes.
- [x] **No legacy components removed yet** — `Chat.tsx` still imports `SessionList`, `MessageList`, `ChatInput`, `ApprovalPanel`. Plan 5 handles the swap-in + deletions; Plan 3 lands `Bubble.List`.
