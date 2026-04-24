# Phase-01 Foundation IPC Base — Plan 5/5 (Tasks 7.6–8.7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a strongly-typed renderer-side IPC client (`src/ipc/client.ts`), wire the ping button into the home page so the full stack (renderer → preload → main → IPC → back) is exercised, and run the full acceptance checklist including `openspec validate --strict`.

**Architecture:** `src/ipc/client.ts` re-exports `window.api` under a stable `ipc` symbol so feature code imports `import { ipc } from '@/ipc/client'` rather than touching `window.api` directly — this lets test harnesses mock `ipc` in the future. A `useIpc()` hook is an intentionally thin identity pass-through for now; later phases can extend it with React-aware error handling. The home page adds a ping button whose result is stored in a feature-local Zustand slice (kept out of `root.ts` to avoid polluting the global store with demo state).

**Tech Stack:** window.api (from Plan 2), react-i18next, zustand, existing renderer scaffold.

---

## File Structure Map

| Path | Role |
|------|------|
| `src/ipc/client.ts` | Strongly-typed `ipc` re-export + `useIpc()` hook |
| `src/stores/home.ts` | Tiny feature store for ping result |
| `src/pages/Home.tsx` | Extended with ping button and result display |

---

<!-- openspec-task: 7.6 -->
### Task 1: `src/ipc/client.ts` — typed `ipc` re-export + `useIpc` hook

**Files:**
- Create: `src/ipc/client.ts`

- [ ] **Step 1: Create `src/ipc/client.ts`**

Create with:

```typescript
import type { IpcClient, IpcContract } from '@shared/ipc-contract'

/**
 * Strongly typed re-export of `window.api` (populated by preload).
 *
 * Feature modules SHOULD import from here (`import { ipc } from '@/ipc/client'`)
 * instead of touching `window.api` directly — this keeps a single mock point
 * for future tests and leaves room for React-layer wrapping later.
 */
export const ipc: IpcClient<IpcContract> = window.api

/**
 * Placeholder hook — currently returns `ipc` as-is. Retained as an
 * extension point: later phases may wrap calls with React error boundaries,
 * retry logic, or translation of `IpcError.code` into user-facing toasts.
 */
export function useIpc(): IpcClient<IpcContract> {
  return ipc
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```
Expected: PASS.

- [ ] **Step 3: Delete `src/ipc/.gitkeep`**

Run:
```bash
rm -f src/ipc/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add src/ipc/client.ts src/ipc/.gitkeep
git commit -m "feat(phase-01): expose typed ipc client and useIpc hook"
```

---

<!-- openspec-task: 7.7 -->
### Task 2: Home page — ping button, result round-trip via store

**Files:**
- Create: `src/stores/home.ts`
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Create `src/stores/home.ts`**

Create with:

```typescript
import { create } from 'zustand'

type State = {
  lastPingResult: string | null
  lastPingError: string | null
  setPingResult: (value: string) => void
  setPingError: (error: string) => void
  clear: () => void
}

export const useHomeStore = create<State>((set) => ({
  lastPingResult: null,
  lastPingError: null,
  setPingResult: (value) => set({ lastPingResult: value, lastPingError: null }),
  setPingError: (error) => set({ lastPingError: error, lastPingResult: null }),
  clear: () => set({ lastPingResult: null, lastPingError: null })
}))
```

- [ ] **Step 2: Replace `src/pages/Home.tsx` with the ping-capable version**

Replace with:

```tsx
import { useState } from 'react'
import { ipc } from '@/ipc/client'
import { useHomeStore } from '@/stores/home'

export function Home(): JSX.Element {
  const { lastPingResult, lastPingError, setPingResult, setPingError } =
    useHomeStore()
  const [inFlight, setInFlight] = useState(false)

  async function onPing(): Promise<void> {
    setInFlight(true)
    try {
      const result = await ipc.ping.echo('hi')
      setPingResult(result)
    } catch (err) {
      setPingError(err instanceof Error ? err.message : String(err))
    } finally {
      setInFlight(false)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Hello Acornvo</h1>
      <button type="button" onClick={() => void onPing()} disabled={inFlight}>
        {inFlight ? 'pinging…' : 'ping'}
      </button>
      {lastPingResult !== null && (
        <p data-testid="ping-result">result: {lastPingResult}</p>
      )}
      {lastPingError !== null && (
        <p data-testid="ping-error" style={{ color: 'crimson' }}>
          error: {lastPingError}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```
Expected: PASS.

- [ ] **Step 4: Smoke — click the ping button**

Run `npm run dev`. Click the `ping` button. Expected:
- Button disables briefly (`pinging…`).
- Then `result: hi` appears below the button.
- No red console errors in DevTools.

Quit the app.

- [ ] **Step 5: Commit**

```bash
git add src/stores/home.ts src/pages/Home.tsx
git commit -m "feat(phase-01): home page ping button round-trips through ipc"
```

---

<!-- openspec-task: 8.1 -->
### Task 3: Acceptance — `npm run dev` shows "Hello Acornvo"

**Files:**
- None (verification only)

- [ ] **Step 1: Run the dev server and visually confirm**

Run `npm run dev`.

Expected:
- Main Electron window opens, centered, 1280×800.
- Displays "Hello Acornvo" heading and a `ping` button.
- Theme follows system (dark background on dark-mode systems, light otherwise).
- No red console errors in DevTools.

- [ ] **Step 2: Note the PASS**

If all points pass, check off the openspec task:

```bash
grep -n "8.1" openspec/changes/phase-01-foundation-ipc-base/tasks.md
```
(No edit here — `/opsx:executing-plans` updates tasks.md on completion.)

Quit the app.

---

<!-- openspec-task: 8.2 -->
### Task 4: Acceptance — DevTools `window.api.ping.echo('x')` returns `'x'`; `window.require` is `undefined`

**Files:**
- None (verification only)

- [ ] **Step 1: Run dev server and open DevTools console**

Run `npm run dev`. Open DevTools (`Cmd+Opt+I` / `Ctrl+Shift+I`) → Console.

- [ ] **Step 2: Verify `ping.echo`**

Type:
```javascript
await window.api.ping.echo('x')
```
Expected: returns the string `'x'`.

- [ ] **Step 3: Verify Node primitives are absent**

Type each:
```javascript
window.require
window.process
window.ipcRenderer
window.Buffer
```
Expected: each is `undefined`.

Quit the app.

---

<!-- openspec-task: 8.3 -->
### Task 5: Acceptance — log file exists and contains "app started"

**Files:**
- None (verification only)

- [ ] **Step 1: Run the app to produce a log entry**

Run `npm run dev`. Wait for the window to appear. Quit.

- [ ] **Step 2: Confirm file exists**

Run:
```bash
ls -la ~/.acornvo/logs/main-$(date +%Y-%m-%d).log
```
Expected: file exists, non-empty.

- [ ] **Step 3: Confirm "app started" line**

Run:
```bash
grep "app started" ~/.acornvo/logs/main-$(date +%Y-%m-%d).log
```
Expected: at least one match, with `version`, `platform`, `electron` keys in the context.

---

<!-- openspec-task: 8.4 -->
### Task 6: Acceptance — renderer error logs reach the file

**Files:**
- None (verification only)

- [ ] **Step 1: Run the dev server and emit a log from the renderer**

Run `npm run dev`. In DevTools console:
```javascript
await window.api.log.error('boom', { where: 'smoke' })
```

Quit.

- [ ] **Step 2: Grep the log file**

Run:
```bash
grep "\[renderer\] boom" ~/.acornvo/logs/main-$(date +%Y-%m-%d).log
```
Expected: one matching line at `[error]` level with the `{ where: 'smoke' }` context.

---

<!-- openspec-task: 8.5 -->
### Task 7: Acceptance — macOS `Cmd+W` hides, Dock click re-shows

**Files:**
- None (verification only — macOS only)

- [ ] **Step 1: Skip on non-macOS**

If you are not on macOS, mark this task as N/A and continue.

- [ ] **Step 2: Run and test hide/reveal**

Run `npm run dev`. With the Acornvo window focused, press `Cmd+W`. Expected: window disappears; app stays visible in Dock.

Click the Acornvo icon in the Dock. Expected: window reappears with the same state (no reload).

Press `Cmd+Q`. Expected: app exits cleanly.

---

<!-- openspec-task: 8.6 -->
### Task 8: Acceptance — `tsc --noEmit` is clean; contract break fails compilation

**Files:**
- None (verification only)

- [ ] **Step 1: Run both typecheck projects**

Run:
```bash
npm run typecheck
```
Expected: exits 0, no TypeScript errors reported.

- [ ] **Step 2: Deliberately break the contract — expect compile failure**

Edit `shared/ipc-contract.ts` — delete the `echo` line from the `ping` namespace:

```typescript
export type IpcContract = {
  ping: {
    // echo: (input: string) => string   ← comment out this line
  }
  log: {
    // ...
  }
}
```

Run:
```bash
npm run typecheck
```
Expected: FAIL. Errors should appear in at least:
- `shared/ipc-contract.type-test.ts` (the `_EchoIsString` assertion)
- `electron/ipc/handlers.ts` (missing `echo` property)
- `preload/preload.ts` (extra `echo` property under `ping`)
- `src/pages/Home.tsx` or `src/ipc/client.ts` (renderer call site)

- [ ] **Step 3: Restore the contract**

Revert the edit:

```bash
git checkout shared/ipc-contract.ts
```

Run:
```bash
npm run typecheck
```
Expected: PASS again.

---

<!-- openspec-task: 8.7 -->
### Task 9: Acceptance — `openspec validate phase-01-foundation-ipc-base --strict`

**Files:**
- None (verification only)

- [ ] **Step 1: Run strict validation**

Run:
```bash
openspec validate phase-01-foundation-ipc-base --strict
```
Expected: exits 0, "VALID" (or equivalent success message).

- [ ] **Step 2: If validation fails**

Read the error message, locate the offending artifact, and fix it. Common issues:
- A Requirement missing its `#### Scenario:` block.
- Tasks.md containing unchecked boxes the validator considers incomplete (should not block `--strict` — but verify the validator's expectation).
- A proposed capability referenced in proposal.md but missing from `specs/<capability>/spec.md`.

Re-run validation until it exits 0.

- [ ] **Step 3: Final commit of implementation artifacts**

At this point the implementation is complete. Collect any lingering dirty files:

```bash
git status
```
If anything is uncommitted that belongs to the acceptance step, commit it:

```bash
git add <files>
git commit -m "feat(phase-01): acceptance sweep"
```

If clean, no commit needed.

---

## Plan 5 Wrap-up (and phase-01 wrap-up)

After Task 9 of this plan:
- `src/ipc/client.ts` exposes the typed `ipc` symbol.
- Home page round-trips a ping through the full main ↔ preload ↔ renderer path.
- All 7 acceptance checks in section 8 of `tasks.md` pass.
- `openspec validate --strict` passes.

**Ready for archival** (see `/opsx:archive`) once `/opsx:verify` confirms implementation matches specs.

Known follow-ups (deliberately out of scope for phase-01 — do **not** add to this plan):
- Tightening the CSP (deferred to `vditor-editor-autosave`).
- Adding `en-US` i18n resources (deferred to `observability-and-packaging`).
- Replacing the `any` bits inside `registerHandlers`'s dispatch loop with tighter inference — the current `HandlerMap` type already provides full safety at the call site; the internal cast is a one-line exception.
