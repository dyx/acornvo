# Phase-13 Secure Storage & Settings — Plan 4: AppRail + Cmd+, + i18n + Security Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a minimal `AppRail` (because phase-11 hasn't shipped yet), wire the bottom gear entry + the `Cmd/Ctrl+,` global hotkey, fill in all `settings.*` i18n keys, then run the three security-audit checks (profile list never leaks plaintext, renderer cannot access `secret.*` or `getDecryptedKey`, deleting a profile cascades to its secret row).

**Architecture:** AppRail is added to `App.tsx` as a flex sibling of `<main>`. The four module entries (果仓/拾果/松语/Settings) come from a static config; the bottom gear pushes off via `mt-auto`. Global hotkey extends the existing `useGlobalHotkeys` hook. i18n keys are added to the existing `zh-CN.json` and a fresh `en-US.json` (so acceptance test 9.3 — switching to en-US — has translations to render).

**Tech Stack:** Same as previous plans + `lucide-react` for icons (already installed).

**Carry-overs:**

- The `/settings/*` route is already mounted in Plan 2.
- `useSettingsStore`, `useProfilesStore`, `installSettingsEffects` from Plans 2+3.
- New IPC error codes from Plan 1.

---

<!-- openspec-task: 6.1 -->

### Task 1: Minimal AppRail with bottom gear

**Files:**

- Create: `src/components/AppRail.tsx`
- Create: `src/components/AppRail.test.tsx`
- Modify: `src/App.tsx`

> Phase-11 was supposed to introduce AppRail, but per the codebase audit (no `electron/browser/`, no `WebContentsView`) phase-11 has not landed. Phase-13's `app-shell` MODIFIED spec (`specs/app-shell/spec.md`) adds the bottom gear entry; we must therefore introduce the rail itself. The four entries follow the spec layout: 果仓 / 拾果 / 松语 (disabled until phase-17) on top, gear on bottom. This rail can be extended by phase-11 without surgery.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
// src/components/AppRail.test.tsx
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { i18n } from '@/i18n'
import { AppRail } from './AppRail'

describe('AppRail', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('renders four entries — library, browser, chat, settings', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /library|果仓/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /browser|拾果/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /chat|松语/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /settings|设置/i })).toBeTruthy()
  })

  it('marks active entry with aria-current="page" when route matches', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    const lib = screen.getByRole('link', { name: /library|果仓/i })
    expect(lib.getAttribute('aria-current')).toBe('page')
  })

  it('settings entry is at the bottom (mt-auto class)', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    const settings = screen.getByRole('link', { name: /settings|设置/i })
    expect(settings.className).toMatch(/mt-auto/)
  })

  it('chat entry is rendered with aria-disabled when phase-17 not ready', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <AppRail />
      </MemoryRouter>
    )
    const chat = screen.getByRole('link', { name: /chat|松语/i })
    expect(chat.getAttribute('aria-disabled')).toBe('true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/AppRail.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create the AppRail component**

```tsx
// src/components/AppRail.tsx
import type { JSX } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookMarked, Compass, MessagesSquare, Settings as SettingsIcon } from 'lucide-react'

interface RailEntry {
  to: string
  labelKey: string
  Icon: typeof BookMarked
  disabled?: boolean
  bottom?: boolean
}

const ENTRIES: RailEntry[] = [
  { to: '/library', labelKey: 'nav.library', Icon: BookMarked },
  { to: '/browser', labelKey: 'nav.browser', Icon: Compass },
  { to: '/chat', labelKey: 'nav.chat', Icon: MessagesSquare, disabled: true },
  { to: '/settings', labelKey: 'nav.settings', Icon: SettingsIcon, bottom: true }
]

export function AppRail(): JSX.Element {
  const { t } = useTranslation()
  return (
    <nav
      aria-label="app navigation"
      className="flex w-[60px] shrink-0 flex-col items-stretch border-r bg-muted/40 py-2"
    >
      {ENTRIES.map((entry) => {
        const label = t(entry.labelKey)
        const baseCls = 'flex flex-col items-center gap-1 px-1 py-3 text-[11px] transition-colors'
        if (entry.disabled) {
          return (
            <a
              key={entry.to}
              href="#"
              role="link"
              aria-disabled="true"
              title={t('settings.common.comingSoon')}
              onClick={(e) => e.preventDefault()}
              className={`${baseCls} cursor-not-allowed text-muted-foreground/50 ${entry.bottom ? 'mt-auto' : ''}`}
            >
              <entry.Icon size={20} />
              <span>{label}</span>
            </a>
          )
        }
        return (
          <NavLink
            key={entry.to}
            to={entry.to}
            className={({ isActive }) =>
              `${baseCls} ${entry.bottom ? 'mt-auto' : ''} ${
                isActive
                  ? 'bg-accent text-accent-foreground border-l-2 border-primary'
                  : 'text-foreground hover:bg-muted'
              }`
            }
            aria-current={undefined}
          >
            {({ isActive }) => (
              <>
                <entry.Icon size={20} />
                <span>{label}</span>
                {/* react-router NavLink adds aria-current automatically when isActive */}
                {isActive ? <span hidden aria-hidden="true" /> : null}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Mount AppRail in `App.tsx`**

Modify `src/App.tsx`. The current layout is:

```tsx
<div className="flex h-full flex-col">
  <TitleBar />
  <main className="flex-1 overflow-hidden">
    <Routes>...</Routes>
  </main>
  ...
</div>
```

Restructure as a row (rail + main column):

```tsx
// src/App.tsx — replace the outer return
import { AppRail } from '@/components/AppRail'

return (
  <div className="flex h-full flex-col">
    <TitleBar />
    <div className="flex flex-1 overflow-hidden">
      <AppRail />
      <main className="flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<BootstrapGate />} />
          <Route path="/picker" element={<ProjectPicker />} />
          <Route path="/library" element={<Library />} />
          <Route path="/editor/:encodedPath" element={<Editor />} />
          <Route path="/browser" element={<Placeholder name="browser" />} />
          <Route path="/chat" element={<Placeholder name="chat" />} />
          <Route path="/settings/*" element={<Settings />} />
          <Route path="/search" element={<Search />} />
        </Routes>
      </main>
    </div>
    <IndexBanner />
    <DbRebuildOverlay visible={isRebuilding} />
    <QuickSwitcher />
    <IndexProgressOverlay
      visible={indexState === 'scanning'}
      scanned={progress.scanned}
      total={progress.total}
      currentPath={progress.currentPath}
      onCancel={() => ipc.index.cancelScan()}
    />
    <Toaster />
  </div>
)
```

> The rail is hidden when there's no grove (the `/picker` page). Either (a) accept that the rail shows but its destinations 404 until a grove is open, or (b) conditionally hide the rail when `useGroveStore(...).current === null`. Pick (b):

```tsx
// src/App.tsx — refine
const groveCurrent = useGroveStore((s) => s.current)
// ...
<div className="flex flex-1 overflow-hidden">
  {groveCurrent && <AppRail />}
  <main className="flex-1 overflow-hidden">...</main>
</div>
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/AppRail.test.tsx && npx vitest run src/`
Expected: PASS.

- [ ] **Step 6: Verify in dev**

Run: `npm run dev`
Open the app, open a grove, verify:

- Left edge shows the four-entry rail (60px wide).
- Library is highlighted on `/library`.
- Bottom gear pushes to bottom (mt-auto).
- Click gear → navigate `/settings/general`.
- Hover 松语 → tooltip "即将推出"; clicking does nothing.
- Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppRail.tsx src/components/AppRail.test.tsx src/App.tsx
git commit -m "feat(phase-13): minimal AppRail with library/browser/chat/settings entries"
```

---

<!-- openspec-task: 6.2 -->

### Task 2: Confirm `/settings` route registration

> Already done in Plan 2 task 6 (`<Route path="/settings/*" element={<Settings />} />` replaces the placeholder). This task only validates the wiring and removes the obsolete placeholder import.

**Files:**

- Modify: `src/App.tsx`
- (no new test — covered by `Settings.test.tsx` from Plan 2)

- [ ] **Step 1: Verify the placeholder import is gone**

Open `src/App.tsx`. Confirm:

- `import { Placeholder } from './pages/Placeholder'` — still imported (used by `/browser` and `/chat` until phase-11/17).
- No `<Route path="/settings" element={<Placeholder name="settings" />} />` anymore.
- The route is `<Route path="/settings/*" element={<Settings />} />`.

- [ ] **Step 2: Add an integration test that confirms `/` resolves to library and the AppRail is visible**

The end-to-end happy path is already covered by `Settings.test.tsx`. As a smoke check:

```tsx
// src/App.smoke.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/ipc/client', () => ({
  ipc: {
    settings: {
      get: vi.fn().mockResolvedValue({}),
      keychainAvailable: vi.fn().mockResolvedValue(true)
    },
    on: vi.fn(() => () => {})
  }
}))

import { i18n } from '@/i18n'
import { App } from './App'
import { useGroveStore } from '@/stores/grove'

describe('App with settings route', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
    useGroveStore.setState({
      current: { id: 'g', name: 'g', path: '/tmp/g', files: 0 }
    } as never)
  })

  it('mounts /settings/general by default when navigated to /settings', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('settings-tab-general')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/App.smoke.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/App.smoke.test.tsx
git commit -m "test(phase-13): App smoke test — /settings → /settings/general"
```

---

<!-- openspec-task: 6.3 -->

### Task 3: `Cmd/Ctrl+,` global hotkey

**Files:**

- Modify: `src/hooks/useGlobalHotkeys.ts`
- Modify: `src/hooks/useGlobalHotkeys.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useGlobalHotkeys.test.ts` (if it doesn't exist):

```tsx
// @vitest-environment jsdom
// src/hooks/useGlobalHotkeys.test.tsx
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { JSX } from 'react'
import { useEffect } from 'react'

import { i18n } from '@/i18n'

vi.mock('@/stores/search', () => ({
  useSearchStore: Object.assign(
    (selector: (s: unknown) => unknown) => selector({ quickSwitcher: { open: vi.fn() } }),
    { getState: () => ({ quickSwitcher: { open: vi.fn() } }) }
  )
}))

import { useGlobalHotkeys } from './useGlobalHotkeys'

function HotkeyHost({ pathSink }: { pathSink: { path: string } }): JSX.Element {
  useGlobalHotkeys()
  const loc = useLocation()
  useEffect(() => {
    pathSink.path = loc.pathname
  }, [loc.pathname, pathSink])
  return <div data-testid="host" />
}

describe('useGlobalHotkeys — Cmd+, navigates to /settings', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => cleanup())

  it('Cmd+, navigates to /settings', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',', metaKey: true })
    expect(sink.path).toBe('/settings')
  })

  it('Ctrl+, also navigates (Windows / Linux)', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',', ctrlKey: true })
    expect(sink.path).toBe('/settings')
  })

  it(', with no modifier does NOT navigate', () => {
    const sink = { path: '/library' }
    render(
      <MemoryRouter initialEntries={['/library']}>
        <HotkeyHost pathSink={sink} />
      </MemoryRouter>
    )
    fireEvent.keyDown(window, { key: ',' })
    expect(sink.path).toBe('/library')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useGlobalHotkeys.test.tsx`
Expected: FAIL — `,` key handling not implemented yet.

- [ ] **Step 3: Extend the hotkey handler**

Modify `src/hooks/useGlobalHotkeys.ts`. Inside the `onKeyDown` function (lines 17-36), add a branch for `,`:

```ts
// src/hooks/useGlobalHotkeys.ts — inside onKeyDown
if (key === ',' && !ev.shiftKey) {
  ev.preventDefault()
  navigate('/settings')
  return
}
```

The full updated function (replace lines 16-39):

```ts
useEffect(() => {
  function onKeyDown(ev: KeyboardEvent): void {
    const mod = ev.metaKey || ev.ctrlKey
    if (!mod) return
    const key = ev.key.toLowerCase()
    if (key === 'p' && !ev.shiftKey) {
      ev.preventDefault()
      openQuickSwitcher()
      return
    }
    if (key === 'f' && ev.shiftKey) {
      ev.preventDefault()
      if (location.pathname === '/search') {
        const el = document.querySelector<HTMLInputElement>('[role="searchbox"]')
        el?.select()
      } else {
        navigate('/search')
      }
      return
    }
    if (key === ',' && !ev.shiftKey) {
      ev.preventDefault()
      navigate('/settings')
      return
    }
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [openQuickSwitcher, navigate, location.pathname])
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/hooks/useGlobalHotkeys.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGlobalHotkeys.ts src/hooks/useGlobalHotkeys.test.tsx
git commit -m "feat(phase-13): global hotkey Cmd/Ctrl+, opens /settings"
```

---

<!-- openspec-task: 7.1 -->

### Task 4: i18n keys (zh-CN + en-US)

**Files:**

- Modify: `src/i18n/locales/zh-CN.json`
- Create: `src/i18n/locales/en-US.json`
- Modify: `src/i18n/index.ts`
- Create: `src/i18n/settings-keys.test.ts`

The components from Plans 2-3 already reference dozens of `settings.*` keys. We add them all here in both languages. The `en-US.json` is required so acceptance test 9.3 ("切语言 en-US → 全部文案英文") has translations to render.

- [ ] **Step 1: Write the failing test (key parity)**

```ts
// src/i18n/settings-keys.test.ts
import { describe, it, expect } from 'vitest'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

const REQUIRED_KEYS = [
  'settings.title',
  'settings.tab.general',
  'settings.tab.appearance',
  'settings.tab.ai',
  'settings.tab.browser',
  'settings.general.locale',
  'settings.general.autoBackup',
  'settings.general.vaultPath',
  'settings.appearance.theme',
  'settings.appearance.theme.system',
  'settings.appearance.theme.light',
  'settings.appearance.theme.dark',
  'settings.appearance.fontScale',
  'settings.appearance.editorFont',
  'settings.ai.profiles',
  'settings.ai.empty',
  'settings.ai.addProfile',
  'settings.ai.editProfile',
  'settings.ai.deleteProfile',
  'settings.ai.setDefault',
  'settings.ai.default',
  'settings.ai.confirmDelete',
  'settings.ai.errorDuplicateName',
  'settings.ai.name',
  'settings.ai.provider',
  'settings.ai.baseUrl',
  'settings.ai.model',
  'settings.ai.temperature',
  'settings.ai.topP',
  'settings.ai.maxTokens',
  'settings.ai.apiKey',
  'settings.ai.apiKeyKeepEmpty',
  'settings.ai.save',
  'settings.browser.blockAds',
  'settings.browser.clipImages',
  'settings.browser.clearCookies',
  'settings.browser.clearCookiesConfirm',
  'settings.browser.searchEngine',
  'settings.secret.saved',
  'settings.secret.unavailable',
  'settings.common.comingSoon'
]

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[path] = v
    else if (v && typeof v === 'object')
      Object.assign(out, flatten(v as Record<string, unknown>, path))
  }
  return out
}

describe('settings i18n keys', () => {
  const flat_zh = flatten(zhCN as Record<string, unknown>)
  const flat_en = flatten(enUS as Record<string, unknown>)

  for (const k of REQUIRED_KEYS) {
    it(`zh-CN has key "${k}"`, () => {
      expect(flat_zh[k], `missing key in zh-CN: ${k}`).toBeDefined()
    })
    it(`en-US has key "${k}"`, () => {
      expect(flat_en[k], `missing key in en-US: ${k}`).toBeDefined()
    })
  }

  it('zh-CN and en-US have the same key set (no drift)', () => {
    const zhKeys = Object.keys(flat_zh).sort()
    const enKeys = Object.keys(flat_en).sort()
    expect(enKeys).toEqual(zhKeys)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/settings-keys.test.ts`
Expected: FAIL — `en-US.json` does not exist.

- [ ] **Step 3: Add the new keys to `zh-CN.json`**

Open `src/i18n/locales/zh-CN.json`. Append a new `settings` namespace and `common.copy` key (used by the General tab). The full diff (after the existing `search` entry):

```json
{
  ...,
  "common": {
    "loading": "加载中…",
    "error": "发生错误",
    "cancel": "取消",
    "confirm": "确定",
    "remove": "移除",
    "open": "打开",
    "copy": "复制"
  },
  ...,
  "settings": {
    "title": "设置",
    "tab": {
      "general": "通用",
      "appearance": "外观",
      "ai": "AI",
      "browser": "浏览器"
    },
    "general": {
      "locale": "语言",
      "autoBackup": "自动备份",
      "vaultPath": "树林路径"
    },
    "appearance": {
      "theme": "主题",
      "theme.system": "跟随系统",
      "theme.light": "浅色",
      "theme.dark": "深色",
      "fontScale": "字号",
      "editorFont": "编辑器字体"
    },
    "ai": {
      "profiles": "AI Profile",
      "empty": "尚无 AI Profile，点击上方添加",
      "addProfile": "添加 Profile",
      "editProfile": "编辑",
      "deleteProfile": "删除",
      "setDefault": "设为默认",
      "default": "默认",
      "confirmDelete": "确认删除 “{{name}}” 吗？",
      "errorDuplicateName": "名称已被占用",
      "name": "名称",
      "provider": "Provider",
      "baseUrl": "Base URL",
      "model": "模型",
      "temperature": "温度",
      "topP": "Top P",
      "maxTokens": "最大输出 tokens",
      "apiKey": "API Key",
      "apiKeyKeepEmpty": "留空保留原值",
      "save": "保存"
    },
    "browser": {
      "blockAds": "广告拦截",
      "clipImages": "剪藏图片本地化",
      "clearCookies": "清除所有 Cookies",
      "clearCookiesConfirm": "确定清除所有站点的登录态？",
      "searchEngine": "搜索引擎"
    },
    "secret": {
      "saved": "已保存",
      "unavailable": "OS 密钥环不可用，无法保存 API key"
    },
    "common": {
      "comingSoon": "即将推出"
    }
  }
}
```

- [ ] **Step 4: Create `en-US.json`**

```json
{
  "app": {
    "title": "Acornvo",
    "greeting": "Hello, Acornvo"
  },
  "common": {
    "loading": "Loading…",
    "error": "An error occurred",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "remove": "Remove",
    "open": "Open",
    "copy": "Copy"
  },
  "nav": {
    "home": "Home",
    "picker": "Project Picker",
    "library": "Library",
    "editor": "Editor",
    "browser": "Browser",
    "chat": "Chat",
    "settings": "Settings"
  },
  "picker": {
    "title": "Pick a Grove",
    "subtitle": "Like a squirrel — gather, organize, talk. Turn scattered reading into your own knowledge forest.",
    "recentLabel": "Recent",
    "recentCount": "Recent · {{count}}",
    "empty": "No groves yet. Create a new one or open an existing folder.",
    "new": "New Grove",
    "open": "Open Existing Folder",
    "hint": "The .acornvo/ folder under each grove holds the index and history. Source data is always your local markdown files. You can open any Obsidian vault directly.",
    "invalid": "Path no longer valid",
    "locked": "Locked",
    "takeover": "Take over",
    "files": "{{count}} files",
    "newDialog": {
      "title": "New Grove",
      "description": "A new folder will be created under the parent directory you choose.",
      "parentLabel": "Parent directory",
      "nameLabel": "Grove name",
      "namePlaceholder": "e.g. My Knowledge Forest",
      "create": "Create",
      "chooseParent": "Choose a parent directory…",
      "errorInvalidName": "Name cannot include / \\ : * ? \" < > |",
      "errorDuplicate": "A file or folder with this name already exists",
      "errorPermission": "Parent directory is not writable"
    }
  },
  "switcher": {
    "ariaLabel": "Switch grove",
    "new": "New grove…",
    "open": "Open existing folder…",
    "noGrove": "No grove selected"
  },
  "takeover": {
    "title": "Grove is in use",
    "description": "This grove is being used by another Acornvo instance.",
    "held": "PID {{pid}} · {{hostname}} · {{startedAt}}",
    "force": "Force takeover",
    "warning": "After takeover, the original window may error on save.",
    "error": "Takeover failed: {{message}}"
  },
  "index": {
    "progress": {
      "title": "Indexing…",
      "background": "Continue in background"
    }
  },
  "library": {
    "views": "Views",
    "all": "All",
    "inbox": "Inbox",
    "unreviewed": "To Review",
    "categories": "Categories",
    "tags": "Tags",
    "search_ph": "Search…",
    "reviewing": "Reviewing",
    "empty_grove": "No files yet",
    "empty_preview": "Pick one to start",
    "open_editor": "Open in Editor",
    "reveal": "Reveal in Finder",
    "banner_scanning": "Indexing — data may be incomplete",
    "banner_error": "Indexing error — some data may be missing",
    "banner_view_logs": "View logs",
    "shown_total": "{{shown}} / {{total}}"
  },
  "editor": {
    "loading": "Loading file…",
    "back": "Back to Library",
    "saving": "Saving…",
    "saved": "Saved",
    "dirty": "Unsaved",
    "shortcut_save": "Cmd+S to save",
    "shortcut_save_win": "Ctrl+S to save",
    "open_external": "Open in system editor",
    "paste_image_unsupported": "Image paste not yet supported — coming with the clipper phase",
    "no_frontmatter": "No frontmatter on this file",
    "error": {
      "title": "Cannot load file",
      "not_found": "File was removed or renamed",
      "encoding": "Cannot decode file — check the encoding",
      "conflict": "File was modified externally — refresh first",
      "save_failed": "Save failed: {{code}}",
      "save_failed_persistent": "Persistent save failure — tried 3 times",
      "open_logs": "View logs"
    }
  },
  "search": {
    "placeholder_quick": "Search file name or path",
    "recent": "Recent",
    "placeholder_full": "Search content (Chinese tokenized)",
    "empty_q": "Type a keyword to start (Chinese tokenized)",
    "no_results": "No matches",
    "no_results_full": "No matches. Try fewer keywords or use quotes for exact phrases.",
    "pending": "Index is being built — will retry automatically",
    "syntax_error": "Search syntax error",
    "recent_searches": "Recent searches",
    "total_count": "{{count}} results",
    "phrase_hint": "Type \"…\" for exact phrase search",
    "rebuilding": "Rebuilding index {{done}} / {{total}}"
  },
  "settings": {
    "title": "Settings",
    "tab": {
      "general": "General",
      "appearance": "Appearance",
      "ai": "AI",
      "browser": "Browser"
    },
    "general": {
      "locale": "Language",
      "autoBackup": "Auto-backup",
      "vaultPath": "Vault path"
    },
    "appearance": {
      "theme": "Theme",
      "theme.system": "Follow system",
      "theme.light": "Light",
      "theme.dark": "Dark",
      "fontScale": "Font size",
      "editorFont": "Editor font"
    },
    "ai": {
      "profiles": "AI Profiles",
      "empty": "No profiles yet — click \"Add profile\" above",
      "addProfile": "Add profile",
      "editProfile": "Edit",
      "deleteProfile": "Delete",
      "setDefault": "Set as default",
      "default": "default",
      "confirmDelete": "Delete profile \"{{name}}\"?",
      "errorDuplicateName": "Name already in use",
      "name": "Name",
      "provider": "Provider",
      "baseUrl": "Base URL",
      "model": "Model",
      "temperature": "Temperature",
      "topP": "Top P",
      "maxTokens": "Max tokens",
      "apiKey": "API Key",
      "apiKeyKeepEmpty": "Leave empty to keep existing",
      "save": "Save"
    },
    "browser": {
      "blockAds": "Block ads",
      "clipImages": "Localize clipped images",
      "clearCookies": "Clear all cookies",
      "clearCookiesConfirm": "Clear all site logins?",
      "searchEngine": "Search engine"
    },
    "secret": {
      "saved": "Saved",
      "unavailable": "OS keychain unavailable — cannot save API keys"
    },
    "common": {
      "comingSoon": "Coming soon"
    }
  }
}
```

- [ ] **Step 5: Register `en-US` in i18n init**

Modify `src/i18n/index.ts`:

```ts
// src/i18n/index.ts
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS }
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false
})

export { i18n }
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/i18n/`
Expected: PASS — both old library-keys.test.ts (verify still passing) and new settings-keys.test.ts.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json src/i18n/index.ts src/i18n/settings-keys.test.ts
git commit -m "feat(phase-13): i18n — settings.* keys + en-US locale"
```

---

<!-- openspec-task: 8.1 -->

### Task 5: Security audit — profile list never returns plaintext apiKey

**Files:**

- Modify: `electron/settings/profiles.test.ts` (add scenarios)

The unit tests in Plan 1 already cover most of this; add explicit security-audit assertions and a runtime spot-check.

- [ ] **Step 1: Append the audit test**

Edit `electron/settings/profiles.test.ts`. Add this `describe` block at the bottom:

```ts
// electron/settings/profiles.test.ts (append)
describe('security audit — profile CRUD never leaks apiKey plaintext', () => {
  let db: Database.Database
  beforeEach(() => {
    resetSafe()
    initSafeStorageAvailability()
    db = new Database(':memory:')
    runMigrations(db, MIGRATIONS)
    reqCur.mockReturnValue(db)
  })
  afterEach(() => db.close())

  it('list() output is JSON-serializable and does not contain "apiKey"', () => {
    profilesStore.create({ name: 'a', provider: 'openai', model: 'gpt-4o', apiKey: 'sk-secret' })
    const list = profilesStore.list()
    const json = JSON.stringify(list)
    expect(json).not.toMatch(/apiKey"\s*:/)
    expect(json).not.toMatch(/sk-secret/)
    expect(json).toMatch(/apiKeyRef/)
  })

  it('create() return shape is { id } only — does not echo apiKey', () => {
    const result = profilesStore.create({
      name: 'a',
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: 'sk-secret'
    })
    expect(result).toEqual({ id: expect.any(String) })
    expect(JSON.stringify(result)).not.toMatch(/sk-secret/)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run electron/settings/profiles.test.ts`
Expected: PASS — all original + 2 new audit tests.

- [ ] **Step 3: Commit**

```bash
git add electron/settings/profiles.test.ts
git commit -m "test(phase-13): security audit — list/create never leak apiKey plaintext"
```

---

<!-- openspec-task: 8.2 -->

### Task 6: Security audit — renderer cannot reach `secret.*` or `getDecryptedKey`

**Files:**

- Modify: `preload/preload.test.ts` (extend the test from Plan 2 task 3)

- [ ] **Step 1: Add audit assertions to the preload test**

Append the following `describe` block to `preload/preload.test.ts`:

```ts
// preload/preload.test.ts (append)
describe('security audit — preload contextBridge', () => {
  it('does not expose any property whose name suggests secret or decrypt', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]

    function walk(obj: unknown, path = 'api'): void {
      if (!obj || typeof obj !== 'object') return
      for (const key of Object.keys(obj as Record<string, unknown>)) {
        const child = (obj as Record<string, unknown>)[key]
        const fullPath = `${path}.${key}`
        const lower = key.toLowerCase()
        expect(
          lower.includes('secret') || lower.includes('decrypt') || lower === 'getdecryptedkey'
        ).toBe(false)
        if (typeof child === 'object' && child !== null) walk(child, fullPath)
      }
    }

    walk(api)
  })

  it('exposes settings without nested secret object', async () => {
    await import('./preload')
    const api = exposeInMainWorld.mock.calls[0][1]
    expect(api.settings).toBeDefined()
    expect(api.settings.secret).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run preload/preload.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add preload/preload.test.ts
git commit -m "test(phase-13): security audit — preload api has no secret/decrypt surface"
```

---

<!-- openspec-task: 8.3 -->

### Task 7: Security audit — deleting a profile cascades to `settings_secrets`

**Files:**

- Modify: `electron/settings/profiles.test.ts` (add audit case)

- [ ] **Step 1: Append the audit test**

```ts
// electron/settings/profiles.test.ts (append to the security audit describe)
it('after delete, secrets.get(oldRef) returns null AND no orphan row remains', () => {
  const { id } = profilesStore.create({
    name: 'audit',
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'sk-x'
  })
  const ref = `ai.key.${id}`
  expect(secretsStore.get(ref)).toBe('sk-x')

  profilesStore.delete(id)

  expect(secretsStore.get(ref)).toBeNull()
  const remaining = db
    .prepare('SELECT COUNT(*) AS n FROM settings_secrets WHERE key = ?')
    .get(ref) as { n: number }
  expect(remaining.n).toBe(0)

  // And no orphan profile row pointing to a missing ref:
  const profileRow = db.prepare('SELECT api_key_ref FROM ai_provider_profiles WHERE id = ?').get(id)
  expect(profileRow).toBeUndefined()
})

it('delete is atomic at the SQL level — verify with a fresh select', () => {
  const { id } = profilesStore.create({
    name: 'x',
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: 'k'
  })
  profilesStore.delete(id)
  // After delete: 0 profile rows, 0 secret rows
  const profiles = db.prepare('SELECT COUNT(*) AS n FROM ai_provider_profiles').get() as {
    n: number
  }
  const secrets = db.prepare('SELECT COUNT(*) AS n FROM settings_secrets').get() as { n: number }
  expect(profiles.n).toBe(0)
  expect(secrets.n).toBe(0)
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run electron/settings/profiles.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add electron/settings/profiles.test.ts
git commit -m "test(phase-13): security audit — delete cascades, no orphan secrets"
```

---

## End-of-plan checks

- [ ] `npm test` — all green
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — clean
- [ ] Dev app: open a grove, click the bottom gear in AppRail → settings opens. Press `Cmd+,` from anywhere → settings opens.
- [ ] Dev app: switch language to en-US. Reload. Verify rail labels read "Library / Browser / Chat / Settings".

Surface area for Plan 5: all functionality lands here; Plan 5 is purely the acceptance verification matrix from `tasks.md` section 9.
