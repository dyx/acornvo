# Phase 05 — Indexer & Watcher: Plan 4 (IPC + lifecycle + progress overlay UI)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-05-indexer-watcher`
> **Task range:** OpenSpec tasks `6.1`–`8.4` (10 tasks)
> **Plan order:** 4 of 5. Depends on Plans 1–3.
> **Status:** Not started
> **Created:** 2026-04-26

---

## Goal

Surface the indexer + watcher to the renderer: extend `shared/ipc-contract.ts` with an `index` namespace + 7 event channels, implement the IPC handlers, drive the indexer/watcher lifecycle from `project:changed` and `app.will-quit`, and ship the React full-screen progress overlay with i18n.

## Architecture

- **IPC namespace `index`** is a 3-method handler set: `status()` / `startScan()` / `cancelScan()`. Following the existing `IpcContract` shape from phase-01/02, all calls return synchronously serialisable types and `IpcError` is thrown for invalid state (e.g. `startScan` while `scanning`).
- **Event channels** use the existing `IpcEventContract` from `shared/ipc-contract.ts`. We add 7 new channels:
  - `index:progress` — `{ scanned, total, currentPath? }`
  - `index:done` — `{}` (signal-only)
  - `index:error` — `{ message }`
  - `index:stateChange` — `{ state: IndexStateName }`
  - `index:fileChanged` — `{ path, contentHash, mtime, frontmatter }`
  - `index:fileDeleted` — `{ path }`
  - `index:fileRenamed` — `{ oldPath, newPath }`
- **Lifecycle wiring** lives in `electron/main/main.ts` (or wherever phase-02's `project:changed` listener already is). On grove open: `indexer.setDb(currentDb)` + `indexer.startScan(root)` then (auto inside `startScan`'s tail) `watcher.start(root, currentDb)`. On grove close: `await watcher.stop(); indexer.reset()`. On `will-quit`: `await watcher.stop()`.
- **The IPC layer also forwards** the indexer/watcher emitter events to `BrowserWindow.webContents.send(channel, payload)` so the React side gets them via the `IpcEventApi` already exposed in preload.
- **`IndexProgressOverlay.tsx`** is a Radix Dialog (re-using existing `@radix-ui/react-dialog` dep) — modal, semi-transparent backdrop, progress bar, "后台继续" button calling `window.api.index.cancelScan()`. Mounted in `App.tsx`; visibility = `state === 'scanning'`.

## Tech Stack

- Existing: `@radix-ui/react-dialog`, `i18next`, `react-i18next`, `tailwindcss`
- No new deps

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `shared/ipc-contract.ts` | Modify (add `index` namespace + event channels) | 6.1, 6.2 |
| `electron/ipc/index.ts` | Replace stub → handler module | 6.3 |
| `electron/ipc/handlers.ts` | Modify (register indexNs) | 6.3 |
| `electron/services/indexer.ts` | Modify (add `reset()` export) | 7.1 |
| `electron/main/main.ts` (or current bootstrap file) | Modify (wire `project:changed` + `will-quit`) | 7.1, 7.2 |
| `electron/services/grove.ts` | Modify (`closeGrove` calls watcher.stop) | 7.3 |
| `electron/services/grove.test.ts` | Modify | 7.3 |
| `src/components/IndexProgressOverlay.tsx` | Create | 8.1, 8.3 |
| `src/components/IndexProgressOverlay.test.tsx` | Create | 8.1, 8.3 |
| `src/App.tsx` | Modify (mount overlay + subscribe to events) | 8.2 |
| `src/i18n/locales/zh-CN.json` | Modify (add 4 keys) | 8.4 |

## Pre-flight

- The `IpcContract` and `IpcEventContract` types in `shared/ipc-contract.ts` are the source of truth.
- The preload bridge auto-derives `window.api.<ns>.<method>` from `IpcContract`; no preload edits required for new methods.
- The renderer event API `window.api.on(channel, handler)` is already exposed and types are derived from `IpcEventContract` — adding a key there is enough.

---

## Tasks

<!-- openspec-task: 6.1 -->
### Task 1: Extend `IpcContract` with `index` namespace

**Files:**
- Modify: `shared/ipc-contract.ts`
- Modify: `shared/ipc-contract.type-test.ts`

- [ ] **Step 1: Write the failing type test**

In `shared/ipc-contract.type-test.ts`, append:

```ts
import type { IpcContract, IndexStateName } from './ipc-contract'

// Type-level assertions — won't compile if shape is wrong
type IndexStatus = ReturnType<IpcContract['index']['status']>
const _statusShape: IndexStatus = {} as {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}

type StartScanFn = IpcContract['index']['startScan']
const _startScanFn: StartScanFn = (() => {}) as () => void

type CancelScanFn = IpcContract['index']['cancelScan']
const _cancelScanFn: CancelScanFn = (() => {}) as () => void
```

- [ ] **Step 2: Confirm typecheck fails**

```bash
npm run typecheck
```

Expected: TS error — `IpcContract['index']` is unknown; `IndexStateName` not exported.

- [ ] **Step 3: Add `index` namespace to `IpcContract`**

In `shared/ipc-contract.ts`, add and export:

```ts
export type IndexStateName = 'idle' | 'scanning' | 'ready' | 'watching' | 'error'

export interface IndexStatusView {
  state: IndexStateName
  total: number
  scanned: number
  currentPath?: string
  error?: string
}
```

Add an `index` key to `IpcContract`:

```ts
export type IpcContract = {
  // ...existing namespaces...
  index: {
    status: () => IndexStatusView
    startScan: () => void
    cancelScan: () => void
  }
}
```

- [ ] **Step 4: Typecheck passes**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-05): IpcContract gains index namespace (status/startScan/cancelScan)"
```

---

<!-- openspec-task: 6.2 -->
### Task 2: Add 7 event channels to `IpcEventContract`

**Files:**
- Modify: `shared/ipc-contract.ts`
- Modify: `shared/ipc-contract.type-test.ts`

- [ ] **Step 1: Write the failing type test**

Append to `shared/ipc-contract.type-test.ts`:

```ts
import type { IpcEventContract } from './ipc-contract'

const _progress: IpcEventContract['index:progress'] = {} as {
  scanned: number; total: number; currentPath?: string
}
const _done: IpcEventContract['index:done'] = {} as Record<string, never>
const _error: IpcEventContract['index:error'] = {} as { message: string }
const _stateChange: IpcEventContract['index:stateChange'] = {} as {
  state: 'idle' | 'scanning' | 'ready' | 'watching' | 'error'
}
const _fileChanged: IpcEventContract['index:fileChanged'] = {} as {
  path: string; contentHash: string; mtime: number; frontmatter: Record<string, unknown>
}
const _fileDeleted: IpcEventContract['index:fileDeleted'] = {} as { path: string }
const _fileRenamed: IpcEventContract['index:fileRenamed'] = {} as {
  oldPath: string; newPath: string
}
```

- [ ] **Step 2: Confirm typecheck fails**

```bash
npm run typecheck
```

Expected: error — keys don't exist.

- [ ] **Step 3: Extend `IpcEventContract`**

In `shared/ipc-contract.ts`:

```ts
export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': { initialRoute: '/picker' | '/library'; recent: RecentItemView[]; locked?: { path: string; holder: LockInfo } }
  'index:progress': { scanned: number; total: number; currentPath?: string }
  'index:done': Record<string, never>
  'index:error': { message: string }
  'index:stateChange': { state: IndexStateName }
  'index:fileChanged': { path: string; contentHash: string; mtime: number; frontmatter: Record<string, unknown> }
  'index:fileDeleted': { path: string }
  'index:fileRenamed': { oldPath: string; newPath: string }
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-05): add 7 index:* event channels to IpcEventContract"
```

---

<!-- openspec-task: 6.3 -->
### Task 3: Implement `electron/ipc/index.ts` handlers + event forwarding

**Files:**
- Modify: `electron/ipc/index.ts`
- Modify: `electron/ipc/handlers.ts`
- Create: `electron/ipc/index.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// electron/ipc/index.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { indexHandlers, attachIndexEventForwarders } from './index'
import { _resetForTest as resetIndexer, _setStateForTest } from '../services/indexer'

describe('index IPC handlers', () => {
  beforeEach(() => { resetIndexer() })

  it('status() returns the indexer status', () => {
    const s = indexHandlers.status()
    expect(s).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })

  it('startScan() throws E_INVALID_ARGS when already scanning', () => {
    _setStateForTest('scanning')
    expect(() => indexHandlers.startScan()).toThrow(/already scanning/i)
  })

  it('cancelScan() does not throw even when idle', () => {
    expect(() => indexHandlers.cancelScan()).not.toThrow()
  })
})

describe('event forwarders', () => {
  it('forwards onProgress to BrowserWindow.webContents.send', () => {
    const send = vi.fn()
    const fakeWin = { webContents: { send } } as unknown as Electron.BrowserWindow
    const detach = attachIndexEventForwarders(fakeWin)

    // Trigger emit
    const { _emitProgressForTest } = require('../services/indexer')
    _emitProgressForTest({ state: 'scanning', total: 10, scanned: 3 })

    expect(send).toHaveBeenCalledWith('index:progress', { scanned: 3, total: 10 })
    detach()
  })
})
```

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/ipc/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add a test-only emit hook in indexer**

In `electron/services/indexer.ts` add:

```ts
export function _emitProgressForTest(s: IndexStatus): void {
  progressEmitter.emit('progress', s)
}
```

- [ ] **Step 4: Implement `electron/ipc/index.ts`**

Replace stub:

```ts
import type { BrowserWindow } from 'electron'
import { IpcError } from '@shared/ipc-contract'
import {
  status as indexerStatus,
  startScan as indexerStartScan,
  cancelScan as indexerCancelScan,
  onProgress, onDone, onError, onStateChange,
  state as indexerState
} from '../services/indexer'
import { onFileChanged, onFileDeleted, onFileRenamed } from '../services/watcher'
import { logger } from '../services/logger'

export const indexHandlers = {
  status: () => indexerStatus(),
  startScan: () => {
    if (indexerState().state === 'scanning') {
      throw new IpcError('E_INVALID_ARGS', 'index already scanning')
    }
    // Fire-and-forget; lifecycle layer triggers actual scan with grove root
    // We require lifecycle to have called indexer.setDb + know root, so this is mostly defensive
    throw new IpcError('E_INVALID_ARGS', 'startScan must be invoked via project lifecycle, not directly')
  },
  cancelScan: () => {
    indexerCancelScan()
  }
}

export function attachIndexEventForwarders(win: BrowserWindow): () => void {
  const offProgress = onProgress((s) => {
    win.webContents.send('index:progress', {
      scanned: s.scanned,
      total: s.total,
      ...(s.currentPath ? { currentPath: s.currentPath } : {})
    })
  })
  const offDone = onDone(() => win.webContents.send('index:done', {}))
  const offError = onError((message) => win.webContents.send('index:error', { message }))
  const offStateChange = onStateChange((s) => win.webContents.send('index:stateChange', { state: s.state }))
  const offChanged = onFileChanged((p) => win.webContents.send('index:fileChanged', p))
  const offDeleted = onFileDeleted((p) => win.webContents.send('index:fileDeleted', p))
  const offRenamed = onFileRenamed((p) => win.webContents.send('index:fileRenamed', p))

  return () => { offProgress(); offDone(); offError(); offStateChange(); offChanged(); offDeleted(); offRenamed() }
}
```

> Note on `startScan`: per Design D2, the lifecycle layer (Task 4 below) calls `indexer.startScan(root)` directly when `project:changed` fires. The renderer-facing `startScan()` IPC method is rejected because the renderer doesn't know the grove root. If you want a renderer-triggered rescan, add a `rescan()` method that pulls the current root from `grove.getCurrent()` — but that's a phase-15+ requirement, not this phase.

- [ ] **Step 5: Register the namespace in `electron/ipc/handlers.ts`**

In `electron/ipc/handlers.ts` (or wherever the existing `registerHandlers({...})` call lives), add:

```ts
import { indexHandlers } from './index'

registerHandlers({
  // ...existing namespaces (project, log, ping)...
  index: indexHandlers
})
```

- [ ] **Step 6: Run tests + typecheck**

```bash
npm run test -- electron/ipc/index.test.ts && npm run typecheck
```

Expected: green.

- [ ] **Step 7: Commit**

```bash
git add electron/ipc/index.ts electron/ipc/handlers.ts electron/ipc/index.test.ts electron/services/indexer.ts
git commit -m "feat(phase-05): index IPC handlers + event forwarders to BrowserWindow"
```

---

<!-- openspec-task: 7.1 -->
### Task 4: Drive lifecycle from `project:changed`

**Files:**
- Modify: `electron/services/indexer.ts` (add `reset()`)
- Modify: `electron/main/main.ts` (or `electron/main/index.ts` — the existing bootstrap file)

- [ ] **Step 1: Add `reset()` to indexer with a failing test**

Append to `electron/services/indexer.test.ts`:

```ts
import { reset } from './indexer'

describe('indexer.reset()', () => {
  it('returns state to idle and clears counters', () => {
    _setStateForTest('watching')
    reset()
    expect(state()).toEqual({ state: 'idle', total: 0, scanned: 0 })
  })
})
```

```bash
npx vitest run electron/services/indexer.test.ts -t 'indexer.reset'
```

Expected: FAIL.

- [ ] **Step 2: Implement**

Append to `electron/services/indexer.ts`:

```ts
export function reset(): void {
  _abort = true   // in case a scan is mid-flight
  _scanned = 0
  _total = 0
  _currentPath = undefined
  _error = undefined
  _db = null
  setState('idle')
}
```

```bash
npx vitest run electron/services/indexer.test.ts -t 'indexer.reset'
```

Expected: 1 passed.

- [ ] **Step 3: Wire `project:changed` in main bootstrap**

Locate the existing `project:changed` emitter / subscriber in `electron/main/...`. Add:

```ts
import { setDb as setIndexerDb, startScan, reset as resetIndexer } from '../services/indexer'
import { start as watcherStart, stop as watcherStop } from '../services/watcher'
import { getCurrentDb } from '../services/db/...'  // phase-03 helper, exact name varies

// Existing listener for project:changed (or replicate the existing pattern):
groveBroadcast.on('project:changed', async (summary) => {
  if (summary === null) {
    await watcherStop()
    resetIndexer()
    return
  }
  const db = getCurrentDb()
  setIndexerDb(db)
  // startScan is async; let it run; it will transition state and watcher.start is called
  // by indexer when state hits 'ready'. To keep coupling simple, do it explicitly here:
  await startScan(summary.path)
  await watcherStart(summary.path, db)
})
```

> If phase-02's `project:changed` is fired *synchronously* and the listener can be `async`, the above is fine. If listeners are sync only, kick off the scan via `void (async () => { ... })()`.

- [ ] **Step 4: Add an integration test (optional but encouraged)**

If a main-process integration harness exists, add a test that:
1. Emits `project:changed` with a fixture grove summary,
2. Asserts `indexerState()` transitions to `scanning` then `watching`,
3. Emits `project:changed` with `null`,
4. Asserts state goes back to `idle`.

If no such harness exists yet, skip this step and rely on Plan 5 acceptance tests.

- [ ] **Step 5: Commit**

```bash
git add electron/services/indexer.ts electron/services/indexer.test.ts electron/main/main.ts
git commit -m "feat(phase-05): wire project:changed to indexer.startScan + watcher.start"
```

---

<!-- openspec-task: 7.2 -->
### Task 5: `app.on('will-quit')` stops watcher cleanly

**Files:**
- Modify: `electron/main/main.ts` (or current bootstrap)

- [ ] **Step 1: Add the will-quit handler**

In the bootstrap, near the existing `app.on('window-all-closed')` etc.:

```ts
import { app } from 'electron'
import { stop as watcherStop } from '../services/watcher'

app.on('will-quit', async (event) => {
  event.preventDefault()
  try { await watcherStop() } finally { app.exit(0) }
})
```

- [ ] **Step 2: Verify by manual run**

This handler is hard to assert in vitest (`app` is the Electron singleton). Document the manual verification:

```
1. npm run dev
2. Open a grove
3. Quit via Cmd+Q
4. Tail electron-log; ensure "watcher.stop completed" or no chokidar EBUSY appears
```

Add a brief comment in `main.ts` referencing this.

- [ ] **Step 3: Commit**

```bash
git add electron/main/main.ts
git commit -m "feat(phase-05): app.will-quit awaits watcher.stop before exit"
```

---

<!-- openspec-task: 7.3 -->
### Task 6: `closeGrove()` stops watcher before closing db

**Files:**
- Modify: `electron/services/grove.ts`
- Modify: `electron/services/grove.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `electron/services/grove.test.ts`:

```ts
import { closeGrove } from './grove'
import * as watcher from './watcher'

describe('closeGrove ordering', () => {
  it('stops watcher before closing db', async () => {
    const order: string[] = []
    const stopSpy = vi.spyOn(watcher, 'stop').mockImplementation(async () => { order.push('watcher.stop') })
    const dbCloseSpy = vi.spyOn(/* whichever db.close helper exists */, 'closeCurrent').mockImplementation(() => { order.push('db.close') })

    await closeGrove()

    expect(order).toEqual(['watcher.stop', 'db.close'])
    stopSpy.mockRestore(); dbCloseSpy.mockRestore()
  })
})
```

> Adapt `db.closeCurrent` to whatever phase-03 actually exports. The intent is "watcher first, db second".

- [ ] **Step 2: Confirm fails**

```bash
npx vitest run electron/services/grove.test.ts -t 'closeGrove ordering'
```

Expected: FAIL — current `closeGrove` only closes db.

- [ ] **Step 3: Implement**

In `electron/services/grove.ts`, modify `closeGrove`:

```ts
import { stop as watcherStop } from './watcher'
import { reset as resetIndexer } from './indexer'

export async function closeGrove(): Promise<void> {
  await watcherStop()
  resetIndexer()
  // existing close logic — db.closeCurrent() etc.
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run electron/services/grove.test.ts
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add electron/services/grove.ts electron/services/grove.test.ts
git commit -m "feat(phase-05): closeGrove stops watcher + resets indexer before db close"
```

---

<!-- openspec-task: 8.1 -->
### Task 7: `IndexProgressOverlay.tsx` — Radix Dialog with progress bar + cancel button

**Files:**
- Create: `src/components/IndexProgressOverlay.tsx`
- Create: `src/components/IndexProgressOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/IndexProgressOverlay.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IndexProgressOverlay } from './IndexProgressOverlay'

describe('IndexProgressOverlay', () => {
  it('shows progress text "scanned/total" when visible', () => {
    render(<IndexProgressOverlay visible scanned={34} total={100} currentPath="notes/a.md" onCancel={() => {}} />)
    expect(screen.getByText(/34/)).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getByText(/notes\/a\.md/)).toBeInTheDocument()
  })

  it('does not render anything when visible=false', () => {
    const { container } = render(<IndexProgressOverlay visible={false} scanned={0} total={0} onCancel={() => {}} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('invokes onCancel when the "background" button is clicked', () => {
    const onCancel = vi.fn()
    render(<IndexProgressOverlay visible scanned={0} total={1} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /background|后台继续/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

> Need `@testing-library/react`. If not installed, add: `npm install -D @testing-library/react @testing-library/jest-dom jsdom` and configure vitest's `environment: 'jsdom'`. Add this as Step 0 if absent.

- [ ] **Step 2: Confirm fails (or install testing-library first)**

```bash
npx vitest run src/components/IndexProgressOverlay.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/IndexProgressOverlay.tsx
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'

export interface IndexProgressOverlayProps {
  visible: boolean
  scanned: number
  total: number
  currentPath?: string
  onCancel: () => void
}

export function IndexProgressOverlay(props: IndexProgressOverlayProps): JSX.Element | null {
  const { t } = useTranslation()
  if (!props.visible) return null

  const pct = props.total > 0 ? Math.min(100, Math.round((props.scanned / props.total) * 100)) : 0
  const truncatedPath = props.currentPath
    ? props.currentPath.length > 60
      ? `…${props.currentPath.slice(-58)}`
      : props.currentPath
    : ''

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl p-8 max-w-md w-full">
            <Dialog.Title className="text-lg font-semibold mb-2">
              {t('index.progress.title', '索引中…')}
            </Dialog.Title>
            <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {props.scanned} / {props.total}
            </div>
            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {truncatedPath && (
              <div className="text-xs text-zinc-500 truncate mb-4 font-mono" title={props.currentPath}>
                {truncatedPath}
              </div>
            )}
            <button
              type="button"
              onClick={props.onCancel}
              className="px-4 py-2 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200"
            >
              {t('index.progress.background', '后台继续')}
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
npx vitest run src/components/IndexProgressOverlay.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/IndexProgressOverlay.tsx src/components/IndexProgressOverlay.test.tsx
git commit -m "feat(phase-05): IndexProgressOverlay component with progress bar + cancel"
```

---

<!-- openspec-task: 8.2 -->
### Task 8: Mount overlay in `App.tsx` + subscribe to events

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read current `App.tsx` to find a safe mount point**

```bash
sed -n '1,80p' src/App.tsx
```

(Look for the top-level `<>` fragment or root layout div; the overlay sits next to the router output.)

- [ ] **Step 2: Add subscription + state**

In `src/App.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { IndexProgressOverlay } from './components/IndexProgressOverlay'

// Inside the App component:
const [indexState, setIndexState] = useState<'idle' | 'scanning' | 'ready' | 'watching' | 'error'>('idle')
const [progress, setProgress] = useState<{ scanned: number; total: number; currentPath?: string }>({ scanned: 0, total: 0 })

useEffect(() => {
  const offState = window.api.on('index:stateChange', (p) => setIndexState(p.state))
  const offProg = window.api.on('index:progress', (p) => setProgress(p))
  return () => { offState(); offProg() }
}, [])

// In JSX, add:
<IndexProgressOverlay
  visible={indexState === 'scanning'}
  scanned={progress.scanned}
  total={progress.total}
  currentPath={progress.currentPath}
  onCancel={() => window.api.index.cancelScan()}
/>
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

1. Open a grove with at least 50 md files (create a fixture if needed).
2. Watch the overlay appear with progress.
3. Click "后台继续" → overlay disappears; index stops.

Document that this is a manual verification step.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(phase-05): mount IndexProgressOverlay in App + subscribe to index events"
```

---

<!-- openspec-task: 8.3 -->
### Task 9: Display `scanned/total` + truncated `currentPath` (already covered in Task 7)

This is satisfied by Task 7's component. Add a sanity test that an extreme path truncates correctly:

**Files:**
- Modify: `src/components/IndexProgressOverlay.test.tsx`

- [ ] **Step 1: Add test**

```tsx
it('truncates long currentPath with leading ellipsis', () => {
  const longPath = 'a/'.repeat(40) + 'final.md'
  render(<IndexProgressOverlay visible scanned={1} total={1} currentPath={longPath} onCancel={() => {}} />)
  expect(screen.getByText(/^…/)).toBeInTheDocument()
  expect(screen.getByText(/final\.md/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/components/IndexProgressOverlay.test.tsx
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add src/components/IndexProgressOverlay.test.tsx
git commit -m "test(phase-05): verify long currentPath truncates with leading ellipsis"
```

---

<!-- openspec-task: 8.4 -->
### Task 10: i18n keys in `zh-CN.json`

**Files:**
- Modify: `src/i18n/locales/zh-CN.json`

- [ ] **Step 1: Read current zh-CN.json**

```bash
sed -n '1,40p' src/i18n/locales/zh-CN.json
```

- [ ] **Step 2: Add `index` namespace**

Add (preserve existing keys):

```json
{
  "index": {
    "progress": {
      "title": "索引中…",
      "background": "后台继续",
      "scanned": "已扫描 {{scanned}} / {{total}} 个文件"
    },
    "error": {
      "title": "索引出错",
      "retry": "重试"
    }
  }
}
```

- [ ] **Step 3: Verify component picks up zh-CN at runtime**

```bash
npm run dev
```

Look for the modal. Should show 索引中… / 后台继续.

- [ ] **Step 4: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/locales/zh-CN.json
git commit -m "feat(phase-05): zh-CN i18n keys for index progress overlay"
```

---

## Self-Review Checklist (run after Task 10)

- [ ] Annotation labels present:
  ```bash
  grep -oE 'openspec-task: [0-9.]+' docs/superpowers/plans/2026-04-26-phase-05-indexer-watcher-tasks-6.1-8.4.md | sort -u
  ```
  Expected: `6.1 6.2 6.3 7.1 7.2 7.3 8.1 8.2 8.3 8.4`.
- [ ] Spec coverage:
  - file-watcher §"chokidar 增量监听" → IPC events forward properly (Task 3)
  - index-startup-progress §"启动扫描进度事件" → Tasks 3, 8 (events + UI)
  - index-startup-progress §"扫描可取消" → Task 7 cancel button
  - index-startup-progress §"启动门禁" → Task 1 (status() exposed via IPC)
- [ ] Type names match Plan 1: `IndexStateName`, `IndexStatusView`, `state()`/`status()` aliases.
- [ ] Function names match Plans 2 & 3: `setDb`, `reset`, `startScan`, `cancelScan`, `start`, `stop`, `onProgress`, `onDone`, `onError`, `onStateChange`, `onFileChanged`, `onFileDeleted`, `onFileRenamed`.
- [ ] No `TODO`, `TBD`, "appropriate handling" placeholders.
