# Phase 17 — Chat UI & Sessions: Plan 2 (SessionList + MessageList)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-17-chat-ui-sessions`
> **Task range:** OpenSpec tasks `3.1`–`4.7` (13 tasks)
> **Plan order:** 2 of 5. Builds on Plan 1 (`tasks-1.1-2.4`). Followed by Plan 3 (`tasks-5.1-6.7`), Plan 4 (`tasks-7.1-9.4`), Plan 5 (`tasks-10.1-11.18`).
> **Status:** Not started
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-17-chat-ui-sessions`

---

## Goal

Land the two interactive content panes: **SessionList** (left, 300px, with new / search / rename / delete / status badges / icon-only collapse) and **MessageList** (middle main, role-aware rendering with rAF-batched streaming, markdown switch on done, auto-scroll w/ "new ↓" button, hover ops, external-link interception).

## Architecture

- **`SessionList.tsx`** subscribes to `useChatStore`'s `sessions`, `activeSessionId`, and per-session `status`/`pendingApprovals`/`error`. It renders a virtual-friendly flat list (no virtualization yet — accept 100+ sessions; design D5 says reconsider later). Inline rename uses local component state; commit / cancel via Enter / Esc / blur. Right-click uses a Radix `DropdownMenu` triggered by a `contextmenu` handler.
- **`MessageList.tsx`** is the visual heart. It subscribes only to `bySession[activeId]`. Children: `UserBubble` / `AssistantText` / `ToolCallCard` / `ToolResultCard`. Streaming uses a `useStreamingText` hook that maintains an internal `<pre>` DOM node ref and appends text via `appendChild(document.createTextNode(...))` on each rAF tick — no React re-render per token. When the `done` event lands, the buffer flushes and the assistant message is committed to `messages`; we then render that final message with `react-markdown`.
- **External link interception** lives in the `react-markdown` `components` map: `a` → custom anchor that calls `ipc.shell.openExternal(href)` (phase 1) and `preventDefault`s.
- **Auto-scroll** uses an IntersectionObserver-style approach: a sentinel `<div>` after the last message; `useEffect` measures `scrollTop` vs `scrollHeight - clientHeight`. If user scrolled up > 80px, set a `stuckUp` flag and stop auto-scrolling; show a floating "↓ 新消息" button that smooth-scrolls to the sentinel.
- **Message hover ops bar** lives outside the message body (absolute-positioned per row) — copy / retry / quote.
- **No new IPC surfaces this plan** — only consume what phases 13/16 already exposed: `ipc.chat.sessions.*`, `ipc.shell.openExternal`, `ipc.clipboard.write`.

## Tech Stack

- `react-markdown@^9` + `remark-gfm@^4` — assistant markdown rendering (NEW deps; see Task 1.5 below for install)
- `date-fns@^4` — relative time (already a dep)
- `@radix-ui/react-dropdown-menu` — right-click menu (already a dep)
- `lucide-react` — icons (`Plus`, `Search`, `X`, `Copy`, `RotateCcw`, `Quote`, `ArrowDown`)
- `@testing-library/react` + `@testing-library/user-event` — component tests
- Tailwind v4 + existing tokens

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `package.json`, `package-lock.json` | Modify (add `react-markdown`, `remark-gfm`) | 4.2 |
| `src/components/chat/SessionList.tsx` | Create | 3.1 |
| `src/components/chat/SessionList.test.tsx` | Create | 3.1, 3.2, 3.3, 3.4, 3.5 |
| `src/components/chat/SessionListRow.tsx` | Create | 3.2 |
| `src/components/chat/SessionContextMenu.tsx` | Create | 3.3 |
| `src/components/chat/DeleteSessionDialog.tsx` | Create | 3.4 |
| `src/components/chat/SessionStatusBadge.tsx` | Create | 3.5 |
| `src/components/chat/MessageList.tsx` | Create | 4.1 |
| `src/components/chat/MessageList.test.tsx` | Create | 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 |
| `src/components/chat/UserBubble.tsx` | Create | 4.2 |
| `src/components/chat/AssistantMarkdown.tsx` | Create | 4.2, 4.4, 4.7 |
| `src/components/chat/ToolCallCard.tsx` | Create | 4.2 |
| `src/components/chat/ToolResultCard.tsx` | Create | 4.2 |
| `src/components/chat/MessageOps.tsx` | Create | 4.6 |
| `src/hooks/useStreamingText.ts` | Create | 4.3 |
| `src/hooks/useStreamingText.test.ts` | Create | 4.3 |
| `src/pages/Chat.tsx` | Modify (mount SessionList + MessageList) | all |
| `src/i18n/locales/zh-CN.json`, `en-US.json` | Modify (`session.*`, `messages.*` keys) | all |

## Pre-flight

- Plan 1 (`tasks-1.1-2.4`) must be merged. Confirm `src/stores/chat.ts` exports `useChatStore`, `installChatStreamSubscriber`, and that `Chat.tsx` already renders three regions with placeholders.
- Confirm `ipc.shell.openExternal` from phase 1 still exists: `grep -n "openExternal" shared/ipc-contract.ts`.
- Confirm `ipc.clipboard.write` is available: `grep -n "clipboard" shared/ipc-contract.ts`. If absent, fall back to `navigator.clipboard.writeText` directly inside the renderer (works in Electron when context isolation allows; the existing app uses it elsewhere — search `navigator.clipboard` first).

---

## Tasks

<!-- openspec-task: 3.1 -->
### Task 1: `SessionList` shell — top "+" button + search input + scrollable list

**Files:**
- Create: `src/components/chat/SessionList.tsx`
- Create: `src/components/chat/SessionList.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en-US.json`
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 1: Add `chat.session.*` and `chat.search.*` i18n keys**

`src/i18n/locales/zh-CN.json` — extend `chat`:

```json
  "chat": {
    ...,
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
    }
  },
```

`src/i18n/locales/en-US.json` — same keys (English):

```json
  "chat": {
    ...,
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
    }
  },
```

- [ ] **Step 2: Write the failing shell test**

Create `src/components/chat/SessionList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@/i18n';
import { SessionList } from './SessionList';
import { useChatStore } from '@/stores/chat';

const mockApi = {
  chat: {
    sessions: {
      list: vi.fn().mockResolvedValue([]),
      messages: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 's3', title: '未命名对话', createdAt: 9, updatedAt: 9, profileId: null }),
      rename: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true })
    },
    onChatStream: vi.fn(() => () => {})
  }
};

describe('SessionList — shell', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init(); });
  beforeEach(() => {
    // @ts-expect-error
    globalThis.window.api = mockApi;
    useChatStore.setState({
      sessions: [
        { id: 's1', title: '旅行计划', createdAt: 1, updatedAt: 100, profileId: null },
        { id: 's2', title: '阅读笔记', createdAt: 2, updatedAt: 50, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {}
    });
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders the "+" new button', () => {
    render(<SessionList />);
    expect(screen.getByRole('button', { name: /新对话|new chat/i })).toBeTruthy();
  });

  it('clicking + creates a session via store', async () => {
    render(<SessionList />);
    await userEvent.click(screen.getByRole('button', { name: /新对话|new chat/i }));
    expect(mockApi.chat.sessions.create).toHaveBeenCalledOnce();
  });

  it('renders all sessions in updated_at DESC order', () => {
    render(<SessionList />);
    const rows = screen.getAllByTestId('session-row');
    expect(rows[0].textContent).toContain('旅行计划');
    expect(rows[1].textContent).toContain('阅读笔记');
  });

  it('search filters sessions by title', async () => {
    render(<SessionList />);
    await userEvent.type(screen.getByRole('searchbox'), '阅读');
    const rows = screen.getAllByTestId('session-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('阅读笔记');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/components/chat/SessionList.tsx`**

```tsx
// src/components/chat/SessionList.tsx
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { useChatStore } from '@/stores/chat';

export function SessionList(): JSX.Element {
  const { t } = useTranslation();
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);
  const [q, setQ] = useState<string>('');

  const filtered = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q.trim()) return sorted;
    const needle = q.toLowerCase();
    return sorted.filter((s) => s.title.toLowerCase().includes(needle));
  }, [sessions, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          type="button"
          aria-label={t('chat.session.newAria')}
          onClick={() => void createSession()}
          className="rounded p-1 hover:bg-muted"
        >
          <Plus size={16} />
        </button>
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            role="searchbox"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chat.session.searchPlaceholder')}
            className="w-full rounded border border-border bg-background py-1 pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto" role="list" aria-label="sessions">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">{t('chat.session.noResults')}</li>
        ) : (
          filtered.map((s) => (
            <li
              key={s.id}
              data-testid="session-row"
              role="listitem"
              onClick={() => void selectSession(s.id)}
              className={`cursor-pointer truncate px-3 py-2 text-sm hover:bg-muted ${
                s.id === activeId ? 'border-l-[3px] border-primary bg-accent' : ''
              }`}
            >
              {s.title}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: PASS — all four tests green.

- [ ] **Step 6: Mount `SessionList` in `Chat.tsx`**

Modify `src/pages/Chat.tsx`. Replace the placeholder content of the left `<aside>`:

```tsx
import { SessionList } from '@/components/chat/SessionList';

// ...
<aside
  data-testid="chat-session-list"
  data-collapsed={collapsed ? 'true' : 'false'}
  style={{ width: collapsed ? 48 : 300 }}
  className="shrink-0 border-r border-border bg-muted/20 transition-[width] duration-150"
>
  {!collapsed && <SessionList />}
</aside>
```

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx src/pages/Chat.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): SessionList shell with new/search/list"
```

---

<!-- openspec-task: 3.2 -->
### Task 2: Row rendering — title truncation, relative time, hover delete, active accent

**Files:**
- Create: `src/components/chat/SessionListRow.tsx`
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/components/chat/SessionList.test.tsx`

- [ ] **Step 1: Write failing tests for row visuals**

Append to `src/components/chat/SessionList.test.tsx`:

```tsx
import { formatDistanceToNowStrict } from 'date-fns';

describe('SessionList — row visuals', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: '一段非常非常非常非常长的会话标题不能换行只能截断', createdAt: 1, updatedAt: Date.now() - 60_000, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: {}
    });
  });

  it('shows relative time', () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    expect(row.textContent).toMatch(/分钟|min|秒|sec/);
  });

  it('hovering row reveals a delete button', async () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    expect(row.querySelector('[data-testid="row-delete"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="row-delete"]')?.className).toContain('opacity-0');
  });

  it('active row gets the 3px primary left bar', () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    expect(row.className).toContain('border-l-[3px]');
    expect(row.className).toContain('border-primary');
  });

  it('title truncates with single line', () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    const title = row.querySelector('[data-testid="row-title"]');
    expect(title?.className).toContain('truncate');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/chat/SessionList.test.tsx -t "row visuals"
```

Expected: FAIL — `row-title` and `row-delete` testids missing.

- [ ] **Step 3: Create `src/components/chat/SessionListRow.tsx`**

```tsx
// src/components/chat/SessionListRow.tsx
import type { JSX } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Trash2 } from 'lucide-react';
import type { ChatSession } from '@/stores/chat';

interface Props {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  rightBadge?: React.ReactNode;
}

export function SessionListRow({ session, active, onSelect, onDelete, onContextMenu, rightBadge }: Props): JSX.Element {
  const rel = formatDistanceToNowStrict(session.updatedAt, { addSuffix: false });
  return (
    <li
      data-testid="session-row"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
        active ? 'border-l-[3px] border-primary bg-accent' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div data-testid="row-title" className="truncate">{session.title}</div>
        <div className="text-[10px] text-muted-foreground">{rel}</div>
      </div>
      {rightBadge}
      <button
        type="button"
        data-testid="row-delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="delete"
        className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}
```

- [ ] **Step 4: Use `SessionListRow` in `SessionList.tsx`**

Modify `src/components/chat/SessionList.tsx`. Replace the inline `<li>` with `SessionListRow`:

```tsx
import { SessionListRow } from './SessionListRow';

// ...inside ul:
{filtered.map((s) => (
  <SessionListRow
    key={s.id}
    session={s}
    active={s.id === activeId}
    onSelect={() => void selectSession(s.id)}
    onDelete={() => void confirmDelete(s.id)}
    onContextMenu={(e) => { e.preventDefault(); /* hooked in Task 3 */ }}
  />
))}
```

Add `confirmDelete` placeholder near top of component (will be wired to dialog in Task 4):

```tsx
const deleteSession = useChatStore((s) => s.deleteSession);
function confirmDelete(id: string): void {
  if (window.confirm(t('chat.session.confirmDeleteBody'))) {
    void deleteSession(id);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: PASS — all row-visual tests green; previous tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/SessionListRow.tsx src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx
git commit -m "feat(phase-17): SessionListRow with title/time/active accent/hover delete"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: Inline rename + right-click menu (rename / delete / copy id)

**Files:**
- Modify: `src/components/chat/SessionListRow.tsx`
- Create: `src/components/chat/SessionContextMenu.tsx`
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/components/chat/SessionList.test.tsx`

- [ ] **Step 1: Write failing tests for rename + context menu**

Append to `src/components/chat/SessionList.test.tsx`:

```tsx
describe('SessionList — rename + context menu', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: '原标题', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {}
    });
  });

  it('double-click title turns it into an editable input', async () => {
    render(<SessionList />);
    const title = screen.getByTestId('row-title');
    await userEvent.dblClick(title);
    const input = screen.getByDisplayValue('原标题');
    expect(input.tagName).toBe('INPUT');
  });

  it('Enter commits rename via store action', async () => {
    render(<SessionList />);
    await userEvent.dblClick(screen.getByTestId('row-title'));
    const input = screen.getByDisplayValue('原标题');
    await userEvent.clear(input);
    await userEvent.type(input, '新标题{Enter}');
    expect(mockApi.chat.sessions.rename).toHaveBeenCalledWith('s1', '新标题');
  });

  it('Esc cancels rename without IPC call', async () => {
    render(<SessionList />);
    await userEvent.dblClick(screen.getByTestId('row-title'));
    const input = screen.getByDisplayValue('原标题');
    await userEvent.type(input, 'X{Escape}');
    expect(mockApi.chat.sessions.rename).not.toHaveBeenCalled();
  });

  it('right-click opens context menu with rename / delete / copy id', async () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    await userEvent.pointer({ keys: '[MouseRight>]', target: row });
    expect(screen.getByRole('menuitem', { name: /重命名|rename/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /删除|delete/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /session id/i })).toBeTruthy();
  });

  it('clicking "复制 session id" writes id to clipboard', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<SessionList />);
    await userEvent.pointer({ keys: '[MouseRight>]', target: screen.getByTestId('session-row') });
    await userEvent.click(screen.getByRole('menuitem', { name: /session id/i }));
    expect(writeText).toHaveBeenCalledWith('s1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/chat/SessionList.test.tsx -t "rename"
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/chat/SessionContextMenu.tsx`**

```tsx
// src/components/chat/SessionContextMenu.tsx
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyId: () => void;
}

export function SessionContextMenu({ x, y, onClose, onRename, onDelete, onCopyId }: Props): JSX.Element {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded border border-border bg-popover p-1 text-sm shadow"
    >
      <button role="menuitem" onClick={() => { onRename(); onClose(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.rename')}
      </button>
      <button role="menuitem" onClick={() => { onDelete(); onClose(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.delete')}
      </button>
      <button role="menuitem" onClick={() => { onCopyId(); onClose(); }} className="block w-full rounded px-2 py-1 text-left hover:bg-muted">
        {t('chat.session.copyId')}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Modify `SessionListRow.tsx` to support inline rename**

Replace the existing component with:

```tsx
import { useState, useRef, useEffect } from 'react';

interface Props {
  session: ChatSession;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onStartRename: () => void;
  onCommitRename: (newTitle: string) => void;
  onCancelRename: () => void;
  rightBadge?: React.ReactNode;
}

export function SessionListRow({ session, active, editing, onSelect, onDelete, onContextMenu, onStartRename, onCommitRename, onCancelRename, rightBadge }: Props): JSX.Element {
  const rel = formatDistanceToNowStrict(session.updatedAt, { addSuffix: false });
  const [draft, setDraft] = useState<string>(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setDraft(session.title); inputRef.current?.focus(); inputRef.current?.select(); } }, [editing, session.title]);

  return (
    <li
      data-testid="session-row"
      onClick={editing ? undefined : onSelect}
      onContextMenu={onContextMenu}
      className={`group relative flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted ${
        active ? 'border-l-[3px] border-primary bg-accent' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onCommitRename(draft.trim() || session.title); }
              else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
            }}
            onBlur={() => onCancelRename()}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-background px-1 outline-none ring-1 ring-primary"
          />
        ) : (
          <div data-testid="row-title" onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }} className="truncate">
            {session.title}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground">{rel}</div>
      </div>
      {rightBadge}
      <button
        type="button"
        data-testid="row-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="delete"
        className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}
```

- [ ] **Step 5: Wire context menu + rename state into `SessionList.tsx`**

Modify `src/components/chat/SessionList.tsx` — add state and helper:

```tsx
import { SessionContextMenu } from './SessionContextMenu';

// inside SessionList component:
const [editingId, setEditingId] = useState<string | null>(null);
const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
const renameSession = useChatStore((s) => s.renameSession);

// ...in <ul>:
{filtered.map((s) => (
  <SessionListRow
    key={s.id}
    session={s}
    active={s.id === activeId}
    editing={editingId === s.id}
    onSelect={() => void selectSession(s.id)}
    onDelete={() => confirmDelete(s.id)}
    onContextMenu={(e) => { e.preventDefault(); setMenu({ id: s.id, x: e.clientX, y: e.clientY }); }}
    onStartRename={() => setEditingId(s.id)}
    onCommitRename={(title) => { void renameSession(s.id, title); setEditingId(null); }}
    onCancelRename={() => setEditingId(null)}
  />
))}

// at the end of component before closing div:
{menu && (
  <SessionContextMenu
    x={menu.x}
    y={menu.y}
    onClose={() => setMenu(null)}
    onRename={() => setEditingId(menu.id)}
    onDelete={() => confirmDelete(menu.id)}
    onCopyId={() => { void navigator.clipboard.writeText(menu.id); }}
  />
)}
```

- [ ] **Step 6: Run all SessionList tests**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: PASS — rename + context menu tests green; existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/SessionListRow.tsx src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx src/components/chat/SessionContextMenu.tsx
git commit -m "feat(phase-17): inline rename + right-click context menu"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: Replace `window.confirm` with a real delete confirmation dialog

**Files:**
- Create: `src/components/chat/DeleteSessionDialog.tsx`
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/components/chat/SessionList.test.tsx`

- [ ] **Step 1: Write failing tests for the dialog**

Append to `src/components/chat/SessionList.test.tsx`:

```tsx
describe('SessionList — delete dialog', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {}
    });
  });

  it('clicking delete opens a Radix dialog, not native confirm', async () => {
    render(<SessionList />);
    const row = screen.getByTestId('session-row');
    await userEvent.hover(row);
    await userEvent.click(screen.getByTestId('row-delete'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/删除会话|delete chat/i)).toBeTruthy();
  });

  it('confirm button triggers delete IPC', async () => {
    render(<SessionList />);
    await userEvent.click(screen.getByTestId('row-delete'));
    await userEvent.click(screen.getByRole('button', { name: /删除$|^delete$/i }));
    expect(mockApi.chat.sessions.delete).toHaveBeenCalledWith('s1');
  });

  it('cancel button closes dialog without deleting', async () => {
    render(<SessionList />);
    await userEvent.click(screen.getByTestId('row-delete'));
    await userEvent.click(screen.getByRole('button', { name: /取消|cancel/i }));
    expect(mockApi.chat.sessions.delete).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/chat/SessionList.test.tsx -t "delete dialog"
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/chat/DeleteSessionDialog.tsx`**

```tsx
// src/components/chat/DeleteSessionDialog.tsx
import type { JSX } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteSessionDialog({ open, onConfirm, onCancel }: Props): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/40 backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          className="fixed left-1/2 top-1/3 z-50 w-[360px] -translate-x-1/2 rounded border border-border bg-popover p-4 text-sm shadow"
        >
          <Dialog.Title className="text-base font-medium">{t('chat.session.confirmDeleteTitle')}</Dialog.Title>
          <Dialog.Description className="mt-2 text-muted-foreground">{t('chat.session.confirmDeleteBody')}</Dialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded border border-border px-3 py-1 hover:bg-muted">
              {t('chat.session.confirmDeleteCancel')}
            </button>
            <button type="button" onClick={onConfirm} className="rounded bg-destructive px-3 py-1 text-destructive-foreground hover:opacity-90">
              {t('chat.session.confirmDeleteOk')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Use the dialog in `SessionList.tsx`**

Replace the `confirmDelete` helper plus add dialog state:

```tsx
const [pendingDelete, setPendingDelete] = useState<string | null>(null);
function confirmDelete(id: string): void { setPendingDelete(id); }
function actuallyDelete(): void {
  if (pendingDelete) void deleteSession(pendingDelete);
  setPendingDelete(null);
}

// at the end (before closing wrapper div):
<DeleteSessionDialog open={pendingDelete !== null} onConfirm={actuallyDelete} onCancel={() => setPendingDelete(null)} />
```

Add import:

```tsx
import { DeleteSessionDialog } from './DeleteSessionDialog';
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: PASS — delete-dialog tests green.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/DeleteSessionDialog.tsx src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx
git commit -m "feat(phase-17): delete session confirmation dialog"
```

---

<!-- openspec-task: 3.5 -->
### Task 5: Status badges — streaming pulse / pending-approval red dot / error icon

**Files:**
- Create: `src/components/chat/SessionStatusBadge.tsx`
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/components/chat/SessionList.test.tsx`

- [ ] **Step 1: Write failing tests for badges**

Append to `src/components/chat/SessionList.test.tsx`:

```tsx
describe('SessionList — status badges', () => {
  it('streaming session shows pulsing primary dot', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null } }
    });
    render(<SessionList />);
    expect(screen.getByTestId('badge-streaming')).toBeTruthy();
  });

  it('non-active session with pending approval shows red dot', () => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: 'A', createdAt: 1, updatedAt: 2, profileId: null },
        { id: 's2', title: 'B', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: { s2: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [{ callId: 'c', toolName: 'x', args: {}, reason: '', receivedAt: 1 }], pendingAttachments: [], pendingPromptText: '', status: 'awaiting-approval', error: null } }
    });
    render(<SessionList />);
    const rows = screen.getAllByTestId('session-row');
    expect(rows[1].querySelector('[data-testid="badge-approval"]')).toBeTruthy();
  });

  it('error session shows yellow exclamation icon', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'error', error: 'E_NETWORK' } }
    });
    render(<SessionList />);
    expect(screen.getByTestId('badge-error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/components/chat/SessionList.test.tsx -t "status badges"
```

Expected: FAIL.

- [ ] **Step 3: Create `src/components/chat/SessionStatusBadge.tsx`**

```tsx
// src/components/chat/SessionStatusBadge.tsx
import type { JSX } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { SessionState } from '@/stores/chat';

interface Props { slot: SessionState | undefined }

export function SessionStatusBadge({ slot }: Props): JSX.Element | null {
  if (!slot) return null;
  if (slot.status === 'streaming') {
    return <span data-testid="badge-streaming" className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />;
  }
  if (slot.pendingApprovals.length > 0) {
    return <span data-testid="badge-approval" className="inline-block h-2 w-2 rounded-full bg-destructive" />;
  }
  if (slot.status === 'error') {
    return <AlertTriangle data-testid="badge-error" size={12} className="text-yellow-500" />;
  }
  return null;
}
```

- [ ] **Step 4: Render the badge in `SessionList.tsx`**

Modify the row mapping:

```tsx
import { SessionStatusBadge } from './SessionStatusBadge';
const bySession = useChatStore((s) => s.bySession);

// ...in <SessionListRow ... />:
rightBadge={<SessionStatusBadge slot={bySession[s.id]} />}
```

- [ ] **Step 5: Run all SessionList tests**

```bash
npx vitest run src/components/chat/SessionList.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/SessionStatusBadge.tsx src/components/chat/SessionList.tsx src/components/chat/SessionList.test.tsx
git commit -m "feat(phase-17): SessionList status badges (streaming/approval/error)"
```

---

<!-- openspec-task: 3.6 -->
### Task 6: Icon-only collapsed mode (48px)

**Files:**
- Modify: `src/components/chat/SessionList.tsx`
- Modify: `src/pages/Chat.tsx`
- Modify: `src/pages/Chat.test.tsx`

- [ ] **Step 1: Write failing test for collapsed list**

Append to `src/pages/Chat.test.tsx`:

```tsx
describe('SessionList collapsed mode', () => {
  it('renders icon-only rows below 960px', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    window.dispatchEvent(new Event('resize'));
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'foo', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {}
    });
    render(<MemoryRouter><Chat /></MemoryRouter>);
    const collapsed = await screen.findByTestId('chat-session-list');
    expect(collapsed.getAttribute('data-collapsed')).toBe('true');
    expect(screen.queryByTestId('row-title')).toBeFalsy();
    expect(screen.getByTestId('session-icon')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
npx vitest run src/pages/Chat.test.tsx -t "collapsed mode"
```

- [ ] **Step 3: Add a `compact` prop to `SessionList`**

Modify `SessionList.tsx`:

```tsx
interface Props { compact?: boolean }

export function SessionList({ compact = false }: Props): JSX.Element {
  // ...
  return (
    <div className="flex h-full flex-col">
      {compact ? (
        <ul className="flex-1 overflow-y-auto py-2" role="list">
          {filtered.map((s) => (
            <li
              key={s.id}
              data-testid="session-icon"
              role="listitem"
              onClick={() => void selectSession(s.id)}
              title={s.title}
              className={`mx-1 flex h-8 cursor-pointer items-center justify-center rounded text-xs hover:bg-muted ${
                s.id === activeId ? 'border-l-[3px] border-primary bg-accent' : ''
              }`}
            >
              {s.title.slice(0, 1)}
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* existing top bar + full list */}
        </>
      )}
    </div>
  );
}
```

(Move the existing top bar + full `<ul>` into the `else` branch.)

- [ ] **Step 4: Pass `compact` from `Chat.tsx`**

```tsx
<aside ...>
  <SessionList compact={collapsed} />
</aside>
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/pages/Chat.test.tsx src/components/chat/SessionList.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/SessionList.tsx src/pages/Chat.tsx src/pages/Chat.test.tsx
git commit -m "feat(phase-17): SessionList icon-only compact mode"
```

---

<!-- openspec-task: 4.1 -->
### Task 7: `MessageList` shell — subscribe to bySession, render messages by role

**Files:**
- Create: `src/components/chat/MessageList.tsx`
- Create: `src/components/chat/MessageList.test.tsx`
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 1: Write failing test for role dispatch**

Create `src/components/chat/MessageList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { i18n } from '@/i18n';
import { MessageList } from './MessageList';
import { useChatStore } from '@/stores/chat';

describe('MessageList — role dispatch', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init(); });
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: {
          loaded: true,
          messages: [
            { id: 'm1', role: 'user', text: '你好', createdAt: 100 },
            { id: 'm2', role: 'assistant', text: 'hi there', createdAt: 200 },
            { id: 'm3', role: 'assistant', text: '', toolCalls: [{ id: 'c1', name: 'search_files', args: { q: 'a' } }], createdAt: 300 },
            { id: 'm4', role: 'tool', text: '{"count":3}', toolCallId: 'c1', createdAt: 400 }
          ],
          streamingBuffer: '',
          flushedLength: 0,
          pendingApprovals: [],
          pendingAttachments: [],
          pendingPromptText: '',
          status: 'idle',
          error: null
        }
      }
    });
  });
  afterEach(() => cleanup());

  it('renders one element per message with role-specific testid', () => {
    render(<MessageList />);
    expect(screen.getByTestId('msg-user-m1')).toBeTruthy();
    expect(screen.getByTestId('msg-assistant-m2')).toBeTruthy();
    expect(screen.getByTestId('msg-toolcall-m3')).toBeTruthy();
    expect(screen.getByTestId('msg-toolresult-m4')).toBeTruthy();
  });

  it('renders nothing if no active session', () => {
    useChatStore.setState({ activeSessionId: null });
    const { container } = render(<MessageList />);
    expect(container.querySelectorAll('[data-testid^="msg-"]').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

- [ ] **Step 3: Create `MessageList.tsx`**

```tsx
// src/components/chat/MessageList.tsx
import type { JSX } from 'react';
import { useChatStore, type ChatMessage } from '@/stores/chat';

export function MessageList(): JSX.Element | null {
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));
  if (!activeId || !slot) return null;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
      {slot.messages.map((m) => <MessageRow key={m.id} m={m} />)}
    </div>
  );
}

function MessageRow({ m }: { m: ChatMessage }): JSX.Element {
  if (m.role === 'user') {
    return <div data-testid={`msg-user-${m.id}`} className="my-2 flex justify-end"><div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div></div>;
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    return <div data-testid={`msg-toolcall-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">调用工具 <span className="font-medium">{m.toolCalls[0].name}</span></div>;
  }
  if (m.role === 'assistant') {
    return <div data-testid={`msg-assistant-${m.id}`} className="my-2 max-w-full text-sm whitespace-pre-wrap">{m.text}</div>;
  }
  if (m.role === 'tool') {
    return <div data-testid={`msg-toolresult-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">result: <code className="text-muted-foreground">{m.text.slice(0, 80)}</code></div>;
  }
  return <div className="my-2 text-xs text-muted-foreground">{m.text}</div>;
}
```

- [ ] **Step 4: Run — verify it passes**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Mount inside `Chat.tsx`**

Replace the empty-state-only `<section>` body in `Chat.tsx`:

```tsx
import { MessageList } from '@/components/chat/MessageList';

// ...
<section className="flex flex-1 min-h-0 flex-col">
  {(() => {
    const slot = activeSession ? useChatStore.getState().bySession[activeSession.id] : null;
    const hasMessages = slot && slot.messages.length > 0;
    return hasMessages ? <MessageList /> : <EmptyState />;
  })()}
</section>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/MessageList.test.tsx src/pages/Chat.tsx
git commit -m "feat(phase-17): MessageList role dispatch shell"
```

---

<!-- openspec-task: 4.2 -->
### Task 8: Extract `UserBubble` / `AssistantMarkdown` / `ToolCallCard` / `ToolResultCard`

**Files:**
- Create: `src/components/chat/UserBubble.tsx`
- Create: `src/components/chat/AssistantMarkdown.tsx`
- Create: `src/components/chat/ToolCallCard.tsx`
- Create: `src/components/chat/ToolResultCard.tsx`
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `package.json`, `package-lock.json` (install `react-markdown` + `remark-gfm`)

- [ ] **Step 1: Install deps**

```bash
npm install react-markdown@^9 remark-gfm@^4
```

Expected: package added; `package-lock.json` updated.

- [ ] **Step 2: Create `UserBubble.tsx`**

```tsx
// src/components/chat/UserBubble.tsx
import type { JSX } from 'react';
import type { ChatMessage } from '@/stores/chat';

export function UserBubble({ m }: { m: ChatMessage }): JSX.Element {
  return (
    <div data-testid={`msg-user-${m.id}`} className="my-2 flex justify-end">
      <div className="max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm">
        <div className="whitespace-pre-wrap">{m.text}</div>
        {m.attachments && m.attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.attachments.map((a, i) => (
              <span key={i} className="inline-flex items-center rounded bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {a.type === 'file' ? `@file:${a.title}` : `@clip:${a.title}`}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `AssistantMarkdown.tsx`**

```tsx
// src/components/chat/AssistantMarkdown.tsx
import type { JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/stores/chat';
import { ipc } from '@/ipc/client';

export function AssistantMarkdown({ m }: { m: ChatMessage }): JSX.Element {
  return (
    <div data-testid={`msg-assistant-${m.id}`} className="my-2 max-w-full text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  if (href) void ipc.shell.openExternal(href);
                }}
                className="text-primary underline"
              >
                {children}
              </a>
            );
          },
          pre({ children }) {
            return <pre className="my-2 rounded bg-muted p-2 font-mono text-xs">{children}</pre>;
          },
          code({ className, children }) {
            return <code className={`${className ?? ''} rounded bg-muted px-1 font-mono text-xs`}>{children}</code>;
          },
          table({ children }) {
            return <table className="my-2 border-collapse text-xs">{children}</table>;
          },
          th({ children }) { return <th className="border border-border bg-muted px-2 py-1">{children}</th>; },
          td({ children }) { return <td className="border border-border px-2 py-1">{children}</td>; }
        }}
      >
        {m.text}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 4: Create `ToolCallCard.tsx`**

```tsx
// src/components/chat/ToolCallCard.tsx
import type { JSX } from 'react';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ChatMessage } from '@/stores/chat';

export function ToolCallCard({ m }: { m: ChatMessage }): JSX.Element {
  const [open, setOpen] = useState(false);
  const call = m.toolCalls?.[0];
  if (!call) return <></>;
  return (
    <div data-testid={`msg-toolcall-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <ChevronRight size={12} className={open ? 'rotate-90 transition' : 'transition'} />
        调用工具 <span className="font-medium">{call.name}</span>
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-[11px]">{JSON.stringify(call.args, null, 2)}</pre>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `ToolResultCard.tsx`**

```tsx
// src/components/chat/ToolResultCard.tsx
import type { JSX } from 'react';
import { useState } from 'react';
import { ChevronRight, Copy } from 'lucide-react';
import type { ChatMessage } from '@/stores/chat';

export function ToolResultCard({ m }: { m: ChatMessage }): JSX.Element {
  const [open, setOpen] = useState(false);
  const isLarge = m.text.length > 5000;
  return (
    <div data-testid={`msg-toolresult-${m.id}`} className="my-2 rounded border border-border bg-muted/40 px-3 py-2 text-xs">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-1 text-left">
        <ChevronRight size={12} className={open ? 'rotate-90 transition' : 'transition'} />
        result: <code className="text-muted-foreground">{m.text.slice(0, 80)}</code>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <pre className="overflow-x-auto rounded bg-background p-2 text-[11px]">{m.text}</pre>
          {isLarge && (
            <button type="button" onClick={() => { void navigator.clipboard.writeText(m.text); }} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted">
              <Copy size={10} /> 复制全部
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Use them in `MessageList.tsx`**

Replace `MessageRow` body:

```tsx
import { UserBubble } from './UserBubble';
import { AssistantMarkdown } from './AssistantMarkdown';
import { ToolCallCard } from './ToolCallCard';
import { ToolResultCard } from './ToolResultCard';

function MessageRow({ m }: { m: ChatMessage }): JSX.Element {
  if (m.role === 'user') return <UserBubble m={m} />;
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) return <ToolCallCard m={m} />;
  if (m.role === 'assistant') return <AssistantMarkdown m={m} />;
  if (m.role === 'tool') return <ToolResultCard m={m} />;
  return <div className="my-2 text-xs text-muted-foreground">{m.text}</div>;
}
```

- [ ] **Step 7: Run all tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

Expected: PASS — same testids preserved.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/components/chat/UserBubble.tsx src/components/chat/AssistantMarkdown.tsx src/components/chat/ToolCallCard.tsx src/components/chat/ToolResultCard.tsx src/components/chat/MessageList.tsx
git commit -m "feat(phase-17): split message renderers + react-markdown for assistant"
```

---

<!-- openspec-task: 4.3 -->
### Task 9: `useStreamingText` hook — rAF batching, DOM-only text-node append

**Files:**
- Create: `src/hooks/useStreamingText.ts`
- Create: `src/hooks/useStreamingText.test.ts`
- Modify: `src/components/chat/MessageList.tsx`

- [ ] **Step 1: Write failing tests for the hook**

Create `src/hooks/useStreamingText.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingText } from './useStreamingText';
import { useChatStore } from '@/stores/chat';

describe('useStreamingText', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      }
    });
  });

  it('flushes appended buffer chunks to ref node text on rAF', async () => {
    const node = document.createElement('pre');
    document.body.appendChild(node);
    const { result } = renderHook(() => useStreamingText('s1', { current: node }));
    expect(result.current).toBe(0);

    let rafCb: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });

    act(() => {
      useChatStore.setState((s) => ({
        bySession: { ...s.bySession, s1: { ...s.bySession.s1, streamingBuffer: 'Hello', status: 'streaming' } }
      }));
    });

    act(() => { rafCb?.(performance.now()); });
    expect(node.textContent).toBe('Hello');

    act(() => {
      useChatStore.setState((s) => ({
        bySession: { ...s.bySession, s1: { ...s.bySession.s1, streamingBuffer: 'Hello world' } }
      }));
    });
    act(() => { rafCb?.(performance.now()); });
    expect(node.textContent).toBe('Hello world');
  });

  it('resets DOM text when buffer empties (after done)', async () => {
    const node = document.createElement('pre');
    node.textContent = 'leftover';
    const { rerender } = renderHook(() => useStreamingText('s1', { current: node }));
    let rafCb: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { rafCb = cb; return 1; });

    act(() => {
      useChatStore.setState((s) => ({
        bySession: { ...s.bySession, s1: { ...s.bySession.s1, streamingBuffer: '', flushedLength: 0, status: 'idle' } }
      }));
    });
    rerender();
    act(() => { rafCb?.(performance.now()); });
    expect(node.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
npx vitest run src/hooks/useStreamingText.test.ts
```

- [ ] **Step 3: Implement `useStreamingText`**

```ts
// src/hooks/useStreamingText.ts
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useChatStore } from '@/stores/chat';

export function useStreamingText(sessionId: string, nodeRef: RefObject<HTMLElement | null>): number {
  const [tick, setTick] = useState(0);
  const lastSidRef = useRef<string>(sessionId);

  useEffect(() => {
    let cancelled = false;
    function loop(): void {
      if (cancelled) return;
      const slot = useChatStore.getState().bySession[sessionId];
      const node = nodeRef.current;
      if (slot && node) {
        const buf = slot.streamingBuffer;
        const flushed = slot.flushedLength;
        if (lastSidRef.current !== sessionId) {
          node.textContent = '';
          lastSidRef.current = sessionId;
        }
        if (buf.length === 0 && node.textContent !== '') {
          node.textContent = '';
        } else if (buf.length > flushed) {
          const chunk = buf.slice(flushed);
          node.appendChild(document.createTextNode(chunk));
          useChatStore.setState((s) => ({
            bySession: {
              ...s.bySession,
              [sessionId]: { ...(s.bySession[sessionId] ?? slot), flushedLength: buf.length }
            }
          }));
          setTick((t) => t + 1);
        }
      }
      window.requestAnimationFrame(loop);
    }
    window.requestAnimationFrame(loop);
    return () => { cancelled = true; };
  }, [sessionId, nodeRef]);

  return tick;
}
```

- [ ] **Step 4: Run — verify it passes**

```bash
npx vitest run src/hooks/useStreamingText.test.ts
```

Expected: PASS.

- [ ] **Step 5: Use the hook in `MessageList.tsx` to render the streaming pre**

Modify `src/components/chat/MessageList.tsx`. Add a `StreamingTail` component below messages, mounted only while `status === 'streaming'`:

```tsx
import { useRef } from 'react';
import { useStreamingText } from '@/hooks/useStreamingText';

function StreamingTail({ sessionId }: { sessionId: string }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);
  useStreamingText(sessionId, ref);
  return (
    <div className="my-2 text-sm">
      <pre ref={ref} data-testid="streaming-pre" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }} />
    </div>
  );
}

// inside MessageList, after messages.map(...):
{slot.status === 'streaming' && activeId && <StreamingTail sessionId={activeId} />}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useStreamingText.ts src/hooks/useStreamingText.test.ts src/components/chat/MessageList.tsx
git commit -m "feat(phase-17): rAF-batched streaming text via useStreamingText hook"
```

---

<!-- openspec-task: 4.4 -->
### Task 10: Switch from `<pre>` streaming to markdown render on `done` event

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/MessageList.test.tsx`

- [ ] **Step 1: Write failing test for the switch**

Append to `src/components/chat/MessageList.test.tsx`:

```tsx
describe('MessageList — streaming → done transition', () => {
  it('shows streaming-pre while status=streaming, hides it after done commits message', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [], streamingBuffer: '正在', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'streaming', error: null }
      }
    });
    const { rerender } = render(<MessageList />);
    expect(screen.queryByTestId('streaming-pre')).toBeTruthy();

    useChatStore.setState((s) => ({
      bySession: {
        ...s.bySession,
        s1: { ...s.bySession.s1, streamingBuffer: '', flushedLength: 0, status: 'idle', messages: [{ id: 'm-final', role: 'assistant', text: '**final**', createdAt: 9 }] }
      }
    }));
    rerender(<MessageList />);
    expect(screen.queryByTestId('streaming-pre')).toBeFalsy();
    expect(screen.getByTestId('msg-assistant-m-final')).toBeTruthy();
    expect(screen.getByText('final').tagName).toBe('STRONG');
  });
});
```

- [ ] **Step 2: Run — verify it passes (no code change required since the streaming-pre is conditional on status)**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

Expected: PASS — the existing implementation already renders `StreamingTail` only while `status === 'streaming'` (Task 9). If it fails, double-check that the conditional in `MessageList` references the right slot status.

- [ ] **Step 3: Commit (no impl change; test only)**

```bash
git add src/components/chat/MessageList.test.tsx
git commit -m "test(phase-17): assert streaming pre → markdown switch on done"
```

---

<!-- openspec-task: 4.5 -->
### Task 11: Auto-scroll + "新消息 ↓" floating button

**Files:**
- Modify: `src/components/chat/MessageList.tsx`
- Modify: `src/components/chat/MessageList.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`

- [ ] **Step 1: Add i18n key `chat.messages.jumpToLatest`**

Both locales:

```json
"messages": {
  "jumpToLatest": "新消息 ↓"
}
// en-US: "jumpToLatest": "New messages ↓"
```

- [ ] **Step 2: Write failing test for jump button**

Append to `MessageList.test.tsx`:

```tsx
describe('MessageList — auto-scroll', () => {
  it('shows "↓ jump" button when scrolled up beyond threshold', () => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, role: 'assistant' as const, text: `m${i}`, createdAt: i })), streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      }
    });
    render(<MessageList />);
    const list = screen.getByTestId('message-list');
    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    Object.defineProperty(list, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 400, configurable: true });
    list.dispatchEvent(new Event('scroll'));
    expect(screen.getByTestId('jump-to-latest')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Implement scroll handler + button in `MessageList.tsx`**

```tsx
import { useRef, useEffect, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function MessageList(): JSX.Element | null {
  const { t } = useTranslation();
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuckUp, setStuckUp] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll(): void {
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      setStuckUp(distanceFromBottom > 80);
    }
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stuckUp) sentinelRef.current?.scrollIntoView({ block: 'end' });
  }, [slot?.messages.length, slot?.streamingBuffer, stuckUp]);

  if (!activeId || !slot) return null;
  return (
    <div className="relative flex flex-1 min-h-0 flex-col">
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-3" data-testid="message-list">
        {slot.messages.map((m) => <MessageRow key={m.id} m={m} />)}
        {slot.status === 'streaming' && <StreamingTail sessionId={activeId} />}
        <div ref={sentinelRef} />
      </div>
      {stuckUp && (
        <button
          type="button"
          data-testid="jump-to-latest"
          onClick={() => sentinelRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
          className="absolute bottom-3 right-4 rounded-full border border-border bg-popover px-3 py-1 text-xs shadow"
        >
          <ArrowDown size={12} className="inline" /> {t('chat.messages.jumpToLatest')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run all message tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/MessageList.tsx src/components/chat/MessageList.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): MessageList auto-scroll + jump-to-latest button"
```

---

<!-- openspec-task: 4.6 -->
### Task 12: Hover ops bar — copy / retry / quote

**Files:**
- Create: `src/components/chat/MessageOps.tsx`
- Modify: `src/components/chat/UserBubble.tsx`, `AssistantMarkdown.tsx`
- Modify: `src/components/chat/MessageList.test.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`

- [ ] **Step 1: Add i18n keys**

```json
"messages": {
  "jumpToLatest": "新消息 ↓",
  "copy": "复制",
  "retry": "重试",
  "quote": "引用"
}
```

(en-US parity: `Copy / Retry / Quote`.)

- [ ] **Step 2: Write failing test for ops bar**

Append to `MessageList.test.tsx`:

```tsx
describe('MessageList — hover ops', () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [{ id: 'm1', role: 'assistant', text: 'hello', createdAt: 1 }], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      }
    });
  });

  it('renders copy button on assistant message', () => {
    render(<MessageList />);
    expect(screen.getByTestId('msg-op-copy-m1')).toBeTruthy();
  });

  it('clicking copy writes to clipboard', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<MessageList />);
    await userEvent.click(screen.getByTestId('msg-op-copy-m1'));
    expect(writeText).toHaveBeenCalledWith('hello');
  });
});
```

(Add `import userEvent from '@testing-library/user-event'` at top of test file if missing.)

- [ ] **Step 3: Create `MessageOps.tsx`**

```tsx
// src/components/chat/MessageOps.tsx
import type { JSX } from 'react';
import { Copy, RotateCcw, Quote } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Props {
  messageId: string;
  text: string;
  showRetry?: boolean;
  showQuote?: boolean;
  onRetry?: () => void;
  onQuote?: () => void;
}

export function MessageOps({ messageId, text, showRetry, showQuote, onRetry, onQuote }: Props): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="invisible absolute -top-2 right-0 flex gap-1 rounded border border-border bg-popover px-1 py-0.5 text-xs shadow group-hover:visible">
      <button
        type="button"
        data-testid={`msg-op-copy-${messageId}`}
        title={t('chat.messages.copy')}
        onClick={() => { void navigator.clipboard.writeText(text); }}
        className="rounded p-0.5 hover:bg-muted"
      >
        <Copy size={12} />
      </button>
      {showRetry && (
        <button type="button" title={t('chat.messages.retry')} onClick={onRetry} className="rounded p-0.5 hover:bg-muted">
          <RotateCcw size={12} />
        </button>
      )}
      {showQuote && (
        <button type="button" title={t('chat.messages.quote')} onClick={onQuote} className="rounded p-0.5 hover:bg-muted">
          <Quote size={12} />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wrap `UserBubble` and `AssistantMarkdown` with hover ops**

`UserBubble.tsx`:

```tsx
import { MessageOps } from './MessageOps';

// wrap return with relative + group:
return (
  <div className="group relative my-2 flex justify-end" data-testid={`msg-user-${m.id}`}>
    <div className="relative max-w-[80%] rounded-lg bg-primary/10 px-3 py-2 text-sm">
      <MessageOps messageId={m.id} text={m.text} />
      <div className="whitespace-pre-wrap">{m.text}</div>
      {/* attachments... */}
    </div>
  </div>
);
```

`AssistantMarkdown.tsx`:

```tsx
import { MessageOps } from './MessageOps';
import { useChatStore } from '@/stores/chat';

export function AssistantMarkdown({ m }: { m: ChatMessage }): JSX.Element {
  const setPendingPromptText = useChatStore((s) => s.setPendingPromptText);
  return (
    <div data-testid={`msg-assistant-${m.id}`} className="group relative my-2 max-w-full text-sm">
      <MessageOps
        messageId={m.id}
        text={m.text}
        showQuote
        onQuote={() => setPendingPromptText(`> ${m.text.split('\n').join('\n> ')}\n\n`)}
      />
      {/* ReactMarkdown ... */}
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/MessageOps.tsx src/components/chat/UserBubble.tsx src/components/chat/AssistantMarkdown.tsx src/components/chat/MessageList.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): hover ops bar — copy/retry/quote"
```

---

<!-- openspec-task: 4.7 -->
### Task 13: External link interception via `react-markdown a` component → `shell.openExternal`

**Files:**
- Modify: `src/components/chat/AssistantMarkdown.tsx` (already done in Task 8 — verify + add test)
- Modify: `src/components/chat/MessageList.test.tsx`

- [ ] **Step 1: Write failing test for link interception**

Append to `MessageList.test.tsx`:

```tsx
describe('AssistantMarkdown — external links', () => {
  it('clicking an https link calls ipc.shell.openExternal and prevents default', async () => {
    const openExternal = vi.fn();
    // @ts-expect-error
    globalThis.window.api = { ...mockApi, shell: { openExternal } };
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: {
        s1: { loaded: true, messages: [{ id: 'm1', role: 'assistant', text: 'see [link](https://example.com)', createdAt: 1 }], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null }
      }
    });
    render(<MessageList />);
    const link = screen.getByRole('link', { name: 'link' });
    await userEvent.click(link);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/chat/MessageList.test.tsx -t "external links"
```

Expected: PASS — already implemented in Task 8 `AssistantMarkdown` `a` component override. If it fails, double-check that `ipc.shell.openExternal` is called inside `onClick` and `preventDefault()` is called first.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/MessageList.test.tsx
git commit -m "test(phase-17): assert external links go through shell.openExternal"
```

---

## Plan 2 verification

After all 13 tasks:

- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Manual: `npm run dev`, navigate to `/chat`, observe SessionList renders, can right-click → rename, delete via dialog. MessageList renders user/assistant/tool messages. (Streaming + ChatInput come in Plan 3.)

If anything fails, fix before declaring Plan 2 complete.
