# Phase 17 — Chat UI & Sessions: Plan 5 (i18n + Acceptance)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-17-chat-ui-sessions`
> **Task range:** OpenSpec tasks `10.1`–`11.18` (20 tasks)
> **Plan order:** 5 of 5. Final plan; builds on Plans 1–4.
> **Status:** Not started
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-17-chat-ui-sessions`

---

## Goal

Two halves: (a) **i18n consolidation** — audit every string in `chat.*`, ensure key parity between `zh-CN` and `en-US`, fix any drift introduced by Plans 1–4, and add the i18n parity test that locks future drift; (b) **Acceptance** — flip AppRail's `松语` entry from disabled to enabled, then run through the 18 acceptance scenarios as automated tests where possible (most are integration tests with mocked IPC) and manual smoke for the few that need a live LLM. Final task runs `openspec validate --strict`.

## Architecture

- **i18n parity is enforced by an existing convention** — see `src/i18n/library-keys.test.ts` and `src/i18n/settings-keys.test.ts`. Add `chat-keys.test.ts` that walks `chat.*` in zh-CN and verifies en-US has identical keys (allow value translation difference, but key shape must match).
- **AppRail change** is a one-line `disabled: false` flip in `ENTRIES` plus updated test expectations in `src/components/AppRail.test.tsx` (the "chat entry is rendered with aria-disabled" expectation flips).
- **Acceptance tests** live in `src/__acceptance__/Chat.acceptance.test.tsx` with the existing acceptance-test convention (see `src/pages/Library.acceptance.test.tsx` for shape). Each `it(...)` block maps 1:1 to one acceptance scenario from `tasks.md` 11.x. Where a scenario truly requires a real LLM (11.3 — fps measurement), substitute a synthetic-token harness that proves the rAF batching works without measuring real frame rate.
- **Manual smoke** is documented at the end of this plan as a checklist; mark each item complete after verifying in `npm run dev`.

## Tech Stack

- existing testing stack (vitest + @testing-library/react + jsdom)
- existing i18n keys-test pattern (deep walk + key-set comparison)

## Files Touched (this plan)

| Path                                                     | Action                                        | Owner task                           |
| -------------------------------------------------------- | --------------------------------------------- | ------------------------------------ |
| `src/i18n/locales/zh-CN.json`                            | Modify (final consolidated chat keys)         | 10.1                                 |
| `src/i18n/locales/en-US.json`                            | Modify (final consolidated chat keys, parity) | 10.2                                 |
| `src/i18n/chat-keys.test.ts`                             | Create (zh/en parity test)                    | 10.2                                 |
| `src/components/AppRail.tsx`                             | Modify (chat entry enabled)                   | 11.2                                 |
| `src/components/AppRail.test.tsx`                        | Modify (assertion flip)                       | 11.2                                 |
| `src/__acceptance__/Chat.acceptance.test.tsx`            | Create (15 acceptance scenarios)              | 11.1, 11.3–11.10, 11.12, 11.15–11.17 |
| `src/__acceptance__/ChatAttachments.acceptance.test.tsx` | Create (attachment scenarios)                 | 11.5, 11.13, 11.14                   |
| `src/__acceptance__/ChatApproval.acceptance.test.tsx`    | Create (approval scenarios)                   | 11.6, 11.7                           |
| `src/__acceptance__/ChatErrors.acceptance.test.tsx`      | Create (error scenarios)                      | 11.8, 11.9, 11.11                    |

## Pre-flight

- Plans 1–4 merged.
- Run `npm run test` and `npm run typecheck` once at the start to confirm a clean baseline.

---

## Tasks

<!-- openspec-task: 10.1 -->

### Task 1: Consolidate `chat.*` keys in `zh-CN.json` — final shape

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Read existing `chat` block**

```bash
node -e "const j=require('./src/i18n/locales/zh-CN.json'); console.log(JSON.stringify(j.chat, null, 2))"
```

- [ ] **Step 2: Replace with the consolidated final shape**

Use the Edit tool to replace the entire `"chat": { ... }` value with:

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
  },
  "session": {
    "newAria": "新对话",
    "searchPlaceholder": "搜索会话…",
    "noResults": "无匹配会话",
    "rename": "重命名",
    "delete": "删除",
    "copyId": "复制 session id",
    "confirmDeleteTitle": "删除会话？",
    "confirmDeleteBody": "此操作不可撤销，会话内所有消息将被删除。",
    "confirmDeleteOk": "删除",
    "confirmDeleteCancel": "取消"
  },
  "messages": {
    "jumpToLatest": "新消息 ↓",
    "copy": "复制",
    "retry": "重试",
    "quote": "引用"
  },
  "input": {
    "placeholder": "问问松语…  /  Cmd+Enter 发送  /  @ 引用",
    "send": "发送",
    "stop": "停止",
    "noProfile": "未配置 AI profile",
    "goToSettings": "前往设置"
  },
  "approval": {
    "header": "待审工具调用",
    "reason": "原因",
    "args": "参数",
    "approve": "同意",
    "reject": "取消",
    "edit": "编辑参数",
    "queued": "还有 {{count}} 条待审",
    "timeout": "此操作已超时取消",
    "invalidJson": "JSON 格式错误",
    "tools": {
      "update_frontmatter": "更新 frontmatter",
      "write_file": "写入文件",
      "delete_file": "删除文件",
      "default": "工具调用"
    }
  },
  "error": {
    "missingProfile": "请先在设置中配置 AI profile",
    "goToSettings": "前往设置",
    "busy": "当前会话已在生成，请稍候",
    "stepLimit": "助手达到步骤上限，已停止",
    "network": "网络错误，稍后再试",
    "server": "服务端错误，稍后再试",
    "retry": "重试"
  },
  "shortcuts": {
    "title": "快捷键",
    "send": "发送：Cmd/Ctrl + Enter",
    "newSession": "新对话：Cmd/Ctrl + N",
    "focusInput": "聚焦输入：Cmd/Ctrl + K",
    "showHelp": "查看帮助：Cmd/Ctrl + /",
    "stopStream": "停止生成：Esc"
  }
}
```

- [ ] **Step 3: Run all tests to ensure no key was renamed silently**

```bash
npm run test
```

Expected: PASS — if any test fails because a key was renamed, update the consumer to the new key (or vice versa).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "chore(phase-17): consolidate chat.* zh-CN keys"
```

---

<!-- openspec-task: 10.2 -->

### Task 2: en-US parity + write the parity test

**Files:**

- Modify: `src/i18n/locales/en-US.json`
- Create: `src/i18n/chat-keys.test.ts`

- [ ] **Step 1: Mirror the chat block in en-US.json with English values**

Replace the `"chat": { ... }` value in `src/i18n/locales/en-US.json` with the structurally identical block:

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
    "card1": "Find notes about the attention mechanism",
    "card2": "Summarize the last 10 clips",
    "card3": "Set a.md tags to [\"reading\", \"essay\"]",
    "card4": "Top 10 most frequent tags"
  },
  "session": {
    "newAria": "New chat",
    "searchPlaceholder": "Search chats…",
    "noResults": "No matching chats",
    "rename": "Rename",
    "delete": "Delete",
    "copyId": "Copy session id",
    "confirmDeleteTitle": "Delete chat?",
    "confirmDeleteBody": "This cannot be undone. All messages in this chat will be deleted.",
    "confirmDeleteOk": "Delete",
    "confirmDeleteCancel": "Cancel"
  },
  "messages": {
    "jumpToLatest": "New messages ↓",
    "copy": "Copy",
    "retry": "Retry",
    "quote": "Quote"
  },
  "input": {
    "placeholder": "Ask Songyu…  /  Cmd+Enter to send  /  @ to reference",
    "send": "Send",
    "stop": "Stop",
    "noProfile": "No AI profile configured",
    "goToSettings": "Go to settings"
  },
  "approval": {
    "header": "Pending tool call",
    "reason": "Reason",
    "args": "Arguments",
    "approve": "Approve",
    "reject": "Cancel",
    "edit": "Edit args",
    "queued": "{{count}} more pending",
    "timeout": "This action timed out and was cancelled",
    "invalidJson": "Invalid JSON",
    "tools": {
      "update_frontmatter": "Update frontmatter",
      "write_file": "Write file",
      "delete_file": "Delete file",
      "default": "Tool call"
    }
  },
  "error": {
    "missingProfile": "Please configure an AI profile in Settings",
    "goToSettings": "Go to settings",
    "busy": "This chat is already generating — please wait",
    "stepLimit": "Assistant reached the step limit and stopped",
    "network": "Network error — try again later",
    "server": "Server error — try again later",
    "retry": "Retry"
  },
  "shortcuts": {
    "title": "Keyboard shortcuts",
    "send": "Send: Cmd/Ctrl + Enter",
    "newSession": "New chat: Cmd/Ctrl + N",
    "focusInput": "Focus input: Cmd/Ctrl + K",
    "showHelp": "Show this help: Cmd/Ctrl + /",
    "stopStream": "Stop generation: Esc"
  }
}
```

- [ ] **Step 2: Read an existing parity test to copy the pattern**

```bash
cat src/i18n/library-keys.test.ts | head -60
```

- [ ] **Step 3: Create `src/i18n/chat-keys.test.ts`**

```ts
// src/i18n/chat-keys.test.ts
import { describe, it, expect } from 'vitest'
import zh from './locales/zh-CN.json'
import en from './locales/en-US.json'

function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return []
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? keysOf(v, path) : [path]
  })
}

describe('chat.* i18n key parity', () => {
  it('zh-CN and en-US have identical chat.* key shape', () => {
    const zhKeys = keysOf((zh as any).chat, 'chat').sort()
    const enKeys = keysOf((en as any).chat, 'chat').sort()
    const onlyInZh = zhKeys.filter((k) => !enKeys.includes(k))
    const onlyInEn = enKeys.filter((k) => !zhKeys.includes(k))
    expect({ onlyInZh, onlyInEn }).toEqual({ onlyInZh: [], onlyInEn: [] })
  })

  it('all chat.* leaves are non-empty strings', () => {
    for (const lang of [zh, en]) {
      for (const k of keysOf((lang as any).chat, 'chat')) {
        const path = k.split('.').slice(1)
        let v: any = (lang as any).chat
        for (const p of path) v = v[p]
        expect(typeof v).toBe('string')
        expect((v as string).length).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 4: Run the parity test**

```bash
npx vitest run src/i18n/chat-keys.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/en-US.json src/i18n/chat-keys.test.ts
git commit -m "chore(phase-17): en-US parity for chat.* + parity test"
```

---

<!-- openspec-task: 11.2 -->

### Task 3: Flip AppRail `松语` from disabled to enabled

**Files:**

- Modify: `src/components/AppRail.tsx`
- Modify: `src/components/AppRail.test.tsx`

- [ ] **Step 1: Edit `AppRail.tsx`**

Remove `disabled: true` from the chat entry:

```tsx
{ to: '/chat', labelKey: 'nav.chat', Icon: MessagesSquare },
```

- [ ] **Step 2: Update the test expectation**

In `src/components/AppRail.test.tsx`, replace the existing "aria-disabled" expectation:

```tsx
it('chat entry navigates to /chat (no longer disabled)', () => {
  render(
    <MemoryRouter initialEntries={['/library']}>
      <AppRail />
    </MemoryRouter>
  )
  const chat = screen.getByRole('link', { name: /chat|松语/i })
  expect(chat.getAttribute('aria-disabled')).not.toBe('true')
  expect(chat.getAttribute('href')).toMatch(/\/chat/)
})
```

- [ ] **Step 3: Run AppRail tests**

```bash
npx vitest run src/components/AppRail.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppRail.tsx src/components/AppRail.test.tsx
git commit -m "feat(phase-17): enable AppRail 松语 entry — navigates to /chat"
```

---

<!-- openspec-task: 11.1 -->

### Task 4: Acceptance — open /chat with no sessions auto-creates one + shows 4 cards

**Files:**

- Create: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Read an existing acceptance test for shape**

```bash
sed -n '1,50p' src/pages/Library.acceptance.test.tsx
```

Note the harness setup pattern (mocked `window.api`, MemoryRouter, etc.).

- [ ] **Step 2: Write the test (this is the file's first scenario)**

Create `src/__acceptance__/Chat.acceptance.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { Chat } from '@/pages/Chat'
import { useChatStore } from '@/stores/chat'

const mockApi = {
  chat: {
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      messages: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockResolvedValue({
          id: 's-new',
          title: '未命名对话',
          createdAt: 1,
          updatedAt: 1,
          profileId: null
        })
    },
    onChatStream: vi.fn(() => () => {})
  }
}

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

describe('Chat acceptance — 11.1', () => {
  it('opens /chat with no sessions → auto-creates + shows 4 cards', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    expect(mockApi.chat.sessions.create).toHaveBeenCalledOnce()
    const cards = await screen.findAllByTestId('chat-empty-card')
    expect(cards).toHaveLength(4)
  })
})
```

- [ ] **Step 3: Run**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.1"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.1 — empty /chat auto-creates session"
```

---

<!-- openspec-task: 11.2 -->

### Task 5: Acceptance — AppRail 松语 link navigates to /chat

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append failing test**

```tsx
import { App } from '@/App'
import userEvent from '@testing-library/user-event'

describe('Chat acceptance — 11.2', () => {
  it('clicking 松语 entry navigates to /chat with active state', async () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <App>
          <Chat />
        </App>
      </MemoryRouter>
    )
    const link = screen.getByRole('link', { name: /chat|松语/i })
    await userEvent.click(link)
    // active state: anchor has aria-current or active class
    expect(link.className).toContain('border-primary')
  })
})
```

(If the actual `<App>` is harder to mount in isolation — it has its own routing — substitute by importing `AppRail` directly and asserting `href`.)

Simpler form:

```tsx
import { AppRail } from '@/components/AppRail'

it('AppRail 松语 entry has href=/chat and is not disabled', () => {
  render(
    <MemoryRouter initialEntries={['/library']}>
      <AppRail />
    </MemoryRouter>
  )
  const link = screen.getByRole('link', { name: /chat|松语/i })
  expect(link.getAttribute('href')).toMatch(/\/chat/)
  expect(link.getAttribute('aria-disabled')).not.toBe('true')
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.2"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.2 — AppRail link to /chat"
```

---

<!-- openspec-task: 11.3 -->

### Task 6: Acceptance — streaming token rAF batching (synthetic harness)

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

True 50fps measurement is impractical in jsdom. The acceptance proxy is: **DOM text node is appended (not full re-render) and buffer flushes only on rAF tick**.

- [ ] **Step 1: Append test**

```tsx
import { MessageList } from '@/components/chat/MessageList'
import { installChatStreamSubscriber } from '@/stores/chat'

describe('Chat acceptance — 11.3', () => {
  it('rAF batching — token events accumulate; one flush per frame', async () => {
    let streamHandler: ((evt: any) => void) | null = null
    mockApi.chat.onChatStream = vi.fn((cb: any) => {
      streamHandler = cb
      return () => {}
    })
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
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
          lastUserText: '',
          lastUserAttachments: [],
          status: 'streaming',
          error: null
        }
      }
    })
    installChatStreamSubscriber()

    let rafCb: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCb = cb
      return 1
    })

    render(<MessageList />)
    // Send 200 token events synchronously; only a few rAF callbacks should fire (we manually drive)
    for (let i = 0; i < 200; i++) streamHandler!({ sessionId: 's1', type: 'token', text: 'x' })
    rafCb?.(performance.now()) // a single flush

    const pre = screen.getByTestId('streaming-pre')
    expect(pre.textContent?.length).toBe(200)
    // Buffer is reflected; flushedLength advanced
    expect(useChatStore.getState().bySession.s1!.flushedLength).toBe(200)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.3"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.3 — rAF batching token flush"
```

---

<!-- openspec-task: 11.4 -->

### Task 7: Acceptance — Esc cancels stream, gray "已停止" preserved

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append test**

```tsx
import { ChatInput } from '@/components/chat/ChatInput'

describe('Chat acceptance — 11.4', () => {
  it('Esc during streaming → cancelStream → idle status; preserve emitted text', async () => {
    mockApi.chat.cancelStream = vi.fn().mockResolvedValue({ ok: true })
    let streamHandler: ((evt: any) => void) | null = null
    mockApi.chat.onChatStream = vi.fn((cb: any) => {
      streamHandler = cb
      return () => {}
    })
    installChatStreamSubscriber()
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          streamingBuffer: '已写',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          lastUserText: '',
          lastUserAttachments: [],
          status: 'streaming',
          error: null
        }
      }
    })
    render(<ChatInput />)
    const ta = screen.getByRole('textbox')
    ta.focus()
    await userEvent.keyboard('{Escape}')
    expect(mockApi.chat.cancelStream).toHaveBeenCalledOnce()

    // simulate the agent emitting an aborted final 'done' or error event
    streamHandler!({
      sessionId: 's1',
      type: 'done',
      message: { id: 'm1', role: 'assistant', text: '已写', createdAt: 1 }
    })
    const slot = useChatStore.getState().bySession.s1!
    expect(slot.messages.find((m) => m.id === 'm1')?.text).toBe('已写')
    expect(slot.status).toBe('idle')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.4"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.4 — Esc cancels stream, partial text preserved"
```

---

<!-- openspec-task: 11.5 -->

### Task 8: Acceptance — `@` triggers QuickSwitcher → attachment in send

**Files:**

- Create: `src/__acceptance__/ChatAttachments.acceptance.test.tsx`

- [ ] **Step 1: Author the file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { i18n } from '@/i18n'
import { ChatInput } from '@/components/chat/ChatInput'
import { useChatStore } from '@/stores/chat'
import { useSearchStore } from '@/stores/search'

const mockApi = {
  chat: {
    sessions: { list: vi.fn().mockResolvedValue([]), messages: vi.fn().mockResolvedValue([]) },
    onChatStream: vi.fn(() => () => {}),
    sendUserMessage: vi.fn().mockResolvedValue({ ok: true })
  }
}

beforeAll(async () => {
  if (!i18n.isInitialized) await i18n.init()
})
beforeEach(() => {
  // @ts-expect-error
  globalThis.window.api = mockApi
  useChatStore.setState({
    sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
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
        lastUserText: '',
        lastUserAttachments: [],
        status: 'idle',
        error: null
      }
    }
  })
  vi.clearAllMocks()
})
afterEach(() => cleanup())

describe('ChatAttachments acceptance — 11.5', () => {
  it('typing @ + picking opens QuickSwitcher and inserts chip; send carries attachment', async () => {
    render(<ChatInput />)
    const ta = screen.getByRole('textbox')
    await userEvent.type(ta, '看看 @')
    expect(useSearchStore.getState().quickSwitcher.openState).toBe(true)

    const onPick = useSearchStore.getState().quickSwitcher.onPick
    onPick?.({ type: 'file', path: 'notes/a.md', title: 'A' })

    expect(useChatStore.getState().bySession.s1!.pendingAttachments).toEqual([
      { type: 'file', path: 'notes/a.md', title: 'A' }
    ])

    // Now send
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(mockApi.chat.sendUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ type: 'file', path: 'notes/a.md', title: 'A' }]
      })
    )
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatAttachments.acceptance.test.tsx -t "11.5"
git add src/__acceptance__/ChatAttachments.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.5 — @ triggers QuickSwitcher; attachment carried"
```

---

<!-- openspec-task: 11.6 -->

### Task 9: Acceptance — update_frontmatter triggers approval; approve writes; result card shows

**Files:**

- Create: `src/__acceptance__/ChatApproval.acceptance.test.tsx`

- [ ] **Step 1: Author the file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { Chat } from '@/pages/Chat'
import { useChatStore, installChatStreamSubscriber } from '@/stores/chat'

const mockApi = {
  chat: {
    sessions: {
      list: vi
        .fn()
        .mockResolvedValue([{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }]),
      messages: vi.fn().mockResolvedValue([])
    },
    onChatStream: vi.fn(),
    approveTool: vi.fn().mockResolvedValue({ ok: true }),
    rejectTool: vi.fn().mockResolvedValue({ ok: true })
  }
}

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

describe('ChatApproval acceptance — 11.6', () => {
  it('approval-needed → panel slides in with diff; approve calls approveTool with original args', async () => {
    let h: ((e: any) => void) | null = null
    mockApi.chat.onChatStream = vi.fn((cb: any) => {
      h = cb
      return () => {}
    })
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    installChatStreamSubscriber()

    h!({
      sessionId: 's1',
      type: 'tool.approval-needed',
      callId: 'c1',
      toolName: 'update_frontmatter',
      args: { path: 'a.md', before: { rating: 3 }, after: { rating: 5 } },
      reason: 'r'
    })

    expect(await screen.findByTestId('diff-before')).toBeTruthy()
    expect(screen.getByTestId('diff-after')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }))
    expect(mockApi.chat.approveTool).toHaveBeenCalledWith({
      sessionId: 's1',
      callId: 'c1',
      editedArgs: undefined
    })

    h!({
      sessionId: 's1',
      type: 'tool.result',
      message: { id: 'tr1', role: 'tool', text: '{"ok":true}', toolCallId: 'c1', createdAt: 1 }
    })
    expect(await screen.findByTestId('msg-toolresult-tr1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatApproval.acceptance.test.tsx -t "11.6"
git add src/__acceptance__/ChatApproval.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.6 — approval flow with diff + result card"
```

---

<!-- openspec-task: 11.7 -->

### Task 10: Acceptance — 3 approvals queue → "还有 N 条待审" → sequential

**Files:**

- Modify: `src/__acceptance__/ChatApproval.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
describe('ChatApproval acceptance — 11.7', () => {
  it('queue 3 approvals; counter shows 2 remaining; sequential processing', async () => {
    let h: ((e: any) => void) | null = null
    mockApi.chat.onChatStream = vi.fn((cb: any) => {
      h = cb
      return () => {}
    })
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    installChatStreamSubscriber()

    for (const id of ['c1', 'c2', 'c3']) {
      h!({
        sessionId: 's1',
        type: 'tool.approval-needed',
        callId: id,
        toolName: 'write_file',
        args: { path: `${id}.md`, content: 'x' },
        reason: ''
      })
    }

    expect(await screen.findByText(/还有 2 条待审|2 more pending/i)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }))
    expect(await screen.findByText(/还有 1 条待审|1 more pending/i)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }))
    // Last one — counter hidden
    expect(screen.queryByText(/还有.*待审|more pending/i)).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatApproval.acceptance.test.tsx -t "11.7"
git add src/__acceptance__/ChatApproval.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.7 — approval queue counter + sequential"
```

---

<!-- openspec-task: 11.8 -->

### Task 11: Acceptance — missing profile → banner with link

**Files:**

- Create: `src/__acceptance__/ChatErrors.acceptance.test.tsx`

- [ ] **Step 1: Author the file**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { Chat } from '@/pages/Chat'
import { useChatStore } from '@/stores/chat'
import { useProfilesStore } from '@/stores/profiles'

const mockApi = {
  chat: {
    sessions: {
      list: vi
        .fn()
        .mockResolvedValue([{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }]),
      messages: vi.fn().mockResolvedValue([])
    },
    onChatStream: vi.fn(() => () => {}),
    sendUserMessage: vi.fn()
  }
}

beforeAll(async () => {
  if (!i18n.isInitialized) await i18n.init()
})
beforeEach(() => {
  // @ts-expect-error
  globalThis.window.api = mockApi
  useChatStore.setState({ sessions: [], activeSessionId: null, bySession: {} })
  useProfilesStore.setState({ profiles: [] } as any)
  vi.clearAllMocks()
})
afterEach(() => cleanup())

describe('ChatErrors acceptance — 11.8', () => {
  it('no profile configured → banner with /settings/ai link', async () => {
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('chat-banner-missing-profile')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /前往设置|Go to settings/i }).getAttribute('href')
    ).toBe('/settings/ai')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatErrors.acceptance.test.tsx -t "11.8"
git add src/__acceptance__/ChatErrors.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.8 — missing profile banner"
```

---

<!-- openspec-task: 11.9 -->

### Task 12: Acceptance — second send while streaming → E_BUSY toast

**Files:**

- Modify: `src/__acceptance__/ChatErrors.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
import { ChatInput } from '@/components/chat/ChatInput'

describe('ChatErrors acceptance — 11.9', () => {
  it('second send while streaming → toast', async () => {
    const toastSpy = vi.fn()
    vi.doMock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }) }))
    const { ChatInput: Fresh } = await import('@/components/chat/ChatInput')

    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
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
          lastUserText: '',
          lastUserAttachments: [],
          status: 'streaming',
          error: null
        }
      }
    })
    render(<Fresh />)
    const ta = screen.getByRole('textbox')
    await userEvent.type(ta, 'hi')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/已在生成|already generating/i) })
    )
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatErrors.acceptance.test.tsx -t "11.9"
git add src/__acceptance__/ChatErrors.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.9 — second send during streaming → toast"
```

---

<!-- openspec-task: 11.10 -->

### Task 13: Acceptance — background streaming on other session → pulse dot

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
describe('Chat acceptance — 11.10', () => {
  it('A streaming, current=B → A row shows pulsing dot; clears on done', async () => {
    let h: ((e: any) => void) | null = null
    mockApi.chat.onChatStream = vi.fn((cb: any) => {
      h = cb
      return () => {}
    })
    mockApi.chat.sessions.list = vi.fn().mockResolvedValue([
      { id: 'sA', title: 'A', createdAt: 1, updatedAt: 2, profileId: null },
      { id: 'sB', title: 'B', createdAt: 1, updatedAt: 1, profileId: null }
    ])
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    installChatStreamSubscriber()

    // Switch to B
    await useChatStore.getState().selectSession('sB')
    // A streams in background
    h!({ sessionId: 'sA', type: 'token', text: 'x' })
    expect(await screen.findByTestId('badge-streaming')).toBeTruthy()

    h!({
      sessionId: 'sA',
      type: 'done',
      message: { id: 'mA', role: 'assistant', text: 'x', createdAt: 1 }
    })
    expect(screen.queryByTestId('badge-streaming')).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.10"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.10 — background session pulse"
```

---

<!-- openspec-task: 11.11 -->

### Task 14: Acceptance — search filter + right-click rename / delete

**Files:**

- Modify: `src/__acceptance__/ChatErrors.acceptance.test.tsx` (rename to general acceptance)

- [ ] **Step 1: Append**

```tsx
import { SessionList } from '@/components/chat/SessionList'

describe('Chat acceptance — 11.11', () => {
  it('search filters; right-click rename + delete via dialog', async () => {
    mockApi.chat.sessions.rename = vi.fn().mockResolvedValue({ ok: true })
    mockApi.chat.sessions.delete = vi.fn().mockResolvedValue({ ok: true })
    useChatStore.setState({
      sessions: [
        { id: 's1', title: '阅读笔记', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's2', title: '旅行计划', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {}
    })
    render(<SessionList />)

    await userEvent.type(screen.getByRole('searchbox'), '笔记')
    expect(screen.getAllByTestId('session-row')).toHaveLength(1)

    await userEvent.clear(screen.getByRole('searchbox'))

    // Right-click → rename
    const row = screen.getAllByTestId('session-row')[0]
    await userEvent.pointer({ keys: '[MouseRight>]', target: row })
    await userEvent.click(screen.getByRole('menuitem', { name: /重命名|rename/i }))
    const input = await screen.findByDisplayValue('阅读笔记')
    await userEvent.clear(input)
    await userEvent.type(input, '新名{Enter}')
    expect(mockApi.chat.sessions.rename).toHaveBeenCalledWith('s1', '新名')

    // Delete
    await userEvent.pointer({
      keys: '[MouseRight>]',
      target: screen.getAllByTestId('session-row')[0]
    })
    await userEvent.click(screen.getByRole('menuitem', { name: /删除|delete/i }))
    await userEvent.click(screen.getByRole('button', { name: /删除$|^delete$/i }))
    expect(mockApi.chat.sessions.delete).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatErrors.acceptance.test.tsx -t "11.11"
git add src/__acceptance__/ChatErrors.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.11 — search filter + rename / delete"
```

---

<!-- openspec-task: 11.12 -->

### Task 15: Acceptance — refresh persists; in-flight assistant not rebuilt

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
describe('Chat acceptance — 11.12', () => {
  it('on remount, sessions + persisted messages restore; streamingBuffer is clean', async () => {
    mockApi.chat.sessions.list = vi
      .fn()
      .mockResolvedValue([{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }])
    mockApi.chat.sessions.messages = vi
      .fn()
      .mockResolvedValue([{ id: 'm1', role: 'user', text: 'hi', createdAt: 1 }])
    const { unmount } = render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    expect(useChatStore.getState().bySession.s1?.messages.find((m) => m.id === 'm1')).toBeTruthy()

    // Simulate "refresh" — reset store and remount
    unmount()
    useChatStore.setState({ sessions: [], activeSessionId: null, bySession: {} })
    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    const slot = useChatStore.getState().bySession.s1!
    expect(slot.messages.find((m) => m.id === 'm1')).toBeTruthy()
    expect(slot.streamingBuffer).toBe('')
    expect(slot.status).toBe('idle')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.12"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.12 — refresh persists session + clean stream slot"
```

---

<!-- openspec-task: 11.13 -->

### Task 16: Acceptance — 40000-char attachment truncates to 20000 + 已截断

**Files:**

- Modify: `src/__acceptance__/ChatAttachments.acceptance.test.tsx`

This is a backend behavior — best tested as a unit test on `collectAttachmentContext` (Plan 4 Task 3 already covered it). Add a renderer-side acceptance: when the user-side message displays after a successful send, only the chip is shown — body is not echoed. Plus repeat the unit test reference.

- [ ] **Step 1: Append**

```tsx
import { collectAttachmentContext } from '@electron/agent/attachments'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('ChatAttachments acceptance — 11.13', () => {
  it('attachment > 20000 chars → truncated with 已截断 marker', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'a17-'))
    const big = 'x'.repeat(40000)
    await fs.writeFile(path.join(tmp, 'a.md'), big, 'utf8')
    const out = await collectAttachmentContext([{ type: 'file', path: 'a.md', title: 'A' }], {
      groveRoot: tmp,
      clipsGet: vi.fn()
    })
    expect(out.blocks[0]).toContain('已截断')
    expect(out.blocks[0].length).toBeLessThan(big.length + 200)
  })
})
```

(Use a `vitest.config.ts` alias `@electron` if not already available; otherwise import via relative path: `../../electron/agent/attachments`.)

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatAttachments.acceptance.test.tsx -t "11.13"
git add src/__acceptance__/ChatAttachments.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.13 — attachment truncation"
```

---

<!-- openspec-task: 11.14 -->

### Task 17: Acceptance — missing path → 读取失败 block; loop continues

**Files:**

- Modify: `src/__acceptance__/ChatAttachments.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
describe('ChatAttachments acceptance — 11.14', () => {
  it('missing file → 读取失败 block; collectAttachmentContext does not throw', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'a17-'))
    const out = await collectAttachmentContext([{ type: 'file', path: 'missing.md', title: 'M' }], {
      groveRoot: tmp,
      clipsGet: vi.fn()
    })
    expect(out.blocks).toHaveLength(1)
    expect(out.blocks[0]).toContain('读取失败')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/ChatAttachments.acceptance.test.tsx -t "11.14"
git add src/__acceptance__/ChatAttachments.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.14 — missing file → 读取失败"
```

---

<!-- openspec-task: 11.15 -->

### Task 18: Acceptance — markdown renders lists / code / tables; pre-wrap during stream

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append**

````tsx
import { MessageList } from '@/components/chat/MessageList'

describe('Chat acceptance — 11.15', () => {
  it('completed assistant message renders markdown elements', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [
            {
              id: 'm1',
              role: 'assistant',
              text: '- item1\n- item2\n\n```\ncode\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
              createdAt: 1
            }
          ],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          lastUserText: '',
          lastUserAttachments: [],
          status: 'idle',
          error: null
        }
      }
    })
    render(<MessageList />)
    expect(screen.getByText('item1').tagName).toBe('LI')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getByText('a').tagName).toBe('TH')
  })

  it('streaming uses pre-wrap (no markdown parsing)', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [],
          streamingBuffer: '**bold**',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          lastUserText: '',
          lastUserAttachments: [],
          status: 'streaming',
          error: null
        }
      }
    })
    render(<MessageList />)
    const pre = screen.getByTestId('streaming-pre')
    expect(pre.tagName).toBe('PRE')
    expect(getComputedStyle(pre).whiteSpace).toMatch(/pre-wrap/)
  })
})
````

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.15"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.15 — markdown render + pre-wrap stream"
```

---

<!-- openspec-task: 11.16 -->

### Task 19: Acceptance — assistant link → shell.openExternal

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
describe('Chat acceptance — 11.16', () => {
  it('clicking https link calls ipc.shell.openExternal', async () => {
    const openExternal = vi.fn()
    // @ts-expect-error
    globalThis.window.api = { ...mockApi, shell: { openExternal } }
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [
            {
              id: 'm1',
              role: 'assistant',
              text: 'open [example](https://example.com)',
              createdAt: 1
            }
          ],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          lastUserText: '',
          lastUserAttachments: [],
          status: 'idle',
          error: null
        }
      }
    })
    render(<MessageList />)
    await userEvent.click(screen.getByRole('link', { name: 'example' }))
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.16"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.16 — assistant link via shell.openExternal"
```

---

<!-- openspec-task: 11.17 -->

### Task 20: Acceptance — top bar profile switch persists

**Files:**

- Modify: `src/__acceptance__/Chat.acceptance.test.tsx`

- [ ] **Step 1: Append**

```tsx
import { useProfilesStore } from '@/stores/profiles'

describe('Chat acceptance — 11.17', () => {
  it('switching profile via top bar updates session.profileId', async () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'p1',
          name: 'P1',
          provider: 'openai',
          model: 'gpt-4o',
          baseUrl: null,
          secretRef: null,
          default: false
        },
        {
          id: 'p2',
          name: 'P2',
          provider: 'anthropic',
          model: 'claude-opus',
          baseUrl: null,
          secretRef: null,
          default: false
        }
      ]
    } as any)
    mockApi.chat.sessions.list = vi
      .fn()
      .mockResolvedValue([{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: 'p1' }])
    mockApi.chat.sessions.updateProfile = vi.fn().mockResolvedValue({ ok: true })

    render(
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    )
    await screen.findByTestId('chat-main')
    await userEvent.click(screen.getByTestId('chat-profile-chip'))
    await userEvent.click(screen.getByRole('menuitem', { name: /P2/ }))
    expect(mockApi.chat.sessions.updateProfile).toHaveBeenCalledWith('s1', 'p2')
    const sess = useChatStore.getState().sessions.find((s) => s.id === 's1')!
    expect(sess.profileId).toBe('p2')
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
npx vitest run src/__acceptance__/Chat.acceptance.test.tsx -t "11.17"
git add src/__acceptance__/Chat.acceptance.test.tsx
git commit -m "test(phase-17): acceptance 11.17 — top bar profile switch persists"
```

---

<!-- openspec-task: 11.18 -->

### Task 21: Final — run `openspec validate phase-17-chat-ui-sessions --strict`

**Files:**

- (no edits; CI gate)

- [ ] **Step 1: Run validation**

```bash
openspec validate phase-17-chat-ui-sessions --strict
```

Expected: `✓ all artifacts valid`. If any complaint:

- Missing scenarios in any spec → re-read the spec under `openspec/changes/phase-17-chat-ui-sessions/specs/<cap>/spec.md` and confirm every Requirement has at least one Scenario.
- Missing modified-spec sections → cross-check `proposal.md`'s **Modified Capabilities** list (`app-shell`, `agent-loop`) against `specs/`.

- [ ] **Step 2: Run the complete test suite + lint + typecheck**

```bash
npm run typecheck && npm run lint && npm run test
```

Expected: 0 errors / 0 warnings / all green.

- [ ] **Step 3: Manual smoke checklist**

`npm run dev`. Confirm each item:

- [ ] AppRail "松语" entry is enabled and navigates to `/chat`
- [ ] First open auto-creates a session and shows 4 prompt cards
- [ ] Send "你好" → streaming text appears; rAF batching is smooth (no janky individual-token flicker)
- [ ] Press Esc during streaming → stops; partial text remains
- [ ] Type `@` → QuickSwitcher opens; pick a file → chip appears in attachments strip; send → assistant references file content (verify with a real prompt like "What's in the attached file?")
- [ ] Send a prompt that triggers `update_frontmatter` → ApprovalPanel slides in from right with diff; click 同意 → IPC executes; tool result card appears in conversation
- [ ] Open `/settings/ai`, delete all profiles, reload `/chat` → banner shows "请先在设置中配置 AI profile"
- [ ] Cmd/Ctrl+N → new session; Cmd/Ctrl+K → input cleared and focused; Cmd/Ctrl+/ → shortcuts dialog
- [ ] Click into SessionList area; ↑↓ navigate; Delete → confirmation dialog; Enter → activate
- [ ] Restart the app → `/chat` reopens with session list and persisted messages

- [ ] **Step 4: Commit final marker**

```bash
git commit --allow-empty -m "test(phase-17): all acceptance scenarios covered; openspec validate --strict passes"
```

---

## Plan 5 verification — phase complete

- [ ] All `openspec/changes/phase-17-chat-ui-sessions/tasks.md` items checked off (sync via `/opsx:executing-plans` flow).
- [ ] `openspec validate phase-17-chat-ui-sessions --strict` → green.
- [ ] `npm run typecheck && npm run lint && npm run test` → green.
- [ ] Manual smoke checklist all checked.

When all four are green, phase 17 is ready to merge. After merge, run `/opsx:archive` to archive the change spec.
