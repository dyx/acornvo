# Phase-01 Foundation IPC Base — Plan 2/5 (Tasks 3.1–4.4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the main-process IPC router (`registerHandlers`, `wrap`, `normalize`) with built-in `ping` and `log` handlers, then wire the preload bridge to expose `window.api` through `contextBridge` — all statically derived from `shared/ipc-contract.ts`.

**Architecture:** `registerHandlers` walks a namespace-keyed handler map and registers one `ipcMain.handle(<ns>.<method>, wrap(fn))` per method. `wrap` enforces the `{ ok, data|error }` envelope, logs any thrown error in the main process, and runs `normalize` to scrub stack traces and absolute paths before returning. Preload defines a single `invoke` helper that unwraps the envelope (throws `IpcError` on `ok: false`) and hand-writes the `api` surface for `ping` and `log` namespaces — kept in sync with `IpcContract` via a type assertion (`satisfies IpcClient<IpcContract>`).

**Tech Stack:** Electron 39, TypeScript 5.9 (strict), `shared/ipc-contract.ts` types from Plan 1.

---

## File Structure Map

| Path                          | Role                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `electron/ipc/router.ts`      | `registerHandlers`, `wrap`, `normalize`                 |
| `electron/ipc/handlers.ts`    | Concrete `ping` and `log` handler map                   |
| `electron/services/logger.ts` | Stub used by `router.ts`; full implementation in Plan 4 |
| `preload/preload.ts`          | `contextBridge.exposeInMainWorld('api', ...)`           |
| `src/global.d.ts`             | `Window.api` declaration                                |

> The logger import in `router.ts` uses a minimal stub (`console` passthrough) in this plan. Plan 4 (Task 6.x) replaces the stub with real electron-log. The stub preserves the public `logger.{debug,info,warn,error}(msg, ctx?)` API so Plan 4's swap is drop-in.

---

<!-- openspec-task: 3.1 -->

### Task 1: Scaffold `registerHandlers` entry point

**Files:**

- Create: `electron/services/logger.ts` (stub; real logger in Plan 4)
- Create: `electron/ipc/router.ts` (initial skeleton)

- [ ] **Step 1: Create a logger stub that both main and router import**

Create `electron/services/logger.ts` with:

```typescript
/**
 * Stub logger — replaced by electron-log integration in Plan 4 (Task 6.1).
 * Keeps the same public interface so downstream code does not change.
 */

export type Logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => void
  info: (msg: string, ctx?: Record<string, unknown>) => void
  warn: (msg: string, ctx?: Record<string, unknown>) => void
  error: (msg: string, ctx?: Record<string, unknown>) => void
}

export const logger: Logger = {
  debug: (msg, ctx) => console.debug(msg, ctx ?? ''),
  info: (msg, ctx) => console.info(msg, ctx ?? ''),
  warn: (msg, ctx) => console.warn(msg, ctx ?? ''),
  error: (msg, ctx) => console.error(msg, ctx ?? '')
}

export async function initLogger(): Promise<void> {
  // no-op — real initialisation added in Plan 4
}
```

- [ ] **Step 2: Create `electron/ipc/router.ts` with `registerHandlers` skeleton**

Create `electron/ipc/router.ts` with:

```typescript
import { ipcMain } from 'electron'
import type { IpcContract, IpcResult } from '@shared/ipc-contract'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: (
      ...args: Parameters<IpcContract[NS][M]>
    ) => ReturnType<IpcContract[NS][M]> | Promise<Awaited<ReturnType<IpcContract[NS][M]>>>
  }
}

export function registerHandlers(handlers: HandlerMap): void {
  for (const ns of Object.keys(handlers) as (keyof HandlerMap)[]) {
    const methods = handlers[ns] as Record<string, (...args: unknown[]) => unknown>
    for (const method of Object.keys(methods)) {
      const channel = `${String(ns)}.${method}`
      const fn = methods[method]
      ipcMain.handle(channel, wrap(channel, fn))
    }
  }
}

// Placeholder — real implementation in Task 2.
function wrap(
  _channel: string,
  _fn: (...args: unknown[]) => unknown
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResult<unknown>> {
  return async () => ({ ok: true, data: undefined })
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 4: Delete `electron/.gitkeep`, `electron/ipc/.gitkeep`, `electron/services/.gitkeep`**

Run:

```bash
rm -f electron/.gitkeep electron/ipc/.gitkeep electron/services/.gitkeep
```

- [ ] **Step 5: Commit**

```bash
git add electron/services/logger.ts electron/ipc/router.ts electron/.gitkeep electron/ipc/.gitkeep electron/services/.gitkeep
git commit -m "feat(phase-01): scaffold registerHandlers and stub logger"
```

---

<!-- openspec-task: 3.2 -->

### Task 2: Implement `wrap(fn)` with try/catch envelope

**Files:**

- Modify: `electron/ipc/router.ts` (replace `wrap` placeholder)

- [ ] **Step 1: Replace the `wrap` placeholder in `electron/ipc/router.ts`**

Replace the entire `wrap` function and any trailing helpers with:

```typescript
function wrap(
  channel: string,
  fn: (...args: unknown[]) => unknown
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResult<unknown>> {
  return async (_event, ...args) => {
    try {
      const data = await fn(...args)
      return { ok: true, data }
    } catch (err) {
      const error = normalize(err)
      logger.error(`ipc handler failed: ${channel}`, {
        code: error.code,
        message: error.message,
        stack: err instanceof Error ? err.stack : String(err)
      })
      return { ok: false, error }
    }
  }
}
```

Add these imports at the top of the file (merge with existing imports):

```typescript
import { logger } from '../services/logger'
import { IpcError, type IpcErrorShape } from '@shared/ipc-contract'
```

- [ ] **Step 2: Add a placeholder `normalize` — the real implementation lands in Task 3**

Append to `electron/ipc/router.ts`:

```typescript
export function normalize(err: unknown): IpcErrorShape {
  if (err instanceof IpcError) {
    return { code: err.code, message: err.message }
  }
  const message = err instanceof Error ? err.message : String(err)
  return { code: 'E_INTERNAL', message }
}
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/router.ts
git commit -m "feat(phase-01): implement wrap envelope with try/catch and main-side logging"
```

---

<!-- openspec-task: 3.3 -->

### Task 3: Implement `normalize(e)` with sanitisation

**Files:**

- Modify: `electron/ipc/router.ts` (replace placeholder `normalize`)

- [ ] **Step 1: Replace `normalize` with sanitising implementation**

Replace the entire `normalize` function in `electron/ipc/router.ts` with:

```typescript
const ABSOLUTE_PATH_PATTERNS: RegExp[] = [
  /\/Users\/[^\s:)]+/g, // macOS
  /\/home\/[^\s:)]+/g, // Linux
  /[A-Za-z]:\\[^\s:)]+/g // Windows
]

function sanitizeMessage(message: string): string {
  // Keep only the first line (drop stack trace) and scrub absolute paths.
  const firstLine = message.split('\n', 1)[0] ?? message
  return ABSOLUTE_PATH_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '<path>'), firstLine)
}

export function normalize(err: unknown): IpcErrorShape {
  if (err instanceof IpcError) {
    return { code: err.code, message: sanitizeMessage(err.message) }
  }
  if (err instanceof Error) {
    return { code: 'E_INTERNAL', message: sanitizeMessage(err.message) }
  }
  return { code: 'E_INTERNAL', message: 'Unknown error' }
}
```

- [ ] **Step 2: Add a compile-time self-check file that exercises `normalize`**

Create `electron/ipc/router.type-check.ts` with:

```typescript
/**
 * Compile-time self-check — never imported at runtime. If the exports drift
 * (e.g. `normalize` renamed or `IpcErrorShape` changed), this file fails to
 * compile and CI catches the drift.
 */
import { normalize, registerHandlers } from './router'
import { IpcError, type IpcErrorShape } from '@shared/ipc-contract'

const _shape: IpcErrorShape = normalize(new IpcError('E_NOT_FOUND', 'nope'))
const _shape2: IpcErrorShape = normalize(new Error('boom'))
const _shape3: IpcErrorShape = normalize('not-an-error')

// registerHandlers must accept the ping+log shape — exercise it structurally.
const _accepts: Parameters<typeof registerHandlers>[0] = {
  ping: { echo: (input: string) => input },
  log: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  }
}

export const _selfCheck = { _shape, _shape2, _shape3, _accepts } as const
```

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 4: Verify sanitisation by logic inspection**

Open `electron/ipc/router.ts` and re-read `sanitizeMessage`. Confirm:

- Only first `\n`-delimited segment is returned (drops stacks).
- All three platform path shapes (`/Users/...`, `/home/...`, `C:\...`) are replaced with `<path>`.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/router.ts electron/ipc/router.type-check.ts
git commit -m "feat(phase-01): sanitize normalised IPC error messages (strip stack + absolute paths)"
```

---

<!-- openspec-task: 3.4 -->

### Task 4: Built-in `ping` and `log` handlers

**Files:**

- Create: `electron/ipc/handlers.ts`

- [ ] **Step 1: Create `electron/ipc/handlers.ts`**

Create `electron/ipc/handlers.ts` with:

```typescript
import type { IpcContract } from '@shared/ipc-contract'
import { logger } from '../services/logger'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M]
  }
}

/**
 * Built-in handlers shipped with phase-01. Later phases add more namespaces
 * to this map.
 */
export const ipcHandlers: HandlerMap = {
  ping: {
    echo: (input: string): string => input
  },
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.debug(`[renderer] ${msg}`, ctx)
    },
    info: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.info(`[renderer] ${msg}`, ctx)
    },
    warn: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.warn(`[renderer] ${msg}`, ctx)
    },
    error: (msg: string, ctx?: Record<string, unknown>): void => {
      logger.error(`[renderer] ${msg}`, ctx)
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS. The `HandlerMap` type ensures contract drift is caught.

- [ ] **Step 3: Deliberate drift check — confirm compile fails if a method is missing**

Temporarily delete the `warn` entry in `ipcHandlers.log`. Save. Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: FAIL with `Property 'warn' is missing` on `ipcHandlers.log`.

Restore the `warn` entry. Re-run typecheck — PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/handlers.ts
git commit -m "feat(phase-01): built-in ping and log IPC handlers"
```

---

<!-- openspec-task: 4.1 -->

### Task 5: Generate `window.api` proxy in preload (explicit ping + log)

**Files:**

- Create: `preload/preload.ts`

- [ ] **Step 1: Create `preload/preload.ts` with the `api` object scaffold**

Create `preload/preload.ts` with:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcClient, IpcContract, IpcResult } from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) {
    throw new IpcError(res.error.code, res.error.message)
  }
  return res.data
}

const api = {
  ping: {
    echo: (input: string) => invoke<string>('ping.echo', input)
  },
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>) => invoke<void>('log.debug', msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => invoke<void>('log.info', msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => invoke<void>('log.warn', msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => invoke<void>('log.error', msg, ctx)
  }
} satisfies IpcClient<IpcContract>

// expose happens in Task 7; for now just assert the type matches.
export type PreloadApi = typeof api
export { api }
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS. The `satisfies IpcClient<IpcContract>` assertion enforces contract parity at compile time.

- [ ] **Step 3: Delete `preload/.gitkeep`**

Run:

```bash
rm -f preload/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add preload/preload.ts preload/.gitkeep
git commit -m "feat(phase-01): preload api matches IpcClient<IpcContract> via satisfies"
```

---

<!-- openspec-task: 4.2 -->

### Task 6: Confirm `invoke` unwraps the envelope and throws `IpcError`

**Files:**

- Verify: `preload/preload.ts` (written in Task 5)

- [ ] **Step 1: Re-read `invoke` to confirm the contract**

Open `preload/preload.ts`. Confirm the `invoke` function:

- Calls `ipcRenderer.invoke(channel, ...args)`.
- Narrows via `IpcResult<T>`.
- Throws `new IpcError(res.error.code, res.error.message)` when `res.ok === false`.
- Returns `res.data` on success.

If any of these is missing or diverges, edit the file to match Task 5's code exactly.

- [ ] **Step 2: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 3: No commit required** unless Step 1 found divergence; if it did, commit with:

```bash
git add preload/preload.ts
git commit -m "fix(phase-01): ensure preload invoke throws IpcError on envelope failure"
```

---

<!-- openspec-task: 4.3 -->

### Task 7: Expose `api` via `contextBridge`; forbid leaking Node primitives

**Files:**

- Modify: `preload/preload.ts` (append expose call + guard)

- [ ] **Step 1: Append `contextBridge` call and Node-primitive guard at the bottom of `preload/preload.ts`**

Append:

```typescript
if (!process.contextIsolated) {
  // Fail loudly during development — contextBridge requires isolation.
  throw new Error('preload requires contextIsolation: true')
}

contextBridge.exposeInMainWorld('api', api)

// Explicitly NOT exposed: ipcRenderer, process, require, Buffer, __dirname.
// Exposing them would defeat the preload sandbox. Any future additions MUST
// go through the `api` object defined above, not exposeInMainWorld directly.
```

- [ ] **Step 2: Grep the whole file to confirm no accidental leaks**

Run:

```bash
grep -E "exposeInMainWorld\s*\(\s*['\"]" preload/preload.ts
```

Expected: exactly **one** match — the `exposeInMainWorld('api', api)` line.

Run:

```bash
grep -E "exposeInMainWorld.*'(ipcRenderer|process|require|Buffer)'" preload/preload.ts
```

Expected: **no matches** (empty output, exit code 1). If matches exist, delete them.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add preload/preload.ts
git commit -m "feat(phase-01): expose window.api via contextBridge, forbid leaking Node primitives"
```

---

<!-- openspec-task: 4.4 -->

### Task 8: Declare `window.api` type in `src/global.d.ts`

**Files:**

- Create: `src/global.d.ts`

- [ ] **Step 1: Create `src/global.d.ts`**

Create `src/global.d.ts` with:

```typescript
import type { IpcClient, IpcContract } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: IpcClient<IpcContract>
  }
}

export {}
```

- [ ] **Step 2: Ensure the renderer tsconfig picks up `src/global.d.ts`**

`tsconfig.web.json` already has `include: ["src/**/*", ...]` from Plan 1 Task 3, so `src/global.d.ts` is auto-included. Confirm:

Run:

```bash
grep -E '"src/\*\*/\*"' tsconfig.web.json
```

Expected: one match. If missing, re-apply Plan 1 Task 3.

- [ ] **Step 3: Typecheck web project**

Run:

```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```

Expected: PASS or `TS18003: No inputs were found` (no `.tsx` files yet — Plan 4 adds them). The `global.d.ts` file counts as input so PASS is expected; if `TS18003` happens, re-check the glob.

- [ ] **Step 4: Commit**

```bash
git add src/global.d.ts
git commit -m "feat(phase-01): declare window.api type in src/global.d.ts"
```

---

## Plan 2 Wrap-up

After Task 8, the repo should have:

- `electron/ipc/router.ts` — `registerHandlers`, `wrap`, `normalize`, `sanitizeMessage`
- `electron/ipc/router.type-check.ts` — compile-time contract guard
- `electron/ipc/handlers.ts` — built-in `ping` + `log` handlers
- `electron/services/logger.ts` — stub logger (replaced in Plan 4)
- `preload/preload.ts` — `window.api` exposed via `contextBridge`, with `satisfies IpcClient<IpcContract>`
- `src/global.d.ts` — renderer-side `Window.api` type

`npx tsc --noEmit -p tsconfig.node.json --composite false` PASSes.
`npm run dev` still fails (no `electron/main.ts` entry yet — Plan 3 creates it).

Next plan: Plan 3 (tasks 5.1–5.8) implements `electron/main.ts` — window creation, CSP, lifecycle hooks.
