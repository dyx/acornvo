# Phase-13 Secure Storage & Settings — Plan 3: AI / Browser Tabs + Hot-Update Subscribers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI/Browser tab stubs with real implementations (profile list + dialog, ad-block toggle, search engine, clear-cookies button), then wire main-process hot-update subscribers (ad-block toggle on `settings.browser.blockAds`, renderer root subscriber for theme/locale/font, phase-12 placeholder readers).

**Architecture:** The AI tab consumes `useSettingsStore` for the `defaultProfileId` plus a separate local `useProfilesStore` (loaded via `ipc.settings.aiProfilesList()`) for the rows themselves. Profile mutations go through IPC and rely on the `'settings:changed'` subscriber + `aiProfilesList` re-fetch to re-render. The ad-block module is **introduced fresh** in this plan because phase-11 hasn't landed; it ships with a minimal `block-domains.txt` containing the domains acceptance test 9.10 requires (`googletagmanager.com` etc.) so future phase-11 PR can extend without breaking phase-13 acceptance. Renderer root applies theme/locale on `'settings:changed'`, replacing phase-1's in-memory `useRootStore`.

**Tech Stack:** Same as Plan 2 + electron `session.fromPartition` + `webRequest.onBeforeRequest`.

**Carry-overs:**
- `useSettingsStore` (Plan 2) is the single source of truth for renderer-side settings.
- `installSettingsBroadcaster` (Plan 2) and `installSettingsSubscriber` (Plan 2) are already wired.
- Plan 1 error codes (`E_KEYCHAIN_UNAVAILABLE`, `E_DUPLICATE_NAME`) are translated to user-facing toasts in this plan.

---

<!-- openspec-task: 4.5 -->
### Task 1: AI tab — profile list + keychain banner + default selection

**Files:**
- Create: `src/stores/profiles.ts`
- Create: `src/stores/profiles.test.ts`
- Create: `src/components/settings/AiTab.tsx`
- Create: `src/components/settings/AiTab.test.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Write the failing profiles-store test**

```ts
// src/stores/profiles.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([
        {
          id: 'a',
          name: 'p-a',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          temperature: 0.7,
          topP: 1.0,
          maxTokens: null,
          apiKeyRef: 'ai.key.a',
          createdAt: '2026-05-03',
          updatedAt: '2026-05-03'
        }
      ]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'b' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useProfilesStore } from './profiles'

describe('useProfilesStore', () => {
  beforeEach(() => {
    useProfilesStore.setState(useProfilesStore.getInitialState(), true)
    vi.clearAllMocks()
  })

  it('refresh() loads profiles from IPC', async () => {
    await useProfilesStore.getState().refresh()
    expect(ipc.settings.aiProfilesList).toHaveBeenCalled()
    expect(useProfilesStore.getState().profiles).toHaveLength(1)
  })

  it('create() calls IPC then refreshes', async () => {
    await useProfilesStore.getState().create({ name: 'b', provider: 'openai', model: 'gpt-4o' })
    expect(ipc.settings.aiProfilesCreate).toHaveBeenCalled()
    expect(ipc.settings.aiProfilesList).toHaveBeenCalled()
  })

  it('update() and remove() also refresh', async () => {
    await useProfilesStore.getState().update('a', { name: 'x' })
    await useProfilesStore.getState().remove('a')
    expect(ipc.settings.aiProfilesUpdate).toHaveBeenCalledWith('a', { name: 'x' })
    expect(ipc.settings.aiProfilesDelete).toHaveBeenCalledWith('a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/profiles.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the profiles store**

```ts
// src/stores/profiles.ts
import { create } from 'zustand'
import { ipc } from '@/ipc/client'
import type { AiProviderProfile, ProfileCreateInput, ProfileUpdateInput } from '@shared/settings-types'

interface ProfilesState {
  profiles: AiProviderProfile[]
  loading: boolean
  refresh: () => Promise<void>
  create: (input: ProfileCreateInput) => Promise<{ id: string }>
  update: (id: string, patch: ProfileUpdateInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,

  async refresh() {
    set({ loading: true })
    try {
      const list = await ipc.settings.aiProfilesList()
      set({ profiles: list })
    } finally {
      set({ loading: false })
    }
  },

  async create(input) {
    const result = await ipc.settings.aiProfilesCreate(input)
    await get().refresh()
    return result
  },

  async update(id, patch) {
    await ipc.settings.aiProfilesUpdate(id, patch)
    await get().refresh()
  },

  async remove(id) {
    await ipc.settings.aiProfilesDelete(id)
    await get().refresh()
  }
}))
```

- [ ] **Step 4: Write the failing AiTab test**

```tsx
// @vitest-environment jsdom
// src/components/settings/AiTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesList: vi.fn().mockResolvedValue([]),
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'new-id' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesDelete: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { useSettingsStore } from '@/stores/settings'
import { useProfilesStore } from '@/stores/profiles'
import { AiTab } from './AiTab'

describe('AiTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    useProfilesStore.setState(useProfilesStore.getInitialState(), true)
  })
  afterEach(() => cleanup())

  it('renders empty state with "add profile" button', async () => {
    render(<AiTab keychainAvailable={true} />)
    await waitFor(() => screen.getByRole('button', { name: /add|添加/i }))
    expect(screen.getByText(/no profiles|尚无/i)).toBeTruthy()
  })

  it('shows red banner when keychain unavailable', () => {
    render(<AiTab keychainAvailable={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/keychain|密钥环/i)
  })

  it('renders a profile card with edit / delete / set-default buttons', async () => {
    useProfilesStore.setState({
      profiles: [
        {
          id: 'a',
          name: 'OpenAI Prod',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          temperature: 0.7,
          topP: 1.0,
          maxTokens: null,
          apiKeyRef: 'ai.key.a',
          createdAt: '2026-05-03',
          updatedAt: '2026-05-03'
        }
      ]
    })
    render(<AiTab keychainAvailable={true} />)
    await waitFor(() => screen.getByText('OpenAI Prod'))
    expect(screen.getByText('gpt-4o')).toBeTruthy()
    expect(screen.getByRole('button', { name: /edit|编辑/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete|删除/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /default|默认/i })).toBeTruthy()
  })

  it('clicking "set default" calls setAi({ defaultProfileId })', async () => {
    const setAi = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ ai: { defaultProfileId: null }, setAi })
    useProfilesStore.setState({
      profiles: [
        {
          id: 'a',
          name: 'p',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          temperature: 0.7,
          topP: 1.0,
          maxTokens: null,
          apiKeyRef: null,
          createdAt: '2026-05-03',
          updatedAt: '2026-05-03'
        }
      ]
    })
    render(<AiTab keychainAvailable={true} />)
    fireEvent.click(await screen.findByRole('button', { name: /default|默认/i }))
    expect(setAi).toHaveBeenCalledWith({ defaultProfileId: 'a' })
  })

  it('shows "默认" badge on the default profile', () => {
    useSettingsStore.setState({ ai: { defaultProfileId: 'a' } })
    useProfilesStore.setState({
      profiles: [
        {
          id: 'a',
          name: 'p',
          provider: 'openai',
          baseUrl: null,
          model: 'gpt-4o',
          temperature: 0.7,
          topP: 1.0,
          maxTokens: null,
          apiKeyRef: null,
          createdAt: '2026-05-03',
          updatedAt: '2026-05-03'
        }
      ]
    })
    render(<AiTab keychainAvailable={true} />)
    expect(screen.getByText(/默认|default/i)).toBeTruthy()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/components/settings/AiTab.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 6: Create the AiTab component**

```tsx
// src/components/settings/AiTab.tsx
import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { useProfilesStore } from '@/stores/profiles'
import type { AiProviderProfile } from '@shared/settings-types'
import { ProfileDialog } from './ProfileDialog'

interface AiTabProps {
  keychainAvailable: boolean
}

export function AiTab({ keychainAvailable }: AiTabProps): JSX.Element {
  const { t } = useTranslation()
  const profiles = useProfilesStore((s) => s.profiles)
  const refresh = useProfilesStore((s) => s.refresh)
  const remove = useProfilesStore((s) => s.remove)
  const ai = useSettingsStore((s) => s.ai)
  const setAi = useSettingsStore((s) => s.setAi)
  const [dialogProfile, setDialogProfile] = useState<AiProviderProfile | null | 'new'>(null)

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div data-testid="settings-tab-ai" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{t('settings.tab.ai')}</h3>
        <button
          type="button"
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
          onClick={() => setDialogProfile('new')}
          disabled={!keychainAvailable}
        >
          {t('settings.ai.addProfile')}
        </button>
      </div>

      {!keychainAvailable && (
        <div role="alert" className="rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t('settings.secret.unavailable')}
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.ai.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded border bg-background px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {p.name}
                  {ai.defaultProfileId === p.id && (
                    <span className="ml-2 rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      {t('settings.ai.default')}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.provider} · {p.model}
                </span>
              </div>
              <div className="flex gap-2 text-sm">
                {ai.defaultProfileId !== p.id && (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 hover:bg-muted"
                    onClick={() => void setAi({ defaultProfileId: p.id })}
                  >
                    {t('settings.ai.setDefault')}
                  </button>
                )}
                <button
                  type="button"
                  className="rounded border px-2 py-1 hover:bg-muted"
                  onClick={() => setDialogProfile(p)}
                >
                  {t('settings.ai.editProfile')}
                </button>
                <button
                  type="button"
                  className="rounded border border-destructive px-2 py-1 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm(t('settings.ai.confirmDelete', { name: p.name }))) {
                      void remove(p.id)
                    }
                  }}
                >
                  {t('settings.ai.deleteProfile')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogProfile !== null && (
        <ProfileDialog
          profile={dialogProfile === 'new' ? null : dialogProfile}
          onClose={() => setDialogProfile(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 7: Update `Settings.tsx` to use the real AiTab + a stub ProfileDialog import**

Modify `src/pages/Settings.tsx`. Replace the `AiTabStub` definition + its route with:

```tsx
// src/pages/Settings.tsx — replace the AiTabStub section
import { AiTab } from '@/components/settings/AiTab'
import { useEffect, useState } from 'react'
import { ipc } from '@/ipc/client'

function AiTabRoute(): JSX.Element {
  const [keychainAvailable, setKeychainAvailable] = useState(true)
  useEffect(() => {
    // Ask main if keychain is available — implemented as a setting flag exposed
    // through a small IPC hook below (see Plan 3 task 1 step 8 below).
    let mounted = true
    void (async () => {
      try {
        const v = await ipc.settings.get('appearance' as never) // throwaway probe
        // Real probe is added in Plan 3 task 1 step 8 — for now, defaults to true.
        if (!mounted) return
        setKeychainAvailable(true)
        void v
      } catch {
        if (mounted) setKeychainAvailable(false)
      }
    })()
    return () => { mounted = false }
  }, [])
  return <AiTab keychainAvailable={keychainAvailable} />
}

// And update the routes:
<Route path="ai" element={<AiTabRoute />} />
```

Note: ProfileDialog (used by AiTab) is created in task 3 below. The AiTab test passes because it imports ProfileDialog as JSX but doesn't render it (the modal is only rendered when `dialogProfile !== null`).

- [ ] **Step 8: Add a keychain-availability IPC method**

We need a way for renderer to ask main if `safeStorage` is available. Add a method to the contract.

Modify `shared/ipc-contract.ts`. Inside `IpcContract.settings`, add:

```ts
    keychainAvailable: () => boolean
```

Modify `electron/ipc/settings.ts`. Add:

```ts
import { isSafeStorageAvailable } from '../settings/safe-storage-state'

export const settingsHandlers = {
  // ... existing
  keychainAvailable: () => isSafeStorageAvailable(),
}
```

Modify `preload/preload.ts`. Inside the `settings` block, add:

```ts
    keychainAvailable: () => invoke('settings.keychainAvailable')
```

Now replace the `AiTabRoute` stub probe with a real call:

```tsx
// src/pages/Settings.tsx — replace AiTabRoute body
function AiTabRoute(): JSX.Element {
  const [keychainAvailable, setKeychainAvailable] = useState(true)
  useEffect(() => {
    void ipc.settings.keychainAvailable().then(setKeychainAvailable)
  }, [])
  return <AiTab keychainAvailable={keychainAvailable} />
}
```

- [ ] **Step 9: Run tests**

Run: `npx vitest run src/stores/profiles.test.ts src/components/settings/AiTab.test.tsx`
Expected: PASS.

- [ ] **Step 10: Commit (deferred — bundle with ProfileDialog in task 3)**

---

<!-- openspec-task: 4.6 -->
### Task 2: Browser tab

**Files:**
- Create: `src/components/settings/BrowserTab.tsx`
- Create: `src/components/settings/BrowserTab.test.tsx`
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/settings/BrowserTab.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      browserClearCookies: vi.fn().mockResolvedValue({ ok: true })
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useSettingsStore } from '@/stores/settings'
import { BrowserTab } from './BrowserTab'

describe('BrowserTab', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('renders blockAds toggle reflecting state', () => {
    useSettingsStore.setState({
      browser: { blockAds: false, clipImagesLocalize: false, searchEngine: 'google' }
    })
    render(<BrowserTab />)
    const toggle = screen.getByRole('checkbox', { name: /block.*ad|广告拦截/i }) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('toggling blockAds calls setBrowser({ blockAds: true })', () => {
    const setBrowser = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      browser: { blockAds: false, clipImagesLocalize: false, searchEngine: 'google' },
      setBrowser
    })
    render(<BrowserTab />)
    fireEvent.click(screen.getByRole('checkbox', { name: /block.*ad|广告拦截/i }))
    expect(setBrowser).toHaveBeenCalledWith({ blockAds: true })
  })

  it('changing search engine calls setBrowser({ searchEngine })', () => {
    const setBrowser = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({
      browser: { blockAds: true, clipImagesLocalize: false, searchEngine: 'google' },
      setBrowser
    })
    render(<BrowserTab />)
    fireEvent.change(screen.getByLabelText(/search.*engine|搜索引擎/i), { target: { value: 'duckduckgo' } })
    expect(setBrowser).toHaveBeenCalledWith({ searchEngine: 'duckduckgo' })
  })

  it('"clear cookies" requires confirm and calls IPC on yes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<BrowserTab />)
    fireEvent.click(screen.getByRole('button', { name: /clear.*cookie|清除/i }))
    await waitFor(() => expect(ipc.settings.browserClearCookies).toHaveBeenCalled())
    confirmSpy.mockRestore()
  })

  it('"clear cookies" cancelled does NOT call IPC', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BrowserTab />)
    fireEvent.click(screen.getByRole('button', { name: /clear.*cookie|清除/i }))
    expect(ipc.settings.browserClearCookies).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('clipImagesLocalize toggle is rendered with "coming soon" tooltip', () => {
    render(<BrowserTab />)
    const toggle = screen.getByRole('checkbox', { name: /clip.*image|剪藏图片/i })
    expect(toggle.getAttribute('title')).toMatch(/即将推出|coming soon/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/BrowserTab.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the component**

```tsx
// src/components/settings/BrowserTab.tsx
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/stores/settings'
import { ipc } from '@/ipc/client'
import type { SearchEngine } from '@shared/settings-types'

export function BrowserTab(): JSX.Element {
  const { t } = useTranslation()
  const browser = useSettingsStore((s) => s.browser)
  const setBrowser = useSettingsStore((s) => s.setBrowser)

  return (
    <div data-testid="settings-tab-browser" className="space-y-6">
      <h3 className="text-lg font-medium">{t('settings.tab.browser')}</h3>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={browser.blockAds}
          onChange={(e) => void setBrowser({ blockAds: e.target.checked })}
        />
        <span className="text-sm">{t('settings.browser.blockAds')}</span>
      </label>

      <label className="flex items-center gap-3" title={t('settings.common.comingSoon')}>
        <input
          type="checkbox"
          checked={browser.clipImagesLocalize}
          onChange={(e) => void setBrowser({ clipImagesLocalize: e.target.checked })}
        />
        <span className="text-sm">{t('settings.browser.clipImages')}</span>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('settings.browser.searchEngine')}</span>
        <select
          className="block w-64 rounded border bg-background px-3 py-2 text-sm"
          value={browser.searchEngine}
          onChange={(e) => void setBrowser({ searchEngine: e.target.value as SearchEngine })}
        >
          <option value="google">Google</option>
          <option value="bing">Bing</option>
          <option value="duckduckgo">DuckDuckGo</option>
        </select>
      </label>

      <div>
        <button
          type="button"
          className="rounded border border-destructive px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (window.confirm(t('settings.browser.clearCookiesConfirm'))) {
              void ipc.settings.browserClearCookies()
            }
          }}
        >
          {t('settings.browser.clearCookies')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire BrowserTab into Settings page**

Modify `src/pages/Settings.tsx`. Replace `BrowserTabStub` and the route:

```tsx
import { BrowserTab } from '@/components/settings/BrowserTab'

// Replace stub
<Route path="browser" element={<BrowserTab />} />
```

Remove `BrowserTabStub` definition.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/settings/BrowserTab.test.tsx`
Expected: PASS — all 6 tests green.

- [ ] **Step 6: Commit (deferred until task 3 — ProfileDialog needs to land too)**

---

<!-- openspec-task: 4.7 -->
### Task 3: ProfileDialog with apiKey overwrite semantics

**Files:**
- Create: `src/components/settings/ProfileDialog.tsx`
- Create: `src/components/settings/ProfileDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/settings/ProfileDialog.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

import { i18n } from '@/i18n'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      aiProfilesCreate: vi.fn().mockResolvedValue({ id: 'new-id' }),
      aiProfilesUpdate: vi.fn().mockResolvedValue({ ok: true }),
      aiProfilesList: vi.fn().mockResolvedValue([])
    },
    on: vi.fn(() => () => {})
  }
}))

import { ipc } from '@/ipc/client'
import { useProfilesStore } from '@/stores/profiles'
import { ProfileDialog } from './ProfileDialog'

const sampleProfile = {
  id: 'a',
  name: 'p',
  provider: 'openai' as const,
  baseUrl: null,
  model: 'gpt-4o',
  temperature: 0.7,
  topP: 1.0,
  maxTokens: null,
  apiKeyRef: 'ai.key.a',
  createdAt: '2026-05-03',
  updatedAt: '2026-05-03'
}

describe('ProfileDialog', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useProfilesStore.setState(useProfilesStore.getInitialState(), true)
    vi.clearAllMocks()
  })
  afterEach(() => cleanup())

  it('create flow: empty form → save calls aiProfilesCreate with input', async () => {
    render(<ProfileDialog profile={null} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/name|名称/i), { target: { value: 'newprof' } })
    fireEvent.change(screen.getByLabelText(/model|模型/i), { target: { value: 'gpt-4o' } })
    fireEvent.change(screen.getByLabelText(/api.*key/i), { target: { value: 'sk-abc' } })
    fireEvent.click(screen.getByRole('button', { name: /save|保存/i }))
    await waitFor(() => expect(ipc.settings.aiProfilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'newprof',
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: 'sk-abc'
      })
    ))
  })

  it('edit flow: apiKey field starts EMPTY (NOT bullets) for existing profile', () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    const input = screen.getByLabelText(/api.*key/i) as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.getAttribute('type')).toBe('password')
  })

  it('edit flow: empty apiKey on save → patch.apiKey is undefined (no overwrite)', async () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /save|保存/i }))
    await waitFor(() => expect(ipc.settings.aiProfilesUpdate).toHaveBeenCalled())
    const call = (ipc.settings.aiProfilesUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].apiKey).toBeUndefined()
  })

  it('edit flow: non-empty apiKey on save → patch.apiKey set to new value', async () => {
    render(<ProfileDialog profile={sampleProfile} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/api.*key/i), { target: { value: 'sk-new' } })
    fireEvent.click(screen.getByRole('button', { name: /save|保存/i }))
    await waitFor(() => {
      const call = (ipc.settings.aiProfilesUpdate as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[1].apiKey).toBe('sk-new')
    })
  })

  it('shows "name conflict" error when create rejects with E_DUPLICATE_NAME', async () => {
    ;(ipc.settings.aiProfilesCreate as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('already in use'), { code: 'E_DUPLICATE_NAME' })
    )
    render(<ProfileDialog profile={null} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/name|名称/i), { target: { value: 'dup' } })
    fireEvent.change(screen.getByLabelText(/model|模型/i), { target: { value: 'm' } })
    fireEvent.click(screen.getByRole('button', { name: /save|保存/i }))
    await waitFor(() => screen.getByText(/已被占用|already in use|conflict/i))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/settings/ProfileDialog.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the dialog**

```tsx
// src/components/settings/ProfileDialog.tsx
import type { JSX } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfilesStore } from '@/stores/profiles'
import type {
  AiProviderProfile,
  AiProviderKind,
  ProfileCreateInput,
  ProfileUpdateInput
} from '@shared/settings-types'

interface ProfileDialogProps {
  profile: AiProviderProfile | null
  onClose: () => void
}

const PROVIDERS: AiProviderKind[] = ['openai', 'anthropic', 'ollama', 'openai-compatible']

interface FormState {
  name: string
  provider: AiProviderKind
  baseUrl: string
  model: string
  temperature: string
  topP: string
  maxTokens: string
  apiKey: string
}

function initialState(profile: AiProviderProfile | null): FormState {
  if (!profile) {
    return {
      name: '',
      provider: 'openai',
      baseUrl: '',
      model: '',
      temperature: '0.7',
      topP: '1.0',
      maxTokens: '',
      apiKey: ''
    }
  }
  return {
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl ?? '',
    model: profile.model,
    temperature: String(profile.temperature),
    topP: String(profile.topP),
    maxTokens: profile.maxTokens != null ? String(profile.maxTokens) : '',
    apiKey: '' // SECURITY: never prefill plaintext (we don't have it anyway)
  }
}

export function ProfileDialog({ profile, onClose }: ProfileDialogProps): JSX.Element {
  const { t } = useTranslation()
  const create = useProfilesStore((s) => s.create)
  const update = useProfilesStore((s) => s.update)
  const [form, setForm] = useState<FormState>(() => initialState(profile))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function set<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSave(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const baseUrl = form.baseUrl.trim().length > 0 ? form.baseUrl.trim() : null
      const maxTokens = form.maxTokens.trim().length > 0 ? Number(form.maxTokens) : null

      if (profile === null) {
        const input: ProfileCreateInput = {
          name: form.name.trim(),
          provider: form.provider,
          baseUrl,
          model: form.model.trim(),
          temperature: Number(form.temperature),
          topP: Number(form.topP),
          maxTokens,
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await create(input)
      } else {
        const patch: ProfileUpdateInput = {
          name: form.name.trim(),
          provider: form.provider,
          baseUrl,
          model: form.model.trim(),
          temperature: Number(form.temperature),
          topP: Number(form.topP),
          maxTokens,
          // EMPTY apiKey field on edit means "leave the existing key alone"
          // — we do NOT send empty string here (which would mean "clear the key").
          ...(form.apiKey.length > 0 ? { apiKey: form.apiKey } : {})
        }
        await update(profile.id, patch)
      }
      onClose()
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'E_DUPLICATE_NAME') {
        setError(t('settings.ai.errorDuplicateName'))
      } else if (code === 'E_KEYCHAIN_UNAVAILABLE') {
        setError(t('settings.secret.unavailable'))
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-medium">
          {profile ? t('settings.ai.editProfile') : t('settings.ai.addProfile')}
        </h3>

        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block">{t('settings.ai.name')}</span>
            <input
              className="block w-full rounded border bg-background px-3 py-2"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">{t('settings.ai.provider')}</span>
            <select
              className="block w-full rounded border bg-background px-3 py-2"
              value={form.provider}
              onChange={(e) => set('provider', e.target.value as AiProviderKind)}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {form.provider === 'openai-compatible' || form.provider === 'ollama' ? (
            <label className="block">
              <span className="mb-1 block">{t('settings.ai.baseUrl')}</span>
              <input
                className="block w-full rounded border bg-background px-3 py-2"
                value={form.baseUrl}
                placeholder={form.provider === 'ollama' ? 'http://localhost:11434' : ''}
                onChange={(e) => set('baseUrl', e.target.value)}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1 block">{t('settings.ai.model')}</span>
            <input
              className="block w-full rounded border bg-background px-3 py-2"
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">
              {t('settings.ai.temperature')} ({form.temperature})
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => set('temperature', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">
              {t('settings.ai.topP')} ({form.topP})
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={form.topP}
              onChange={(e) => set('topP', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">{t('settings.ai.maxTokens')}</span>
            <input
              type="number"
              className="block w-full rounded border bg-background px-3 py-2"
              value={form.maxTokens}
              onChange={(e) => set('maxTokens', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block">{t('settings.ai.apiKey')}</span>
            <input
              type="password"
              autoComplete="off"
              className="block w-full rounded border bg-background px-3 py-2"
              value={form.apiKey}
              placeholder={profile ? t('settings.ai.apiKeyKeepEmpty') : ''}
              onChange={(e) => set('apiKey', e.target.value)}
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
            onClick={onClose}
            disabled={busy}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
            onClick={() => void onSave()}
            disabled={busy}
          >
            {t('settings.ai.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run all settings UI tests**

Run: `npx vitest run src/components/settings/ src/stores/profiles.test.ts`
Expected: PASS — all dialog + tab tests green.

- [ ] **Step 5: Bundle commit (Tasks 1, 2, 3)**

```bash
git add \
  src/stores/profiles.ts \
  src/stores/profiles.test.ts \
  src/components/settings/AiTab.tsx \
  src/components/settings/AiTab.test.tsx \
  src/components/settings/BrowserTab.tsx \
  src/components/settings/BrowserTab.test.tsx \
  src/components/settings/ProfileDialog.tsx \
  src/components/settings/ProfileDialog.test.tsx \
  src/pages/Settings.tsx \
  shared/ipc-contract.ts \
  electron/ipc/settings.ts \
  preload/preload.ts
git commit -m "feat(phase-13): AI tab + Browser tab + ProfileDialog with overwrite semantics"
```

---

<!-- openspec-task: 5.1 -->
### Task 4: Ad-block module + hot toggle

**Files:**
- Create: `electron/browser/ad-block.ts`
- Create: `electron/browser/ad-block.test.ts`
- Create: `src/public/hosts/block-domains.txt`
- Modify: `electron/main.ts`

> Note: phase-11 has not yet introduced the browser shell or `webRequest.onBeforeRequest` listener. Phase-13 ships the minimal scaffolding (a default partition handler with an embedded list of well-known ad/tracker domains) so the `blockAds` toggle has something real to register/unregister. Phase-11 will later extend the block list and reuse the same module.

- [ ] **Step 1: Create the block-domains list**

```
# src/public/hosts/block-domains.txt
# Minimal phase-13 list — phase-11 will replace with the canonical list.
googletagmanager.com
www.googletagmanager.com
doubleclick.net
www.googleadservices.com
google-analytics.com
www.google-analytics.com
analytics.google.com
adservice.google.com
```

- [ ] **Step 2: Write the failing test**

```ts
// electron/browser/ad-block.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const beforeRequestHandlers: Record<string, (details: { url: string }, cb: (r: { cancel: boolean }) => void) => void> = {}

vi.mock('electron', () => ({
  session: {
    fromPartition: vi.fn(() => ({
      webRequest: {
        onBeforeRequest: vi.fn((filter: { urls: string[] }, listener: (details: { url: string }, cb: (r: { cancel: boolean }) => void) => void) => {
          if (typeof filter === 'function') {
            beforeRequestHandlers['default'] = filter as never
          } else {
            beforeRequestHandlers['default'] = listener
          }
        })
      }
    }))
  }
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn().mockReturnValue('googletagmanager.com\ndoubleclick.net\n')
  }
})

import { initAdBlock, __resetForTest } from './ad-block'
import { settingsStore } from '../settings/store'

describe('ad-block', () => {
  beforeEach(() => {
    __resetForTest()
    Object.keys(beforeRequestHandlers).forEach((k) => delete beforeRequestHandlers[k])
  })
  afterEach(() => {
    __resetForTest()
  })

  it('on init with blockAds=true, registers a handler that cancels block-list domains', () => {
    initAdBlock({ initialEnabled: true })
    expect(beforeRequestHandlers['default']).toBeDefined()

    let result: { cancel: boolean } | null = null
    beforeRequestHandlers['default'](
      { url: 'https://www.googletagmanager.com/gtm.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: true })

    // Allow non-listed domain
    beforeRequestHandlers['default'](
      { url: 'https://example.com/normal.js' },
      (r) => { result = r }
    )
    expect(result).toEqual({ cancel: false })
  })

  it('on init with blockAds=false, does NOT register the handler', () => {
    initAdBlock({ initialEnabled: false })
    expect(beforeRequestHandlers['default']).toBeUndefined()
  })

  it('subscribes to settings.onChange — toggling blockAds adds/removes the listener', () => {
    initAdBlock({ initialEnabled: false })
    expect(beforeRequestHandlers['default']).toBeUndefined()

    // Simulate user enabling block ads through settings
    settingsStore.__resetSubscribers()
    initAdBlock({ initialEnabled: false })
    // mimic settingsStore emitting the change
    // (the real path is settingsStore.set('browser', { blockAds: true }) — but
    // that requires a DB. We trigger the subscription directly.)

    // In the real subscription path inside initAdBlock, settingsStore.onChange
    // listener calls `register()` when blockAds turns true. Verify by
    // running the listener directly:
    settingsStore.__emitForTest({ ns: 'browser', key: 'blockAds', newValue: true, oldValue: false } as never)
    expect(beforeRequestHandlers['default']).toBeDefined()

    settingsStore.__emitForTest({ ns: 'browser', key: 'blockAds', newValue: false, oldValue: true } as never)
    expect(beforeRequestHandlers['default']).toBeUndefined()
  })
})
```

- [ ] **Step 3: Add a test-only emitter to settingsStore**

Modify `electron/settings/store.ts`. Add at the bottom of the exports:

```ts
function __emitForTest(event: SettingChangeEvent): void {
  emitter.emit('change', event)
}

export const settingsStore = {
  get,
  set,
  onChange,
  __resetSubscribers,
  __emitForTest
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run electron/browser/ad-block.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5: Create the ad-block module**

```ts
// electron/browser/ad-block.ts
import { session } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { settingsStore } from '../settings/store'
import { logger } from '../services/logger'

const BROWSER_PARTITION = 'persist:browser-default'

let blockedHosts: Set<string> | null = null
let listener: ((details: Electron.OnBeforeRequestListenerDetails, cb: (r: { cancel: boolean }) => void) => void) | null = null
let unsubFromSettings: (() => void) | null = null
let cancelCount = 0

function loadBlockList(): Set<string> {
  if (blockedHosts) return blockedHosts
  // dev: __dirname = electron/browser/; resolve to src/public/hosts.
  // prod: copied next to main.js by electron.vite.config.ts (see Plan 4 task 4
  // step 9 below — copy plugin for hosts dir mirrors the SQL copy plugin).
  const candidates = [
    join(__dirname, '..', '..', 'src', 'public', 'hosts', 'block-domains.txt'),
    join(__dirname, 'block-domains.txt')
  ]
  for (const path of candidates) {
    try {
      const content = readFileSync(path, 'utf8')
      blockedHosts = new Set(
        content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'))
      )
      return blockedHosts
    } catch {
      // try next candidate
    }
  }
  // Fallback empty set; better to no-op than crash main.
  blockedHosts = new Set()
  return blockedHosts
}

function register(): void {
  if (listener) return
  const ses = session.fromPartition(BROWSER_PARTITION)
  const blocked = loadBlockList()

  listener = (details, cb): void => {
    try {
      const url = new URL(details.url)
      if (blocked.has(url.hostname)) {
        cancelCount++
        cb({ cancel: true })
        return
      }
    } catch {
      /* malformed url — let it through */
    }
    cb({ cancel: false })
  }

  // Per Electron docs, calling onBeforeRequest with a new listener replaces
  // the previous one. Using a single listener slot keeps unregister simple.
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, listener)
}

function unregister(): void {
  if (!listener) return
  const ses = session.fromPartition(BROWSER_PARTITION)
  // Passing null clears the registered listener (Electron API).
  ses.webRequest.onBeforeRequest(null)
  listener = null
}

export function initAdBlock(opts: { initialEnabled: boolean }): void {
  if (opts.initialEnabled) register()
  unsubFromSettings = settingsStore.onChange((ev) => {
    if (ev.ns !== 'browser' || ev.key !== 'blockAds') return
    if (ev.newValue === true) register()
    else unregister()
  })
}

export function getCancelCount(): number {
  return cancelCount
}

export function __resetForTest(): void {
  unregister()
  unsubFromSettings?.()
  unsubFromSettings = null
  cancelCount = 0
  blockedHosts = null
}
```

- [ ] **Step 6: Wire `initAdBlock` into bootstrap**

Modify `electron/main.ts`. Inside the `groveService.onChange` callback (lines 73-100), after `dbService.openForGrove(...)` succeeds and the DB is open, initialize ad-block once with the persisted setting. Since `settingsStore.get` requires a DB, we call it after the DB is opened:

```ts
// electron/main.ts — inside the project:changed handler, after DB is open
import { initAdBlock } from './browser/ad-block'
import { settingsStore } from './settings/store'

// Inside the `payload !== null` branch, after `dbService.openForGrove(...)`:
const browser = settingsStore.get('browser')
initAdBlock({ initialEnabled: browser.blockAds })
```

Use a module-level `let adBlockInstalled = false` flag to ensure single registration across grove switches. The full safe insertion:

```ts
// near top of main.ts
import { initAdBlock, __resetForTest as resetAdBlock } from './browser/ad-block'

// Inside groveService.onChange, in the payload !== null branch, after openForGrove:
if (!adBlockInstalled) {
  const browser = settingsStore.get('browser')
  initAdBlock({ initialEnabled: browser.blockAds })
  adBlockInstalled = true
}

// In the payload === null branch (grove closed), reset:
if (adBlockInstalled) {
  resetAdBlock()
  adBlockInstalled = false
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run electron/browser/ad-block.test.ts electron/settings/store.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add electron/browser/ad-block.ts electron/browser/ad-block.test.ts \
  electron/settings/store.ts electron/main.ts \
  src/public/hosts/block-domains.txt
git commit -m "feat(phase-13): ad-block module with hot toggle on settings.browser.blockAds"
```

---

<!-- openspec-task: 5.2 -->
### Task 5: Renderer root — apply theme / fontScale / locale on settings:changed

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/stores/root.ts`
- Create: `src/stores/settings-effects.ts`
- Create: `src/stores/settings-effects.test.ts`

The phase-1 `useRootStore` (`src/stores/root.ts:1-55`) had its own `theme`/`locale` source of truth. Phase-13 supersedes those; the settings store is now authoritative. We add a small effects runner that subscribes to the settings store and reapplies side-effects on every change.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/settings-effects.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

// @vitest-environment jsdom
import { i18n } from '@/i18n'
import { useSettingsStore } from './settings'
import { installSettingsEffects, __resetEffectsForTest } from './settings-effects'

describe('settings effects', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  beforeEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true)
    __resetEffectsForTest()
    document.documentElement.dataset.theme = ''
    document.documentElement.style.removeProperty('--font-scale')
  })
  afterEach(() => {
    __resetEffectsForTest()
  })

  it('applies initial appearance + locale on install', async () => {
    useSettingsStore.setState({
      appearance: { theme: 'dark', fontScale: 1.2, editorFont: 'Georgia' },
      general: { locale: 'en-US', autoBackup: 'off' },
      ready: true
    })
    installSettingsEffects()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.2')
    expect(i18n.language).toBe('en-US')
  })

  it('reacts to subsequent appearance changes', () => {
    installSettingsEffects()
    useSettingsStore.setState({
      appearance: { theme: 'light', fontScale: 1.1, editorFont: 'system-ui' }
    })
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.1')
  })

  it('reacts to locale changes by calling i18n.changeLanguage', () => {
    installSettingsEffects()
    useSettingsStore.setState({
      general: { locale: 'en-US', autoBackup: 'off' }
    })
    expect(i18n.language).toBe('en-US')
  })

  it('install is idempotent (called twice → only one subscription)', () => {
    installSettingsEffects()
    installSettingsEffects()
    // Trigger a change and ensure side effects fire once (we trust zustand's
    // single-listener semantics; this just verifies no double-application
    // by counting setProperty calls via spy)
    const spy = vi.spyOn(document.documentElement.style, 'setProperty')
    useSettingsStore.setState({
      appearance: { theme: 'dark', fontScale: 1.3, editorFont: 'system-ui' }
    })
    expect(spy.mock.calls.filter(([k]) => k === '--font-scale').length).toBe(1)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/settings-effects.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the effects module**

```ts
// src/stores/settings-effects.ts
import { i18n } from '@/i18n'
import { useSettingsStore } from './settings'
import type { Theme, Locale } from '@shared/settings-types'

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
}

function applyFontScale(scale: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--font-scale', String(scale))
}

function applyEditorFont(font: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--editor-font', font)
}

function applyLocale(locale: Locale): void {
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale)
  }
}

let installed = false
let unsubscribe: (() => void) | null = null

export function installSettingsEffects(): () => void {
  if (installed) return unsubscribe ?? (() => {})
  installed = true

  const { appearance, general } = useSettingsStore.getState()
  applyTheme(appearance.theme)
  applyFontScale(appearance.fontScale)
  applyEditorFont(appearance.editorFont)
  applyLocale(general.locale)

  let prevTheme = appearance.theme
  let prevFontScale = appearance.fontScale
  let prevEditorFont = appearance.editorFont
  let prevLocale = general.locale

  unsubscribe = useSettingsStore.subscribe((state) => {
    if (state.appearance.theme !== prevTheme) {
      prevTheme = state.appearance.theme
      applyTheme(state.appearance.theme)
    }
    if (state.appearance.fontScale !== prevFontScale) {
      prevFontScale = state.appearance.fontScale
      applyFontScale(state.appearance.fontScale)
    }
    if (state.appearance.editorFont !== prevEditorFont) {
      prevEditorFont = state.appearance.editorFont
      applyEditorFont(state.appearance.editorFont)
    }
    if (state.general.locale !== prevLocale) {
      prevLocale = state.general.locale
      applyLocale(state.general.locale)
    }
  })

  return unsubscribe
}

export function __resetEffectsForTest(): void {
  unsubscribe?.()
  unsubscribe = null
  installed = false
}
```

- [ ] **Step 4: Wire into renderer bootstrap**

Modify `src/main.tsx`. Replace `initThemeEffect()` (line 16) with `installSettingsEffects()`:

```tsx
// src/main.tsx
import { installSettingsEffects } from '@/stores/settings-effects'

// Replace:
// initThemeEffect()
// with:
installSettingsEffects()
```

The phase-1 `initThemeEffect` and the in-memory `theme`/`locale` in `useRootStore` are now superseded. Leave `useRootStore` in place (other code may still read from it) but mark it deprecated. (No behavioral change — phase-13 settings always win.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/stores/settings-effects.test.ts && npx vitest run src/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/stores/settings-effects.ts src/stores/settings-effects.test.ts src/main.tsx
git commit -m "feat(phase-13): install settings effects — theme/fontScale/locale react to store"
```

---

<!-- openspec-task: 5.3 -->
### Task 6: Phase-12 inbox + searchEngine placeholders

**Files:**
- Create: `electron/settings/runtime-readers.ts`
- Create: `electron/settings/runtime-readers.test.ts`

Phase-12 (clipping) and the phase-11 AddressBar will consume `general.inboxPath` (eventually) and `browser.searchEngine`. Phase-13 only persists the values; this task creates the lookup helpers so future phases have a stable API surface.

- [ ] **Step 1: Write the failing test**

```ts
// electron/settings/runtime-readers.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { resolve } from 'node:path'
import { runMigrations } from '../services/db/migrations'

vi.mock('../services/db', () => ({ dbService: { requireCurrent: vi.fn() } }))
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn((s: string) => Buffer.from(`enc:${s}`)),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8'))
  }
}))

import { dbService } from '../services/db'
import { settingsStore } from './store'
import { getInboxPath, getSearchEngineUrl, getBlockAdsEnabled } from './runtime-readers'
import { initSafeStorageAvailability, __resetForTest as resetSafe } from './safe-storage-state'

const reqCur = dbService.requireCurrent as unknown as ReturnType<typeof vi.fn>
const MIGRATIONS = resolve(__dirname, '../services/db/migrations')

describe('runtime-readers', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
    settingsStore.__resetSubscribers()
  })

  it('getInboxPath returns the phase-12 default ("inbox/")', () => {
    expect(getInboxPath()).toBe('inbox/')
  })

  it('getBlockAdsEnabled returns the live setting (default true, then toggled)', () => {
    expect(getBlockAdsEnabled()).toBe(true)
    settingsStore.set('browser', { blockAds: false })
    expect(getBlockAdsEnabled()).toBe(false)
  })

  it('getSearchEngineUrl returns the URL template for the chosen engine', () => {
    expect(getSearchEngineUrl('cats')).toMatch(/google\.com.*cats/)
    settingsStore.set('browser', { searchEngine: 'duckduckgo' })
    expect(getSearchEngineUrl('cats')).toMatch(/duckduckgo\.com.*cats/)
    settingsStore.set('browser', { searchEngine: 'bing' })
    expect(getSearchEngineUrl('cats')).toMatch(/bing\.com.*cats/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run electron/settings/runtime-readers.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the readers module**

```ts
// electron/settings/runtime-readers.ts
import { settingsStore } from './store'
import type { SearchEngine } from '@shared/settings-types'

const SEARCH_ENGINE_URLS: Record<SearchEngine, (q: string) => string> = {
  google: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  bing: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  duckduckgo: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`
}

/**
 * Phase-12 will replace this constant with a configurable setting key. For
 * phase-13 we just expose the helper so phase-12 can land its consumer
 * without touching anything else.
 */
const INBOX_PATH = 'inbox/'

export function getInboxPath(): string {
  return INBOX_PATH
}

export function getBlockAdsEnabled(): boolean {
  return settingsStore.get('browser').blockAds
}

export function getSearchEngineUrl(query: string): string {
  const engine = settingsStore.get('browser').searchEngine
  return SEARCH_ENGINE_URLS[engine](query)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run electron/settings/runtime-readers.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add electron/settings/runtime-readers.ts electron/settings/runtime-readers.test.ts
git commit -m "feat(phase-13): runtime-readers for inboxPath / searchEngine / blockAds (phase-12 hook)"
```

---

## End-of-plan checks

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — clean
- [ ] Dev app: open `/settings/ai`, "Add profile" → fill name/model/key → save → card appears, verify in DB that `ai_provider_profiles` has the row and `settings_secrets` has the encrypted blob
- [ ] Dev app: open `/settings/browser`, toggle "Block ads" off → DevTools network tab in browser pane shows previously-blocked tracker requests now passing
- [ ] Dev app: change theme to dark → `<html data-theme="dark">` immediately; reload → setting persists

Surface area for Plan 4:
- All four tabs render real content
- Hot updates are wired both in main (`ad-block.ts`) and renderer (`settings-effects.ts`)
- Plan 4 only needs to add the AppRail entry, the `Cmd+,` hotkey, the i18n keys these components reference, and security-audit verification
