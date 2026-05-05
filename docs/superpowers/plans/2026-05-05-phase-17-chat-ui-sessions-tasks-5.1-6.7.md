# Phase 17 — Chat UI & Sessions: Plan 3 (ChatInput + ApprovalPanel)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-17-chat-ui-sessions`
> **Task range:** OpenSpec tasks `5.1`–`6.7` (13 tasks)
> **Plan order:** 3 of 5. Builds on Plan 1 + Plan 2. Followed by Plan 4 (`tasks-7.1-9.4`), Plan 5 (`tasks-10.1-11.18`).
> **Status:** Not started
> **Created:** 2026-05-05
> **Branch suggestion:** continue on `feat/phase-17-chat-ui-sessions`

---

## Goal

Land the two interactive controls that make conversation possible: **ChatInput** (multi-line textarea with auto-grow, Cmd+Enter send, Esc cancel, send / stop button, profile chip footer, `@`-triggered QuickSwitcher integration with attachment chips) and **ApprovalPanel** (right-side 320px slide-in drawer that surfaces `tool.approval-needed` events with diff for `update_frontmatter` and editable JSON for other tools, plus a queue indicator and timeout handling).

## Architecture

- **`ChatInput.tsx`** owns its `textarea` value as **local component state** (not in the store) so per-keystroke updates don't re-render anything outside the input. Auto-grow is computed by setting `style.height = 'auto'` then `scrollHeight + 'px'` capped at 240. Send disables when `text.trim() === '' && pendingAttachments.length === 0`.
- **`@` integration with QuickSwitcher** repurposes the existing phase-8 component but in a **callback-mode**: the QuickSwitcher already supports a default "navigate to editor" path; we extend its store with an optional `onPick` callback. When `ChatInput` detects an `@` and the cursor sits right after it, it sets `useSearchStore.setState({ quickSwitcher: { onPick: handler, ... } })` then opens it. On pick → handler runs (insert chip + push attachment) → quick switcher closes. This avoids forking the component.
- **Attachment chips** display on top of the textarea as a separate flex row. The `@file:Title` token inside the textarea is **not** parsed — it's just visual; the actual attachment list lives in `pendingAttachments`. Removal X on a chip splices both the visible token (find-and-replace by title in textarea) and the store array.
- **`ApprovalPanel.tsx`** is mounted in `Chat.tsx`'s right `<aside>`. It expands when `pendingApprovals.length > 0` for the active session by setting the aside's `width` to 320 (CSS transition handles the animation). Empty queue → width 0; the panel itself remains mounted but invisible.
- **`update_frontmatter` diff** uses the existing `diff` package (already a dep) to compute line-level diff between `args.before` and `args.after` YAML stringifications; render two columns side-by-side with green / red row backgrounds.
- **JSON editor mode** swaps the `<pre>` for a `<textarea>` initialized with the pretty-printed JSON. On approve, parse with try/catch; on parse error, show inline toast and keep the panel open.

## Tech Stack

- `diff@^9` — line diff for YAML before/after (already a dep)
- `js-yaml` — only if needed to stringify `args.before`/`args.after`; if `update_frontmatter` already passes raw YAML strings, skip. **Inspect args shape first** (Step 1 of Task 9).
- `@radix-ui/react-toast` — for parse-error toast (already a dep via `@/hooks/use-toast`)
- `lucide-react` — `Send`, `Square` (stop), `X`, `Paperclip`, `Edit2`, `Check`
- `@testing-library/react` + `user-event` — tests

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/components/chat/ChatInput.tsx` | Create | 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 |
| `src/components/chat/ChatInput.test.tsx` | Create | 5.1–5.6 |
| `src/components/chat/AttachmentChips.tsx` | Create | 5.6 |
| `src/components/chat/ProfileFooter.tsx` | Create | 5.4 |
| `src/stores/search.ts` | Modify (add `onPick` callback support) | 5.5 |
| `src/components/search/QuickSwitcher.tsx` | Modify (call `onPick` if set) | 5.5 |
| `src/pages/Chat.tsx` | Modify (mount `ChatInput` + `ApprovalPanel`) | 5.1, 6.1 |
| `src/components/chat/ApprovalPanel.tsx` | Create | 6.1, 6.2 |
| `src/components/chat/ApprovalPanel.test.tsx` | Create | 6.1–6.7 |
| `src/components/chat/FrontmatterDiff.tsx` | Create | 6.3 |
| `src/components/chat/JsonArgsEditor.tsx` | Create | 6.4 |
| `src/i18n/locales/zh-CN.json`, `en-US.json` | Modify (`chat.input.*`, `chat.approval.*`) | all |

## Pre-flight

- Plans 1 + 2 merged.
- Verify the existing QuickSwitcher store at `src/stores/search.ts`. It must export an open/close API. Read its shape first to know where `onPick` should live.
- Confirm `useToast` from `@/hooks/use-toast` is available (it's used by `App.tsx`).
- Confirm phase 16 IPC `chat.approveTool` / `rejectTool` accept the shape `{ sessionId, callId, editedArgs? }` — the store action passes that signature already. If phase 16 used a different shape, update the call site here only.

---

## Tasks

<!-- openspec-task: 5.1 -->
### Task 1: `ChatInput` shell — auto-grow textarea, focus ring

**Files:**
- Create: `src/components/chat/ChatInput.tsx`
- Create: `src/components/chat/ChatInput.test.tsx`
- Modify: `src/pages/Chat.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`

- [ ] **Step 1: Add i18n keys**

`zh-CN.json` extend `chat`:

```json
"input": {
  "placeholder": "问问松语…  /  Cmd+Enter 发送  /  @ 引用",
  "send": "发送",
  "stop": "停止"
}
```

`en-US.json`:

```json
"input": {
  "placeholder": "Ask Songyu…  /  Cmd+Enter to send  /  @ to reference",
  "send": "Send",
  "stop": "Stop"
}
```

- [ ] **Step 2: Write failing test for the shell**

Create `src/components/chat/ChatInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { i18n } from '@/i18n';
import { ChatInput } from './ChatInput';
import { useChatStore } from '@/stores/chat';

const mockApi = {
  chat: {
    sessions: { list: vi.fn().mockResolvedValue([]), messages: vi.fn().mockResolvedValue([]) },
    onChatStream: vi.fn(() => () => {}),
    sendUserMessage: vi.fn().mockResolvedValue({ ok: true }),
    cancelStream: vi.fn().mockResolvedValue({ ok: true })
  }
};

describe('ChatInput — shell', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init(); });
  beforeEach(() => {
    // @ts-expect-error
    globalThis.window.api = mockApi;
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null } }
    });
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders a textarea with placeholder', () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox');
    expect(ta.getAttribute('placeholder')).toMatch(/松语|Songyu/);
  });

  it('auto-grows up to 240px max-height', async () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => 1000 });
    await userEvent.type(ta, 'a\nb\nc\nd\ne\nf\ng');
    expect(ta.style.height).toBe('240px');
  });
});
```

- [ ] **Step 3: Run — verify it fails**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

- [ ] **Step 4: Create `src/components/chat/ChatInput.tsx`**

```tsx
// src/components/chat/ChatInput.tsx
import type { JSX } from 'react';
import { useState, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function ChatInput(): JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState<string>('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
  }, [text]);

  return (
    <div className="border-t border-border bg-background p-3">
      <textarea
        ref={taRef}
        role="textbox"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('chat.input.placeholder')}
        rows={3}
        className="w-full resize-none rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
        style={{ minHeight: 72, maxHeight: 240 }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Mount in `Chat.tsx`**

In the middle `<main>` `<section>`, replace the conditional rendering with two stacked regions:

```tsx
import { ChatInput } from '@/components/chat/ChatInput';

// ...
<section className="flex flex-1 min-h-0 flex-col">
  <div className="flex-1 min-h-0 overflow-hidden">
    {(() => {
      const slot = activeSession ? useChatStore.getState().bySession[activeSession.id] : null;
      const hasMessages = slot && slot.messages.length > 0;
      return hasMessages ? <MessageList /> : <EmptyState />;
    })()}
  </div>
  <ChatInput />
</section>
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx src/pages/Chat.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): ChatInput shell with auto-grow textarea"
```

---

<!-- openspec-task: 5.2 -->
### Task 2: Keybindings — Enter newline, Cmd+Enter send, Esc cancel

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Write failing tests for key handling**

Append to `ChatInput.test.tsx`:

```tsx
describe('ChatInput — keybindings', () => {
  it('Enter inserts newline (does not send)', async () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(ta, 'hello{Enter}world');
    expect(ta.value).toBe('hello\nworld');
    expect(mockApi.chat.sendUserMessage).not.toHaveBeenCalled();
  });

  it('Cmd+Enter sends with text + clears input', async () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(ta, 'hello');
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(mockApi.chat.sendUserMessage).toHaveBeenCalledWith({ sessionId: 's1', text: 'hello', attachments: [] });
    expect(ta.value).toBe('');
  });

  it('Cmd+Enter does not send when text empty + no attachments', async () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox');
    ta.focus();
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    expect(mockApi.chat.sendUserMessage).not.toHaveBeenCalled();
  });

  it('Esc during streaming calls cancelStream', async () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, status: 'streaming' } }
    }));
    render(<ChatInput />);
    const ta = screen.getByRole('textbox');
    ta.focus();
    await userEvent.keyboard('{Escape}');
    expect(mockApi.chat.cancelStream).toHaveBeenCalledWith({ sessionId: 's1' });
  });
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx -t "keybindings"
```

- [ ] **Step 3: Wire keybindings in `ChatInput.tsx`**

Update `ChatInput`:

```tsx
import { useChatStore } from '@/stores/chat';

export function ChatInput(): JSX.Element {
  const { t } = useTranslation();
  const [text, setText] = useState<string>('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));

  // ... auto-grow effect

  async function send(): Promise<void> {
    const t = text.trim();
    const atts = slot?.pendingAttachments ?? [];
    if (!t && atts.length === 0) return;
    if (slot?.status === 'streaming') return;
    setText('');
    try {
      await sendUserMessage({ text: t, attachments: atts });
    } catch (err) {
      // E_BUSY surfaced via toast in Plan 4 (Task 8.2)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Escape') {
      if (slot?.status === 'streaming') {
        e.preventDefault();
        void cancelStream();
      }
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="border-t border-border bg-background p-3">
      <textarea
        ref={taRef}
        role="textbox"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={t('chat.input.placeholder')}
        rows={3}
        className="w-full resize-none rounded border border-border bg-background p-2 text-sm outline-none focus:border-primary"
        style={{ minHeight: 72, maxHeight: 240 }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS — all keybinding tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat(phase-17): ChatInput Cmd+Enter send / Esc cancel / Enter newline"
```

---

<!-- openspec-task: 5.3 -->
### Task 3: Send button — primary / disabled / stop states

**Files:**
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Write failing tests for the button**

Append to `ChatInput.test.tsx`:

```tsx
describe('ChatInput — send button', () => {
  it('disabled when text empty', () => {
    render(<ChatInput />);
    const btn = screen.getByTestId('chat-send-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enabled when text non-empty', async () => {
    render(<ChatInput />);
    await userEvent.type(screen.getByRole('textbox'), 'hi');
    const btn = screen.getByTestId('chat-send-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('shows stop icon while streaming', () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, status: 'streaming' } }
    }));
    render(<ChatInput />);
    expect(screen.getByTestId('chat-stop-btn')).toBeTruthy();
  });

  it('clicking stop calls cancelStream', async () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, status: 'streaming' } }
    }));
    render(<ChatInput />);
    await userEvent.click(screen.getByTestId('chat-stop-btn'));
    expect(mockApi.chat.cancelStream).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx -t "send button"
```

- [ ] **Step 3: Add the button row in `ChatInput.tsx`**

Replace the textarea wrapper block:

```tsx
import { Send, Square } from 'lucide-react';

// inside return:
<div className="border-t border-border bg-background p-3">
  <textarea ... />
  <div className="mt-2 flex items-center justify-end gap-2">
    {slot?.status === 'streaming' ? (
      <button
        type="button"
        data-testid="chat-stop-btn"
        onClick={() => void cancelStream()}
        aria-label={t('chat.input.stop')}
        className="rounded bg-destructive p-1.5 text-destructive-foreground hover:opacity-90"
      >
        <Square size={14} />
      </button>
    ) : (
      <button
        type="button"
        data-testid="chat-send-btn"
        disabled={text.trim() === '' && (slot?.pendingAttachments.length ?? 0) === 0}
        onClick={() => void send()}
        aria-label={t('chat.input.send')}
        className="rounded bg-primary p-1.5 text-primary-foreground hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
      >
        <Send size={14} />
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat(phase-17): ChatInput send / disabled / stop button states"
```

---

<!-- openspec-task: 5.4 -->
### Task 4: Profile footer — name + model + "未配置" fallback link

**Files:**
- Create: `src/components/chat/ProfileFooter.tsx`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Add i18n keys**

```json
"input": {
  "placeholder": "...",
  "send": "...",
  "stop": "...",
  "noProfile": "未配置 AI profile",
  "goToSettings": "前往设置"
}
```

(en-US: "No AI profile configured" / "Go to settings".)

- [ ] **Step 2: Write failing test**

Append to `ChatInput.test.tsx`:

```tsx
import { useProfilesStore } from '@/stores/profiles';

describe('ChatInput — profile footer', () => {
  it('shows profile name + model when bound', () => {
    useProfilesStore.setState({ profiles: [{ id: 'p1', name: 'Anthropic', provider: 'anthropic', model: 'claude-opus', baseUrl: null, secretRef: null, default: true }] } as any);
    useChatStore.setState((s) => ({
      sessions: s.sessions.map((x) => ({ ...x, profileId: 'p1' }))
    }));
    render(<ChatInput />);
    expect(screen.getByText(/Anthropic/)).toBeTruthy();
    expect(screen.getByText(/claude-opus/)).toBeTruthy();
  });

  it('shows "未配置" + settings link when no profile', () => {
    useProfilesStore.setState({ profiles: [] } as any);
    useChatStore.setState((s) => ({
      sessions: s.sessions.map((x) => ({ ...x, profileId: null }))
    }));
    render(<ChatInput />);
    expect(screen.getByText(/未配置|No AI profile/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /前往设置|Go to settings/i }).getAttribute('href')).toBe('/settings/ai');
  });
});
```

- [ ] **Step 3: Create `ProfileFooter.tsx`**

```tsx
// src/components/chat/ProfileFooter.tsx
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chat';
import { useProfilesStore } from '@/stores/profiles';

export function ProfileFooter(): JSX.Element {
  const { t } = useTranslation();
  const activeId = useChatStore((s) => s.activeSessionId);
  const sessions = useChatStore((s) => s.sessions);
  const profiles = useProfilesStore((s) => s.profiles);
  const session = sessions.find((s) => s.id === activeId) ?? null;
  const profile = session?.profileId ? profiles.find((p) => p.id === session.profileId) : null;

  if (!profile) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{t('chat.input.noProfile')}</span>
        <Link to="/settings/ai" className="text-primary underline">
          {t('chat.input.goToSettings')}
        </Link>
      </div>
    );
  }
  return (
    <div className="text-[10px] text-muted-foreground">
      {profile.name} <span>· {profile.model}</span>
    </div>
  );
}
```

- [ ] **Step 4: Mount in `ChatInput.tsx` button row**

```tsx
import { ProfileFooter } from './ProfileFooter';

<div className="mt-2 flex items-center justify-between gap-2">
  <ProfileFooter />
  <div className="flex items-center gap-2">{/* send/stop buttons */}</div>
</div>
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ProfileFooter.tsx src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): ChatInput profile footer with settings link fallback"
```

---

<!-- openspec-task: 5.5 -->
### Task 5: `@` triggers QuickSwitcher → insert chip token + push attachment

**Files:**
- Modify: `src/stores/search.ts` (add `onPick` callback)
- Modify: `src/components/search/QuickSwitcher.tsx` (call `onPick` if set)
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Read existing `src/stores/search.ts` to find the QuickSwitcher slice shape**

```bash
grep -n "quickSwitcher\|onPick\|open\|close" src/stores/search.ts | head -30
```

Note the names `openState` / `close()` / `q` / `items` / `selectedIndex` / `pushRecent`. The new field will be `onPick: ((item: PickItem) => void) | null` (default null).

- [ ] **Step 2: Add `onPick` to the search store**

In `src/stores/search.ts` extend the `quickSwitcher` slice:

```ts
type PickItem = { type: 'file'; path: string; title: string } | { type: 'clip'; clipId: number; url: string; title: string };

// in slice state:
onPick: null as null | ((item: PickItem) => void),

// in actions:
openWithPick(onPick: (item: PickItem) => void) {
  set((s) => ({
    quickSwitcher: { ...s.quickSwitcher, openState: true, q: '', items: [], onPick }
  }));
},

close() {
  set((s) => ({
    quickSwitcher: { ...s.quickSwitcher, openState: false, onPick: null }
  }));
},
```

(Adapt to the actual store layout — the snippet shows the intent.)

- [ ] **Step 3: Modify `QuickSwitcher.tsx` to call `onPick` if set**

In the existing onClick / Enter-handler that calls `navigate(...)`, branch first:

```tsx
const onPick = useSearchStore((s) => s.quickSwitcher.onPick);

function pick(target: { path: string; title?: string; clipped_at?: string }): void {
  if (onPick) {
    onPick({ type: 'file', path: target.path, title: target.title ?? target.path });
    close();
    return;
  }
  pushRecent(target.path);
  navigate('/editor/' + encodeURIComponent(target.path));
  close();
}
```

Replace the inline `navigate(...)` calls in the row click + Enter key handler with `pick(...)`.

- [ ] **Step 4: Write failing test in `ChatInput.test.tsx`**

Append:

```tsx
import { useSearchStore } from '@/stores/search';

describe('ChatInput — @ attachments', () => {
  it('typing @ opens QuickSwitcher in onPick mode', async () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox');
    await userEvent.type(ta, '@');
    const state = useSearchStore.getState();
    expect(state.quickSwitcher.openState).toBe(true);
    expect(state.quickSwitcher.onPick).toBeTruthy();
  });

  it('picking a file inserts a chip token and pushes attachment', () => {
    render(<ChatInput />);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    ta.value = '看看这篇 @';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // Trigger onPick manually
    const onPick = useSearchStore.getState().quickSwitcher.onPick;
    onPick?.({ type: 'file', path: 'notes/a.md', title: 'A' });
    const slot = useChatStore.getState().bySession.s1!;
    expect(slot.pendingAttachments).toEqual([{ type: 'file', path: 'notes/a.md', title: 'A' }]);
  });
});
```

- [ ] **Step 5: Run — verify it fails**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx -t "@ attachments"
```

- [ ] **Step 6: Implement `@` handling in `ChatInput.tsx`**

Add to `ChatInput`:

```tsx
import { useSearchStore } from '@/stores/search';

const pushAttachment = useChatStore((s) => s.pushAttachment);
const openQuickSwitcherWithPick = useSearchStore((s) => s.quickSwitcher.openWithPick);

function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>): void {
  const next = e.target.value;
  const prev = text;
  setText(next);
  // Detect newly typed @ at the end of a word boundary
  if (next.length > prev.length && next.endsWith('@')) {
    openQuickSwitcherWithPick((item) => {
      const titleToken = item.type === 'file' ? `file:${item.title}` : `clip:${item.title}`;
      // Replace the trailing '@' with '@<token> '
      setText((cur) => cur.replace(/@$/, `@${titleToken} `));
      pushAttachment(item as Attachment);
      taRef.current?.focus();
    });
  }
}

import type { Attachment } from '@shared/agent-types';
```

In the textarea, swap `onChange` for `handleChange`.

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/stores/search.ts src/components/search/QuickSwitcher.tsx src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat(phase-17): @ triggers QuickSwitcher onPick → insert chip + push attachment"
```

---

<!-- openspec-task: 5.6 -->
### Task 6: `AttachmentChips` strip above textarea — list + remove

**Files:**
- Create: `src/components/chat/AttachmentChips.tsx`
- Modify: `src/components/chat/ChatInput.tsx`
- Modify: `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `ChatInput.test.tsx`:

```tsx
describe('ChatInput — attachment chips strip', () => {
  beforeEach(() => {
    useChatStore.setState((s) => ({
      bySession: {
        ...s.bySession,
        s1: { ...s.bySession.s1, pendingAttachments: [
          { type: 'file', path: 'notes/a.md', title: 'A' },
          { type: 'clip', clipId: 9, url: 'https://x.com', title: 'X' }
        ] }
      }
    }));
  });

  it('renders one chip per attachment', () => {
    render(<ChatInput />);
    expect(screen.getByText('@file:A')).toBeTruthy();
    expect(screen.getByText('@clip:X')).toBeTruthy();
  });

  it('clicking × removes the attachment', async () => {
    render(<ChatInput />);
    const removeBtns = screen.getAllByLabelText(/remove/i);
    await userEvent.click(removeBtns[0]);
    expect(useChatStore.getState().bySession.s1!.pendingAttachments).toHaveLength(1);
    expect(useChatStore.getState().bySession.s1!.pendingAttachments[0].title).toBe('X');
  });
});
```

- [ ] **Step 2: Run — verify it fails**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx -t "attachment chips"
```

- [ ] **Step 3: Create `AttachmentChips.tsx`**

```tsx
// src/components/chat/AttachmentChips.tsx
import type { JSX } from 'react';
import { X, FileText, Link as LinkIcon } from 'lucide-react';
import { useChatStore } from '@/stores/chat';

export function AttachmentChips(): JSX.Element | null {
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));
  const removeAttachment = useChatStore((s) => s.removeAttachment);
  const atts = slot?.pendingAttachments ?? [];
  if (atts.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {atts.map((a, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-[11px]">
          {a.type === 'file' ? <FileText size={10} /> : <LinkIcon size={10} />}
          <span className="truncate">{a.type === 'file' ? `@file:${a.title}` : `@clip:${a.title}`}</span>
          <button
            type="button"
            aria-label="remove"
            onClick={() => removeAttachment(i)}
            className="rounded p-0.5 hover:bg-destructive/10"
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Mount in `ChatInput.tsx` (above textarea)**

```tsx
import { AttachmentChips } from './AttachmentChips';

return (
  <div className="border-t border-border bg-background p-3">
    <AttachmentChips />
    <textarea ... />
    {/* button row */}
  </div>
);
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/components/chat/ChatInput.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/AttachmentChips.tsx src/components/chat/ChatInput.tsx src/components/chat/ChatInput.test.tsx
git commit -m "feat(phase-17): AttachmentChips strip with X to remove"
```

---

<!-- openspec-task: 6.1 -->
### Task 7: `ApprovalPanel` shell — slide-in 320px when active session has pending approval

**Files:**
- Create: `src/components/chat/ApprovalPanel.tsx`
- Create: `src/components/chat/ApprovalPanel.test.tsx`
- Modify: `src/pages/Chat.tsx`
- Modify: `src/i18n/locales/zh-CN.json`, `en-US.json`

- [ ] **Step 1: Add i18n keys**

`zh-CN.json` extend `chat`:

```json
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
}
```

en-US (parity):

```json
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
}
```

- [ ] **Step 2: Write failing test for slide-in width**

Create `src/components/chat/ApprovalPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { i18n } from '@/i18n';
import { ApprovalPanel } from './ApprovalPanel';
import { useChatStore, type PendingApproval } from '@/stores/chat';

const mockApi = {
  chat: {
    sessions: { list: vi.fn(), messages: vi.fn() },
    onChatStream: vi.fn(() => () => {}),
    approveTool: vi.fn().mockResolvedValue({ ok: true }),
    rejectTool: vi.fn().mockResolvedValue({ ok: true })
  }
};

const mkApproval = (callId: string, toolName = 'update_frontmatter'): PendingApproval => ({
  callId, toolName, args: { path: 'a.md', before: { rating: 3 }, after: { rating: 5 } }, reason: '需要批准 frontmatter 更改', receivedAt: Date.now()
});

describe('ApprovalPanel — slide-in', () => {
  beforeAll(async () => { if (!i18n.isInitialized) await i18n.init(); });
  beforeEach(() => {
    // @ts-expect-error
    globalThis.window.api = mockApi;
    useChatStore.setState({
      sessions: [{ id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null }],
      activeSessionId: 's1',
      bySession: { s1: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [], pendingAttachments: [], pendingPromptText: '', status: 'idle', error: null } }
    });
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('width=0 when queue empty', () => {
    render(<ApprovalPanel />);
    const wrap = screen.getByTestId('approval-panel-wrap');
    expect(wrap.style.width).toBe('0px');
  });

  it('width=320 when active session has pending approval', () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1')] } }
    }));
    render(<ApprovalPanel />);
    const wrap = screen.getByTestId('approval-panel-wrap');
    expect(wrap.style.width).toBe('320px');
  });

  it('width stays 0 when only non-active session has pending approval', () => {
    useChatStore.setState({
      sessions: [
        { id: 's1', title: 'A', createdAt: 1, updatedAt: 1, profileId: null },
        { id: 's2', title: 'B', createdAt: 1, updatedAt: 1, profileId: null }
      ],
      activeSessionId: 's1',
      bySession: { s2: { loaded: true, messages: [], streamingBuffer: '', flushedLength: 0, pendingApprovals: [mkApproval('c1')], pendingAttachments: [], pendingPromptText: '', status: 'awaiting-approval', error: null } }
    });
    render(<ApprovalPanel />);
    const wrap = screen.getByTestId('approval-panel-wrap');
    expect(wrap.style.width).toBe('0px');
  });
});
```

- [ ] **Step 3: Run — verify it fails**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

- [ ] **Step 4: Create `src/components/chat/ApprovalPanel.tsx`**

```tsx
// src/components/chat/ApprovalPanel.tsx
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chat';

export function ApprovalPanel(): JSX.Element {
  const { t } = useTranslation();
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));
  const pending = slot?.pendingApprovals ?? [];
  const head = pending[0];
  const visible = !!head;
  return (
    <div
      data-testid="approval-panel-wrap"
      style={{ width: visible ? 320 : 0 }}
      className="shrink-0 overflow-hidden border-l border-border bg-muted/20 transition-[width] duration-200"
    >
      {visible && head && activeId && (
        <div className="flex h-full flex-col p-3">
          <header className="border-b border-border pb-2 text-sm font-medium">
            {t('chat.approval.header')}
          </header>
          <div className="mt-2 text-xs text-muted-foreground">{head.reason}</div>
          <div className="mt-3 flex-1 overflow-y-auto" />
          <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
            {pending.length > 1 && t('chat.approval.queued', { count: pending.length - 1 })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Mount in `Chat.tsx`**

Replace the right `<aside>` placeholder:

```tsx
import { ApprovalPanel } from '@/components/chat/ApprovalPanel';

// replace right aside:
<ApprovalPanel />
```

(Note: `ApprovalPanel` includes its own width-controlled wrapper; the existing aside in Chat.tsx becomes redundant. Remove it.)

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/ApprovalPanel.tsx src/components/chat/ApprovalPanel.test.tsx src/pages/Chat.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "feat(phase-17): ApprovalPanel slide-in shell"
```

---

<!-- openspec-task: 6.2 -->
### Task 8: Approval header / reason / args region scaffolding + approve / reject buttons

**Files:**
- Modify: `src/components/chat/ApprovalPanel.tsx`
- Modify: `src/components/chat/ApprovalPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Append to `ApprovalPanel.test.tsx`:

```tsx
import userEvent from '@testing-library/user-event';

describe('ApprovalPanel — header / args / actions', () => {
  beforeEach(() => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1', 'write_file')] } }
    }));
  });

  it('renders translated tool name in header', () => {
    render(<ApprovalPanel />);
    expect(screen.getByText(/写入文件|Write file/i)).toBeTruthy();
  });

  it('shows args JSON in <pre> by default', () => {
    render(<ApprovalPanel />);
    expect(screen.getByTestId('approval-args-pre').textContent).toContain('a.md');
  });

  it('clicking 同意 calls approveTool with current args', async () => {
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }));
    expect(mockApi.chat.approveTool).toHaveBeenCalledWith({
      sessionId: 's1',
      callId: 'c1',
      editedArgs: undefined
    });
  });

  it('clicking 取消 calls rejectTool', async () => {
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^取消$|^cancel$/i }));
    expect(mockApi.chat.rejectTool).toHaveBeenCalledWith({ sessionId: 's1', callId: 'c1' });
  });
});
```

- [ ] **Step 2: Implement header / args / action buttons in `ApprovalPanel.tsx`**

Replace the panel body:

```tsx
import { useChatStore } from '@/stores/chat';

export function ApprovalPanel(): JSX.Element {
  const { t } = useTranslation();
  const activeId = useChatStore((s) => s.activeSessionId);
  const slot = useChatStore((s) => (activeId ? s.bySession[activeId] : undefined));
  const approveTool = useChatStore((s) => s.approveTool);
  const rejectTool = useChatStore((s) => s.rejectTool);
  const pending = slot?.pendingApprovals ?? [];
  const head = pending[0];
  const visible = !!head;

  const toolLabel = head ? t(`chat.approval.tools.${head.toolName}`, t('chat.approval.tools.default')) : '';

  return (
    <div
      data-testid="approval-panel-wrap"
      style={{ width: visible ? 320 : 0 }}
      className="shrink-0 overflow-hidden border-l border-border bg-muted/20 transition-[width] duration-200"
    >
      {visible && head && activeId && (
        <div className="flex h-full w-[320px] flex-col p-3">
          <header className="border-b border-border pb-2">
            <div className="text-sm font-medium">{toolLabel}</div>
            <div className="text-[10px] text-muted-foreground">{t('chat.approval.header')}</div>
          </header>
          <div className="mt-2 text-xs text-muted-foreground">
            <strong>{t('chat.approval.reason')}: </strong>{head.reason}
          </div>
          <div className="mt-3 flex-1 overflow-y-auto">
            <pre data-testid="approval-args-pre" className="overflow-x-auto rounded bg-background p-2 text-[11px]">
              {JSON.stringify(head.args, null, 2)}
            </pre>
          </div>
          <div className="border-t border-border pt-2">
            <div className="mb-2 text-[10px] text-muted-foreground">
              {pending.length > 1 ? t('chat.approval.queued', { count: pending.length - 1 }) : ' '}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void rejectTool(activeId, head.callId)}
                className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
              >
                {t('chat.approval.reject')}
              </button>
              <button
                type="button"
                onClick={() => void approveTool(activeId, head.callId)}
                className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90"
              >
                {t('chat.approval.approve')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ApprovalPanel.tsx src/components/chat/ApprovalPanel.test.tsx
git commit -m "feat(phase-17): ApprovalPanel header / reason / args / approve+reject"
```

---

<!-- openspec-task: 6.3 -->
### Task 9: `update_frontmatter` two-column before/after diff

**Files:**
- Create: `src/components/chat/FrontmatterDiff.tsx`
- Modify: `src/components/chat/ApprovalPanel.tsx`
- Modify: `src/components/chat/ApprovalPanel.test.tsx`

- [ ] **Step 1: Confirm `args` shape — read phase-16 spec**

```bash
grep -n "before\|after\|update_frontmatter" openspec/changes/phase-16-chat-agent-tools/specs/agent-tools/spec.md 2>/dev/null
```

Expected: confirm `args` includes `{ path, before: object, after: object }` (objects, not YAML strings). If args carry YAML strings instead, treat them as already stringified; if objects, stringify with `JSON.stringify(_, null, 2)` for the diff input. The component below uses an explicit `toLines(value)` helper to handle either.

- [ ] **Step 2: Write failing test**

Append to `ApprovalPanel.test.tsx`:

```tsx
describe('ApprovalPanel — update_frontmatter diff', () => {
  beforeEach(() => {
    useChatStore.setState((s) => ({
      bySession: {
        ...s.bySession,
        s1: { ...s.bySession.s1, pendingApprovals: [{
          callId: 'c1',
          toolName: 'update_frontmatter',
          args: { path: 'a.md', before: { rating: 3, tags: ['old'] }, after: { rating: 5, tags: ['new'] } },
          reason: 'r',
          receivedAt: 1
        }] }
      }
    }));
  });

  it('renders before / after columns with row-level highlighting', () => {
    render(<ApprovalPanel />);
    const before = screen.getByTestId('diff-before');
    const after = screen.getByTestId('diff-after');
    expect(before.textContent).toContain('rating: 3');
    expect(after.textContent).toContain('rating: 5');
    // changed rows tagged
    expect(before.querySelectorAll('[data-removed="true"]').length).toBeGreaterThan(0);
    expect(after.querySelectorAll('[data-added="true"]').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run — verify it fails**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx -t "update_frontmatter diff"
```

- [ ] **Step 4: Create `FrontmatterDiff.tsx`**

```tsx
// src/components/chat/FrontmatterDiff.tsx
import type { JSX } from 'react';
import { diffLines } from 'diff';

function toLines(v: unknown): string {
  if (typeof v === 'string') return v;
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => `${k}: ${JSON.stringify(val)}`)
    .join('\n');
}

interface Props {
  before: unknown;
  after: unknown;
}

export function FrontmatterDiff({ before, after }: Props): JSX.Element {
  const beforeText = toLines(before);
  const afterText = toLines(after);
  const parts = diffLines(beforeText, afterText);
  const beforeLines: { line: string; removed: boolean }[] = [];
  const afterLines: { line: string; added: boolean }[] = [];
  for (const p of parts) {
    const lines = p.value.split('\n').filter(Boolean);
    for (const l of lines) {
      if (p.added) afterLines.push({ line: l, added: true });
      else if (p.removed) beforeLines.push({ line: l, removed: true });
      else {
        beforeLines.push({ line: l, removed: false });
        afterLines.push({ line: l, added: false });
      }
    }
  }
  return (
    <div className="grid grid-cols-2 gap-1 text-[11px] font-mono">
      <pre data-testid="diff-before" className="overflow-x-auto rounded bg-background p-2">
        {beforeLines.map((l, i) => (
          <div key={i} data-removed={l.removed ? 'true' : undefined} className={l.removed ? 'bg-destructive/15' : ''}>
            {l.line}
          </div>
        ))}
      </pre>
      <pre data-testid="diff-after" className="overflow-x-auto rounded bg-background p-2">
        {afterLines.map((l, i) => (
          <div key={i} data-added={l.added ? 'true' : undefined} className={l.added ? 'bg-emerald-500/15' : ''}>
            {l.line}
          </div>
        ))}
      </pre>
    </div>
  );
}
```

- [ ] **Step 5: Use `FrontmatterDiff` in `ApprovalPanel.tsx`**

Replace the args region:

```tsx
import { FrontmatterDiff } from './FrontmatterDiff';

// inside args region:
{head.toolName === 'update_frontmatter' && (head.args as any)?.before && (head.args as any)?.after ? (
  <FrontmatterDiff before={(head.args as any).before} after={(head.args as any).after} />
) : (
  <pre data-testid="approval-args-pre" className="overflow-x-auto rounded bg-background p-2 text-[11px]">
    {JSON.stringify(head.args, null, 2)}
  </pre>
)}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/FrontmatterDiff.tsx src/components/chat/ApprovalPanel.tsx src/components/chat/ApprovalPanel.test.tsx
git commit -m "feat(phase-17): update_frontmatter before/after diff in approval panel"
```

---

<!-- openspec-task: 6.4 -->
### Task 10: "编辑参数" — toggle JSON `<pre>` to editable textarea

**Files:**
- Create: `src/components/chat/JsonArgsEditor.tsx`
- Modify: `src/components/chat/ApprovalPanel.tsx`
- Modify: `src/components/chat/ApprovalPanel.test.tsx`

- [ ] **Step 1: Write failing test**

Append:

```tsx
describe('ApprovalPanel — edit args', () => {
  beforeEach(() => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1', 'write_file')] } }
    }));
  });

  it('clicking 编辑参数 swaps pre to textarea', async () => {
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /编辑参数|edit args/i }));
    expect(screen.getByTestId('approval-args-textarea')).toBeTruthy();
  });

  it('approving with edited valid JSON passes editedArgs', async () => {
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /编辑参数|edit args/i }));
    const ta = screen.getByTestId('approval-args-textarea') as HTMLTextAreaElement;
    await userEvent.clear(ta);
    await userEvent.type(ta, '{"path":"b.md"}');
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }));
    expect(mockApi.chat.approveTool).toHaveBeenCalledWith({
      sessionId: 's1',
      callId: 'c1',
      editedArgs: { path: 'b.md' }
    });
  });

  it('approving with invalid JSON does not call approveTool', async () => {
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /编辑参数|edit args/i }));
    const ta = screen.getByTestId('approval-args-textarea') as HTMLTextAreaElement;
    await userEvent.clear(ta);
    await userEvent.type(ta, '{not json');
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }));
    expect(mockApi.chat.approveTool).not.toHaveBeenCalled();
    expect(screen.getByTestId('approval-json-error')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Create `JsonArgsEditor.tsx`**

```tsx
// src/components/chat/JsonArgsEditor.tsx
import type { JSX } from 'react';
import { useState } from 'react';

interface Props {
  initial: unknown;
  onChange: (parsed: unknown | undefined, error: string | null) => void;
}

export function JsonArgsEditor({ initial, onChange }: Props): JSX.Element {
  const [text, setText] = useState<string>(() => JSON.stringify(initial, null, 2));
  const [err, setErr] = useState<string | null>(null);

  function handle(next: string): void {
    setText(next);
    try {
      const parsed = JSON.parse(next);
      setErr(null);
      onChange(parsed, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      onChange(undefined, msg);
    }
  }

  return (
    <div className="space-y-1">
      <textarea
        data-testid="approval-args-textarea"
        value={text}
        onChange={(e) => handle(e.target.value)}
        rows={8}
        className="w-full resize-none rounded border border-border bg-background p-2 font-mono text-[11px] outline-none focus:border-primary"
      />
      {err && (
        <div data-testid="approval-json-error" className="text-[11px] text-destructive">
          {err}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire edit toggle into `ApprovalPanel.tsx`**

```tsx
import { JsonArgsEditor } from './JsonArgsEditor';

// inside the panel body, add state:
const [editing, setEditing] = useState(false);
const [editedArgs, setEditedArgs] = useState<unknown | undefined>(undefined);
const [editError, setEditError] = useState<string | null>(null);

// Reset on head change
useEffect(() => {
  setEditing(false);
  setEditedArgs(undefined);
  setEditError(null);
}, [head?.callId]);

// in args region — when editing replace renderer:
{editing ? (
  <JsonArgsEditor
    initial={head.args}
    onChange={(parsed, err) => { setEditedArgs(parsed); setEditError(err); }}
  />
) : head.toolName === 'update_frontmatter' && (head.args as any)?.before && (head.args as any)?.after ? (
  <FrontmatterDiff before={(head.args as any).before} after={(head.args as any).after} />
) : (
  <pre data-testid="approval-args-pre" className="overflow-x-auto rounded bg-background p-2 text-[11px]">
    {JSON.stringify(head.args, null, 2)}
  </pre>
)}

// in action row, add edit toggle:
<button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] text-muted-foreground underline">
  {t('chat.approval.edit')}
</button>

// modify approve onClick:
onClick={() => {
  if (editing) {
    if (editError) return;
    void approveTool(activeId, head.callId, editedArgs);
  } else {
    void approveTool(activeId, head.callId);
  }
}}
```

Add missing imports: `useState`, `useEffect`.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/JsonArgsEditor.tsx src/components/chat/ApprovalPanel.tsx src/components/chat/ApprovalPanel.test.tsx
git commit -m "feat(phase-17): editable JSON args + invalid JSON error in approval panel"
```

---

<!-- openspec-task: 6.5 -->
### Task 11: Approve / reject confirmed already pass `editedArgs` and call IPC

**Files:**
- Modify: `src/components/chat/ApprovalPanel.test.tsx`

This is a verification task — the wiring landed in Task 8 + 10. Add an integration-style test that confirms full flow.

- [ ] **Step 1: Append integration test**

```tsx
describe('ApprovalPanel — approve / reject contract', () => {
  it('approve removes the head from queue', async () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1'), mkApproval('c2')] } }
    }));
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /同意|approve/i }));
    const slot = useChatStore.getState().bySession.s1!;
    expect(slot.pendingApprovals.map((a) => a.callId)).toEqual(['c2']);
  });

  it('reject also removes the head from queue', async () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1')] } }
    }));
    render(<ApprovalPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^取消$|^cancel$/i }));
    expect(useChatStore.getState().bySession.s1!.pendingApprovals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ApprovalPanel.test.tsx
git commit -m "test(phase-17): approval queue mutates after approve/reject"
```

---

<!-- openspec-task: 6.6 -->
### Task 12: Queue indicator — "还有 N 条待审" + sequential processing

**Files:**
- Modify: `src/components/chat/ApprovalPanel.tsx` (verify already there) + acceptance test

The queue indicator was added in Task 8 / 10. Confirm + add UI test.

- [ ] **Step 1: Append failing test**

```tsx
describe('ApprovalPanel — queue indicator', () => {
  it('shows "还有 N 条待审" when more than 1 pending', () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1'), mkApproval('c2'), mkApproval('c3')] } }
    }));
    render(<ApprovalPanel />);
    expect(screen.getByText(/还有 2 条待审|2 more pending/i)).toBeTruthy();
  });

  it('hides indicator when only 1 pending', () => {
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [mkApproval('c1')] } }
    }));
    render(<ApprovalPanel />);
    expect(screen.queryByText(/还有.*待审|more pending/i)).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx -t "queue indicator"
```

Expected: PASS — already implemented.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ApprovalPanel.test.tsx
git commit -m "test(phase-17): approval queue indicator shows N more pending"
```

---

<!-- openspec-task: 6.7 -->
### Task 13: `E_APPROVAL_TIMEOUT` → "已超时取消" then auto-remove after 2s

**Files:**
- Modify: `src/stores/chat.ts` (handle `tool.result` with error)
- Modify: `src/stores/chat.test.ts`
- Modify: `src/components/chat/ApprovalPanel.tsx`
- Modify: `src/components/chat/ApprovalPanel.test.tsx`

- [ ] **Step 1: Write failing store test for timeout handling**

Append to `src/stores/chat.test.ts`:

```ts
describe('chat stream subscriber — approval timeout', () => {
  beforeEach(async () => {
    handler = null;
    mockApi.chat.onChatStream = vi.fn((cb: (evt: any) => void) => {
      handler = cb;
      return () => { handler = null; };
    });
    await useChatStore.getState().loadSessions();
    installChatStreamSubscriber();
    handler!({
      sessionId: 's1', type: 'tool.approval-needed',
      callId: 'c1', toolName: 'update_frontmatter', args: {}, reason: ''
    });
  });

  it('tool.result with error E_APPROVAL_TIMEOUT marks the matching pending approval as timedOut', () => {
    handler!({
      sessionId: 's1', type: 'tool.result',
      message: { id: 'tr1', role: 'tool', text: '', toolCallId: 'c1', error: 'E_APPROVAL_TIMEOUT', createdAt: 1 }
    });
    const slot = useChatStore.getState().bySession.s1!;
    const head = slot.pendingApprovals.find((a) => a.callId === 'c1');
    expect(head?.timedOut).toBe(true);
  });
});
```

- [ ] **Step 2: Update `installChatStreamSubscriber` and `PendingApproval`**

In `src/stores/chat.ts`:

```ts
export interface PendingApproval {
  callId: string;
  toolName: string;
  args: unknown;
  reason: string;
  receivedAt: number;
  timedOut?: boolean;
}
```

In the `tool.result` branch of the subscriber, detect timeout:

```ts
case 'tool.call':
  return {
    bySession: { ...s.bySession, [sid]: { ...cur, messages: [...cur.messages, evt.message] } }
  };
case 'tool.result': {
  const m = evt.message as ChatMessage & { toolCallId?: string; error?: string };
  let nextApprovals = cur.pendingApprovals;
  if (m.error === 'E_APPROVAL_TIMEOUT' && m.toolCallId) {
    nextApprovals = cur.pendingApprovals.map((a) =>
      a.callId === m.toolCallId ? { ...a, timedOut: true } : a
    );
  }
  return {
    bySession: {
      ...s.bySession,
      [sid]: { ...cur, messages: [...cur.messages, evt.message], pendingApprovals: nextApprovals }
    }
  };
}
```

(Adjust `ChatMessage` type if needed to include `error?: string`.)

- [ ] **Step 3: Run store test**

```bash
npx vitest run src/stores/chat.test.ts -t "approval timeout"
```

Expected: PASS.

- [ ] **Step 4: Add UI handling in `ApprovalPanel.tsx`**

In the panel body, when `head.timedOut`, render the timeout banner and auto-remove after 2s:

```tsx
useEffect(() => {
  if (!head?.timedOut || !activeId) return;
  const tid = setTimeout(() => {
    void rejectTool(activeId, head.callId);
  }, 2000);
  return () => clearTimeout(tid);
}, [head?.callId, head?.timedOut, activeId, rejectTool]);

// in body:
{head.timedOut ? (
  <div className="rounded bg-destructive/10 p-2 text-xs text-destructive" data-testid="approval-timed-out">
    {t('chat.approval.timeout')}
  </div>
) : (
  // existing args region...
)}
```

- [ ] **Step 5: Write UI test for timeout banner**

Append:

```tsx
describe('ApprovalPanel — timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useChatStore.setState((s) => ({
      bySession: { ...s.bySession, s1: { ...s.bySession.s1, pendingApprovals: [{ ...mkApproval('c1'), timedOut: true }] } }
    }));
  });
  afterEach(() => vi.useRealTimers());

  it('shows timeout banner', () => {
    render(<ApprovalPanel />);
    expect(screen.getByTestId('approval-timed-out')).toBeTruthy();
  });

  it('auto-rejects after 2 seconds', () => {
    render(<ApprovalPanel />);
    vi.advanceTimersByTime(2100);
    expect(mockApi.chat.rejectTool).toHaveBeenCalledWith({ sessionId: 's1', callId: 'c1' });
  });
});
```

- [ ] **Step 6: Run all approval tests**

```bash
npx vitest run src/components/chat/ApprovalPanel.test.tsx src/stores/chat.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/chat.ts src/stores/chat.test.ts src/components/chat/ApprovalPanel.tsx src/components/chat/ApprovalPanel.test.tsx
git commit -m "feat(phase-17): handle E_APPROVAL_TIMEOUT — banner + auto-reject 2s"
```

---

## Plan 3 verification

After all 13 tasks:

- [ ] `npm run test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Manual: `npm run dev`, send a real message — see streaming render; trigger a tool call → approval panel slides in; confirm approve/reject behavior. (Agent-loop attachment plumbing is Plan 4.)

If any step fails, fix before proceeding to Plan 4.
