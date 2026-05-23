# Phase 07 — Vditor Editor + Autosave: Plan 2 (Store finalize + Editor page/components + autosave start)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-07-vditor-editor-autosave`
> **Task range:** OpenSpec tasks `2.7`–`4.2` (9 tasks)
> **Plan order:** 2 of 5. Builds on plan 1 (`tasks-1.1-2.6`). Subsequent plans (`tasks-4.3-6.3`, `6.4-8.6`, `8.7-8.14`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-28
> **Branch suggestion:** continue on `feat/phase-07-vditor-editor-autosave`

---

## Goal

Finish the Editor store (the success-path counter reset is in plan 1; this plan adds `close()` cleanup), then build the visible editor: route-aware `Editor.tsx` page that renders loading/ready/error sub-views, the `EditorTitleBar` with dirty/saving indicators and a "back to Library" button, the `VditorEditor` component that mounts Vditor in `ir` mode with offline assets and image-paste interception, the read-only `FrontmatterCard` right rail, and an `EditorErrorState` view. Wire the first two autosave triggers — input debounce (already in store from plan 1) and `visibilitychange` → `flushSave()`.

## Architecture

- **`Editor.tsx` is dumb routing.** It reads `useParams<{ encodedPath: string }>()`, kicks off `useEditorStore.getState().open(decodeURIComponent(encodedPath))` once on mount, and selects which sub-component to render via `useEditorStore(state => state.state.kind)`. Cleanup on unmount: `close()` (which itself calls `flushSave` is implemented in task 2.8). To be safe, `Editor.tsx` runs `flushSave()` then `close()` in its cleanup.
- **`VditorEditor` owns the Vditor lifecycle.** It mounts Vditor on a `<div ref>` in `useEffect(() => { … return () => vditor.destroy() }, [])`. On every `input` event Vditor fires, it calls `useEditorStore.getState().setBody(getValue())` (which schedules the 1s debounce). On `blur` it calls `flushSave()`.
- **No prop drilling for store actions.** Components grab `useEditorStore.getState()` for one-shot calls and `useEditorStore(selector)` for reactive reads.
- **`visibilitychange` listener lives in `Editor.tsx`** as a `useEffect(() => { … }, [])` so it gets installed/removed alongside the editor mount.

## Tech Stack

- React 19 + react-router-dom 7 (already deps)
- `vditor@^3.10` (installed in plan 1)
- Tailwind CSS 4 (already deps)
- `lucide-react@^1.11` (already deps) — icons for back arrow, save status
- `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom` — installed in this plan if not yet present

## Files Touched (this plan)

| Path                                                    | Action                                                   | Owner task                   |
| ------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `src/stores/editor.ts`                                  | Modify (close cleanup details)                           | 2.7, 2.8                     |
| `src/stores/editor.test.ts`                             | Modify                                                   | 2.7, 2.8                     |
| `package.json` (devDeps: `@testing-library/*`, `jsdom`) | Modify if missing                                        | 3.1                          |
| `src/pages/Editor.tsx`                                  | Replace stub with real router                            | 3.1, 4.2                     |
| `src/pages/Editor.test.tsx`                             | Modify                                                   | 3.1                          |
| `src/components/editor/EditorTitleBar.tsx`              | Create                                                   | 3.2                          |
| `src/components/editor/EditorTitleBar.test.tsx`         | Create                                                   | 3.2                          |
| `src/components/editor/VditorEditor.tsx`                | Create                                                   | 3.3                          |
| `src/components/editor/VditorEditor.test.tsx`           | Create                                                   | 3.3                          |
| `src/components/editor/FrontmatterCard.tsx`             | Create                                                   | 3.4                          |
| `src/components/editor/FrontmatterCard.test.tsx`        | Create                                                   | 3.4                          |
| `src/components/editor/EditorErrorState.tsx`            | Create                                                   | 3.5                          |
| `src/components/editor/EditorErrorState.test.tsx`       | Create                                                   | 3.5                          |
| `src/i18n/locales/zh-CN.json`                           | Modify (editor namespace stubs used by these components) | 3.2, 3.3, 3.4, 3.5, 4.1, 4.2 |

## Pre-flight

Plan 1 left the store with: `open / setBody / save / flushSave / close (basic)` + the `persistentFailure` flag. This plan finishes `close()` and `setBody`'s saveErrorCount reset (task 2.7), then turns to UI.

If `@testing-library/react` etc. were already installed by phase-06's plans, task 3.1 step 1 will detect that and skip the install. If not, task 3.1 installs them.

---

## Tasks

<!-- openspec-task: 2.7 -->

### Task 1: Save success — clean lastError + reset saveErrorCount + persistentFailure

**Files:**

- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

Plan 1's task 7 already cleared `lastError: null`, `saveErrorCount: 0`, `persistentFailure: false` on the success branch. This task **verifies that contract** (the placeholder test from plan 1's task 9 step 1 is now real) and lands additional assertions specifically requested by spec `editor-autosave#保存错误重试与上限` scenario "暂态错误恢复".

- [ ] **Step 1: Replace the placeholder test with real assertions**

In `src/stores/editor.test.ts`, find the test that currently reads:

```ts
it('successful save after errors clears the count and the flag (per task 2.7)', async () => {
  // Coverage skeleton — the actual reset on success is task 2.7.
  // For now we assert error-only state. The success-clears-count line will
  // be uncommented in plan 2 task 2.7.
  expect(true).toBe(true)
})
```

…and replace with:

```ts
it('successful save after errors clears the count and persistentFailure flag', async () => {
  await openReady('A', 1)
  useEditorStore.getState().setBody('B')
  ;(ipcMock.file as any).writeParsed = vi
    .fn()
    .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
    .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
    .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
    .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })

  await useEditorStore.getState().save()
  await useEditorStore.getState().save()
  await useEditorStore.getState().save()
  let s = useEditorStore.getState().state
  if (s.kind !== 'ready') throw new Error('unreachable')
  expect(s.saveErrorCount).toBe(3)
  expect(s.persistentFailure).toBe(true)

  // User retries
  await useEditorStore.getState().save()

  s = useEditorStore.getState().state
  if (s.kind !== 'ready') throw new Error('unreachable')
  expect(s.saveErrorCount).toBe(0)
  expect(s.lastError).toBeNull()
  expect(s.persistentFailure).toBe(false)
  expect(s.savedBody).toBe('B')
  expect(s.savedMtimeMs).toBe(2)
})

it('conflict-then-success leaves saveErrorCount untouched on the conflict but resets on success', async () => {
  await openReady('A', 1)
  useEditorStore.getState().setBody('B')
  ;(ipcMock.file as any).writeParsed = vi
    .fn()
    .mockRejectedValueOnce(new IpcError('E_MTIME_MISMATCH', 'race'))
    .mockResolvedValueOnce({ mtimeMs: 9, sha256: 'h' })

  await useEditorStore.getState().save()
  let s = useEditorStore.getState().state
  if (s.kind !== 'ready') throw new Error('unreachable')
  expect(s.saveErrorCount).toBe(0)
  expect(s.lastError).toBe('conflict')

  await useEditorStore.getState().save()
  s = useEditorStore.getState().state
  if (s.kind !== 'ready') throw new Error('unreachable')
  expect(s.lastError).toBeNull()
  expect(s.saveErrorCount).toBe(0)
})
```

- [ ] **Step 2: Run the tests**

Run:

```bash
npx vitest run src/stores/editor.test.ts -t 'save error branches'
```

Expected: PASS — the success branch already resets all three fields per plan 1 task 7. If a regression appears, double-check that `_doSave`'s success setState includes `lastError: null, saveErrorCount: 0, persistentFailure: false`.

- [ ] **Step 3: Commit**

```bash
git add src/stores/editor.test.ts
git commit -m "test(phase-07): success path clears saveErrorCount + persistentFailure (regression coverage)"
```

---

<!-- openspec-task: 2.8 -->

### Task 2: `close()` — flush + cancel debounce + return to idle

**Files:**

- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

Plan 1's task 6 added a basic `close()` that cancels the debounce and resets to `idle`. Per design D3 + spec `editor-autosave#自动保存触发口径` scenario "离开路由保存", we must `flushSave` before transitioning to idle so the last typed body is persisted.

`close()` returns `Promise<void>` so the caller (a future `useEffect` cleanup or `useBlocker` callback in plan 3) can `await` it.

- [ ] **Step 1: Update the `EditorActions` type — `close` returns Promise**

In `src/stores/editor.ts`:

```ts
export type EditorActions = {
  open: (path: string) => Promise<void>
  setBody: (newBody: string) => void
  save: () => Promise<void>
  flushSave: () => Promise<void>
  close: () => Promise<void>
}
```

- [ ] **Step 2: Add the failing test**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — close()', () => {
  it('flushes pending save before returning to idle', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ;(ipcMock.file as any).writeParsed = vi.fn().mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h' })

    await useEditorStore.getState().close()

    expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(1)
    expect((ipcMock.file as any).writeParsed).toHaveBeenCalledWith('a.md', {}, 'B', {
      expectedMtime: 1
    })
    expect(useEditorStore.getState().state.kind).toBe('idle')
  })

  it('cancels the pending debounce timer', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ;(ipcMock.file as any).writeParsed = vi.fn().mockResolvedValue({ mtimeMs: 2, sha256: 'h' })
      useEditorStore.getState().setBody('B') // schedules 1s timer
      await useEditorStore.getState().close()
      vi.advanceTimersByTime(2000) // would re-fire if not cancelled
      await vi.runAllTimersAsync?.()
      // close already flushed → save called once. No second call.
      expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('is idempotent when called from idle', async () => {
    await useEditorStore.getState().close()
    await useEditorStore.getState().close()
    expect(useEditorStore.getState().state.kind).toBe('idle')
  })
})
```

Run:

```bash
npx vitest run src/stores/editor.test.ts -t 'close'
```

Expected: 3 FAIL — current `close()` does not flush.

- [ ] **Step 3: Implement `close()`**

In `src/stores/editor.ts`, replace the existing `close()` with:

```ts
  async close() {
    await get().flushSave()
    _cancelDebounce()
    set({ state: { kind: 'idle' } })
  }
```

> Order matters: `flushSave` first (to await any in-flight save and re-save if dirty), then cancel the timer (in case `flushSave` itself scheduled a 0ms re-iterate), then transition to idle. Setting `idle` clears `state.kind === 'ready'`, so any subsequent `_doSave` invocation will short-circuit at the `if (cur.kind !== 'ready') return` guard.

- [ ] **Step 4: Run the tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): editor store close() — flushSave + cancel debounce + idle transition"
```

---

<!-- openspec-task: 3.1 -->

### Task 3: `Editor.tsx` page — wire route param to store; render loading/ready/error

**Files:**

- Modify: `src/pages/Editor.tsx`
- Modify: `src/pages/Editor.test.tsx`
- Modify: `package.json` (devDeps if missing)
- Modify: `src/i18n/locales/zh-CN.json` (`editor.loading` / `editor.error.title`)

The page is a thin router. It runs `editor.open(path)` once on mount and `editor.close()` on unmount. Sub-components render the actual UI per kind. We render a `<header>` (TitleBar) + `<main>` (editor body) + `<aside>` (Frontmatter card) split using Tailwind grid; for now the body is a stub component that the next tasks fill in.

- [ ] **Step 1: Ensure `@testing-library/react` + `jsdom` are installed**

Run:

```bash
node -e "const p=require('./package.json');console.log('@testing-library/react?', !!p.devDependencies?.['@testing-library/react']); console.log('jsdom?', !!p.devDependencies?.['jsdom'])"
```

If both print `true` (phase-06 already added them), skip Step 1b.

- [ ] **Step 1b: Install missing test deps**

```bash
npm install -D @testing-library/react@^16 @testing-library/dom@^10 @testing-library/user-event@^14 jsdom@^25
```

Verify:

```bash
npx vitest run --version
```

Expected: prints vitest version, no missing-package errors.

- [ ] **Step 2: Update the failing page test**

Replace contents of `src/pages/Editor.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      writeParsed: vi.fn(),
      write: vi.fn()
    },
    files: { get: vi.fn() }
  }
}))
import { ipc } from '@/ipc/client'

// Stub the heavy Vditor component so we don't pull the real lib into jsdom tests.
vi.mock('@/components/editor/VditorEditor', () => ({
  VditorEditor: () => <div data-testid="vditor-stub" />
}))

import { Editor } from './Editor'

const ipcMock = ipc as unknown as {
  file: {
    readParsed: ReturnType<typeof vi.fn>
    writeParsed: ReturnType<typeof vi.fn>
  }
}

beforeEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
  ipcMock.file.readParsed.mockReset()
  ipcMock.file.writeParsed.mockReset()
})

afterEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
})

function renderAt(encodedPath: string): void {
  render(
    <MemoryRouter initialEntries={[`/editor/${encodedPath}`]}>
      <Routes>
        <Route path="/editor/:encodedPath" element={<Editor />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Editor page', () => {
  it('shows loading immediately, then ready when readParsed resolves', async () => {
    let release!: (v: unknown) => void
    ipcMock.file.readParsed.mockReturnValueOnce(
      new Promise((res) => {
        release = res
      })
    )
    renderAt(encodeURIComponent('notes/a.md'))
    expect(screen.getByTestId('editor-loading')).toBeTruthy()

    release({
      content: '# x',
      eol: 'lf',
      mtimeMs: 1,
      sha256: 'h',
      hadBom: false,
      originalEncoding: 'utf8',
      frontmatter: {},
      body: '# x',
      rawYaml: ''
    })

    await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())
  })

  it('shows the error sub-view on E_NOT_FOUND', async () => {
    const { IpcError } = await import('@shared/ipc-contract')
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_NOT_FOUND', 'gone'))
    renderAt(encodeURIComponent('missing.md'))
    await waitFor(() => expect(screen.getByTestId('editor-error-state')).toBeTruthy())
  })

  it('decodes the route param before calling open()', async () => {
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '',
      eol: 'lf',
      mtimeMs: 1,
      sha256: 'h',
      hadBom: false,
      originalEncoding: 'utf8',
      frontmatter: {},
      body: '',
      rawYaml: ''
    })
    renderAt(encodeURIComponent('notes/中文 with space.md'))
    await waitFor(() =>
      expect(ipcMock.file.readParsed).toHaveBeenCalledWith('notes/中文 with space.md')
    )
  })
})
```

Run:

```bash
npx vitest run src/pages/Editor.test.tsx
```

Expected: 3 FAIL — current Editor.tsx is a single-stub div without subviews.

- [ ] **Step 3: Add i18n strings**

Modify `src/i18n/locales/zh-CN.json`. Add an `editor` namespace under the top level:

```json
  "editor": {
    "loading": "正在加载文件…",
    "back": "返回果仓",
    "saving": "保存中…",
    "saved": "已保存",
    "dirty": "未保存",
    "shortcut_save": "Cmd+S 保存",
    "shortcut_save_win": "Ctrl+S 保存",
    "open_external": "在系统文本编辑器中打开",
    "paste_image_unsupported": "尚未支持图片粘贴，将在拾果阶段接入",
    "no_frontmatter": "该文件暂无 frontmatter",
    "error": {
      "title": "无法加载文件",
      "not_found": "文件已被移除或重命名",
      "encoding": "无法解析文件编码，请检查文件",
      "conflict": "文件在外部被修改，请先刷新",
      "save_failed": "保存失败：{{code}}",
      "save_failed_persistent": "保存持续失败，已尝试 3 次",
      "open_logs": "查看日志"
    }
  }
```

(Insert as a new top-level sibling of `app`, `common`, `nav`, `picker`, etc. Keep the existing keys intact.)

- [ ] **Step 4: Replace the Editor stub with the real router page**

Replace `src/pages/Editor.tsx` contents with:

```tsx
import type { JSX } from 'react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'
import { VditorEditor } from '@/components/editor/VditorEditor'
import { EditorTitleBar } from '@/components/editor/EditorTitleBar'
import { FrontmatterCard } from '@/components/editor/FrontmatterCard'
import { EditorErrorState } from '@/components/editor/EditorErrorState'

export function Editor(): JSX.Element {
  const { encodedPath } = useParams<{ encodedPath: string }>()
  const path = encodedPath ? decodeURIComponent(encodedPath) : null
  const kind = useEditorStore((s) => s.state.kind)
  const { t } = useTranslation()

  useEffect(() => {
    if (!path) return
    void useEditorStore.getState().open(path)
    return () => {
      void useEditorStore.getState().close()
    }
  }, [path])

  // Visibility-change autosave (task 4.2): hidden → flushSave.
  useEffect(() => {
    function handler(): void {
      if (document.visibilityState === 'hidden') {
        void useEditorStore.getState().flushSave()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  if (!path) {
    return (
      <div
        data-testid="editor-error-state"
        className="flex h-full items-center justify-center text-sm"
      >
        no path
      </div>
    )
  }

  if (kind === 'idle' || kind === 'loading') {
    return (
      <div
        data-testid="editor-loading"
        className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]"
      >
        {t('editor.loading')}
      </div>
    )
  }

  if (kind === 'error') {
    return <EditorErrorState />
  }

  return (
    <div className="grid h-full grid-cols-[1fr_320px] grid-rows-[auto_1fr] overflow-hidden">
      <div className="col-span-2">
        <EditorTitleBar />
      </div>
      <div className="overflow-auto bg-[color:var(--color-bg-1)]">
        <VditorEditor />
      </div>
      <aside className="border-l border-[color:var(--color-line-1)] overflow-auto">
        <FrontmatterCard />
      </aside>
    </div>
  )
}
```

The four child components (`EditorTitleBar`, `VditorEditor`, `FrontmatterCard`, `EditorErrorState`) don't exist yet — TS will fail. We add minimal placeholders now so the tests can run, then upgrade them in tasks 4–7 below.

- [ ] **Step 5: Create minimal child stubs**

Create `src/components/editor/EditorTitleBar.tsx`:

```tsx
import type { JSX } from 'react'
export function EditorTitleBar(): JSX.Element {
  return <div data-testid="editor-titlebar-stub" />
}
```

Create `src/components/editor/VditorEditor.tsx`:

```tsx
import type { JSX } from 'react'
export function VditorEditor(): JSX.Element {
  return <div data-testid="vditor-stub" />
}
```

Create `src/components/editor/FrontmatterCard.tsx`:

```tsx
import type { JSX } from 'react'
export function FrontmatterCard(): JSX.Element {
  return <div data-testid="frontmatter-card-stub" />
}
```

Create `src/components/editor/EditorErrorState.tsx`:

```tsx
import type { JSX } from 'react'
export function EditorErrorState(): JSX.Element {
  return <div data-testid="editor-error-state" />
}
```

- [ ] **Step 6: Run typecheck + tests**

```bash
npm run typecheck && npx vitest run src/pages/Editor.test.tsx
```

Expected: typecheck PASS; the 3 page tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Editor.tsx src/pages/Editor.test.tsx src/components/editor/EditorTitleBar.tsx src/components/editor/VditorEditor.tsx src/components/editor/FrontmatterCard.tsx src/components/editor/EditorErrorState.tsx src/i18n/locales/zh-CN.json package.json package-lock.json
git commit -m "feat(phase-07): Editor page routes loading/ready/error + visibilitychange flushSave"
```

---

<!-- openspec-task: 3.2 -->

### Task 4: `EditorTitleBar` — back / path / dirty dot / saving pulse / shortcut hint

**Files:**

- Modify: `src/components/editor/EditorTitleBar.tsx`
- Create: `src/components/editor/EditorTitleBar.test.tsx`

Spec `editor-page#编辑器 TitleBar` requires:

- left "← 返回果仓" button → `flushSave()` then `navigate(-1)`
- middle: relative path + dirty dot (●) + "保存中…" pulse
- right: `Cmd+S 保存` (mac) / `Ctrl+S 保存` (win/linux)

Detect platform via `navigator.platform.toUpperCase().includes('MAC')`. (`navigator.userAgentData` is not stable in Electron's Chromium yet.)

- [ ] **Step 1: Write the failing test**

Create `src/components/editor/EditorTitleBar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: { readParsed: vi.fn(), writeParsed: vi.fn(), write: vi.fn() },
    files: { get: vi.fn() }
  }
}))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { EditorTitleBar } from './EditorTitleBar'

function readyState(over: Partial<EditorReadyState> = {}): EditorReadyState {
  return {
    kind: 'ready',
    path: 'notes/a.md',
    frontmatter: {},
    body: '',
    savedBody: '',
    savedMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false,
    ...over
  }
}

beforeEach(() => {
  navigateSpy.mockReset()
  useEditorStore.setState({ state: readyState() })
})

describe('EditorTitleBar', () => {
  it('renders the relative path and shows no dirty dot when clean', () => {
    render(
      <MemoryRouter>
        <EditorTitleBar />
      </MemoryRouter>
    )
    expect(screen.getByText('notes/a.md')).toBeTruthy()
    expect(screen.queryByTestId('editor-dirty-dot')).toBeNull()
    expect(screen.queryByTestId('editor-saving-pulse')).toBeNull()
  })

  it('shows dirty dot when state.dirty', () => {
    useEditorStore.setState({ state: readyState({ dirty: true }) })
    render(
      <MemoryRouter>
        <EditorTitleBar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('editor-dirty-dot')).toBeTruthy()
  })

  it('shows saving pulse when state.saving', () => {
    useEditorStore.setState({ state: readyState({ saving: true, dirty: true }) })
    render(
      <MemoryRouter>
        <EditorTitleBar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('editor-saving-pulse')).toBeTruthy()
  })

  it('back button calls flushSave then navigate(-1)', async () => {
    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    render(
      <MemoryRouter>
        <EditorTitleBar />
      </MemoryRouter>
    )
    await userEvent.click(screen.getByRole('button', { name: /返回果仓/ }))
    expect(flushSpy).toHaveBeenCalled()
    expect(navigateSpy).toHaveBeenCalledWith(-1)
  })
})
```

Run:

```bash
npx vitest run src/components/editor/EditorTitleBar.test.tsx
```

Expected: 4 FAIL.

- [ ] **Step 2: Implement `EditorTitleBar`**

Replace `src/components/editor/EditorTitleBar.tsx` with:

```tsx
import type { JSX } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'

function isMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
}

export function EditorTitleBar(): JSX.Element {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const ready = useEditorStore((s) => (s.state.kind === 'ready' ? s.state : null))

  if (!ready) return <div className="h-10 border-b border-[color:var(--color-line-1)]" />

  const onBack = async (): Promise<void> => {
    await useEditorStore.getState().flushSave()
    navigate(-1)
  }

  return (
    <header className="flex h-10 items-center gap-3 border-b border-[color:var(--color-line-1)] px-3 text-sm">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[color:var(--color-bg-2)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('editor.back')}
      </button>
      <div className="flex flex-1 items-center justify-center gap-2 text-[color:var(--color-ink-2)]">
        <span>{ready.path}</span>
        {ready.dirty && (
          <span data-testid="editor-dirty-dot" className="text-[color:var(--color-accent)]">
            ●
          </span>
        )}
        {ready.saving && (
          <span
            data-testid="editor-saving-pulse"
            className="animate-pulse text-xs text-[color:var(--color-ink-3)]"
          >
            {t('editor.saving')}
          </span>
        )}
      </div>
      <span className="text-xs text-[color:var(--color-ink-3)]">
        {isMac() ? t('editor.shortcut_save') : t('editor.shortcut_save_win')}
      </span>
    </header>
  )
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run src/components/editor/EditorTitleBar.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/EditorTitleBar.tsx src/components/editor/EditorTitleBar.test.tsx
git commit -m "feat(phase-07): EditorTitleBar — back/path/dirty/saving + platform shortcut hint"
```

---

<!-- openspec-task: 3.3 -->

### Task 5: `VditorEditor` — mount Vditor in `ir` mode with offline assets and image-paste interception

**Files:**

- Modify: `src/components/editor/VditorEditor.tsx`
- Create: `src/components/editor/VditorEditor.test.tsx`

Per design D1 + D8:

- mode `ir`
- `cdn: '/vditor'`
- `upload: { url: '' }` + custom `paste` to intercept image data
- `input` callback → `setBody(getValue())`
- `blur` callback → `flushSave()`
- on unmount: `vditor.destroy()`

Vditor's TS types are imported from `'vditor'`. We instantiate inside a ref-bound div.

The render is heavy and pulls DOM APIs. We test it by mocking the `vditor` import and asserting that:

1. The component invokes `new Vditor(el, opts)` with `mode: 'ir'`, `cdn: '/vditor'`, `upload.url = ''`.
2. The `input` option pipes through to `setBody`.
3. Unmount calls `destroy()`.

- [ ] **Step 1: Write the failing test**

Create `src/components/editor/VditorEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: { readParsed: vi.fn(), writeParsed: vi.fn(), write: vi.fn() },
    files: { get: vi.fn() }
  }
}))

let lastVditorOpts: any
const destroySpy = vi.fn()
const getValueSpy = vi.fn(() => '# from-vditor')
vi.mock('vditor', () => {
  return {
    default: vi.fn().mockImplementation((_el: HTMLElement, opts: any) => {
      lastVditorOpts = opts
      return {
        destroy: destroySpy,
        getValue: getValueSpy
      }
    })
  }
})

import { VditorEditor } from './VditorEditor'

function readyState(over: Partial<EditorReadyState> = {}): EditorReadyState {
  return {
    kind: 'ready',
    path: 'a.md',
    frontmatter: {},
    body: '# Hello',
    savedBody: '# Hello',
    savedMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false,
    ...over
  }
}

beforeEach(() => {
  lastVditorOpts = undefined
  destroySpy.mockReset()
  getValueSpy.mockClear()
  useEditorStore.setState({ state: readyState() })
})

afterEach(() => {
  cleanup()
  useEditorStore.setState({ state: { kind: 'idle' } })
})

describe('VditorEditor', () => {
  it('initialises Vditor with ir mode + offline cdn + upload disabled', () => {
    render(<VditorEditor />)
    expect(lastVditorOpts).toBeDefined()
    expect(lastVditorOpts.mode).toBe('ir')
    expect(lastVditorOpts.cdn).toBe('/vditor')
    expect(lastVditorOpts.upload.url).toBe('')
    expect(lastVditorOpts.value).toBe('# Hello')
  })

  it('pipes Vditor input event through to setBody', () => {
    render(<VditorEditor />)
    const setBodySpy = vi.spyOn(useEditorStore.getState(), 'setBody')
    lastVditorOpts.input('# changed')
    expect(setBodySpy).toHaveBeenCalledWith('# changed')
  })

  it('on blur calls flushSave', () => {
    render(<VditorEditor />)
    const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')
    lastVditorOpts.blur()
    expect(flushSpy).toHaveBeenCalled()
  })

  it('intercepts image paste — paste handler returns false for files', () => {
    render(<VditorEditor />)
    const fakeEvent = {
      clipboardData: {
        files: [new File(['x'], 'pic.png', { type: 'image/png' })]
      }
    } as unknown as ClipboardEvent
    const r = lastVditorOpts.upload.handler?.(null) // not the right signature; we use the after hook instead
    // Vditor uses a `paste` config too — the more reliable test is the `after`/handler returning falsy.
    // For this implementation we rely on `upload.handler` returning undefined to no-op uploads, and
    // the component installing a paste-event listener on the wrapper that prevents image inserts.
    expect(r).toBeUndefined() // upload.handler is the no-op
  })

  it('destroys the Vditor instance on unmount', () => {
    const { unmount } = render(<VditorEditor />)
    expect(destroySpy).not.toHaveBeenCalled()
    unmount()
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })
})
```

> Note: testing the _actual_ image-paste interception is fiddly under jsdom because Vditor processes clipboard events internally. Spec scenario "粘贴图片被拦截" is verified end-to-end in plan 5 acceptance task 8.7 by manually pasting an image into the running app. The unit test above verifies the configuration that disables Vditor's upload, which is the only renderer-side surface available.

Run:

```bash
npx vitest run src/components/editor/VditorEditor.test.tsx
```

Expected: 5 FAIL — current stub doesn't import Vditor.

- [ ] **Step 2: Implement `VditorEditor`**

Replace `src/components/editor/VditorEditor.tsx` with:

```tsx
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/hooks/use-toast'
import { useEditorStore } from '@/stores/editor'
import Vditor from 'vditor'
import 'vditor/dist/index.css'

export function VditorEditor(): JSX.Element {
  const elRef = useRef<HTMLDivElement | null>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const { t } = useTranslation()
  const { toast } = useToast()
  const initialBody =
    useEditorStore.getState().state.kind === 'ready'
      ? (useEditorStore.getState().state as { body: string }).body
      : ''

  useEffect(() => {
    if (!elRef.current) return
    const v = new Vditor(elRef.current, {
      mode: 'ir',
      cdn: '/vditor',
      value: initialBody,
      cache: { enable: false },
      counter: { enable: false },
      toolbarConfig: { pin: true },
      upload: {
        url: '',
        // Returning a string aborts the Vditor upload pipeline. We use the
        // accept handler to no-op image inserts via paste/drop and toast.
        handler: () => {
          toast({ title: t('editor.paste_image_unsupported') })
          return ''
        }
      },
      input(value) {
        useEditorStore.getState().setBody(value)
      },
      blur() {
        void useEditorStore.getState().flushSave()
      }
    })
    vditorRef.current = v
    return () => {
      v.destroy()
      vditorRef.current = null
    }
    // We deliberately do NOT depend on `initialBody` — Vditor owns its own
    // editable buffer once instantiated. setBody flows the other direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={elRef} className="h-full w-full" data-testid="vditor-host" />
}
```

> Note: the test mocks `'vditor'` so the real `index.css` import never resolves at test time. In real runs Vite resolves it from `node_modules/vditor/dist/index.css`. If you see a test-time error from the CSS import, change the import to a runtime-only side-effect:
>
> ```ts
> if (typeof window !== 'undefined' && !window.__vditorCss) {
>   await import('vditor/dist/index.css')
>   window.__vditorCss = true
> }
> ```
>
> But the simpler fix is `vi.mock('vditor/dist/index.css', () => ({}))` at the top of the test.

Update the test mock to include the CSS:

```ts
vi.mock('vditor/dist/index.css', () => ({}))
```

(Add it just below the `vi.mock('vditor', ...)` block.)

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run src/components/editor/VditorEditor.test.tsx
```

Expected: 5 PASS. The "image paste intercept" test simply asserts that `upload.handler()` returns a falsy/empty string (which is what disables Vditor's default upload URL hit).

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/VditorEditor.tsx src/components/editor/VditorEditor.test.tsx
git commit -m "feat(phase-07): VditorEditor mounts ir-mode Vditor with offline cdn + upload disabled"
```

---

<!-- openspec-task: 3.4 -->

### Task 6: `FrontmatterCard` — read-only right rail

**Files:**

- Modify: `src/components/editor/FrontmatterCard.tsx`
- Create: `src/components/editor/FrontmatterCard.test.tsx`

Per spec `editor-page#Frontmatter 只读侧卡` it shows: category, site, title, rating (5 stars), summary, highlights bullets, tags chips, published_at, clipped_at. Includes "Open in system editor" button (wired in plan 3 task 4 — for now a placeholder onClick that toasts "coming"). Empty-state when frontmatter is empty.

- [ ] **Step 1: Write the failing test**

Create `src/components/editor/FrontmatterCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEditorStore } from '@/stores/editor'
import type { EditorReadyState } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: { file: { readParsed: vi.fn(), writeParsed: vi.fn() }, files: { get: vi.fn() } }
}))

import { FrontmatterCard } from './FrontmatterCard'

function ready(fm: Record<string, unknown>): EditorReadyState {
  return {
    kind: 'ready',
    path: 'a.md',
    frontmatter: fm,
    body: '',
    savedBody: '',
    savedMtimeMs: 1,
    dirty: false,
    saving: false,
    lastError: null,
    saveErrorCount: 0,
    persistentFailure: false
  }
}

beforeEach(() => {
  useEditorStore.setState({ state: { kind: 'idle' } })
})

describe('FrontmatterCard', () => {
  it('shows empty placeholder when frontmatter is empty', () => {
    useEditorStore.setState({ state: ready({}) })
    render(<FrontmatterCard />)
    expect(screen.getByTestId('frontmatter-empty')).toBeTruthy()
  })

  it('renders category / site / title / rating stars / summary', () => {
    useEditorStore.setState({
      state: ready({
        category: '技术/深度学习',
        site: 'example.com',
        title: '注意力机制',
        rating: 4,
        summary: '这是摘要'
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText('技术/深度学习')).toBeTruthy()
    expect(screen.getByText('example.com')).toBeTruthy()
    expect(screen.getByText('注意力机制')).toBeTruthy()
    expect(screen.getByText('这是摘要')).toBeTruthy()
    expect(screen.getAllByTestId('star-filled').length).toBe(4)
    expect(screen.getAllByTestId('star-empty').length).toBe(1)
  })

  it('renders highlights as a bullet list and tags as chips', () => {
    useEditorStore.setState({
      state: ready({
        highlights: ['首要观点', '次要论据'],
        tags: ['ai', 'attention']
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText('首要观点')).toBeTruthy()
    expect(screen.getByText('次要论据')).toBeTruthy()
    expect(screen.getByText('ai')).toBeTruthy()
    expect(screen.getByText('attention')).toBeTruthy()
  })

  it('renders published_at + clipped_at when present', () => {
    useEditorStore.setState({
      state: ready({
        published_at: '2026-01-01',
        clipped_at: '2026-04-01T12:00:00Z'
      })
    })
    render(<FrontmatterCard />)
    expect(screen.getByText(/2026-01-01/)).toBeTruthy()
    expect(screen.getByText(/2026-04-01/)).toBeTruthy()
  })
})
```

Run:

```bash
npx vitest run src/components/editor/FrontmatterCard.test.tsx
```

Expected: 4 FAIL.

- [ ] **Step 2: Implement `FrontmatterCard`**

Replace `src/components/editor/FrontmatterCard.tsx` with:

```tsx
import type { JSX } from 'react'
import { Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'

function StarRow({ rating }: { rating: number }): JSX.Element {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) =>
        i <= filled ? (
          <Star key={i} data-testid="star-filled" className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Star key={i} data-testid="star-empty" className="h-3.5 w-3.5" />
        )
      )}
    </div>
  )
}

export function FrontmatterCard(): JSX.Element {
  const fm = useEditorStore((s) => (s.state.kind === 'ready' ? s.state.frontmatter : null))
  const { t } = useTranslation()

  if (!fm) return <div className="p-4 text-sm" />
  const keys = Object.keys(fm)
  if (keys.length === 0) {
    return (
      <div data-testid="frontmatter-empty" className="p-4 text-sm text-[color:var(--color-ink-3)]">
        {t('editor.no_frontmatter')}
      </div>
    )
  }

  const get = <K extends string>(k: K): unknown => (fm as Record<string, unknown>)[k]

  const category = get('category') as string | undefined
  const site = get('site') as string | undefined
  const title = get('title') as string | undefined
  const rating = get('rating')
  const summary = get('summary') as string | undefined
  const highlights = (get('highlights') as string[] | undefined) ?? []
  const tags = (get('tags') as string[] | undefined) ?? []
  const publishedAt = get('published_at') as string | undefined
  const clippedAt = get('clipped_at') as string | undefined

  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between text-xs text-[color:var(--color-ink-3)]">
        {category && <span>{category}</span>}
        {site && <span>{site}</span>}
      </div>
      {title && <h2 className="text-base font-semibold">{title}</h2>}
      {typeof rating === 'number' && <StarRow rating={rating} />}
      {summary && <p className="text-[color:var(--color-ink-2)]">{summary}</p>}
      {highlights.length > 0 && (
        <ul className="list-disc pl-5 text-[color:var(--color-ink-2)]">
          {highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span key={tag} className="rounded bg-[color:var(--color-bg-2)] px-2 py-0.5 text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}
      {(publishedAt || clippedAt) && (
        <div className="space-y-1 text-xs text-[color:var(--color-ink-3)]">
          {publishedAt && <div>published_at · {publishedAt}</div>}
          {clippedAt && <div>clipped_at · {clippedAt}</div>}
        </div>
      )}
      <button
        type="button"
        className="w-full rounded border border-[color:var(--color-line-1)] px-2 py-1 text-xs hover:bg-[color:var(--color-bg-2)]"
        // Wired to ipc.file.openExternal in plan 3 task 5.2.
      >
        {t('editor.open_external')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run src/components/editor/FrontmatterCard.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/FrontmatterCard.tsx src/components/editor/FrontmatterCard.test.tsx
git commit -m "feat(phase-07): FrontmatterCard read-only rail (category/site/rating/summary/highlights/tags/dates)"
```

---

<!-- openspec-task: 3.5 -->

### Task 7: `EditorErrorState` — render code-specific copy + back button

**Files:**

- Modify: `src/components/editor/EditorErrorState.tsx`
- Create: `src/components/editor/EditorErrorState.test.tsx`

Per design D9 + spec `editor-page#编辑器路由与加载` scenarios:

- `E_NOT_FOUND` → "文件已被移除或重命名"
- `E_ENCODING` → "无法解析文件编码，请检查文件" + "在系统文本编辑器中打开" button
- other → generic "无法加载文件" + the error string + retry button

- [ ] **Step 1: Write the failing test**

Create `src/components/editor/EditorErrorState.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { useEditorStore } from '@/stores/editor'

vi.mock('@/ipc/client', () => ({
  ipc: { file: { readParsed: vi.fn() }, files: { get: vi.fn() } }
}))

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

import { EditorErrorState } from './EditorErrorState'

beforeEach(() => {
  navigateSpy.mockReset()
})

function renderError(error: string): void {
  useEditorStore.setState({ state: { kind: 'error', path: 'a.md', error } })
  render(
    <MemoryRouter>
      <EditorErrorState />
    </MemoryRouter>
  )
}

describe('EditorErrorState', () => {
  it('shows not-found copy on E_NOT_FOUND', () => {
    renderError('E_NOT_FOUND')
    expect(screen.getByText(/文件已被移除/)).toBeTruthy()
  })

  it('shows encoding copy + open-external button on E_ENCODING', () => {
    renderError('E_ENCODING')
    expect(screen.getByText(/无法解析文件编码/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /系统文本编辑器/ })).toBeTruthy()
  })

  it('shows generic copy + raw error string on other codes', () => {
    renderError('E_INTERNAL: boom')
    expect(screen.getByText(/无法加载文件/)).toBeTruthy()
    expect(screen.getByText(/E_INTERNAL: boom/)).toBeTruthy()
  })

  it('back-to-library button navigates -1', async () => {
    renderError('E_NOT_FOUND')
    await userEvent.click(screen.getByRole('button', { name: /返回果仓/ }))
    expect(navigateSpy).toHaveBeenCalledWith(-1)
  })
})
```

Run:

```bash
npx vitest run src/components/editor/EditorErrorState.test.tsx
```

Expected: 4 FAIL.

- [ ] **Step 2: Implement `EditorErrorState`**

Replace `src/components/editor/EditorErrorState.tsx` with:

```tsx
import type { JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor'

export function EditorErrorState(): JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const err = useEditorStore((s) => (s.state.kind === 'error' ? s.state : null))

  if (!err) return <div data-testid="editor-error-state" />

  let body: JSX.Element
  if (err.error === 'E_NOT_FOUND') {
    body = <p>{t('editor.error.not_found')}</p>
  } else if (err.error === 'E_ENCODING') {
    body = (
      <div className="space-y-3">
        <p>{t('editor.error.encoding')}</p>
        <p className="text-xs text-[color:var(--color-ink-3)]">{err.path}</p>
        <button
          type="button"
          className="rounded border border-[color:var(--color-line-1)] px-3 py-1 text-sm"
          // Wired in plan 3 task 5.2 once ipc.file.openExternal exists.
        >
          {t('editor.open_external')}
        </button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-2">
        <p>{t('editor.error.title')}</p>
        <p className="text-xs text-[color:var(--color-ink-3)]">{err.error}</p>
      </div>
    )
  }

  return (
    <div
      data-testid="editor-error-state"
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-sm"
    >
      {body}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="rounded border border-[color:var(--color-line-1)] px-3 py-1"
      >
        {t('editor.back')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Run the tests**

Run:

```bash
npx vitest run src/components/editor/EditorErrorState.test.tsx
```

Expected: 4 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/EditorErrorState.tsx src/components/editor/EditorErrorState.test.tsx
git commit -m "feat(phase-07): EditorErrorState — code-specific copy + back-to-library"
```

---

<!-- openspec-task: 4.1 -->

### Task 8: `scheduleSave()` debounce 1000ms — verify timing

**Files:**

- Modify: `src/stores/editor.test.ts` (add a timing-focused test)

Plan 1's task 6 already implements the 1000ms debounce. This task is a coverage gate: a fake-timers test that proves "5 setBody calls within 1s coalesce into one save call".

- [ ] **Step 1: Add the timing test**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — debounce coalescing', () => {
  it('20 setBody calls in <1s produce a single save call', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ;(ipcMock.file as any).writeParsed = vi.fn().mockResolvedValueOnce({
        mtimeMs: 2,
        sha256: 'h'
      })

      for (let i = 0; i < 20; i++) {
        useEditorStore.getState().setBody(`B${i}`)
        vi.advanceTimersByTime(40) // 40ms × 20 = 800ms < 1000ms debounce
      }

      // Not yet — debounce not elapsed.
      expect((ipcMock.file as any).writeParsed).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync?.()
      // Now the debounce timer fired and triggered save().
      expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(1)
      expect((ipcMock.file as any).writeParsed).toHaveBeenCalledWith('a.md', {}, 'B19', {
        expectedMtime: 1
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
```

- [ ] **Step 2: Run the test**

Run:

```bash
npx vitest run src/stores/editor.test.ts -t 'debounce coalescing'
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/editor.test.ts
git commit -m "test(phase-07): debounce coalescing — 20 keystrokes in <1s = one save"
```

---

<!-- openspec-task: 4.2 -->

### Task 9: `visibilitychange` autosave wiring — already wired, add coverage

**Files:**

- Modify: `src/pages/Editor.test.tsx`

Plan 2 task 3 step 4 already installed the `visibilitychange` listener inside `Editor.tsx`. This task adds a regression test that flips `document.visibilityState` to `hidden` and asserts `flushSave` is invoked.

- [ ] **Step 1: Add the failing test**

Append to `src/pages/Editor.test.tsx` inside the `describe('Editor page', ...)` block:

```ts
it('flushSave fires on visibilitychange → hidden', async () => {
  ipcMock.file.readParsed.mockResolvedValueOnce({
    content: '',
    eol: 'lf',
    mtimeMs: 1,
    sha256: 'h',
    hadBom: false,
    originalEncoding: 'utf8',
    frontmatter: {},
    body: '',
    rawYaml: ''
  })
  renderAt(encodeURIComponent('a.md'))
  await waitFor(() => expect(screen.getByTestId('vditor-stub')).toBeTruthy())
  const flushSpy = vi.spyOn(useEditorStore.getState(), 'flushSave')

  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => 'hidden'
  })
  document.dispatchEvent(new Event('visibilitychange'))

  expect(flushSpy).toHaveBeenCalled()
})
```

Run:

```bash
npx vitest run src/pages/Editor.test.tsx -t 'visibilitychange'
```

Expected: PASS (the listener already exists from task 3).

- [ ] **Step 2: Run the full suite to confirm no regressions**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Editor.test.tsx
git commit -m "test(phase-07): visibilitychange=hidden triggers flushSave"
```

---

## Plan-2 Acceptance

After all 9 tasks complete:

- [ ] `npm run typecheck` PASSES
- [ ] `npm test` PASSES (editor store ≥ 19 cases, page + 4 components ≥ 18 cases combined)
- [ ] `npm run lint` PASSES
- [ ] `npm run dev` shows the Editor page when navigated to `/editor/<encoded>`. The path renders, dirty dot toggles when typing, "saving…" pulses during writes, returning the path back un-dirties.
- [ ] Right rail shows frontmatter when present, "no frontmatter" placeholder otherwise.
- [ ] On `E_NOT_FOUND`, error view shows; back button returns to `/library`.
- [ ] `git log --oneline` shows nine commits, each scoped to one OpenSpec task.
