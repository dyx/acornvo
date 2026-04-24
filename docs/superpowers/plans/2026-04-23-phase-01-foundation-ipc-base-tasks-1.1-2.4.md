# Phase-01 Foundation IPC Base — Plan 1/5 (Tasks 1.1–2.4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install foundational dependencies, restructure project layout to match the phase-01 contract, and define the complete IPC type contract in `shared/ipc-contract.ts`.

**Architecture:** Move from the electron-vite default scaffold (`src/main/`, `src/preload/`, `src/renderer/src/`) to the phase-01 layout (`electron/`, `preload/`, `shared/`, `src/`). Declare IPC contract as a single TS source of truth — main handlers and preload client both derive types from it. Validation is type-level (`tsc --noEmit`) because this plan only produces types and config; runtime lives in later plans.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, electron-vite 5, react-router-dom, zustand, electron-log, i18next, react-i18next.

---

## File Structure Map

| Path | Role | Plan |
|------|------|------|
| `package.json` | Add 5 deps | This plan |
| `tsconfig.node.json` | Main/preload TS | This plan |
| `tsconfig.web.json` | Renderer TS + path aliases | This plan |
| `electron.vite.config.ts` | Rewrite entries for new layout | This plan |
| `electron/` | New main-process root | Created, filled in later plans |
| `preload/` | New preload root | Created, filled in later plans |
| `shared/ipc-contract.ts` | IPC types, single source of truth | This plan |
| `src/` | New renderer root (flat, replaces `src/renderer/src/`) | Created, filled in later plans |
| `src/renderer/`, `src/main/`, `src/preload/` | Old scaffold paths | Removed |

---

<!-- openspec-task: 1.1 -->
### Task 1: Add foundation dependencies

**Files:**
- Modify: `package.json` (dependencies + devDependencies blocks)

- [ ] **Step 1: Install runtime dependencies**

Run:
```bash
npm install react-router-dom zustand electron-log i18next react-i18next
```
Expected: exit 0, `package-lock.json` updated, all 5 packages appear under `dependencies` in `package.json`.

- [ ] **Step 2: Verify installed versions resolve**

Run:
```bash
node -e "console.log(require('react-router-dom/package.json').version, require('zustand/package.json').version, require('electron-log/package.json').version, require('i18next/package.json').version, require('react-i18next/package.json').version)"
```
Expected: five version strings print; none fail to resolve.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(phase-01): add react-router-dom, zustand, electron-log, i18next dependencies"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: Create new directory layout and remove scaffold dirs

**Files:**
- Create: `electron/.gitkeep`
- Create: `electron/ipc/.gitkeep`
- Create: `electron/services/.gitkeep`
- Create: `preload/.gitkeep`
- Create: `shared/.gitkeep`
- Create: `src/stores/.gitkeep`
- Create: `src/ipc/.gitkeep`
- Create: `src/i18n/.gitkeep`
- Delete (end of plan 4): `src/renderer/`, `src/main/`, `src/preload/` — left in place for now; Plan 4 / 5 rewires entries. **Do not delete in this task.**

- [ ] **Step 1: Create new directories with `.gitkeep` markers**

Run:
```bash
mkdir -p electron/ipc electron/services preload shared src/stores src/ipc src/i18n
touch electron/.gitkeep electron/ipc/.gitkeep electron/services/.gitkeep preload/.gitkeep shared/.gitkeep src/stores/.gitkeep src/ipc/.gitkeep src/i18n/.gitkeep
```
Expected: directories exist; `ls electron preload shared src` shows all new subdirs.

- [ ] **Step 2: Verify structure**

Run:
```bash
find electron preload shared src/stores src/ipc src/i18n -type d
```
Expected: outputs all 8 directories plus any existing ones under `src/` (renderer/, main/, preload/ still present — that is fine).

- [ ] **Step 3: Commit**

```bash
git add electron preload shared src/stores src/ipc src/i18n
git commit -m "feat(phase-01): scaffold new directory layout for electron/preload/shared/src"
```

---

<!-- openspec-task: 1.3 -->
### Task 3: Update TypeScript path aliases

**Files:**
- Modify: `tsconfig.web.json` (add `@/` and `@shared/` paths; extend `include`)
- Modify: `tsconfig.node.json` (add `@shared/` path; extend `include` to `electron/**/*`, `preload/**/*`, `shared/**/*`)

- [ ] **Step 1: Rewrite `tsconfig.web.json`**

Replace the full contents of `tsconfig.web.json` with:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/**/*",
    "src/**/*.tsx",
    "shared/**/*",
    "preload/**/*.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["shared/*"]
    }
  }
}
```

- [ ] **Step 2: Rewrite `tsconfig.node.json`**

Replace the full contents of `tsconfig.node.json` with:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": [
    "electron.vite.config.*",
    "electron/**/*",
    "preload/**/*",
    "shared/**/*"
  ],
  "compilerOptions": {
    "composite": true,
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    },
    "types": ["electron-vite/node"]
  }
}
```

- [ ] **Step 3: Verify typecheck scripts still parse config (expected to fail on missing source files — that is OK)**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: either passes (if no TS files exist yet in new dirs) or fails with `error TS18003: No inputs were found`. Both are acceptable at this step — no config syntax error.

Run:
```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```
Expected: passes against old `src/renderer/src/**/*` (still present) or reports `TS18003`. No config syntax errors.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.web.json tsconfig.node.json
git commit -m "feat(phase-01): add @/ and @shared/ path aliases, strict mode on"
```

---

<!-- openspec-task: 1.4 -->
### Task 4: Rewire `electron.vite.config.ts` entries for new layout

**Files:**
- Modify: `electron.vite.config.ts` (full rewrite)

- [ ] **Step 1: Replace `electron.vite.config.ts`**

Replace the full contents with:

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'preload/preload.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/index.html')
        }
      }
    }
  }
})
```

- [ ] **Step 2: Update `package.json` `main` field**

In `package.json`, change the `"main"` field from `"./out/main/index.js"` to `"./out/main/main.js"` (electron-vite uses the entry file base name). Save.

- [ ] **Step 3: Verify config parses**

Run:
```bash
npx electron-vite --help
```
Expected: usage text prints, no config parse error. (Actual build will fail until entries exist — that is OK.)

- [ ] **Step 4: Commit**

```bash
git add electron.vite.config.ts package.json
git commit -m "feat(phase-01): rewire electron-vite config for electron/ preload/ src/ layout"
```

---

<!-- openspec-task: 2.1 -->
### Task 5: Define `IpcOk<T>` / `IpcErr` / `IpcResult<T>` and `IpcError` class

**Files:**
- Create: `shared/ipc-contract.ts`
- Delete: `shared/.gitkeep` (once real files land)

- [ ] **Step 1: Create `shared/ipc-contract.ts` with result types and error class**

Create `shared/ipc-contract.ts` with:

```typescript
/**
 * IPC contract — single source of truth for types shared between main, preload, and renderer.
 */

export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'

export interface IpcErrorShape {
  code: IpcErrorCode
  message: string
}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr = { ok: false; error: IpcErrorShape }
export type IpcResult<T> = IpcOk<T> | IpcErr

export class IpcError extends Error {
  public readonly code: IpcErrorCode

  constructor(codeOrShape: IpcErrorCode | IpcErrorShape, message?: string) {
    if (typeof codeOrShape === 'string') {
      super(message ?? '')
      this.code = codeOrShape
    } else {
      super(codeOrShape.message)
      this.code = codeOrShape.code
    }
    this.name = 'IpcError'
  }
}
```

- [ ] **Step 2: Remove the `.gitkeep` now that `shared/` has real content**

Run:
```bash
rm shared/.gitkeep
```

- [ ] **Step 3: Typecheck node project (includes `shared/`)**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS (or `TS18003: No inputs were found` — fine if `electron/` and `preload/` are empty).

Run:
```bash
npx tsc --noEmit -p tsconfig.web.json --composite false
```
Expected: PASS or `TS18003`. No errors in `shared/ipc-contract.ts`.

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts shared/.gitkeep
git commit -m "feat(phase-01): add IpcResult types and IpcError class"
```

---

<!-- openspec-task: 2.2 -->
### Task 6: Confirm `IpcErrorCode` enumeration covers baseline codes

**Files:**
- Verify: `shared/ipc-contract.ts` (already written in Task 5)

- [ ] **Step 1: Grep the file to confirm all four codes are present**

Run:
```bash
grep -E "E_INTERNAL|E_INVALID_ARGS|E_NOT_FOUND|E_PERMISSION" shared/ipc-contract.ts
```
Expected: all four codes appear in the union.

- [ ] **Step 2: Verify the union is exported (importable by other modules)**

Run:
```bash
grep "export type IpcErrorCode" shared/ipc-contract.ts
```
Expected: one match.

- [ ] **Step 3: No commit needed** (already committed in Task 5). If the grep fails, return to Task 5 and fix.

---

<!-- openspec-task: 2.3 -->
### Task 7: Declare the `IpcContract` type

**Files:**
- Modify: `shared/ipc-contract.ts` (append contract declaration)

- [ ] **Step 1: Append `IpcContract` declaration to `shared/ipc-contract.ts`**

Append this block to the bottom of `shared/ipc-contract.ts`:

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type IpcContract = {
  ping: {
    echo: (input: string) => string
  }
  log: {
    debug: (msg: string, ctx?: Record<string, unknown>) => void
    info: (msg: string, ctx?: Record<string, unknown>) => void
    warn: (msg: string, ctx?: Record<string, unknown>) => void
    error: (msg: string, ctx?: Record<string, unknown>) => void
  }
}
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS or `TS18003`.

- [ ] **Step 3: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(phase-01): declare IpcContract with ping and log namespaces"
```

---

<!-- openspec-task: 2.4 -->
### Task 8: Export `IpcChannelName<NS, M>` and `IpcClient<C>` utility types

**Files:**
- Modify: `shared/ipc-contract.ts` (append utility types)

- [ ] **Step 1: Append utility types to `shared/ipc-contract.ts`**

Append this block to the bottom of `shared/ipc-contract.ts`:

```typescript
/**
 * Channel name template: `<namespace>.<method>`.
 */
export type IpcChannelName<
  NS extends string,
  M extends string
> = `${NS}.${M}`

/**
 * Promisified + structurally-safe client type derived from any IPC contract.
 * All methods return Promise<Awaited<R>> because they cross the process boundary.
 */
type Promisify<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never

export type IpcClient<C> = {
  [NS in keyof C]: {
    [M in keyof C[NS]]: Promisify<C[NS][M]>
  }
}
```

- [ ] **Step 2: Add a type-level smoke test file to catch contract drift in CI**

Create `shared/ipc-contract.type-test.ts` with:

```typescript
/**
 * Compile-time-only contract assertions. This file is referenced by tsconfig
 * but never imported at runtime; TS errors here mean the contract drifted.
 */
import type { IpcClient, IpcContract, IpcChannelName, IpcResult } from './ipc-contract'
import { IpcError } from './ipc-contract'

type Assert<T extends true> = T

type _EchoIsString = Assert<
  ReturnType<IpcClient<IpcContract>['ping']['echo']> extends Promise<string> ? true : false
>

type _LogIsVoid = Assert<
  ReturnType<IpcClient<IpcContract>['log']['info']> extends Promise<void> ? true : false
>

type _Channel = Assert<IpcChannelName<'ping', 'echo'> extends 'ping.echo' ? true : false>

type _ResultOk = Assert<Extract<IpcResult<number>, { ok: true }>['data'] extends number ? true : false>

// Ensure IpcError constructs from either a code string or a shape
const _e1: IpcError = new IpcError('E_INTERNAL', 'boom')
const _e2: IpcError = new IpcError({ code: 'E_NOT_FOUND', message: 'nope' })

// Suppress unused-variable warnings
export const _types = { _e1, _e2 } as const
export type _Exports = _EchoIsString | _LogIsVoid | _Channel | _ResultOk
```

- [ ] **Step 3: Typecheck — this is the first real PASS for `shared/`**

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: PASS. No errors. The type-test file acts as the verification that all utility types work.

- [ ] **Step 4: Deliberately break the contract to confirm the guard catches drift**

Temporarily edit `shared/ipc-contract.type-test.ts` line containing `_EchoIsString` to check `Promise<number>` instead of `Promise<string>`. Save.

Run:
```bash
npx tsc --noEmit -p tsconfig.node.json --composite false
```
Expected: FAIL — error on the `Assert` line saying `Type 'false' does not satisfy the constraint 'true'`.

Revert the edit so the test passes again:

```bash
git diff shared/ipc-contract.type-test.ts
```
Expected: no diff after revert. Re-run typecheck — PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-01): export IpcChannelName and IpcClient utility types with type-level tests"
```

---

## Plan 1 Wrap-up

After Task 8, the repo should have:
- 5 new runtime deps in `package.json`
- New empty dirs: `electron/{ipc,services}/`, `preload/`, `src/{stores,ipc,i18n}/`
- `shared/ipc-contract.ts` with `IpcOk`/`IpcErr`/`IpcResult`/`IpcError`/`IpcErrorCode`/`IpcContract`/`IpcChannelName`/`IpcClient`
- `shared/ipc-contract.type-test.ts` as a compile-time contract guard
- `tsconfig.*.json` with strict mode + `@/` and `@shared/` aliases
- `electron.vite.config.ts` pointing at `electron/main.ts` / `preload/preload.ts` / `src/index.html` (which do not exist yet — that is expected; Plan 2/3 creates them)

`npm run dev` will fail until Plan 3 lands — that is by design. `npx tsc --noEmit -p tsconfig.node.json --composite false` should PASS after every task.

Next plan: Plan 2 (tasks 3.1–4.4) implements the main-process IPC router and the preload bridge.
