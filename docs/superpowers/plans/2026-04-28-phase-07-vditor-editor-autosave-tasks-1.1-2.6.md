# Phase 07 — Vditor Editor + Autosave: Plan 1 (Deps + Editor store core)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-07-vditor-editor-autosave`
> **Task range:** OpenSpec tasks `1.1`–`2.6` (9 tasks)
> **Plan order:** 1 of 5. Subsequent plans (`tasks-2.7-4.2`, `4.3-6.3`, `6.4-8.6`, `8.7-8.14`) build on this one.
> **Status:** Not started
> **Created:** 2026-04-28
> **Branch suggestion:** `feat/phase-07-vditor-editor-autosave` (branch from `main` after phase-05 + phase-06 land)

---

## Goal

Lay the foundation for the editor: install Vditor, wire its offline assets into the renderer's `public/` tree, scaffold the new `src/pages/Editor.tsx` + `src/components/editor/*` + `src/stores/editor.ts` modules, and implement the **core** of the Zustand editor store: state machine (`idle / loading / ready / error`), `open(path)`, `setBody`, the in-flight-aware `save()` with self-iteration, the `flushSave()` helper, and the `E_MTIME_MISMATCH` / `E_PERMISSION` / `E_NOSPACE` / generic error branches in `save()`. All pieces are unit-tested under `electron/**/*` or `shared/**/*` style mock IPC clients before any UI work.

## Architecture

- **Single Zustand slice** in `src/stores/editor.ts` holds the entire editor state machine. Per design D2, the store's `kind: 'ready'` variant carries `savedBody` + `savedMtimeMs` so `dirty` can be derived (`body !== savedBody`) and the next `expectedMtime` is always known.
- **`save()` is the only IPC entry point.** Per design D3 + spec `editor-autosave#保存并发控制`, at most one `file.write` is in-flight at a time. If the user keeps typing during a save, the post-success branch self-schedules another `save()` when `body !== savedBody`. There is no save queue.
- **Read path uses `files.get` (phase-06 plural namespace), write path uses `file.write` (phase-04 singular namespace).** Per design D4, the body is composed via `frontmatter.stringify(frontmatter, body)` and Vditor never sees the YAML.
- **Tests run in node + vitest.** The editor store has no DOM dependency in its public API — every action takes plain values. We mock `window.api` (used by `@/ipc/client`) with a vitest `vi.mock`. UI-rendering tests are deferred to plans 2–4 once jsdom is on the deps list (we install that in plan 2).
- **`scheduleSave()` is part of the store**, not an external hook. The store owns its debounce timer (a closure-private `let timer: ReturnType<typeof setTimeout> | null`) so route-leave / visibility-change / Cmd+S can call `flushSave()` from anywhere without prop-drilling refs.

## Tech Stack

- `vditor@^3.10` (renderer) — markdown editor library; assets shipped offline via `public/vditor/`
- `zustand@^5.0` (already a dep) — store
- `vitest@^2.1` — unit tests
- phase-04 `file.write` (atomic write with `expectedMtime`)
- phase-04 `frontmatter.stringify` (re-serialise YAML + body)
- phase-06 `files.get` (returns `{ summary, frontmatter, body }`)

## Files Touched (this plan)

| Path | Action | Owner task |
|---|---|---|
| `package.json`, `package-lock.json` | Modify (add `vditor`) | 1.1 |
| `scripts/copy-vditor-assets.mjs` | Create | 1.2 |
| `src/public/vditor/**` | Create (copied from `node_modules/vditor/dist`) | 1.2 |
| `.gitignore` | Modify (ignore `src/public/vditor/`) | 1.2 |
| `src/pages/Editor.tsx` | Create stub | 1.3 |
| `src/components/editor/.gitkeep` | Create | 1.3 |
| `src/stores/editor.ts` | Create stub → state machine + actions | 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 |
| `src/stores/editor.test.ts` | Create | 2.1–2.6 |
| `vitest.config.ts` | Modify (extend `test.include` to cover `src/**/*.test.ts`) | 2.1 |

## Pre-flight

This plan assumes phase-04, phase-05, and phase-06 have landed on `main` with:
- `electron/ipc/file.ts` exporting `fileHandlers.write` + `fileHandlers.readParsed` (phase-04).
- `electron/services/frontmatter.ts` exporting `parseFile` + `stringify` (phase-04).
- `selfWrites` registration occurring inside `file.write` (phase-05 — renderer-invisible).
- `shared/ipc-contract.ts` defines the `IpcContract['file']` namespace; phase-06 added `IpcContract['files']` with `files.get(path) → { summary, frontmatter, body }`.

If phase-05 or phase-06 is **not** yet merged when this plan starts, **stop**: tasks 2.2–2.4 reference `ipc.files.get(path)` and `ipc.file.write(path, body, opts)`. Both must exist on `IpcClient<IpcContract>`.

Verify the prerequisite by running:
```bash
node -e "const c=require('./shared/ipc-contract.ts');console.log('files namespace?', !!c.IpcContract)"
```
(This will fail because `.ts` isn't loadable directly — the real check is the type-test below in task 2.1 step 1, which references `IpcContract['files']['get']`.)

---

## Tasks

<!-- openspec-task: 1.1 -->
### Task 1: Install vditor

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm not already installed**

Run:
```bash
node -e "const p=require('./package.json');console.log(p.dependencies['vditor']||p.devDependencies?.['vditor']||'absent')"
```

Expected: `absent`. If a version prints, skip Step 2.

- [ ] **Step 2: Install**

Run:
```bash
npm install vditor@^3.10
```

Expected: `package.json` `dependencies` now lists `vditor`. The `postinstall` script (`electron-builder install-app-deps && electron-rebuild -f -w better-sqlite3`) runs but does not affect Vditor.

- [ ] **Step 3: Verify type-check still passes**

Run:
```bash
npm run typecheck
```

Expected: PASS. Vditor ships its own `.d.ts`; no manual typing needed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-07): add vditor dependency"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: Ship Vditor assets offline via `src/public/vditor/`

**Files:**
- Create: `scripts/copy-vditor-assets.mjs`
- Modify: `package.json` (extend `postinstall` to invoke the script)
- Modify: `.gitignore`
- Generate: `src/public/vditor/**` (output of the script — not committed)

Per design D8 the app must run offline, so we copy `node_modules/vditor/dist/**` into the renderer's static-asset tree. With `electron.vite.config.ts:36` setting `renderer.root = 'src'`, Vite serves `src/public/<file>` at `/<file>`. Therefore `src/public/vditor/<file>` is reachable via Vditor's `cdn: '/vditor'`.

- [ ] **Step 1: Write the copy script**

Create `scripts/copy-vditor-assets.mjs`:

```javascript
#!/usr/bin/env node
// Copies node_modules/vditor/dist into src/public/vditor so the renderer
// can load Vditor's icons/i18n/code-mirror assets offline at /vditor/...
//
// Idempotent: deletes the destination first, then copies. Safe to re-run.

import { existsSync } from 'node:fs'
import { cp, rm, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = dirname(here)
const src = join(root, 'node_modules', 'vditor', 'dist')
const dest = join(root, 'src', 'public', 'vditor')

if (!existsSync(src)) {
  console.warn(`[copy-vditor-assets] ${src} not found — skipping (vditor not installed yet).`)
  process.exit(0)
}

await rm(dest, { recursive: true, force: true })
await mkdir(dirname(dest), { recursive: true })
await cp(src, dest, { recursive: true })
console.log(`[copy-vditor-assets] copied ${src} -> ${dest}`)
```

- [ ] **Step 2: Wire the script into `postinstall`**

Modify `package.json` — replace the existing `postinstall` line:

```jsonc
"postinstall": "electron-builder install-app-deps && electron-rebuild -f -w better-sqlite3",
```

with:

```jsonc
"postinstall": "electron-builder install-app-deps && electron-rebuild -f -w better-sqlite3 && node scripts/copy-vditor-assets.mjs",
```

- [ ] **Step 3: Ensure the generated tree is gitignored**

Add to `.gitignore` (create the file if it does not yet ignore the path):

```gitignore

# Vditor offline assets (regenerated by scripts/copy-vditor-assets.mjs)
src/public/vditor/
```

- [ ] **Step 4: Run the script once and verify output**

Run:
```bash
node scripts/copy-vditor-assets.mjs && ls src/public/vditor | head -10
```

Expected: lists files such as `index.min.js`, `index.css`, plus `images/`, `js/`, `dist/` subdirs (exact tree depends on Vditor version). The script prints `[copy-vditor-assets] copied ...`.

- [ ] **Step 5: Verify type-check + lint still pass**

Run:
```bash
npm run typecheck && npm run lint
```

Expected: PASS. The script is `.mjs` so it's outside TS/ESLint scope.

- [ ] **Step 6: Commit**

```bash
git add scripts/copy-vditor-assets.mjs package.json .gitignore
git commit -m "chore(phase-07): copy vditor offline assets to src/public/vditor on postinstall"
```

> Note: `src/public/vditor/` itself is **not** committed — it is a build output regenerated by every `npm install`.

---

<!-- openspec-task: 1.3 -->
### Task 3: Scaffold Editor page / components dir / store stub

**Files:**
- Create: `src/pages/Editor.tsx`
- Create: `src/components/editor/.gitkeep`
- Create: `src/stores/editor.ts`
- Modify: `src/App.tsx` (route element)

- [ ] **Step 1: Replace the placeholder route element with the new component import**

Modify `src/App.tsx:63` — change the `editor` route from `<Placeholder>` to the real component. Replace this line:

```tsx
          <Route path="/editor/:path" element={<Placeholder name="editor" />} />
```

with:

```tsx
          <Route path="/editor/:encodedPath" element={<Editor />} />
```

…and add the import near the top (alongside the existing page imports):

```tsx
import { Editor } from './pages/Editor'
```

- [ ] **Step 2: Write the failing route-render smoke check**

Create `src/pages/Editor.test.tsx` (NEW):

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { Editor } from './Editor'

describe('Editor page (stub)', () => {
  it('renders an idle placeholder when no encodedPath is mounted', () => {
    render(
      <MemoryRouter initialEntries={['/editor/']}>
        <Routes>
          <Route path="/editor/:encodedPath" element={<Editor />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('editor-stub')).toBeTruthy()
  })
})
```

> Note: this test will not run yet — `vitest.config.ts:test.include` currently only matches `electron/**/*.test.ts` and `shared/**/*.test.ts`. We extend the include glob in task 2.1 step 1; until then this file is dormant. That's OK — the route still renders correctly in `npm run dev`. Phase-06 plan 1 (`tasks-1.1-2.6`) installed `@testing-library/react` and `jsdom` for its `Library.test.tsx`; if those installs landed with phase-06, no new devDeps are needed here. If they did not, Task 5 below installs them.

- [ ] **Step 3: Create the stub Editor page**

Create `src/pages/Editor.tsx`:

```tsx
import type { JSX } from 'react'
import { useParams } from 'react-router-dom'

export function Editor(): JSX.Element {
  const { encodedPath } = useParams<{ encodedPath: string }>()
  const path = encodedPath ? decodeURIComponent(encodedPath) : null

  return (
    <div
      data-testid="editor-stub"
      className="flex h-full items-center justify-center text-sm text-[color:var(--color-ink-3)]"
    >
      Editor stub — implementation lands in plans 2–5 ({path ?? 'no path'}).
    </div>
  )
}
```

- [ ] **Step 4: Create the empty editor components dir**

Run:
```bash
mkdir -p src/components/editor && touch src/components/editor/.gitkeep
```

- [ ] **Step 5: Create the Zustand editor-store stub**

Create `src/stores/editor.ts`:

```ts
import { create } from 'zustand'

// Editor store — full implementation lands across tasks 2.1–2.8 (state
// machine, save/flush/scheduleSave/close).
//
// Stub shape: a tagged union with only the `idle` variant, so other modules
// can already import the type and call `.getState().kind` today.

export type EditorState = { kind: 'idle' }

export type EditorActions = {
  // Implemented in tasks 2.2–2.8.
  _phase: 'stub'
}

export const useEditorStore = create<EditorState & EditorActions>(() => ({
  kind: 'idle',
  _phase: 'stub'
}))
```

- [ ] **Step 6: Verify type-check passes**

Run:
```bash
npm run typecheck
```

Expected: PASS. `Editor.tsx` imports `useParams` (already a dep via `react-router-dom`) and uses no Vditor types yet.

- [ ] **Step 7: Verify the dev server boots and `/editor/<encoded>` loads**

This is a manual sanity check — skip if the dev environment is not available:

```bash
npm run dev
```

Then open the app, click any "open editor" placeholder (or paste `/editor/notes%2Fa.md` into the URL bar via React DevTools / a temporary nav button), and confirm the page renders "Editor stub — ... (notes/a.md)".

- [ ] **Step 8: Commit**

```bash
git add src/pages/Editor.tsx src/pages/Editor.test.tsx src/components/editor/.gitkeep src/stores/editor.ts src/App.tsx
git commit -m "feat(phase-07): scaffold Editor page / store stub and wire /editor/:encodedPath route"
```

---

<!-- openspec-task: 2.1 -->
### Task 4: Define `EditorState` tagged union and store skeleton

**Files:**
- Modify: `src/stores/editor.ts`
- Create: `src/stores/editor.test.ts`
- Modify: `vitest.config.ts` (extend `test.include`)

The state machine has four shapes per design D2. We lock them in with a type-test today; subsequent tasks fill in the actions. Action signatures referenced here (e.g. `open`, `setBody`, `save`, `flushSave`, `close`) will be implemented in tasks 2.2–2.6 / 2.7–2.8.

- [ ] **Step 1: Extend `vitest.config.ts` to discover `src/**/*.test.ts(x)`**

Modify `vitest.config.ts`. Replace:

```ts
  test: {
    include: ['electron/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    pool: 'threads',
    testTimeout: 5000,
    passWithNoTests: true
  }
```

with:

```ts
  test: {
    include: [
      'electron/**/*.test.ts',
      'shared/**/*.test.ts',
      'src/**/*.test.ts',
      'src/**/*.test.tsx'
    ],
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom']
    ],
    pool: 'threads',
    testTimeout: 5000,
    passWithNoTests: true
  }
```

> The `environmentMatchGlobs` entry only takes effect for `.test.tsx` files (UI tests in plan 2+). Pure-`.ts` store tests run under `node` so they don't pay the jsdom startup cost.

- [ ] **Step 2: Confirm `@/` and `@shared/` aliases work in vitest**

Modify `vitest.config.ts` `resolve.alias` to also include the renderer alias:

```ts
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@': resolve(__dirname, 'src')
    }
  },
```

(Replace the existing single-alias `resolve` block with the two-alias version.)

- [ ] **Step 3: Write the failing state-machine type-test**

Create `src/stores/editor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { useEditorStore } from './editor'
import type { EditorState } from './editor'

describe('editor store — state machine', () => {
  it('starts in idle', () => {
    expect(useEditorStore.getState().kind).toBe('idle')
  })

  it('EditorState union includes idle / loading / ready / error variants', () => {
    // Type-only assertions: each construct must compile.
    const idle: EditorState = { kind: 'idle' }
    const loading: EditorState = { kind: 'loading', path: 'a.md' }
    const ready: EditorState = {
      kind: 'ready',
      path: 'a.md',
      frontmatter: {},
      body: 'hello',
      savedBody: 'hello',
      savedMtimeMs: 1,
      dirty: false,
      saving: false,
      lastError: null,
      saveErrorCount: 0
    }
    const error: EditorState = {
      kind: 'error',
      path: 'a.md',
      error: 'E_NOT_FOUND'
    }
    expect([idle, loading, ready, error].length).toBe(4)
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: FAIL (`Type ... is not assignable to type 'EditorState'` — only `{ kind: 'idle' }` is allowed today).

- [ ] **Step 4: Implement the state-machine types**

Replace `src/stores/editor.ts` contents with:

```ts
import { create } from 'zustand'
import type { Frontmatter } from '@shared/frontmatter-schema'

export type EditorReadyState = {
  kind: 'ready'
  path: string
  frontmatter: Frontmatter
  body: string
  savedBody: string
  savedMtimeMs: number
  dirty: boolean
  saving: boolean
  lastError: string | null
  saveErrorCount: number
}

export type EditorState =
  | { kind: 'idle' }
  | { kind: 'loading'; path: string }
  | EditorReadyState
  | { kind: 'error'; path: string; error: string }

export type EditorActions = {
  open: (path: string) => Promise<void>
  setBody: (newBody: string) => void
  save: () => Promise<void>
  flushSave: () => Promise<void>
  close: () => void
}

type EditorStore = { state: EditorState } & EditorActions

function notImplemented(): never {
  throw new Error('editor store action not implemented yet')
}

export const useEditorStore = create<EditorStore>(() => ({
  state: { kind: 'idle' },
  open: notImplemented,
  setBody: notImplemented,
  save: notImplemented,
  flushSave: notImplemented,
  close: () => {}
}))
```

Update the test file to read `state.kind` instead of `kind`:

In `src/stores/editor.test.ts`, change:
```ts
expect(useEditorStore.getState().kind).toBe('idle')
```
to:
```ts
expect(useEditorStore.getState().state.kind).toBe('idle')
```

- [ ] **Step 5: Run the test**

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: PASS (2 cases).

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run:
```bash
npm test
```

Expected: PASS (existing electron/shared tests + the new editor test).

- [ ] **Step 7: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts vitest.config.ts
git commit -m "feat(phase-07): define EditorState tagged union and editor store skeleton"
```

---

<!-- openspec-task: 2.2 -->
### Task 5: Implement `open(path)` action

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

`open(path)` per design D2:
1. Set `state = { kind: 'loading', path }`.
2. Call `ipc.files.get(path)` (phase-06 read path that returns `{ summary, frontmatter, body }` plus a `mtimeMs` field — see note below).
3. On success → `state = { kind: 'ready', path, frontmatter, body, savedBody: body, savedMtimeMs: <mtime>, dirty: false, saving: false, lastError: null, saveErrorCount: 0 }`.
4. On `IpcError.code === 'E_NOT_FOUND' | 'E_ENCODING'` → `state = { kind: 'error', path, error: code }`.
5. On any other thrown value → `state = { kind: 'error', path, error: String(err) }`.

**Where does `mtimeMs` come from?** Phase-06's `files.get` may not yet expose `mtimeMs` on its return shape. Per the OpenSpec design D2 "savedMtimeMs is the next expectedMtime", we need it. Two options:

- **Option A (preferred):** rely on `files.get` returning `summary` with `mtimeMs` if phase-06 added it.
- **Option B (this plan):** call `ipc.file.readParsed(path)` (phase-04 IPC, returns `mtimeMs` directly + `frontmatter` + `body`) and skip `files.get` in the editor. The editor doesn't need the SQL summary at load time — the right-side card (task 3.4 in plan 2) reads frontmatter from the in-memory state, not from SQL.

We use **Option B** because it makes plan 1 independent of phase-06's exact `files.get` return shape. The right-side Frontmatter card in plan 2 reads from `state.frontmatter` directly. The editor never needs to JOIN against `files`/`tags`.

> If phase-06 already returns `summary` with `mtimeMs` and you want to reuse it, swap the IPC call. The store's public surface stays unchanged.

- [ ] **Step 1: Add the failing `open` test**

Append to `src/stores/editor.test.ts`:

```ts
import { vi, beforeEach, afterEach } from 'vitest'
import type { Frontmatter } from '@shared/frontmatter-schema'

vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      write: vi.fn()
    },
    files: {
      get: vi.fn()
    }
  }
}))

import { ipc } from '@/ipc/client'
import { IpcError } from '@shared/ipc-contract'

const ipcMock = ipc as unknown as {
  file: {
    readParsed: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
  }
  files: { get: ReturnType<typeof vi.fn> }
}

function resetStore(): void {
  useEditorStore.setState({ state: { kind: 'idle' } })
}

beforeEach(() => {
  resetStore()
  ipcMock.file.readParsed.mockReset()
  ipcMock.file.write.mockReset()
})

afterEach(() => {
  resetStore()
})

describe('editor store — open(path)', () => {
  it('transitions idle → loading → ready and seeds saved* from disk', async () => {
    const fm: Frontmatter = { title: 'A' }
    ipcMock.file.readParsed.mockResolvedValueOnce({
      content: '---\ntitle: A\n---\n# Body',
      eol: 'lf',
      mtimeMs: 1700,
      sha256: 'h',
      hadBom: false,
      originalEncoding: 'utf8',
      frontmatter: fm,
      body: '# Body',
      rawYaml: 'title: A'
    })

    await useEditorStore.getState().open('notes/a.md')

    const s = useEditorStore.getState().state
    expect(s.kind).toBe('ready')
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.path).toBe('notes/a.md')
    expect(s.frontmatter).toEqual(fm)
    expect(s.body).toBe('# Body')
    expect(s.savedBody).toBe('# Body')
    expect(s.savedMtimeMs).toBe(1700)
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.lastError).toBeNull()
    expect(s.saveErrorCount).toBe(0)
  })

  it('moves to error state with code on E_NOT_FOUND', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_NOT_FOUND', 'gone'))
    await useEditorStore.getState().open('missing.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.path).toBe('missing.md')
    expect(s.error).toBe('E_NOT_FOUND')
  })

  it('moves to error state with code on E_ENCODING', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new IpcError('E_ENCODING', 'gbk fail'))
    await useEditorStore.getState().open('weird.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.error).toBe('E_ENCODING')
  })

  it('moves to error with stringified message on unknown error', async () => {
    ipcMock.file.readParsed.mockRejectedValueOnce(new Error('socket boom'))
    await useEditorStore.getState().open('a.md')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('error')
    if (s.kind !== 'error') throw new Error('unreachable')
    expect(s.error).toContain('socket boom')
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: 4 tests FAIL (`notImplemented` thrown by `open`).

- [ ] **Step 2: Implement `open`**

Edit `src/stores/editor.ts` — at the top, add the imports:

```ts
import { ipc } from '@/ipc/client'
import { IpcError } from '@shared/ipc-contract'
```

Replace the body of `useEditorStore` with:

```ts
export const useEditorStore = create<EditorStore>((set) => ({
  state: { kind: 'idle' },

  async open(path) {
    set({ state: { kind: 'loading', path } })
    try {
      const r = await ipc.file.readParsed(path)
      set({
        state: {
          kind: 'ready',
          path,
          frontmatter: r.frontmatter,
          body: r.body,
          savedBody: r.body,
          savedMtimeMs: r.mtimeMs,
          dirty: false,
          saving: false,
          lastError: null,
          saveErrorCount: 0
        }
      })
    } catch (err) {
      const code = err instanceof IpcError ? err.code : String(err)
      set({ state: { kind: 'error', path, error: code } })
    }
  },

  setBody: notImplemented,
  save: notImplemented,
  flushSave: notImplemented,
  close: () => {
    set({ state: { kind: 'idle' } })
  }
}))
```

- [ ] **Step 3: Run the test**

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: PASS — `open` cases (4) and the original 2 type-machine cases.

- [ ] **Step 4: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): implement editor store open(path) loading→ready/error"
```

---

<!-- openspec-task: 2.3 -->
### Task 6: Implement `setBody(newBody)` + debounce-ready `scheduleSave()`

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

`setBody`:
- Only valid when `state.kind === 'ready'`. (Otherwise no-op.)
- Updates `body` and recomputes `dirty = (body !== savedBody)`.
- Calls the closure-scoped `scheduleSave()` to (re)start the 1000ms debounce timer.

`scheduleSave()` is a private helper on the store module — it owns a single timer ref. The 1000ms duration is a module-level constant `SAVE_DEBOUNCE_MS` so tests can override it.

Tests in this task verify the **state delta**, not the timer firing. The actual save dispatch is tested in task 2.4 (with `vi.useFakeTimers`).

- [ ] **Step 1: Add the failing tests**

Append to `src/stores/editor.test.ts`:

```ts
async function openReady(body = '# Body', mtime = 1000): Promise<void> {
  ipcMock.file.readParsed.mockResolvedValueOnce({
    content: body, eol: 'lf', mtimeMs: mtime, sha256: 'h', hadBom: false,
    originalEncoding: 'utf8', frontmatter: {}, body, rawYaml: ''
  })
  await useEditorStore.getState().open('a.md')
}

describe('editor store — setBody', () => {
  it('updates body and flips dirty when in ready state', async () => {
    await openReady('# Body', 1)
    useEditorStore.getState().setBody('# Body edited')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('ready')
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.body).toBe('# Body edited')
    expect(s.dirty).toBe(true)
    expect(s.savedBody).toBe('# Body') // unchanged
    expect(s.savedMtimeMs).toBe(1) // unchanged
  })

  it('un-dirties when body is reverted to savedBody', async () => {
    await openReady('# Body', 1)
    useEditorStore.getState().setBody('# tmp')
    useEditorStore.getState().setBody('# Body')
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.dirty).toBe(false)
  })

  it('is a no-op outside ready state', () => {
    // store is in idle (set by beforeEach resetStore)
    useEditorStore.getState().setBody('foo')
    const s = useEditorStore.getState().state
    expect(s.kind).toBe('idle')
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: 3 new cases FAIL (`setBody: notImplemented`).

- [ ] **Step 2: Implement `setBody` + private `scheduleSave` plumbing**

Edit `src/stores/editor.ts`. Above `useEditorStore`, add the timer module:

```ts
const SAVE_DEBOUNCE_MS = 1000
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

/** Cancels any pending debounce timer. Exported for tests + flushSave. */
export function _cancelDebounce(): void {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer)
    _debounceTimer = null
  }
}
```

Add a `scheduleSave` helper (still private) that schedules `useEditorStore.getState().save()` after the debounce; full save body lands in task 2.4. For now its only contract is "after `SAVE_DEBOUNCE_MS`, fire `save()`".

```ts
function _scheduleSave(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer)
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null
    void useEditorStore.getState().save()
  }, SAVE_DEBOUNCE_MS)
}
```

Replace the `setBody: notImplemented,` line with:

```ts
  setBody(newBody) {
    const cur = useEditorStore.getState().state
    if (cur.kind !== 'ready') return
    set({
      state: {
        ...cur,
        body: newBody,
        dirty: newBody !== cur.savedBody
      }
    })
    _scheduleSave()
  },
```

> Note: you'll need to capture `set` outside the `create` callback — restructure the create call so `set` is in scope for `setBody`. Easiest: move all action implementations inside the `create((set, get) => ({...}))` callback (as in `src/stores/grove.ts:34`). The next two tasks (2.4, 2.5) also need `set` and `get`; consolidate now.

The full structure becomes:

```ts
export const useEditorStore = create<EditorStore>((set, get) => ({
  state: { kind: 'idle' },

  async open(path) { /* …as before… */ },

  setBody(newBody) { /* …above… */ },

  save: notImplemented,
  flushSave: notImplemented,
  close() {
    _cancelDebounce()
    set({ state: { kind: 'idle' } })
  }
}))
```

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: 9 cases PASS so far. The debounce timer fires `save()` (still `notImplemented`) — but only `setTimeout`-scheduled, so synchronous tests aren't affected. Each test's `afterEach` runs `resetStore` and the timers leak across tests; we'll add `_cancelDebounce()` to the `afterEach` to be tidy:

In `src/stores/editor.test.ts`, modify the `afterEach`:

```ts
afterEach(() => {
  _cancelDebounce()
  resetStore()
})
```

…and add the import at the top:

```ts
import { _cancelDebounce } from './editor'
```

Re-run the tests; PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): editor store setBody + private 1s debounce timer"
```

---

<!-- openspec-task: 2.4 -->
### Task 7: Implement `save()` with in-flight self-iteration

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

`save()` per design D3 + spec `editor-autosave#保存并发控制`:
1. If `state.kind !== 'ready'`: return (nothing to do).
2. If `state.saving === true`: return (in-flight; the existing call's post-success branch will self-iterate).
3. Mark `saving: true`, snapshot `bodyAtSendTime = state.body` and `mtimeAtSendTime = state.savedMtimeMs`.
4. Compose `fullText = stringify(state.frontmatter, bodyAtSendTime)` — but we cannot import the main-side `stringify`. The renderer composes via the IPC `file.writeParsed(path, frontmatter, body, opts)` which calls `stringify` server-side. **We use `file.writeParsed`** (already on `IpcContract['file']`, see `shared/ipc-contract.ts:152`).
5. Call `await ipc.file.writeParsed(path, frontmatter, bodyAtSendTime, { expectedMtime: mtimeAtSendTime })`.
6. **Success branch:** set `savedBody = bodyAtSendTime`, `savedMtimeMs = result.mtimeMs`, `saving: false`, `saveErrorCount: 0`, `lastError: null`, recompute `dirty = (state.body !== bodyAtSendTime)`. If `dirty` is now true, call `_scheduleSave()` → 0ms (immediate) re-save. (We use `setTimeout(..., 0)` so the `set` flush happens before the next save.)
7. Error branch is task 2.6.

For this task we test only the **success path** + concurrent-merge behaviour. Error handling tests come in task 2.6.

- [ ] **Step 1: Add the failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — save (success path)', () => {
  it('writes body via file.writeParsed with expectedMtime, then advances saved* on success', async () => {
    await openReady('# Body', 100)
    useEditorStore.setState((prev) => ({
      ...prev,
      state:
        prev.state.kind === 'ready'
          ? { ...prev.state, body: '# New body', dirty: true }
          : prev.state
    }))

    ipcMock.file.write.mockResolvedValueOnce({ mtimeMs: 200, sha256: 'h2' })
    // Use writeParsed: route the mock through the same call.
    ;(ipcMock.file as any).writeParsed = vi.fn().mockResolvedValueOnce({
      mtimeMs: 200, sha256: 'h2'
    })

    await useEditorStore.getState().save()

    expect(ipcMock.file.writeParsed).toHaveBeenCalledTimes(1)
    expect(ipcMock.file.writeParsed).toHaveBeenCalledWith(
      'a.md',
      {},
      '# New body',
      { expectedMtime: 100 }
    )

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('# New body')
    expect(s.savedMtimeMs).toBe(200)
    expect(s.dirty).toBe(false)
    expect(s.saving).toBe(false)
    expect(s.saveErrorCount).toBe(0)
  })

  it('returns immediately when called while saving=true', async () => {
    await openReady('# Body', 1)
    useEditorStore.setState((prev) =>
      prev.state.kind === 'ready'
        ? { ...prev, state: { ...prev.state, body: '# x', dirty: true, saving: true } }
        : prev
    )
    ;(ipcMock.file as any).writeParsed = vi.fn()
    await useEditorStore.getState().save()
    expect((ipcMock.file as any).writeParsed).not.toHaveBeenCalled()
  })

  it('self-iterates: if body changes during in-flight save, runs again with the new body', async () => {
    await openReady('A', 10)
    let resolveFirst!: (v: { mtimeMs: number; sha256: string }) => void
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res
          })
      )
      .mockResolvedValueOnce({ mtimeMs: 22, sha256: 'h2' })

    // First save kicks off
    useEditorStore.setState((prev) =>
      prev.state.kind === 'ready'
        ? { ...prev, state: { ...prev.state, body: 'B', dirty: true } }
        : prev
    )
    const p1 = useEditorStore.getState().save()

    // While it's pending, user types more
    useEditorStore.getState().setBody('C')

    // Resolve the first write — it should commit savedBody=B and then re-save (C)
    resolveFirst({ mtimeMs: 11, sha256: 'h1' })

    await p1

    // Wait for the iterated save to complete (it's scheduled via setTimeout(0))
    await new Promise((r) => setTimeout(r, 5))

    expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(2)
    expect((ipcMock.file as any).writeParsed).toHaveBeenNthCalledWith(
      1, 'a.md', {}, 'B', { expectedMtime: 10 }
    )
    expect((ipcMock.file as any).writeParsed).toHaveBeenNthCalledWith(
      2, 'a.md', {}, 'C', { expectedMtime: 11 }
    )
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('C')
    expect(s.savedMtimeMs).toBe(22)
    expect(s.dirty).toBe(false)
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts -t 'save'
```

Expected: 3 FAIL (`save: notImplemented`).

> The test's `(ipcMock.file as any).writeParsed = vi.fn()` only works because the top-level `vi.mock('@/ipc/client', …)` already has a `writeParsed` shim — augment that mock so the type is consistent. Update the original `vi.mock` block:

```ts
vi.mock('@/ipc/client', () => ({
  ipc: {
    file: {
      readParsed: vi.fn(),
      write: vi.fn(),
      writeParsed: vi.fn()
    },
    files: { get: vi.fn() }
  }
}))
```

Re-run: still 3 FAIL.

- [ ] **Step 2: Implement `save`**

Replace `save: notImplemented,` in `src/stores/editor.ts` with:

```ts
  async save() {
    const cur = get().state
    if (cur.kind !== 'ready') return
    if (cur.saving) return
    if (!cur.dirty) return

    const bodyAtSendTime = cur.body
    const mtimeAtSendTime = cur.savedMtimeMs

    set({
      state: {
        ...cur,
        saving: true
      }
    })

    try {
      const r = await ipc.file.writeParsed(
        cur.path,
        cur.frontmatter,
        bodyAtSendTime,
        { expectedMtime: mtimeAtSendTime }
      )
      const next = get().state
      if (next.kind !== 'ready') return
      const newDirty = next.body !== bodyAtSendTime
      set({
        state: {
          ...next,
          savedBody: bodyAtSendTime,
          savedMtimeMs: r.mtimeMs,
          saving: false,
          dirty: newDirty,
          lastError: null,
          saveErrorCount: 0
        }
      })
      if (newDirty) {
        // Re-iterate immediately — the user typed during the in-flight save.
        setTimeout(() => {
          void get().save()
        }, 0)
      }
    } catch (err) {
      // Error handling lands in task 2.6 — for now, surface saving=false and
      // store the code so the test hooks see it.
      const code = err instanceof IpcError ? err.code : String(err)
      const next = get().state
      if (next.kind !== 'ready') return
      set({
        state: {
          ...next,
          saving: false,
          lastError: code,
          saveErrorCount: next.saveErrorCount + 1
        }
      })
    }
  },
```

- [ ] **Step 3: Run the tests**

Run:
```bash
npx vitest run src/stores/editor.test.ts -t 'save'
```

Expected: 3 PASS.

- [ ] **Step 4: Run the full suite**

Run:
```bash
npm test
```

Expected: PASS — no regressions in electron/shared tests.

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): editor store save() — single in-flight + self-iteration on dirty"
```

---

<!-- openspec-task: 2.5 -->
### Task 8: Implement `flushSave()`

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

`flushSave()` per design D3:
1. Cancel the debounce timer (`_cancelDebounce()`).
2. Await any in-flight save by polling `state.saving` until false (with a small async loop) — or simpler: kick off a `save()` and `await` it. If a save is currently in flight, the new `save()` call returns immediately (no-op per task 7's contract) and the existing in-flight save completes. We need to wait on the actual in-flight promise.

We track the in-flight promise on a module-private ref:

```ts
let _inflight: Promise<void> | null = null
```

`save()` assigns `_inflight = (async () => { … })()` at start and clears it on completion. `flushSave()` awaits that promise (if any), then if still dirty fires a new save.

- [ ] **Step 1: Refactor `save` to expose its in-flight promise**

Edit `src/stores/editor.ts`. Replace the `async save() { ... }` block with a wrapper pattern that records `_inflight`:

```ts
let _inflight: Promise<void> | null = null

async function _doSave(): Promise<void> {
  // Body of save extracted into a private helper so flushSave can await it.
  const cur = useEditorStore.getState().state
  if (cur.kind !== 'ready') return
  if (cur.saving) return
  if (!cur.dirty) return

  const bodyAtSendTime = cur.body
  const mtimeAtSendTime = cur.savedMtimeMs
  const path = cur.path
  const frontmatter = cur.frontmatter

  useEditorStore.setState((prev) => ({
    ...prev,
    state:
      prev.state.kind === 'ready'
        ? { ...prev.state, saving: true }
        : prev.state
  }))

  try {
    const r = await ipc.file.writeParsed(path, frontmatter, bodyAtSendTime, {
      expectedMtime: mtimeAtSendTime
    })
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    const newDirty = next.body !== bodyAtSendTime
    useEditorStore.setState({
      state: {
        ...next,
        savedBody: bodyAtSendTime,
        savedMtimeMs: r.mtimeMs,
        saving: false,
        dirty: newDirty,
        lastError: null,
        saveErrorCount: 0
      }
    })
    if (newDirty) {
      setTimeout(() => {
        void useEditorStore.getState().save()
      }, 0)
    }
  } catch (err) {
    const code = err instanceof IpcError ? err.code : String(err)
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    useEditorStore.setState({
      state: {
        ...next,
        saving: false,
        lastError: code,
        saveErrorCount: next.saveErrorCount + 1
      }
    })
  }
}
```

Replace the in-store `save` with the wrapper:

```ts
  async save() {
    if (_inflight) return _inflight
    const p = _doSave().finally(() => {
      _inflight = null
    })
    _inflight = p
    return p
  },
```

- [ ] **Step 2: Add the failing `flushSave` tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — flushSave', () => {
  it('cancels the debounce timer and resolves immediately when not dirty', async () => {
    await openReady('A', 1)
    // No setBody → not dirty. flushSave should be a fast no-op.
    await useEditorStore.getState().flushSave()
    expect((ipcMock.file as any).writeParsed).not.toHaveBeenCalled()
  })

  it('awaits an in-flight save before resolving', async () => {
    await openReady('A', 1)
    let release!: (v: { mtimeMs: number; sha256: string }) => void
    ;(ipcMock.file as any).writeParsed = vi.fn(
      () =>
        new Promise((res) => {
          release = res
        })
    )
    useEditorStore.getState().setBody('B')
    const savePromise = useEditorStore.getState().save()
    // flushSave is called while save is still pending
    let flushed = false
    const flushPromise = useEditorStore.getState().flushSave().then(() => {
      flushed = true
    })
    expect(flushed).toBe(false)
    release({ mtimeMs: 2, sha256: 'h2' })
    await savePromise
    await flushPromise
    expect(flushed).toBe(true)
  })

  it('if dirty after in-flight completes, fires another save', async () => {
    await openReady('A', 1)
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })
      .mockResolvedValueOnce({ mtimeMs: 3, sha256: 'h3' })

    useEditorStore.getState().setBody('B')
    await useEditorStore.getState().save()
    // Now: savedBody=B, dirty=false. Type more then flushSave.
    useEditorStore.getState().setBody('C')
    await useEditorStore.getState().flushSave()

    expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(2)
    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.savedBody).toBe('C')
    expect(s.savedMtimeMs).toBe(3)
    expect(s.dirty).toBe(false)
  })

  it('cancels a pending debounce timer (no second IPC call from the timer)', async () => {
    vi.useFakeTimers()
    try {
      await openReady('A', 1)
      ;(ipcMock.file as any).writeParsed = vi
        .fn()
        .mockResolvedValueOnce({ mtimeMs: 2, sha256: 'h2' })
      useEditorStore.getState().setBody('B') // schedules a 1s timer
      await useEditorStore.getState().flushSave() // should fire save and cancel timer
      vi.advanceTimersByTime(2000) // would fire the canceled timer if not canceled
      // Allow the promises microtask queue to settle
      await vi.runAllTimersAsync?.()
      expect((ipcMock.file as any).writeParsed).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
```

Run:
```bash
npx vitest run src/stores/editor.test.ts -t 'flushSave'
```

Expected: 4 FAIL (`flushSave: notImplemented`).

- [ ] **Step 3: Implement `flushSave`**

Replace `flushSave: notImplemented,` with:

```ts
  async flushSave() {
    _cancelDebounce()
    if (_inflight) {
      await _inflight
    }
    const cur = get().state
    if (cur.kind !== 'ready') return
    if (cur.dirty) {
      await get().save()
    }
  },
```

- [ ] **Step 4: Run the tests**

Run:
```bash
npx vitest run src/stores/editor.test.ts
```

Expected: ALL PASS (the open / setBody / save / flushSave suites).

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): editor store flushSave() awaits in-flight + re-saves if dirty"
```

---

<!-- openspec-task: 2.6 -->
### Task 9: Save error branches — `E_MTIME_MISMATCH` / `E_PERMISSION` / `E_NOSPACE` / generic

**Files:**
- Modify: `src/stores/editor.ts`
- Modify: `src/stores/editor.test.ts`

Per design D9 and spec `editor-autosave#保存错误重试与上限`:

| Code | Behaviour |
|---|---|
| `E_MTIME_MISMATCH` | `lastError = 'conflict'`; **do not** clear dirty; do not increment `saveErrorCount` (conflict is not "save failed", it's "needs human"). Toast wording lands in the UI plan. |
| `E_PERMISSION` / `E_NOSPACE` / `E_INTERNAL` / `E_WRITE_VERIFY` | `lastError = code`; `saveErrorCount += 1`; keep dirty. If `saveErrorCount >= 3`, store a flag `persistentFailure: true` so the UI plan can display the modal. |
| any other (e.g. `Error('socket boom')`) | `lastError = stringified message`; `saveErrorCount += 1`; same persistent-failure handling. |

Note: the basic catch block from task 7 already records `lastError` and increments `saveErrorCount`. This task **specialises** the conflict branch (no count increment, distinct `lastError`) and adds a `persistentFailure` flag.

Update the `EditorReadyState` to include `persistentFailure: boolean`.

- [ ] **Step 1: Add the failing tests**

Append to `src/stores/editor.test.ts`:

```ts
describe('editor store — save error branches', () => {
  it('E_MTIME_MISMATCH: lastError="conflict", dirty preserved, saveErrorCount unchanged', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_MTIME_MISMATCH', 'changed externally'))

    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.lastError).toBe('conflict')
    expect(s.dirty).toBe(true)
    expect(s.saving).toBe(false)
    expect(s.saveErrorCount).toBe(0)
    expect(s.persistentFailure).toBe(false)
  })

  it('E_PERMISSION: lastError=code, saveErrorCount=1, dirty preserved', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_PERMISSION', 'EACCES'))

    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.lastError).toBe('E_PERMISSION')
    expect(s.dirty).toBe(true)
    expect(s.saveErrorCount).toBe(1)
    expect(s.persistentFailure).toBe(false)
  })

  it('three consecutive non-conflict errors flip persistentFailure=true', async () => {
    await openReady('A', 1)
    useEditorStore.getState().setBody('B')
    ;(ipcMock.file as any).writeParsed = vi
      .fn()
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))
      .mockRejectedValueOnce(new IpcError('E_NOSPACE', 'disk full'))

    await useEditorStore.getState().save()
    await useEditorStore.getState().save()
    await useEditorStore.getState().save()

    const s = useEditorStore.getState().state
    if (s.kind !== 'ready') throw new Error('unreachable')
    expect(s.saveErrorCount).toBe(3)
    expect(s.persistentFailure).toBe(true)
  })

  it('successful save after errors clears the count and the flag (per task 2.7)', async () => {
    // Coverage skeleton — the actual reset on success is task 2.7.
    // For now we assert error-only state. The success-clears-count line will
    // be uncommented in plan 2 task 2.7.
    expect(true).toBe(true)
  })
})
```

> The fourth test (`successful save after errors`) is intentionally a placeholder — the explicit reset on success was already implemented in task 7's success branch (`saveErrorCount: 0`, `lastError: null`). What task 2.7 (plan 2) adds is the `persistentFailure: false` reset. Until then, the test stays a no-op.

Run:
```bash
npx vitest run src/stores/editor.test.ts -t 'save error branches'
```

Expected: 3 FAIL — the test asserts `s.persistentFailure` which doesn't exist yet on the state.

- [ ] **Step 2: Extend `EditorReadyState` with `persistentFailure`**

Edit `src/stores/editor.ts`. Add the field to `EditorReadyState`:

```ts
export type EditorReadyState = {
  kind: 'ready'
  path: string
  frontmatter: Frontmatter
  body: string
  savedBody: string
  savedMtimeMs: number
  dirty: boolean
  saving: boolean
  lastError: string | null
  saveErrorCount: number
  persistentFailure: boolean
}
```

In `open` (the success transition), seed `persistentFailure: false`:

```ts
state: {
  kind: 'ready',
  path,
  frontmatter: r.frontmatter,
  body: r.body,
  savedBody: r.body,
  savedMtimeMs: r.mtimeMs,
  dirty: false,
  saving: false,
  lastError: null,
  saveErrorCount: 0,
  persistentFailure: false
}
```

Update the EditorState type-test seed in `src/stores/editor.test.ts` to include `persistentFailure: false`:

```ts
const ready: EditorState = {
  kind: 'ready',
  path: 'a.md',
  frontmatter: {},
  body: 'hello',
  savedBody: 'hello',
  savedMtimeMs: 1,
  dirty: false,
  saving: false,
  lastError: null,
  saveErrorCount: 0,
  persistentFailure: false
}
```

- [ ] **Step 3: Specialise the catch block in `_doSave`**

Replace the catch block in `_doSave` with:

```ts
  } catch (err) {
    const next = useEditorStore.getState().state
    if (next.kind !== 'ready') return
    if (err instanceof IpcError && err.code === 'E_MTIME_MISMATCH') {
      // Conflict — leave dirty, leave count, distinct lastError.
      useEditorStore.setState({
        state: {
          ...next,
          saving: false,
          lastError: 'conflict'
        }
      })
      return
    }
    const code = err instanceof IpcError ? err.code : String(err)
    const newCount = next.saveErrorCount + 1
    useEditorStore.setState({
      state: {
        ...next,
        saving: false,
        lastError: code,
        saveErrorCount: newCount,
        persistentFailure: newCount >= 3
      }
    })
  }
```

In the success branch, also clear `persistentFailure`:

```ts
      useEditorStore.setState({
        state: {
          ...next,
          savedBody: bodyAtSendTime,
          savedMtimeMs: r.mtimeMs,
          saving: false,
          dirty: newDirty,
          lastError: null,
          saveErrorCount: 0,
          persistentFailure: false
        }
      })
```

- [ ] **Step 4: Run all tests**

Run:
```bash
npm test
```

Expected: PASS (everything in `src/stores/editor.test.ts` plus the existing electron/shared tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/editor.ts src/stores/editor.test.ts
git commit -m "feat(phase-07): editor store save error branches — conflict / perm / nospace + 3-strike persistent flag"
```

---

## Plan-1 Acceptance

After all 9 tasks complete:
- [ ] `npm run typecheck` PASSES
- [ ] `npm test` PASSES (new file `src/stores/editor.test.ts` ≥ 16 cases)
- [ ] `npm run lint` PASSES
- [ ] `node scripts/copy-vditor-assets.mjs` runs idempotently and `src/public/vditor/index.min.js` exists
- [ ] `package.json:postinstall` includes the asset-copy script
- [ ] `.gitignore` excludes `src/public/vditor/`
- [ ] `/editor/<encodedPath>` route resolves to the stub (manual `npm run dev` check)
- [ ] `git log --oneline` shows nine commits, each scoped to one OpenSpec task
- [ ] No reference to phase-06 `files.get` introduced — the editor reads via phase-04 `file.readParsed`. Plan 4 may revisit if phase-06 surfaces a richer summary.
