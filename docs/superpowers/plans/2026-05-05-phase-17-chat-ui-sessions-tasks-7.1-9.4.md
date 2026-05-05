# Phase 17 — Chat UI & Sessions: Plan 4 (Agent-loop Attachments + Errors + Keyboard)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-17-chat-ui-sessions`
> **Task range:** OpenSpec tasks `7.1`–`9.4` (13 tasks)
> **Plan order:** 4 of 5. Builds on Plans 1–3. Followed by Plan 5 (`tasks-10.1-11.18`).
> **Status:** Not started
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-17-chat-ui-sessions`

---

## Goal

Land three orthogonal slices: (a) **Agent-loop attachment support** — `electron/agent/loop.ts` reads attachments and synthesises a pre-user message that is **not** persisted, with truncation rules and read-failure resilience; (b) **Error UI** — Chat top banner for `E_MISSING_PROFILE`, toast for `E_BUSY`, in-conversation gray messages for `E_STEP_LIMIT` / `E_NETWORK` with retry; (c) **Keyboard accessibility** — `Cmd/Ctrl+N`, `Cmd/Ctrl+K`, `Cmd/Ctrl+/`, and SessionList ↑↓/Enter/Delete navigation.

## Architecture

- **Attachment context collection** lives in `electron/agent/attachments.ts` as a single pure-ish helper `collectAttachmentContext(attachments, ctx)` returning `{ blocks: string[], totalChars: number }`. `runAgent` calls it before LLM dispatch and inlines the resulting message as `role: 'user'` immediately preceding the user-visible message in the runtime `messages[]` array. The new pre-user message is **never** appended to `session_messages` — design D12 / spec scenario "刷新后不重建 attachment body".
- **File reads use `safeResolve` against the active grove root.** Phase 4 ships a `safeResolve` helper for path safety; reuse it. Clip reads go through the existing clip-store / IPC `clips.get(clipId)` from phase 12.
- **Truncation policy:** each attachment body is `slice(0, 20000)` and gets `(已截断)` if it was longer. After concatenation, if the combined chars > 80000, drop oldest blocks until under cap and append `[已省略 N 个附件]`.
- **Read-failure replacement:** any throw in fs.readFile / clip-store fetch becomes the literal block `--- <path>\n[读取失败: <error.message>]\n---\n` — loop continues normally.
- **Error-banner architecture:** the Chat top bar already exists (Plan 1 Task 6). Add a dismissable banner row above the top bar that subscribes to `useChatStore` and renders based on `bySession[active].error`. Banner only shows when `error === 'E_MISSING_PROFILE'`. Other errors render as gray inline messages at the bottom of the message list.
- **`E_BUSY` toast** uses the existing `useToast` hook. The `sendUserMessage` action throws `BusyError` (Plan 1 Task 3); `ChatInput.send()` catches it and calls toast.
- **`E_STEP_LIMIT` / `E_NETWORK` / `E_SERVER`** ride the existing stream `error` event. `MessageList` renders one extra row at the end when `slot.status === 'error'`. The retry button reads `slot.lastUserText` (added to state in Task 12) and calls `sendUserMessage` again.
- **Keyboard hooks** install once globally — extend `useGlobalHotkeys` (already exists for AppRail) with chat-specific bindings, gated by `location.pathname === '/chat'`.

## Tech Stack

- existing: `better-sqlite3`, `vitest`, `@testing-library/react`
- existing: `safeResolve` from phase 4 (path safety)
- existing: `useToast` hook from `@/hooks/use-toast`
- existing: `useGlobalHotkeys` from `@/hooks/useGlobalHotkeys`

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `electron/agent/attachments.ts` | Create | 7.2 |
| `electron/agent/attachments.test.ts` | Create | 7.2, 7.3, 7.4 |
| `electron/agent/loop.ts` | Modify (accept `attachments`) | 7.1 |
| `electron/agent/loop.test.ts` | Modify | 7.1 |
| `electron/ipc/chat.ts` | Modify (pass attachments through) | 7.5 |
| `electron/ipc/chat.test.ts` | Modify | 7.5 |
| `src/components/chat/ChatBanner.tsx` | Create | 8.1 |
| `src/pages/Chat.tsx` | Modify (mount banner, error tail) | 8.1, 8.3, 8.4 |
| `src/pages/Chat.test.tsx` | Modify | 8.1 |
| `src/components/chat/ChatInput.tsx` | Modify (E_BUSY toast) | 8.2 |
| `src/components/chat/ChatInput.test.tsx` | Modify | 8.2 |
| `src/components/chat/MessageList.tsx` | Modify (error tail + retry) | 8.3, 8.4 |
| `src/components/chat/MessageList.test.tsx` | Modify | 8.3, 8.4 |
| `src/stores/chat.ts` | Modify (track lastUserText) | 8.4 |
| `src/hooks/useGlobalHotkeys.ts` | Modify (chat hotkeys) | 9.1, 9.2, 9.3 |
| `src/hooks/useGlobalHotkeys.test.ts` | Modify | 9.1, 9.2, 9.3 |
| `src/components/chat/ShortcutsDialog.tsx` | Create | 9.3 |
| `src/components/chat/SessionList.tsx` | Modify (↑↓/Enter/Delete) | 9.4 |
| `src/components/chat/SessionList.test.tsx` | Modify | 9.4 |
| `src/i18n/locales/zh-CN.json`, `en-US.json` | Modify (`chat.error.*`, `chat.shortcuts.*`) | 8.x, 9.3 |

## Pre-flight

- Plans 1–3 merged.
- Confirm `electron/agent/loop.ts` exists and exports `runAgent`. The signature must already accept `RunAgentArgs` from `shared/agent-types.ts` (Plan 1 Task 1 added optional `attachments`).
- Confirm `safeResolve` location: `grep -rn "export.*safeResolve" electron/` — likely in `electron/services/file-io/` or similar from phase 4.
- Confirm `ipc.shell.openExternal`, `useToast` (`@/hooks/use-toast`), `useGlobalHotkeys` (`@/hooks/useGlobalHotkeys`) are present.

---

## Tasks

<!-- openspec-task: 7.1 -->
### Task 1: `runAgent` accepts `attachments` — wire optional arg through

**Files:**
- Modify: `electron/agent/loop.ts`
- Modify: `electron/agent/loop.test.ts`

- [ ] **Step 1: Read existing `runAgent` signature**

```bash
grep -n "export.*runAgent\|interface RunAgentArgs\|function runAgent" electron/agent/loop.ts shared/agent-types.ts
```

Note the current parameter list and how the return is shaped.

- [ ] **Step 2: Write failing test that runAgent accepts attachments without throwing**

Append to `electron/agent/loop.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAgent } from './loop';

describe('runAgent — attachments parameter', () => {
  it('accepts an optional attachments array without breaking existing callers', async () => {
    const writer = vi.fn();
    // Use the same harness phase-16 used; this just confirms type+pass-through
    await expect(
      runAgent({
        sessionId: 'test-session',
        userText: 'hi',
        attachments: [{ type: 'file', path: 'a.md', title: 'A' }],
        streamWriter: writer,
        cancel: { aborted: false }
      } as any)
    ).resolves.toBeUndefined();
  });
});
```

(If the existing test file uses fakes for `llmClient` and DB, follow that pattern. The above is intentionally minimal because the real coverage lives in Tasks 2–4.)

- [ ] **Step 3: Run — verify it fails**

```bash
npx vitest run electron/agent/loop.test.ts -t "attachments parameter"
```

Expected: FAIL — TypeScript or runtime error.

- [ ] **Step 4: Update `runAgent` signature**

In `electron/agent/loop.ts`, accept and pass through `attachments`:

```ts
import type { Attachment } from '@shared/agent-types';

export async function runAgent(args: {
  sessionId: string;
  userText: string;
  attachments?: Attachment[];
  // ...existing fields preserved
  streamWriter: (evt: unknown) => void;
  cancel: { aborted: boolean };
}): Promise<void> {
  const { sessionId, userText, attachments = [], streamWriter, cancel } = args;
  // ...existing flow
  // Task 3 will inject pre-user message via collectAttachmentContext
}
```

For now this only types-through the parameter; Task 3 wires it to the messages array.

- [ ] **Step 5: Run — verify the test passes**

```bash
npx vitest run electron/agent/loop.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/agent/loop.ts electron/agent/loop.test.ts
git commit -m "feat(phase-17): runAgent accepts optional attachments param"
```

---

<!-- openspec-task: 7.2 -->
### Task 2: `collectAttachmentContext` — read file/clip with `safeResolve` + clip-store

**Files:**
- Create: `electron/agent/attachments.ts`
- Create: `electron/agent/attachments.test.ts`

- [ ] **Step 1: Locate `safeResolve` and clip-store**

```bash
grep -rn "export.*safeResolve" electron/
grep -rn "export.*clipStore\|clips.get" electron/
```

Record the import paths — use them below as `<safeResolve-import>` and `<clip-store-import>`.

- [ ] **Step 2: Write failing tests**

Create `electron/agent/attachments.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectAttachmentContext } from './attachments';

describe('collectAttachmentContext', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-'));
  });

  it('reads a file attachment and wraps it in fence', async () => {
    const p = path.join(tmp, 'a.md');
    await fs.writeFile(p, 'hello world', 'utf8');
    const out = await collectAttachmentContext(
      [{ type: 'file', path: 'a.md', title: 'A' }],
      { groveRoot: tmp, clipsGet: vi.fn() }
    );
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0]).toContain('--- a.md');
    expect(out.blocks[0]).toContain('hello world');
  });

  it('reads a clip via clipsGet helper', async () => {
    const out = await collectAttachmentContext(
      [{ type: 'clip', clipId: 5, url: 'https://x.com', title: 'X' }],
      { groveRoot: tmp, clipsGet: vi.fn().mockResolvedValue({ body: 'clip body', url: 'https://x.com' }) }
    );
    expect(out.blocks[0]).toContain('--- https://x.com');
    expect(out.blocks[0]).toContain('clip body');
  });

  it('returns empty result for empty input', async () => {
    const out = await collectAttachmentContext([], { groveRoot: tmp, clipsGet: vi.fn() });
    expect(out.blocks).toEqual([]);
    expect(out.totalChars).toBe(0);
  });
});
```

- [ ] **Step 3: Run — verify it fails**

```bash
npx vitest run electron/agent/attachments.test.ts
```

- [ ] **Step 4: Implement `electron/agent/attachments.ts`**

```ts
// electron/agent/attachments.ts
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Attachment } from '@shared/agent-types';

export interface CollectContext {
  groveRoot: string;
  clipsGet: (id: number) => Promise<{ body: string; url: string } | null>;
}

export interface CollectResult {
  blocks: string[];
  totalChars: number;
  truncatedCount: number;
  droppedCount: number;
}

const PER_ATTACHMENT_LIMIT = 20000;
const TOTAL_LIMIT = 80000;

function safeJoin(root: string, rel: string): string {
  const abs = resolve(join(root, rel));
  if (!abs.startsWith(resolve(root))) {
    throw new Error('path escapes grove root');
  }
  return abs;
}

function fence(label: string, body: string): string {
  return `--- ${label}\n${body}\n---\n`;
}

export async function collectAttachmentContext(
  attachments: Attachment[],
  ctx: CollectContext
): Promise<CollectResult> {
  const blocks: string[] = [];
  let totalChars = 0;
  let truncatedCount = 0;

  for (const a of attachments) {
    let label = '';
    let body = '';
    try {
      if (a.type === 'file') {
        label = a.path;
        const abs = safeJoin(ctx.groveRoot, a.path);
        body = await fs.readFile(abs, 'utf8');
      } else {
        label = a.url;
        const clip = await ctx.clipsGet(a.clipId);
        if (!clip) throw new Error('clip not found');
        body = clip.body;
      }
      if (body.length > PER_ATTACHMENT_LIMIT) {
        body = body.slice(0, PER_ATTACHMENT_LIMIT) + '\n…(已截断)';
        truncatedCount += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      label = a.type === 'file' ? a.path : a.url;
      body = `[读取失败: ${msg}]`;
    }
    const block = fence(label, body);
    blocks.push(block);
    totalChars += block.length;
  }

  let droppedCount = 0;
  while (totalChars > TOTAL_LIMIT && blocks.length > 0) {
    const dropped = blocks.shift()!;
    totalChars -= dropped.length;
    droppedCount += 1;
  }

  return { blocks, totalChars, truncatedCount, droppedCount };
}
```

- [ ] **Step 5: Run — verify it passes**

```bash
npx vitest run electron/agent/attachments.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add electron/agent/attachments.ts electron/agent/attachments.test.ts
git commit -m "feat(phase-17): collectAttachmentContext helper for file/clip reads"
```

---

<!-- openspec-task: 7.3 -->
### Task 3: Truncation policy — 20k per attachment, 80k total

**Files:**
- Modify: `electron/agent/attachments.test.ts` (already done in Task 2)
- Modify: `electron/agent/attachments.ts` (already done in Task 2)

This task formalises tests for limit policy:

- [ ] **Step 1: Append failing tests for limits**

```ts
describe('collectAttachmentContext — limits', () => {
  it('truncates a single attachment > 20000 chars and adds 已截断', async () => {
    const big = 'x'.repeat(40000);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-'));
    await fs.writeFile(path.join(tmp, 'big.md'), big, 'utf8');
    const out = await collectAttachmentContext(
      [{ type: 'file', path: 'big.md', title: 'B' }],
      { groveRoot: tmp, clipsGet: vi.fn() }
    );
    expect(out.blocks[0].length).toBeLessThan(big.length + 200);
    expect(out.blocks[0]).toContain('已截断');
    expect(out.truncatedCount).toBe(1);
  });

  it('drops oldest blocks once total exceeds 80000 chars', async () => {
    const big = 'y'.repeat(20000);
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'att-'));
    await Promise.all(
      ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((n) => fs.writeFile(path.join(tmp, n), big, 'utf8'))
    );
    const out = await collectAttachmentContext(
      ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'].map((p) => ({ type: 'file' as const, path: p, title: p })),
      { groveRoot: tmp, clipsGet: vi.fn() }
    );
    expect(out.totalChars).toBeLessThanOrEqual(80000);
    expect(out.droppedCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run electron/agent/attachments.test.ts -t "limits"
```

Expected: PASS — already implemented.

- [ ] **Step 3: Wire `collectAttachmentContext` into `runAgent`**

In `electron/agent/loop.ts`, after history is read and before the LLM call:

```ts
import { collectAttachmentContext } from './attachments';
import { getActiveGroveRoot } from '<bootstrap-helper>'; // existing util that returns grove root
import { clipsGet } from '<clip-store-import>';

const collected = attachments.length > 0
  ? await collectAttachmentContext(attachments, {
      groveRoot: getActiveGroveRoot(),
      clipsGet: (id) => clipsGet(id)
    })
  : { blocks: [], totalChars: 0, truncatedCount: 0, droppedCount: 0 };

const messages: ChatMessage[] = [
  ...historyMessages,
  ...(collected.blocks.length > 0
    ? [{
        role: 'user' as const,
        content: '以下是我附加的内容供你参考：\n' + collected.blocks.join('') +
          (collected.droppedCount > 0 ? `\n[已省略 ${collected.droppedCount} 个附件]` : '')
      }]
    : []),
  { role: 'user' as const, content: userText }
];
// CRITICAL: do NOT append the synthesised pre-user message to session_messages.
// Only the final `userText` row is persisted (see existing flow).
```

(Replace `<bootstrap-helper>` with the actual import that yields the active grove root in main process; phase 2 set this up.)

- [ ] **Step 4: Run loop tests**

```bash
npx vitest run electron/agent/loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/agent/loop.ts electron/agent/attachments.test.ts
git commit -m "feat(phase-17): runAgent injects synthesised pre-user message from attachments"
```

---

<!-- openspec-task: 7.4 -->
### Task 4: Read failure → `[读取失败: ...]` block, loop continues

**Files:**
- Modify: `electron/agent/attachments.test.ts` (already in Task 2)
- Modify: `electron/agent/loop.test.ts`

The replacement-on-failure logic landed in Task 2. This task adds an end-to-end test through `runAgent`.

- [ ] **Step 1: Append failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAgent } from './loop';

describe('runAgent — attachment read failure', () => {
  it('non-existent file is replaced with 读取失败 block; loop completes', async () => {
    const writer = vi.fn();
    await runAgent({
      sessionId: 'test-session',
      userText: 'hi',
      attachments: [{ type: 'file', path: 'does-not-exist.md', title: 'X' }],
      streamWriter: writer,
      cancel: { aborted: false }
    } as any);
    // Assert the synthesised pre-user message contained the error marker
    // by inspecting llmClient stub's last messages array (use the same fake the file already uses)
    // ...
  });
});
```

(If the existing tests don't already expose the LLM stub's recorded messages, adapt to capture the prompt sent.)

- [ ] **Step 2: Run tests**

```bash
npx vitest run electron/agent/loop.test.ts -t "read failure"
```

Expected: PASS — `collectAttachmentContext` already turns the read error into a fence block; the loop never throws.

- [ ] **Step 3: Commit**

```bash
git add electron/agent/loop.test.ts
git commit -m "test(phase-17): runAgent — attachment read failure does not break loop"
```

---

<!-- openspec-task: 7.5 -->
### Task 5: `electron/ipc/chat.ts` — `sendUserMessage` passes `attachments` through

**Files:**
- Modify: `electron/ipc/chat.ts`
- Modify: `electron/ipc/chat.test.ts`

- [ ] **Step 1: Read existing handler**

```bash
grep -n "sendUserMessage\|chat:sendUserMessage" electron/ipc/chat.ts
```

Note the current shape — it likely calls `runAgent({ sessionId, userText, ... })`.

- [ ] **Step 2: Write failing test**

Append to `electron/ipc/chat.test.ts`:

```ts
describe('chat IPC — sendUserMessage attachments', () => {
  it('forwards attachments array to runAgent', async () => {
    const runAgentSpy = vi.fn();
    // Inject runAgent stub via the same DI mechanism the existing tests use
    // ...
    await sendUserMessageHandler({
      sessionId: 's1',
      text: 'hi',
      attachments: [{ type: 'file', path: 'a.md', title: 'A' }]
    });
    expect(runAgentSpy).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      userText: 'hi',
      attachments: [{ type: 'file', path: 'a.md', title: 'A' }]
    }));
  });
});
```

- [ ] **Step 3: Modify the handler**

In `electron/ipc/chat.ts`:

```ts
ipcMain.handle('chat:sendUserMessage', async (_e, payload: { sessionId: string; text: string; attachments?: Attachment[] }) => {
  await runAgent({
    sessionId: payload.sessionId,
    userText: payload.text,
    attachments: payload.attachments ?? [],
    streamWriter,
    cancel
  });
  return { ok: true };
});
```

Update the IPC contract in `shared/ipc-contract.ts` if the schema is statically typed (most likely yes — phase 16 added it):

```ts
sendUserMessage: (input: { sessionId: string; text: string; attachments?: Attachment[] }) => { ok: true }
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run electron/ipc/chat.test.ts && npm run typecheck
```

Expected: PASS / 0 errors.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/chat.ts electron/ipc/chat.test.ts shared/ipc-contract.ts
git commit -m "feat(phase-17): chat:sendUserMessage IPC accepts attachments"
```

---

<!-- openspec-task: 8.1 -->
### Task 6: `E_MISSING_PROFILE` banner in Chat top bar

**Files:**
- Create: `src/components/chat/ChatBanner.tsx`
- Modify: `src/pages/Chat.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`
- Modify: `src/pages/Chat.test.tsx`

- [ ] **Step 1: Add i18n keys**

```json
"error": {
  "missingProfile": "请先在设置中配置 AI profile",
  "goToSettings": "前往设置",
  "busy": "当前会话已在生成，请稍候",
  "stepLimit": "助手达到步骤上限，已停止",
  "network": "网络错误，稍后再试",
  "server": "服务端错误，稍后再试",
  "retry": "重试"
}
```

en-US:

```json
"error": {
  "missingProfile": "Please configure an AI profile in Settings",
  "goToSettings": "Go to settings",
  "busy": "This chat is already generating — please wait",
  "stepLimit": "Assistant reached the step limit and stopped",
  "network": "Network error — try again later",
  "server": "Server error — try again later",
  "retry": "Retry"
}
```

- [ ] **Step 2: Write failing test**

Append to `src/pages/Chat.test.tsx`:

```tsx
describe('Chat — missing profile banner', () => {
  it('shows banner when active session has profileId=null AND no default profile', async () => {
    const { useProfilesStore } = await import('@/stores/profiles');
    useProfilesStore.setState({ profiles: [] } as any);
    mockApi.chat.sessions.list = vi.fn().mockResolvedValue([
      { id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }
    ]);
    render(<MemoryRouter><Chat /></MemoryRouter>);
    expect(await screen.findByTestId('chat-banner-missing-profile')).toBeTruthy();
    expect(screen.getByRole('link', { name: /前往设置|Go to settings/i }).getAttribute('href')).toBe('/settings/ai');
  });

  it('hides banner when default profile exists', async () => {
    const { useProfilesStore } = await import('@/stores/profiles');
    useProfilesStore.setState({ profiles: [{ id: 'p1', name: 'P', provider: 'openai', model: 'm', baseUrl: null, secretRef: null, default: true }] } as any);
    render(<MemoryRouter><Chat /></MemoryRouter>);
    await screen.findByTestId('chat-main');
    expect(screen.queryByTestId('chat-banner-missing-profile')).toBeFalsy();
  });
});
```

- [ ] **Step 3: Create `ChatBanner.tsx`**

```tsx
// src/components/chat/ChatBanner.tsx
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useChatStore } from '@/stores/chat';
import { useProfilesStore } from '@/stores/profiles';

export function ChatBanner(): JSX.Element | null {
  const { t } = useTranslation();
  const activeId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const profiles = useProfilesStore((s) => s.profiles);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  if (!activeSession) return null;
  const hasProfile = activeSession.profileId !== null || profiles.some((p) => p.default);
  if (hasProfile) return null;

  return (
    <div data-testid="chat-banner-missing-profile" className="flex items-center gap-2 border-b border-border bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700">
      <AlertCircle size={14} />
      <span>{t('chat.error.missingProfile')}</span>
      <Link to="/settings/ai" className="ml-auto text-primary underline">
        {t('chat.error.goToSettings')}
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Mount above the top bar in `Chat.tsx`**

Inside `<main>` immediately above `<header>`:

```tsx
import { ChatBanner } from '@/components/chat/ChatBanner';

<main data-testid="chat-main" className="flex flex-1 min-w-0 flex-col">
  <ChatBanner />
  <header ...>...</header>
  ...
</main>
```

Also call `useProfilesStore.refresh()` once on mount (already done if Plan 1 added it; if not, add to `Chat`'s effect block).

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/pages/Chat.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ChatBanner.tsx src/pages/Chat.tsx src/pages/Chat.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): E_MISSING_PROFILE banner with settings link"
```

---

<!-- openspec-task: 8.2 -->
### Task 7: `E_BUSY` toast on second send

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `ChatInput.test.tsx`:

```tsx
describe('ChatInput — E_BUSY toast', () => {
  it('shows toast when sendUserMessage rejects with E_BUSY', async () => {
    const toast = vi.fn();
    vi.doMock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
    // re-import ChatInput so the mock applies
    const { ChatInput: Fresh } = await import('./ChatInput');
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, status: 'streaming' } }
    }));
    render(<Fresh />);
    const ta = screen.getByRole('textbox');
    await userEvent.type(ta, 'hi');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringMatching(/已在生成|already generating/i)
    }));
  });
});
```

- [ ] **Step 2: Wire `useToast` into `ChatInput.tsx`**

```tsx
import { useToast } from '@/hooks/use-toast';

const { toast } = useToast();

async function send(): Promise<void> {
  const t = text.trim();
  const atts = slot?.pendingAttachments ?? [];
  if (!t && atts.length === 0) return;
  setText('');
  try {
    await sendUserMessage({ text: t, attachments: atts });
  } catch (err) {
    if ((err as { code?: string }).code === 'E_BUSY') {
      toast({ title: tFn('chat.error.busy') });
    } else {
      throw err;
    }
  }
}
```

(Use `tFn` to avoid name clash with local `t` for `text`. Or rename — pick one.)

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat(phase-17): toast on E_BUSY when sending while streaming"
```

---

<!-- openspec-task: 8.3 -->
### Task 8: `E_STEP_LIMIT` gray tail message

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/MessageList.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `MessageList.test.tsx`:

```tsx
describe('MessageList — error tail', () => {
  it('shows step-limit gray message', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'error', error: 'E_STEP_LIMIT' }
      }
    });
    render(<MessageList />);
    expect(screen.getByText(/步骤上限|step limit/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Add error tail in `MessageList.tsx`**

After the streaming-tail block but before the sentinel:

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();

// inside the messages container:
{slot.status === 'error' && slot.error && (
  <div className="my-2 rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="message-error-tail">
    {t(`chat.error.${normalizeErrorKey(slot.error)}`, slot.error)}
  </div>
)}
```

Helper at module top:

```ts
function normalizeErrorKey(err: string): string {
  switch (err) {
    case 'E_STEP_LIMIT': return 'stepLimit';
    case 'E_NETWORK': return 'network';
    case 'E_SERVER': return 'server';
    default: return err;
  }
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx -t "error tail"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/MessageList.test.tsx
git commit -m "feat(phase-17): gray error tail for E_STEP_LIMIT"
```

---

<!-- openspec-task: 8.4 -->
### Task 9: `E_NETWORK` / `E_SERVER` retry button — re-send last user text + attachments

**Files:**
- Modify: `src/stores/chat.ts` (track `lastUserText` + `lastUserAttachments` per session)
- Modify: `src/stores/chat.test.ts`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/MessageList.test.tsx`

- [ ] **Step 1: Write failing store test**

Append:

```ts
describe('chat store — lastUser tracking', () => {
  it('sendUserMessage stores lastUserText + lastUserAttachments per session', async () => {
    await useChatStore.getState().sendUserMessage({
      text: 'remember me',
      attachments: [{ type: 'file', path: 'a.md', title: 'A' }]
    });
    const slot = useChatStore.getState().bySession.s1!;
    expect(slot.lastUserText).toBe('remember me');
    expect(slot.lastUserAttachments).toEqual([{ type: 'file', path: 'a.md', title: 'A' }]);
  });
});
```

- [ ] **Step 2: Add fields to `SessionState`**

In `src/stores/chat.ts`:

```ts
export interface SessionState {
  // ...existing fields
  lastUserText: string;
  lastUserAttachments: Attachment[];
}
```

In `emptySession`:

```ts
lastUserText: '',
lastUserAttachments: [],
```

In `sendUserMessage`:

```ts
set((s) => ({
  bySession: {
    ...s.bySession,
    [sid]: {
      ...(s.bySession[sid] ?? emptySession()),
      status: 'streaming',
      error: null,
      streamingBuffer: '',
      flushedLength: 0,
      pendingAttachments: [],
      lastUserText: text,
      lastUserAttachments: attachments ?? []
    }
  }
}));
```

- [ ] **Step 3: Run store test**

```bash
npx vitest run src/stores/chat.test.ts -t "lastUser"
```

Expected: PASS.

- [ ] **Step 4: Add retry button in `MessageList.tsx`**

```tsx
const sendUserMessage = useChatStore((s) => s.sendUserMessage);

{slot.status === 'error' && (slot.error === 'E_NETWORK' || slot.error === 'E_SERVER') && (
  <div className="my-2 flex items-center gap-2 rounded bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
    <span>{t(`chat.error.${normalizeErrorKey(slot.error)}`)}</span>
    <button
      type="button"
      data-testid="error-retry"
      onClick={() => void sendUserMessage({ text: slot.lastUserText, attachments: slot.lastUserAttachments })}
      className="rounded border border-border px-2 py-0.5 hover:bg-muted"
    >
      {t('chat.error.retry')}
    </button>
  </div>
)}
```

- [ ] **Step 5: Append failing UI test**

```tsx
describe('MessageList — retry button', () => {
  it('clicking retry re-sends last user message', async () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'error', error: 'E_NETWORK', lastUserText: 'try again', lastUserAttachments: [] }
      }
    });
    render(<MessageList />);
    await userEvent.click(screen.getByTestId('error-retry'));
    expect(mockApi.chat.sendUserMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'try again' }));
  });
});
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx src/stores/chat.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts src/components/chat/MessageList.tsx src/components/chat/MessageList.test.tsx
git commit -m "feat(phase-17): network/server error tail with retry button"
```

---

<!-- openspec-task: 9.1 -->
### Task 10: `Cmd/Ctrl+N` — new session on /chat

**Files:**
- Modify: `src/hooks/useGlobalHotkeys.ts`
- Modify: `src/hooks/useGlobalHotkeys.test.ts`

- [ ] **Step 1: Read existing hotkey hook**

```bash
cat src/hooks/useGlobalHotkeys.ts
```

Note the existing dispatch pattern (likely `keydown` listener with platform `meta`/`ctrl` detection).

- [ ] **Step 2: Write failing test**

Append to `useGlobalHotkeys.test.ts`:

```ts
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useGlobalHotkeys } from './useGlobalHotkeys';
import { useChatStore } from '@/stores/chat';

const mockApi = { chat: { sessions: { list: vi.fn(), messages: vi.fn(), create: vi.fn().mockResolvedValue({ id: 'snew', title: '', createdAt: 1, updatedAt: 1, profileId: null }) }, onChatStream: vi.fn(() => () => {}) } };

it('Cmd+N on /chat creates a new session', async () => {
  // @ts-expect-error
  globalThis.window.api = mockApi;
  history.pushState({}, '', '/chat');
  renderHook(() => useGlobalHotkeys(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat']}>{children}</MemoryRouter>
  });
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true }));
  await new Promise((r) => setTimeout(r, 0));
  expect(mockApi.chat.sessions.create).toHaveBeenCalled();
});
```

- [ ] **Step 3: Add to `useGlobalHotkeys.ts`**

```ts
import { useLocation } from 'react-router-dom';
import { useChatStore } from '@/stores/chat';

export function useGlobalHotkeys(): void {
  const location = useLocation();
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (location.pathname.startsWith('/chat')) {
        if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          void useChatStore.getState().createSession();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname]);
  // ...existing hotkeys
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useGlobalHotkeys.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.ts
git commit -m "feat(phase-17): Cmd/Ctrl+N creates new chat session"
```

---

<!-- openspec-task: 9.2 -->
### Task 11: `Cmd/Ctrl+K` — focus + clear ChatInput

**Files:**
- Modify: `src/hooks/useGlobalHotkeys.ts`
- Modify: `src/components/chat/ChatInput.tsx` (expose focus via store flag)
- Modify: `src/hooks/useGlobalHotkeys.test.ts`

- [ ] **Step 1: Add `focusInputBump` counter to chat store**

In `src/stores/chat.ts`:

```ts
interface ChatStore {
  // ...
  focusInputBump: number;
  bumpFocusInput: () => void;
}

// in store:
focusInputBump: 0,
bumpFocusInput() {
  set((s) => ({ focusInputBump: s.focusInputBump + 1 }));
},
```

- [ ] **Step 2: ChatInput reacts to bump**

In `ChatInput.tsx`:

```tsx
const focusBump = useChatStore((s) => s.focusInputBump);
useEffect(() => {
  if (focusBump > 0) {
    setText('');
    taRef.current?.focus();
  }
}, [focusBump]);
```

- [ ] **Step 3: Hotkey wiring**

In `useGlobalHotkeys.ts` add:

```ts
if (e.key === 'k' || e.key === 'K') {
  e.preventDefault();
  useChatStore.getState().bumpFocusInput();
}
```

- [ ] **Step 4: Test**

Append to `useGlobalHotkeys.test.ts`:

```ts
it('Cmd+K on /chat increments focusInputBump', () => {
  history.pushState({}, '', '/chat');
  renderHook(() => useGlobalHotkeys(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat']}>{children}</MemoryRouter> });
  const before = useChatStore.getState().focusInputBump;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  expect(useChatStore.getState().focusInputBump).toBe(before + 1);
});
```

Run: `npx vitest run src/hooks/useGlobalHotkeys.test.ts` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/chat.ts src/components/chat/ChatInput.tsx src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.ts
git commit -m "feat(phase-17): Cmd/Ctrl+K focuses + clears chat input"
```

---

<!-- openspec-task: 9.3 -->
### Task 12: `Cmd/Ctrl+/` — shortcuts dialog

**Files:**
- Create: `src/components/chat/ShortcutsDialog.tsx`
- Modify: `src/pages/Chat.tsx` (mount + hook to top bar `?`)
- Modify: `src/hooks/useGlobalHotkeys.ts`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`

- [ ] **Step 1: Add i18n keys**

```json
"shortcuts": {
  "title": "快捷键",
  "send": "发送：Cmd/Ctrl + Enter",
  "newSession": "新对话：Cmd/Ctrl + N",
  "focusInput": "聚焦输入：Cmd/Ctrl + K",
  "showHelp": "查看帮助：Cmd/Ctrl + /",
  "stopStream": "停止生成：Esc"
}
```

en-US parity (replace strings).

- [ ] **Step 2: Add `showShortcutsBump` to chat store**

```ts
showShortcutsBump: 0,
bumpShowShortcuts() { set((s) => ({ showShortcutsBump: s.showShortcutsBump + 1 })); },
```

- [ ] **Step 3: Hotkey wiring**

In `useGlobalHotkeys.ts`:

```ts
if (e.key === '/') {
  e.preventDefault();
  useChatStore.getState().bumpShowShortcuts();
}
```

- [ ] **Step 4: Create `ShortcutsDialog.tsx`**

```tsx
// src/components/chat/ShortcutsDialog.tsx
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chat';

export function ShortcutsDialog(): JSX.Element {
  const { t } = useTranslation();
  const bump = useChatStore((s) => s.showShortcutsBump);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (bump > 0) setOpen(true); }, [bump]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/3 z-50 w-[400px] -translate-x-1/2 rounded border border-border bg-popover p-4 text-sm shadow">
          <Dialog.Title className="text-base font-medium">{t('chat.shortcuts.title')}</Dialog.Title>
          <ul className="mt-3 space-y-1 text-xs">
            <li>{t('chat.shortcuts.send')}</li>
            <li>{t('chat.shortcuts.newSession')}</li>
            <li>{t('chat.shortcuts.focusInput')}</li>
            <li>{t('chat.shortcuts.showHelp')}</li>
            <li>{t('chat.shortcuts.stopStream')}</li>
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Mount in `Chat.tsx`** (e.g. inside `<main>`):

```tsx
import { ShortcutsDialog } from '@/components/chat/ShortcutsDialog';

// also wire the existing ? button:
<button onClick={() => useChatStore.getState().bumpShowShortcuts()} ... >
  <HelpCircle ... />
</button>

// before closing main:
<ShortcutsDialog />
```

- [ ] **Step 6: Test**

Append to `src/hooks/useGlobalHotkeys.test.ts`:

```ts
it('Cmd+/ bumps showShortcuts counter', () => {
  history.pushState({}, '', '/chat');
  renderHook(() => useGlobalHotkeys(), { wrapper: ({ children }) => <MemoryRouter initialEntries={['/chat']}>{children}</MemoryRouter> });
  const before = useChatStore.getState().showShortcutsBump;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true }));
  expect(useChatStore.getState().showShortcutsBump).toBe(before + 1);
});
```

Run + expect PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ShortcutsDialog.tsx src/pages/Chat.tsx src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.ts src/stores/chat.ts src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): Cmd/Ctrl+/ opens shortcuts dialog (also via ? icon)"
```

---

<!-- openspec-task: 9.4 -->
### Task 13: SessionList ↑↓ navigation, Enter activate, Delete confirm

**Files:**
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/components/chat/SessionList.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `SessionList.test.tsx`:

```tsx
describe('SessionList — keyboard navigation', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: 'A', createdAt: 1, updatedAt: 3, profileId: null },
        { id: 's2', title: 'B', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's3', title: 'C', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {}
    });
  });

  it('ArrowDown moves selection to next', async () => {
    render(<SessionList />);
    const ul = screen.getByRole('list', { name: /sessions/i });
    ul.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(useChatStore.getState().activeSessionId).toBe('s2');
  });

  it('ArrowUp at top stays at first', async () => {
    render(<SessionList />);
    screen.getByRole('list', { name: /sessions/i }).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(useChatStore.getState().activeSessionId).toBe('s1');
  });

  it('Delete key triggers confirmation dialog', async () => {
    render(<SessionList />);
    screen.getByRole('list', { name: /sessions/i }).focus();
    await userEvent.keyboard('{Delete}');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Modify `SessionList.tsx`**

Make the `<ul>` focusable and handle keys:

```tsx
function onListKeyDown(e: React.KeyboardEvent<HTMLUListElement>): void {
  const sorted = filtered;
  const idx = sorted.findIndex((s) => s.id === activeId);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = sorted[Math.min(sorted.length - 1, idx + 1)];
    if (next) void selectSession(next.id);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = sorted[Math.max(0, idx - 1)];
    if (prev) void selectSession(prev.id);
  } else if (e.key === 'Enter') {
    if (activeId) void selectSession(activeId);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (activeId) confirmDelete(activeId);
  }
}

// on the <ul>:
<ul
  role="list"
  aria-label="sessions"
  tabIndex={0}
  onKeyDown={onListKeyDown}
  className="flex-1 overflow-y-auto outline-none focus:ring-1 focus:ring-primary"
>
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/chat/SessionList.test.tsx -t "keyboard navigation"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx
git commit -m "feat(phase-17): SessionList arrow keys / Enter / Delete navigation"
```

---

## Plan 4 verification

After all 13 tasks:

- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Manual: `npm run dev`
  - Send a message — confirm streaming.
  - Pull network cable / kill provider → see retry tail with button.
  - Cmd/Ctrl+N → new session, Cmd/Ctrl+K → input focus + clear, Cmd/Ctrl+/ → shortcuts dialog.
  - Click into SessionList, press ↓↑ to navigate, Delete to open confirm.
  - With no AI profile configured: open `/chat` → see banner with link to `/settings/ai`.

If any step fails, fix before declaring Plan 4 complete. Plan 5 (i18n + acceptance) is the final plan in the phase.
