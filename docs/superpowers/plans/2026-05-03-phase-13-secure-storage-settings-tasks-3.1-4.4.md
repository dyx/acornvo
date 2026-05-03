# Phase-13 Secure Storage & Settings — Plan 2: IPC + Renderer Store + Settings Page Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the IPC namespace, the preload exposure (rejecting secret/getDecryptedKey), the main→renderer broadcast for `settings:changed`, the renderer Zustand store, the `/settings` page skeleton with sub-routes, and the simple `General` + `Appearance` tabs.

**Architecture:** IPC namespace `settings` with flattened method names (`settings.get`, `settings.set`, `settings.aiProfilesList`, etc.) — flat keys keep the type-safe `IpcContract`/`IpcClient` map pattern intact. The broadcaster subscribes to `settingsStore.onChange` (Plan 1) and fans out to all webContents on channel `'settings:changed'`. The renderer store (`useSettingsStore`) loads all four namespaces at grove open, applies appearance side-effects (theme, font scale), and merges incoming change events.

**Tech Stack:** TypeScript 5, react-router-dom 7, Zustand 5, react-i18next 17, radix-ui (already installed).

**Carry-over decisions from Plan 1:**
- Event channel: `'settings:changed'` (colon).
- DB scope: per-grove. Settings store and IPC handlers all assume `dbService.requireCurrent()` is non-null. Calls before a grove is open throw `E_NOT_FOUND` per existing IPC patterns; the renderer's `useSettingsStore` only fetches after the `'project:changed'` event fires.

---

<!-- openspec-task: 3.1 -->
### Task 1: Extend IpcContract with `settings` namespace

**Files:**
- Modify: `shared/ipc-contract.ts:147-244`

- [ ] **Step 1: Write the failing contract test**

Create `shared/ipc-contract.settings.test.ts`:

```ts
// shared/ipc-contract.settings.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type { IpcContract, IpcEventContract } from './ipc-contract'
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload
} from './settings-types'

describe('IpcContract.settings', () => {
  it('has get / set / aiProfilesList / aiProfilesCreate / aiProfilesUpdate / aiProfilesDelete / browserClearCookies', () => {
    expectTypeOf<IpcContract['settings']['get']>()
      .toEqualTypeOf<<NS extends SettingsNamespace>(ns: NS) => SettingsByNs[NS]>()
    expectTypeOf<IpcContract['settings']['set']>()
      .toEqualTypeOf<
        <NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>) => { ok: true }
      >()
    expectTypeOf<IpcContract['settings']['aiProfilesList']>().returns.toEqualTypeOf<AiProviderProfile[]>()
    expectTypeOf<IpcContract['settings']['aiProfilesCreate']>().parameters.toMatchTypeOf<[ProfileCreateInput]>()
    expectTypeOf<IpcContract['settings']['aiProfilesCreate']>().returns.toEqualTypeOf<{ id: string }>()
    expectTypeOf<IpcContract['settings']['aiProfilesUpdate']>().parameters.toMatchTypeOf<[string, ProfileUpdateInput]>()
    expectTypeOf<IpcContract['settings']['aiProfilesDelete']>().parameters.toMatchTypeOf<[string]>()
    expectTypeOf<IpcContract['settings']['browserClearCookies']>().returns.toEqualTypeOf<{ ok: true }>()
  })

  it('does NOT expose secret.* or getDecryptedKey on the contract', () => {
    type SettingsKeys = keyof IpcContract['settings']
    type ForbiddenKeys = SettingsKeys & ('secret' | 'getDecryptedKey' | 'aiProfilesGetDecryptedKey')
    expectTypeOf<ForbiddenKeys>().toEqualTypeOf<never>()
  })

  it("emits 'settings:changed' with SettingsChangedPayload", () => {
    expectTypeOf<IpcEventContract['settings:changed']>().toEqualTypeOf<SettingsChangedPayload>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/ipc-contract.settings.test.ts`
Expected: FAIL — `Property 'settings' does not exist on type 'IpcContract'`.

- [ ] **Step 3: Add the namespace + event channel to the contract**

Open `shared/ipc-contract.ts`. At the top of the file (after the existing imports around line 11), add:

```ts
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload
} from './settings-types'

export type {
  AiProviderProfile,
  AiProviderKind,
  ProfileCreateInput,
  ProfileUpdateInput,
  SettingsByNs,
  SettingsNamespace,
  SettingsChangedPayload,
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings
} from './settings-types'
```

Then inside `IpcContract` (currently ending at line 218), append a new `settings` entry just before the closing brace:

```ts
// shared/ipc-contract.ts — add inside IpcContract, after `search:`
  settings: {
    get: <NS extends SettingsNamespace>(ns: NS) => SettingsByNs[NS]
    set: <NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>) => { ok: true }
    aiProfilesList: () => AiProviderProfile[]
    aiProfilesCreate: (input: ProfileCreateInput) => { id: string }
    aiProfilesUpdate: (id: string, patch: ProfileUpdateInput) => { ok: true }
    aiProfilesDelete: (id: string) => { ok: true }
    browserClearCookies: () => { ok: true }
  }
```

In `IpcEventContract` (lines 226-244), add:

```ts
  'settings:changed': SettingsChangedPayload
```

- [ ] **Step 4: Run the contract test**

Run: `npx vitest run shared/ipc-contract.settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full typecheck (existing handlers must still satisfy the satisfies constraint)**

Run: `npm run typecheck`
Expected: 0 errors. (`electron/ipc/handlers.ts` will type-error in the next task because we haven't added `settings` to its handler map yet — if the typecheck blocks here, briefly add a stub `settings: {} as never` cast to handlers.ts and remove it in task 2. Acceptable tradeoff to keep TDD green.)

If typecheck fails on `handlers.ts`, apply this minimal stub:

```ts
// electron/ipc/handlers.ts — add temporarily, removed in next task
  settings: {} as never
```

- [ ] **Step 6: Commit**

```bash
git add shared/ipc-contract.ts shared/ipc-contract.settings.test.ts electron/ipc/handlers.ts
git commit -m "feat(phase-13): IpcContract.settings namespace + 'settings:changed' event"
```

---

<!-- openspec-task: 3.2 -->
### Task 2: Main IPC handlers for `settings`

**Files:**
- Create: `electron/ipc/settings.ts`
- Create: `electron/ipc/settings.test.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/ipc/settings.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, ''))
  },
  session: {
    fromPartition: vi.fn(() => ({
      clearStorageData: vi.fn().mockResolvedValue(undefined)
    }))
  }
}))

import { dbService } from '../services/db'
import { session } from 'electron'
import { settingsHandlers } from './settings'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('settingsHandlers', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('get(ns) returns merged defaults', () => {
    expect(settingsHandlers.get('appearance')).toMatchObject({ theme: 'system', fontScale: 1.0 })
  })

  it('get rejects unknown namespace with E_UNKNOWN_NAMESPACE', () => {
    expect(() => settingsHandlers.get('foo' as never)).toThrow(/E_UNKNOWN_NAMESPACE/)
  })

  it('set returns { ok: true } and persists', () => {
    expect(settingsHandlers.set('appearance', { theme: 'dark' })).toEqual({ ok: true })
    expect(settingsHandlers.get('appearance').theme).toBe('dark')
  })

  it('aiProfilesList returns [] initially', () => {
    expect(settingsHandlers.aiProfilesList()).toEqual([])
  })

  it('aiProfilesCreate returns { id } and aiProfilesList shows it', () => {
    const { id } = settingsHandlers.aiProfilesCreate({
      name: 'p1', provider: 'openai', model: 'gpt-4o', apiKey: 'sk'
    })
    expect(typeof id).toBe('string')
    expect(settingsHandlers.aiProfilesList()).toHaveLength(1)
  })

  it('aiProfilesCreate with duplicate name throws E_DUPLICATE_NAME', () => {
    settingsHandlers.aiProfilesCreate({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    expect(() => settingsHandlers.aiProfilesCreate({ name: 'a', provider: 'openai', model: 'gpt-4o' }))
      .toThrow(/E_DUPLICATE_NAME/)
  })

  it('aiProfilesUpdate / aiProfilesDelete return { ok: true }', () => {
    const { id } = settingsHandlers.aiProfilesCreate({ name: 'p', provider: 'openai', model: 'gpt-4o' })
    expect(settingsHandlers.aiProfilesUpdate(id, { name: 'p2' })).toEqual({ ok: true })
    expect(settingsHandlers.aiProfilesDelete(id)).toEqual({ ok: true })
  })

  it('browserClearCookies calls session.fromPartition("persist:browser-default").clearStorageData with cookies', async () => {
    const result = await settingsHandlers.browserClearCookies()
    expect(result).toEqual({ ok: true })
    expect(session.fromPartition).toHaveBeenCalledWith('persist:browser-default')
  })

  it('handlers DO NOT expose secret.get or getDecryptedKey', () => {
    expect(settingsHandlers).not.toHaveProperty('secretGet')
    expect(settingsHandlers).not.toHaveProperty('aiProfilesGetDecryptedKey')
    expect(settingsHandlers).not.toHaveProperty('getDecryptedKey')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/ipc/settings.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the handler module**

```ts
// electron/ipc/settings.ts
import { session } from 'electron'
import type { IpcContract } from '@shared/ipc-contract'
import { settingsStore } from '../settings/store'
import { profilesStore } from '../settings/profiles'

const BROWSER_PARTITION = 'persist:browser-default'

type SettingsHandlers = {
  [M in keyof IpcContract['settings']]: IpcContract['settings'][M] extends (...args: infer A) => infer R
    ? (...args: A) => R | Promise<Awaited<R>>
    : never
}

export const settingsHandlers = {
  get: (ns) => settingsStore.get(ns),
  set: (ns, patch) => {
    settingsStore.set(ns, patch)
    return { ok: true }
  },
  aiProfilesList: () => profilesStore.list(),
  aiProfilesCreate: (input) => profilesStore.create(input),
  aiProfilesUpdate: (id, patch) => {
    profilesStore.update(id, patch)
    return { ok: true }
  },
  aiProfilesDelete: (id) => {
    profilesStore.delete(id)
    return { ok: true }
  },
  browserClearCookies: async () => {
    const ses = session.fromPartition(BROWSER_PARTITION)
    await ses.clearStorageData({ storages: ['cookies'] })
    return { ok: true }
  }
} satisfies SettingsHandlers
```

- [ ] **Step 4: Register the handlers**

Modify `electron/ipc/handlers.ts`. Add the import and the entry. Remove the temporary stub from task 1 step 5 if you added one.

```ts
// electron/ipc/handlers.ts (replace the file)
import type { IpcContract } from '@shared/ipc-contract'
import { logger } from '../services/logger'
import { dbHandlers } from './db'
import { fileHandlers } from './file'
import { fileQueryHandlers } from './files'
import { projectHandlers } from './project'
import { indexHandlers } from './index'
import { searchHandlers } from './search'
import { settingsHandlers } from './settings'

type HandlerMap = {
  [NS in keyof IpcContract]: {
    [M in keyof IpcContract[NS]]: IpcContract[NS][M] extends (...args: infer A) => infer R
      ? (...args: A) => R | Promise<Awaited<R>>
      : never
  }
}

export const ipcHandlers: HandlerMap = {
  ping: { echo: (input: string): string => input },
  log: {
    debug: (msg, ctx) => logger.debug(`[renderer] ${msg}`, ctx),
    info: (msg, ctx) => logger.info(`[renderer] ${msg}`, ctx),
    warn: (msg, ctx) => logger.warn(`[renderer] ${msg}`, ctx),
    error: (msg, ctx) => logger.error(`[renderer] ${msg}`, ctx)
  },
  project: projectHandlers,
  db: dbHandlers,
  file: fileHandlers,
  files: fileQueryHandlers,
  index: indexHandlers,
  search: searchHandlers,
  settings: settingsHandlers
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run electron/ipc/settings.test.ts && npm run typecheck:node`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add electron/ipc/settings.ts electron/ipc/settings.test.ts electron/ipc/handlers.ts
git commit -m "feat(phase-13): electron/ipc/settings — handlers wired into router"
```

---

<!-- openspec-task: 3.3 -->
### Task 3: Preload exposure (no secrets in renderer)

**Files:**
- Modify: `preload/preload.ts`
- Create: `preload/preload.settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// preload/preload.test.ts (or preload.settings.test.ts)
import { describe, it, expect, vi } from 'vitest'

// Capture the object passed to contextBridge.exposeInMainWorld
const exposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))
// preload reads process.contextIsolated; jsdom doesn't set it
;(process as unknown as { contextIsolated: boolean }).contextIsolated = true

describe('preload exposes settings.* but NEVER secret or getDecryptedKey', () => {
  it('exposes settings.get/set/aiProfilesList/aiProfilesCreate/aiProfilesUpdate/aiProfilesDelete/browserClearCookies', async () => {
    await import('./preload')
    expect(exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(typeof api.settings.get).toBe('function')
    expect(typeof api.settings.set).toBe('function')
    expect(typeof api.settings.aiProfilesList).toBe('function')
    expect(typeof api.settings.aiProfilesCreate).toBe('function')
    expect(typeof api.settings.aiProfilesUpdate).toBe('function')
    expect(typeof api.settings.aiProfilesDelete).toBe('function')
    expect(typeof api.settings.browserClearCookies).toBe('function')
  })

  it('does NOT expose secret.*, getDecryptedKey, or aiProfilesGetDecryptedKey on settings', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(api.settings.secret).toBeUndefined()
    expect(api.settings.getDecryptedKey).toBeUndefined()
    expect(api.settings.aiProfilesGetDecryptedKey).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run preload/preload.test.ts`
Expected: FAIL — `api.settings is undefined`.

- [ ] **Step 3: Add `settings` to the preload `request` object**

Modify `preload/preload.ts`. In the `request` literal (currently lines 19-72), add a `settings` block before the closing brace:

```ts
// preload/preload.ts — add inside `request: IpcClient<IpcContract>`
  settings: {
    get: (ns) => invoke('settings.get', ns),
    set: (ns, patch) => invoke('settings.set', ns, patch),
    aiProfilesList: () => invoke('settings.aiProfilesList'),
    aiProfilesCreate: (input) => invoke('settings.aiProfilesCreate', input),
    aiProfilesUpdate: (id, patch) => invoke('settings.aiProfilesUpdate', id, patch),
    aiProfilesDelete: (id) => invoke('settings.aiProfilesDelete', id),
    browserClearCookies: () => invoke('settings.browserClearCookies')
  }
```

Then update the comment block at the bottom (line 99) to reaffirm:

```ts
// Explicitly NOT exposed: ipcRenderer, process, require, Buffer, __dirname,
// settings.secret.*, getProfileDecryptedKey, aiProfilesGetDecryptedKey.
// Exposing them would leak plaintext API keys into the renderer.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run preload/preload.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add preload/preload.ts preload/preload.test.ts
git commit -m "feat(phase-13): preload exposes settings.* (excludes secret + getDecryptedKey)"
```

---

<!-- openspec-task: 3.4 -->
### Task 4: Settings broadcaster (main → renderer)

**Files:**
- Create: `electron/settings/broadcast.ts`
- Create: `electron/settings/broadcast.test.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/broadcast.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

const fakeWebContents = [
  { id: 1, isDestroyed: () => false, send: vi.fn() },
  { id: 2, isDestroyed: () => false, send: vi.fn() },
  { id: 3, isDestroyed: () => true, send: vi.fn() }
]

vi.mock('electron', () => ({
  webContents: { getAllWebContents: () => fakeWebContents },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))
vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('../services/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }))

import { dbService } from '../services/db'
import { settingsStore } from './store'
import { installSettingsBroadcaster } from './broadcast'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('installSettingsBroadcaster', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    settingsStore.__resetSubscribers()
    fakeWebContents[0].send.mockClear()
    fakeWebContents[1].send.mockClear()
    fakeWebContents[2].send.mockClear()
  })
  afterEach(() => db.close())

  it("sends 'settings:changed' to every alive webContents on each change", () => {
    const dispose = installSettingsBroadcaster()
    settingsStore.set('appearance', { theme: 'dark' })
    expect(fakeWebContents[0].send).toHaveBeenCalledWith('settings:changed', {
      ns: 'appearance',
      key: 'theme',
      newValue: 'dark'
    })
    expect(fakeWebContents[1].send).toHaveBeenCalledWith('settings:changed', expect.any(Object))
    expect(fakeWebContents[2].send).not.toHaveBeenCalled()
    dispose()
  })

  it('multi-key set fires once per key', () => {
    installSettingsBroadcaster()
    settingsStore.set('appearance', { theme: 'dark', fontScale: 1.2 })
    expect(fakeWebContents[0].send).toHaveBeenCalledTimes(2)
    const calls = fakeWebContents[0].send.mock.calls
    expect(calls[0][1].key).toBe('theme')
    expect(calls[1][1].key).toBe('fontScale')
  })

  it('returned dispose() unsubscribes', () => {
    const dispose = installSettingsBroadcaster()
    dispose()
    settingsStore.set('appearance', { theme: 'dark' })
    expect(fakeWebContents[0].send).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/broadcast.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the broadcaster (mirrors `grove-broadcast.ts:12-26`)**

```ts
// electron/settings/broadcast.ts
import { webContents } from 'electron'
import { logger } from '../services/logger'
import { settingsStore } from './store'

const CHANNEL = 'settings:changed'

export function installSettingsBroadcaster(): () => void {
  return settingsStore.onChange(({ ns, key, newValue }) => {
    const payload = { ns, key, newValue }
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue
      try {
        wc.send(CHANNEL, payload)
      } catch (err) {
        logger.warn('settings:changed send failed', {
          id: wc.id,
          message: err instanceof Error ? err.message : String(err)
        })
      }
    }
  })
}
```

- [ ] **Step 4: Wire the broadcaster into bootstrap**

Modify `electron/main.ts`. Add the import near the other broadcaster import (line 9), and install it after `installGroveBroadcaster()` (line 71):

```ts
// electron/main.ts (line 9-ish)
import { installSettingsBroadcaster } from './settings/broadcast'

// in bootstrap(), after `const disposeBroadcaster = installGroveBroadcaster()`
const disposeSettingsBroadcaster = installSettingsBroadcaster()
app.on('will-quit', disposeSettingsBroadcaster)
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run electron/settings/broadcast.test.ts && npx vitest run electron/`
Expected: PASS — broadcaster + all electron tests green.

- [ ] **Step 6: Commit**

```bash
git add electron/settings/broadcast.ts electron/settings/broadcast.test.ts electron/main.ts
git commit -m "feat(phase-13): installSettingsBroadcaster — fan settings:changed to all webContents"
```

---

<!-- openspec-task: 4.1 -->
### Task 5: Renderer settings store

**Files:**
- Create: `src/stores/settings.ts`
- Create: `src/stores/settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/settings.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockImplementation(async (ns: string) => {
        if (ns === 'general') return { locale: 'zh-CN', autoBackup: 'off' }
        if (ns === 'appearance') return { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' }
        if (ns === 'ai') return { defaultProfileId: null }
        if (ns === 'browser') return { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
        throw new Error('unknown ns')
      }),
      set: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useSettingsStore, installSettingsSubscriber } from './settings'

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('initial state has DEFAULTS pre-populated and ready=false', () => {
    const s = useSettingsStore.getState()
    expect(s.ready).toBe(false)
    expect(s.appearance.theme).toBe('system')
    expect(s.browser.blockAds).toBe(true)
  })

  it('loadAll fetches all 4 namespaces and sets ready=true', async () => {
    await useSettingsStore.getState().loadAll()
    expect(ipc.settings.get).toHaveBeenCalledTimes(4)
    expect(useSettingsStore.getState().ready).toBe(true)
  })

  it('setAppearance writes optimistically AND calls ipc.settings.set', async () => {
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })
    expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    expect(ipc.settings.set).toHaveBeenCalledWith('appearance', { theme: 'dark' })
  })

  it('installSettingsSubscriber merges incoming settings:changed events', async () => {
    type Payload = { ns: string; key: string; newValue: unknown }
    let captured: ((p: Payload) => void) | null = null
    ;(ipc.on as unknown as ReturnType<typeof vi.fn>).mockImplementation((_chan: string, cb: (p: Payload) => void) => {
      captured = cb
      return () => {}
    })
    installSettingsSubscriber()
    expect(captured).not.toBeNull()
    captured!({ ns: 'appearance', key: 'theme', newValue: 'light' })
    expect(useSettingsStore.getState().appearance.theme).toBe('light')
  })

  it('subscriber is idempotent — install twice still installs once', () => {
    const onMock = ipc.on as unknown as ReturnType<typeof vi.fn>
    installSettingsSubscriber()
    installSettingsSubscriber()
    expect(onMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/settings.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the store**

```ts
// src/stores/settings.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  SettingsChangedPayload
} from '@shared/settings-types'

const DEFAULTS = {
  general: { locale: 'zh-CN', autoBackup: 'off' } as GeneralSettings,
  appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' } as AppearanceSettings,
  ai: { defaultProfileId: null } as AiSettings,
  browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' } as BrowserSettings
}

interface SettingsState {
  ready: boolean
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
  loadAll: () => Promise<void>
  setGeneral: (patch: Partial<GeneralSettings>) => Promise<void>
  setAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>
  setAi: (patch: Partial<AiSettings>) => Promise<void>
  setBrowser: (patch: Partial<BrowserSettings>) => Promise<void>
  _applyChange: (payload: SettingsChangedPayload) => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ready: false,
  ...DEFAULTS,

  async loadAll() {
    const [general, appearance, ai, browser] = await Promise.all([
      ipc.settings.get('general'),
      ipc.settings.get('appearance'),
      ipc.settings.get('ai'),
      ipc.settings.get('browser')
    ])
    set({ general, appearance, ai, browser, ready: true })
  },

  async setGeneral(patch) {
    const next = { ...get().general, ...patch }
    set({ general: next })
    await ipc.settings.set('general', patch)
  },
  async setAppearance(patch) {
    const next = { ...get().appearance, ...patch }
    set({ appearance: next })
    await ipc.settings.set('appearance', patch)
  },
  async setAi(patch) {
    const next = { ...get().ai, ...patch }
    set({ ai: next })
    await ipc.settings.set('ai', patch)
  },
  async setBrowser(patch) {
    const next = { ...get().browser, ...patch }
    set({ browser: next })
    await ipc.settings.set('browser', patch)
  },

  _applyChange({ ns, key, newValue }) {
    const current = get()
    if (ns === 'general') set({ general: { ...current.general, [key]: newValue } as GeneralSettings })
    else if (ns === 'appearance')
      set({ appearance: { ...current.appearance, [key]: newValue } as AppearanceSettings })
    else if (ns === 'ai') set({ ai: { ...current.ai, [key]: newValue } as AiSettings })
    else if (ns === 'browser') set({ browser: { ...current.browser, [key]: newValue } as BrowserSettings })
  }
}))

let subscriberInstalled = false
export function installSettingsSubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true
  const unsub = ipc.on('settings:changed', (payload) => {
    useSettingsStore.getState()._applyChange(payload)
  })
  return () => {
    subscriberInstalled = false
    unsub()
  }
}

/** Test-only escape hatch. */
export function __resetSubscriberInstalled(): void {
  subscriberInstalled = false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/settings.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Wire `loadAll` + `installSettingsSubscriber` into the renderer bootstrap**

Modify `src/main.tsx`. Add the subscriber install line after `installGroveSubscriber()` (line 17). The store's `loadAll` is called by the project:changed handler, but install the subscriber up-front so we never miss an event.

```ts
// src/main.tsx (after line 17)
import { installSettingsSubscriber } from '@/stores/settings'
// ...
installGroveSubscriber()
installSettingsSubscriber()
```

Modify `src/stores/grove.ts`. In `installGroveSubscriber` (lines 88-100), trigger settings load when the grove changes:

```ts
// src/stores/grove.ts (modify installGroveSubscriber)
import { useSettingsStore } from './settings'
// ...
export function installGroveSubscriber(): () => void {
  if (subscriberInstalled) return () => {}
  subscriberInstalled = true
  const unsub = ipc.on('project:changed', (payload) => {
    useGroveStore.getState()._setCurrent(payload)
    groveSwitchHooks._fire(payload)
    if (payload) {
      void useSettingsStore.getState().loadAll().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('settings.loadAll failed', err)
      })
    }
  })
  return () => {
    subscriberInstalled = false
    unsub()
  }
}
```

- [ ] **Step 6: Run all renderer tests**

Run: `npx vitest run src/stores/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/stores/settings.ts src/stores/settings.test.ts src/main.tsx src/stores/grove.ts
git commit -m "feat(phase-13): renderer settings store + subscriber wired to project:changed"
```

---

<!-- openspec-task: 4.2 -->
### Task 6: `/settings` page with sub-routes

**Files:**
- Create: `src/pages/Settings.tsx`
- Create: `src/components/settings/SettingsLayout.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/pages/Settings.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesList: vi.fn().mockResolvedValue([]),
      browserClearCookies: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { Settings } from './Settings'

describe('Settings page', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders the four-tab rail at /settings/general (default redirect)', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <Settings />
      </MemoryRouter>
    )
    expect(screen.getByRole('navigation', { name: /settings/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /通用|general/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /外观|appearance/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /ai/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /浏览器|browser/i })).toBeTruthy()
  })

  it('redirects /settings to /settings/general', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>
    )
    // The default tab content (General tab) should mount
    expect(screen.getByTestId('settings-tab-general')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/Settings.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the layout component**

```tsx
// src/components/settings/SettingsLayout.tsx
import type { JSX, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

interface TabDef {
  to: string
  labelKey: string
  testId: string
}

const TABS: TabDef[] = [
  { to: '/settings/general', labelKey: 'settings.tab.general', testId: 'settings-rail-general' },
  { to: '/settings/appearance', labelKey: 'settings.tab.appearance', testId: 'settings-rail-appearance' },
  { to: '/settings/ai', labelKey: 'settings.tab.ai', testId: 'settings-rail-ai' },
  { to: '/settings/browser', labelKey: 'settings.tab.browser', testId: 'settings-rail-browser' }
]

export function SettingsLayout({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex h-full">
      <nav
        aria-label="settings"
        className="flex w-[160px] shrink-0 flex-col border-r bg-muted/30 py-4"
      >
        <h2 className="px-4 pb-3 text-sm font-medium text-muted-foreground">{t('settings.title')}</h2>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            data-testid={tab.testId}
            className={({ isActive }) =>
              `block px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-muted'
              }`
            }
          >
            {t(tab.labelKey)}
          </NavLink>
        ))}
      </nav>
      <section className="flex-1 overflow-y-auto p-6">{children}</section>
    </div>
  )
}
```

- [ ] **Step 4: Create the Settings page with sub-routes**

```tsx
// src/pages/Settings.tsx
import type { JSX } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { GeneralTab } from '@/components/settings/GeneralTab'
import { AppearanceTab } from '@/components/settings/AppearanceTab'

// Stubbed below; AI / Browser tabs land in Plan 3
function AiTabStub(): JSX.Element {
  return <div data-testid="settings-tab-ai">AI tab (Plan 3)</div>
}
function BrowserTabStub(): JSX.Element {
  return <div data-testid="settings-tab-browser">Browser tab (Plan 3)</div>
}

export function Settings(): JSX.Element {
  return (
    <SettingsLayout>
      <Routes>
        <Route index element={<Navigate to="general" replace />} />
        <Route path="general" element={<GeneralTab />} />
        <Route path="appearance" element={<AppearanceTab />} />
        <Route path="ai" element={<AiTabStub />} />
        <Route path="browser" element={<BrowserTabStub />} />
      </Routes>
    </SettingsLayout>
  )
}
```

- [ ] **Step 5: Mount the page in `App.tsx`**

Modify `src/App.tsx`. Replace line 86 (the placeholder):

```tsx
// src/App.tsx
import { Settings } from './pages/Settings'

// Replace:
// <Route path="/settings" element={<Placeholder name="settings" />} />
// With:
<Route path="/settings/*" element={<Settings />} />
```

The `/*` is required so nested `<Routes>` inside `Settings.tsx` match.

- [ ] **Step 6: Run typecheck (the test will fail until we add the General/Appearance tab components below)**

Run: `npm run typecheck:web`
Expected: errors about `GeneralTab` and `AppearanceTab` — they will be created in tasks 7-8 below.

- [ ] **Step 7: Commit (deferred)**

Hold off on committing — we'll commit together with the General + Appearance tabs in Task 8.

---

<!-- openspec-task: 4.3 -->
### Task 7: General tab

**Files:**
- Create: `src/components/settings/GeneralTab.tsx`
- Create: `src/components/settings/GeneralTab.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/settings/GeneralTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: { get: vi.fn(), set: vi.fn().mockResolvedValue({ ok: true }) },
    on: vi.fn(() => () => {})
  }
}))

vi.mock('@/stores/grove', () => ({
  useGroveStore: Object.assign(
    (selector: (s: unknown) => unknown) =>
      selector({ current: { path: '/tmp/my-grove' } }),
    { getState: () => ({ current: { path: '/tmp/my-grove' } }) }
  )
}))

import { useSettingsStore } from '@/stores/settings'
import { GeneralTab } from './GeneralTab'

describe('GeneralTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  })
  afterEach(() => cleanup())

  it('renders locale select with the current value', () => {
    useSettingsStore.setState({ general: { locale: 'zh-CN', autoBackup: 'off' } })
    render(<GeneralTab />)
    const select = screen.getByLabelText(/locale|语言/i) as HTMLSelectElement
    expect(select.value).toBe('zh-CN')
  })

  it('changing the locale calls setGeneral with new value AND switches i18n', () => {
    const setGeneral = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      general: { locale: 'zh-CN', autoBackup: 'off' },
      setGeneral
    })
    render(<GeneralTab />)
    const select = screen.getByLabelText(/locale|语言/i)
    fireEvent.change(select, { target: { value: 'en-US' } })
    expect(setGeneral).toHaveBeenCalledWith({ locale: 'en-US' })
  })

  it('shows vault path read-only with copy button', () => {
    render(<GeneralTab />)
    expect(screen.getByText('/tmp/my-grove')).toBeTruthy()
    expect(screen.getByRole('button', { name: /copy|复制/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/GeneralTab.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the component**

```tsx
// src/components/settings/GeneralTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useGroveStore } from '@/stores/grove'
import { i18n } from '@/i18n'
import type { Locale } from '@shared/settings-types'

export function GeneralTab(): JSX.Element {
  const { t } = useTranslation()
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const grove = useGroveStore((s) => s.current)

  return (
    <div data-testid="settings-tab-general" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.general')}</h3>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.general.locale')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={general.locale}
          onChange={(e) => {
            const next = e.target.value as Locale
            void setGeneral({ locale: next })
            void i18n.changeLanguage(next)
          }}
        >
          <option value="zh-CN">中文（简体）</option>
          <option value="en-US">English</option>
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.general.autoBackup')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={general.autoBackup}
          disabled
          title={t('settings.common.comingSoon')}
        >
          <option value="off">Off</option>
        </select>
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium">{t('settings.general.vaultPath')}</span>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-3 py-1 text-sm">{grove?.path ?? '—'}</code>
          {grove?.path && (
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm hover:bg-muted"
              onClick={() => navigator.clipboard.writeText(grove.path)}
            >
              {t('common.copy', { defaultValue: 'Copy' })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/settings/GeneralTab.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: No commit yet — bundle with Appearance tab in Task 8.**

---

<!-- openspec-task: 4.4 -->
### Task 8: Appearance tab + theme/font side-effects

**Files:**
- Create: `src/components/settings/AppearanceTab.tsx`
- Create: `src/components/settings/AppearanceTab.test.tsx`
- Modify: `src/index.css` (add `--font-scale` CSS var on root)

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/settings/AppearanceTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: { settings: { set: vi.fn().mockResolvedValue({ ok: true }) }, on: vi.fn(() => () => {}) }
}))

import { useSettingsStore } from '@/stores/settings'
import { AppearanceTab } from './AppearanceTab'

describe('AppearanceTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
    document.documentElement.dataset.theme = 'system'
    document.documentElement.style.removeProperty('--font-scale')
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
  })
  afterEach(() => cleanup())

  it('renders three theme radios', () => {
    render(<AppearanceTab />)
    expect(screen.getByRole('radio', { name: /system|系统/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /light|浅色/i })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /dark|深色/i })).toBeTruthy()
  })

  it('clicking dark radio applies data-theme=dark immediately and calls setAppearance', () => {
    const setAppearance = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
      setAppearance
    })
    render(<AppearanceTab />)
    fireEvent.click(screen.getByRole('radio', { name: /dark|深色/i }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(setAppearance).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('font-scale slider sets --font-scale CSS var on the root element', () => {
    const setAppearance = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
      setAppearance
    })
    render(<AppearanceTab />)
    const slider = screen.getByRole('slider', { name: /font.*scale|字号/i })
    fireEvent.change(slider, { target: { value: '1.2' } })
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/AppearanceTab.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the component**

```tsx
// src/components/settings/AppearanceTab.tsx
import type { JSX } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@shared/settings-types'

const FONT_FALLBACK = ['system-ui', 'Georgia', 'SF Mono', 'Courier New']

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  document.documentElement.dataset.theme = effective
}

function applyFontScale(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

export function AppearanceTab(): JSX.Element {
  const { t } = useTranslation()
  const appearance = useSettingsStore((s) => s.appearance)
  const setAppearance = useSettingsStore((s) => s.setAppearance)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    applyFontScale(appearance.fontScale)
  }, [appearance.fontScale])

  return (
    <div data-testid="settings-tab-appearance" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.appearance')}</h3>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('settings.appearance.theme')}</legend>
        <div className="flex gap-4">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={appearance.theme === value}
                onChange={() => {
                  applyTheme(value)
                  void setAppearance({ theme: value })
                }}
              />
              {t(`settings.appearance.theme.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.appearance.fontScale')}</span>
        <input
          type="range"
          aria-label={t('settings.appearance.fontScale')}
          min={0.8}
          max={1.4}
          step={0.1}
          value={appearance.fontScale}
          onChange={(e) => {
            const value = Number(e.target.value)
            applyFontScale(value)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => void setAppearance({ fontScale: value }), 300)
          }}
        />
        <span className="ml-3 text-sm text-muted-foreground">{appearance.fontScale.toFixed(1)}x</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.appearance.editorFont')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={appearance.editorFont}
          onChange={(e) => {
            void setAppearance({ editorFont: e.target.value })
            document.documentElement.style.setProperty('--editor-font', e.target.value)
          }}
        >
          {FONT_FALLBACK.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
```

- [ ] **Step 4: Add `--font-scale` CSS variable to root**

Modify `src/index.css`. After `:root { ... }` (around line 1-25), add the var:

```css
/* src/index.css — add inside the existing :root selector */
:root {
  /* ... existing ... */
  --font-scale: 1;
}

html {
  font-size: calc(16px * var(--font-scale));
}
```

- [ ] **Step 5: Run all settings UI tests**

Run: `npx vitest run src/components/settings/ src/pages/Settings.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify the dev app boots and the rail renders**

Run in foreground: `npm run dev`
Open the app, navigate to `/settings`. Verify:
- The rail shows the four tab labels (zh-CN: 通用 / 外观 / AI / 浏览器)
- `/settings` redirects to `/settings/general`
- Clicking each rail entry switches the right pane
- (Stop the dev server — `Ctrl+C`)

- [ ] **Step 7: Commit (bundles Tasks 6-8)**

```bash
git add \
  src/pages/Settings.tsx \
  src/pages/Settings.test.tsx \
  src/components/settings/SettingsLayout.tsx \
  src/components/settings/GeneralTab.tsx \
  src/components/settings/GeneralTab.test.tsx \
  src/components/settings/AppearanceTab.tsx \
  src/components/settings/AppearanceTab.test.tsx \
  src/App.tsx \
  src/index.css
git commit -m "feat(phase-13): /settings page skeleton + General + Appearance tabs"
```

---

## End-of-plan checks

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — clean
- [ ] Dev app: open `/settings`, switch theme to dark and verify `data-theme="dark"` immediately appears on `<html>`
- [ ] Dev app: drag font slider to 1.2 → text grows; reload → font scale persists (because `loadAll()` re-fetches from main)

Surface area for Plan 3:
- `useSettingsStore` is the single source of truth for the renderer
- `installSettingsSubscriber` is already running — Plan 3 only needs to read from the store
- `AiTabStub` and `BrowserTabStub` are placeholders to be replaced
