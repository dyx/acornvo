# Phase-13 Secure Storage & Settings — Plan 1: Schema + Storage Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add migration 006 (`settings`, `settings_secrets`, `ai_provider_profiles`), the matching shared types/defaults, and the main-process storage layer (`store` / `secrets` / `profiles` / `profile-key`) with full unit-test coverage.

**Architecture:** Settings live in the **per-grove SQLite DB** (`<grove>/.acornvo/index.db`) via migration 006 — matches the spec verbatim. Secrets are encrypted via Electron `safeStorage.encryptString()` and stored as BLOBs in `settings_secrets`. The store emits a typed `onChange` event consumed both by main-process subscribers (ad-block module in Plan 3) and by the IPC broadcaster (Plan 2) that fans out `'settings:changed'` to renderers.

**Tech Stack:** TypeScript 5, better-sqlite3 12, Electron 39 (`safeStorage`), Vitest, `uuid`.

**Cross-plan decisions (locked here, referenced by later plans):**

1. **Event channel name = `'settings:changed'`** (colon) — diverges from `spec/settings-store/spec.md:23` which writes `'settings.changed'` (dot). Codebase precedent in `shared/ipc-contract.ts:222-225` is colon-for-events / dot-for-requests, and the spec name would collide with a hypothetical `settings.changed` request channel. The dot-vs-colon decision is *plumbing*, not behaviour, so we follow the codebase convention. Reflect this in the OpenSpec spec when archiving.
2. **Settings DB scope = per-grove**, following the spec's literal use of `migrations/006`. AI keys are still per-user (encrypted blobs are tied to OS user via `safeStorage`), but the `ai_provider_profiles` rows themselves are per-grove. This matches Obsidian-style "vault settings". If we later want global settings, that's a separate spec.
3. **Defaults are merged on read, never written** (spec `settings-store/spec.md:52`).
4. **Secret key naming convention**: `ai.key.<profile-uuid>` for AI profiles (spec `ai-provider-profiles/spec.md:36`).

---

<!-- openspec-task: 1.1 -->
### Task 1: Migration 006 SQL file

**Files:**
- Create: `electron/services/db/migrations/006_settings.sql`
- Create: `electron/services/db/migrations/006_settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/services/db/migrations/006_settings.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url))

describe('migration 006 — settings + secrets + ai profiles', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
  })
  afterEach(() => db.close())

  it('bumps user_version to 6', () => {
    expect(db.pragma('user_version', { simple: true }) as number).toBe(6)
  })

  it('creates settings table with composite primary key (ns, key)', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
    expect(tables).toContain('settings')
    const info = db.pragma("table_info('settings')") as { name: string; pk: number; notnull: number }[]
    expect(info.find((c) => c.name === 'ns')?.pk).toBe(1)
    expect(info.find((c) => c.name === 'key')?.pk).toBe(2)
    expect(info.find((c) => c.name === 'value_json')?.notnull).toBe(1)
    expect(info.find((c) => c.name === 'updated_at')?.notnull).toBe(1)
  })

  it('creates settings_secrets table with key as primary key + BLOB column', () => {
    const info = db.pragma("table_info('settings_secrets')") as { name: string; pk: number; type: string }[]
    expect(info.find((c) => c.name === 'key')?.pk).toBe(1)
    expect(info.find((c) => c.name === 'encrypted_value')?.type.toUpperCase()).toBe('BLOB')
  })

  it('creates ai_provider_profiles with unique index on name', () => {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((r) => r.name)
    expect(tables).toContain('ai_provider_profiles')
    const indices = (db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[])
      .map((r) => r.name)
    expect(indices).toContain('idx_ai_profiles_name')
    db.exec(`
      INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
      VALUES ('a', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
    `)
    expect(() =>
      db.exec(`
        INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
        VALUES ('b', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
      `)
    ).toThrow(/UNIQUE/i)
  })

  it('ai_provider_profiles default values: temperature=0.7, top_p=1.0', () => {
    db.exec(`
      INSERT INTO ai_provider_profiles (id, name, provider, model, created_at, updated_at)
      VALUES ('a', 'p1', 'openai', 'gpt-4o', '2026-05-03', '2026-05-03')
    `)
    const row = db.prepare('SELECT temperature, top_p FROM ai_provider_profiles WHERE id=?').get('a') as
      { temperature: number; top_p: number }
    expect(row.temperature).toBe(0.7)
    expect(row.top_p).toBe(1.0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/services/db/migrations/006_settings.test.ts`
Expected: FAIL — no `006_settings.sql` file exists, `user_version` stays at 3.

- [ ] **Step 3: Create the migration SQL**

```sql
-- electron/services/db/migrations/006_settings.sql
-- migration: 006_settings
-- Adds the application settings + secrets + AI provider profile tables.
-- Settings live in the per-grove DB; secret BLOBs are encrypted via Electron
-- safeStorage (OS user keychain) before write, so they are unreadable on a
-- different machine even if this DB file is copied.

CREATE TABLE settings (
  ns TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ns, key)
);

CREATE TABLE settings_secrets (
  key TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_provider_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  base_url TEXT,
  model TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.7,
  top_p REAL NOT NULL DEFAULT 1.0,
  max_tokens INTEGER,
  api_key_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_ai_profiles_name ON ai_provider_profiles(name);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/services/db/migrations/006_settings.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the full migration suite to confirm no regressions**

Run: `npx vitest run electron/services/db/`
Expected: PASS — including 001/002/003 tests.

- [ ] **Step 6: Commit**

```bash
git add electron/services/db/migrations/006_settings.sql electron/services/db/migrations/006_settings.test.ts
git commit -m "feat(phase-13): migration 006 — settings, settings_secrets, ai_provider_profiles tables"
```

---

<!-- openspec-task: 1.2 -->
### Task 2: Shared settings types

**Files:**
- Create: `shared/settings-types.ts`
- Create: `shared/settings-types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/settings-types.test.ts
import { describe, it, expectTypeOf } from 'vitest'
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  AiProviderProfile,
  AiProviderKind,
  SettingsNamespace,
  SettingsByNs
} from './settings-types'

describe('settings-types module', () => {
  it('exposes the four namespace types', () => {
    expectTypeOf<GeneralSettings>().toMatchTypeOf<{ locale: string; autoBackup: string }>()
    expectTypeOf<AppearanceSettings>().toMatchTypeOf<{ theme: string; fontScale: number; editorFont: string }>()
    expectTypeOf<AiSettings>().toMatchTypeOf<{ defaultProfileId: string | null }>()
    expectTypeOf<BrowserSettings>().toMatchTypeOf<{
      blockAds: boolean
      clipImagesLocalize: boolean
      searchEngine: 'google' | 'bing' | 'duckduckgo'
    }>()
  })

  it('AiProviderProfile has apiKeyRef but no apiKey (plaintext never crosses IPC)', () => {
    expectTypeOf<AiProviderProfile>().toMatchTypeOf<{
      id: string
      name: string
      provider: AiProviderKind
      baseUrl: string | null
      model: string
      temperature: number
      topP: number
      maxTokens: number | null
      apiKeyRef: string | null
      createdAt: string
      updatedAt: string
    }>()
    // @ts-expect-error — apiKey must NOT exist on the over-the-wire shape
    expectTypeOf<AiProviderProfile>().toHaveProperty('apiKey')
  })

  it('SettingsByNs maps each known namespace to its concrete type', () => {
    expectTypeOf<SettingsByNs['general']>().toEqualTypeOf<GeneralSettings>()
    expectTypeOf<SettingsByNs['appearance']>().toEqualTypeOf<AppearanceSettings>()
    expectTypeOf<SettingsByNs['ai']>().toEqualTypeOf<AiSettings>()
    expectTypeOf<SettingsByNs['browser']>().toEqualTypeOf<BrowserSettings>()
  })

  it('SettingsNamespace union has exactly the four known names', () => {
    expectTypeOf<SettingsNamespace>().toEqualTypeOf<'general' | 'appearance' | 'ai' | 'browser'>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/settings-types.test.ts`
Expected: FAIL — `Cannot find module './settings-types'`.

- [ ] **Step 3: Create the types module**

```ts
// shared/settings-types.ts
/**
 * Phase-13 settings — single source of truth for cross-process types.
 *
 * The four namespaces (`general` / `appearance` / `ai` / `browser`) match the
 * `settings` table's `ns` column. Each namespace has a fixed shape; unknown
 * keys passed through `set()` are rejected by the store (Plan 1 task 5).
 */

export type Locale = 'zh-CN' | 'en-US'
export type Theme = 'system' | 'light' | 'dark'
export type SearchEngine = 'google' | 'bing' | 'duckduckgo'
export type AiProviderKind = 'openai' | 'anthropic' | 'ollama' | 'openai-compatible'

export interface GeneralSettings {
  locale: Locale
  autoBackup: 'off' | 'daily' | 'weekly'
}

export interface AppearanceSettings {
  theme: Theme
  fontScale: number
  editorFont: string
}

export interface AiSettings {
  defaultProfileId: string | null
}

export interface BrowserSettings {
  blockAds: boolean
  clipImagesLocalize: boolean
  searchEngine: SearchEngine
}

export type SettingsNamespace = 'general' | 'appearance' | 'ai' | 'browser'

export type SettingsByNs = {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
}

/**
 * Profile shape over the IPC boundary. NEVER contains `apiKey` plaintext —
 * only the opaque `apiKeyRef` pointer into `settings_secrets`. The main-only
 * decryption path is `getProfileDecryptedKey(id)` (Plan 1 task 8).
 */
export interface AiProviderProfile {
  id: string
  name: string
  provider: AiProviderKind
  baseUrl: string | null
  model: string
  temperature: number
  topP: number
  maxTokens: number | null
  apiKeyRef: string | null
  createdAt: string
  updatedAt: string
}

/** Input shape for `profiles.create` / `profiles.update`. Plaintext apiKey IS
 *  allowed here (renderer → main only); main encrypts before storage. */
export interface ProfileCreateInput {
  name: string
  provider: AiProviderKind
  baseUrl?: string | null
  model: string
  temperature?: number
  topP?: number
  maxTokens?: number | null
  apiKey?: string
}

export interface ProfileUpdateInput {
  name?: string
  provider?: AiProviderKind
  baseUrl?: string | null
  model?: string
  temperature?: number
  topP?: number
  maxTokens?: number | null
  /** non-empty string → overwrite secret; '' → delete secret; undefined → leave alone */
  apiKey?: string
}

/** Payload for the `'settings:changed'` IPC event. */
export interface SettingsChangedPayload {
  ns: SettingsNamespace
  key: string
  newValue: unknown
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/settings-types.test.ts`
Expected: PASS — type tests green.

- [ ] **Step 5: Verify typecheck passes for both projects**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add shared/settings-types.ts shared/settings-types.test.ts
git commit -m "feat(phase-13): shared/settings-types — namespace shapes + profile types"
```

---

<!-- openspec-task: 1.3 -->
### Task 3: Defaults module

**Files:**
- Create: `electron/settings/defaults.ts`
- Create: `electron/settings/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/defaults.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULTS, getDefault, isKnownNamespace } from './defaults'

describe('DEFAULTS', () => {
  it('exposes all four namespaces with PRD-mandated values', () => {
    expect(DEFAULTS.general).toEqual({ locale: 'zh-CN', autoBackup: 'off' })
    expect(DEFAULTS.appearance).toEqual({
      theme: 'system',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    expect(DEFAULTS.ai).toEqual({ defaultProfileId: null })
    expect(DEFAULTS.browser).toEqual({
      blockAds: true,
      clipImagesLocalize: false,
      searchEngine: 'google'
    })
  })

  it('getDefault returns the namespace shape — frozen / structurally cloned', () => {
    const a = getDefault('appearance')
    expect(a).toEqual(DEFAULTS.appearance)
    // Mutating the returned object MUST NOT mutate DEFAULTS
    a.theme = 'dark'
    expect(DEFAULTS.appearance.theme).toBe('system')
  })

  it('isKnownNamespace accepts the 4 names and rejects others', () => {
    expect(isKnownNamespace('general')).toBe(true)
    expect(isKnownNamespace('appearance')).toBe(true)
    expect(isKnownNamespace('ai')).toBe(true)
    expect(isKnownNamespace('browser')).toBe(true)
    expect(isKnownNamespace('foo')).toBe(false)
    expect(isKnownNamespace('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/defaults.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the defaults module**

```ts
// electron/settings/defaults.ts
import type {
  GeneralSettings,
  AppearanceSettings,
  AiSettings,
  BrowserSettings,
  SettingsNamespace,
  SettingsByNs
} from '@shared/settings-types'

export const DEFAULTS: {
  general: GeneralSettings
  appearance: AppearanceSettings
  ai: AiSettings
  browser: BrowserSettings
} = {
  general: { locale: 'zh-CN', autoBackup: 'off' },
  appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
  ai: { defaultProfileId: null },
  browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
}

const KNOWN_NAMESPACES: ReadonlyArray<SettingsNamespace> = ['general', 'appearance', 'ai', 'browser']

export function isKnownNamespace(value: unknown): value is SettingsNamespace {
  return typeof value === 'string' && (KNOWN_NAMESPACES as readonly string[]).includes(value)
}

/** Returns a fresh shallow clone of the defaults so callers can mutate freely. */
export function getDefault<NS extends SettingsNamespace>(ns: NS): SettingsByNs[NS] {
  return { ...DEFAULTS[ns] } as SettingsByNs[NS]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/settings/defaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/settings/defaults.ts electron/settings/defaults.test.ts
git commit -m "feat(phase-13): electron/settings/defaults — DEFAULTS + isKnownNamespace + getDefault"
```

---

<!-- openspec-task: 1.4 -->
### Task 4: safeStorage availability cache

**Files:**
- Create: `electron/settings/safe-storage-state.ts`
- Create: `electron/settings/safe-storage-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/safe-storage-state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true)
  }
}))

import { safeStorage } from 'electron'
import { initSafeStorageAvailability, isSafeStorageAvailable, __resetForTest } from './safe-storage-state'

const mockIsAvailable = safeStorage.isEncryptionAvailable as unknown as ReturnType<typeof vi.fn>

describe('safeStorage availability cache', () => {
  beforeEach(() => {
    __resetForTest()
    mockIsAvailable.mockReset().mockReturnValue(true)
  })

  it('throws if isSafeStorageAvailable() called before init', () => {
    expect(() => isSafeStorageAvailable()).toThrow(/not initialized/i)
  })

  it('caches the value on init — subsequent reads do not re-call electron', () => {
    initSafeStorageAvailability()
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
    expect(isSafeStorageAvailable()).toBe(true)
    expect(isSafeStorageAvailable()).toBe(true)
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
  })

  it('captures false correctly (Linux without libsecret case)', () => {
    mockIsAvailable.mockReturnValue(false)
    initSafeStorageAvailability()
    expect(isSafeStorageAvailable()).toBe(false)
  })

  it('init twice is idempotent and does NOT re-query electron', () => {
    initSafeStorageAvailability()
    initSafeStorageAvailability()
    expect(mockIsAvailable).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/safe-storage-state.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

```ts
// electron/settings/safe-storage-state.ts
import { safeStorage } from 'electron'

/**
 * `safeStorage.isEncryptionAvailable()` may only be called after
 * `app.whenReady()`. We call it once at bootstrap and cache the result for
 * the rest of the process lifetime so the secrets-store and the IPC handler
 * for the AI tab banner have a synchronous answer.
 */
let cached: boolean | null = null

export function initSafeStorageAvailability(): void {
  if (cached !== null) return
  cached = safeStorage.isEncryptionAvailable()
}

export function isSafeStorageAvailable(): boolean {
  if (cached === null) {
    throw new Error(
      'safe-storage-state not initialized — call initSafeStorageAvailability() after app.whenReady()'
    )
  }
  return cached
}

/** Test-only escape hatch. */
export function __resetForTest(): void {
  cached = null
}
```

- [ ] **Step 4: Wire init into bootstrap**

Open `electron/main.ts`. After `installCsp()` (line 69) but before `registerHandlers(ipcHandlers)` (line 70), insert:

```ts
import { initSafeStorageAvailability } from './settings/safe-storage-state'
// ... in bootstrap(), after installCsp():
initSafeStorageAvailability()
```

The full insertion:

```ts
// electron/main.ts (existing lines 66-71, after change)
async function bootstrap(): Promise<void> {
  await initLogger()
  await app.whenReady()
  installCsp()
  initSafeStorageAvailability()  // <-- NEW
  registerHandlers(ipcHandlers)
  // ...
}
```

- [ ] **Step 5: Run all settings tests + the typecheck**

Run: `npx vitest run electron/settings/ && npm run typecheck:node`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add electron/settings/safe-storage-state.ts electron/settings/safe-storage-state.test.ts electron/main.ts
git commit -m "feat(phase-13): cache safeStorage.isEncryptionAvailable() at bootstrap"
```

---

<!-- openspec-task: 2.1 -->
### Task 5: Settings store (`get` / `set` / `onChange`)

**Files:**
- Create: `electron/settings/store.ts`
- Create: `electron/settings/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/store.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMigrations } from '../services/db/migrations'

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url) + '/../services/db/migrations/000.sql')
  .replace(/\/000\.sql$/, '')

// Mock dbService.requireCurrent() to return our in-memory DB
vi.mock('../services/db', () => ({
  dbService: {
    requireCurrent: vi.fn()
  }
}))

import { dbService } from '../services/db'
import { settingsStore } from './store'
import { resolve } from 'node:path'

const requireCurrentMock = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const REAL_MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('settingsStore', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, REAL_MIGRATIONS)
    requireCurrentMock.mockReturnValue(db)
    settingsStore.__resetSubscribers()
  })
  afterEach(() => {
    db.close()
  })

  it('get(ns) returns DEFAULTS when no rows exist', () => {
    expect(settingsStore.get('appearance')).toEqual({
      theme: 'system',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    // Confirm no rows written
    const count = db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('set(ns, patch) UPSERTs rows and merges over defaults on subsequent get', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    expect(settingsStore.get('appearance')).toEqual({
      theme: 'dark',
      fontScale: 1.0,
      editorFont: 'system-ui'
    })
    const row = db.prepare("SELECT value_json FROM settings WHERE ns='appearance' AND key='theme'").get() as
      { value_json: string }
    expect(JSON.parse(row.value_json)).toBe('dark')
  })

  it('set fires onChange listener with { ns, key, newValue, oldValue } per key', () => {
    const events: unknown[] = []
    settingsStore.onChange((ev) => events.push(ev))

    settingsStore.set('appearance', { theme: 'dark', fontScale: 1.2 })
    expect(events).toEqual([
      { ns: 'appearance', key: 'theme', newValue: 'dark', oldValue: 'system' },
      { ns: 'appearance', key: 'fontScale', newValue: 1.2, oldValue: 1.0 }
    ])
  })

  it('set with the same value does NOT fire onChange (idempotent)', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    const events: unknown[] = []
    settingsStore.onChange((ev) => events.push(ev))
    settingsStore.set('appearance', { theme: 'dark' })
    expect(events).toEqual([])
  })

  it('get with unknown ns throws E_UNKNOWN_NAMESPACE; DB untouched', () => {
    expect(() => settingsStore.get('foo' as never)).toThrow(/E_UNKNOWN_NAMESPACE/)
    expect(() => settingsStore.set('foo' as never, {})).toThrow(/E_UNKNOWN_NAMESPACE/)
  })

  it('onChange returns an unsubscribe handle', () => {
    const events: unknown[] = []
    const unsub = settingsStore.onChange((ev) => events.push(ev))
    settingsStore.set('appearance', { theme: 'dark' })
    expect(events.length).toBe(1)
    unsub()
    settingsStore.set('appearance', { theme: 'light' })
    expect(events.length).toBe(1)
  })

  it('updated_at is set in ISO format on each write', () => {
    settingsStore.set('appearance', { theme: 'dark' })
    const row = db
      .prepare("SELECT updated_at FROM settings WHERE ns='appearance' AND key='theme'")
      .get() as { updated_at: string }
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Create the store**

```ts
// electron/settings/store.ts
import { EventEmitter } from 'node:events'
import { IpcError } from '@shared/ipc-contract'
import type {
  SettingsNamespace,
  SettingsByNs,
  SettingsChangedPayload
} from '@shared/settings-types'
import { dbService } from '../services/db'
import { DEFAULTS, getDefault, isKnownNamespace } from './defaults'

interface SettingChangeEvent {
  ns: SettingsNamespace
  key: string
  newValue: unknown
  oldValue: unknown
}

const emitter = new EventEmitter()

function readNamespaceRaw(ns: SettingsNamespace): Record<string, unknown> {
  const db = dbService.requireCurrent()
  const rows = db.prepare('SELECT key, value_json FROM settings WHERE ns = ?').all(ns) as
    { key: string; value_json: string }[]
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    out[r.key] = JSON.parse(r.value_json)
  }
  return out
}

function get<NS extends SettingsNamespace>(ns: NS): SettingsByNs[NS] {
  if (!isKnownNamespace(ns)) {
    throw new IpcError('E_UNKNOWN_NAMESPACE', `unknown settings namespace: ${ns}`)
  }
  const raw = readNamespaceRaw(ns)
  return { ...getDefault(ns), ...raw } as SettingsByNs[NS]
}

function set<NS extends SettingsNamespace>(ns: NS, patch: Partial<SettingsByNs[NS]>): void {
  if (!isKnownNamespace(ns)) {
    throw new IpcError('E_UNKNOWN_NAMESPACE', `unknown settings namespace: ${ns}`)
  }
  const db = dbService.requireCurrent()
  const before = get(ns)
  const updatedAt = new Date().toISOString()
  const upsert = db.prepare(`
    INSERT INTO settings (ns, key, value_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(ns, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `)
  const events: SettingChangeEvent[] = []
  const tx = db.transaction((entries: [string, unknown][]) => {
    for (const [key, value] of entries) {
      const oldValue = (before as Record<string, unknown>)[key]
      // Idempotent: skip if shallow-equal via JSON encoding
      if (JSON.stringify(oldValue) === JSON.stringify(value)) continue
      upsert.run(ns, key, JSON.stringify(value), updatedAt)
      events.push({ ns, key, newValue: value, oldValue })
    }
  })
  tx(Object.entries(patch as Record<string, unknown>))
  for (const ev of events) emitter.emit('change', ev)
}

function onChange(listener: (ev: SettingChangeEvent) => void): () => void {
  emitter.on('change', listener)
  return () => emitter.off('change', listener)
}

/** Test-only: drop all listeners. */
function __resetSubscribers(): void {
  emitter.removeAllListeners('change')
}

/** Convenience for the broadcaster (Plan 2): emit shape matches the IPC payload. */
export type { SettingChangeEvent, SettingsChangedPayload }

export const settingsStore = {
  get,
  set,
  onChange,
  __resetSubscribers
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/settings/store.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add electron/settings/store.ts electron/settings/store.test.ts
git commit -m "feat(phase-13): settings store with get/set/onChange + DEFAULTS merge"
```

---

<!-- openspec-task: 2.2 -->
### Task 6: Secrets store

**Files:**
- Create: `electron/settings/secrets.ts`
- Create: `electron/settings/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/secrets.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({
  dbService: { requireCurrent: vi.fn() }
}))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`, 'utf8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8').replace(/^enc:/, ''))
  }
}))

import { dbService } from '../services/db'
import { safeStorage } from 'electron'
import { secretsStore } from './secrets'
import { __resetForTest as resetSafeStorage, initSafeStorageAvailability } from './safe-storage-state'

const requireCurrentMock = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const isEncAvailableMock = safeStorage.isEncryptionAvailable as unknown as ReturnType<typeof vi.fn>
const encryptMock = safeStorage.encryptString as unknown as ReturnType<typeof vi.fn>
const decryptMock = safeStorage.decryptString as unknown as ReturnType<typeof vi.fn>

const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('secretsStore', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafeStorage()
    isEncAvailableMock.mockReturnValue(true)
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    requireCurrentMock.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('set(key, plain) writes encrypted BLOB; get(key) returns decrypted plaintext', () => {
    secretsStore.set('ai.key.uuid-1', 'sk-abc123')
    expect(encryptMock).toHaveBeenCalledWith('sk-abc123')

    const row = db
      .prepare('SELECT encrypted_value, updated_at FROM settings_secrets WHERE key=?')
      .get('ai.key.uuid-1') as { encrypted_value: Buffer; updated_at: string }
    expect(row.encrypted_value).toBeInstanceOf(Buffer)
    expect(row.encrypted_value.toString('utf8')).toBe('enc:sk-abc123')
    expect(row.updated_at).toMatch(/^\d{4}-/)

    expect(secretsStore.get('ai.key.uuid-1')).toBe('sk-abc123')
    expect(decryptMock).toHaveBeenCalled()
  })

  it('get(key) returns null for missing key', () => {
    expect(secretsStore.get('missing')).toBeNull()
  })

  it('set overwrites existing row with new encrypted value', () => {
    secretsStore.set('k', 'v1')
    secretsStore.set('k', 'v2')
    expect(secretsStore.get('k')).toBe('v2')
    const count = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets WHERE key=?').get('k') as { n: number }
    expect(count.n).toBe(1)
  })

  it('delete(key) removes the row; subsequent get returns null', () => {
    secretsStore.set('k', 'v')
    secretsStore.delete('k')
    expect(secretsStore.get('k')).toBeNull()
  })

  it('delete(missing) is a no-op (no throw)', () => {
    expect(() => secretsStore.delete('not-there')).not.toThrow()
  })

  it('throws E_KEYCHAIN_UNAVAILABLE when safeStorage cannot encrypt', () => {
    resetSafeStorage()
    isEncAvailableMock.mockReturnValue(false)
    initSafeStorageAvailability()
    expect(() => secretsStore.set('k', 'v')).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    expect(() => secretsStore.get('k')).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    // delete is allowed even when keychain is unavailable (so cleanup works)
    expect(() => secretsStore.delete('k')).not.toThrow()
    // No row was created
    const n = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets').get() as { n: number }
    expect(n.n).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/secrets.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the secrets store**

```ts
// electron/settings/secrets.ts
import { safeStorage } from 'electron'
import { IpcError } from '@shared/ipc-contract'
import { dbService } from '../services/db'
import { isSafeStorageAvailable } from './safe-storage-state'

function requireKeychain(): void {
  if (!isSafeStorageAvailable()) {
    throw new IpcError('E_KEYCHAIN_UNAVAILABLE', 'OS keychain (safeStorage) is not available')
  }
}

function set(key: string, plain: string): void {
  requireKeychain()
  const enc = safeStorage.encryptString(plain)
  const db = dbService.requireCurrent()
  db.prepare(`
    INSERT INTO settings_secrets (key, encrypted_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = excluded.updated_at
  `).run(key, enc, new Date().toISOString())
}

function get(key: string): string | null {
  requireKeychain()
  const db = dbService.requireCurrent()
  const row = db.prepare('SELECT encrypted_value FROM settings_secrets WHERE key = ?').get(key) as
    | { encrypted_value: Buffer }
    | undefined
  if (!row) return null
  return safeStorage.decryptString(row.encrypted_value)
}

/** Idempotent. Allowed even when the keychain is unavailable so callers can
 *  clean up orphan rows (e.g. when deleting a profile after a reboot into a
 *  Linux session without libsecret). */
function deleteSecret(key: string): void {
  const db = dbService.requireCurrent()
  db.prepare('DELETE FROM settings_secrets WHERE key = ?').run(key)
}

export const secretsStore = {
  set,
  get,
  delete: deleteSecret
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/settings/secrets.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add electron/settings/secrets.ts electron/settings/secrets.test.ts
git commit -m "feat(phase-13): secrets store with safeStorage encryption + E_KEYCHAIN_UNAVAILABLE"
```

---

<!-- openspec-task: 2.3 -->
### Task 7: AI provider profiles CRUD

**Files:**
- Create: `electron/settings/profiles.ts`
- Create: `electron/settings/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/profiles.test.ts
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
  }
}))

import { dbService } from '../services/db'
import { profilesStore } from './profiles'
import { secretsStore } from './secrets'
import { settingsStore } from './store'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('profilesStore', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    settingsStore.__resetSubscribers()
  })
  afterEach(() => db.close())

  it('create({ name, provider, model }) returns { id } and inserts a row WITHOUT api_key_ref', () => {
    const { id } = profilesStore.create({ name: 'p1', provider: 'openai', model: 'gpt-4o' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(8)
    const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE id=?').get(id) as
      { name: string; api_key_ref: string | null }
    expect(row.name).toBe('p1')
    expect(row.api_key_ref).toBeNull()
  })

  it('create with apiKey saves secret first then writes api_key_ref', () => {
    const { id } = profilesStore.create({
      name: 'p2',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-abc'
    })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('sk-abc')
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as
      { api_key_ref: string }
    expect(row.api_key_ref).toBe(`ai.key.${id}`)
  })

  it('create with duplicate name throws E_DUPLICATE_NAME; no row, no secret', () => {
    profilesStore.create({ name: 'dup', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-1' })
    expect(() =>
      profilesStore.create({ name: 'dup', provider: 'anthropic', model: 'claude-4', apiKey: 'sk-2' })
    ).toThrow(/E_DUPLICATE_NAME/)
    const count = db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles WHERE name=?').get('dup') as
      { n: number }
    expect(count.n).toBe(1)
  })

  it('list() returns all profiles WITHOUT apiKey, with apiKeyRef', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-a' })
    profilesStore.create({ name: 'b', provider: 'anthropic', model: 'claude-4', apiKey: 'sk-b' })
    const list = profilesStore.list()
    expect(list).toHaveLength(2)
    for (const p of list) {
      expect(p).not.toHaveProperty('apiKey')
      expect(p.apiKeyRef).toMatch(/^ai\.key\./)
    }
  })

  it('update with apiKey="newkey" overwrites secret, leaves other fields unchanged', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'old' })
    profilesStore.update(id, { apiKey: 'new' })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('new')
    const row = db.prepare('SELECT name FROM ai_provider_profiles WHERE id=?').get(id) as { name: string }
    expect(row.name).toBe('p')
  })

  it('update with apiKey="" deletes the secret and sets api_key_ref=NULL', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk' })
    profilesStore.update(id, { apiKey: '' })
    expect(secretsStore.get(`ai.key.${id}`)).toBeNull()
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as
      { api_key_ref: string | null }
    expect(row.api_key_ref).toBeNull()
  })

  it('update with apiKey=undefined leaves secret untouched', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'keep' })
    profilesStore.update(id, { name: 'p2' })
    expect(secretsStore.get(`ai.key.${id}`)).toBe('keep')
  })

  it('update on missing id throws E_PROFILE_NOT_FOUND', () => {
    expect(() => profilesStore.update('does-not-exist', { name: 'x' })).toThrow(/E_PROFILE_NOT_FOUND/)
  })

  it('update name conflict throws E_DUPLICATE_NAME', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    const { id } = profilesStore.create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    expect(() => profilesStore.update(id, { name: 'a' })).toThrow(/E_DUPLICATE_NAME/)
  })

  it('delete cascades to secret in a single transaction', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk' })
    profilesStore.delete(id)
    expect(db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles WHERE id=?').get(id)).toMatchObject({ n: 0 })
    expect(secretsStore.get(`ai.key.${id}`)).toBeNull()
  })

  it('delete on default profile reassigns defaultProfileId to first remaining', () => {
    const { id: a } = profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o' })
    const { id: b } = profilesStore.create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    settingsStore.set('ai', { defaultProfileId: a })
    profilesStore.delete(a)
    expect(settingsStore.get('ai').defaultProfileId).toBe(b)
  })

  it('delete on default profile (last one) sets defaultProfileId=null', () => {
    const { id } = profilesStore.create({ name: 'only', provider: 'openai', model: 'gpt-4o' })
    settingsStore.set('ai', { defaultProfileId: id })
    profilesStore.delete(id)
    expect(settingsStore.get('ai').defaultProfileId).toBeNull()
  })

  it('delete on missing id throws E_PROFILE_NOT_FOUND', () => {
    expect(() => profilesStore.delete('nope')).toThrow(/E_PROFILE_NOT_FOUND/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/profiles.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the profiles module**

```ts
// electron/settings/profiles.ts
import { v4 as uuidv4 } from 'uuid'
import { IpcError } from '@shared/ipc-contract'
import type {
  AiProviderProfile,
  ProfileCreateInput,
  ProfileUpdateInput
} from '@shared/settings-types'
import { dbService } from '../services/db'
import { secretsStore } from './secrets'
import { settingsStore } from './store'

interface ProfileRow {
  id: string
  name: string
  provider: string
  base_url: string | null
  model: string
  temperature: number
  top_p: number
  max_tokens: number | null
  api_key_ref: string | null
  created_at: string
  updated_at: string
}

function rowToProfile(row: ProfileRow): AiProviderProfile {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as AiProviderProfile['provider'],
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    topP: row.top_p,
    maxTokens: row.max_tokens,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function list(): AiProviderProfile[] {
  const db = dbService.requireCurrent()
  const rows = db.prepare('SELECT * FROM ai_provider_profiles ORDER BY created_at ASC').all() as ProfileRow[]
  return rows.map(rowToProfile)
}

function create(input: ProfileCreateInput): { id: string } {
  const db = dbService.requireCurrent()
  const exists = db.prepare('SELECT 1 FROM ai_provider_profiles WHERE name = ?').get(input.name)
  if (exists) throw new IpcError('E_DUPLICATE_NAME', `name "${input.name}" is already in use`)

  const id = uuidv4()
  const apiKeyRef = input.apiKey && input.apiKey.length > 0 ? `ai.key.${id}` : null
  const now = new Date().toISOString()

  // Save secret BEFORE writing the row so a keychain failure doesn't leave an
  // orphan profile pointing at a missing secret.
  if (apiKeyRef) {
    secretsStore.set(apiKeyRef, input.apiKey!)
  }

  try {
    db.prepare(`
      INSERT INTO ai_provider_profiles
        (id, name, provider, base_url, model, temperature, top_p, max_tokens, api_key_ref, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.provider,
      input.baseUrl ?? null,
      input.model,
      input.temperature ?? 0.7,
      input.topP ?? 1.0,
      input.maxTokens ?? null,
      apiKeyRef,
      now,
      now
    )
  } catch (err) {
    if (apiKeyRef) secretsStore.delete(apiKeyRef)
    throw err
  }
  return { id }
}

function update(id: string, patch: ProfileUpdateInput): void {
  const db = dbService.requireCurrent()
  const row = db.prepare('SELECT * FROM ai_provider_profiles WHERE id = ?').get(id) as ProfileRow | undefined
  if (!row) throw new IpcError('E_PROFILE_NOT_FOUND', `profile ${id} not found`)

  if (patch.name !== undefined && patch.name !== row.name) {
    const conflict = db.prepare('SELECT 1 FROM ai_provider_profiles WHERE name = ? AND id != ?').get(patch.name, id)
    if (conflict) throw new IpcError('E_DUPLICATE_NAME', `name "${patch.name}" is already in use`)
  }

  // Determine new api_key_ref from patch.apiKey semantics
  let newApiKeyRef = row.api_key_ref
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === '') {
      if (row.api_key_ref) secretsStore.delete(row.api_key_ref)
      newApiKeyRef = null
    } else {
      const ref = row.api_key_ref ?? `ai.key.${id}`
      secretsStore.set(ref, patch.apiKey)
      newApiKeyRef = ref
    }
  }

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE ai_provider_profiles SET
      name = COALESCE(?, name),
      provider = COALESCE(?, provider),
      base_url = COALESCE(?, base_url),
      model = COALESCE(?, model),
      temperature = COALESCE(?, temperature),
      top_p = COALESCE(?, top_p),
      max_tokens = COALESCE(?, max_tokens),
      api_key_ref = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    patch.name ?? null,
    patch.provider ?? null,
    patch.baseUrl ?? null,
    patch.model ?? null,
    patch.temperature ?? null,
    patch.topP ?? null,
    patch.maxTokens ?? null,
    newApiKeyRef,
    now,
    id
  )
}

function deleteProfile(id: string): void {
  const db = dbService.requireCurrent()
  const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?').get(id) as
    | { api_key_ref: string | null }
    | undefined
  if (!row) throw new IpcError('E_PROFILE_NOT_FOUND', `profile ${id} not found`)

  // Delete secret first, then the row. A failure to delete the secret stops
  // the operation before the row is removed (avoids orphans in the rare case
  // where keychain is unavailable AND a stale ref exists).
  if (row.api_key_ref) {
    try {
      secretsStore.delete(row.api_key_ref)
    } catch {
      // delete is no-throw per its contract, but be defensive
    }
  }
  db.prepare('DELETE FROM ai_provider_profiles WHERE id = ?').run(id)

  // If this was the default profile, fall back to the first remaining or null
  const ai = settingsStore.get('ai')
  if (ai.defaultProfileId === id) {
    const next = db.prepare('SELECT id FROM ai_provider_profiles ORDER BY created_at ASC LIMIT 1').get() as
      | { id: string }
      | undefined
    settingsStore.set('ai', { defaultProfileId: next?.id ?? null })
  }
}

export const profilesStore = {
  list,
  create,
  update,
  delete: deleteProfile
}
```

- [ ] **Step 4: Add `E_DUPLICATE_NAME` and `E_PROFILE_NOT_FOUND` to the IpcErrorCode union**

Open `shared/ipc-contract.ts`. Modify lines 14-37 (the `IpcErrorCode` union and `IPC_ERROR_CODES` const) to add the four phase-13 codes:

```ts
// shared/ipc-contract.ts (replace lines 14-37)
export type IpcErrorCode =
  | 'E_INTERNAL'
  | 'E_INVALID_ARGS'
  | 'E_NOT_FOUND'
  | 'E_PERMISSION'
  | 'E_LOCKED'
  | 'E_EXISTS'
  | 'E_TIMEOUT'
  | 'E_ENCODING'
  | 'E_WRITE_VERIFY'
  | 'E_MTIME_MISMATCH'
  | 'E_UNKNOWN_NAMESPACE'
  | 'E_DUPLICATE_NAME'
  | 'E_KEYCHAIN_UNAVAILABLE'
  | 'E_PROFILE_NOT_FOUND'

export const IPC_ERROR_CODES = {
  E_INTERNAL: 'E_INTERNAL',
  E_INVALID_ARGS: 'E_INVALID_ARGS',
  E_NOT_FOUND: 'E_NOT_FOUND',
  E_PERMISSION: 'E_PERMISSION',
  E_LOCKED: 'E_LOCKED',
  E_EXISTS: 'E_EXISTS',
  E_TIMEOUT: 'E_TIMEOUT',
  E_ENCODING: 'E_ENCODING',
  E_WRITE_VERIFY: 'E_WRITE_VERIFY',
  E_MTIME_MISMATCH: 'E_MTIME_MISMATCH',
  E_UNKNOWN_NAMESPACE: 'E_UNKNOWN_NAMESPACE',
  E_DUPLICATE_NAME: 'E_DUPLICATE_NAME',
  E_KEYCHAIN_UNAVAILABLE: 'E_KEYCHAIN_UNAVAILABLE',
  E_PROFILE_NOT_FOUND: 'E_PROFILE_NOT_FOUND'
} as const satisfies Record<IpcErrorCode, IpcErrorCode>
```

- [ ] **Step 5: Run profile tests + typecheck**

Run: `npx vitest run electron/settings/profiles.test.ts && npm run typecheck`
Expected: PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add electron/settings/profiles.ts electron/settings/profiles.test.ts shared/ipc-contract.ts
git commit -m "feat(phase-13): ai_provider_profiles CRUD with secret cascade + new error codes"
```

---

<!-- openspec-task: 2.4 -->
### Task 8: Main-only `getProfileDecryptedKey`

**Files:**
- Create: `electron/settings/profile-key.ts`
- Create: `electron/settings/profile-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/profile-key.test.ts
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
  }
}))

import { dbService } from '../services/db'
import { profilesStore } from './profiles'
import { getProfileDecryptedKey } from './profile-key'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('getProfileDecryptedKey', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('returns the decrypted plaintext for a profile that has a key', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-abc' })
    expect(getProfileDecryptedKey(id)).toBe('sk-abc')
  })

  it('returns null when the profile has no api_key_ref (e.g. local ollama)', () => {
    const { id } = profilesStore.create({ name: 'ollama', provider: 'ollama', model: 'llama3' })
    expect(getProfileDecryptedKey(id)).toBeNull()
  })

  it('returns null for a non-existent profile id', () => {
    expect(getProfileDecryptedKey('no-such-id')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/profile-key.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the module**

```ts
// electron/settings/profile-key.ts
import { dbService } from '../services/db'
import { secretsStore } from './secrets'

/**
 * Returns the decrypted API key for a profile, or `null` if the profile has
 * no key (e.g. a local Ollama profile) or doesn't exist.
 *
 * MAIN-PROCESS ONLY. This function MUST NOT be re-exported through any
 * preload contextBridge or IPC handler. Phase 15 (reviewer) and phase 16
 * (chat agent) will call it directly when constructing LLM requests in main.
 */
export function getProfileDecryptedKey(profileId: string): string | null {
  const db = dbService.requireCurrent()
  const row = db
    .prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?')
    .get(profileId) as { api_key_ref: string | null } | undefined
  if (!row) return null
  if (!row.api_key_ref) return null
  return secretsStore.get(row.api_key_ref)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run electron/settings/profile-key.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run the entire phase-13 storage layer suite**

Run: `npx vitest run electron/settings/`
Expected: PASS — 7 test files, all green.

- [ ] **Step 6: Commit**

```bash
git add electron/settings/profile-key.ts electron/settings/profile-key.test.ts
git commit -m "feat(phase-13): main-only getProfileDecryptedKey (not exposed to renderer)"
```

---

## End-of-plan checks

- [ ] Run the full test suite: `npm test`
- [ ] Run typecheck: `npm run typecheck`
- [ ] Run lint: `npm run lint`
- [ ] Verify no `E_*` codes were left out of `IPC_ERROR_CODES` (grep `IpcErrorCode` against the const)

If everything is green, this plan's surface area for Plan 2 is:
- `electron/settings/store.ts` exports `settingsStore.{get,set,onChange}`
- `electron/settings/secrets.ts` exports `secretsStore.{get,set,delete}` (main only)
- `electron/settings/profiles.ts` exports `profilesStore.{list,create,update,delete}`
- `electron/settings/profile-key.ts` exports `getProfileDecryptedKey` (main only)
- `electron/settings/safe-storage-state.ts` exports `initSafeStorageAvailability`, `isSafeStorageAvailable`
- `shared/settings-types.ts` exports all type symbols
- New error codes in `shared/ipc-contract.ts`: `E_UNKNOWN_NAMESPACE`, `E_DUPLICATE_NAME`, `E_KEYCHAIN_UNAVAILABLE`, `E_PROFILE_NOT_FOUND`
