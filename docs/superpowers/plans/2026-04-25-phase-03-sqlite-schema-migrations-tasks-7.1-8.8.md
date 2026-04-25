# Phase 03 — SQLite Schema & Migrations: Plan 5 (Renderer UX + Acceptance)

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]` checkboxes for tracking.
>
> **OpenSpec change:** `phase-03-sqlite-schema-migrations`
> **Task range:** OpenSpec tasks `7.1`–`8.8` (11 tasks)
> **Plan order:** 5 of 5. **Depends on Plans 1–4.**
> **Status:** Not started
> **Created:** 2026-04-25

---

## Goal

Wire the renderer to react to `db:rebuilding` / `db:rebuilt` events with a full-screen overlay + toast, add a placeholder `DbHealthBadge`, and run the manual acceptance smoke matrix that proves end-to-end correctness — including the corrupt-db rebuild path.

## Architecture

- **`App.tsx` subscriptions.** A small effect subscribes to `db:rebuilding` / `db:rebuilt`. Local state `isRebuilding: boolean` drives a full-screen overlay (a `<div>` with `fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center text-foreground`). On `db:rebuilt`, drop the overlay and `toast(...)` from the existing `use-toast` hook.
- **`DbHealthBadge` component.** Reads `window.api.db.version()` on mount via `useEffect`, displays `v{user_version}` + a green dot. Stub for phase 3 (not mounted into TitleBar yet — explicitly deferred per task 7.3).
- **Acceptance.** Tasks 8.x are *manual smoke checks*, not TDD. They prove the integrated stack works in dev mode. The cross-platform check (8.7) is best-effort: run on whatever platforms the developer has access to, document findings.

## Tech Stack

- React 19 + react-router-dom 7
- `@/components/ui/toaster` + `@/hooks/use-toast` (already in repo)
- Tailwind 4 utilities (already configured)

## Files Touched

| Path | Action | Owner task |
|---|---|---|
| `src/App.tsx` | Modify (subscribe to rebuilding/rebuilt + overlay) | 7.1, 7.2 |
| `src/components/DbHealthBadge.tsx` | Create (stub component) | 7.3 |
| (No code) — manual smoke matrix runbook | — | 8.1–8.8 |

---

## Tasks

<!-- openspec-task: 7.1 -->
### Task 1: `App.tsx` — subscribe to `db:rebuilding`, show overlay

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Read the current App.tsx**

```bash
cat src/App.tsx
```

- [ ] **Step 2: Add overlay state + subscriber + render**

Replace `src/App.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Placeholder } from './pages/Placeholder'
import { ProjectPicker } from './pages/ProjectPicker'
import { useBootstrap } from './hooks/useBootstrap'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/hooks/use-toast'
import { TitleBar } from '@/components/TitleBar'
import { ipc } from '@/ipc/client'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

function DbRebuildOverlay({ visible }: { visible: boolean }): JSX.Element | null {
  if (!visible) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm text-foreground"
      role="alert"
      aria-live="assertive"
    >
      <div className="text-center">
        <div className="text-lg font-medium">索引损坏，正在重建</div>
        <div className="mt-2 text-sm text-muted-foreground">这通常只需要几秒钟</div>
      </div>
    </div>
  )
}

export function App(): JSX.Element {
  const { toast } = useToast()
  const [isRebuilding, setIsRebuilding] = useState(false)

  useEffect(() => {
    const offRebuilding = ipc.on('db:rebuilding', () => {
      setIsRebuilding(true)
    })
    const offRebuilt = ipc.on('db:rebuilt', () => {
      setIsRebuilding(false)
      toast({
        title: '索引已重建',
        description: '部分数据将在后续步骤中恢复'
      })
    })
    return () => {
      offRebuilding()
      offRebuilt()
    }
  }, [toast])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<BootstrapGate />} />
          <Route path="/picker" element={<ProjectPicker />} />
          <Route path="/library" element={<Placeholder name="library" />} />
          <Route path="/editor/:path" element={<Placeholder name="editor" />} />
          <Route path="/browser" element={<Placeholder name="browser" />} />
          <Route path="/chat" element={<Placeholder name="chat" />} />
          <Route path="/settings" element={<Placeholder name="settings" />} />
        </Routes>
      </main>
      <DbRebuildOverlay visible={isRebuilding} />
      <Toaster />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + dev smoke**

```bash
npm run typecheck
npm run dev
```

In DevTools console, manually trigger the overlay:

```js
window.dispatchEvent(new Event('storage')) // unrelated, just to verify console works
```

(The actual visual smoke for the overlay happens in Task 8.5; this step only confirms the build doesn't break.)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(phase-03): App.tsx subscribes to db:rebuilding (overlay) and db:rebuilt (toast)"
```

---

<!-- openspec-task: 7.2 -->
### Task 2: Verify the `db:rebuilt` toast (already wired in Task 1)

**Files:**
- (No new file — Task 1 already wired the toast.)

> **Note:** OpenSpec splits 7.1 (rebuilding overlay) and 7.2 (rebuilt toast) into two tasks. The implementation is one effect block that handles both — done in Task 1 above. This task is a verification checkpoint only.

- [ ] **Step 1: Read App.tsx and confirm both subscribers + cleanup are present**

```bash
grep -n "db:rebuilding\|db:rebuilt" src/App.tsx
```

Expected: two lines (one per channel), both inside `useEffect`, with matching `off*` cleanup in the return.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: No commit needed** — this task is a verification of work already committed in Task 1.

---

<!-- openspec-task: 7.3 -->
### Task 3: `DbHealthBadge` stub component (not mounted yet)

**Files:**
- Create: `src/components/DbHealthBadge.tsx`

> **Per OpenSpec task 7.3 — "本阶段可先不挂，留后续接入" — we create the component file but do NOT mount it into TitleBar/StatusBar in phase 3.** A later phase change will decide where it lives.

- [ ] **Step 1: Create the component**

Create `src/components/DbHealthBadge.tsx`:

```tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { ipc } from '@/ipc/client'

type Status = 'unknown' | 'ok' | 'error'

interface State {
  status: Status
  user_version: number | null
  message?: string
}

const INITIAL: State = { status: 'unknown', user_version: null }

export function DbHealthBadge(): JSX.Element {
  const [state, setState] = useState<State>(INITIAL)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const v = await ipc.db.version()
        if (cancelled) return
        setState({ status: 'ok', user_version: v.user_version })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          user_version: null,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const dot =
    state.status === 'ok' ? (
      <span aria-label="healthy" className="inline-block h-2 w-2 rounded-full bg-green-500" />
    ) : state.status === 'error' ? (
      <span aria-label="error" className="inline-block h-2 w-2 rounded-full bg-amber-500" />
    ) : (
      <span aria-label="unknown" className="inline-block h-2 w-2 rounded-full bg-muted" />
    )

  const label = state.user_version != null ? `db v${state.user_version}` : 'db ?'

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={state.message ?? label}
    >
      {dot}
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: clean. (Component is unused, but TypeScript still checks it.)

- [ ] **Step 3: Commit**

```bash
git add src/components/DbHealthBadge.tsx
git commit -m "feat(phase-03): DbHealthBadge stub component (not mounted yet)"
```

---

## Acceptance — Manual Smoke Matrix (Tasks 8.1–8.8)

> **All tasks below are manual.** Run `npm run dev` once, keep DevTools open, and step through each scenario. There are no automated tests for this section — UI subscriptions, app lifecycle, and on-disk corruption are out of scope for vitest.

> **Test grove:** Pick a fresh empty directory at e.g. `~/tmp/grove-phase3`. Use the Picker UI to "open" it (or "create new" if needed). The grove should NOT be in a sync directory (iCloud/Dropbox/etc) for clean WAL behavior.

---

<!-- openspec-task: 8.1 -->
### Task 4: Verify `index.db` exists with `user_version = 1`

- [ ] **Step 1: Open the test grove via Picker**

```bash
npm run dev
# In the app: Picker → "打开" → select ~/tmp/grove-phase3
```

- [ ] **Step 2: From a separate terminal, confirm the file**

```bash
ls -la ~/tmp/grove-phase3/.acornvo/
```

Expected: `index.db` present (probably also `index.db-shm` and `index.db-wal`).

- [ ] **Step 3: Read user_version directly via sqlite3 CLI** (optional — DevTools check in 8.2 covers it)

```bash
sqlite3 ~/tmp/grove-phase3/.acornvo/index.db 'PRAGMA user_version;'
```

Expected: `1`.

- [ ] **Step 4: Mark task done in tracker.** No commit (verification only).

---

<!-- openspec-task: 8.2 -->
### Task 5: `window.api.db.version()` returns `{ user_version: 1, migrations_applied: ['001_init.sql'] }`

- [ ] **Step 1: In the running dev app, open DevTools** (View → Toggle Developer Tools)

- [ ] **Step 2: Run in console**

```js
await window.api.db.version()
```

Expected:

```json
{ "user_version": 1, "migrations_applied": ["001_init.sql"] }
```

- [ ] **Step 3: Mark done in tracker.** No commit.

---

<!-- openspec-task: 8.3 -->
### Task 6: `window.api.db.integrityCheck()` returns `'ok'`

- [ ] **Step 1: In DevTools console**

```js
await window.api.db.integrityCheck()
```

Expected: `'ok'` (exact string).

- [ ] **Step 2: Mark done.** No commit.

---

<!-- openspec-task: 8.4 -->
### Task 7: `sqlite_master` contains every required table + index

- [ ] **Step 1: From terminal**

```bash
sqlite3 ~/tmp/grove-phase3/.acornvo/index.db <<'SQL'
.headers on
SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name;
SQL
```

- [ ] **Step 2: Verify every required table is present**

Expected (at minimum):

| type | name |
|---|---|
| index | idx_files_category |
| index | idx_files_content_hash |
| index | idx_files_rating |
| index | idx_queue_status |
| index | idx_usage_model |
| index | idx_usage_purpose |
| index | idx_usage_ts |
| index | uq_queue_active_path |
| table | bookmarks |
| table | chats |
| table | file_tags |
| table | files |
| table | files_fts |
| table | queue |
| table | tags |
| table | usage |

(Some `files_fts_*` shadow tables created by FTS5 will also appear — that's expected.)

- [ ] **Step 3: If anything is missing**, the corresponding `001_init.sql` block in Plan 2 is incomplete. Fix Plan 2 before marking this done.

---

<!-- openspec-task: 8.5 -->
### Task 8: Manual db corruption → rebuild end-to-end

> This is the most important acceptance gate. It exercises Plan 3 task 4.4, Plan 4 tasks 6.1/6.2, and Plan 5 tasks 7.1/7.2 together.

- [ ] **Step 1: Quit the dev app cleanly** (Cmd-Q on macOS)

- [ ] **Step 2: Confirm WAL is checkpointed and shrunk** (this also feeds Task 8.6)

```bash
ls -l ~/tmp/grove-phase3/.acornvo/index.db-wal 2>/dev/null
```

Expected: file is 0 bytes or absent.

- [ ] **Step 3: Corrupt `index.db`**

```bash
# Overwrite the SQLite header with garbage. integrity_check will reject this.
printf 'CORRUPTCORRUPT' | dd of=~/tmp/grove-phase3/.acornvo/index.db bs=1 count=14 conv=notrunc
```

- [ ] **Step 4: Restart the dev app and re-open the same grove**

```bash
npm run dev
# In the app: Picker → "最近" → select ~/tmp/grove-phase3
```

- [ ] **Step 5a: Confirm the overlay appeared briefly**

You should see the full-screen "索引损坏，正在重建" overlay flash for a split second, followed by a toast "索引已重建，部分数据将在后续步骤中恢复".

> **If the overlay was too fast to see**, throttle by adding `await new Promise(r => setTimeout(r, 2000))` between `backupCorruptDb` and the new `Database(...)` in `electron/services/db.ts:openForGrove`. **Remove this throttle before committing — it is debug-only.**

- [ ] **Step 5b: Confirm the corrupt sidecar exists**

```bash
ls -la ~/tmp/grove-phase3/.acornvo/ | grep corrupt
```

Expected: at least one file matching `index.db.corrupt-<ISO timestamp>` (and possibly `-wal` / `-shm` siblings).

- [ ] **Step 5c: Confirm the new db is healthy**

```js
// In DevTools
await window.api.db.version()
// → { user_version: 1, migrations_applied: ['001_init.sql'] }
await window.api.db.integrityCheck()
// → 'ok'
```

- [ ] **Step 6: Clean up the corrupt artifact** (optional)

```bash
rm ~/tmp/grove-phase3/.acornvo/index.db.corrupt-*
```

---

<!-- openspec-task: 8.6 -->
### Task 9: Switching groves — old WAL truncated, new db opens

- [ ] **Step 1: Create a second test grove**

```bash
mkdir -p ~/tmp/grove-phase3-b
```

- [ ] **Step 2: From the running app, switch from grove A to grove B**

Use the GroveSwitcher in TitleBar → "新建/打开" → select `~/tmp/grove-phase3-b`.

- [ ] **Step 3: Verify A's WAL was truncated**

```bash
ls -l ~/tmp/grove-phase3/.acornvo/index.db-wal 2>/dev/null
```

Expected: 0 bytes or absent.

- [ ] **Step 4: Verify B's db opened cleanly**

```js
// In DevTools (window.api now points at grove B's db)
await window.api.db.version()
// → { user_version: 1, migrations_applied: ['001_init.sql'] }
```

```bash
ls -la ~/tmp/grove-phase3-b/.acornvo/
```

Expected: `index.db` present.

- [ ] **Step 5: Switch back to grove A — confirm reopen works**

Repeat the switcher dance and confirm `db.version()` again returns `user_version: 1`.

---

<!-- openspec-task: 8.7 -->
### Task 10: Cross-platform postinstall + start (best effort)

- [ ] **Step 1: Run on macOS** (this is your primary dev machine)

```bash
rm -rf node_modules
npm install
npm run dev
# Open a grove. Confirm window.api.db.version() works.
```

Mark: macOS — pass / fail.

- [ ] **Step 2: Run on Linux** (if available)

Same sequence as Step 1, on a Linux dev machine or a clean Docker container with X11/Wayland.

Mark: Linux — pass / fail / not tested.

- [ ] **Step 3: Run on Windows** (if available)

Same sequence on a Windows machine.

Mark: Windows — pass / fail / not tested.

- [ ] **Step 4: Document findings**

Note any platform-specific failures in the OpenSpec change tracker. Common pitfalls:
- Windows: `electron-rebuild` may need MSVC build tools; install via `npm install --global windows-build-tools` (older Node) or VS Build Tools 2022 (newer).
- Linux: `python3` and `make` required.
- All: Node version must match `@types/node` major (currently `^22`).

> **If only macOS is available, mark this task done with the note "Linux/Windows deferred to CI setup change."**

---

<!-- openspec-task: 8.8 -->
### Task 11: `openspec validate phase-03-sqlite-schema-migrations --strict` passes

- [ ] **Step 1: From the repo root**

```bash
openspec validate phase-03-sqlite-schema-migrations --strict
```

Expected: exit 0, no validation errors.

- [ ] **Step 2: If validation fails**, read the error messages — they typically point at:
  - tasks.md format mismatches
  - spec scenario syntax issues (`#### Scenario:` headers)
  - missing artifacts
  - capability spec consistency

Fix the artifact (do **not** rewrite the plans) and rerun.

- [ ] **Step 3: When green**, no commit needed (no source changes); mark task done.

---

## Plan 5 Verification Checklist

- [ ] `src/App.tsx` subscribes to `db:rebuilding` (overlay) and `db:rebuilt` (toast + dismiss overlay)
- [ ] `src/components/DbHealthBadge.tsx` exists, typechecks, and is intentionally NOT mounted
- [ ] Manual: `index.db` exists with `user_version = 1` after first open
- [ ] Manual: `window.api.db.version()` returns `{ user_version: 1, migrations_applied: ['001_init.sql'] }`
- [ ] Manual: `window.api.db.integrityCheck()` returns `'ok'`
- [ ] Manual: every PRD-required table + index appears in `sqlite_master`
- [ ] Manual: corrupt-then-restart shows overlay → toast → fresh db, sidecar `index.db.corrupt-*` is preserved
- [ ] Manual: switching groves truncates old WAL and opens new db cleanly
- [ ] Manual: at least macOS passes the postinstall + start cycle (other platforms documented)
- [ ] `openspec validate phase-03-sqlite-schema-migrations --strict` passes

When all boxes are checked, mark OpenSpec tasks 7.1–8.8 done. The OpenSpec change is now ready for `/opsx:archive`.
