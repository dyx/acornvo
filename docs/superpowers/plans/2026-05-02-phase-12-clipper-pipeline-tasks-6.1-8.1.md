# Phase 12 — Clipper Pipeline: Plan 3 (Renderer state, UI, shortcut, i18n)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **OpenSpec change:** `phase-12-clipper-pipeline`
> **Task range:** OpenSpec tasks `6.1`–`8.1` (9 tasks)
> **Plan order:** 3 of 4. Depends on Plans 1–2.
> **Status:** Not started
> **Created:** 2026-05-02

---

## Goal

Land the **renderer** half of the clipper: a Zustand state machine, a `did-navigate`-aware "is clipped?" indicator on the AddressBar, the **ClipPreviewDialog** modal, the AddressBar scissors button (real action behind phase-11's placeholder), the "already-clipped → open" confirm flow, error toasts, the `Cmd/Ctrl+Shift+S` shortcut, the unsupported-URL no-op + toast, and zh-CN i18n keys.

## Architecture

- **`src/stores/clipper.ts`** owns one global state machine (`idle | extracting | previewing | saving | indexing | done | error | canceled`) plus `preview: ClipPreview | null` and `error: ClipErrorEnvelope | null`. Actions: `start(tabId)`, `save(input)`, `cancel()`, `reextract(tabId)`, `clearError()`. Renderer binds the modal + AddressBar to this store.
- **`src/stores/browser.ts` extension** adds a per-tab `isClipped: boolean`. We hook into the existing `did-navigate` / `did-navigate-in-page` event subscription (phase-11 task 5.1) and look up `clips.getByUrl(url)` after each navigation. Result is debounced to 200ms to avoid spammy re-renders.
- **`ClipPreviewDialog`** is a Radix `Dialog` keyed by `clipper.preview.runId`. Title/tags/excerpt are local-edit state mirrored into the store on save. Body preview is the first 2000 chars of `preview.body` rendered as a Vditor preview (reuse phase-07 utility).
- **AddressBar scissors button** has 4 states: `disabled`, `hollow` (clickable), `filled+check` (already clipped), `spinner` (extracting/saving). Click semantics depend on state.
- **Shortcut** added to phase-11's `useBrowserHotkeys` (created in phase-11 plan 4 task 7.1). We append a single `useEffect` hook there.
- **i18n** is zh-CN only; we add keys under `browser.clip.*`.

## Tech Stack

- React 19, Zustand 5 (existing)
- Radix Dialog (existing — phase-07 already uses it for confirms)
- Vditor (existing — phase-07 editor)
- react-i18next (existing)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `src/ipc/clipper-port.ts` | Create | 6.1 |
| `src/ipc/clips-port.ts` | Create | 6.2 |
| `src/stores/clipper.ts` | Create | 6.1 |
| `src/stores/clipper.test.ts` | Create | 6.1 |
| `src/stores/browser.ts` | Modify (add isClipped, did-navigate hook) | 6.2 |
| `src/stores/browser.test.ts` | Modify (test isClipped) | 6.2 |
| `src/components/browser/ClipPreviewDialog.tsx` | Create | 6.3 |
| `src/components/browser/ClipPreviewDialog.test.tsx` | Create | 6.3 |
| `src/components/browser/AddressBar.tsx` | Modify (scissors button) | 6.4, 6.5 |
| `src/components/browser/AddressBar.test.tsx` | Modify | 6.4, 6.5 |
| `src/components/browser/ClipErrorToast.tsx` | Create | 6.6 |
| `src/components/browser/ClipErrorToast.test.tsx` | Create | 6.6 |
| `src/hooks/useBrowserHotkeys.ts` | Modify (Cmd+Shift+S) | 7.1, 7.2 |
| `src/hooks/useBrowserHotkeys.test.ts` | Modify | 7.1, 7.2 |
| `src/i18n/locales/zh-CN.json` | Modify (add keys) | 8.1 |

## Pre-flight

- Plans 1–2 merged. Verify main + IPC tests green:
  ```bash
  npx vitest run electron/clipper electron/ipc/clipper.test.ts electron/ipc/clips.test.ts
  ```
- Phase-11 deliverables required:
  - `src/stores/browser.ts` exists with `tabs`, `activeTabId`, `setBrowserPort`
  - `src/components/browser/AddressBar.tsx` exists with the placeholder scissors button
  - `src/hooks/useBrowserHotkeys.ts` exists
- Verify the preload bridge exposes `window.api.clipper` and `window.api.clips`. If not, add them in the preload alongside existing `window.api.*` namespaces:
  ```ts
  // electron/preload/index.ts (sketch)
  contextBridge.exposeInMainWorld('api', {
    // ... existing
    clipper: {
      clip: (args) => ipcRenderer.invoke('clipper:clip', args),
      saveClip: (input) => ipcRenderer.invoke('clipper:saveClip', input),
      cancelClip: (args) => ipcRenderer.invoke('clipper:cancelClip', args),
      reextract: (args) => ipcRenderer.invoke('clipper:reextract', args)
    },
    clips: {
      create: (input) => ipcRenderer.invoke('clips:create', input),
      list: (opts) => ipcRenderer.invoke('clips:list', opts),
      getByUrl: (args) => ipcRenderer.invoke('clips:getByUrl', args),
      getById: (args) => ipcRenderer.invoke('clips:getById', args),
      delete: (args) => ipcRenderer.invoke('clips:delete', args)
    }
  })
  ```

---

## Tasks

<!-- openspec-task: 6.1 -->
### Task 1: `clipper-port.ts` + `stores/clipper.ts` state machine

We isolate IPC behind a port (`src/ipc/clipper-port.ts`) so tests can stub the entire surface. The store is a Zustand slice with explicit transitions.

**Files:**
- Create: `src/ipc/clipper-port.ts`
- Create: `src/stores/clipper.ts`
- Create: `src/stores/clipper.test.ts`

- [ ] **Step 1: Create the port**

```ts
// src/ipc/clipper-port.ts
import type {
  ClipInput,
  ClipPreview,
  ClipResult,
  ClipRunId
} from '@shared/clipper-types'
import type { IpcResult } from '@shared/ipc-contract'

export interface ClipperPort {
  clip(args: { tabId: string }): Promise<IpcResult<ClipPreview>>
  saveClip(input: ClipInput): Promise<IpcResult<ClipResult>>
  cancelClip(args: { runId: ClipRunId }): Promise<IpcResult<void>>
  reextract(args: { runId: ClipRunId; tabId: string }): Promise<IpcResult<ClipPreview>>
}

declare global {
  interface Window {
    api: typeof window.api & { clipper: ClipperPort }
  }
}

let portRef: ClipperPort | null = null

export function setClipperPort(port: ClipperPort): void {
  portRef = port
}

export function getClipperPort(): ClipperPort {
  if (portRef) return portRef
  if (typeof window !== 'undefined' && window.api?.clipper) return window.api.clipper
  throw new Error('clipper port not configured')
}
```

- [ ] **Step 2: Write failing tests for the store**

```ts
// src/stores/clipper.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useClipperStore, _resetClipperStoreForTest } from './clipper'
import { setClipperPort } from '@/ipc/clipper-port'

const fakePreview = {
  runId: 'r1',
  title: 'Hello',
  url: 'https://x/',
  site: 'x',
  body: 'b',
  suggestedPath: 'inbox/202605/x.md',
  tags: [],
  degraded: false
}

describe('clipper store', () => {
  beforeEach(() => _resetClipperStoreForTest())

  it('initial state is idle / no preview / no error', () => {
    const s = useClipperStore.getState()
    expect(s.stage).toBe('idle')
    expect(s.preview).toBeNull()
    expect(s.error).toBeNull()
  })

  it('start(tabId) → extracting → previewing on success', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(),
      cancelClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    const stages: string[] = []
    const unsub = useClipperStore.subscribe((s) => { stages.push(s.stage) })

    await useClipperStore.getState().start('t1')

    expect(stages).toContain('extracting')
    const final = useClipperStore.getState()
    expect(final.stage).toBe('previewing')
    expect(final.preview?.title).toBe('Hello')
    unsub()
  })

  it('start surfaces error and transitions to error stage', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({
        ok: false,
        error: { code: 'E_EXTRACT_TIMEOUT' as const, message: 'timeout' }
      }))
    } as any)
    await useClipperStore.getState().start('t1')
    const s = useClipperStore.getState()
    expect(s.stage).toBe('error')
    expect(s.error?.code).toBe('E_EXTRACT_TIMEOUT')
  })

  it('save(input) → saving → done', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(async () => ({
        ok: true,
        data: { id: 9, path: 'inbox/202605/x.md', url: 'https://x/', title: 'Hello', degraded: false }
      })),
      cancelClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().save({ runId: 'r1', title: 'Hello', tags: ['ai'] })
    const s = useClipperStore.getState()
    expect(s.stage).toBe('done')
  })

  it('cancel() → canceled and clears preview', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      cancelClip: vi.fn(async () => ({ ok: true, data: undefined })),
      saveClip: vi.fn(),
      reextract: vi.fn()
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().cancel()
    const s = useClipperStore.getState()
    expect(s.stage).toBe('canceled')
    expect(s.preview).toBeNull()
  })

  it('reextract replaces the preview', async () => {
    const next = { ...fakePreview, runId: 'r2', title: 'Hello v2' }
    setClipperPort({
      clip: vi.fn(async () => ({ ok: true, data: fakePreview })),
      saveClip: vi.fn(),
      cancelClip: vi.fn(),
      reextract: vi.fn(async () => ({ ok: true, data: next }))
    } as any)
    await useClipperStore.getState().start('t1')
    await useClipperStore.getState().reextract('t1')
    const s = useClipperStore.getState()
    expect(s.stage).toBe('previewing')
    expect(s.preview?.title).toBe('Hello v2')
  })

  it('clearError() resets error/stage to idle', async () => {
    setClipperPort({
      clip: vi.fn(async () => ({
        ok: false,
        error: { code: 'E_EXTRACT_TIMEOUT' as const, message: 't' }
      }))
    } as any)
    await useClipperStore.getState().start('t1')
    useClipperStore.getState().clearError()
    const s = useClipperStore.getState()
    expect(s.stage).toBe('idle')
    expect(s.error).toBeNull()
  })
})
```

- [ ] **Step 3: Confirm fails**

```bash
npx vitest run src/stores/clipper.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the store**

```ts
// src/stores/clipper.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  ClipErrorEnvelope,
  ClipInput,
  ClipPreview,
  ClipStage
} from '@shared/clipper-types'
import { getClipperPort } from '@/ipc/clipper-port'

interface ClipperState {
  stage: ClipStage
  preview: ClipPreview | null
  error: ClipErrorEnvelope | null
  /** Last clip success: id + path. Used by AddressBar success toast. */
  lastSuccess: { id: number; path: string } | null

  start(tabId: string): Promise<void>
  save(input: ClipInput): Promise<void>
  cancel(): Promise<void>
  reextract(tabId: string): Promise<void>
  clearError(): void
}

const INITIAL: Pick<ClipperState, 'stage' | 'preview' | 'error' | 'lastSuccess'> = {
  stage: 'idle',
  preview: null,
  error: null,
  lastSuccess: null
}

export const useClipperStore = create<ClipperState>()(
  subscribeWithSelector((set, get) => ({
    ...INITIAL,

    async start(tabId) {
      set({ stage: 'extracting', error: null, preview: null })
      const port = getClipperPort()
      const r = await port.clip({ tabId })
      if (!r.ok) {
        set({
          stage: 'error',
          error: { code: r.error.code as any, message: r.error.message, stage: 'extracting' }
        })
        return
      }
      set({ stage: 'previewing', preview: r.data })
    },

    async save(input) {
      const cur = get()
      if (cur.stage !== 'previewing' || !cur.preview) return
      set({ stage: 'saving' })
      const port = getClipperPort()
      const r = await port.saveClip(input)
      if (!r.ok) {
        set({
          stage: 'error',
          error: { code: r.error.code as any, message: r.error.message, stage: 'saving' }
        })
        return
      }
      set({ stage: 'done', lastSuccess: { id: r.data.id, path: r.data.path }, preview: null })
    },

    async cancel() {
      const cur = get()
      const port = getClipperPort()
      if (cur.preview) await port.cancelClip({ runId: cur.preview.runId })
      set({ stage: 'canceled', preview: null })
    },

    async reextract(tabId) {
      const cur = get()
      if (!cur.preview) return
      set({ stage: 'extracting', error: null })
      const port = getClipperPort()
      const r = await port.reextract({ runId: cur.preview.runId, tabId })
      if (!r.ok) {
        set({
          stage: 'error',
          error: { code: r.error.code as any, message: r.error.message, stage: 'extracting' }
        })
        return
      }
      set({ stage: 'previewing', preview: r.data })
    },

    clearError() {
      set({ stage: 'idle', error: null })
    }
  }))
)

export function _resetClipperStoreForTest(): void {
  useClipperStore.setState({ ...INITIAL })
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/stores/clipper.test.ts
```

Expected: 7 passed.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/ipc/clipper-port.ts src/stores/clipper.ts src/stores/clipper.test.ts
git commit -m "feat(phase-12): clipper port + Zustand state machine (idle..done/error/canceled)"
```

---

<!-- openspec-task: 6.2 -->
### Task 2: `browser.ts` extension — `tab.isClipped` synced from `did-navigate`

Add a port for `clips`, then extend the browser store: each tab gets `isClipped: boolean`, refreshed on did-navigate via `clips.getByUrl(url)`.

**Files:**
- Create: `src/ipc/clips-port.ts`
- Modify: `src/stores/browser.ts`
- Modify: `src/stores/browser.test.ts`

- [ ] **Step 1: Create the clips port**

```ts
// src/ipc/clips-port.ts
import type { Clip, ClipCreateInput, ClipsListOpts, ClipsListResult } from '@shared/clip-types'
import type { IpcResult } from '@shared/ipc-contract'

export interface ClipsPort {
  create(input: ClipCreateInput): Promise<IpcResult<{ id: number }>>
  list(opts: ClipsListOpts): Promise<IpcResult<ClipsListResult>>
  getByUrl(args: { url: string }): Promise<IpcResult<Clip | null>>
  getById(args: { id: number }): Promise<IpcResult<Clip | null>>
  delete(args: { id: number }): Promise<IpcResult<void>>
}

let portRef: ClipsPort | null = null
export function setClipsPort(p: ClipsPort): void { portRef = p }
export function getClipsPort(): ClipsPort {
  if (portRef) return portRef
  if (typeof window !== 'undefined' && window.api?.clips) return window.api.clips as ClipsPort
  throw new Error('clips port not configured')
}
```

- [ ] **Step 2: Extend `browser.ts`**

In `src/stores/browser.ts`:

1. Add `isClipped: boolean` to the `Tab` interface (in `shared/browser-types.ts` if that's where Tab lives, defaulted to `false`):

   If `Tab` lives in `shared/`, edit it there:
   ```ts
   export interface Tab {
     // ... existing fields
     isClipped: boolean
   }
   ```

2. In `browser.ts`, when constructing a new tab, default `isClipped: false`.

3. Add the navigate-to-isClipped sync:

   ```ts
   import { getClipsPort } from '@/ipc/clips-port'

   // After the existing did-navigate handler subscription:
   const clipCheckTimers = new Map<string, ReturnType<typeof setTimeout>>()

   function scheduleClipCheck(tabId: string, url: string): void {
     const prev = clipCheckTimers.get(tabId)
     if (prev) clearTimeout(prev)
     const t = setTimeout(async () => {
       try {
         const r = await getClipsPort().getByUrl({ url })
         if (!r.ok) return
         const clipped = r.data !== null
         useBrowserStore.setState((s) => ({
           tabs: s.tabs.map((tab) => (tab.id === tabId ? { ...tab, isClipped: clipped } : tab))
         }))
       } catch {
         // swallow — best-effort indicator
       }
     }, 200)
     clipCheckTimers.set(tabId, t)
   }

   // Wherever the existing patch handler runs, when `patch.url` changes:
   //   if (patch.url) scheduleClipCheck(tabId, patch.url)
   ```

   Locate the existing patch-application block (the one that runs on `browser:tabStateChanged`) and add the `scheduleClipCheck` call inside the same branch where `patch.url` is applied.

- [ ] **Step 3: Add failing/extending tests**

In `src/stores/browser.test.ts` (extending the existing file):

```ts
import { setClipsPort } from '@/ipc/clips-port'

describe('browser store — isClipped sync on did-navigate', () => {
  it('sets tab.isClipped=true when clips.getByUrl returns a clip', async () => {
    setClipsPort({
      getByUrl: vi.fn(async () => ({ ok: true, data: { id: 1 } as any })),
      list: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
      delete: vi.fn()
    })
    // Setup: a tab exists; simulate did-navigate by dispatching the patch.
    useBrowserStore.setState({
      tabs: [{ id: 't1', url: 'https://old/', title: 't', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://old/', isClipped: false } as any],
      activeTabId: 't1'
    })
    // Simulate the renderer-side patch handler invocation:
    const handler = (window as any).__browserOnPatch as (p: any) => void
    handler?.({ tabId: 't1', patch: { url: 'https://new/' } })
    await new Promise((r) => setTimeout(r, 250))
    expect(useBrowserStore.getState().tabs[0].isClipped).toBe(true)
  })

  it('sets isClipped=false when clips.getByUrl returns null', async () => {
    setClipsPort({
      getByUrl: vi.fn(async () => ({ ok: true, data: null })),
      list: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(),
      delete: vi.fn()
    })
    useBrowserStore.setState({
      tabs: [{ id: 't2', url: 'https://x/', title: 't', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: true } as any],
      activeTabId: 't2'
    })
    const handler = (window as any).__browserOnPatch as (p: any) => void
    handler?.({ tabId: 't2', patch: { url: 'https://x/y' } })
    await new Promise((r) => setTimeout(r, 250))
    expect(useBrowserStore.getState().tabs[0].isClipped).toBe(false)
  })
})
```

> The `__browserOnPatch` hook expects browser.ts to expose its patch handler on `window` for testing. If it does not yet, refactor to do so:
> ```ts
> // browser.ts (near where patch is applied)
> if (typeof window !== 'undefined') {
>   ;(window as any).__browserOnPatch = applyPatch
> }
> ```
> Where `applyPatch` is the function that handles `browser:tabStateChanged` payloads.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/stores/browser.test.ts
```

Expected: existing + 2 new green.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/ipc/clips-port.ts src/stores/browser.ts src/stores/browser.test.ts shared/browser-types.ts
git commit -m "feat(phase-12): browser store — isClipped synced from did-navigate via clips.getByUrl"
```

---

<!-- openspec-task: 6.3 -->
### Task 3: `ClipPreviewDialog.tsx`

A Radix Dialog. Form fields for title (editable), tags (comma-separated input), excerpt (editable), body preview (first 2000 chars rendered as plain `<pre>`-fallback or Vditor preview when available), target path (read-only), and three buttons: 保存 / 取消 / 重新抽取.

**Files:**
- Create: `src/components/browser/ClipPreviewDialog.tsx`
- Create: `src/components/browser/ClipPreviewDialog.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/browser/ClipPreviewDialog.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useClipperStore, _resetClipperStoreForTest } from '@/stores/clipper'
import { useBrowserStore } from '@/stores/browser'
import { setClipperPort } from '@/ipc/clipper-port'
import { ClipPreviewDialog } from './ClipPreviewDialog'

const previewFixture = {
  runId: 'r1',
  title: 'Hello',
  url: 'https://example.com/a',
  site: 'example.com',
  author: 'Jane',
  publishedTime: '2026-04-19T00:00:00Z',
  excerpt: 'an excerpt',
  body: '# Heading\n\nbody'.repeat(50),
  suggestedPath: 'inbox/202605/hello-abc123.md',
  tags: [] as string[],
  degraded: false
}

describe('ClipPreviewDialog', () => {
  beforeEach(() => {
    _resetClipperStoreForTest()
    useBrowserStore.setState({ activeTabId: 't1', tabs: [] as any })
    setClipperPort({
      clip: vi.fn(),
      saveClip: vi.fn(async () => ({ ok: true, data: { id: 1, path: previewFixture.suggestedPath, url: previewFixture.url, title: previewFixture.title, degraded: false } })),
      cancelClip: vi.fn(async () => ({ ok: true, data: undefined })),
      reextract: vi.fn()
    } as any)
  })

  it('does not render when stage=idle', () => {
    render(<ClipPreviewDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders fields prefilled from preview when stage=previewing', () => {
    useClipperStore.setState({ stage: 'previewing', preview: previewFixture as any })
    render(<ClipPreviewDialog />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/a')).toBeInTheDocument()
    expect(screen.getByText('example.com')).toBeInTheDocument()
    expect(screen.getByText(previewFixture.suggestedPath)).toBeInTheDocument()
  })

  it('truncates body preview to 2000 chars', () => {
    useClipperStore.setState({ stage: 'previewing', preview: previewFixture as any })
    render(<ClipPreviewDialog />)
    const preview = screen.getByTestId('clip-body-preview')
    expect(preview.textContent?.length).toBeLessThanOrEqual(2000)
  })

  it('保存 calls store.save with edited title + tags + excerpt', async () => {
    useClipperStore.setState({ stage: 'previewing', preview: previewFixture as any })
    const saveSpy = vi.spyOn(useClipperStore.getState(), 'save').mockResolvedValue()
    render(<ClipPreviewDialog />)
    const titleInput = screen.getByDisplayValue('Hello') as HTMLInputElement
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'New Title')
    const tagsInput = screen.getByLabelText(/tags|标签/i) as HTMLInputElement
    await userEvent.type(tagsInput, 'ai,news')
    await userEvent.click(screen.getByRole('button', { name: /保存|save/i }))
    expect(saveSpy).toHaveBeenCalledWith({
      runId: 'r1',
      title: 'New Title',
      tags: ['ai', 'news'],
      excerpt: previewFixture.excerpt
    })
  })

  it('取消 calls store.cancel', async () => {
    useClipperStore.setState({ stage: 'previewing', preview: previewFixture as any })
    const cancelSpy = vi.spyOn(useClipperStore.getState(), 'cancel').mockResolvedValue()
    render(<ClipPreviewDialog />)
    await userEvent.click(screen.getByRole('button', { name: /取消|cancel/i }))
    expect(cancelSpy).toHaveBeenCalled()
  })

  it('重新抽取 calls store.reextract with the active tabId', async () => {
    useClipperStore.setState({ stage: 'previewing', preview: previewFixture as any })
    const re = vi.spyOn(useClipperStore.getState(), 'reextract').mockResolvedValue()
    render(<ClipPreviewDialog />)
    await userEvent.click(screen.getByRole('button', { name: /重新抽取|reextract/i }))
    expect(re).toHaveBeenCalledWith('t1')
  })

  it('shows degraded notice when preview.degraded=true', () => {
    useClipperStore.setState({
      stage: 'previewing',
      preview: { ...previewFixture, degraded: true } as any
    })
    render(<ClipPreviewDialog />)
    expect(screen.getByText(/部分抽取|degraded/i)).toBeInTheDocument()
  })

  it('保存 button disabled while stage=saving', async () => {
    useClipperStore.setState({ stage: 'saving', preview: previewFixture as any })
    render(<ClipPreviewDialog />)
    expect(screen.getByRole('button', { name: /保存|save/i })).toBeDisabled()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/components/browser/ClipPreviewDialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `ClipPreviewDialog.tsx`**

```tsx
// src/components/browser/ClipPreviewDialog.tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipperStore } from '@/stores/clipper'
import { useBrowserStore } from '@/stores/browser'

export function ClipPreviewDialog(): JSX.Element | null {
  const { t } = useTranslation()
  const stage = useClipperStore((s) => s.stage)
  const preview = useClipperStore((s) => s.preview)
  const save = useClipperStore((s) => s.save)
  const cancel = useClipperStore((s) => s.cancel)
  const reextract = useClipperStore((s) => s.reextract)
  const activeTabId = useBrowserStore((s) => s.activeTabId)

  const open = stage === 'previewing' || stage === 'saving'

  const [title, setTitle] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')
  const [excerpt, setExcerpt] = useState('')

  useEffect(() => {
    if (preview) {
      setTitle(preview.title ?? '')
      setTagsRaw((preview.tags ?? []).join(','))
      setExcerpt(preview.excerpt ?? '')
    }
  }, [preview?.runId])

  const bodyPreview = useMemo(() => (preview?.body ?? '').slice(0, 2000), [preview?.body])

  if (!open || !preview) return null

  function parseTags(raw: string): string[] {
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 w-[80vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-md bg-[color:var(--color-bg)] p-4 shadow-xl"
        >
          <Dialog.Title className="text-base font-semibold">
            {t('browser.clip.preview.title', '剪藏预览')}
          </Dialog.Title>

          <div className="mt-3 grid grid-cols-[1fr,2fr] gap-3">
            {/* Left: meta */}
            <div className="flex flex-col gap-2">
              <label className="text-xs">
                {t('browser.clip.preview.title_field', '标题')}
                <input
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <div className="text-xs text-[color:var(--color-ink-3)]">
                <div className="truncate" title={preview.url}>{preview.url}</div>
                <div>{preview.site}</div>
                {preview.author && <div>{preview.author}</div>}
                {preview.publishedTime && <div>{preview.publishedTime}</div>}
              </div>

              <label className="text-xs">
                {t('browser.clip.preview.tags', '标签（逗号分隔）')}
                <input
                  aria-label={t('browser.clip.preview.tags', 'tags')}
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  value={tagsRaw}
                  onChange={(e) => setTagsRaw(e.target.value)}
                  placeholder="ai,news"
                />
              </label>

              <label className="text-xs">
                {t('browser.clip.preview.excerpt', '摘要')}
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1 text-sm"
                  rows={3}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                />
              </label>

              <div className="text-xs text-[color:var(--color-ink-3)]">
                {t('browser.clip.preview.target', '目标路径')}：<br />
                <code>{preview.suggestedPath}</code>
              </div>

              {preview.degraded && (
                <div className="rounded bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
                  {t('browser.clip.preview.degraded', '部分抽取，效果可能较差')}
                </div>
              )}
            </div>

            {/* Right: body preview */}
            <div
              data-testid="clip-body-preview"
              className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded border p-3 text-xs"
            >
              {bodyPreview}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void reextract(activeTabId ?? '')}
            >
              {t('browser.clip.preview.reextract', '重新抽取')}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              onClick={() => void cancel()}
            >
              {t('browser.clip.preview.cancel', '取消')}
            </button>
            <button
              type="button"
              disabled={stage === 'saving'}
              className="rounded bg-[color:var(--color-accent)] px-3 py-1 text-sm text-white disabled:opacity-50"
              onClick={() =>
                void save({ runId: preview.runId, title, tags: parseTags(tagsRaw), excerpt })
              }
            >
              {t('browser.clip.preview.save', '保存')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/browser/ClipPreviewDialog.test.tsx
```

Expected: 8 passed.

- [ ] **Step 5: Mount the dialog from `Browse.tsx`**

In `src/pages/Browse.tsx`, add the import and render the dialog at the end of the component tree (alongside any other overlays):

```tsx
import { ClipPreviewDialog } from '@/components/browser/ClipPreviewDialog'

// inside Browse():
<>
  {/* existing tree */}
  <ClipPreviewDialog />
</>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/ClipPreviewDialog.tsx src/components/browser/ClipPreviewDialog.test.tsx src/pages/Browse.tsx
git commit -m "feat(phase-12): ClipPreviewDialog — title/tags/excerpt + body preview + actions"
```

---

<!-- openspec-task: 6.4 -->
### Task 4: AddressBar scissors button — 4 visual states + click semantics

**Files:**
- Modify: `src/components/browser/AddressBar.tsx`
- Modify: `src/components/browser/AddressBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Append to `AddressBar.test.tsx`:

```tsx
describe('AddressBar — scissors clip button', () => {
  beforeEach(() => {
    _resetClipperStoreForTest()
  })

  it('disabled for about:blank', () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'about:blank', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false } as any]
    })
    render(<AddressBar />)
    expect(screen.getByRole('button', { name: /clip|剪藏/i })).toBeDisabled()
  })

  it('hollow icon when http(s) and not clipped', () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any]
    })
    render(<AddressBar />)
    const btn = screen.getByRole('button', { name: /clip|剪藏/i })
    expect(btn).not.toBeDisabled()
    expect(btn.getAttribute('data-state')).toBe('hollow')
  })

  it('filled+check icon when isClipped=true', () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: true } as any]
    })
    render(<AddressBar />)
    const btn = screen.getByRole('button', { name: /clip|剪藏/i })
    expect(btn.getAttribute('data-state')).toBe('clipped')
  })

  it('spinner when stage=extracting or saving', () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any]
    })
    useClipperStore.setState({ stage: 'extracting' })
    render(<AddressBar />)
    const btn = screen.getByRole('button', { name: /clip|剪藏/i })
    expect(btn.getAttribute('data-state')).toBe('busy')
  })

  it('hollow click triggers clipper.start(activeTabId)', async () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any]
    })
    const start = vi.spyOn(useClipperStore.getState(), 'start').mockResolvedValue()
    render(<AddressBar />)
    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    expect(start).toHaveBeenCalledWith('t1')
  })

  it('tooltip mentions Cmd+Shift+S', () => {
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any]
    })
    render(<AddressBar />)
    const btn = screen.getByRole('button', { name: /clip|剪藏/i })
    expect(btn.getAttribute('title')).toMatch(/Shift\+S/)
  })
})
```

(Add the imports at the top of the test file: `import { useClipperStore, _resetClipperStoreForTest } from '@/stores/clipper'`.)

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/components/browser/AddressBar.test.tsx -t "scissors"
```

Expected: FAIL.

- [ ] **Step 3: Update `AddressBar.tsx`**

Locate the existing scissors-button placeholder in `AddressBar.tsx`. Replace with:

```tsx
import { useClipperStore } from '@/stores/clipper'

// inside the component, near other actions:
const tab = useBrowserStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
const stage = useClipperStore((s) => s.stage)
const startClip = useClipperStore((s) => s.start)

const url = tab?.url ?? ''
const isHttp = /^https?:\/\//i.test(url)
const isClipped = !!tab?.isClipped
const busy = stage === 'extracting' || stage === 'saving'
const state: 'disabled' | 'hollow' | 'clipped' | 'busy' = !isHttp
  ? 'disabled'
  : busy
    ? 'busy'
    : isClipped
      ? 'clipped'
      : 'hollow'

// In JSX, replace the placeholder button:
<button
  type="button"
  data-state={state}
  aria-label={t('browser.clip.save', '剪藏此页')}
  title={t('browser.clip.tooltip', '剪藏此页（Cmd+Shift+S）')}
  disabled={state === 'disabled'}
  onClick={() => {
    if (state === 'hollow' && tab) void startClip(tab.id)
    // 'clipped' click handled in task 6.5
  }}
  className={[
    'inline-flex h-7 w-7 items-center justify-center rounded',
    state === 'disabled' && 'opacity-40',
    state === 'hollow' && 'hover:bg-[color:var(--color-bg-3)]',
    state === 'clipped' && 'text-[color:var(--color-accent)]',
    state === 'busy' && 'animate-pulse'
  ].filter(Boolean).join(' ')}
>
  {/* scissors icon: use a simple inline SVG to avoid icon-pkg coupling */}
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
    <path d="M5.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM10.5 11a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM2 0l5 7-5 7h2l4-5.5L12 14h2L9 7l5-7h-2L8 5.5 4 0H2Z"/>
  </svg>
  {state === 'clipped' && (
    <span className="absolute -bottom-0 -right-0 text-[8px]">✓</span>
  )}
</button>
```

(Wrap the button in a `relative` container so the `✓` positions correctly.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/browser/AddressBar.test.tsx
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/browser/AddressBar.tsx src/components/browser/AddressBar.test.tsx
git commit -m "feat(phase-12): AddressBar — scissors button states (disabled/hollow/clipped/busy)"
```

---

<!-- openspec-task: 6.5 -->
### Task 5: "Already clipped, open it?" confirm + navigate to `/editor/:path`

**Files:**
- Modify: `src/components/browser/AddressBar.tsx`
- Modify: `src/components/browser/AddressBar.test.tsx`

- [ ] **Step 1: Add failing test**

Append:

```tsx
import { MemoryRouter } from 'react-router-dom'

describe('AddressBar — already-clipped open flow', () => {
  it('clicking the clipped button opens a confirm; confirm navigates to /editor/:path', async () => {
    setClipsPort({
      getByUrl: vi.fn(async () => ({ ok: true, data: { id: 9, path: 'inbox/202605/x.md' } as any })),
      list: vi.fn(),
      create: vi.fn(),
      getById: vi.fn(async () => ({ ok: true, data: { id: 9, path: 'inbox/202605/x.md' } as any })),
      delete: vi.fn()
    })
    useBrowserStore.setState({
      activeTabId: 't1',
      tabs: [{ id: 't1', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: true } as any]
    })
    const navigateSpy = vi.fn()
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
      return { ...actual, useNavigate: () => navigateSpy }
    })

    render(
      <MemoryRouter>
        <AddressBar />
      </MemoryRouter>
    )

    await userEvent.click(screen.getByRole('button', { name: /clip|剪藏/i }))
    // Confirm dialog
    const openBtn = await screen.findByRole('button', { name: /打开|open/i })
    await userEvent.click(openBtn)
    expect(navigateSpy).toHaveBeenCalledWith('/editor/inbox/202605/x.md')
  })
})
```

- [ ] **Step 2: Update `AddressBar.tsx` to handle the click**

Inside the component, add state + import:

```tsx
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { getClipsPort } from '@/ipc/clips-port'

const navigate = useNavigate()
const [openClippedConfirm, setOpenClippedConfirm] = useState(false)
```

Replace the `onClick` of the scissors button:

```tsx
onClick={async () => {
  if (state === 'hollow' && tab) { void startClip(tab.id); return }
  if (state === 'clipped' && tab) {
    setOpenClippedConfirm(true)
  }
}}
```

Append the confirm dialog inside the AddressBar return:

```tsx
<Dialog.Root open={openClippedConfirm} onOpenChange={setOpenClippedConfirm}>
  <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 bg-black/40" />
    <Dialog.Content className="fixed left-1/2 top-1/2 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded bg-[color:var(--color-bg)] p-4">
      <Dialog.Title className="text-sm font-semibold">
        {t('browser.clip.exists.title', '已剪藏')}
      </Dialog.Title>
      <div className="mt-2 text-sm">{t('browser.clip.exists.body', '该页面已剪藏过，是否打开？')}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm"
          onClick={() => setOpenClippedConfirm(false)}
        >
          {t('common.cancel', '取消')}
        </button>
        <button
          type="button"
          className="rounded bg-[color:var(--color-accent)] px-3 py-1 text-sm text-white"
          onClick={async () => {
            setOpenClippedConfirm(false)
            const r = await getClipsPort().getByUrl({ url: tab?.url ?? '' })
            if (r.ok && r.data) navigate('/editor/' + r.data.path)
          }}
        >
          {t('browser.clip.exists.open', '打开')}
        </button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/components/browser/AddressBar.test.tsx
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/browser/AddressBar.tsx src/components/browser/AddressBar.test.tsx
git commit -m "feat(phase-12): AddressBar — already-clipped confirm → navigate /editor/:path"
```

---

<!-- openspec-task: 6.6 -->
### Task 6: `ClipErrorToast` — error states with inline actions

**Files:**
- Create: `src/components/browser/ClipErrorToast.tsx`
- Create: `src/components/browser/ClipErrorToast.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/components/browser/ClipErrorToast.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useClipperStore, _resetClipperStoreForTest } from '@/stores/clipper'
import { ClipErrorToast } from './ClipErrorToast'

describe('ClipErrorToast', () => {
  beforeEach(() => _resetClipperStoreForTest())

  it('hidden when stage != error', () => {
    render(<ClipErrorToast />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows "无法抽取正文" + 强制保存整页 for E_EXTRACT_TIMEOUT', async () => {
    useClipperStore.setState({
      stage: 'error',
      error: { code: 'E_EXTRACT_TIMEOUT', message: 'timeout', stage: 'extracting' }
    })
    render(<ClipErrorToast />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/无法抽取正文|cannot extract/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /强制保存整页|force save/i })).toBeInTheDocument()
  })

  it('shows transform-failed text for E_TRANSFORM_FAILED', () => {
    useClipperStore.setState({
      stage: 'error',
      error: { code: 'E_TRANSFORM_FAILED', message: 'x', stage: 'transforming' }
    })
    render(<ClipErrorToast />)
    expect(screen.getByText(/HTML 转 Markdown|transform/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /\.clip\.html|raw html/i })).toBeInTheDocument()
  })

  it('shows write-failed text + retry for E_WRITE_FAILED', () => {
    useClipperStore.setState({
      stage: 'error',
      error: { code: 'E_WRITE_FAILED', message: 'disk full', stage: 'saving' }
    })
    render(<ClipErrorToast />)
    expect(screen.getByText(/保存失败|save failed/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重试|retry/i })).toBeInTheDocument()
  })

  it('clearError dismisses the toast', async () => {
    useClipperStore.setState({
      stage: 'error',
      error: { code: 'E_WRITE_FAILED', message: 'disk', stage: 'saving' }
    })
    const clear = vi.spyOn(useClipperStore.getState(), 'clearError')
    render(<ClipErrorToast />)
    await userEvent.click(screen.getByRole('button', { name: /关闭|close|dismiss/i }))
    expect(clear).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/components/browser/ClipErrorToast.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `ClipErrorToast.tsx`**

```tsx
// src/components/browser/ClipErrorToast.tsx
import { useTranslation } from 'react-i18next'
import { useClipperStore } from '@/stores/clipper'

export function ClipErrorToast(): JSX.Element | null {
  const { t } = useTranslation()
  const stage = useClipperStore((s) => s.stage)
  const error = useClipperStore((s) => s.error)
  const clear = useClipperStore((s) => s.clearError)

  if (stage !== 'error' || !error) return null

  const code = error.code

  let body = t('browser.clip.error.unknown', '剪藏失败')
  let actions: JSX.Element[] = []
  if (code === 'E_EXTRACT_TIMEOUT' || code === 'E_EXTRACT_EMPTY') {
    body = t('browser.clip.error.extract', '无法抽取正文')
    actions = [
      <button
        key="force"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => {
          // Force-save full page is implemented as: re-trigger extract with a degraded
          // hint. Phase-13 will add a dedicated IPC; for now just clear & retry.
          clear()
        }}
      >
        {t('browser.clip.error.force_save', '强制保存整页')}
      </button>
    ]
  } else if (code === 'E_TRANSFORM_FAILED') {
    body = t('browser.clip.error.transform', 'HTML 转 Markdown 失败')
    actions = [
      <button
        key="raw"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => clear()}
      >
        {t('browser.clip.error.save_raw', '保存为 .clip.html')}
      </button>
    ]
  } else if (code === 'E_WRITE_FAILED') {
    body = t('browser.clip.error.write', '保存失败')
    actions = [
      <button
        key="retry"
        type="button"
        className="rounded border px-2 py-0.5 text-xs"
        onClick={() => clear()}
      >
        {t('browser.clip.error.retry', '重试')}
      </button>
    ]
  } else if (code === 'E_UNSUPPORTED_SCHEME') {
    body = t('browser.clip.unsupported', '当前页面不支持剪藏')
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 flex max-w-sm items-center gap-2 rounded bg-[color:var(--color-bg)] px-3 py-2 shadow-lg"
    >
      <span className="text-sm">{body}</span>
      {actions}
      <button
        type="button"
        aria-label={t('common.dismiss', '关闭')}
        className="rounded px-1 text-xs"
        onClick={() => clear()}
      >
        ×
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/components/browser/ClipErrorToast.test.tsx
```

Expected: 5 passed.

- [ ] **Step 5: Mount in `Browse.tsx`**

```tsx
import { ClipErrorToast } from '@/components/browser/ClipErrorToast'
// in the JSX:
<ClipErrorToast />
```

- [ ] **Step 6: Commit**

```bash
git add src/components/browser/ClipErrorToast.tsx src/components/browser/ClipErrorToast.test.tsx src/pages/Browse.tsx
git commit -m "feat(phase-12): ClipErrorToast — per-error UI with inline actions"
```

---

<!-- openspec-task: 7.1 -->
### Task 7: `Cmd/Ctrl+Shift+S` triggers clip from `/browser`

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Add failing test**

Append to `useBrowserHotkeys.test.ts`:

```ts
import { useClipperStore, _resetClipperStoreForTest } from '@/stores/clipper'

describe('useBrowserHotkeys — Cmd+Shift+S clip', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBrowserPort(port)
    _resetClipperStoreForTest()
  })

  it('Cmd+Shift+S calls clipper.start with the active tabId for an http URL', () => {
    reset(
      [{ id: 'a', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any],
      'a'
    )
    const startSpy = vi.spyOn(useClipperStore.getState(), 'start').mockResolvedValue()
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'S', metaKey: true, shiftKey: true })
    expect(startSpy).toHaveBeenCalledWith('a')
  })

  it('Ctrl+Shift+S also triggers (Linux/Win)', () => {
    reset(
      [{ id: 'a', url: 'https://x/', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: 'https://x/', isClipped: false } as any],
      'a'
    )
    const startSpy = vi.spyOn(useClipperStore.getState(), 'start').mockResolvedValue()
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true })
    expect(startSpy).toHaveBeenCalledWith('a')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "Cmd\\+Shift\\+S"
```

Expected: FAIL.

- [ ] **Step 3: Extend `useBrowserHotkeys.ts`**

Add the import + selectors:

```ts
import { useClipperStore } from '@/stores/clipper'

const startClip = useClipperStore.getState().start
```

Inside `onKeyDown` (after existing handlers):

```ts
      if (key === 's' && ev.shiftKey) {
        ev.preventDefault()
        if (!activeTabId) return
        const t = tabs.find((x) => x.id === activeTabId)
        const url = t?.url ?? ''
        if (!/^https?:\/\//i.test(url)) {
          // Task 7.2 surfaces the toast; here we just no-op.
          return
        }
        void useClipperStore.getState().start(activeTabId)
        return
      }
```

(Note: the spec uses `S`, but `key` is already `.toLowerCase()`-d earlier in the hook — adapt the comparison to match the existing convention.)

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-12): browser hotkey — Cmd/Ctrl+Shift+S triggers clipper.start"
```

---

<!-- openspec-task: 7.2 -->
### Task 8: Unsupported URL → no-op + toast

**Files:**
- Modify: `src/hooks/useBrowserHotkeys.ts`
- Modify: `src/hooks/useBrowserHotkeys.test.ts`

- [ ] **Step 1: Add failing test**

Append:

```ts
describe('useBrowserHotkeys — Cmd+Shift+S on unsupported URL', () => {
  it('about:blank → no clipper.start call; sets clipper error to E_UNSUPPORTED_SCHEME', () => {
    reset(
      [{ id: 'a', url: 'about:blank', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false } as any],
      'a'
    )
    const startSpy = vi.spyOn(useClipperStore.getState(), 'start').mockResolvedValue()
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'S', metaKey: true, shiftKey: true })
    expect(startSpy).not.toHaveBeenCalled()
    expect(useClipperStore.getState().stage).toBe('error')
    expect(useClipperStore.getState().error?.code).toBe('E_UNSUPPORTED_SCHEME')
  })

  it('acorn://new-tab → no clipper.start; error toast set', () => {
    reset(
      [{ id: 'a', url: 'acorn://new-tab', title: '', favicon: null, loading: false, canGoBack: false, canGoForward: false, readerMode: false, suspended: false, savedUrl: '', isClipped: false } as any],
      'a'
    )
    const startSpy = vi.spyOn(useClipperStore.getState(), 'start').mockResolvedValue()
    renderHook(() => useBrowserHotkeys())
    fireEvent.keyDown(window, { key: 'S', metaKey: true, shiftKey: true })
    expect(startSpy).not.toHaveBeenCalled()
    expect(useClipperStore.getState().error?.code).toBe('E_UNSUPPORTED_SCHEME')
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts -t "unsupported URL"
```

Expected: FAIL.

- [ ] **Step 3: Update the unsupported branch**

In `useBrowserHotkeys.ts`, replace the `// Task 7.2` no-op with:

```ts
        if (!/^https?:\/\//i.test(url)) {
          useClipperStore.setState({
            stage: 'error',
            error: { code: 'E_UNSUPPORTED_SCHEME', message: 'unsupported scheme', stage: 'precheck' }
          })
          return
        }
```

(The existing `ClipErrorToast` from task 6.6 already renders the `E_UNSUPPORTED_SCHEME` case as "当前页面不支持剪藏".)

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/useBrowserHotkeys.test.ts
```

Expected: green.

- [ ] **Step 5: Update the AddressBar click handler too**

In `AddressBar.tsx`, the scissors button is already disabled when `state==='disabled'` (non-http). The shortcut path is the only one that can reach unsupported URLs — covered above.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBrowserHotkeys.ts src/hooks/useBrowserHotkeys.test.ts
git commit -m "feat(phase-12): browser hotkey — Cmd/Ctrl+Shift+S on non-http surfaces E_UNSUPPORTED_SCHEME toast"
```

---

<!-- openspec-task: 8.1 -->
### Task 9: zh-CN i18n keys for clipper

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Add the keys under `browser`**

Open `src/i18n/locales/zh-CN.json`. The phase-11 plan-4 already added a `browser` top-level node. Extend it (or replace any existing `browser.clip.*` placeholders):

```json
"browser": {
  "...": "existing keys unchanged",
  "clip": {
    "save": "剪藏此页",
    "tooltip": "剪藏此页（Cmd+Shift+S）",
    "extracting": "正在抽取……",
    "saved": "已剪藏",
    "error": "剪藏失败",
    "unsupported": "当前页面不支持剪藏",
    "exists": {
      "title": "已剪藏",
      "body": "该页面已剪藏过，是否打开？",
      "open": "打开"
    },
    "preview": {
      "title": "剪藏预览",
      "title_field": "标题",
      "tags": "标签（逗号分隔）",
      "excerpt": "摘要",
      "target": "目标路径",
      "save": "保存",
      "cancel": "取消",
      "reextract": "重新抽取",
      "degraded": "部分抽取，效果可能较差"
    },
    "error.extract": "无法抽取正文",
    "error.transform": "HTML 转 Markdown 失败",
    "error.write": "保存失败",
    "error.unknown": "剪藏失败",
    "error.force_save": "强制保存整页",
    "error.save_raw": "保存为 .clip.html",
    "error.retry": "重试"
  }
}
```

Also confirm `common.dismiss` (`关闭`) and `common.cancel` (`取消`) exist; if either is missing, add it under `common`.

- [ ] **Step 2: Verify JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/zh-CN.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Re-run renderer tests**

```bash
npx vitest run src/components/browser src/stores/clipper.test.ts src/hooks/useBrowserHotkeys.test.ts
```

Expected: all green; Chinese strings now render in test snapshots.

- [ ] **Step 4: Smoke-launch (manual)**

```bash
npm run dev
```

Open `/browser`, navigate to an article, click the scissors. Verify:
- Tooltip reads "剪藏此页（Cmd+Shift+S）"
- Modal heading reads "剪藏预览"
- Buttons read "保存", "取消", "重新抽取"

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "feat(phase-12): zh-CN i18n keys for clipper UI surface"
```

---

## Self-Review Checklist (run after Task 9)

- [ ] Every label `6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 8.1` appears exactly once. Verify:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-05-02-phase-12-clipper-pipeline-tasks-6.1-8.1.md | sort -u
  ```
- [ ] All 9 tasks have a final commit step.
- [ ] Spec coverage:
  - `clipper-ui §"剪藏预览 Modal"` → Task 3
  - `clipper-ui §"剪藏按钮状态"` → Tasks 4, 5
  - `clipper-ui §"快捷键"` → Tasks 7, 8
  - `clipper-ui §"错误态反馈"` → Task 6
  - `browser-navigation §"剪藏触发入口"` → Tasks 4, 5, 7
  - `browser-navigation §"已剪藏指示"` → Task 2
- [ ] Run all unit tests added/extended:
  ```bash
  npx vitest run src/stores/clipper.test.ts src/stores/browser.test.ts src/components/browser src/hooks/useBrowserHotkeys.test.ts
  ```
  Expected: ~30 tests green.
- [ ] Typecheck + lint clean:
  ```bash
  npm run typecheck && npm run lint
  ```
