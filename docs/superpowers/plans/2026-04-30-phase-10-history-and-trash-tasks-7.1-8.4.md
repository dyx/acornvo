# Phase 10 History & Trash — Plan 4 (Tasks 7.1–8.4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the i18n strings for the trash / history / diff / ops UI surfaces (zh-CN baseline) and run the four end-to-end acceptance scenarios for the trash UX (right-click, keyboard, editor-bypass, fallback hard-delete) so that Plans 1–3 are wired into a user-facing whole.

**Architecture:** Phase 10 is a Chinese-first UI; the repo uses `react-i18next` with a single flat `src/i18n/locales/zh-CN.json` resource registered via `src/i18n/index.ts` (no en-US fallback resource yet — `fallbackLng` is also `'zh-CN'`). All 7.x tasks land verbatim JSON additions in that one file and replace any leftover hardcoded zh strings introduced by Plans 2/3 with `t('...')` calls. The 8.x acceptance tasks are integration-style (vitest + jsdom + `@testing-library/react` + mocked `ipc`) and live under `src/integration/phase-10-trash.test.tsx`; this is the same shape used by phase-09's Plan 4 (`src/integration/conflict-handling.test.ts`). True Electron+disk verification is captured as a 3-line manual smoke at the end of each 8.x task.

**Tech Stack:** `i18next` 26 + `react-i18next` 17 (already installed), `vitest` 2 + `jsdom` 29 + `@testing-library/react` 16 + `@testing-library/jest-dom` 6 (already installed). No Playwright / Spectron in this repo — vitest + RTL with mocked `window.api` is the established acceptance harness (see `tests/acceptance/phase-05/`, `src/components/IndexProgressOverlay.test.tsx`).

---

## Pre-flight

Plans 1, 2, and 3 of phase-10 must be merged. Verify:

```bash
test -f /Users/aaa/develop/workspace-ai/acornvo/electron/services/trash.ts && \
test -f /Users/aaa/develop/workspace-ai/acornvo/src/components/library/TrashConfirmDialog.tsx && \
test -f /Users/aaa/develop/workspace-ai/acornvo/src/pages/HistoryPage.tsx && \
echo "OK plans 1/2/3 present"
```

Anchor the i18n work to the actual repo layout (do this **first** in Task 1 below — it is also recorded here for context):

```bash
ls /Users/aaa/develop/workspace-ai/acornvo/src/i18n/
ls /Users/aaa/develop/workspace-ai/acornvo/src/i18n/locales/
```

Expected (as of 2026-04-30):

```
src/i18n/index.ts
src/i18n/locales/zh-CN.json
```

There is **no** en-US JSON and **no** namespace split — every key in this plan goes into the single flat object in `src/i18n/locales/zh-CN.json`. The init code already enables `interpolation.escapeValue: false`, so `{{path}}` placeholders work directly with `t('...', { path })`.

Verify the test bar is green at HEAD before starting:

```bash
npm test
```

Expected: all PASS (or document any pre-existing failure before proceeding).

## File Structure

| Path                                             | Action                                                       | Owner task                   |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------- |
| `src/i18n/locales/zh-CN.json`                    | Modify (add keys 7.1–7.6)                                    | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 |
| `src/i18n/phase-10.test.ts`                      | Create (assertion bundle for all 7.x keys)                   | 7.1, 7.2, 7.3, 7.4, 7.5, 7.6 |
| `src/components/history/HistoryTabs.tsx`         | Modify (replace hardcoded labels with `t('history.tabs.*')`) | 7.1                          |
| `src/components/library/TrashConfirmDialog.tsx`  | Modify (use `t('trash.*')` keys)                             | 7.2                          |
| `src/components/history/TrashTab.tsx`            | Modify (use `t('history.trash.notice')`)                     | 7.3                          |
| `src/components/history/ConflictsTab.tsx`        | Modify (use `t('history.conflicts.clear_all*')`)             | 7.4                          |
| `src/components/history/ConflictDetailPanel.tsx` | Modify (use `t('diff.view.*')`)                              | 7.5                          |
| `src/components/history/OpsRow.tsx`              | Modify (use `t('ops.op.*', { path, ... })`)                  | 7.6                          |
| `src/integration/phase-10-trash.test.tsx`        | Create                                                       | 8.1, 8.2, 8.3, 8.4           |

## Conventions reused

- **i18n init test bootstrap:** every i18n test file starts with `import { i18n } from '@/i18n'` then `beforeAll(() => { void i18n.changeLanguage('zh-CN') })`. The init in `src/i18n/index.ts` runs on import — no extra setup needed.
- **Interpolation:** `{{path}}`, `{{count}}`, `{{resolved_by}}`, `{{new_path}}` — all single-brace `{{ }}` per i18next default.
- **IPC mock pattern (matches phase-09 Plan 4):**
  ```ts
  const mockIpc: any = {
    file: { trash: vi.fn(), hardDelete: vi.fn() },
    ops: { list: vi.fn().mockResolvedValue({ rows: [] }) },
    on: vi.fn().mockReturnValue(() => {})
  }
  vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))
  ```
- **Component tests use `userEvent` v14** (already in devDeps via `@testing-library/react` peer): right-click via `await userEvent.pointer({ keys: '[MouseRight>]', target: row })`; keyboard via `await userEvent.keyboard('{Meta>}{Backspace}{/Meta}')`.
- **`t()` assertions** use the imported singleton `i18n.t(...)` — no React render needed for the 7.x test bundle.
- **No new files outside the table.** Replace, do not duplicate.

---

<!-- openspec-task: 7.1 -->

### Task 1: i18n keys for `history.tabs.*`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Create: `src/i18n/phase-10.test.ts`
- Modify: `src/components/history/HistoryTabs.tsx`

- [ ] **Step 0: Confirm i18n layout (preflight anchor)**

```bash
ls /Users/aaa/develop/workspace-ai/acornvo/src/i18n/
ls /Users/aaa/develop/workspace-ai/acornvo/src/i18n/locales/
```

Expected output: `index.ts` and `locales/`; inside `locales/` exactly `zh-CN.json`. If the layout has changed (extra namespace files, en-US added), pause and update each "**Files**" line in this plan before continuing.

- [ ] **Step 1: Add the keys to `zh-CN.json`**

Open `src/i18n/locales/zh-CN.json`. Inside the top-level object, add a new `"history"` object (sibling of `"index"`). Verbatim JSON:

```json
"history": {
  "tabs": {
    "trash": "废纸篓",
    "conflicts": "冲突",
    "ops": "操作"
  }
}
```

(If a `"history"` block already exists from Plans 2/3, merge the `"tabs"` sub-object into it — do not create a duplicate `"history"` key.)

- [ ] **Step 2: Create the i18n test bundle file with the 7.1 cases**

Create `src/i18n/phase-10.test.ts`:

```ts
import { describe, it, beforeAll, expect } from 'vitest'
import { i18n } from '@/i18n'

beforeAll(async () => {
  await i18n.changeLanguage('zh-CN')
})

describe('phase-10 i18n: history.tabs', () => {
  it('history.tabs.trash → 废纸篓', () => {
    expect(i18n.t('history.tabs.trash')).toBe('废纸篓')
  })
  it('history.tabs.conflicts → 冲突', () => {
    expect(i18n.t('history.tabs.conflicts')).toBe('冲突')
  })
  it('history.tabs.ops → 操作', () => {
    expect(i18n.t('history.tabs.ops')).toBe('操作')
  })
})
```

- [ ] **Step 3: Wire `HistoryTabs.tsx` to the keys**

Open `src/components/history/HistoryTabs.tsx` (created in Plan 3). Replace any hardcoded label literal (e.g. `>废纸篓<`, `>冲突<`, `>操作<`) with `t('history.tabs.trash')` / `t('history.tabs.conflicts')` / `t('history.tabs.ops')`. Add `const { t } = useTranslation()` at the top of the component if not present. Imports:

```ts
import { useTranslation } from 'react-i18next'
```

- [ ] **Step 4: Run, confirm pass**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "history.tabs"
```

Expected: 3 PASS.

Manual smoke (3 lines, the human gate):

1. `npm run dev`; navigate to `/history`.
2. Confirm the three tab labels read 废纸篓 / 冲突 / 操作.
3. Switch to a fresh language via DevTools (`i18n.changeLanguage('zh-CN')` is the only registered locale — labels must persist).

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/history/HistoryTabs.tsx
git commit -m "feat(i18n): history.tabs keys + HistoryTabs wired (phase-10 7.1)"
```

---

<!-- openspec-task: 7.2 -->

### Task 2: i18n keys for `trash.*`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/phase-10.test.ts`
- Modify: `src/components/library/TrashConfirmDialog.tsx`

- [ ] **Step 1: Add the keys to `zh-CN.json`**

Inside the top-level object, add (sibling of `"history"`):

```json
"trash": {
  "confirm_title": "移到废纸篓？",
  "confirm_body": "{{path}} 将被移至系统回收站。可在系统回收站中找回。",
  "fallback_title": "无法移到系统回收站",
  "hard_delete_confirm": "我知道这无法恢复"
}
```

- [ ] **Step 2: Append to `phase-10.test.ts`**

```ts
describe('phase-10 i18n: trash', () => {
  it('trash.confirm_title', () => {
    expect(i18n.t('trash.confirm_title')).toBe('移到废纸篓？')
  })
  it('trash.confirm_body interpolates {{path}}', () => {
    expect(i18n.t('trash.confirm_body', { path: 'notes/a.md' })).toBe(
      'notes/a.md 将被移至系统回收站。可在系统回收站中找回。'
    )
  })
  it('trash.fallback_title', () => {
    expect(i18n.t('trash.fallback_title')).toBe('无法移到系统回收站')
  })
  it('trash.hard_delete_confirm', () => {
    expect(i18n.t('trash.hard_delete_confirm')).toBe('我知道这无法恢复')
  })
})
```

- [ ] **Step 3: Wire `TrashConfirmDialog.tsx` to the keys**

Open `src/components/library/TrashConfirmDialog.tsx` (created in Plan 2). Replace hardcoded literals:

- Title text → `t('trash.confirm_title')`
- Body text (currently rendering the path inline) → `t('trash.confirm_body', { path })`
- Fallback-mode title → `t('trash.fallback_title')`
- Hard-delete confirm checkbox label → `t('trash.hard_delete_confirm')`

Add `const { t } = useTranslation()` at the top.

- [ ] **Step 4: Run, smoke, commit**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "trash"
```

Expected: 4 PASS.

Manual smoke:

1. `npm run dev`; in `/library`, right-click a file → "移到废纸篓".
2. Confirm dialog title reads 移到废纸篓？ and body shows the relative path + 将被移至系统回收站….
3. Press Esc; dialog closes; nothing changes on disk.

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/library/TrashConfirmDialog.tsx
git commit -m "feat(i18n): trash dialog keys + TrashConfirmDialog wired (phase-10 7.2)"
```

---

<!-- openspec-task: 7.3 -->

### Task 3: i18n key for `history.trash.notice`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/phase-10.test.ts`
- Modify: `src/components/history/TrashTab.tsx`

- [ ] **Step 1: Extend the `"history"` block in `zh-CN.json`**

Inside the existing `"history"` object (created in Task 1), add a `"trash"` sibling of `"tabs"`:

```json
"trash": {
  "notice": "Acornvo 不管理系统回收站。请在系统的废纸篓中找回已删除的文件。"
}
```

After this task the `"history"` block looks like:

```json
"history": {
  "tabs": { "trash": "...", "conflicts": "...", "ops": "..." },
  "trash": { "notice": "..." }
}
```

- [ ] **Step 2: Append test**

In `src/i18n/phase-10.test.ts`:

```ts
describe('phase-10 i18n: history.trash.notice', () => {
  it('history.trash.notice', () => {
    expect(i18n.t('history.trash.notice')).toBe(
      'Acornvo 不管理系统回收站。请在系统的废纸篓中找回已删除的文件。'
    )
  })
})
```

- [ ] **Step 3: Wire `TrashTab.tsx`**

Open `src/components/history/TrashTab.tsx`. Render the notice (typically inside an `<Alert>` or banner div above the list) using `t('history.trash.notice')`.

- [ ] **Step 4: Run, smoke, commit**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "history.trash.notice"
```

Expected: PASS.

Manual smoke:

1. `npm run dev`; go to `/history/trash`.
2. Confirm the explainer banner reads Acornvo 不管理系统回收站….
3. Confirm there is no "Restore" / "还原" button anywhere on the tab (per design D5).

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/history/TrashTab.tsx
git commit -m "feat(i18n): history.trash.notice + TrashTab wired (phase-10 7.3)"
```

---

<!-- openspec-task: 7.4 -->

### Task 4: i18n keys for `history.conflicts.clear_all*`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/phase-10.test.ts`
- Modify: `src/components/history/ConflictsTab.tsx`

- [ ] **Step 1: Extend `"history"` with a `"conflicts"` block**

```json
"conflicts": {
  "clear_all": "清空所有快照",
  "clear_all_confirm": "确认要删除全部 {{count}} 条冲突快照？此操作无法撤销。"
}
```

After this task `"history"` contains: `tabs`, `trash`, `conflicts`.

- [ ] **Step 2: Append tests**

```ts
describe('phase-10 i18n: history.conflicts', () => {
  it('history.conflicts.clear_all', () => {
    expect(i18n.t('history.conflicts.clear_all')).toBe('清空所有快照')
  })
  it('history.conflicts.clear_all_confirm interpolates {{count}}', () => {
    expect(i18n.t('history.conflicts.clear_all_confirm', { count: 23 })).toBe(
      '确认要删除全部 23 条冲突快照？此操作无法撤销。'
    )
  })
})
```

- [ ] **Step 3: Wire `ConflictsTab.tsx`**

Open `src/components/history/ConflictsTab.tsx`. The "Clear all" button label and the confirm-dialog body both read from these keys. Pass `count` from the live list length.

- [ ] **Step 4: Run, smoke, commit**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "history.conflicts"
```

Expected: 2 PASS.

Manual smoke:

1. `npm run dev` with at least 2 conflict snapshots in `.acornvo/conflicts/`.
2. Go to `/history/conflicts`; click "清空所有快照"; confirm body text shows the live count.
3. Cancel; verify nothing was deleted (file count under `.acornvo/conflicts/` unchanged).

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/history/ConflictsTab.tsx
git commit -m "feat(i18n): history.conflicts.clear_all keys + ConflictsTab wired (phase-10 7.4)"
```

---

<!-- openspec-task: 7.5 -->

### Task 5: i18n keys for `diff.view.*`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/phase-10.test.ts`
- Modify: `src/components/history/ConflictDetailPanel.tsx`

- [ ] **Step 1: Add `"diff"` block (sibling of `"history"`)**

```json
"diff": {
  "view": {
    "local_remote": "本地 ↔ 远端",
    "local_base": "本地 ↔ 基线",
    "remote_base": "远端 ↔ 基线"
  }
}
```

- [ ] **Step 2: Append tests**

```ts
describe('phase-10 i18n: diff.view', () => {
  it('diff.view.local_remote', () => {
    expect(i18n.t('diff.view.local_remote')).toBe('本地 ↔ 远端')
  })
  it('diff.view.local_base', () => {
    expect(i18n.t('diff.view.local_base')).toBe('本地 ↔ 基线')
  })
  it('diff.view.remote_base', () => {
    expect(i18n.t('diff.view.remote_base')).toBe('远端 ↔ 基线')
  })
})
```

- [ ] **Step 3: Wire `ConflictDetailPanel.tsx`**

Open `src/components/history/ConflictDetailPanel.tsx`. Replace the three view-toggle button labels with `t('diff.view.local_remote' | 'diff.view.local_base' | 'diff.view.remote_base')`. Default-selected toggle remains `local_remote` per design D6.

- [ ] **Step 4: Run, smoke, commit**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "diff.view"
```

Expected: 3 PASS.

Manual smoke:

1. `npm run dev` with one conflict snapshot.
2. Go to `/history/conflicts`; select the row.
3. Confirm three toggles read 本地 ↔ 远端 / 本地 ↔ 基线 / 远端 ↔ 基线; clicking each updates the diff panel.

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/history/ConflictDetailPanel.tsx
git commit -m "feat(i18n): diff.view toggles + ConflictDetailPanel wired (phase-10 7.5)"
```

---

<!-- openspec-task: 7.6 -->

### Task 6: i18n op templates for `ops.op.*`

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/phase-10.test.ts`
- Modify: `src/components/history/OpsRow.tsx`

- [ ] **Step 1: Add `"ops"` block (sibling of `"diff"`)**

```json
"ops": {
  "op": {
    "trash": "已移到废纸篓：{{path}}",
    "hard_delete": "已永久删除：{{path}}",
    "conflict_resolve": "已解决冲突：{{path}}（{{resolved_by}}）",
    "conflict_delete": "已删除快照：{{path}}",
    "rename": "已重命名：{{path}} → {{new_path}}"
  }
}
```

- [ ] **Step 2: Append tests**

```ts
describe('phase-10 i18n: ops.op templates', () => {
  it('ops.op.trash interpolates path', () => {
    expect(i18n.t('ops.op.trash', { path: 'a.md' })).toBe('已移到废纸篓：a.md')
  })
  it('ops.op.hard_delete interpolates path', () => {
    expect(i18n.t('ops.op.hard_delete', { path: 'b.md' })).toBe('已永久删除：b.md')
  })
  it('ops.op.conflict_resolve interpolates path + resolved_by', () => {
    expect(i18n.t('ops.op.conflict_resolve', { path: 'c.md', resolved_by: 'keep_local' })).toBe(
      '已解决冲突：c.md（keep_local）'
    )
  })
  it('ops.op.conflict_delete interpolates path', () => {
    expect(i18n.t('ops.op.conflict_delete', { path: 'd.md' })).toBe('已删除快照：d.md')
  })
  it('ops.op.rename interpolates path + new_path', () => {
    expect(i18n.t('ops.op.rename', { path: 'old.md', new_path: 'new.md' })).toBe(
      '已重命名：old.md → new.md'
    )
  })
})
```

- [ ] **Step 3: Wire `OpsRow.tsx`**

Open `src/components/history/OpsRow.tsx`. The component already receives an `OpsRow` (from `ops.list`) with `{ op, path, ts, meta_json }`. Replace the existing main-text rendering with a `switch (op)`:

```tsx
const main = (() => {
  const meta = row.meta_json ? JSON.parse(row.meta_json) : {}
  switch (row.op) {
    case 'trash':
      return t('ops.op.trash', { path: row.path })
    case 'hard_delete':
      return t('ops.op.hard_delete', { path: row.path })
    case 'conflict_resolve':
      return t('ops.op.conflict_resolve', { path: row.path, resolved_by: meta.resolved_by ?? '' })
    case 'conflict_delete':
      return t('ops.op.conflict_delete', { path: row.path })
    case 'rename':
      return t('ops.op.rename', { path: row.path, new_path: meta.new_path ?? '' })
    default:
      return row.op + ' ' + row.path
  }
})()
```

- [ ] **Step 4: Run, smoke, commit**

```bash
npx vitest run src/i18n/phase-10.test.ts -t "ops.op templates"
```

Expected: 5 PASS.

Manual smoke:

1. `npm run dev`; trigger one trash + one conflict-resolve so `ops_log` has rows.
2. Go to `/history/ops`; verify row text matches the templates with the actual paths interpolated.
3. Confirm the conflict-resolve row shows `（keep_local）` (or whichever `resolved_by` was used).

```bash
git add src/i18n/locales/zh-CN.json src/i18n/phase-10.test.ts src/components/history/OpsRow.tsx
git commit -m "feat(i18n): ops.op templates + OpsRow wired (phase-10 7.6)"
```

---

<!-- openspec-task: 8.1 -->

### Task 7: E2E acceptance — right-click → "移到废纸篓" → file moves to trash + ops_log row

**Files:**

- Create: `src/integration/phase-10-trash.test.tsx`

This is an integration-style acceptance: it does not actually move a file on disk (that is the manual smoke at the end of the task). It proves the wiring: right-click → menu item → confirm dialog → IPC call with the right args → row removed from list. The disk + Electron piece is checked by the human via the smoke step.

- [ ] **Step 1: Create the test file with the 8.1 scenario**

Create `src/integration/phase-10-trash.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import { i18n } from '@/i18n'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
// Plan-2 components — adjust imports to match the actual exports if names differ.
import { VirtualFileList } from '@/components/library/VirtualFileList'

// One mock seam used by every test in this file.
const mockIpc: any = {
  file: {
    trash: vi.fn(),
    hardDelete: vi.fn(),
    open: vi.fn(),
    showInFolder: vi.fn()
  },
  files: {
    list: vi.fn(),
    get: vi.fn()
  },
  ops: {
    list: vi.fn().mockResolvedValue({ rows: [] })
  },
  on: vi.fn().mockReturnValue(() => {})
}
vi.mock('@/ipc/client', () => ({ ipc: mockIpc, useIpc: () => mockIpc }))

// Sample library row used by all 8.x scenarios.
const SAMPLE_ROWS = [{ path: 'notes/a.md', title: 'a', mtimeMs: 100, size: 10, contentHash: 'h1' }]

beforeEach(() => {
  vi.clearAllMocks()
  mockIpc.files.list.mockResolvedValue({ rows: SAMPLE_ROWS, total: 1 })
})

function renderLibrary(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/library']}>
        <VirtualFileList />
      </MemoryRouter>
    </I18nextProvider>
  )
}

describe('8.1 right-click → 移到废纸篓 → confirm → IPC + row removed', () => {
  it('calls file.trash with rel path and removes the row', async () => {
    mockIpc.file.trash.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    renderLibrary()

    // Wait for the row.
    const row = await screen.findByText('a.md', { exact: false })

    // Right-click → menu opens.
    await user.pointer({ keys: '[MouseRight>]', target: row })
    const menuItem = await screen.findByText('移到废纸篓')
    await user.click(menuItem)

    // Confirm dialog opens; click the primary button.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('移到废纸篓？')).toBeInTheDocument()
    const confirm = within(dialog).getByRole('button', { name: '移到废纸篓' })
    await user.click(confirm)

    // IPC was called with the rel path.
    expect(mockIpc.file.trash).toHaveBeenCalledTimes(1)
    expect(mockIpc.file.trash).toHaveBeenCalledWith('notes/a.md')

    // Row is no longer in the list (relies on the store reacting to success).
    // If the store is event-driven (waits for index:fileDeleted), simulate it:
    const onCb = mockIpc.on.mock.calls.find((c: any[]) => c[0] === 'index:fileDeleted')?.[1]
    if (onCb) onCb({ path: 'notes/a.md' })
    expect(await screen.findByText(/没有文件|empty/i, { exact: false })).toBeTruthy()
  })
})
```

If `VirtualFileList` is not the right export, replace with the Plan-2 component name (likely `LibraryPage` or `FileList`); the test only needs a mountable surface that renders rows + ContextMenu.

- [ ] **Step 2: Run, confirm pass**

```bash
npx vitest run src/integration/phase-10-trash.test.tsx -t "8.1"
```

Expected: PASS.

Manual smoke (the **real** disk gate):

1. `npm run dev` against a grove with `notes/a.md`. Right-click the row → "移到废纸篓" → "移到废纸篓".
2. Confirm `~/.Trash/a.md` (macOS) or system trash (Win/Linux) now contains the file; `ls` of the grove no longer shows it.
3. Open `~/Library/Application Support/acornvo/.../grove.db` (or whatever path uses `ops_log`) and confirm a row with `op='trash'`, `path='notes/a.md'`.

- [ ] **Step 3: Commit**

```bash
git add src/integration/phase-10-trash.test.tsx
git commit -m "test(phase-10): 8.1 right-click trash flow integration (phase-10 8.1)"
```

---

<!-- openspec-task: 8.2 -->

### Task 8: E2E acceptance — `Cmd+Backspace` (Library focused) opens the same confirm modal

**Files:**

- Modify: `src/integration/phase-10-trash.test.tsx`

- [ ] **Step 1: Append the 8.2 case to the integration file**

```tsx
describe('8.2 Cmd+Backspace in Library → same confirm modal', () => {
  it('opens trash confirm dialog from keyboard with row selected', async () => {
    mockIpc.file.trash.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    renderLibrary()

    // Click the row to select + focus it.
    const row = await screen.findByText('a.md', { exact: false })
    await user.click(row)

    // Cmd+Backspace.
    await user.keyboard('{Meta>}{Backspace}{/Meta}')

    // Same dialog as 8.1.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('移到废纸篓？')).toBeInTheDocument()
    expect(within(dialog).getByText(/notes\/a\.md/)).toBeInTheDocument()

    // Confirm path: should reach IPC with same args as 8.1.
    await user.click(within(dialog).getByRole('button', { name: '移到废纸篓' }))
    expect(mockIpc.file.trash).toHaveBeenCalledWith('notes/a.md')
  })
})
```

- [ ] **Step 2: Run, smoke, commit**

```bash
npx vitest run src/integration/phase-10-trash.test.tsx -t "8.2"
```

Expected: PASS.

Manual smoke:

1. `npm run dev`; in `/library` click a row to select it.
2. Press Cmd+Backspace (mac) / Delete (Win/Linux); confirm dialog opens with same wording as right-click flow.
3. Click "移到废纸篓"; confirm the file actually leaves the grove (same as 8.1 step 2).

```bash
git add src/integration/phase-10-trash.test.tsx
git commit -m "test(phase-10): 8.2 Cmd+Backspace opens trash confirm (phase-10 8.2)"
```

---

<!-- openspec-task: 8.3 -->

### Task 9: E2E acceptance — `Cmd+Backspace` in `/editor/:path` does NOT trigger trash

**Files:**

- Modify: `src/integration/phase-10-trash.test.tsx`

The wiring claim under test: the trash shortcut is registered **inside `VirtualFileList`** (or its container), not at app level. When the editor route is mounted (no `VirtualFileList` in the tree), `Cmd+Backspace` falls through to the editor's own delete-line behaviour and never calls `file.trash`.

- [ ] **Step 1: Append the 8.3 case**

```tsx
import { EditorPage } from '@/pages/EditorPage' // adjust if export name differs

describe('8.3 Cmd+Backspace in /editor → does NOT trigger trash', () => {
  it('editor route does not register the trash shortcut', async () => {
    const user = userEvent.setup()
    mockIpc.files.get.mockResolvedValueOnce({
      summary: { path: 'notes/a.md', mtimeMs: 1 },
      frontmatter: {},
      body: 'hello'
    })

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/editor/notes%2Fa.md']}>
          <EditorPage />
        </MemoryRouter>
      </I18nextProvider>
    )

    // Wait for editor to be mounted (look for any editor surface marker).
    await screen.findByRole('textbox')

    // Press Cmd+Backspace.
    await user.keyboard('{Meta>}{Backspace}{/Meta}')

    // Neither IPC nor dialog fired.
    expect(mockIpc.file.trash).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('移到废纸篓？')).toBeNull()
  })
})
```

If `EditorPage` is not the export name on `main`, swap it for whatever Plan 2 / Phase 7 uses (e.g. `<EditorRoute />`). The minimum requirement: render the editor without `VirtualFileList` and confirm the shortcut is inert.

- [ ] **Step 2: Run, smoke, commit**

```bash
npx vitest run src/integration/phase-10-trash.test.tsx -t "8.3"
```

Expected: PASS.

Manual smoke:

1. `npm run dev`; open a file in `/editor/notes%2Fa.md`; place cursor in the body.
2. Press Cmd+Backspace; verify the editor deletes a line of text (its native behaviour) and **no** trash dialog appears.
3. `ls` the grove; confirm `notes/a.md` is still there.

```bash
git add src/integration/phase-10-trash.test.tsx
git commit -m "test(phase-10): 8.3 editor bypasses trash shortcut (phase-10 8.3)"
```

---

<!-- openspec-task: 8.4 -->

### Task 10: E2E acceptance — `shell.trashItem` fails → fallback modal → "永久删除" → `fs.unlink` + `op='hard_delete'`

**Files:**

- Modify: `src/integration/phase-10-trash.test.tsx`

The IPC contract for the failure path (per Plan 1 + spec): `file.trash` resolves with `{ ok: false, error: { code: 'E_TRASH', message } }` (no thrown `IpcError` — it is a recoverable user-facing failure, not a programmer error). On that response, `TrashConfirmDialog` switches to fallback mode: title becomes 无法移到系统回收站, the primary button changes to 永久删除 and is gated by the 我知道这无法恢复 checkbox. Clicking 永久删除 calls `file.hardDelete(path)`.

If Plan 1 instead modeled this as a thrown `IpcError`, swap `mockResolvedValueOnce` for `mockRejectedValueOnce(new IpcError('E_TRASH', '...'))` — the rest of the assertions are unchanged.

- [ ] **Step 1: Append the 8.4 case**

```tsx
describe('8.4 trashItem fails → fallback → hard delete', () => {
  it('shows fallback dialog; checkbox-gated 永久删除 calls file.hardDelete', async () => {
    mockIpc.file.trash.mockResolvedValueOnce({
      ok: false,
      error: { code: 'E_TRASH', message: 'XDG trash unavailable' }
    })
    mockIpc.file.hardDelete.mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    renderLibrary()

    // Right-click → menu → confirm
    const row = await screen.findByText('a.md', { exact: false })
    await user.pointer({ keys: '[MouseRight>]', target: row })
    await user.click(await screen.findByText('移到废纸篓'))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '移到废纸篓' }))

    // Wait for fallback transition.
    expect(await within(dialog).findByText('无法移到系统回收站')).toBeInTheDocument()
    const hardBtn = within(dialog).getByRole('button', { name: '永久删除' })
    expect(hardBtn).toBeDisabled()

    // Check the safety box, button enables.
    const cb = within(dialog).getByLabelText('我知道这无法恢复')
    await user.click(cb)
    expect(hardBtn).toBeEnabled()

    await user.click(hardBtn)

    expect(mockIpc.file.hardDelete).toHaveBeenCalledTimes(1)
    expect(mockIpc.file.hardDelete).toHaveBeenCalledWith('notes/a.md')
  })

  it('未勾选 checkbox 不能触发 hard delete', async () => {
    mockIpc.file.trash.mockResolvedValueOnce({
      ok: false,
      error: { code: 'E_TRASH', message: 'x' }
    })
    const user = userEvent.setup()
    renderLibrary()

    const row = await screen.findByText('a.md', { exact: false })
    await user.pointer({ keys: '[MouseRight>]', target: row })
    await user.click(await screen.findByText('移到废纸篓'))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '移到废纸篓' }))
    await within(dialog).findByText('无法移到系统回收站')
    const hardBtn = within(dialog).getByRole('button', { name: '永久删除' })

    // Click without checking — should be no-op.
    await user.click(hardBtn)
    expect(mockIpc.file.hardDelete).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run, smoke, commit**

```bash
npx vitest run src/integration/phase-10-trash.test.tsx -t "8.4"
```

Expected: 2 PASS.

Manual smoke (the only realistic way to hit this in production is on a Linux box without XDG; on macOS, simulate by patching `electron/services/trash.ts` to throw):

1. In `electron/services/trash.ts`, temporarily replace `await shell.trashItem(abs)` with `throw new Error('forced')`. `npm run dev`.
2. Right-click a file → "移到废纸篓"; click confirm. Verify the fallback modal text reads 无法移到系统回收站 and the 永久删除 button is disabled until the checkbox is checked.
3. Check the box, click 永久删除. Confirm: file is unlinked from disk; `ops_log` shows `op='hard_delete'` for the path. Revert the trash.ts patch.

```bash
git add src/integration/phase-10-trash.test.tsx
git commit -m "test(phase-10): 8.4 trash fallback → hard delete flow (phase-10 8.4)"
```

---

## Self-Review

1. **Spec coverage:** Plan 4 owns labels 7.1–7.6 + 8.1–8.4 (10 labels). Verify:

```bash
grep -E "openspec-task: (7\.[1-6]|8\.[1-4])" \
  /Users/aaa/develop/workspace-ai/acornvo/docs/superpowers/plans/2026-04-30-phase-10-history-and-trash-tasks-7.1-8.4.md \
  | sort -u
```

Expected: 10 unique labels (7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4).

2. **i18n key shape:** All keys use a flat dotted addressing inside one zh-CN.json. No namespace splits — matches the existing repo layout. `escapeValue: false` is already set in `src/i18n/index.ts`, so `↔` and Chinese punctuation render as-is.

3. **No en-US strings added.** The repo only ships zh-CN; adding en-US placeholders is out-of-scope per design (Chinese-first product).

4. **Manual smoke vs. automated:** Each 8.x task has a 3-line manual smoke that re-checks the disk-level reality the integration test cannot prove (e.g. file actually in `~/.Trash/`, real `ops_log` row, real `fs.unlink`). The integration test gates the wiring; the smoke gates the platform.

5. **Plan 1 contract assumption (8.4):** The fallback flow assumes `file.trash` returns `{ ok: false, error }` on `E_TRASH`. If Plan 1 actually throws an `IpcError`, swap `mockResolvedValueOnce` for `mockRejectedValueOnce(new IpcError('E_TRASH', '...'))` in the 8.4 tests — both shapes are valid; only one is current.

6. **No placeholders left.** ✓
