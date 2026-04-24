# Phase-02 Project Picker & Grove — Plan 1/2 (Tasks 1.1–5.3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the main-process backbone for multi-grove support — IPC contract, filesystem services (recent list, instance lockfile, grove init/open/close), startup decision pipeline with 2s timeout, and the renderer-side grove store that subscribes to `project:changed`.

**Architecture:** All filesystem I/O runs in the main process under `electron/services/*`; handlers live under `electron/ipc/project.ts` and delegate to services. The main process pushes `project:changed` via `webContents.send`; the renderer `grove` store subscribes through `window.api.project.onChanged`. `recent-projects.json` (user-scoped) lives in `~/.acornvo/`; `project.json` + `.lock` (grove-scoped) live in `<grove>/.acornvo/`. Startup decision — auto-open first valid recent vs. show Picker — is raced against a 2 s timeout so a slow filesystem never blocks the window.

**Tech Stack:** Electron 39, Node 22 (`fs/promises`, `os`, `path`, `crypto`), TypeScript 5.9, Zod 3, uuid v9, Zustand 5, React 19. No test runner is configured in this repo — verification uses `npm run typecheck`, `npm run lint`, and ad-hoc Node smoke scripts run with `npx tsx` and dev-mode manual checks.

---

## File Structure Map

| Path | Role | Plan |
|------|------|------|
| `shared/ipc-contract.ts` | Extend with `project` namespace + event channels | This plan |
| `shared/grove.ts` | Domain types (`Grove`, `RecentItem`, `LockInfo`, `SyncProvider`) | This plan |
| `shared/schemas/project.ts` | Zod schemas for `project.json` + `recent-projects.json` | This plan |
| `electron/services/paths.ts` | Resolver for `~/.acornvo/*` and `<grove>/.acornvo/*` | This plan |
| `electron/services/atomicWrite.ts` | Atomic JSON write (tmp + rename) with `0600` perm option | This plan |
| `electron/services/recent.ts` | `recent-projects.json` CRUD | This plan |
| `electron/services/lockfile.ts` | `.lock` acquire/release + liveness probe | This plan |
| `electron/services/grove.ts` | initialize / create / open / close / detectSyncDir / onChange | This plan |
| `electron/ipc/project.ts` | IPC handlers delegating to services | This plan |
| `electron/ipc/handlers.ts` | Merge `projectHandlers` into `ipcHandlers` map | This plan |
| `electron/main.ts` | Add `bootstrap:ready` push, `will-quit` lock release, 2s race | This plan |
| `preload/preload.ts` | Expose `api.project.*` + event subscriber | This plan |
| `src/stores/grove.ts` | Zustand slice + actions + `project:changed` subscriber | This plan |
| `src/pages/ProjectPicker.tsx` | Placeholder page reading bootstrap state | This plan (stub only; full UI in Plan 2) |
| `src/pages/ProjectPicker.tsx` | Full two-column layout with cards & buttons | Plan 2 |
| `src/components/GroveSwitcher.tsx` | TitleBar dropdown switcher | Plan 2 |
| `src/components/TakeoverDialog.tsx` | Force-takeover modal | Plan 2 |
| `src/components/AcornLogo.tsx` | Brand SVG | Plan 2 |

---

## Shared Conventions

- **Path alias:** `@/` → `src/`, `@shared/` → `shared/` (already wired in `tsconfig.web.json` / `tsconfig.node.json`). Do not introduce new aliases.
- **Error codes:** use the `IpcErrorCode` union in `shared/ipc-contract.ts`. If a new code is needed, extend the union in the same task that first uses it.
- **Atomic writes:** every file in `~/.acornvo/` and `<grove>/.acornvo/` is written via `atomicWrite` (tmp file + `fs.rename`). Never `writeFile` directly.
- **Logging:** `logger` comes from `electron/services/logger.ts`. Every service method that mutates filesystem logs at `info`; every caught error logs at `error`.
- **Commit style:** `feat(phase-02): <summary>` or `chore(phase-02): <summary>` — matches the phase-01 convention already on main.

---

<!-- openspec-task: 1.1 -->
### Task 1: Extend IPC contract with `project` namespace

**Files:**
- Modify: `shared/ipc-contract.ts` (add `project` methods, `E_LOCKED` + `E_EXISTS` error codes)
- Modify: `shared/ipc-contract.type-test.ts` (add compile-time assertions for the new shape)

- [ ] **Step 1: Add new error codes**

Replace the `IpcErrorCode` union in `shared/ipc-contract.ts`:

```typescript
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
```

- [ ] **Step 2: Import shared grove types (forward reference)**

Because Task 4 creates `shared/grove.ts`, use a local forward-reference type alias in this task so the contract compiles. Add near the top of `shared/ipc-contract.ts`:

```typescript
// Forward declarations — real shapes land in shared/grove.ts (Task 4).
// Keep these mirror types in sync.
type GroveColor = 'acorn' | 'leaf' | 'berry' | 'sky'

export type GroveSummary = {
  id: string
  path: string
  name: string
  color: GroveColor
  sync_warning?: string | null
}

export type RecentItemDto = {
  id: string
  path: string
  name: string
  color: GroveColor
  pinned: boolean
  last_opened_at: string
  files_count: number
  valid: boolean
}

export type LockHolderDto = {
  pid: number
  hostname: string
  started_at: string
}

export type OpenGroveResult =
  | { status: 'opened'; grove: GroveSummary }
  | { status: 'locked'; holder: LockHolderDto }

export type SelectDirectoryPurpose = 'open' | 'createParent'
```

- [ ] **Step 3: Add `project` to `IpcContract`**

Extend `IpcContract`:

```typescript
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
  project: {
    listRecent: () => RecentItemDto[]
    createGrove: (parentDir: string, name: string) => GroveSummary
    openGrove: (path: string, opts?: { force?: boolean }) => OpenGroveResult
    closeGrove: () => void
    getCurrent: () => GroveSummary | null
    removeFromRecent: (id: string) => void
    selectDirectory: (purpose: SelectDirectoryPurpose) => string | null
  }
}
```

- [ ] **Step 4: Add compile-time assertions**

Append to `shared/ipc-contract.type-test.ts`:

```typescript
import type {
  IpcClient as _IpcClient2,
  IpcContract as _IpcContract2,
  OpenGroveResult,
  RecentItemDto
} from './ipc-contract'

type _ListRecentReturn = Assert<
  ReturnType<_IpcClient2<_IpcContract2>['project']['listRecent']> extends Promise<RecentItemDto[]>
    ? true
    : false
>

type _OpenGroveReturn = Assert<
  ReturnType<_IpcClient2<_IpcContract2>['project']['openGrove']> extends Promise<OpenGroveResult>
    ? true
    : false
>

type _GetCurrentReturn = Assert<
  ReturnType<_IpcClient2<_IpcContract2>['project']['getCurrent']> extends Promise<
    import('./ipc-contract').GroveSummary | null
  >
    ? true
    : false
>

export type _ProjectExports =
  | _ListRecentReturn
  | _OpenGroveReturn
  | _GetCurrentReturn
```

- [ ] **Step 5: Verify typecheck fails only where we expect (or passes)**

Run:
```bash
npm run typecheck
```
Expected: PASS. Any failure means the contract or type-test has drifted — fix before moving on.

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-02): add project namespace + error codes to IPC contract"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: Declare `project:changed` event channel

**Files:**
- Modify: `shared/ipc-contract.ts` (add `IpcEventContract` + subscriber type)
- Modify: `shared/ipc-contract.type-test.ts` (assert event subscriber signature)

- [ ] **Step 1: Add event contract type**

Append to `shared/ipc-contract.ts`:

```typescript
/**
 * Main-to-renderer push events. The renderer subscribes via `window.api.on(channel, handler)`.
 * Event channel names follow `<namespace>:<event>` (colon) so they never collide with
 * request channels which use `<namespace>.<method>` (dot).
 */
export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': {
    initialRoute: '/picker' | '/library'
    recent: RecentItemDto[]
    locked?: { path: string; holder: LockHolderDto }
  }
}

export type IpcEventChannel = keyof IpcEventContract

export type IpcEventApi = {
  on<K extends IpcEventChannel>(
    channel: K,
    handler: (payload: IpcEventContract[K]) => void
  ): () => void // unsubscribe
}
```

- [ ] **Step 2: Add type-test assertion**

Append to `shared/ipc-contract.type-test.ts`:

```typescript
import type { IpcEventApi, IpcEventChannel } from './ipc-contract'

type _EventChannelUnion = Assert<
  IpcEventChannel extends 'project:changed' | 'bootstrap:ready' ? true : false
>

declare const _eventApi: IpcEventApi
const _unsub = _eventApi.on('project:changed', (payload) => {
  // payload is GroveSummary | null — accessing .id on non-null is allowed only after narrowing
  if (payload) {
    const _id: string = payload.id
    void _id
  }
})
void _unsub

export type _EventExports = _EventChannelUnion
```

- [ ] **Step 3: Verify typecheck passes**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-02): declare project:changed and bootstrap:ready event channels"
```

---

<!-- openspec-task: 1.3 -->
### Task 3: Add runtime dependencies `uuid` + `zod`

**Files:**
- Modify: `package.json` (dependencies) + `package-lock.json`

- [ ] **Step 1: Install packages**

Run:
```bash
npm install uuid zod
npm install --save-dev @types/uuid
```
Expected: exit 0; `uuid` and `zod` appear in `dependencies`, `@types/uuid` in `devDependencies`.

- [ ] **Step 2: Verify resolution**

Run:
```bash
node -e "console.log(require('uuid/package.json').version, require('zod/package.json').version)"
```
Expected: two version strings print; neither throws.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(phase-02): add uuid and zod dependencies"
```

---

<!-- openspec-task: 1.4 -->
### Task 4: Extract grove domain types to `shared/grove.ts`

**Files:**
- Create: `shared/grove.ts`
- Modify: `shared/ipc-contract.ts` (replace forward-reference types with re-exports from `shared/grove.ts`)

- [ ] **Step 1: Create `shared/grove.ts`**

```typescript
/**
 * Grove (vault) domain types — shared across main, preload, and renderer.
 * All fields mirror the on-disk schema (see `shared/schemas/project.ts`).
 */

export type GroveColor = 'acorn' | 'leaf' | 'berry' | 'sky'

export const GROVE_COLORS: readonly GroveColor[] = ['acorn', 'leaf', 'berry', 'sky']

export type SyncProvider =
  | 'iCloud'
  | 'Dropbox'
  | 'OneDrive'
  | 'GoogleDrive'
  | 'Nextcloud'
  | 'pCloud'

export interface Grove {
  id: string
  path: string
  name: string
  color: GroveColor
  schema_version: number
  created_at: string
  last_opened_at: string
  sync_warning?: SyncProvider | null
}

export interface RecentItem {
  id: string
  path: string
  name: string
  color: GroveColor
  pinned: boolean
  last_opened_at: string
  files_count: number
}

export interface LockInfo {
  pid: number
  hostname: string
  started_at: string
}

export interface GroveSummary {
  id: string
  path: string
  name: string
  color: GroveColor
  sync_warning?: SyncProvider | null
}

export interface RecentItemView extends RecentItem {
  valid: boolean
}

export type OpenGroveOutcome =
  | { status: 'opened'; grove: GroveSummary }
  | { status: 'locked'; holder: LockInfo }
```

- [ ] **Step 2: Replace forward types in `shared/ipc-contract.ts`**

In `shared/ipc-contract.ts`, remove the local `GroveColor`, `GroveSummary`, `RecentItemDto`, `LockHolderDto`, `OpenGroveResult` declarations added in Task 1. Replace them with re-exports from `shared/grove.ts`:

```typescript
export type {
  GroveColor,
  GroveSummary,
  RecentItem as RecentItemDto_DEPRECATED, // removed in next line, kept only to explain delta
  LockInfo as LockHolderDto
} from './grove'

import type {
  GroveSummary,
  LockInfo,
  RecentItemView,
  OpenGroveOutcome
} from './grove'
```

Then adjust `IpcContract.project` and `IpcEventContract` to reference the canonical names:

```typescript
  project: {
    listRecent: () => RecentItemView[]
    createGrove: (parentDir: string, name: string) => GroveSummary
    openGrove: (path: string, opts?: { force?: boolean }) => OpenGroveOutcome
    closeGrove: () => void
    getCurrent: () => GroveSummary | null
    removeFromRecent: (id: string) => void
    selectDirectory: (purpose: SelectDirectoryPurpose) => string | null
  }

// ...

export type IpcEventContract = {
  'project:changed': GroveSummary | null
  'bootstrap:ready': {
    initialRoute: '/picker' | '/library'
    recent: RecentItemView[]
    locked?: { path: string; holder: LockInfo }
  }
}
```

Clean up: delete the temporary `RecentItemDto_DEPRECATED` export line and also delete the `OpenGroveResult` type alias (consumers now use `OpenGroveOutcome`).

- [ ] **Step 3: Update type-test references**

In `shared/ipc-contract.type-test.ts`, replace `RecentItemDto` with `RecentItemView` and `OpenGroveResult` with `OpenGroveOutcome` in the new assertions added in Task 1:

```typescript
import type { RecentItemView, OpenGroveOutcome } from './grove'

type _ListRecentReturn = Assert<
  ReturnType<_IpcClient2<_IpcContract2>['project']['listRecent']> extends Promise<RecentItemView[]>
    ? true
    : false
>

type _OpenGroveReturn = Assert<
  ReturnType<_IpcClient2<_IpcContract2>['project']['openGrove']> extends Promise<OpenGroveOutcome>
    ? true
    : false
>
```

- [ ] **Step 4: Verify typecheck passes**

Run:
```bash
npm run typecheck
```
Expected: PASS. Any TS error means a leftover reference to the removed forward types — delete or rename.

- [ ] **Step 5: Commit**

```bash
git add shared/grove.ts shared/ipc-contract.ts shared/ipc-contract.type-test.ts
git commit -m "feat(phase-02): extract grove domain types to shared/grove.ts"
```

---

<!-- openspec-task: 1.4 -->
### Task 5: Define Zod schemas for on-disk JSON

**Files:**
- Create: `shared/schemas/project.ts`

- [ ] **Step 1: Write schemas**

```typescript
import { z } from 'zod'

export const GroveColorSchema = z.enum(['acorn', 'leaf', 'berry', 'sky'])

export const SyncProviderSchema = z.enum([
  'iCloud',
  'Dropbox',
  'OneDrive',
  'GoogleDrive',
  'Nextcloud',
  'pCloud'
])

export const ProjectJsonSchema = z.object({
  id: z.string().uuid(),
  schema_version: z.literal(1),
  name: z.string().min(1).max(120),
  color: GroveColorSchema,
  created_at: z.string().datetime({ offset: true }),
  last_opened_at: z.string().datetime({ offset: true }),
  sync_warning: SyncProviderSchema.nullable().optional()
})

export type ProjectJson = z.infer<typeof ProjectJsonSchema>

export const RecentItemSchema = z.object({
  id: z.string().uuid(),
  path: z.string().min(1),
  name: z.string().min(1),
  color: GroveColorSchema,
  pinned: z.boolean(),
  last_opened_at: z.string().datetime({ offset: true }),
  files_count: z.number().int().nonnegative()
})

export const RecentProjectsFileSchema = z.object({
  schema_version: z.literal(1),
  items: z.array(RecentItemSchema)
})

export type RecentProjectsFile = z.infer<typeof RecentProjectsFileSchema>

export const LockInfoSchema = z.object({
  pid: z.number().int().positive(),
  hostname: z.string().min(1),
  started_at: z.string().datetime({ offset: true })
})

export type LockInfoFile = z.infer<typeof LockInfoSchema>
```

- [ ] **Step 2: Verify schemas compile and parse a valid example**

Create a throwaway smoke script `scripts/smoke-schemas.ts`:

```typescript
import {
  ProjectJsonSchema,
  RecentProjectsFileSchema,
  LockInfoSchema
} from '../shared/schemas/project'

const p = ProjectJsonSchema.parse({
  id: '00000000-0000-4000-8000-000000000000',
  schema_version: 1,
  name: '测试',
  color: 'acorn',
  created_at: '2026-04-23T10:00:00.000Z',
  last_opened_at: '2026-04-23T10:00:00.000Z'
})

const r = RecentProjectsFileSchema.parse({ schema_version: 1, items: [] })
const l = LockInfoSchema.parse({
  pid: 12345,
  hostname: 'mbp',
  started_at: '2026-04-23T10:00:00.000Z'
})
console.log('OK', p.id, r.items.length, l.pid)
```

Run:
```bash
npx tsx scripts/smoke-schemas.ts
```
Expected: prints `OK 00000000-0000-4000-8000-000000000000 0 12345`; exit 0.

Then delete the smoke script — keep it out of version control:
```bash
rm scripts/smoke-schemas.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add shared/schemas/project.ts
git commit -m "feat(phase-02): define zod schemas for project.json and recent-projects.json"
```

---

<!-- openspec-task: 2.1 -->
### Task 6: Path resolver + atomic write utility

**Files:**
- Create: `electron/services/paths.ts`
- Create: `electron/services/atomicWrite.ts`

- [ ] **Step 1: Write `paths.ts`**

```typescript
import { homedir } from 'node:os'
import { join } from 'node:path'

/** User-scoped acornvo directory: `~/.acornvo`. */
export function userAcornDir(): string {
  return join(homedir(), '.acornvo')
}

/** Path to the recent-projects file. */
export function recentProjectsFile(): string {
  return join(userAcornDir(), 'recent-projects.json')
}

/** `<grove>/.acornvo`. */
export function groveAcornDir(grovePath: string): string {
  return join(grovePath, '.acornvo')
}

export function groveProjectFile(grovePath: string): string {
  return join(groveAcornDir(grovePath), 'project.json')
}

export function groveLockFile(grovePath: string): string {
  return join(groveAcornDir(grovePath), '.lock')
}

export function groveInboxDir(grovePath: string): string {
  return join(grovePath, 'inbox')
}

export function groveAssetsDir(grovePath: string): string {
  return join(grovePath, 'assets')
}
```

- [ ] **Step 2: Write `atomicWrite.ts`**

```typescript
import { writeFile, rename, mkdir, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface AtomicWriteOptions {
  /** Octal file mode to apply after write, e.g. 0o600 for lockfiles. */
  mode?: number
  /** If true (default), `mkdir -p` the parent directory before writing. */
  ensureDir?: boolean
}

/**
 * Write `data` to `path` atomically: write to a sibling tmp file, then rename.
 * A crash before the rename leaves the original file untouched.
 */
export async function atomicWriteFile(
  path: string,
  data: string | Uint8Array,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  const { mode, ensureDir = true } = opts
  if (ensureDir) {
    await mkdir(dirname(path), { recursive: true })
  }
  const tmp = `${path}.tmp-${randomUUID()}`
  await writeFile(tmp, data)
  if (mode !== undefined) {
    try {
      await chmod(tmp, mode)
    } catch {
      // chmod on Windows NTFS is a no-op — swallow.
    }
  }
  await rename(tmp, path)
}

export async function atomicWriteJson(
  path: string,
  value: unknown,
  opts: AtomicWriteOptions = {}
): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(value, null, 2) + '\n', opts)
}
```

- [ ] **Step 3: Verify with a quick smoke**

Create `scripts/smoke-atomic.ts`:

```typescript
import { atomicWriteJson } from '../electron/services/atomicWrite'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const target = join(tmpdir(), `acornvo-smoke-${Date.now()}.json`)
await atomicWriteJson(target, { hello: 'world' })
const back = JSON.parse(await readFile(target, 'utf8'))
console.log('OK', back.hello === 'world')
await rm(target)
```

Run:
```bash
npx tsx scripts/smoke-atomic.ts
```
Expected: prints `OK true`.

Delete:
```bash
rm scripts/smoke-atomic.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add electron/services/paths.ts electron/services/atomicWrite.ts
git commit -m "feat(phase-02): add path resolver and atomic JSON write utility"
```

---

<!-- openspec-task: 2.1 -->
### Task 7: `recent.ts` service — load / save / upsert / remove

**Files:**
- Create: `electron/services/recent.ts`

- [ ] **Step 1: Write the service**

```typescript
import { readFile } from 'node:fs/promises'
import type { RecentItem } from '@shared/grove'
import {
  RecentProjectsFileSchema,
  type RecentProjectsFile
} from '@shared/schemas/project'
import { atomicWriteJson } from './atomicWrite'
import { recentProjectsFile } from './paths'
import { logger } from './logger'

const EMPTY_FILE: RecentProjectsFile = { schema_version: 1, items: [] }

async function readRaw(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw err
  }
}

/** Load recent-projects.json. Missing / malformed → empty list (with backup on corrupt). */
export async function load(): Promise<RecentProjectsFile> {
  const path = recentProjectsFile()
  const raw = await readRaw(path)
  if (raw === null) return { ...EMPTY_FILE, items: [] }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    await backupCorrupt(path, raw, 'parse-error')
    logger.warn('recent-projects.json failed to parse; reset to empty', {
      message: err instanceof Error ? err.message : String(err)
    })
    return { ...EMPTY_FILE, items: [] }
  }

  const result = RecentProjectsFileSchema.safeParse(parsed)
  if (!result.success) {
    await backupCorrupt(path, raw, 'schema-error')
    logger.warn('recent-projects.json failed schema validation; reset to empty', {
      issues: result.error.issues.map((i) => i.path.join('.') + ':' + i.code)
    })
    return { ...EMPTY_FILE, items: [] }
  }
  return result.data
}

async function backupCorrupt(path: string, raw: string, reason: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${path}.bak-${stamp}`
  try {
    await atomicWriteJson(backup, { reason, raw })
  } catch (err) {
    logger.error('failed to backup corrupt recent-projects.json', {
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

export async function save(file: RecentProjectsFile): Promise<void> {
  await atomicWriteJson(recentProjectsFile(), file)
}

/** Upsert an item to the top; if present by id, move to position 0 with updated fields. */
export async function upsertToTop(item: RecentItem): Promise<void> {
  const file = await load()
  const rest = file.items.filter((i) => i.id !== item.id)
  const next: RecentProjectsFile = {
    schema_version: 1,
    items: [item, ...rest]
  }
  await save(next)
}

export async function removeById(id: string): Promise<void> {
  const file = await load()
  const next: RecentProjectsFile = {
    schema_version: 1,
    items: file.items.filter((i) => i.id !== id)
  }
  await save(next)
}
```

- [ ] **Step 2: Smoke-test load/save roundtrip**

Create `scripts/smoke-recent.ts`:

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { load, save, upsertToTop, removeById } from '../electron/services/recent'

// Point HOME at a scratch dir so ~/.acornvo lives there
const scratch = join(tmpdir(), `acornvo-recent-${Date.now()}`)
await mkdir(scratch, { recursive: true })
process.env.HOME = scratch
process.env.USERPROFILE = scratch

const empty = await load()
console.log('empty', empty.items.length === 0)

await upsertToTop({
  id: '11111111-1111-4111-8111-111111111111',
  path: '/tmp/a',
  name: 'A',
  color: 'acorn',
  pinned: false,
  last_opened_at: new Date().toISOString(),
  files_count: 0
})
const one = await load()
console.log('after upsert', one.items.length === 1, one.items[0].id.startsWith('11111111'))

await removeById('11111111-1111-4111-8111-111111111111')
const gone = await load()
console.log('after remove', gone.items.length === 0)

await rm(scratch, { recursive: true, force: true })
```

Run:
```bash
npx tsx scripts/smoke-recent.ts
```
Expected: prints three `true` lines. Delete the script.

```bash
rm scripts/smoke-recent.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/recent.ts
git commit -m "feat(phase-02): recent-projects.json service with corrupt-file backup"
```

---

<!-- openspec-task: 2.2 -->
### Task 8: `lockfile.ts` service — acquire / release / liveness probe

**Files:**
- Create: `electron/services/lockfile.ts`

- [ ] **Step 1: Write the service**

```typescript
import { readFile, unlink } from 'node:fs/promises'
import { hostname } from 'node:os'
import type { LockInfo } from '@shared/grove'
import { LockInfoSchema } from '@shared/schemas/project'
import { atomicWriteJson } from './atomicWrite'
import { groveLockFile, groveAcornDir } from './paths'
import { mkdir } from 'node:fs/promises'
import { logger } from './logger'

export type AcquireOutcome =
  | { status: 'acquired' }
  | { status: 'held'; holder: LockInfo }

async function readLock(path: string): Promise<LockInfo | null> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    const result = LockInfoSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** `process.kill(pid, 0)` probe. Returns true if the pid appears to be alive. */
function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    // EPERM: process exists but we can't signal it — still alive.
    if (code === 'EPERM') return true
    // ESRCH: no such process.
    return false
  }
}

function isStale(lock: LockInfo): boolean {
  if (lock.hostname !== hostname()) return true // different machine → stale
  return !isAlive(lock.pid)
}

/**
 * Try to acquire the lock for `grovePath`. If held by an alive process on this
 * host, return the holder without writing. If stale or missing, overwrite.
 * When `force` is true, always overwrite.
 */
export async function acquire(
  grovePath: string,
  opts: { force?: boolean } = {}
): Promise<AcquireOutcome> {
  const lockPath = groveLockFile(grovePath)
  const existing = await readLock(lockPath)
  if (existing && !isStale(existing) && !opts.force) {
    return { status: 'held', holder: existing }
  }
  await mkdir(groveAcornDir(grovePath), { recursive: true })
  const info: LockInfo = {
    pid: process.pid,
    hostname: hostname(),
    started_at: new Date().toISOString()
  }
  await atomicWriteJson(lockPath, info, { mode: 0o600 })
  if (existing && opts.force) {
    logger.warn('force-acquired grove lock', { grove: grovePath, previous: existing })
  }
  return { status: 'acquired' }
}

/** Release the lock for `grovePath`. Swallows ENOENT. */
export async function release(grovePath: string): Promise<void> {
  try {
    await unlink(groveLockFile(grovePath))
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return
    logger.warn('failed to release lock', { grove: grovePath, code })
  }
}
```

- [ ] **Step 2: Smoke-test acquire/release**

Create `scripts/smoke-lock.ts`:

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { acquire, release } from '../electron/services/lockfile'

const grove = join(tmpdir(), `acornvo-lock-${Date.now()}`)
await mkdir(join(grove, '.acornvo'), { recursive: true })

const a = await acquire(grove)
console.log('acquired once', a.status === 'acquired')

// Simulate a stale lock from a dead pid (0 is never valid)
await writeFile(
  join(grove, '.acornvo', '.lock'),
  JSON.stringify({ pid: 0, hostname: 'other-machine', started_at: new Date().toISOString() })
)
const b = await acquire(grove)
console.log('stale overwritten', b.status === 'acquired')

// Acquire while our live pid still holds it → should report held
const c = await acquire(grove)
console.log('held by self', c.status === 'held')

await release(grove)
const d = await acquire(grove)
console.log('re-acquired after release', d.status === 'acquired')

await release(grove)
await rm(grove, { recursive: true, force: true })
```

Run:
```bash
npx tsx scripts/smoke-lock.ts
```
Expected: four `true` lines. Delete the script.

```bash
rm scripts/smoke-lock.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/lockfile.ts
git commit -m "feat(phase-02): grove lockfile service with liveness probe"
```

---

<!-- openspec-task: 2.3 -->
### Task 9: `grove.ts` service — `initialize` + `detectSyncDir`

**Files:**
- Create: `electron/services/grove.ts` (initial file — more methods added in Tasks 10 & 11)

- [ ] **Step 1: Write the first cut**

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename } from 'node:path'
import { v4 as uuidv4 } from 'uuid'
import { ProjectJsonSchema, type ProjectJson } from '@shared/schemas/project'
import type { Grove, GroveColor, SyncProvider } from '@shared/grove'
import { atomicWriteJson } from './atomicWrite'
import {
  groveAcornDir,
  groveAssetsDir,
  groveInboxDir,
  groveProjectFile
} from './paths'
import { logger } from './logger'

const DEFAULT_COLOR: GroveColor = 'acorn'

const SYNC_PATTERNS: Array<{ re: RegExp; provider: SyncProvider }> = [
  { re: /(?:^|\/)(?:iCloud(?:\s|~|Drive)|Mobile Documents|com~apple~CloudDocs)/i, provider: 'iCloud' },
  { re: /(?:^|\/)Dropbox(?:\/|$|\s)/i, provider: 'Dropbox' },
  { re: /(?:^|\/)OneDrive(?:\/|$|\s|-)/i, provider: 'OneDrive' },
  { re: /(?:^|\/)Google\s*Drive(?:\/|$)/i, provider: 'GoogleDrive' },
  { re: /(?:^|\/)Nextcloud(?:\/|$)/i, provider: 'Nextcloud' },
  { re: /(?:^|\/)pCloud(?:\/|$)/i, provider: 'pCloud' }
]

export function detectSyncDir(absPath: string): SyncProvider | null {
  for (const { re, provider } of SYNC_PATTERNS) {
    if (re.test(absPath)) return provider
  }
  return null
}

async function ensureFile(path: string, content: string | Uint8Array): Promise<void> {
  try {
    await readFile(path)
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      await writeFile(path, content)
      return
    }
    throw err
  }
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

async function readProjectJson(path: string): Promise<ProjectJson | 'missing' | 'corrupt'> {
  let raw: string
  try {
    raw = await readFile(groveProjectFile(path), 'utf8')
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return 'missing'
    throw err
  }
  try {
    const parsed = JSON.parse(raw)
    const result = ProjectJsonSchema.safeParse(parsed)
    if (!result.success) return 'corrupt'
    return result.data
  } catch {
    return 'corrupt'
  }
}

async function backupProjectJson(grovePath: string, raw?: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${groveProjectFile(grovePath)}.bak-${stamp}`
  const current = raw ?? (await readFile(groveProjectFile(grovePath), 'utf8').catch(() => ''))
  await writeFile(backup, current)
}

export interface InitializeResult {
  project: ProjectJson
  createdFresh: boolean
  syncProvider: SyncProvider | null
}

/**
 * Idempotent initializer. Creates `.acornvo/`, `project.json`, `inbox/`, `assets/`,
 * `.nosync`, `.icloud`. Never overwrites a valid `project.json` — corrupt files are
 * backed up and rewritten. Returns whether the project was freshly created.
 */
export async function initialize(grovePath: string): Promise<InitializeResult> {
  await ensureDir(groveAcornDir(grovePath))
  await ensureDir(groveInboxDir(grovePath))
  await ensureDir(groveAssetsDir(grovePath))
  // Placeholders that help cloud-sync clients exclude `.acornvo/`.
  await ensureFile(`${groveAcornDir(grovePath)}/.nosync`, '')
  await ensureFile(`${groveAcornDir(grovePath)}/.icloud`, '')

  const syncProvider = detectSyncDir(grovePath)
  const existing = await readProjectJson(grovePath)

  if (existing === 'corrupt') {
    await backupProjectJson(grovePath)
    logger.warn('project.json corrupt; backing up and rewriting', { grove: grovePath })
  }

  if (existing !== 'missing' && existing !== 'corrupt') {
    // Healthy — may need to refresh sync_warning only.
    if (existing.sync_warning !== syncProvider) {
      const next: ProjectJson = { ...existing, sync_warning: syncProvider }
      await atomicWriteJson(groveProjectFile(grovePath), next)
      return { project: next, createdFresh: false, syncProvider }
    }
    return { project: existing, createdFresh: false, syncProvider }
  }

  const now = new Date().toISOString()
  const fresh: ProjectJson = {
    id: uuidv4(),
    schema_version: 1,
    name: basename(grovePath) || 'grove',
    color: DEFAULT_COLOR,
    created_at: now,
    last_opened_at: now,
    sync_warning: syncProvider
  }
  await atomicWriteJson(groveProjectFile(grovePath), fresh)
  logger.info('grove initialized', {
    grove: grovePath,
    id: fresh.id,
    sync_warning: syncProvider
  })
  return { project: fresh, createdFresh: true, syncProvider }
}

export function toGrove(grovePath: string, project: ProjectJson): Grove {
  return {
    id: project.id,
    path: grovePath,
    name: project.name,
    color: project.color,
    schema_version: project.schema_version,
    created_at: project.created_at,
    last_opened_at: project.last_opened_at,
    sync_warning: project.sync_warning ?? null
  }
}
```

- [ ] **Step 2: Smoke-test initialize + detectSyncDir**

Create `scripts/smoke-grove-init.ts`:

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { initialize, detectSyncDir } from '../electron/services/grove'

// detectSyncDir cases
console.log(
  'iCloud',
  detectSyncDir('/Users/foo/Library/Mobile Documents/com~apple~CloudDocs/My') === 'iCloud'
)
console.log('Dropbox', detectSyncDir('/Users/foo/Dropbox/Notes') === 'Dropbox')
console.log('plain', detectSyncDir('/Users/foo/Documents/grove') === null)

// Fresh initialize
const grove = join(tmpdir(), `grove-${Date.now()}`)
await mkdir(grove, { recursive: true })
const fresh = await initialize(grove)
console.log('fresh', fresh.createdFresh === true, fresh.project.id.length === 36)

// Idempotent second call
const again = await initialize(grove)
console.log('idempotent', again.createdFresh === false, again.project.id === fresh.project.id)

// Corrupt file recovery
await writeFile(join(grove, '.acornvo', 'project.json'), 'not-json')
const recovered = await initialize(grove)
console.log('recovered', recovered.createdFresh === true)

await rm(grove, { recursive: true, force: true })
```

Run:
```bash
npx tsx scripts/smoke-grove-init.ts
```
Expected: six `true` lines.

```bash
rm scripts/smoke-grove-init.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/grove.ts
git commit -m "feat(phase-02): grove.initialize + detectSyncDir with idempotent recovery"
```

---

<!-- openspec-task: 2.3 -->
### Task 10: `grove.ts` — `createGrove`

**Files:**
- Modify: `electron/services/grove.ts` (append `createGrove`)

- [ ] **Step 1: Append the function**

Add these imports at the top if not yet present:

```typescript
import { access, constants } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcError } from '@shared/ipc-contract'
```

Append to the file:

```typescript
const VALID_NAME = /^[^\\/:*?"<>|\x00]+$/

async function isWritable(dir: string): Promise<boolean> {
  try {
    await access(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/**
 * Create a new grove under `parentDir` with directory name `name`.
 * Fails if the parent is not writable, the name is invalid, or the target
 * already exists.
 */
export async function createGrove(parentDir: string, name: string): Promise<Grove> {
  const trimmed = name.trim()
  if (!trimmed || !VALID_NAME.test(trimmed)) {
    throw new IpcError('E_INVALID_ARGS', `invalid grove name: ${JSON.stringify(name)}`)
  }
  if (!(await isWritable(parentDir))) {
    throw new IpcError('E_PERMISSION', `parent directory is not writable`)
  }
  const target = join(parentDir, trimmed)
  if (await pathExists(target)) {
    throw new IpcError('E_EXISTS', `a file or directory already exists at the target`)
  }
  await mkdir(target, { recursive: false })
  const { project } = await initialize(target)
  logger.info('grove created', { grove: target, id: project.id })
  return toGrove(target, project)
}
```

- [ ] **Step 2: Smoke-test**

Create `scripts/smoke-grove-create.ts`:

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { createGrove } from '../electron/services/grove'
import { IpcError } from '../shared/ipc-contract'

const parent = join(tmpdir(), `parent-${Date.now()}`)
await mkdir(parent, { recursive: true })

const g = await createGrove(parent, '我的树林')
console.log('created', g.name === '我的树林', g.id.length === 36)

// Duplicate → E_EXISTS
try {
  await createGrove(parent, '我的树林')
  console.log('duplicate-rejected', false)
} catch (err) {
  console.log('duplicate-rejected', err instanceof IpcError && err.code === 'E_EXISTS')
}

// Invalid name (contains slash) → E_INVALID_ARGS
try {
  await createGrove(parent, 'bad/name')
  console.log('invalid-rejected', false)
} catch (err) {
  console.log('invalid-rejected', err instanceof IpcError && err.code === 'E_INVALID_ARGS')
}

await rm(parent, { recursive: true, force: true })
```

Run:
```bash
npx tsx scripts/smoke-grove-create.ts
```
Expected: four `true` lines.

```bash
rm scripts/smoke-grove-create.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add electron/services/grove.ts
git commit -m "feat(phase-02): grove.createGrove with validation and E_EXISTS guard"
```

---

<!-- openspec-task: 2.3 -->
### Task 11: `grove.ts` — `openGrove` / `closeGrove` with lock handling

**Files:**
- Modify: `electron/services/grove.ts` (append open/close + current state)

- [ ] **Step 1: Add imports at top if missing**

```typescript
import * as lockfile from './lockfile'
import type { GroveSummary, LockInfo, OpenGroveOutcome } from '@shared/grove'
```

- [ ] **Step 2: Append state + functions**

```typescript
let currentGrove: Grove | null = null

export function getCurrent(): Grove | null {
  return currentGrove
}

function toSummary(g: Grove): GroveSummary {
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}

export async function openGrove(
  path: string,
  opts: { force?: boolean } = {}
): Promise<OpenGroveOutcome> {
  if (!(await pathExists(path))) {
    throw new IpcError('E_NOT_FOUND', 'grove path does not exist')
  }

  // If we already hold another grove, release its lock first.
  if (currentGrove && currentGrove.path !== path) {
    await lockfile.release(currentGrove.path)
    currentGrove = null
    notifyChange(null)
  }

  const lockResult = await lockfile.acquire(path, { force: opts.force })
  if (lockResult.status === 'held') {
    return { status: 'locked', holder: lockResult.holder as LockInfo }
  }

  const initResult = await initialize(path)
  const now = new Date().toISOString()
  const refreshed: ProjectJson = { ...initResult.project, last_opened_at: now }
  await atomicWriteJson(groveProjectFile(path), refreshed)

  const grove = toGrove(path, refreshed)
  currentGrove = grove

  // Update recent list (imported lazily to avoid cycles at module init time).
  const recent = await import('./recent')
  await recent.upsertToTop({
    id: grove.id,
    path: grove.path,
    name: grove.name,
    color: grove.color,
    pinned: false,
    last_opened_at: now,
    files_count: 0
  })

  if (initResult.syncProvider) {
    logger.warn('grove on cloud-sync path', {
      grove: path,
      provider: initResult.syncProvider
    })
  }

  notifyChange(toSummary(grove))
  logger.info('grove opened', { grove: path, id: grove.id })
  return { status: 'opened', grove: toSummary(grove) }
}

export async function closeGrove(): Promise<void> {
  if (!currentGrove) return
  const path = currentGrove.path
  currentGrove = null
  await lockfile.release(path)
  notifyChange(null)
  logger.info('grove closed', { grove: path })
}

// --- change subscribers (wired up fully in Task 12) ---
type ChangeHandler = (payload: GroveSummary | null) => void
const changeHandlers = new Set<ChangeHandler>()
function notifyChange(payload: GroveSummary | null): void {
  for (const h of changeHandlers) {
    try {
      h(payload)
    } catch (err) {
      logger.error('project:changed handler threw', {
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}
export function onChange(handler: ChangeHandler): () => void {
  changeHandlers.add(handler)
  return () => {
    changeHandlers.delete(handler)
  }
}
```

- [ ] **Step 3: Smoke-test open/close**

Create `scripts/smoke-grove-open.ts`:

```typescript
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, rm } from 'node:fs/promises'
import { openGrove, closeGrove, getCurrent, onChange, createGrove } from '../electron/services/grove'

// Stub HOME so recent.ts writes to scratch
const scratch = join(tmpdir(), `grove-open-${Date.now()}`)
await mkdir(scratch, { recursive: true })
process.env.HOME = scratch
process.env.USERPROFILE = scratch

const parent = join(scratch, 'p')
await mkdir(parent, { recursive: true })

const events: Array<string | null> = []
const unsub = onChange((p) => events.push(p?.id ?? null))

const g = await createGrove(parent, 'gx')
const r1 = await openGrove(g.path)
console.log('opened', r1.status === 'opened', getCurrent()?.path === g.path)

// Second openGrove on same path returns opened (we hold the lock already? actually lockfile treats self-held as held; that is correct for re-entry from another attempt — we'll refresh below)
await closeGrove()
console.log('closed', getCurrent() === null)

const r2 = await openGrove(g.path)
console.log('reopened', r2.status === 'opened')

// Events fired: opened, closed (null), reopened → 3 entries
console.log('events', events.length === 3, events[1] === null)

unsub()
await closeGrove()
await rm(scratch, { recursive: true, force: true })
```

Run:
```bash
npx tsx scripts/smoke-grove-open.ts
```
Expected: four `true` lines.

```bash
rm scripts/smoke-grove-open.ts
rmdir scripts 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add electron/services/grove.ts
git commit -m "feat(phase-02): grove.openGrove / closeGrove with lock handoff and recent upsert"
```

---

<!-- openspec-task: 2.4 -->
### Task 12: Broadcast `project:changed` to all renderers via `webContents.send`

**Files:**
- Create: `electron/services/grove-broadcast.ts`
- Modify: `electron/main.ts` (wire broadcaster once renderers exist)

- [ ] **Step 1: Write the broadcaster**

```typescript
// electron/services/grove-broadcast.ts
import { webContents } from 'electron'
import type { GroveSummary } from '@shared/grove'
import { onChange } from './grove'
import { logger } from './logger'

const CHANNEL = 'project:changed'

/**
 * Subscribe to grove.onChange and fan out to every live `webContents`.
 * Returns an unsubscribe; call it at app shutdown.
 */
export function installGroveBroadcaster(): () => void {
  return onChange((payload: GroveSummary | null) => {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      try {
        wc.send(CHANNEL, payload)
      } catch (err) {
        logger.warn('project:changed send failed', {
          id: wc.id,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  })
}
```

- [ ] **Step 2: Wire it in `main.ts` after `registerHandlers`**

In `electron/main.ts`, add near other imports:

```typescript
import { installGroveBroadcaster } from './services/grove-broadcast'
```

Inside `bootstrap()` just after `registerHandlers(ipcHandlers)` add:

```typescript
  const disposeBroadcaster = installGroveBroadcaster()
  app.on('will-quit', disposeBroadcaster)
```

(Full integration with bootstrap pipeline happens in Task 19 — for now it's enough to wire the broadcaster.)

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/services/grove-broadcast.ts electron/main.ts
git commit -m "feat(phase-02): broadcast project:changed to all renderer webContents"
```

---

<!-- openspec-task: 2.5 -->
### Task 13: Release lock on `app.will-quit`

**Files:**
- Modify: `electron/main.ts` (add will-quit handler that closes the current grove)

- [ ] **Step 1: Import and wire handler**

In `electron/main.ts`:

```typescript
import * as groveService from './services/grove'
```

Inside `bootstrap()` after `installGroveBroadcaster()`:

```typescript
  app.on('will-quit', () => {
    void groveService.closeGrove().catch((err) => {
      logger.error('grove close on will-quit failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    })
  })
```

Note: `closeGrove()` is idempotent (returns immediately if no current grove) so registering this twice in dev mode is safe. `will-quit` fires after `before-quit`, so our existing `before-quit` lifecycle hook stays untouched.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-02): release grove lock on app will-quit"
```

---

<!-- openspec-task: 3.1 -->
### Task 14: IPC handler — `project.listRecent`

**Files:**
- Create: `electron/ipc/project.ts` (initial skeleton + listRecent)

- [ ] **Step 1: Write the module**

```typescript
import { existsSync } from 'node:fs'
import type { IpcContract } from '@shared/ipc-contract'
import type { RecentItemView } from '@shared/grove'
import * as recent from '../services/recent'

type ProjectHandlers = {
  [M in keyof IpcContract['project']]: IpcContract['project'][M] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

async function listRecent(): Promise<RecentItemView[]> {
  const file = await recent.load()
  return file.items.map((item) => ({
    ...item,
    valid: existsSync(item.path)
  }))
}

// Other methods are appended in Tasks 15–18. The full export lands in Task 19.
export const partialHandlers = {
  listRecent
} satisfies Partial<ProjectHandlers>
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project.ts
git commit -m "feat(phase-02): ipc handler for project.listRecent with valid flag"
```

---

<!-- openspec-task: 3.2 -->
### Task 15: IPC handlers — `createGrove` / `openGrove` / `closeGrove`

**Files:**
- Modify: `electron/ipc/project.ts`

- [ ] **Step 1: Append delegating handlers**

Add imports:

```typescript
import * as grove from '../services/grove'
import type { GroveSummary, OpenGroveOutcome } from '@shared/grove'
```

Append to the handlers object, replacing `partialHandlers = { listRecent }` with:

```typescript
async function createGrove(parentDir: string, name: string): Promise<GroveSummary> {
  const g = await grove.createGrove(parentDir, name)
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}

async function openGrove(
  path: string,
  opts?: { force?: boolean }
): Promise<OpenGroveOutcome> {
  return grove.openGrove(path, opts ?? {})
}

async function closeGrove(): Promise<void> {
  await grove.closeGrove()
}

export const partialHandlers = {
  listRecent,
  createGrove,
  openGrove,
  closeGrove
} satisfies Partial<ProjectHandlers>
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project.ts
git commit -m "feat(phase-02): ipc handlers delegate createGrove/openGrove/closeGrove"
```

---

<!-- openspec-task: 3.3 -->
### Task 16: IPC handler — `getCurrent`

**Files:**
- Modify: `electron/ipc/project.ts`

- [ ] **Step 1: Append**

```typescript
function getCurrent(): GroveSummary | null {
  const g = grove.getCurrent()
  if (!g) return null
  return {
    id: g.id,
    path: g.path,
    name: g.name,
    color: g.color,
    sync_warning: g.sync_warning ?? null
  }
}
```

Update `partialHandlers` to include `getCurrent`.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project.ts
git commit -m "feat(phase-02): ipc handler for project.getCurrent"
```

---

<!-- openspec-task: 3.4 -->
### Task 17: IPC handler — `removeFromRecent`

**Files:**
- Modify: `electron/ipc/project.ts`

- [ ] **Step 1: Append**

```typescript
async function removeFromRecent(id: string): Promise<void> {
  await recent.removeById(id)
}
```

Add `removeFromRecent` to `partialHandlers`.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project.ts
git commit -m "feat(phase-02): ipc handler for project.removeFromRecent"
```

---

<!-- openspec-task: 3.5 -->
### Task 18: IPC handler — `selectDirectory` (native dialog wrapper)

**Files:**
- Modify: `electron/ipc/project.ts`
- Modify: `electron/main.ts` (export `mainWindow` is already exported — we read it here)

- [ ] **Step 1: Append handler**

Add import:

```typescript
import { dialog } from 'electron'
import { mainWindow } from '../main'
import type { SelectDirectoryPurpose } from '@shared/ipc-contract'
```

Append:

```typescript
async function selectDirectory(purpose: SelectDirectoryPurpose): Promise<string | null> {
  const properties: Array<'openDirectory' | 'createDirectory'> =
    purpose === 'createParent'
      ? ['openDirectory', 'createDirectory']
      : ['openDirectory']
  const options = {
    properties,
    buttonLabel: purpose === 'createParent' ? '选择父目录' : '选择树林目录',
    title: purpose === 'createParent' ? '选择要在其中创建树林的目录' : '选择一个目录作为树林'
  } as const
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}
```

Add `selectDirectory` to `partialHandlers`, then rename to final export:

```typescript
export const projectHandlers = {
  listRecent,
  createGrove,
  openGrove,
  closeGrove,
  getCurrent,
  removeFromRecent,
  selectDirectory
} satisfies ProjectHandlers

// Delete the old `partialHandlers` line.
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS — the `satisfies ProjectHandlers` check will fail loudly if any method signature drifted from the IPC contract.

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/project.ts
git commit -m "feat(phase-02): ipc handler for project.selectDirectory (native dialog)"
```

---

<!-- openspec-task: 3.6 -->
### Task 19: Register `projectHandlers` with the IPC router

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `preload/preload.ts` (expose `api.project.*` + `api.on(channel, handler)`)

- [ ] **Step 1: Merge `projectHandlers` into `ipcHandlers`**

Replace `electron/ipc/handlers.ts`:

```typescript
import type { IpcContract } from '@shared/ipc-contract'
import { logger } from '../services/logger'
import { projectHandlers } from './project'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M]
  }
}

export const ipcHandlers: HandlerMap = {
  ping: {
    echo: (input: string): string => input
  },
  log: {
    debug: (msg, ctx) => logger.debug(`[renderer] ${msg}`, ctx),
    info: (msg, ctx) => logger.info(`[renderer] ${msg}`, ctx),
    warn: (msg, ctx) => logger.warn(`[renderer] ${msg}`, ctx),
    error: (msg, ctx) => logger.error(`[renderer] ${msg}`, ctx)
  },
  project: projectHandlers
}
```

- [ ] **Step 2: Expose `project.*` and events in preload**

Replace the `api` object in `preload/preload.ts`:

```typescript
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  IpcClient,
  IpcContract,
  IpcEventApi,
  IpcEventChannel,
  IpcEventContract,
  IpcResult,
  SelectDirectoryPurpose
} from '@shared/ipc-contract'
import { IpcError } from '@shared/ipc-contract'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new IpcError(res.error.code, res.error.message)
  return res.data
}

const request: IpcClient<IpcContract> = {
  ping: {
    echo: (input: string) => invoke<string>('ping.echo', input)
  },
  log: {
    debug: (msg, ctx) => invoke<void>('log.debug', msg, ctx),
    info: (msg, ctx) => invoke<void>('log.info', msg, ctx),
    warn: (msg, ctx) => invoke<void>('log.warn', msg, ctx),
    error: (msg, ctx) => invoke<void>('log.error', msg, ctx)
  },
  project: {
    listRecent: () => invoke('project.listRecent'),
    createGrove: (parent, name) => invoke('project.createGrove', parent, name),
    openGrove: (path, opts) => invoke('project.openGrove', path, opts),
    closeGrove: () => invoke('project.closeGrove'),
    getCurrent: () => invoke('project.getCurrent'),
    removeFromRecent: (id) => invoke('project.removeFromRecent', id),
    selectDirectory: (purpose: SelectDirectoryPurpose) =>
      invoke('project.selectDirectory', purpose)
  }
}

const events: IpcEventApi = {
  on<K extends IpcEventChannel>(
    channel: K,
    handler: (payload: IpcEventContract[K]) => void
  ): () => void {
    const listener = (_e: IpcRendererEvent, payload: IpcEventContract[K]): void =>
      handler(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api = { ...request, on: events.on } as const

export type PreloadApi = typeof api
export { api }

if (!process.contextIsolated) {
  throw new Error('preload requires contextIsolation: true')
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 3: Update `src/ipc/client.ts` typing**

Replace `src/ipc/client.ts`:

```typescript
import type { IpcClient, IpcContract, IpcEventApi } from '@shared/ipc-contract'

export type AcornApi = IpcClient<IpcContract> & Pick<IpcEventApi, 'on'>

export const ipc: AcornApi = window.api as unknown as AcornApi

export function useIpc(): AcornApi {
  return ipc
}
```

Also update `src/global.d.ts` (if it declares `window.api`) to reflect the new shape:

```typescript
import type { IpcClient, IpcContract, IpcEventApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: IpcClient<IpcContract> & Pick<IpcEventApi, 'on'>
  }
}

export {}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/handlers.ts preload/preload.ts src/ipc/client.ts src/global.d.ts
git commit -m "feat(phase-02): register projectHandlers and expose api.project + api.on"
```

---

<!-- openspec-task: 4.1 -->
### Task 20: Register handlers before bootstrap decision runs

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Reorder `bootstrap()`**

The current `bootstrap()` already calls `registerHandlers(ipcHandlers)` before `createMainWindow`. Verify the ordering is:

1. `await initLogger()`
2. `await app.whenReady()`
3. `installCsp()`
4. `registerHandlers(ipcHandlers)` ← handlers registered first
5. `installGroveBroadcaster()` (from Task 12)
6. `runBootstrapDecision()` (added in Task 21 — placeholder for now)
7. `mainWindow = createMainWindow()`

If any ordering is off, rewrite `bootstrap()`:

```typescript
async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  installCsp()
  registerHandlers(ipcHandlers)
  const disposeBroadcaster = installGroveBroadcaster()
  app.on('will-quit', disposeBroadcaster)
  app.on('will-quit', () => {
    void groveService.closeGrove().catch((err) => {
      logger.error('grove close on will-quit failed', {
        message: err instanceof Error ? err.message : String(err)
      })
    })
  })
  // Task 21 will insert the bootstrap decision here.
  mainWindow = createMainWindow()
}
```

- [ ] **Step 2: Typecheck and lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "chore(phase-02): ensure ipc handlers register before bootstrap decision"
```

---

<!-- openspec-task: 4.2 -->
### Task 21: Bootstrap decision pipeline with 2-second timeout

**Files:**
- Create: `electron/bootstrap.ts`
- Modify: `electron/main.ts` (import and invoke `runBootstrap`)

- [ ] **Step 1: Write `bootstrap.ts`**

```typescript
import { existsSync } from 'node:fs'
import type { IpcEventContract } from '@shared/ipc-contract'
import * as recent from './services/recent'
import * as grove from './services/grove'
import { logger } from './services/logger'

export type BootstrapResult = IpcEventContract['bootstrap:ready']

const TIMEOUT_MS = 2000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('bootstrap timeout')), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (err) => {
        clearTimeout(t)
        reject(err)
      }
    )
  })
}

async function decide(): Promise<BootstrapResult> {
  const file = await recent.load()
  const items = file.items.map((item) => ({
    ...item,
    valid: existsSync(item.path)
  }))

  const firstValid = items.find((i) => i.valid) ?? null
  if (!firstValid) {
    return { initialRoute: '/picker', recent: items }
  }

  const outcome = await grove.openGrove(firstValid.path)
  if (outcome.status === 'opened') {
    return { initialRoute: '/library', recent: items }
  }
  // Locked → Picker with the first item flagged.
  return {
    initialRoute: '/picker',
    recent: items,
    locked: { path: firstValid.path, holder: outcome.holder }
  }
}

export async function runBootstrap(): Promise<BootstrapResult> {
  try {
    return await withTimeout(decide(), TIMEOUT_MS)
  } catch (err) {
    logger.warn('bootstrap fell back to Picker', {
      message: err instanceof Error ? err.message : String(err)
    })
    // On any failure, load what we can and return Picker.
    try {
      const file = await recent.load()
      const items = file.items.map((item) => ({
        ...item,
        valid: existsSync(item.path)
      }))
      return { initialRoute: '/picker', recent: items }
    } catch {
      return { initialRoute: '/picker', recent: [] }
    }
  }
}
```

- [ ] **Step 2: Wire into `main.ts`**

Replace the placeholder in `bootstrap()` with:

```typescript
import { runBootstrap } from './bootstrap'

// inside bootstrap(), right before createMainWindow():
const bootstrapResult = await runBootstrap()
mainWindow = createMainWindow()
// Task 22 will ship `bootstrapResult` to the renderer once the window is ready.
;(globalThis as unknown as { __acornBootstrap: typeof bootstrapResult }).__acornBootstrap =
  bootstrapResult
```

Note: stashing the result on `globalThis` is a **transient** pattern — Task 22 replaces it with a `webContents.send('bootstrap:ready', ...)` call keyed to the `did-finish-load` event. Keep the stash for one task only so the plan is commit-bisectable.

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add electron/bootstrap.ts electron/main.ts
git commit -m "feat(phase-02): bootstrap decision pipeline with 2s timeout fallback"
```

---

<!-- openspec-task: 4.3 -->
### Task 22: Push `bootstrap:ready` to renderer on window load

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Replace the globalThis stash with an event push**

In `electron/main.ts`, inside `bootstrap()` replace the Task-21 `globalThis` stash with:

```typescript
const bootstrapResult = await runBootstrap()
mainWindow = createMainWindow()
mainWindow.webContents.once('did-finish-load', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('bootstrap:ready', bootstrapResult)
})
```

Remove the temporary `(globalThis as ...).__acornBootstrap = ...` line added in Task 21.

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Smoke-test manually**

Run:
```bash
npm run dev
```
Open the app. In the devtools console (View → Toggle Developer Tools) evaluate:
```javascript
window.api.on('bootstrap:ready', console.log)
```
Refresh the renderer (Cmd+R). You should see a `bootstrap:ready` log with `initialRoute: '/picker'` (because there is no `recent-projects.json` yet) and `recent: []`.

Then kill the dev server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(phase-02): push bootstrap:ready to renderer on did-finish-load"
```

---

<!-- openspec-task: 4.4 -->
### Task 23: Renderer bootstrap consumer — minimal `/picker` stub

**Files:**
- Create: `src/hooks/useBootstrap.ts`
- Modify: `src/App.tsx` (route `/` → small bootstrap loader that redirects)
- Modify: `src/pages/Placeholder.tsx` is unchanged — Picker still shows Placeholder until Plan 2

- [ ] **Step 1: Write the hook**

```typescript
// src/hooks/useBootstrap.ts
import { useEffect, useState } from 'react'
import type { IpcEventContract } from '@shared/ipc-contract'
import { ipc } from '@/ipc/client'

export type BootstrapPayload = IpcEventContract['bootstrap:ready']

export function useBootstrap(): BootstrapPayload | null {
  const [payload, setPayload] = useState<BootstrapPayload | null>(null)
  useEffect(() => {
    const unsub = ipc.on('bootstrap:ready', setPayload)
    return () => {
      unsub()
    }
  }, [])
  return payload
}
```

- [ ] **Step 2: Rewrite `/` to a bootstrap redirector**

Replace `src/App.tsx`:

```tsx
import type { JSX } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Placeholder } from './pages/Placeholder'
import { useBootstrap } from './hooks/useBootstrap'

function BootstrapGate(): JSX.Element {
  const payload = useBootstrap()
  if (!payload) return <Placeholder name="loading" />
  return <Navigate to={payload.initialRoute} replace />
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<BootstrapGate />} />
      <Route path="/picker" element={<Placeholder name="picker (plan 2 UI)" />} />
      <Route path="/library" element={<Placeholder name="library" />} />
      <Route path="/editor/:path" element={<Placeholder name="editor" />} />
      <Route path="/browser" element={<Placeholder name="browser" />} />
      <Route path="/chat" element={<Placeholder name="chat" />} />
      <Route path="/settings" element={<Placeholder name="settings" />} />
    </Routes>
  )
}
```

The old `Home` page (phase-01 ping smoke) is no longer the default route. Delete it if it is unused anywhere else:

```bash
git rm src/pages/Home.tsx src/stores/home.ts
```

(If `Home` is referenced by tests or dev tooling, keep it; the plan assumes it is not — phase-01 plan 5 removed all references.)

- [ ] **Step 3: Smoke-test**

Run:
```bash
npm run dev
```
Expected: window loads; URL in dev tools shows `/picker` (because there is no recent list yet); the page shows `picker (plan 2 UI)`. No console errors.

Kill dev server.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/hooks/useBootstrap.ts
git rm -f src/pages/Home.tsx src/stores/home.ts
git commit -m "feat(phase-02): renderer consumes bootstrap:ready and routes to picker/library"
```

---

<!-- openspec-task: 5.1 -->
### Task 24: Zustand grove slice (state only)

**Files:**
- Create: `src/stores/grove.ts`

- [ ] **Step 1: Write the slice**

```typescript
import { create } from 'zustand'
import type { GroveSummary, RecentItemView } from '@shared/grove'

export type GroveState = {
  current: GroveSummary | null
  recent: RecentItemView[]
  lastError: string | null
  _setCurrent: (value: GroveSummary | null) => void
  _setRecent: (items: RecentItemView[]) => void
  _setError: (message: string | null) => void
}

export const useGroveStore = create<GroveState>((set) => ({
  current: null,
  recent: [],
  lastError: null,
  _setCurrent: (value) => set({ current: value }),
  _setRecent: (items) => set({ recent: items }),
  _setError: (message) => set({ lastError: message })
}))
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/grove.ts
git commit -m "feat(phase-02): grove store slice (state only)"
```

---

<!-- openspec-task: 5.2 -->
### Task 25: Grove store actions

**Files:**
- Modify: `src/stores/grove.ts`

- [ ] **Step 1: Add actions**

Replace the store body with:

```typescript
import { create } from 'zustand'
import type { GroveSummary, RecentItemView } from '@shared/grove'
import { ipc } from '@/ipc/client'

export type GroveActions = {
  loadRecent: () => Promise<void>
  openGroveById: (id: string) => Promise<OpenOutcomeLite>
  createGrove: (parentDir: string, name: string) => Promise<GroveSummary>
  openExisting: (path: string, opts?: { force?: boolean }) => Promise<OpenOutcomeLite>
  switchTo: (id: string) => Promise<OpenOutcomeLite>
  removeFromRecent: (id: string) => Promise<void>
}

export type OpenOutcomeLite =
  | { status: 'opened'; grove: GroveSummary }
  | { status: 'locked'; holder: { pid: number; hostname: string; started_at: string } }
  | { status: 'error'; message: string }

export type GroveState = {
  current: GroveSummary | null
  recent: RecentItemView[]
  lastError: string | null
} & GroveActions & {
  _setCurrent: (value: GroveSummary | null) => void
  _setRecent: (items: RecentItemView[]) => void
  _setError: (message: string | null) => void
}

function findPath(recent: RecentItemView[], id: string): string | null {
  return recent.find((i) => i.id === id)?.path ?? null
}

export const useGroveStore = create<GroveState>((set, get) => ({
  current: null,
  recent: [],
  lastError: null,
  _setCurrent: (value) => set({ current: value }),
  _setRecent: (items) => set({ recent: items }),
  _setError: (message) => set({ lastError: message }),

  async loadRecent() {
    const items = await ipc.project.listRecent()
    set({ recent: items })
  },

  async openExisting(path, opts) {
    try {
      const res = await ipc.project.openGrove(path, opts)
      if (res.status === 'opened') {
        set({ current: res.grove, lastError: null })
        // main process pushes project:changed too; setting here avoids a flash
        return { status: 'opened', grove: res.grove }
      }
      return { status: 'locked', holder: res.holder }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message })
      return { status: 'error', message }
    }
  },

  async openGroveById(id) {
    const path = findPath(get().recent, id)
    if (!path) return { status: 'error', message: 'not in recent list' }
    const res = await get().openExisting(path)
    await get().loadRecent()
    return res
  },

  async switchTo(id) {
    return get().openGroveById(id)
  },

  async createGrove(parentDir, name) {
    const g = await ipc.project.createGrove(parentDir, name)
    // Opening is done as a second step to consistently acquire the lock
    await get().openExisting(g.path)
    await get().loadRecent()
    return g
  },

  async removeFromRecent(id) {
    await ipc.project.removeFromRecent(id)
    await get().loadRecent()
  }
}))
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/stores/grove.ts
git commit -m "feat(phase-02): grove store actions — open / create / switch / remove"
```

---

<!-- openspec-task: 5.3 -->
### Task 26: Subscribe to `project:changed` + on-switch hook registry

**Files:**
- Create: `src/stores/grove-switch-hooks.ts`
- Modify: `src/stores/grove.ts` (install the subscriber)
- Modify: `src/main.tsx` (call `installGroveSubscriber()` once)

- [ ] **Step 1: Write the on-switch hook registry**

```typescript
// src/stores/grove-switch-hooks.ts
import type { GroveSummary } from '@shared/grove'

type Handler = (next: GroveSummary | null) => void
const handlers = new Set<Handler>()

export const grove = {
  /** Register a handler to run whenever the current grove changes (incl. close). */
  onSwitch(handler: Handler): () => void {
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  },
  _fire(next: GroveSummary | null): void {
    for (const h of handlers) {
      try {
        h(next)
      } catch (err) {
        // Never let one bad subscriber block another
        console.error('grove.onSwitch handler threw', err)
      }
    }
  }
}
```

- [ ] **Step 2: Install subscriber in the store module**

Append to `src/stores/grove.ts`:

```typescript
import { ipc as _ipc } from '@/ipc/client'
import { grove as groveSwitchHooks } from './grove-switch-hooks'

let subscriberInstalled = false
export function installGroveSubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true
  const unsub = _ipc.on('project:changed', (payload) => {
    useGroveStore.getState()._setCurrent(payload)
    groveSwitchHooks._fire(payload)
  })
  return () => {
    subscriberInstalled = false
    unsub()
  }
}
```

Re-export the hooks registry so feature modules can `import { grove } from '@/stores/grove'`:

```typescript
export { grove } from './grove-switch-hooks'
```

- [ ] **Step 3: Install at app boot**

In `src/main.tsx` add:

```typescript
import { installGroveSubscriber } from '@/stores/grove'

installGroveSubscriber()
```

Place the call once, before `ReactDOM.createRoot(...).render(...)`.

- [ ] **Step 4: Typecheck + dev smoke**

Run:
```bash
npm run typecheck
```
Expected: PASS.

Run:
```bash
npm run dev
```
In the devtools console, evaluate:
```javascript
const { useGroveStore, grove } = await import('/src/stores/grove.ts')
grove.onSwitch((p) => console.log('onSwitch fired', p))
await window.api.project.listRecent() // sanity
```
Then trigger a change from main (there is no UI to do this yet; you can simulate with devtools by opening via a CLI test). For now the success criterion is: no console errors, `grove.onSwitch` is a function.

Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/stores/grove.ts src/stores/grove-switch-hooks.ts src/main.tsx
git commit -m "feat(phase-02): subscribe renderer to project:changed + grove.onSwitch registry"
```

---

## Self-Review Checklist

After finishing all 26 tasks above, run this checklist **before** starting Plan 2:

1. **Spec coverage — grove-management:**
   - [ ] 新建树林 — Task 10 + scenarios covered by Task 15
   - [ ] 打开已有目录（含 Obsidian vault）— Task 11 (initialize is idempotent)
   - [ ] `.acornvo/` 初始化幂等 — Task 9 (`ensureFile` + re-read guard)
   - [ ] 实例锁防止并发打开 — Tasks 8 + 11
   - [ ] 最近打开列表 — Tasks 7 + 14
   - [ ] 同步目录告警 — Task 9 (`detectSyncDir` + `sync_warning` field)
   - [ ] 切换树林广播 — Tasks 11 + 12 + 26

2. **Spec coverage — app-bootstrap:**
   - [ ] 启动决策流水线 — Tasks 21 + 22 + 23
   - [ ] 启动流水线不影响 IPC 就绪 — Task 20

3. **Spec coverage — app-shell (modified):**
   - [ ] 启动路由由 bootstrap 决定 — Task 23

4. **Type consistency:**
   - [ ] `GroveSummary`, `LockInfo`, `RecentItemView` used the same way in shared, preload, services, store
   - [ ] Method names consistent: `openGrove`, `closeGrove`, `createGrove`, `getCurrent`, `listRecent`, `removeFromRecent`, `selectDirectory`
   - [ ] Event channel strings: exactly `project:changed` and `bootstrap:ready` — no `project.changed` variants

5. **Placeholder scan:** search the plan for any of: "TODO", "later", "handle edge cases", "similar to". Expected: none.

6. **Commit count sanity:** each task commits at least once; total commits = 26 + any extras. Running `git log --oneline main..HEAD` should show linear, named history.

If any box is unchecked, revisit the offending task before moving to Plan 2.
