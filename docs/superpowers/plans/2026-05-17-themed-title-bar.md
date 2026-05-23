# Themed Title Bar with Grove Switcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the redundant `TitleBar` + OS-native-bar stack with a single 28px themed bar hosting the previously-unused `GroveSwitcher`, so grove switching is one click from any page.

**Architecture:** Electron `BrowserWindow` gets `titleBarStyle: 'hiddenInset'` (Mac) and `titleBarOverlay` (Win) so the OS surrenders the title bar to us. Renderer paints a 28px `<TitleBar />` containing a flat, compact `<GroveSwitcher />`. Renderer notifies main via IPC when the user changes themes so Windows' native min/max/close buttons retint.

**Tech Stack:** Electron, React 18, TypeScript, Vitest + @testing-library/react, Tailwind, lucide-react, react-router-dom v6, react-i18next.

**Source spec:** `docs/superpowers/specs/2026-05-17-themed-title-bar-design.md`

---

## File Structure

**New files:**

- `electron/window/title-bar-theme.ts` — overlay color constants and `getOverlayForTheme()` helper, imported by both main and IPC handler
- `electron/ipc/window.ts` — IPC handler namespace for window-related operations (`themeApplied`)
- `src/components/TitleBar.test.tsx` — replaces / adds vitest coverage for new TitleBar
- `src/components/GroveSwitcher.test.tsx` — vitest coverage for the rewritten switcher

**Modified files:**

- `electron/main.ts` — `createMainWindow()` config + `nativeTheme.on('updated')` listener
- `electron/ipc/handlers.ts` — register `windowHandlers`
- `shared/ipc-contract.ts` — add `window` namespace to `IpcContract`
- `preload/preload.ts` — add `window.themeApplied` method
- `src/stores/settings-effects.ts` — call `ipc.window.themeApplied(effective)` in `applyTheme()`
- `src/components/TitleBar.tsx` — rewrite to 28px + centered switcher
- `src/components/GroveSwitcher.tsx` — rewrite trigger to flat/compact, export `dotColor`, drop `/picker` early-return, add `selectGrove` i18n key usage
- `src/components/AppRail.tsx` — tint 🌰 background with active grove's color
- `src/pages/Library.tsx` — remove `useTitleStore` import + setTitle effect
- `src/components/history/HistoryLayout.tsx` — remove `useTitleStore` import + setTitle effect
- `src/i18n/locales/zh-CN.json` — add `switcher.selectGrove`
- `src/i18n/locales/en-US.json` — add `switcher.selectGrove`

**Deleted files:**

- `src/stores/title.ts`

`src/ipc/client.ts` requires no changes: it exposes `ipc` typed as `IpcClient<IpcContract>`, so the new `window` namespace flows in automatically once added to `IpcContract` and `preload.ts`.

---

## Task 1: Extract title-bar overlay theme module

**Files:**

- Create: `electron/window/title-bar-theme.ts`

This module owns the hex constants that must stay in sync with `--color-paper-2` / `--color-ink-2` in `src/index.css`. Centralizing avoids drift between `main.ts` and the IPC handler.

- [ ] **Step 1: Create the module**

```ts
// electron/window/title-bar-theme.ts
import { nativeTheme } from 'electron'

// MUST stay in sync with --color-paper-2 (background) and --color-ink-2 (symbol)
// in src/index.css. If the design tokens change there, update these hex values.
// Source oklch values (2026-05-17):
//   light: paper-2 = oklch(0.955 0.015 82)  ink-2 = oklch(0.4 0.015 62)
//   dark:  paper-2 = oklch(0.22 0.018 60)   ink-2 = oklch(0.78 0.008 70)
export const OVERLAY_LIGHT = {
  color: '#f0eadc',
  symbolColor: '#5a534a',
  height: 28
} as const

export const OVERLAY_DARK = {
  color: '#322d27',
  symbolColor: '#bfb5a9',
  height: 28
} as const

export function getOverlayForTheme(): typeof OVERLAY_LIGHT | typeof OVERLAY_DARK {
  return nativeTheme.shouldUseDarkColors ? OVERLAY_DARK : OVERLAY_LIGHT
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors related to `electron/window/title-bar-theme.ts`.

- [ ] **Step 3: Commit**

```bash
git add electron/window/title-bar-theme.ts
git commit -m "feat(window): add title-bar overlay theme constants module"
```

---

## Task 2: Configure BrowserWindow for frameless title bar

**Files:**

- Modify: `electron/main.ts:1-83`

Apply `titleBarStyle: 'hiddenInset'` on Mac and `titleBarOverlay` on Windows. Register `nativeTheme.on('updated')` so the Windows overlay retints when the OS toggles dark mode. Bookkeeping: detach the listener when the window closes.

- [ ] **Step 1: Update imports at top of file**

Open `electron/main.ts`. Change line 1 from:

```ts
import { app, BrowserWindow, powerMonitor } from 'electron'
```

to:

```ts
import { app, BrowserWindow, nativeTheme, powerMonitor } from 'electron'
import { getOverlayForTheme } from './window/title-bar-theme'
```

- [ ] **Step 2: Update `createMainWindow()` body**

Replace `electron/main.ts` lines 35-83 (the `createMainWindow` function) with:

```ts
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'win32' ? { titleBarOverlay: getOverlayForTheme() } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      preload: join(__dirname, '../preload/preload.js')
    }
  })

  const onThemeChanged = (): void => {
    if (process.platform === 'win32' && !win.isDestroyed()) {
      win.setTitleBarOverlay(getOverlayForTheme())
    }
  }
  nativeTheme.on('updated', onThemeChanged)

  win.once('ready-to-show', () => {
    const files = checkLastRun()
    if (files.length > 0) {
      win.webContents.send('crash:detected', { files })
    }
    win.show()
    logger.info('app started', {
      version: app.getVersion(),
      platform: process.platform,
      electron: process.versions.electron
    })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    nativeTheme.off('updated', onThemeChanged)
  })

  installExternalLinkGuards(win)

  return win
}
```

Note the two changes beyond the spec: (a) added `titleBarStyle` and conditional `titleBarOverlay`, (b) added `nativeTheme.on('updated')` registration and matching `win.on('closed')` teardown. Everything else preserved.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes. If `Electron.TitleBarOverlay` type complaints appear, the spread-only conditional avoids them — verify the spread is syntactically present.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Expected:

- Mac: window opens with red/yellow/green traffic lights at top-left, but the area to the right is empty (the old `TitleBar` 38px bar still appears below — that gets fixed in Task 6)
- Window dragging still works (drag anywhere in the now-empty top area)

Close the dev server after verifying.

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "feat(window): hide native title bar on mac/win, listen for theme changes"
```

---

## Task 3: Add `window` namespace to IPC contract

**Files:**

- Modify: `shared/ipc-contract.ts`

Add the new namespace alongside the existing ones in `IpcContract`. Use the existing search pattern: find the `IpcContract` type definition and add an entry.

- [ ] **Step 1: Find and inspect the IpcContract type**

Run: `grep -n "export type IpcContract" shared/ipc-contract.ts`
This locates the `IpcContract` type. Open the file and scroll to that line.

- [ ] **Step 2: Add `window` namespace**

Inside the `IpcContract` type, alongside other namespaces (e.g. next to `shell: {...}` or `crash: {...}`), add:

```ts
window: {
  themeApplied: (effective: 'light' | 'dark') => Promise<void>
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: typechecker now demands implementations in `preload/preload.ts` and `electron/ipc/handlers.ts`. Those will be added in the next tasks. The errors should mention missing `window` keys.

- [ ] **Step 4: Commit**

```bash
git add shared/ipc-contract.ts
git commit -m "feat(ipc): add window namespace with themeApplied channel"
```

---

## Task 4: Implement IPC handler

**Files:**

- Create: `electron/ipc/window.ts`
- Modify: `electron/ipc/handlers.ts`

- [ ] **Step 1: Create the handler module**

```ts
// electron/ipc/window.ts
import { mainWindow } from '../main'
import { OVERLAY_DARK, OVERLAY_LIGHT } from '../window/title-bar-theme'

export const windowHandlers = {
  async themeApplied(effective: 'light' | 'dark') {
    if (process.platform !== 'win32') return
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setTitleBarOverlay(effective === 'dark' ? OVERLAY_DARK : OVERLAY_LIGHT)
  }
}
```

- [ ] **Step 2: Wire into the handler registry**

Open `electron/ipc/handlers.ts`. Add an import alongside the existing handler imports (around line 30, after `import { crashHandlers } from './crash'`):

```ts
import { windowHandlers } from './window'
```

Then in the `ipcHandlers` export object (around lines 159-178), add `window: windowHandlers,` alongside the other namespace entries. Final state of the object:

```ts
export const ipcHandlers = {
  // ... existing entries unchanged ...
  shell: shellHandlers,
  crash: crashHandlers,
  window: windowHandlers
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: the missing-window-key error from Task 3 disappears. Preload still complains (fixed in Task 5).

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/window.ts electron/ipc/handlers.ts
git commit -m "feat(ipc): handle window.themeApplied by retinting win overlay"
```

---

## Task 5: Expose `window.themeApplied` in preload

**Files:**

- Modify: `preload/preload.ts:19-185` (the `request` object)

- [ ] **Step 1: Add to the `request` object**

In `preload/preload.ts`, locate the `request: IpcClient<IpcContract>` object (starts at line 19). Add a `window` namespace entry alongside the others (e.g. after `crash: {...}` around line 183, before the closing brace of `request`):

```ts
window: {
  themeApplied: (effective) => invoke<void>('window.themeApplied', effective)
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: passes cleanly. Both main- and renderer-side wiring now satisfies `IpcContract`.

- [ ] **Step 3: Run preload tests**

Run: `npx vitest run preload/preload.test.ts`
Expected: PASS. Existing tests still cover the surface — no new assertions needed here because the new method follows the same `invoke()` pattern.

- [ ] **Step 4: Commit**

```bash
git add preload/preload.ts
git commit -m "feat(preload): expose window.themeApplied via context bridge"
```

---

## Task 6: Notify main on theme change from settings-effects

**Files:**

- Modify: `src/stores/settings-effects.ts:11-15` (the `applyTheme` function)

- [ ] **Step 1: Add import at top of file**

Open `src/stores/settings-effects.ts`. After the existing imports (around line 1-4), add:

```ts
import { ipc } from '@/ipc/client'
```

- [ ] **Step 2: Update `applyTheme()`**

Replace lines 11-15 (the `applyTheme` function) with:

```ts
function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const effective = theme === 'system' ? resolveSystemTheme() : theme
  document.documentElement.dataset.theme = effective
  void ipc.window.themeApplied(effective)
}
```

The `void` operator silences "promise not awaited" lints — the call is intentionally fire-and-forget.

- [ ] **Step 3: Run the settings-effects tests**

Run: `npx vitest run src/stores/settings-effects.test.ts`
Expected: PASS. If a test fails because `ipc.window` is undefined in jsdom, add a stub in the test file's setup (the tests already mock `window.api` for other namespaces — extend the stub with `window: { themeApplied: vi.fn() }`).

If a test failure surfaces because the existing test mock lacks `window`, modify the mock to include it. Look for `window.api = ...` or `vi.mock('@/ipc/client', ...)` in the test file. The minimal addition is:

```ts
window: {
  themeApplied: vi.fn().mockResolvedValue(undefined)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/settings-effects.ts src/stores/settings-effects.test.ts
git commit -m "feat(theme): notify main process when effective theme changes"
```

---

## Task 7: Add `switcher.selectGrove` i18n keys

**Files:**

- Modify: `src/i18n/locales/zh-CN.json:54-59` (switcher block)
- Modify: `src/i18n/locales/en-US.json:53-58` (switcher block)

- [ ] **Step 1: Update Chinese locale**

In `src/i18n/locales/zh-CN.json`, change lines 54-59 from:

```json
  "switcher": {
    "ariaLabel": "切换树林",
    "new": "新建树林…",
    "open": "打开已有目录…",
    "noGrove": "未选择树林"
  },
```

to:

```json
  "switcher": {
    "ariaLabel": "切换果仓",
    "new": "新建果仓…",
    "open": "打开已有目录…",
    "noGrove": "未选择果仓",
    "selectGrove": "选择果仓"
  },
```

Note: The labels are also updated from "树林" to "果仓" to match the rest of the UI (`果仓 · projectName` in Library, `🌰 切换果仓` tooltip in AppRail). If `tree-林` is intentional terminology elsewhere, revert these two and only add `selectGrove`.

- [ ] **Step 2: Update English locale**

In `src/i18n/locales/en-US.json`, change lines 53-58 from:

```json
  "switcher": {
    "ariaLabel": "Switch grove",
    "new": "New grove...",
    "open": "Open existing folder...",
    "noGrove": "No grove selected"
  },
```

to:

```json
  "switcher": {
    "ariaLabel": "Switch grove",
    "new": "New grove…",
    "open": "Open existing folder…",
    "noGrove": "No grove selected",
    "selectGrove": "Select grove"
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales/zh-CN.json src/i18n/locales/en-US.json
git commit -m "i18n(switcher): add selectGrove key, align Chinese label to 果仓"
```

---

## Task 8: Rewrite `GroveSwitcher` for title-bar use

**Files:**

- Create: `src/components/GroveSwitcher.test.tsx`
- Modify: `src/components/GroveSwitcher.tsx` (full rewrite of the trigger button + remove `/picker` early-return + export `dotColor`)

This is the most consequential change. Write the tests first, then make them pass.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/GroveSwitcher.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { GroveSwitcher } from './GroveSwitcher'
import { useGroveStore } from '@/stores/grove'

vi.mock('@/ipc/client', () => ({
  ipc: {
    project: {
      listRecent: vi.fn().mockResolvedValue([]),
      selectDirectory: vi.fn().mockResolvedValue(null)
    }
  }
}))

function resetStore(): void {
  useGroveStore.setState({ current: null, recent: [] })
}

describe('GroveSwitcher', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => {
    cleanup()
    resetStore()
  })

  it('shows the "select grove" placeholder when no grove is active', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByText(/选择果仓|Select grove/i)).toBeTruthy()
  })

  it('shows the active grove name and color dot when current is set', () => {
    useGroveStore.setState({
      current: { id: 'g1', name: '我的笔记', path: '/tmp/n', color: 'acorn' },
      recent: []
    })
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByText('我的笔记')).toBeTruthy()
  })

  it('renders on /picker route (previously hidden)', () => {
    render(
      <MemoryRouter initialEntries={['/picker']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    expect(screen.getByRole('button', { name: /switch grove|切换果仓/i })).toBeTruthy()
  })

  it('trigger button has webkit-app-region:no-drag to override parent drag region', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <GroveSwitcher />
      </MemoryRouter>
    )
    const trigger = screen.getByRole('button', { name: /switch grove|切换果仓/i })
    expect(trigger.className).toContain('[-webkit-app-region:no-drag]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/GroveSwitcher.test.tsx`
Expected: at least the `/picker` test fails (existing code returns `null` for `/picker`). The no-drag test fails (className doesn't include that token yet).

- [ ] **Step 3: Rewrite `src/components/GroveSwitcher.tsx`**

Replace the entire file contents with:

```tsx
import { useEffect, type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Plus, FolderOpen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { GroveColor } from '@shared/grove'
import { useGroveStore } from '@/stores/grove'
import { ipc } from '@/ipc/client'
import { toast } from '@/hooks/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export const dotColor: Record<GroveColor, string> = {
  acorn: 'var(--color-acorn)',
  leaf: 'var(--color-leaf)',
  berry: 'var(--color-berry)',
  sky: 'var(--color-sky)'
}

export function GroveSwitcher({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation()
  const current = useGroveStore((s) => s.current)
  const recent = useGroveStore((s) => s.recent)
  const loadRecent = useGroveStore((s) => s.loadRecent)
  const switchTo = useGroveStore((s) => s.switchTo)
  const openExisting = useGroveStore((s) => s.openExisting)
  const navigate = useNavigate()

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const recentFive = recent.slice(0, 5)

  async function handleSwitch(id: string): Promise<void> {
    const res = await switchTo(id)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'locked') {
      toast({ title: t('picker.locked'), description: res.holder.hostname })
    } else {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
  }

  async function handleNew(): Promise<void> {
    navigate('/picker')
    setTimeout(() => window.dispatchEvent(new CustomEvent('acorn:picker:new')), 0)
  }

  async function handleOpen(): Promise<void> {
    const path = await ipc.project.selectDirectory('open')
    if (!path) return
    const res = await openExisting(path)
    if (res.status === 'opened') {
      navigate('/library')
    } else if (res.status === 'locked') {
      toast({ title: t('picker.locked'), description: path })
    } else {
      toast({ title: t('common.error'), description: res.message, variant: 'destructive' })
    }
    await loadRecent()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('switcher.ariaLabel')}
          className={cn(
            '[-webkit-app-region:no-drag]',
            'inline-flex items-center gap-1.5',
            'h-6 px-2 rounded',
            'text-[12.5px] text-[color:var(--color-ink)]',
            'hover:bg-[color:var(--color-paper-3)]',
            'transition-colors',
            className
          )}
        >
          {current ? (
            <>
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ background: dotColor[current.color] }}
              />
              <span className="font-serif">{current.name}</span>
            </>
          ) : (
            <span className="text-[color:var(--color-ink-3)]">{t('switcher.selectGrove')}</span>
          )}
          <ChevronDown className="h-3 w-3 text-[color:var(--color-ink-3)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center">
        {recentFive.map((item) => (
          <DropdownMenuItem
            key={item.id}
            disabled={!item.valid}
            onSelect={(e) => {
              e.preventDefault()
              void handleSwitch(item.id)
            }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ background: dotColor[item.color] }} />
            <span className="flex-1 truncate">{item.name}</span>
            {!item.valid ? (
              <span className="font-mono text-[10px] text-[color:var(--color-berry)]">
                {t('picker.invalid')}
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
        {recentFive.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void handleNew()
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('switcher.new')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            void handleOpen()
          }}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('switcher.open')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

Key differences from the original:

- `dotColor` is now `export`ed
- Removed `useLocation` import and the `/picker` early-return — component renders on all routes
- Return type narrowed from `JSX.Element | null` to `JSX.Element`
- Trigger button restyled: no border, no solid background, `h-6 px-2`, `text-[12.5px]`, hover-only bg
- Color dot resized `2.5×2.5` (10px) → `2×2` (8px), corner `rounded-sm` → `rounded-[2px]`
- Added `[-webkit-app-region:no-drag]` so clicks reach the button when nested in a drag region
- `font-serif` applied only to the active name (not the placeholder, not the chevron)
- `DropdownMenuContent align="start"` → `align="center"` so the menu aligns under the centered trigger
- When `current === null`, shows `t('switcher.selectGrove')` instead of `t('switcher.noGrove')` (the latter is no longer used in this component — leaving the i18n key alone in case other callers exist)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/GroveSwitcher.test.tsx`
Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GroveSwitcher.tsx src/components/GroveSwitcher.test.tsx
git commit -m "feat(switcher): compact title-bar variant + render on all routes"
```

---

## Task 9: Rewrite `TitleBar` to 28px + centered switcher

**Files:**

- Create: `src/components/TitleBar.test.tsx`
- Modify: `src/components/TitleBar.tsx` (full rewrite)

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/TitleBar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { i18n } from '@/i18n'
import { TitleBar } from './TitleBar'
import { useGroveStore } from '@/stores/grove'

vi.mock('@/ipc/client', () => ({
  ipc: {
    project: {
      listRecent: vi.fn().mockResolvedValue([]),
      selectDirectory: vi.fn().mockResolvedValue(null)
    }
  }
}))

describe('TitleBar', () => {
  beforeAll(async () => {
    if (!i18n.isInitialized) await i18n.init()
  })
  afterEach(() => {
    cleanup()
    useGroveStore.setState({ current: null, recent: [] })
  })

  it('renders a header with the titlebar testid', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    expect(screen.getByTestId('titlebar')).toBeTruthy()
  })

  it('header is a drag region', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    const header = screen.getByTestId('titlebar')
    expect(header.className).toContain('[-webkit-app-region:drag]')
  })

  it('hosts the GroveSwitcher (placeholder visible when no grove)', () => {
    render(
      <MemoryRouter initialEntries={['/library']}>
        <TitleBar />
      </MemoryRouter>
    )
    expect(screen.getByText(/选择果仓|Select grove/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/TitleBar.test.tsx`
Expected: the third test fails (current TitleBar doesn't render GroveSwitcher).

- [ ] **Step 3: Rewrite `src/components/TitleBar.tsx`**

Replace the entire file contents with:

```tsx
import type { JSX } from 'react'
import { GroveSwitcher } from './GroveSwitcher'

export function TitleBar(): JSX.Element {
  return (
    <header
      className="relative flex h-7 shrink-0 items-center justify-center
                 bg-[color:var(--color-paper-2)]
                 border-b border-[color:var(--color-line)]
                 [-webkit-app-region:drag]"
      data-testid="titlebar"
    >
      <GroveSwitcher />
    </header>
  )
}
```

Removed from the previous version:

- `useTranslation` import (no rendered text)
- `useTitleStore` import (store gets deleted later)
- `useLocation` import + `borderless on /picker` branch (border is always present now)
- Traffic-light `pl-[60px]` placeholder (hiddenInset handles spacing)
- Centered dynamic title text + right-side empty slot

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/TitleBar.test.tsx`
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TitleBar.tsx src/components/TitleBar.test.tsx
git commit -m "feat(titlebar): 28px themed bar hosting GroveSwitcher"
```

---

## Task 10: Tint AppRail 🌰 button with active grove color

**Files:**

- Modify: `src/components/AppRail.tsx:33-42` (the 🌰 button)

- [ ] **Step 1: Add import for `dotColor`**

At the top of `src/components/AppRail.tsx`, after the existing imports:

```ts
import { dotColor } from './GroveSwitcher'
```

- [ ] **Step 2: Modify the 🌰 button**

Replace lines 33-42 (the `<button>` element wrapping the 🌰) with:

```tsx
<button
  onClick={() => {
    navigate('/picker')
  }}
  title={current ? `${current.name} — ${t('switcher.ariaLabel')}` : t('switcher.ariaLabel')}
  className="mb-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-[color:var(--color-line-2)] bg-[color:var(--color-acorn-bg)] hover:opacity-90 transition-opacity"
  style={
    current
      ? { background: `color-mix(in oklch, ${dotColor[current.color]} 20%, transparent)` }
      : undefined
  }
>
  {/* Placeholder Acorn Logo */}
  <span className="text-[24px]">🌰</span>
</button>
```

Changes:

- `title` now uses `t('switcher.ariaLabel')` for i18n consistency (previously hard-coded `'切换树林'`)
- Inline `style.background` overrides the `bg-[color:var(--color-acorn-bg)]` class when a grove is active, using `color-mix` for a 20% tint of the grove's oklch color
- When no grove is active, falls back to the original acorn-bg color

- [ ] **Step 3: Run AppRail tests**

Run: `npx vitest run src/components/AppRail.test.tsx`
Expected: PASS. The existing tests assert link presence and href — neither cares about the 🌰 button styling, so they still pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppRail.tsx
git commit -m "feat(rail): tint acorn button with active grove color"
```

---

## Task 11: Remove `setTitle` from Library page

**Files:**

- Modify: `src/pages/Library.tsx`

- [ ] **Step 1: Edit Library.tsx**

Replace the entire contents of `src/pages/Library.tsx` with:

```tsx
import { useEffect } from 'react'
import type { JSX } from 'react'
import { useLibraryStore, installLibrarySubscriber } from '@/stores/library'
import { CategorySidebar } from '@/components/library/CategorySidebar'
import { VirtualFileList } from '@/components/library/VirtualFileList'
import { FilePreviewPanel } from '@/components/library/FilePreviewPanel'
import { IndexBanner } from '@/components/library/IndexBanner'

export function Library(): JSX.Element {
  const refresh = useLibraryStore((s) => s.refresh)

  useEffect(() => {
    const unsub = installLibrarySubscriber()
    void refresh()
    return unsub
  }, [refresh])

  return (
    <div className="flex h-full w-full flex-col bg-[color:var(--color-paper)]">
      <IndexBanner />
      <div className="flex flex-1 overflow-hidden">
        <CategorySidebar />
        <VirtualFileList />
        <FilePreviewPanel />
      </div>
    </div>
  )
}
```

Removed: `useGroveStore` import (only used for `projectName`), `useTitleStore` import, `projectName` derivation, and the setTitle `useEffect`.

- [ ] **Step 2: Run library-related tests**

Run: `npx vitest run src/stores/library.test.ts src/pages/`
Expected: PASS. If any test asserts on a title-store interaction triggered by Library mount, remove that assertion.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Library.tsx
git commit -m "refactor(library): drop title-store dependency"
```

---

## Task 12: Remove `setTitle` from HistoryLayout

**Files:**

- Modify: `src/components/history/HistoryLayout.tsx:1-36`

- [ ] **Step 1: Remove the title-store import**

In `src/components/history/HistoryLayout.tsx`, delete line 10:

```ts
import { useTitleStore } from '@/stores/title'
```

- [ ] **Step 2: Remove the title-store consumer and effect**

Delete line 28:

```ts
const setTitle = useTitleStore((s) => s.setTitle)
```

Delete lines 31-36 (the title-setting `useEffect`):

```ts
useEffect(() => {
  setTitle(TAB_TITLES[tab])
  return () => {
    setTitle('')
  }
}, [tab, setTitle])
```

- [ ] **Step 3: Also remove the now-unused `TAB_TITLES` constant**

Lines 14-19 define `TAB_TITLES`, which was only consumed by the deleted effect. Delete:

```ts
const TAB_TITLES: Record<TabId, string> = {
  trash: '废纸篓',
  conflicts: '冲突',
  ops: '操作记录',
  jobs: '任务'
}
```

After all three deletions, the surviving imports at top of file should be: `useState`, `useNavigate`, the `Tabs*` components, the `Resizable*` components, `TrashTab`, `ConflictsTab`, `ConflictDetailPanel`, `OpsTab`, `JobsTab`. The `useEffect` import is no longer needed — remove it from the import line `import { useEffect, useState } from 'react'` so it becomes `import { useState } from 'react'`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run history-related tests**

Run: `npx vitest run tests/acceptance/phase-10/history-integration.test.tsx`
Expected: PASS, with one possible exception — if any test asserts on TitleBar showing tab name strings ("废纸篓", "冲突", etc.) when navigating tabs, those assertions should be removed (the global TitleBar no longer shows that text). Look for failures mentioning those exact strings and delete the corresponding assertions.

- [ ] **Step 6: Commit**

```bash
git add src/components/history/HistoryLayout.tsx tests/acceptance/phase-10/history-integration.test.tsx
git commit -m "refactor(history): drop title-store dependency and dead TAB_TITLES"
```

---

## Task 13: Delete `src/stores/title.ts`

**Files:**

- Delete: `src/stores/title.ts`

- [ ] **Step 1: Verify no remaining references**

Run: `grep -rn "useTitleStore\|stores/title" src/ tests/ electron/ preload/ shared/`
Expected: zero results. If any remain, fix them before proceeding.

- [ ] **Step 2: Delete the file**

Run: `rm src/stores/title.ts`

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS. If failures surface in unrelated areas, they likely existed before this task; verify against `git stash` if uncertain.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove dead title store"
```

---

## Task 14: Manual end-to-end verification

**No code changes. Run the app and verify the integrated behavior matches the spec.**

- [ ] **Step 1: Launch the app**

Run: `npm run dev`

- [ ] **Step 2: Visual checks (Mac)**

Confirm:

- Single title bar at the top, ~28px tall, paper-2 background
- Red/yellow/green traffic lights inset on the left (OS-drawn)
- Centered: either "选择果仓 ▾" (if no grove) or "[dot] 我的笔记 ▾" (if a grove was previously opened)
- Whole bar drags the window when you grab non-switcher area
- Clicking the switcher opens the dropdown with: recent groves, separator, "+ 新建果仓…", "📂 打开已有目录…"
- AppRail 🌰 button has a subtle tint when a grove is active (matching that grove's color)

- [ ] **Step 3: Page coverage**

Navigate to each route and confirm the switcher is visible: `/library`, `/browser`, `/chat`, `/settings`, `/picker`. On `/picker` with no grove yet, the switcher shows "选择果仓 ▾".

- [ ] **Step 4: Editor route**

Open a file in the editor. Confirm: global TitleBar (28px) on top, then `EditorTitleBar` (back arrow / path / save status) right below. Both work.

- [ ] **Step 5: Theme toggle**

Open Settings → Appearance → toggle Light/Dark/System. Confirm:

- The TitleBar background changes immediately (CSS var driven)
- The text/dot colors remain readable

- [ ] **Step 6: (If on Windows) Native overlay check**

If a Windows machine is available, verify:

- Top-right corner shows native min/max/close buttons
- Their background matches the paper-2 hex; symbol color matches ink-2 hex
- Toggling theme retints the buttons (might require briefly hovering the window edge to repaint)

- [ ] **Step 7: Close dev server**

Stop the dev server. No commit for this task — purely manual verification.

---

## Self-Review

**Spec coverage:**

| Spec section                                                                          | Implemented in                                        |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Architecture diagram (hiddenInset / overlay)                                          | Task 2                                                |
| Cross-platform table (Mac / Win / Linux)                                              | Task 2 (Mac + Win), Linux falls through automatically |
| `TitleBar.tsx` rewrite                                                                | Task 9                                                |
| `GroveSwitcher.tsx` rewrite (compact + dotColor export + remove /picker early-return) | Task 8                                                |
| `AppRail.tsx` tint                                                                    | Task 10                                               |
| New IPC contract `window:themeApplied`                                                | Tasks 3, 4, 5                                         |
| Renderer notifying main on theme change                                               | Task 6                                                |
| Overlay constants centralized (sync with index.css)                                   | Task 1                                                |
| i18n `switcher.selectGrove` key                                                       | Task 7                                                |
| Delete `src/stores/title.ts`                                                          | Task 13                                               |
| Remove setTitle from Library                                                          | Task 11                                               |
| Remove setTitle from HistoryLayout                                                    | Task 12                                               |
| Test coverage (TitleBar, GroveSwitcher)                                               | Tasks 8, 9                                            |
| Manual acceptance                                                                     | Task 14                                               |

No gaps detected.

**Placeholder scan:** No "TBD", "TODO", or "implement later" remain in steps. Each code block is complete.

**Type consistency:**

- `dotColor` exported from `GroveSwitcher.tsx` (Task 8) and imported by `AppRail.tsx` (Task 10) — names match
- `themeApplied: (effective: 'light' | 'dark') => Promise<void>` — same signature in Tasks 3, 4, 5, 6
- `OVERLAY_LIGHT` / `OVERLAY_DARK` named identically across Tasks 1 and 4
- `getOverlayForTheme()` used identically in Task 1 (definition) and Task 2 (consumer)

No inconsistencies found.

---

## Execution Handoff

After saving the plan, choose execution mode:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks
**2. Inline Execution** — execute tasks in this session with batch checkpoints

Which approach?
