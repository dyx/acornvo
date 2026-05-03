# Phase-13 Secure Storage & Settings — Plan 5: Acceptance Verification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk every acceptance criterion in `openspec/changes/phase-13-secure-storage-settings/tasks.md` section 9, gather direct evidence (test output, DB queries, screenshots) and only then mark the item complete. Most criteria pair an automated assertion with a manual UI walkthrough — both must pass.

**Architecture:** Each task is an audit. We don't *implement* anything new here — we *verify* that Plans 1-4 satisfy the spec. New tests added in this plan are **acceptance** tests that exercise the wired-up app, not unit tests.

**Tech Stack:** Vitest + jsdom for renderer assertions, better-sqlite3 for direct DB inspection, manual `npm run dev` walkthrough for UI checks.

**Verification discipline (per `superpowers:verification-before-completion`):** Do NOT mark a step complete based on "the code looks right". Run the command, copy the output, paste it into the step note, then check the box.

---

<!-- openspec-task: 9.1 -->
### Task 1: `/settings` route, double-pane layout, default general tab

**Files:**
- Run-only: dev app + the `Settings.test.tsx` from Plan 2

- [ ] **Step 1: Run the existing Settings test**

Run: `npx vitest run src/pages/Settings.test.tsx`
Expected: PASS — confirms the rail + redirect exist.

- [ ] **Step 2: Manual walkthrough**

```bash
npm run dev
```

In the app:
1. Open a grove (or create one).
2. Click the bottom gear in AppRail.
3. Verify the URL is `/settings/general`.
4. Verify the layout: 60-px-wide left rail (settings nav, NOT app rail) + right detail pane.
5. Verify "通用" tab is highlighted.
6. Stop the dev server.

- [ ] **Step 3: Record evidence**

Note the URL change visible in the address-bar of the dev app (or DevTools' `location.pathname`). Confirm: `/settings/general`.

- [ ] **Step 4: Commit (acceptance log)**

No code change required. If you edited any plan note files, skip the commit. Otherwise nothing to do here.

---

<!-- openspec-task: 9.2 -->
### Task 2: Switching to dark applies `data-theme=dark` and survives reload

**Files:**
- Create: `src/__acceptance__/theme-persistence.test.ts`

- [ ] **Step 1: Write an automated test that verifies the persistence path**

```ts
// src/__acceptance__/theme-persistence.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => {
  // Minimal in-memory persistence mock: set() updates the value that subsequent
  // get() calls return — simulates the round-trip through main + settings store.
  let store: Record<string, Record<string, unknown>> = {
    appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
    general: { locale: 'zh-CN', autoBackup: 'off' },
    ai: { defaultProfileId: null },
    browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
  }
  return {
    ipc: {
      settings: {
        get: vi.fn(async (ns: string) => store[ns]),
        set: vi.fn(async (ns: string, patch: Record<string, unknown>) => {
          store[ns] = { ...store[ns], ...patch }
          return { ok: true }
        }),
        keychainAvailable: vi.fn().mockResolvedValue(true)
      },
      on: vi.fn(() => () => {})
    },
    __resetStore: () => {
      store = {
        appearance: { theme: 'system', fontScale: 1.0, editorFont: 'system-ui' },
        general: { locale: 'zh-CN', autoBackup: 'off' },
        ai: { defaultProfileId: null },
        browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' }
      }
    }
  }
})

import { i18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import { installSettingsEffects, __resetEffectsForTest } from '@/stores/settings-effects'

describe('acceptance 9.2 — theme persists across reload', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''
  })

  it('switching to dark immediately applies data-theme=dark', async () => {
    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('after a "reload" (re-init store), loadAll returns dark and effects re-apply it', async () => {
    // Round 1 — write
    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    await useSettingsStore.getState().setAppearance({ theme: 'dark' })

    // Round 2 — simulate reload: reset store + effects, but mocked IPC still
    // remembers the value
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''

    await useSettingsStore.getState().loadAll()
    installSettingsEffects()
    expect(useSettingsStore.getState().appearance.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/__acceptance__/theme-persistence.test.ts`
Expected: PASS — both rounds.

- [ ] **Step 3: Manual walkthrough**

`npm run dev`. Open settings → Appearance → click Dark. Confirm the chrome immediately dims. Quit the app (`Cmd+Q`). Relaunch. Open the same grove. Confirm the chrome is still dark.

- [ ] **Step 4: Commit**

```bash
git add src/__acceptance__/theme-persistence.test.ts
git commit -m "test(phase-13): acceptance 9.2 — theme persists across reload"
```

---

<!-- openspec-task: 9.3 -->
### Task 3: Locale en-US switches all text

**Files:**
- Create: `src/__acceptance__/locale-switch.test.tsx`

- [ ] **Step 1: Write the automated test**

```tsx
// @vitest-environment jsdom
// src/__acceptance__/locale-switch.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue({ ok: true }),
      keychainAvailable: vi.fn().mockResolvedValue(true)
    },
    on: vi.fn(() => () => {})
  }
}))

import { i18n } from '@/i18n'
import { Settings } from '@/pages/Settings'

describe('acceptance 9.3 — locale en-US switches text', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN')
  })
  afterEach(() => cleanup())

  it('rail labels read Chinese on zh-CN', () => {
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <Settings />
      </MemoryRouter>
    )
    expect(screen.getByText('通用')).toBeTruthy()
    expect(screen.getByText('外观')).toBeTruthy()
  })

  it('after i18n.changeLanguage("en-US"), labels read English', async () => {
    await i18n.changeLanguage('en-US')
    render(
      <MemoryRouter initialEntries={['/settings/general']}>
        <Settings />
      </MemoryRouter>
    )
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Appearance')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/__acceptance__/locale-switch.test.tsx`
Expected: PASS.

- [ ] **Step 3: Manual walkthrough**

`npm run dev`. Open settings → General → switch language to en-US. Verify:
- The settings rail tab labels switch from `通用 / 外观 / AI / 浏览器` to `General / Appearance / AI / Browser`.
- AppRail entries switch from `果仓 / 拾果 / 松语 / 设置` to `Library / Browser / Chat / Settings`.

- [ ] **Step 4: Commit**

```bash
git add src/__acceptance__/locale-switch.test.tsx
git commit -m "test(phase-13): acceptance 9.3 — locale switching applies en-US"
```

---

<!-- openspec-task: 9.4 -->
### Task 4: Font scale slider sets `--font-scale` immediately

**Files:**
- (no new file — covered by `AppearanceTab.test.tsx` from Plan 2 + `settings-effects.test.ts` from Plan 3)

- [ ] **Step 1: Confirm the unit tests cover this**

Run: `npx vitest run src/components/settings/AppearanceTab.test.tsx src/stores/settings-effects.test.ts`
Expected: PASS — the existing tests verify slider → CSS var.

- [ ] **Step 2: Manual walkthrough**

`npm run dev`. Open settings → Appearance → drag font slider to 1.2.
Open DevTools → Console: `getComputedStyle(document.documentElement).getPropertyValue('--font-scale')`.
Expected: `1.2`.

Visually: text in the right pane should be ~20% larger.

- [ ] **Step 3: Reload and confirm persistence**

Quit + relaunch. Slider stays at 1.2; CSS var still 1.2.

- [ ] **Step 4: No commit needed** (verification only).

---

<!-- openspec-task: 9.5 -->
### Task 5: Add openai profile with key → row + encrypted BLOB

**Files:**
- Create: `electron/__acceptance__/profile-create.test.ts`

- [ ] **Step 1: Write the automated test**

```ts
// electron/__acceptance__/profile-create.test.ts
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
import { profilesStore } from '../settings/profiles'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.5 — create profile with apiKey persists row + encrypted blob', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('after create, ai_provider_profiles has a row AND settings_secrets has the encrypted blob', () => {
    const { id } = profilesStore.create({
      name: 'openai-prod',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-LONG-SECRET-KEY'
    })

    const profileRow = db
      .prepare('SELECT id, name, provider, model, api_key_ref FROM ai_provider_profiles WHERE id=?')
      .get(id) as { id: string; name: string; provider: string; model: string; api_key_ref: string }
    expect(profileRow).toMatchObject({
      id,
      name: 'openai-prod',
      provider: 'openai',
      model: 'gpt-4o',
      api_key_ref: `ai.key.${id}`
    })

    const secretRow = db
      .prepare('SELECT encrypted_value FROM settings_secrets WHERE key=?')
      .get(`ai.key.${id}`) as { encrypted_value: Buffer }
    expect(secretRow).toBeDefined()
    expect(secretRow.encrypted_value).toBeInstanceOf(Buffer)
    // Plaintext MUST NOT be present in the BLOB
    expect(secretRow.encrypted_value.toString('utf8')).not.toContain('SECRET-KEY')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/profile-create.test.ts`
Expected: PASS.

- [ ] **Step 3: Manual walkthrough**

`npm run dev`. Open settings → AI → Add profile. Fill: name=`openai-prod`, provider=`openai`, model=`gpt-4o`, apiKey=`sk-test`. Save.

Verify the card appears.

Stop the dev server, then inspect the grove DB directly:

```bash
sqlite3 "<grove>/.acornvo/index.db" \
  "SELECT id, name, model, api_key_ref FROM ai_provider_profiles;"
sqlite3 "<grove>/.acornvo/index.db" \
  "SELECT key, length(encrypted_value) FROM settings_secrets;"
```

Expected: one profile row + one secrets row whose key matches `ai.key.<profile-id>` and whose encrypted_value is non-zero bytes.

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/profile-create.test.ts
git commit -m "test(phase-13): acceptance 9.5 — create profile persists row + encrypted blob"
```

---

<!-- openspec-task: 9.6 -->
### Task 6: Editing without entering apiKey preserves the original key

**Files:**
- Create: `electron/__acceptance__/profile-edit-keep.test.ts`

- [ ] **Step 1: Write the automated test**

```ts
// electron/__acceptance__/profile-edit-keep.test.ts
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
import { profilesStore } from '../settings/profiles'
import { secretsStore } from '../settings/secrets'
import { getProfileDecryptedKey } from '../settings/profile-key'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.6 — edit without apiKey preserves original', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('update with apiKey=undefined leaves the secret + ref intact', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-orig' })
    expect(getProfileDecryptedKey(id)).toBe('sk-orig')

    profilesStore.update(id, { name: 'p-renamed' /* no apiKey field */ })
    expect(getProfileDecryptedKey(id)).toBe('sk-orig')

    const ref = `ai.key.${id}`
    expect(secretsStore.get(ref)).toBe('sk-orig')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/profile-edit-keep.test.ts`
Expected: PASS.

- [ ] **Step 3: Manual walkthrough**

`npm run dev`. Use the AI tab to add a profile with key `sk-orig`. Click edit, change only the name (leave the password field empty), save. Use a sqlite3 query to confirm `settings_secrets[ai.key.<id>]` is unchanged (`length(encrypted_value)` is the same as before).

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/profile-edit-keep.test.ts
git commit -m "test(phase-13): acceptance 9.6 — edit without apiKey preserves original"
```

---

<!-- openspec-task: 9.7 -->
### Task 7: Editing with empty-string apiKey deletes the secret

**Files:**
- Modify: `electron/__acceptance__/profile-edit-keep.test.ts` (add a new `describe`)

- [ ] **Step 1: Write the automated test**

Append to `electron/__acceptance__/profile-edit-keep.test.ts`:

```ts
// electron/__acceptance__/profile-edit-keep.test.ts (append)
describe('acceptance 9.7 — edit with apiKey="" clears the secret', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('update with apiKey="" removes the secret row AND nulls api_key_ref', () => {
    const { id } = profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-orig' })
    const ref = `ai.key.${id}`
    expect(secretsStore.get(ref)).toBe('sk-orig')

    profilesStore.update(id, { apiKey: '' })

    expect(secretsStore.get(ref)).toBeNull()
    const row = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id=?').get(id) as
      { api_key_ref: string | null }
    expect(row.api_key_ref).toBeNull()
  })
})
```

> **NOTE:** The `ProfileDialog` UI from Plan 3 maps an empty form field to `apiKey: undefined` on edits (see `ProfileDialog.tsx` Task 3 step 3 — the spread `...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})`). This means the user-facing flow for "clear the key" is **not exposed yet** — there's no "remove key" button. Acceptance 9.7 tests the **lower-level** semantics of `profilesStore.update`. The UI-level path is deliberately conservative (preferring "preserve" over "delete" on edits) to avoid the footgun. If the spec demands a user-facing "clear key" flow, add a small `Clear key` button next to the password field in `ProfileDialog.tsx`. **Surface this trade-off in the verification step below.**

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/profile-edit-keep.test.ts`
Expected: PASS — both 9.6 and 9.7 cases.

- [ ] **Step 3: Add a "Clear key" button to ProfileDialog**

Modify `src/components/settings/ProfileDialog.tsx`. Add a button next to the apiKey input when editing an existing profile:

```tsx
// inside the apiKey field, when profile !== null
{profile && profile.apiKeyRef && (
  <button
    type="button"
    className="ml-2 rounded border border-destructive px-2 py-1 text-xs text-destructive"
    onClick={async () => {
      if (window.confirm(t('settings.ai.confirmClearKey'))) {
        await update(profile.id, { apiKey: '' })
        onClose()
      }
    }}
  >
    {t('settings.ai.clearKey')}
  </button>
)}
```

Add the i18n keys:

```json
// zh-CN.json — settings.ai
"clearKey": "清除密钥",
"confirmClearKey": "确认清除当前 API key？"
```
```json
// en-US.json — settings.ai
"clearKey": "Clear key",
"confirmClearKey": "Clear the current API key?"
```

- [ ] **Step 4: Manual walkthrough**

`npm run dev`. Add a profile with key. Click edit. Click "清除密钥". Confirm. Open the dialog again — the password field is empty (no key to preserve). Inspect DB: `settings_secrets` row gone, `ai_provider_profiles.api_key_ref` is NULL.

- [ ] **Step 5: Commit**

```bash
git add electron/__acceptance__/profile-edit-keep.test.ts \
  src/components/settings/ProfileDialog.tsx \
  src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "test(phase-13): acceptance 9.7 — clear-key flow + UI button"
```

---

<!-- openspec-task: 9.8 -->
### Task 8: Delete profile cascades + reassigns default

**Files:**
- (no new file — covered by `electron/settings/profiles.test.ts` audit cases from Plan 4 task 7 + the existing default-reassign tests in Plan 1 task 7)

- [ ] **Step 1: Confirm the unit + audit tests cover this**

Run: `npx vitest run electron/settings/profiles.test.ts`
Expected: PASS — including:
- `delete cascades to secret in a single transaction`
- `delete on default profile reassigns defaultProfileId to first remaining`
- `delete on default profile (last one) sets defaultProfileId=null`
- audit: `after delete, secrets.get(oldRef) returns null AND no orphan row remains`

- [ ] **Step 2: Manual walkthrough**

`npm run dev`. Create profile A with key. Set A as default. Create profile B. Delete A.
Verify:
- A's card is gone.
- B is now marked as default (the badge moved).
- Inspect DB: `settings_secrets` no longer has `ai.key.<A.id>`.

Now delete B (the last one). Verify `defaultProfileId` is null in `settings` table:

```bash
sqlite3 "<grove>/.acornvo/index.db" \
  "SELECT value_json FROM settings WHERE ns='ai' AND key='defaultProfileId';"
```

Expected: `null` (or no row, which falls back to the default).

- [ ] **Step 3: No commit** — purely verification.

---

<!-- openspec-task: 9.9 -->
### Task 9: Name conflict shows UI error "已被占用"

**Files:**
- (no new file — covered by `ProfileDialog.test.tsx` from Plan 3)

- [ ] **Step 1: Confirm the existing test covers this**

Run: `npx vitest run src/components/settings/ProfileDialog.test.tsx`
Expected: PASS — including the "shows name conflict error when create rejects with E_DUPLICATE_NAME" case.

- [ ] **Step 2: Manual walkthrough**

`npm run dev`. Create profile with name `dup`. Save. Click Add again; type the same name `dup`. Save.
Expected: A red error message "名称已被占用" (or "Name already in use" on en-US) appears under the form. Profile list does not gain a duplicate.

- [ ] **Step 3: No commit** — purely verification.

---

<!-- openspec-task: 9.10 -->
### Task 10: Disabling block-ads lets googletagmanager.com through

**Files:**
- Create: `electron/__acceptance__/ad-block-toggle.test.ts`

- [ ] **Step 1: Write the automated test**

```ts
// electron/__acceptance__/ad-block-toggle.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

let registeredListener: ((details: { url: string }, cb: (r: { cancel: boolean }) => void) => void) | null = null

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      webRequest: {
        onBeforeRequest: vi.fn((filterOrListener, listener) => {
          if (filterOrListener === null) {
            registeredListener = null
          } else if (typeof listener === 'function') {
            registeredListener = listener
          } else {
            registeredListener = filterOrListener as never
          }
        })
      }
    }))
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn((path: string, enc?: string) => {
      const s = String(path)
      if (s.endsWith('block-domains.txt')) return 'googletagmanager.com\nwww.googletagmanager.com\n'
      return actual.readFileSync(path, enc as never)
    })
  }
})

import { dbService } from '../services/db'
import { settingsStore } from '../settings/store'
import { initAdBlock, __resetForTest as resetAdBlock } from '../browser/ad-block'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.10 — disabling blockAds removes the listener', () => {
  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    resetAdBlock()
    settingsStore.__resetSubscribers()
    registeredListener = null
  })
  afterEach(() => {
    db.close()
    resetAdBlock()
  })

  it('starts with blockAds=true → listener cancels googletagmanager', () => {
    initAdBlock({ initialEnabled: true })
    expect(registeredListener).not.toBeNull()
    let result: { cancel: boolean } | null = null
    registeredListener!(
      { url: 'https://www.googletagmanager.com/gtm.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: true })
  })

  it('after settingsStore set browser.blockAds=false, listener is removed', () => {
    initAdBlock({ initialEnabled: true })
    settingsStore.set('browser', { blockAds: false })
    expect(registeredListener).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/ad-block-toggle.test.ts`
Expected: PASS.

- [ ] **Step 3: Manual walkthrough**

> The browser shell (phase-11) doesn't exist yet, so we cannot literally load a webpage. Instead, simulate via the main-process logs:
>
> 1. `npm run dev`.
> 2. Open settings → Browser → toggle Block ads OFF.
> 3. Watch the dev console; Plan 3's `__resetForTest` log emits "ad-block: unregistered listener" (add a `logger.info` if not present).
> 4. Toggle back ON. Watch for "ad-block: registered listener".

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/ad-block-toggle.test.ts
git commit -m "test(phase-13): acceptance 9.10 — disabling blockAds removes the listener"
```

---

<!-- openspec-task: 9.11 -->
### Task 11: Re-enabling block-ads re-registers the listener

**Files:**
- Modify: `electron/__acceptance__/ad-block-toggle.test.ts` (append)

- [ ] **Step 1: Append the test case**

```ts
// electron/__acceptance__/ad-block-toggle.test.ts (append the it block)
  it('toggling back to true re-registers the listener', () => {
    initAdBlock({ initialEnabled: true })
    settingsStore.set('browser', { blockAds: false })
    expect(registeredListener).toBeNull()

    settingsStore.set('browser', { blockAds: true })
    expect(registeredListener).not.toBeNull()

    let result: { cancel: boolean } | null = null
    registeredListener!(
      { url: 'https://www.googletagmanager.com/gtm.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: true })
  })
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/ad-block-toggle.test.ts`
Expected: PASS — three cases (initial cancel, toggle off removes, toggle on re-registers).

- [ ] **Step 3: No additional commit** — squash with previous if you can; otherwise:

```bash
git add electron/__acceptance__/ad-block-toggle.test.ts
git commit -m "test(phase-13): acceptance 9.11 — re-enabling blockAds re-registers"
```

---

<!-- openspec-task: 9.12 -->
### Task 12: Clear cookies invalidates browser session login

**Files:**
- Create: `electron/__acceptance__/clear-cookies.test.ts`

- [ ] **Step 1: Write the automated test**

```ts
// electron/__acceptance__/clear-cookies.test.ts
import { describe, it, expect, vi } from 'vitest'

const clearStorageDataMock = vi.fn().mockResolvedValue(undefined)
const fromPartitionMock = vi.fn(() => ({ clearStorageData: clearStorageDataMock }))

vi.mock('electron', () => ({
  session: { fromPartition: fromPartitionMock },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true)
  }
}))

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))

import { settingsHandlers } from '../ipc/settings'

describe('acceptance 9.12 — browserClearCookies', () => {
  it('clears the persistent browser partition cookies', async () => {
    const result = await settingsHandlers.browserClearCookies()
    expect(result).toEqual({ ok: true })
    expect(fromPartitionMock).toHaveBeenCalledWith('persist:browser-default')
    expect(clearStorageDataMock).toHaveBeenCalledWith({ storages: ['cookies'] })
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run electron/__acceptance__/clear-cookies.test.ts`
Expected: PASS.

- [ ] **Step 3: Manual walkthrough**

> Phase-11 browser pane doesn't exist yet; full end-to-end requires phase-11. We can still verify the IPC + session call works:
>
> 1. `npm run dev`.
> 2. Open DevTools console (in renderer): `await window.api.settings.browserClearCookies()`.
> 3. Expected return: `{ ok: true }`.
> 4. The main process logs should show `[ipc] settings.browserClearCookies` ok response.

- [ ] **Step 4: Commit**

```bash
git add electron/__acceptance__/clear-cookies.test.ts
git commit -m "test(phase-13): acceptance 9.12 — clearCookies hits persist:browser-default"
```

---

<!-- openspec-task: 9.13 -->
### Task 13: Keychain unavailable → banner + add fails

**Files:**
- Create: `electron/__acceptance__/keychain-unavailable.test.ts`
- Create: `src/__acceptance__/keychain-banner.test.tsx`

- [ ] **Step 1: Write the main-side test**

```ts
// electron/__acceptance__/keychain-unavailable.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

import { dbService } from '../services/db'
import { profilesStore } from '../settings/profiles'
import { settingsHandlers } from '../ipc/settings'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from '../settings/safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('acceptance 9.13 — keychain unavailable', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('keychainAvailable() returns false', () => {
    expect(settingsHandlers.keychainAvailable()).toBe(false)
  })

  it('creating a profile WITH apiKey throws E_KEYCHAIN_UNAVAILABLE', () => {
    expect(() =>
      profilesStore.create({ name: 'p', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-x' })
    ).toThrow(/E_KEYCHAIN_UNAVAILABLE/)
    const n = db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles').get() as { n: number }
    expect(n.n).toBe(0)
  })

  it('creating a profile WITHOUT apiKey (e.g. ollama) succeeds even when keychain is unavailable', () => {
    const { id } = profilesStore.create({ name: 'ollama', provider: 'ollama', model: 'llama3' })
    expect(typeof id).toBe('string')
  })
})
```

- [ ] **Step 2: Write the renderer-side banner test**

```tsx
// @vitest-environment jsdom
// src/__acceptance__/keychain-banner.test.tsx
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: { aiProfilesList: vi.fn().mockResolvedValue([]) },
    on: vi.fn(() => () => {})
  }
}))

import { i18n } from '@/i18n'
import { AiTab } from '@/components/settings/AiTab'

describe('acceptance 9.13 — AI tab banner when keychain unavailable', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders the red banner', () => {
    render(<AiTab keychainAvailable={false} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toMatch(/keychain|密钥环/i)
  })

  it('add profile button is disabled when keychain unavailable', () => {
    render(<AiTab keychainAvailable={false} />)
    const addBtn = screen.getByRole('button', { name: /add|添加/i }) as HTMLButtonElement
    expect(addBtn.disabled).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run electron/__acceptance__/keychain-unavailable.test.ts src/__acceptance__/keychain-banner.test.tsx`
Expected: PASS.

- [ ] **Step 4: Manual walkthrough**

> Hard to simulate without Linux + no libsecret. Skip the manual on macOS — the unit tests provide adequate coverage. If running on Linux without libsecret, the dev app should naturally show the banner.

- [ ] **Step 5: Commit**

```bash
git add electron/__acceptance__/keychain-unavailable.test.ts \
  src/__acceptance__/keychain-banner.test.tsx
git commit -m "test(phase-13): acceptance 9.13 — keychain unavailable shows banner + blocks key save"
```

---

<!-- openspec-task: 9.14 -->
### Task 14: DevTools probe — `window.api.settings.secret` is undefined

**Files:**
- (no new file — already covered by `preload/preload.test.ts` security-audit cases from Plan 4)

- [ ] **Step 1: Confirm the existing test covers this**

Run: `npx vitest run preload/preload.test.ts`
Expected: PASS — including:
- `does not expose any property whose name suggests secret or decrypt`
- `exposes settings without nested secret object`

- [ ] **Step 2: Manual walkthrough**

`npm run dev`. Open the renderer DevTools (`Cmd+Opt+I`). In the console:

```js
typeof window.api.settings.secret
typeof window.api.settings.getDecryptedKey
typeof window.api.settings.aiProfilesGetDecryptedKey
```

Expected: all three return `'undefined'`.

```js
Object.keys(window.api.settings)
```

Expected: `['get', 'set', 'aiProfilesList', 'aiProfilesCreate', 'aiProfilesUpdate', 'aiProfilesDelete', 'browserClearCookies', 'keychainAvailable']` — no `secret`, no `getDecryptedKey`.

- [ ] **Step 3: No commit** — verification only.

---

<!-- openspec-task: 9.15 -->
### Task 15: `Cmd+,` opens settings from any page

**Files:**
- (no new file — already covered by `useGlobalHotkeys.test.tsx` from Plan 4)

- [ ] **Step 1: Confirm the existing test covers this**

Run: `npx vitest run src/hooks/useGlobalHotkeys.test.tsx`
Expected: PASS — three cases.

- [ ] **Step 2: Manual walkthrough**

`npm run dev`. Open a grove. From `/library`, press `Cmd+,` → URL becomes `/settings`. From `/editor/<file>`, press `Cmd+,` → settings opens. From `/search`, same.

- [ ] **Step 3: Edge case — input fields**

While focused inside an `<input>` (e.g. the Quick Switcher), `Cmd+,` should still navigate. Test by opening Quick Switcher (`Cmd+P`) and pressing `Cmd+,`. Expected: settings opens.

- [ ] **Step 4: No commit** — verification only.

---

<!-- openspec-task: 9.16 -->
### Task 16: `openspec validate phase-13-secure-storage-settings --strict` passes

**Files:**
- Possibly: `openspec/changes/phase-13-secure-storage-settings/specs/*.md` (if validation surfaces issues)

- [ ] **Step 1: Run validation**

Run: `openspec validate phase-13-secure-storage-settings --strict`
Expected output (rough): zero errors. The output should list the validated specs and end with a "valid" or similar success line.

- [ ] **Step 2: If validation fails**

Read the error. Common cases and fixes:
- Missing requirement: add it to the corresponding `specs/*.md`.
- Stale scenario: align scenarios with implementation reality (e.g., the colon-vs-dot event name decision in Plan 1 — update the spec text from `'settings.changed'` to `'settings:changed'` in `specs/settings-store/spec.md` and `specs/settings-ipc/spec.md`).
- Missing capability declaration: ensure `proposal.md` includes the capability under New/Modified.

Apply the smallest spec edit that resolves the error. Re-run validation until clean.

- [ ] **Step 3: Run the full test suite once more**

Run: `npm test && npm run typecheck && npm run lint`
Expected: 0 failures, 0 type errors, 0 lint warnings.

- [ ] **Step 4: Commit any spec adjustments**

```bash
git add openspec/changes/phase-13-secure-storage-settings/specs/
git commit -m "chore(phase-13): align specs with implementation (event channel naming + edge cases)"
```

- [ ] **Step 5: Mark all `tasks.md` checkboxes**

Open `openspec/changes/phase-13-secure-storage-settings/tasks.md`. Mark every `- [ ]` as `- [x]` for sections 1-9 (the OpenSpec workflow tracker). The `/opsx:executing-plans` runner can do this automatically; if you're invoking that runner this step is redundant.

```bash
git add openspec/changes/phase-13-secure-storage-settings/tasks.md
git commit -m "chore(phase-13): mark all phase-13 tasks complete"
```

---

## End-of-plan checks

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — clean
- [ ] `openspec validate phase-13-secure-storage-settings --strict` — passes
- [ ] All 16 acceptance items in `tasks.md` section 9 are checked
- [ ] All implementation items in sections 1-8 are checked

When this is the case, hand off to `/opsx:archive` to finalize phase-13.
