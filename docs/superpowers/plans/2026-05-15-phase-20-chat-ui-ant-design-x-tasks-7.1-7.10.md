# Phase 20 · Chat UI Ant Design X — Tasks 7.1–7.10 (Cleanup)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `/opsx:executing-plans phase-20-chat-ui-ant-design-x` to execute this plan task-by-task and sync progress back to OpenSpec `tasks.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the 16 obsolete legacy chat component files + their 5 obsolete test files, swap the small auxiliary widgets (`ChatBanner` → antd `Alert`, `SessionStatusBadge` → antd `Badge`, `ShortcutsDialog` → antd `Modal`), grep-and-clean lingering chat-domain `@radix-ui/react-dialog` / `@radix-ui/react-dropdown-menu` imports (deciding via Plan 1 Task 3 findings whether to remove the packages from `package.json`), rewrite `src/__acceptance__/chat-acceptance.test.tsx` to (a) update `mkSlot()` (drop `streamingBuffer` / `flushedLength`, add `status`), (b) move from radix `data-testid` selectors to ARIA roles + i18n names, (c) switch streaming assertions from DOM textContent to store status, while keeping every business assertion and the K1 IPC mock surface untouched. Finally verify `ProfileFooter.test.tsx` + `FrontmatterDiff.test.tsx` still pass (token-only theming differences don't break assertions), and adapt `JsonArgsEditor` styling to antd tokens.

**Architecture:**

- **Deletion list (Task 1)** — 16 files (all under `src/components/chat/`):
  `SessionList.tsx`, `SessionListRow.tsx`, `SessionContextMenu.tsx`, `MessageList.tsx`, `UserBubble.tsx`, `AssistantMarkdown.tsx`, `ToolCallCard.tsx`, `ToolResultCard.tsx`, `ChatInput.tsx`, `AttachmentChips.tsx`, `ApprovalPanel.tsx`, `MessageOps.tsx`, `DeleteSessionDialog.tsx`, `ShortcutsDialog.tsx`, `ChatBanner.tsx`, `SessionStatusBadge.tsx`. Note: `ShortcutsDialog` / `ChatBanner` / `SessionStatusBadge` are deleted only after Tasks 3-5 swap their usages.
- **Test deletions (Task 2)**: `SessionList.test.tsx`, `MessageList.test.tsx`, `AttachmentChips.test.tsx`, `ApprovalPanel.test.tsx`, `ChatInput.test.tsx`.
- **Survivors**: `JsonArgsEditor.tsx`, `FrontmatterDiff.tsx`, `ProfileFooter.tsx`, `FrontmatterDiff.test.tsx`, `ProfileFooter.test.tsx`. Plus the 9 new Plan-2/Plan-3 files.
- **`ChatBanner` → antd `Alert`**: Find usages, render `<Alert message={...} type="error" banner closable />` inline.
- **`SessionStatusBadge` → antd `Badge`**: Find usages, render `<Badge status="processing" />` (or `dot`) inline.
- **`ShortcutsDialog` → antd `Modal`**: Two choices per design.md Open Question 5 — pick command-form `Modal.useModal()` or component form `<Modal open ... />`. Recommended: component form because the existing usage opens conditionally via `showShortcutsBump`.
- **Radix cleanup**: After deletions, `grep` any remaining chat-domain imports of `@radix-ui/react-dialog` / `@radix-ui/react-dropdown-menu`. Plan 1 Task 3 inventoried non-chat usage; if non-chat usage is non-empty, KEEP the packages; if zero, REMOVE them from `package.json`.
- **Acceptance test rewrite**: This is the most surgical edit. Goal: same business behavior covered, but selectors use `getByRole` + i18n-resolved name; streaming uses `useChatStore.getState().bySession[id].messages[i].status` rather than DOM `textContent`. The K1 IPC mock surface (`ipc.chat.onStream`, `ipc.chat.sendUserMessage`, etc.) is identical.
- **`JsonArgsEditor` antd token adaptation**: replace bespoke border / font CSS with antd token-aware classes (e.g. `var(--color-line)` / `var(--color-ink)` already mapped to antd tokens by Plan 1, so existing inline styles may already work; if there's Radix-specific styling, swap to antd `Input.TextArea`).

**Tech Stack:** `antd` (`Alert`, `Badge`, `Modal`), Zustand, vitest, RTL, no new dependencies.

**Repo conventions:** as in earlier plans.

---

<!-- openspec-task: 7.3 -->
### Task 1: Replace ChatBanner usages with antd Alert

**Files:**
- Modify: any file currently importing `ChatBanner`
- Inspect: `src/components/chat/ChatBanner.tsx`

- [ ] **Step 1: Find ChatBanner imports**

Run: `grep -rn "ChatBanner" /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null`

After Plan 3 Task 12 rewrote `Chat.tsx`, the import there is already removed. Verify. Expected sites: maybe `Chat.test.tsx` or none.

- [ ] **Step 2: Read ChatBanner.tsx to know what it renders**

Read `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ChatBanner.tsx`. It typically subscribes to a session `error` field and renders a dismissible banner.

- [ ] **Step 3: Inline an antd Alert wherever needed**

In every file that imported `ChatBanner`, replace the `<ChatBanner />` JSX with:

```tsx
import { Alert } from 'antd'
import { useChatStore } from '@/stores/chat'

function ChatErrorBanner() {
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const error = useChatStore((s) =>
    activeSessionId ? s.bySession[activeSessionId]?.error : null,
  )
  if (!error) return null
  return (
    <Alert
      message={error}
      type="error"
      banner
      closable
      onClose={() => {
        // optional: provide a clearError action in store, or just unmount on next session change
      }}
    />
  )
}
```

If `Chat.tsx` doesn't import ChatBanner anymore, place this `ChatErrorBanner` inline inside `Chat.tsx` above the BubbleListAdapter section, so the error stays visible while the user reads it.

Update `Chat.tsx`:

```tsx
<Flex vertical style={{ flex: 1, minWidth: 0, height: '100%' }}>
  <ChatErrorBanner />
  {isEmpty ? (...) : <BubbleListAdapter />}
  <ChatInputArea />
  <ProfileFooter />
</Flex>
```

- [ ] **Step 4: Run typecheck and commit**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web`
Expected: pass.

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat-page): replace ChatBanner with antd Alert"
```

---

<!-- openspec-task: 7.4 -->
### Task 2: Replace SessionStatusBadge usages with antd Badge

**Files:**
- Modify: any file currently importing `SessionStatusBadge`

- [ ] **Step 1: Find usages**

Run: `grep -rn "SessionStatusBadge" /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null`

After Plan 3 Task 12 rewrote `Chat.tsx`, the import is removed there. If `ConversationsAdapter` or any other Plan-2/3 component needs a status indicator, inline antd `Badge` at the usage site.

- [ ] **Step 2: Inline antd Badge if needed**

Where session status (streaming / awaiting-approval / error) needs a visual cue, use:

```tsx
import { Badge } from 'antd'

<Badge status={mapStatusToAntd(status)} text={...} />

function mapStatusToAntd(s: 'idle' | 'streaming' | 'awaiting-approval' | 'error') {
  switch (s) {
    case 'streaming':         return 'processing'
    case 'awaiting-approval': return 'warning'
    case 'error':             return 'error'
    default:                  return 'default'
  }
}
```

If no usages are found (Plan 3 already incorporates background-session red dots via inline `Badge dot` in `ConversationsAdapter`), this task is a no-op.

- [ ] **Step 3: Commit (or no-op)**

If a change was made:
```bash
git add <files>
git commit -m "feat(chat-session-list): replace SessionStatusBadge with antd Badge"
```

If no usages remain:
```bash
git commit --allow-empty -m "chore(chat): SessionStatusBadge usages already absorbed by ConversationsAdapter"
```

---

<!-- openspec-task: 7.5 -->
### Task 3: Replace ShortcutsDialog with antd Modal

**Files:**
- Modify: `src/pages/Chat.tsx` (or wherever the dialog mounts)
- Inspect: `src/components/chat/ShortcutsDialog.tsx`

- [ ] **Step 1: Read ShortcutsDialog.tsx to see its content (list of hotkeys)**

Read `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/ShortcutsDialog.tsx`. Copy the list of hotkey labels — they need to be preserved in the antd Modal body.

- [ ] **Step 2: Create a `ShortcutsModal` component inside Chat.tsx (or as a new file)**

Add to `src/pages/Chat.tsx` (top-level, above `function Chat()`):

```tsx
import { Modal } from 'antd'

function ShortcutsModal() {
  const { t } = useTranslation()
  const showShortcutsBump = useChatStore((s) => s.showShortcutsBump)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (showShortcutsBump > 0) setOpen(true)
  }, [showShortcutsBump])

  return (
    <Modal
      open={open}
      onCancel={() => setOpen(false)}
      title={t('chat.shortcuts.title')}
      footer={null}
      width={480}
    >
      <ul style={{ paddingLeft: 16, margin: 0 }}>
        <li><kbd>Cmd+Enter</kbd> — {t('chat.shortcuts.send')}</li>
        <li><kbd>Enter</kbd> — {t('chat.shortcuts.newline')}</li>
        <li><kbd>Esc</kbd> — {t('chat.shortcuts.cancel')}</li>
        <li><kbd>Cmd+K</kbd> — {t('chat.shortcuts.quickSwitcher')}</li>
        <li><kbd>?</kbd> — {t('chat.shortcuts.help')}</li>
      </ul>
    </Modal>
  )
}
```

(Use the exact key list from the existing `ShortcutsDialog.tsx`. The above is a representative set.)

- [ ] **Step 3: Mount it inside Chat.tsx return**

Add `<ShortcutsModal />` at the bottom of the outer `<Flex>` in `Chat.tsx`:

```tsx
return (
  <Flex style={{ height: '100%', width: '100%' }}>
    {/* ... existing columns ... */}
    <ShortcutsModal />
  </Flex>
)
```

- [ ] **Step 4: Add i18n keys for the shortcuts namespace**

Append to `src/i18n/locales/zh.json` under `"chat"`:

```jsonc
"shortcuts": {
  "title": "快捷键",
  "send": "发送消息",
  "newline": "换行",
  "cancel": "取消当前流",
  "quickSwitcher": "快速切换",
  "help": "显示快捷键"
}
```

Mirror in `en.json`. If keys already exist, reuse them.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat.tsx src/i18n/locales/zh.json src/i18n/locales/en.json
git commit -m "feat(chat-page): replace ShortcutsDialog with antd Modal"
```

---

<!-- openspec-task: 7.1 -->
### Task 4: Delete 16 obsolete chat component files

**Files (delete):**
- `src/components/chat/SessionList.tsx`
- `src/components/chat/SessionListRow.tsx`
- `src/components/chat/SessionContextMenu.tsx`
- `src/components/chat/MessageList.tsx`
- `src/components/chat/UserBubble.tsx`
- `src/components/chat/AssistantMarkdown.tsx`
- `src/components/chat/ToolCallCard.tsx`
- `src/components/chat/ToolResultCard.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/AttachmentChips.tsx`
- `src/components/chat/ApprovalPanel.tsx`
- `src/components/chat/MessageOps.tsx`
- `src/components/chat/DeleteSessionDialog.tsx`
- `src/components/chat/ShortcutsDialog.tsx`
- `src/components/chat/ChatBanner.tsx`
- `src/components/chat/SessionStatusBadge.tsx`

- [ ] **Step 1: Verify each file has no remaining import**

For each file in the list above, run a grep:

```bash
for f in SessionList SessionListRow SessionContextMenu MessageList UserBubble AssistantMarkdown ToolCallCard ToolResultCard ChatInput AttachmentChips ApprovalPanel MessageOps DeleteSessionDialog ShortcutsDialog ChatBanner SessionStatusBadge; do
  echo "=== $f ==="
  grep -rn "from.*chat/${f}" /Users/aaa/develop/workspace-ai/acornvo/src 2>/dev/null
done
```

Each block should print zero lines (except the file's own definition). If any non-test file still imports a target file, STOP and patch the importer (likely a missed Plan 3 Task).

If a test file imports the target, that test is in the Task 5 deletion list — leave it for now, the test will be deleted next.

- [ ] **Step 2: Delete the 16 files**

```bash
cd /Users/aaa/develop/workspace-ai/acornvo
rm src/components/chat/SessionList.tsx
rm src/components/chat/SessionListRow.tsx
rm src/components/chat/SessionContextMenu.tsx
rm src/components/chat/MessageList.tsx
rm src/components/chat/UserBubble.tsx
rm src/components/chat/AssistantMarkdown.tsx
rm src/components/chat/ToolCallCard.tsx
rm src/components/chat/ToolResultCard.tsx
rm src/components/chat/ChatInput.tsx
rm src/components/chat/AttachmentChips.tsx
rm src/components/chat/ApprovalPanel.tsx
rm src/components/chat/MessageOps.tsx
rm src/components/chat/DeleteSessionDialog.tsx
rm src/components/chat/ShortcutsDialog.tsx
rm src/components/chat/ChatBanner.tsx
rm src/components/chat/SessionStatusBadge.tsx
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm run typecheck:web 2>&1 | tail -30`
Expected: pass.

If failures appear, the failing import points to a non-test file that wasn't updated. Patch it (most likely scenario: an import from a file written in a previous plan still uses the old path).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(chat): delete 16 legacy chat component files (replaced by Plan 2/3 adapters)"
```

---

<!-- openspec-task: 7.2 -->
### Task 5: Delete 5 obsolete chat component tests

**Files (delete):**
- `src/components/chat/SessionList.test.tsx`
- `src/components/chat/MessageList.test.tsx`
- `src/components/chat/AttachmentChips.test.tsx`
- `src/components/chat/ApprovalPanel.test.tsx`
- `src/components/chat/ChatInput.test.tsx`

- [ ] **Step 1: Confirm each test exists and targets a deleted component**

Run: `ls /Users/aaa/develop/workspace-ai/acornvo/src/components/chat/*.test.tsx | grep -E "SessionList|MessageList|AttachmentChips|ApprovalPanel|ChatInput"`
Expected: 5 lines.

- [ ] **Step 2: Delete them**

```bash
cd /Users/aaa/develop/workspace-ai/acornvo
rm src/components/chat/SessionList.test.tsx
rm src/components/chat/MessageList.test.tsx
rm src/components/chat/AttachmentChips.test.tsx
rm src/components/chat/ApprovalPanel.test.tsx
rm src/components/chat/ChatInput.test.tsx
```

- [ ] **Step 3: Run vitest to confirm no regression**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run`
Expected: all surviving tests pass. (Acceptance still failing — Task 7 fixes.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(chat): delete 5 legacy chat component tests (replaced by Plan 2/3 tests)"
```

---

<!-- openspec-task: 7.6 -->
### Task 6: Grep chat-domain Radix dialog/dropdown imports and decide package retention

**Files:**
- Possibly modify: `package.json` (depends on Plan 1 Task 3 inventory)

- [ ] **Step 1: Final chat-domain grep**

Run:
```bash
grep -rn "from '@radix-ui/react-dialog'" /Users/aaa/develop/workspace-ai/acornvo/src/components/chat /Users/aaa/develop/workspace-ai/acornvo/src/pages/Chat.tsx 2>/dev/null
grep -rn "from '@radix-ui/react-dropdown-menu'" /Users/aaa/develop/workspace-ai/acornvo/src/components/chat /Users/aaa/develop/workspace-ai/acornvo/src/pages/Chat.tsx 2>/dev/null
```

Expected: zero results in either grep — Plan 2/3/Task 4 above eliminated all chat-domain Radix imports.

If any remain (e.g. a leftover `ProfileChip` Radix DropdownMenu in `Chat.tsx`), refactor to antd `Dropdown`:

```tsx
import { Dropdown } from 'antd'

<Dropdown
  menu={{
    items: profiles.map((p) => ({
      key: p.id,
      label: <>{p.name}<span style={{ marginLeft: 8, opacity: 0.6 }}>{p.model}</span></>,
      onClick: () => updateSessionProfile(sessionId, p.id),
    })),
  }}
>
  <button type="button">{...}</button>
</Dropdown>
```

- [ ] **Step 2: Check Plan 1 Task 3's non-chat inventory**

Run: `git log --all --grep="inventory react-markdown" --oneline -n 3` to recover the commit message that recorded Plan 1's grep results.

Open the commit body. Look at the four count tuples for radix-dialog and radix-dropdown-menu.

Decision rule:
- `@radix-ui/react-dialog` non-chat hits == 0 → remove from `package.json`
- `@radix-ui/react-dropdown-menu` non-chat hits == 0 → remove from `package.json`

- [ ] **Step 3: Apply package.json updates if removal is justified**

If both packages are unused outside chat:

Edit `package.json` and delete:
```jsonc
"@radix-ui/react-dialog": "^1.1.15",
"@radix-ui/react-dropdown-menu": "^2.1.16",
```

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npm install` to update lockfile.

If non-chat hits exist for either, keep that package. Note the decision in the commit message.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json 2>/dev/null
git commit -m "chore(deps): remove @radix-ui/react-{dialog,dropdown-menu} from chat (no other consumers)" || \
git commit --allow-empty -m "chore(deps): keep @radix-ui/react-{dialog,dropdown-menu} — used outside chat domain"
```

(Pick whichever message matches the actual change.)

---

<!-- openspec-task: 7.7 -->
### Task 7: Rewrite src/__acceptance__/chat-acceptance.test.tsx — mkSlot + selectors + streaming assertions

**Files:**
- Modify: `src/__acceptance__/chat-acceptance.test.tsx`

- [ ] **Step 1: Read the existing acceptance test thoroughly**

Read `/Users/aaa/develop/workspace-ai/acornvo/src/__acceptance__/chat-acceptance.test.tsx` end-to-end. Make a list of:
- Every `mkSlot()` call site
- Every `data-testid` selector
- Every assertion based on DOM `textContent` for streaming output
- The IPC mock surface (whatever `vi.mock('@/ipc/client', ...)` exposes — usually `ipc.chat.onStream`, `ipc.chat.sendUserMessage`, `ipc.chat.cancelStream`, `ipc.chat.approveTool`, etc.)

Do NOT change the IPC mock surface — phase-20 design.md is explicit: K1 IPC mock stays as-is.

- [ ] **Step 2: Update `mkSlot()` helper**

Find the helper (likely a top-level function in the test file). Change its return shape:

```ts
// BEFORE
function mkSlot(overrides: Partial<SessionState> = {}): SessionState {
  return {
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
    ...overrides,
  }
}

// AFTER
function mkSlot(overrides: Partial<SessionState> = {}): SessionState {
  return {
    loaded: true,
    messages: [],
    pendingApprovals: [],
    pendingAttachments: [],
    pendingPromptText: '',
    status: 'idle',
    error: null,
    lastUserText: '',
    lastUserAttachments: [],
    ...overrides,
  }
}

function mkAssistantMessage(text: string, status: 'streaming' | 'done' = 'done', extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: extra.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    text,
    status,
    createdAt: Date.now(),
    ...extra,
  }
}
```

- [ ] **Step 3: Replace data-testid selectors with ARIA roles + i18n names**

Common mappings (apply per occurrence — read each test case and pick the right replacement):

| Old | New |
|---|---|
| `getByTestId('chat-session-list')` | `getByRole('list', { name: /会话|sessions/i })` — or use the Conversations container by a known group label like "今日"/"Today" |
| `getByTestId('chat-empty-card')` | `getByRole('button', { name: /<i18n card1 text>/ })` — match the prompt label |
| `getByTestId('chat-shortcuts-btn')` | `getByRole('button', { name: /快捷键|Shortcuts/i })` — actually this button is `?` icon; use `getByLabelText(/快捷键/)` |
| `getByTestId('chat-profile-chip')` | `getByRole('button', { name: /<profile name>|未配置|noProfile/ })` |
| `getByTestId('chat-main')` | `getByRole('main')` — `Chat.tsx` no longer uses `<main>` directly inside the Flex; if needed, wrap the right column with `role="main"` |

Pseudocode example:

```ts
// BEFORE
const sessionList = screen.getByTestId('chat-session-list')

// AFTER (Conversations renders a tablist or list — confirm via dev tools)
const sessionList = await screen.findByRole('list')
```

If the antd-x `Conversations` rendered DOM doesn't have an obvious accessible name, fall back to `screen.getByLabelText(t('chat.sessionsAriaLabel'))` and add `aria-label={t('chat.sessionsAriaLabel')}` to `<ConversationsAdapter>` (wrap with `<nav aria-label="...">`).

Iterate one test case at a time: run only that case, fix selectors, move on.

- [ ] **Step 4: Replace streaming DOM assertions with store status assertions**

Search the test file for assertions like:

```ts
// BEFORE
expect(screen.getByTestId('chat-message-list').textContent).toContain('hello')
```

Replace with store-state assertions where possible:

```ts
// AFTER (preferred — direct store check)
const sid = useChatStore.getState().activeSessionId!
const last = useChatStore.getState().bySession[sid].messages.at(-1)!
expect(last.role).toBe('assistant')
expect(last.text).toBe('hello')
expect(last.status).toBe('streaming') // or 'done' depending on the test case
```

For purely visual assertions (e.g. "the user sees a typing indicator"), use:

```ts
const sid = useChatStore.getState().activeSessionId!
expect(useChatStore.getState().bySession[sid].status).toBe('streaming')
// OR — but flakier — find Bubble.loading className
```

- [ ] **Step 5: Disable token batching in test setup**

To make streaming assertions deterministic, set batching off in `beforeEach`:

```ts
import { __setChatTokenBatching } from '@/stores/chat'
beforeEach(() => {
  __setChatTokenBatching(false)
})
```

- [ ] **Step 6: Run the acceptance suite iteratively**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/__acceptance__/chat-acceptance.test.tsx --reporter=verbose 2>&1 | tail -80`

For each failing test, read the error, fix the selector or assertion, rerun. Common patterns:
- `Unable to find role "..."` → the rendered antd DOM uses a different role; check with `screen.debug()`.
- `expected ... but got ...` for status — check that the test fires events in the right order. Each token / message.appended / done call requires the same `emit` helper used in `chat.test.ts`.

- [ ] **Step 7: Commit when all green**

```bash
git add src/__acceptance__/chat-acceptance.test.tsx
git commit -m "test(chat-acceptance): rewrite selectors (ARIA + i18n) and streaming assertions (store status) for antd-x"
```

---

<!-- openspec-task: 7.8 -->
### Task 8: Verify ProfileFooter.test.tsx still passes

**Files:**
- Inspect: `src/components/chat/ProfileFooter.test.tsx` (no edit unless red)

- [ ] **Step 1: Run the test**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/ProfileFooter.test.tsx`
Expected: PASS.

- [ ] **Step 2: If red, identify cause**

Typical reasons:
- ProfileFooter imports `class-variance-authority` or `@radix-ui/react-slot` for styling; antd token migration may have changed expected classes.
- I18n keys missing.

Patch only the minimum needed to restore the test. Do NOT refactor unrelated code.

- [ ] **Step 3: Commit if changed**

```bash
git add src/components/chat/ProfileFooter.test.tsx src/components/chat/ProfileFooter.tsx 2>/dev/null
git commit -m "chore(chat): minor ProfileFooter token adjustments after antd migration" || \
git commit --allow-empty -m "chore(chat): ProfileFooter.test.tsx unchanged after antd migration"
```

---

<!-- openspec-task: 7.9 -->
### Task 9: Verify FrontmatterDiff.test.tsx still passes

**Files:**
- Inspect: `src/components/chat/FrontmatterDiff.test.tsx` (no edit expected)

- [ ] **Step 1: Run the test**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/FrontmatterDiff.test.tsx`
Expected: PASS unchanged.

- [ ] **Step 2: If red, identify cause and patch minimally**

This component is pure diff rendering; antd theming should not affect logic. If failing, likely a missing dep or i18n key. Patch.

- [ ] **Step 3: Commit if changed**

```bash
git commit --allow-empty -m "chore(chat): FrontmatterDiff.test.tsx unchanged after antd migration"
```

---

<!-- openspec-task: 7.10 -->
### Task 10: Adapt JsonArgsEditor styling to antd tokens

**Files:**
- Modify: `src/components/chat/JsonArgsEditor.tsx`

- [ ] **Step 1: Read the current implementation**

Read `/Users/aaa/develop/workspace-ai/acornvo/src/components/chat/JsonArgsEditor.tsx`. It likely uses Tailwind classes (`border-border`, `bg-background`, `text-foreground`) and renders a `<textarea>`.

- [ ] **Step 2: Swap to antd Input.TextArea**

Replace the bespoke `<textarea>` with antd's controlled input:

```tsx
import { Input } from 'antd'
const { TextArea } = Input

// inside the component body, replace the existing textarea JSX with:
<TextArea
  value={textValue}
  onChange={(e) => handleChange(e.target.value)}
  rows={8}
  status={jsonValid ? undefined : 'error'}
  style={{ fontFamily: 'monospace' }}
/>
```

Preserve the existing onChange handler logic (parse → setState → call props.onChange with parsed value). Pass `valid` boolean to `props.onChange(parsed, valid)` if Plan 3 Task 5 ApprovalDrawer relies on this — confirm by re-reading ApprovalDrawer's onChange callback.

- [ ] **Step 3: Run JsonArgsEditor tests (if any) and ApprovalDrawer tests**

Run: `cd /Users/aaa/develop/workspace-ai/acornvo && npx vitest run src/components/chat/JsonArgsEditor src/components/chat/ApprovalDrawer.test.tsx`
Expected: pass.

If `ApprovalDrawer.test.tsx` fails because the JSON textbox is no longer `screen.getByRole('textbox')`, update the test selector to match antd `TextArea`'s rendered role (often still `textbox`, but verify).

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/JsonArgsEditor.tsx src/components/chat/ApprovalDrawer.test.tsx 2>/dev/null
git commit -m "feat(chat-approval-panel): JsonArgsEditor uses antd Input.TextArea for token-aligned styling"
```

---

## Plan completion checklist

After all 10 tasks pass, before moving to Plan 6:

- [ ] 16 legacy chat component files deleted from `src/components/chat/`.
- [ ] 5 legacy chat test files deleted.
- [ ] `ChatBanner` usage replaced by antd `Alert` (inline in `Chat.tsx`).
- [ ] `SessionStatusBadge` usage replaced by antd `Badge` (or no-op if Plan 3 already covered it).
- [ ] `ShortcutsDialog` usage replaced by antd `Modal` (inline in `Chat.tsx`).
- [ ] Chat-domain `@radix-ui/react-dialog` + `@radix-ui/react-dropdown-menu` imports = 0; packages either kept (non-chat usage) or removed per Plan 1 inventory.
- [ ] `src/__acceptance__/chat-acceptance.test.tsx` rewritten: `mkSlot` updated, selectors moved to ARIA/i18n, streaming assertions use store status. K1 IPC mock surface unchanged.
- [ ] `ProfileFooter.test.tsx` passes; minimal or no edits.
- [ ] `FrontmatterDiff.test.tsx` passes unchanged.
- [ ] `JsonArgsEditor.tsx` uses antd `Input.TextArea`; ApprovalDrawer test still green.
- [ ] `npx vitest run` passes overall.
- [ ] `npm run typecheck` passes.
